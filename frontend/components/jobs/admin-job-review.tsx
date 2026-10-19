"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Check, MessageSquareWarning, Pencil, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiPost, ApiError } from "@/lib/api";
import { diffSpecs, type JobRequest } from "@/lib/jobs";
import { EntityActivity } from "@/components/data/entity-activity";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { CommissionEditor, CommissionSummary, commissionBody, type CommissionInput, type JobCommission } from "./commission-panel";
import { ReviewHistory } from "./review-history";
import { SpecView } from "./spec-view";

const show = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v));

export function AdminJobReview({ id }: { id: string }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<"changes" | "reject" | null>(null);
  const [publish, setPublish] = useState(true);
  const [commission, setCommission] = useState<CommissionInput>({ type: "PERCENT", value: "" });
  const q = useQuery({ queryKey: ["job-request", id], queryFn: () => api<JobRequest & { commission?: JobCommission }>(`/job-requests/${id}`) });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["job-request", id] }); qc.invalidateQueries({ queryKey: ["job-requests"] }); qc.invalidateQueries({ queryKey: ["audit"] }); qc.invalidateQueries({ queryKey: ["overview"] }); };
  const decide = useMutation({
    mutationFn: ({ action, body }: { action: string; body: unknown; ok: string }) => apiPost(`/job-requests/${id}/${action}`, body),
    onSuccess: (_r, v) => { toast.success(v.ok); refresh(); },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Action failed"); refresh(); },
  });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const r = q.data;
  const pending = r.status === "PENDING_ADMIN_REVIEW";
  const commissionBodyValue = commissionBody(commission, r.spec?.compensation?.currency ?? "USD");
  const revs = r.revisions ?? [];
  const changes = revs.length >= 2 ? diffSpecs(revs[revs.length - 2].spec, revs[revs.length - 1].spec) : [];

  return (
    <>
      <PageHeader
        title={r.spec?.title || "Untitled"}
        description={`${r.requestNumber} · version ${r.version}`}
        actions={<><StatusBadge status={r.status} />{(pending || r.status === "APPROVED") && <Button asChild variant="secondary"><Link href={`/admin/job-requests/${r.id}/edit`}><Pencil />Edit opening</Link></Button>}{r.status === "APPROVED" && <Button asChild variant="secondary"><Link href="/admin/jobs">View live job<ArrowRight /></Link></Button>}</>}
      />

      <div className="mb-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-foreground-2">
        <span className="flex items-center gap-2"><Building2 className="size-4" />{r.company?.name}{r.company?.location ? ` · ${r.company.location}` : ""}</span>
        <span className="flex items-center gap-2"><UserRound className="size-4" />{r.recruiter?.name} <span className="text-muted">{r.recruiter?.email}</span></span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {changes.length > 0 && (
            <Card className="border-gold/40">
              <CardHeader title={`Changed since version ${revs[revs.length - 2].version}`} description="What the recruiter updated after your feedback" />
              <CardBody>
                <ul className="divide-y divide-divider text-sm">
                  {changes.map((c) => (
                    <li key={c.label} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr]">
                      <span className="text-muted">{c.label}</span>
                      <span><span className="text-danger line-through decoration-danger/40">{show(c.from)}</span> <ArrowRight className="mx-1 inline size-3 text-muted" /> <span className="font-medium text-success">{show(c.to)}</span></span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          <SpecView spec={r.spec} />
        </div>

        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          {pending && <CommissionEditor spec={r.spec} value={commission} onChange={setCommission} current={r.commission} />}
          {!pending && r.status === "APPROVED" && r.commission && <CommissionSummary c={r.commission} spec={r.spec} jobId={r.jobId} />}
          <Card>
            <CardHeader title={pending ? "Your decision" : "Decision"} description={pending ? "The recruiter is notified by email." : "This request has been decided."} />
            <CardBody className="space-y-3">
              {pending ? (
                <>
                  <label className="flex items-start gap-2 text-sm text-foreground-2">
                    <input type="checkbox" className="mt-0.5 accent-[var(--primary)]" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                    <span>Publish immediately<span className="block text-xs text-muted">Candidates can apply as soon as you approve.</span></span>
                  </label>
                  <Button className="w-full" disabled={!commissionBodyValue} loading={decide.isPending && decide.variables?.action === "approve"} onClick={() => decide.mutate({ action: "approve", body: { publish, commission: commissionBodyValue }, ok: publish ? "Approved and published" : "Approved" })}><Check />Approve</Button>
                  {!commissionBodyValue && <p className="text-xs text-muted">Set our commission below to approve.</p>}
                  <Button className="w-full" variant="secondary" onClick={() => setDialog("changes")}><MessageSquareWarning />Request changes</Button>
                  <Button className="w-full" variant="outlineDanger" onClick={() => setDialog("reject")}><X />Reject</Button>
                </>
              ) : <p className="text-sm text-foreground-2">No further action needed.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Review history" />
            <CardBody><ReviewHistory reviews={r.reviews} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Audit trail" />
            <CardBody><EntityActivity entityType="JobRequest" entityId={r.id} /></CardBody>
          </Card>
        </div>
      </div>

      <ReasonDialog open={dialog === "changes"} onOpenChange={(o) => !o && setDialog(null)} title="Request changes" description="Tell the recruiter exactly what to fix. They can edit and resubmit."
        confirmLabel="Send request" onSubmit={(note) => decide.mutateAsync({ action: "request-changes", body: { note }, ok: "Changes requested" })} />
      <ReasonDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} title="Reject this request?" description="The recruiter will see your reason. Rejected requests can't be resubmitted." destructive
        confirmLabel="Reject" onSubmit={(note) => decide.mutateAsync({ action: "reject", body: { note }, ok: "Request rejected" })} />
    </>
  );
}
