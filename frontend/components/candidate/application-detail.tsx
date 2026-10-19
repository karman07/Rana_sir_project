"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileText, Info, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@rms/shared";
import { api, apiPost, documentUrl, ApiError } from "@/lib/api";
import { CANDIDATE_STATUS, timeAgo, type ApplicationDetail } from "@/lib/applications";
import { formatDateTime } from "@/lib/audit";
import { Timeline } from "@/components/data/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/feedback/error-state";
import { Journey } from "./journey";

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr]"><dt className="text-sm text-muted">{label}</dt><dd className="whitespace-pre-line text-sm">{children}</dd></div>;
}

export function CandidateApplicationDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["application", id], queryFn: () => api<ApplicationDetail>(`/applications/${id}`) });
  const withdraw = useMutation({
    mutationFn: () => apiPost(`/applications/${id}/withdraw`, {}),
    onSuccess: () => { toast.success("Application withdrawn"); for (const k of ["application", "applications", "jobs", "job", "overview"]) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not withdraw"),
  });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-52 w-full rounded-[16px]" /><Skeleton className="h-64 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const a = q.data;
  const st = CANDIDATE_STATUS[a.status];
  const canWithdraw = a.transitions.some((t) => t.kind === "withdraw");

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2"><Link href="/candidate/applications"><ArrowLeft />My applications</Link></Button>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{a.job.title}</h1>
          <p className="text-sm text-foreground-2">{a.company.name} · {a.job.location} · <span className="font-mono text-xs">{a.applicationNumber}</span></p>
        </div>
        <Button asChild variant="secondary" size="sm"><Link href={`/candidate/jobs/${a.job.id}`}>View job<ExternalLink /></Link></Button>
      </div>

      <Card className="p-5 sm:p-6">
        <Journey status={a.status} />
        <div className="mt-6 flex gap-3 rounded-xl bg-background-2 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-secondary-green" />
          <div><p className="font-medium">{st?.label}</p><p className="mt-0.5 text-sm text-foreground-2">{st?.blurb}</p></div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Your application" description={`Submitted ${timeAgo(a.createdAt)}`} />
          <CardBody>
            <dl className="divide-y divide-divider">
              <Row label="Expected salary">{a.expectedSalary && formatMoney(a.expectedSalary).replace(/\.00$/, "") + " / year"}</Row>
              <Row label="Notice period">{a.noticePeriodDays != null ? `${a.noticePeriodDays} days` : undefined}</Row>
              <Row label="Cover letter">{a.coverLetter}</Row>
              <Row label="Additional information">{a.relevantInfo}</Row>
              <Row label="Resume">{a.resumeDocumentId && <a className="inline-flex items-center gap-1.5 text-primary hover:underline" href={documentUrl(a.resumeDocumentId)} target="_blank" rel="noreferrer"><FileText className="size-4" />Download resume</a>}</Row>
              <Row label="Documents">{a.documents.length ? <span className="flex flex-col gap-1">{a.documents.map((d) => <a key={d.documentId} className="inline-flex items-center gap-1.5 text-primary hover:underline" href={documentUrl(d.documentId)} target="_blank" rel="noreferrer"><FileText className="size-4" />{d.label}</a>)}</span> : undefined}</Row>
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Progress" />
            <CardBody>
              <Timeline items={[...a.statusHistory].reverse().map((h, i) => ({
                title: CANDIDATE_STATUS[h.status]?.label ?? h.status, time: formatDateTime(h.at),
                description: h.status === "WITHDRAWN" && h.reason ? h.reason : undefined, state: i === 0 ? "current" as const : "done" as const,
              }))} />
            </CardBody>
          </Card>
          {canWithdraw && (
            <ConfirmationDialog destructive title="Withdraw this application?" description="The hiring team will be told you're no longer interested. You can't undo this, but you can apply again later if the job is still open."
              confirmLabel="Withdraw" onConfirm={() => withdraw.mutateAsync().then(() => undefined)}
              trigger={<Button variant="outlineDanger" className="w-full"><XCircle />Withdraw application</Button>} />
          )}
        </div>
      </div>
    </>
  );
}
