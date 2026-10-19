"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, MessageSquareWarning, Pencil, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { JobRequest } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { RequestMoreDialog } from "@/components/screening/request-more-dialog";
import { JobChangePanel } from "./job-change-panel";
import { ReviewHistory } from "./review-history";
import { SpecView } from "./spec-view";

const NEXT_STEP: Record<string, string> = {
  DRAFT: "Finish the form and submit it for review.",
  PENDING_ADMIN_REVIEW: "Our team is reviewing this. You can still edit it: saving sends the new version back for review. You'll get an email as soon as there's a decision.",
  CHANGES_REQUESTED: "Update the opening based on the note below, then resubmit.",
  APPROVED: "This opening is approved. Candidates can now apply, and our team will send you the best matches.",
  REJECTED: "This request wasn't approved. See the note below for why.",
};

export function RecruiterJobDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["job-request", id], queryFn: () => api<JobRequest>(`/job-requests/${id}`) });
  const del = useMutation({
    mutationFn: () => api(`/job-requests/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-requests"] }); toast.success("Draft deleted"); router.replace("/recruiter/jobs"); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not delete"),
  });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const r = q.data;
  const editable = r.status === "DRAFT" || r.status === "CHANGES_REQUESTED" || r.status === "PENDING_ADMIN_REVIEW";
  const feedback = [...r.reviews].reverse().find((x) => x.action === "CHANGES_REQUESTED" || x.action === "REJECTED");

  return (
    <>
      <PageHeader
        title={r.spec?.title || "Untitled draft"}
        description={`${r.requestNumber} · ${r.company?.name ?? ""}`}
        actions={
          <>
            <StatusBadge status={r.status} />
            {editable && <Button asChild><Link href={`/recruiter/jobs/${r.id}/edit`}><Pencil />{r.status === "DRAFT" ? "Continue editing" : r.status === "PENDING_ADMIN_REVIEW" ? "Edit request" : "Edit & resubmit"}</Link></Button>}
            {r.status === "DRAFT" && r.version === 0 && (
              <ConfirmationDialog destructive title="Delete this draft?" description="This can't be undone." confirmLabel="Delete" onConfirm={() => del.mutateAsync().then(() => undefined)}
                trigger={<Button variant="outlineDanger"><Trash2 />Delete</Button>} />
            )}
            {r.status === "APPROVED" && r.jobId && <RequestMoreDialog jobId={r.jobId} jobTitle={r.spec?.title} />}
            {r.status === "APPROVED" && <Button asChild variant="secondary"><Link href="/recruiter/candidates"><ExternalLink />Candidates</Link></Button>}
          </>
        }
      />
      <p className="mb-5 text-sm text-foreground-2">{NEXT_STEP[r.status]}</p>

      {feedback && (r.status === "CHANGES_REQUESTED" || r.status === "REJECTED") && (
        <div className={`mb-5 flex gap-3 rounded-xl border p-4 text-sm ${r.status === "REJECTED" ? "border-danger/30 bg-danger/10" : "border-gold/40 bg-gold-soft"}`}>
          {r.status === "REJECTED" ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-gold" />}
          <div><p className="font-medium">{r.status === "REJECTED" ? "Why this was rejected" : "What to change"}</p><p className="mt-1 whitespace-pre-line text-foreground-2">{feedback.note}</p></div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <SpecView spec={r.spec} locale={undefined} />
        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          {r.status === "APPROVED" && r.jobId && <JobChangePanel requestId={r.id} jobId={r.jobId} />}
          <Card>
            <CardHeader title="Review history" description={r.reviews.length ? `Version ${r.version}` : undefined} />
            <CardBody>{r.reviews.length ? <ReviewHistory reviews={r.reviews} /> : <p className="text-sm text-foreground-2">Not submitted yet.</p>}</CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
