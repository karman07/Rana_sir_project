"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatMoney } from "@rms/shared";
import { Percent, Rocket, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, apiList, apiPost, ApiError } from "@/lib/api";
import { EMPLOYMENT_LABEL, WORK_MODE_LABEL, payLabel, type Job } from "@/lib/jobs";
import { DataTable } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CommissionEditor, EditCommissionDialog, commissionBody, type CommissionInput, type JobCommission } from "./commission-panel";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ExportButton } from "@/components/analytics/export-button";

const date = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Live jobs. Admin sees all and can publish/close; recruiters see their own and ask Admin for edits or closure. */
export function JobsList({ mode }: { mode: "admin" | "recruiter" }) {
  const admin = mode === "admin";
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [closing, setClosing] = useState<Job | null>(null);
  const [publishing, setPublishing] = useState<Job | null>(null);
  const [pricing, setPricing] = useState<Job | null>(null);
  const [commission, setCommission] = useState<CommissionInput>({ type: "PERCENT", value: "" });
  const q = useQuery({ queryKey: ["jobs", mode, status], queryFn: () => apiList<Job>(`/jobs?limit=100${status ? `&status=${status}` : ""}`) });

  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: unknown; ok: string }) => apiPost(`/jobs/${id}/${action}`, body ?? {}),
    onSuccess: (_r, v) => { toast.success(v.ok); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action failed"),
  });

  const publish = useMutation({
    mutationFn: (j: Job) => apiPost(`/jobs/${j.id}/publish`, commissionBody(commission, j.spec.compensation?.currency) ? { commission: commissionBody(commission, j.spec.compensation?.currency) } : {}),
    onSuccess: () => { toast.success("Job published"); setPublishing(null); setCommission({ type: "PERCENT", value: "" }); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    // Nothing goes live without our commission: ask for it right here when the opening doesn't have one yet.
    onError: (e) => { if (e instanceof ApiError && e.code === "COMMISSION_REQUIRED") toast.info("Set our commission to publish this opening"); else toast.error(e instanceof ApiError ? e.message : "Could not publish"); },
  });

  const columns = useMemo<ColumnDef<Job, unknown>[]>(() => [
    { accessorKey: "jobNumber", header: "Job", cell: ({ getValue }) => <span className="font-mono text-xs text-foreground-2">{getValue() as string}</span> },
    { id: "title", header: "Opening", accessorFn: (j) => j.spec.title ?? "", cell: ({ row: { original: j } }) => (
      <div className="min-w-0"><p className="truncate font-medium">{j.spec.title}</p><p className="truncate text-xs text-muted">{j.company.name} · {j.spec.location} · {j.spec.workMode && WORK_MODE_LABEL[j.spec.workMode]}</p></div>) },
    { id: "type", header: "Type", accessorFn: (j) => j.spec.employmentType ?? "", cell: ({ getValue }) => <span className="text-sm">{EMPLOYMENT_LABEL[getValue() as string] ?? "—"}</span> },
    { id: "salary", header: "Pay", enableSorting: false, cell: ({ row: { original: j } }) => {
      const label = payLabel(j.spec.compensation, formatMoney);
      return label ? <span className="whitespace-nowrap text-sm tabular-nums">{label}</span> : "—";
    } },
    { id: "openings", header: "Openings", accessorFn: (j) => j.spec.openings ?? 0 },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
    { accessorKey: "publishedAt", header: "Published", cell: ({ getValue }) => <span className="text-sm text-foreground-2">{date(getValue() as string)}</span> },
    { id: "actions", header: "", enableHiding: false, enableSorting: false, cell: ({ row: { original: j } }) => (
      <div className="flex justify-end gap-1.5">
        {admin && j.status === "APPROVED" && <Button size="sm" onClick={() => setPublishing(j)}><Rocket />Publish</Button>}
        {admin && j.status !== "CLOSED" && <Button size="sm" variant="ghost" onClick={() => setPricing(j)}><Percent />Commission</Button>}
        {admin && j.status !== "CLOSED" && j.jobRequestId && <Button asChild size="sm" variant="ghost"><Link href={`/admin/job-requests/${j.jobRequestId}/edit`}>Edit</Link></Button>}
        {admin && j.status !== "CLOSED" && <Button size="sm" variant="ghost" onClick={() => setClosing(j)}><XCircle />Close</Button>}
        {!admin && j.status === "PUBLISHED" && j.jobRequestId && <Button asChild size="sm" variant="ghost"><Link href={`/recruiter/jobs/${j.jobRequestId}`}>Request change</Link></Button>}
      </div>) },
  ], [admin, act]);

  return (
    <>
      <PageHeader title={admin ? "Jobs" : "Live openings"} description={admin ? "Approved openings. Only published jobs are visible to candidates." : "Openings that are live for candidates."} actions={<ExportButton dataset="jobs" />} />
      <DataTable
        data={q.data?.items ?? []} columns={columns} loading={q.isPending} exportName={admin ? "jobs" : undefined} searchPlaceholder="Search title, number, location…"
        empty={{ title: "No jobs yet", description: admin ? "Approve a job request and it becomes a live job here." : "Once our team approves one of your submitted openings, it goes live here." }}
        filters={<Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="PUBLISHED">Published</option><option value="APPROVED">Approved (unpublished)</option><option value="CLOSED">Closed</option></Select>}
        renderCard={(j) => <Card className="p-4"><p className="font-medium">{j.spec.title}</p><p className="text-xs text-muted">{j.company.name}</p><div className="mt-2"><StatusBadge status={j.status} /></div></Card>}
      />
      <Dialog open={!!publishing} onOpenChange={(o) => !o && setPublishing(null)}>
        <DialogContent title={`Publish ${publishing?.jobNumber ?? "job"}?`} description="Candidates can apply as soon as it goes live.">
          {publishing && (
            <div className="space-y-4">
              <CommissionEditor spec={publishing.spec} value={commission} onChange={setCommission} />
              <p className="text-xs text-muted">Leave it empty to publish with the commission already set for this opening. If none was set, you will be asked for one.</p>
              <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPublishing(null)}>Cancel</Button><Button loading={publish.isPending} onClick={() => publish.mutate(publishing)}><Rocket />Publish</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {pricing && <PricingDialog job={pricing} onClose={() => setPricing(null)} />}
      <ReasonDialog open={!!closing} onOpenChange={(o) => !o && setClosing(null)} optional destructive title={`Close ${closing?.jobNumber ?? "job"}?`}
        description="Candidates will no longer see this job or be able to apply." placeholder="Reason (optional), e.g. position filled" confirmLabel="Close job"
        onSubmit={(reason) => act.mutateAsync({ id: closing!.id, action: "close", body: { reason: reason || undefined }, ok: "Job closed" })} />
    </>
  );
}

/** Loads the commission now in force on a job and lets Admin change it. */
function PricingDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const q = useQuery({ queryKey: ["job-request", job.jobRequestId, "commission"], queryFn: () => api<{ commission?: JobCommission }>(`/job-requests/${job.jobRequestId}`), enabled: !!job.jobRequestId });
  if (q.isPending) return null;
  return <EditCommissionDialog jobId={job.id} spec={job.spec} current={q.data?.commission} open onOpenChange={(o) => !o && onClose()} />;
}
