"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, apiList, apiPost, ApiError } from "@/lib/api";
import { CHANGE_LABEL, showValue, type JobChange } from "@/lib/job-changes";
import { formatWhen } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { StatusBadge } from "@/components/ui/status-badge";

/**
 * A live opening can't be edited or closed straight away: the recruiter asks and Admin decides.
 * Shows the actions, the request waiting for a decision, and how earlier requests ended.
 */
export function JobChangePanel({ requestId, jobId }: { requestId: string; jobId: string }) {
  const qc = useQueryClient();
  const [closing, setClosing] = useState(false);
  const q = useQuery({ queryKey: ["job-changes", jobId], queryFn: () => apiList<JobChange>(`/job-changes?jobId=${jobId}&limit=20`) });
  const items = q.data?.items ?? [];
  const pending = items.find((c) => c.status === "PENDING");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["job-changes"] }); qc.invalidateQueries({ queryKey: ["approvals"] }); };
  const close = useMutation({
    mutationFn: (reason: string) => apiPost(`/jobs/${jobId}/change-requests`, { type: "CLOSE", reason }),
    onSuccess: () => { toast.success("Request sent. The opening stays live until our team approves."); setClosing(false); refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiPost(`/job-changes/${id}/cancel`),
    onSuccess: () => { toast.success("Request withdrawn"); refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not withdraw"),
  });

  return (
    <Card>
      <CardHeader title="Changes to this opening" description="Edits and closures are approved by our team" />
      <CardBody className="space-y-4">
        {pending ? (
          <div className="rounded-xl border border-gold/40 bg-gold-soft p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><Clock className="size-4 text-gold" />{CHANGE_LABEL[pending.type]} waiting for approval</p>
            <p className="mt-1 text-foreground-2">{pending.type === "EDIT" ? `Changing ${pending.changes.map((c) => c.label).join(", ")}. ` : ""}{pending.reason}</p>
            <ConfirmationDialog title="Withdraw this request?" description="The opening stays exactly as it is." confirmLabel="Withdraw" onConfirm={() => cancel.mutateAsync(pending.id).then(() => undefined)}
              trigger={<Button size="sm" variant="secondary" className="mt-3">Withdraw request</Button>} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary"><Link href={`/recruiter/jobs/${requestId}/request-edit`}><Pencil />Request an edit</Link></Button>
            <Button variant="outlineDanger" onClick={() => setClosing(true)}><XCircle />Request to close</Button>
          </div>
        )}
        {items.filter((c) => c.status !== "PENDING").length > 0 && (
          <ul className="divide-y divide-divider text-sm">
            {items.filter((c) => c.status !== "PENDING").map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="block font-medium">{CHANGE_LABEL[c.type]} · {c.changeNumber}</span><span className="block text-xs text-muted">{formatWhen(c.decidedAt ?? c.submittedAt).date}{c.decisionNote ? ` · ${c.decisionNote}` : ""}</span></span>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
        {!q.isPending && !items.length && <p className="text-sm text-foreground-2">No changes requested yet.</p>}
      </CardBody>
      <ReasonDialog open={closing} onOpenChange={setClosing} title="Request to close this opening" description="Candidates stop seeing it once our team approves." confirmLabel="Send request" destructive
        placeholder="e.g. We filled the role internally" onSubmit={(r) => close.mutateAsync(r).then(() => undefined)} />
    </Card>
  );
}

/** What an edit request would change, old value against new. */
export function ChangeDiff({ changes }: { changes: JobChange["changes"] }) {
  return (
    <ul className="divide-y divide-divider">
      {changes.map((c) => (
        <li key={c.field} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr_1fr] sm:gap-4">
          <span className="text-sm text-muted">{c.label}</span>
          <span className="whitespace-pre-line text-sm text-foreground-2 line-through decoration-danger/50">{showValue(c.from)}</span>
          <span className="whitespace-pre-line text-sm font-medium">{showValue(c.to)}</span>
        </li>
      ))}
    </ul>
  );
}
