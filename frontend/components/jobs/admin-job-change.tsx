"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiPost, ApiError } from "@/lib/api";
import { CHANGE_LABEL, type JobChange } from "@/lib/job-changes";
import { formatWhen } from "@/lib/time";
import { EntityActivity } from "@/components/data/entity-activity";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { ChangeDiff } from "./job-change-panel";

export function AdminJobChange({ id }: { id: string }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const q = useQuery({ queryKey: ["job-change", id], queryFn: () => api<JobChange>(`/job-changes/${id}`) });
  const refresh = () => { for (const k of ["job-change", "job-changes", "approvals", "jobs", "job-requests", "audit", "overview"]) qc.invalidateQueries({ queryKey: [k] }); };
  const decide = useMutation({
    mutationFn: ({ action, note }: { action: "approve" | "reject"; note?: string; ok: string }) => apiPost(`/job-changes/${id}/${action}`, { note }),
    onSuccess: (_r, v) => { toast.success(v.ok); refresh(); },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Action failed"); refresh(); },
  });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const c = q.data;
  const pending = c.status === "PENDING";
  const closing = c.type === "CLOSE";

  return (
    <>
      <PageHeader title={`${CHANGE_LABEL[c.type]} · ${c.job.title ?? "Opening"}`} description={`${c.changeNumber} · ${c.job.jobNumber ?? ""} · ${c.job.company ?? ""}`}
        actions={<>
          <StatusBadge status={c.status} />
          <Button asChild variant="secondary"><Link href={`/admin/job-requests/${c.job.jobRequestId}`}>Opening<ArrowRight /></Link></Button>
          {pending && <>
            <Button variant="outlineDanger" onClick={() => setRejecting(true)}><X />Decline</Button>
            <Button loading={decide.isPending} onClick={() => decide.mutate({ action: "approve", ok: closing ? "Opening closed" : "Changes applied to the live opening" })}><Check />{closing ? "Approve and close" : "Approve and apply"}</Button>
          </>}
        </>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={closing ? "Why it should close" : "Why the change"} description={`${c.recruiter?.name ?? "Recruiter"} · ${formatWhen(c.submittedAt).date}`} />
            <CardBody className="space-y-3">
              <p className="whitespace-pre-line text-sm">{c.reason}</p>
              {closing && <p className="text-sm text-foreground-2">{c.liveApplications ? `${c.liveApplications} candidate${c.liveApplications > 1 ? "s are" : " is"} still in progress on this opening. Closing it stops new applications; it does not reject them.` : "No candidates are in progress on this opening."}</p>}
            </CardBody>
          </Card>
          {!closing && <Card><CardHeader title="What changes" description={`${c.changes.length} field${c.changes.length === 1 ? "" : "s"}`} /><CardBody><ChangeDiff changes={c.changes} /></CardBody></Card>}
          {!pending && (
            <Card><CardHeader title="Decision" /><CardBody className="text-sm"><p><StatusBadge status={c.status} /> by {c.decidedByName ?? "—"}{c.decidedAt ? ` · ${formatWhen(c.decidedAt).date}` : ""}</p>{c.decisionNote && <p className="mt-2 text-foreground-2">{c.decisionNote}</p>}</CardBody></Card>
          )}
        </div>
        <div className="xl:sticky xl:top-20 xl:self-start"><EntityActivity entityType="JobChangeRequest" entityId={c.id} /></div>
      </div>
      <ReasonDialog open={rejecting} onOpenChange={setRejecting} title="Decline this request" description="The recruiter sees your note. The opening stays as it is." confirmLabel="Decline" destructive
        onSubmit={(note) => decide.mutateAsync({ action: "reject", note, ok: "Request declined" }).then(() => undefined)} />
    </>
  );
}
