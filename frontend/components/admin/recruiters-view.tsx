"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Link2, MessageSquareWarning, ShieldOff, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiList, apiPost, ApiError } from "@/lib/api";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/data/data-table";
import { PageHeader } from "@/components/shell/page-header";
import { AddRecruitersDialog } from "./add-recruiters-dialog";
import { cn } from "@/lib/utils";

interface RecruiterRow {
  id: string; name: string; email: string; agencyName?: string; approvalStatus: string; status: string;
  submittedAt?: string; reviewNote?: string; createdByAdmin?: string; hasPassword: boolean; createdAt: string;
}

const TABS = [
  { key: "PENDING_REVIEW", label: "Pending review" },
  { key: "APPROVED", label: "Approved" },
  { key: "CHANGES_REQUESTED", label: "Changes requested" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
] as const;

const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

type Decision = { row: RecruiterRow; kind: "reject" | "request-changes" } | null;

export function RecruitersView() {
  const [tab, setTab] = useState<string>("PENDING_REVIEW");
  const [decision, setDecision] = useState<Decision>(null);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const router = useRouter();

  const counts = useQuery({ queryKey: ["recruiters", "counts"], queryFn: () => api<Record<string, number>>("/recruiters/counts") });
  const list = useQuery({
    queryKey: ["recruiters", tab],
    queryFn: () => apiList<RecruiterRow>(`/recruiters?limit=100&sort=${tab === "PENDING_REVIEW" ? "submittedAt" : "-createdAt"}${tab ? `&approvalStatus=${tab}` : ""}`),
  });

  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: unknown; success: string }) => apiPost<{ inviteUrl?: string }>(`/recruiters/${id}/${action}`, body ?? {}),
    onSuccess: (res, v) => {
      qc.invalidateQueries({ queryKey: ["recruiters"] });
      toast.success(v.success);
      if (res?.inviteUrl) { navigator.clipboard.writeText(res.inviteUrl); toast.message("New invite link copied to clipboard"); }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action failed"),
  });

  const columns = useMemo<ColumnDef<RecruiterRow, unknown>[]>(() => [
    { accessorKey: "name", header: "Recruiter", cell: ({ row: { original: r } }) => (
      <div className="flex items-center gap-3"><Avatar name={r.name} size={32} />
        <div className="min-w-0"><p className="truncate font-medium">{r.name}</p><p className="truncate text-xs text-muted">{r.email}</p></div></div>) },
    { accessorKey: "agencyName", header: "Agency", cell: ({ getValue }) => (getValue() as string) || <span className="text-muted">—</span> },
    { accessorKey: "approvalStatus", header: "Review", cell: ({ row: { original: r } }) => (
      <div className="flex flex-col items-start gap-1"><StatusBadge status={r.approvalStatus} />{r.status === "SUSPENDED" && <StatusBadge status="SUSPENDED" tone="danger" />}</div>) },
    { id: "source", header: "Source", enableSorting: false, cell: ({ row: { original: r } }) => (
      <span className="text-sm text-foreground-2">{r.createdByAdmin ? (r.hasPassword ? "Created by admin" : "Invited · not activated") : "Self-registered"}</span>) },
    { accessorKey: "submittedAt", header: "Submitted", cell: ({ getValue }) => <span className="text-sm text-foreground-2">{fmt(getValue() as string)}</span> },
    { id: "actions", header: "", enableHiding: false, enableSorting: false, cell: ({ row: { original: r } }) => (
      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {r.approvalStatus !== "APPROVED" && (
          <Button size="sm" onClick={() => act.mutate({ id: r.id, action: "approve", success: `${r.name} approved` })}><Check />Approve</Button>
        )}
        {r.approvalStatus === "PENDING_REVIEW" && (
          <Button size="sm" variant="secondary" onClick={() => { setNote(""); setDecision({ row: r, kind: "request-changes" }); }}><MessageSquareWarning />Changes</Button>
        )}
        {r.approvalStatus !== "REJECTED" && (
          <Button size="sm" variant="outlineDanger" onClick={() => { setNote(""); setDecision({ row: r, kind: "reject" }); }}><X />Reject</Button>
        )}
        {r.createdByAdmin && !r.hasPassword && (
          <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: r.id, action: "resend-invite", success: "New invite generated" })}><Link2 />Invite</Button>
        )}
        {r.status === "SUSPENDED" ? (
          <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: r.id, action: "reactivate", success: `${r.name} reactivated` })}><UserCheck />Reactivate</Button>
        ) : (
          <ConfirmationDialog destructive title={`Suspend ${r.name}?`} description="They will be signed out immediately and unable to sign in until reactivated."
            confirmLabel="Suspend" onConfirm={() => act.mutateAsync({ id: r.id, action: "suspend", success: `${r.name} suspended` }).then(() => undefined)}
            trigger={<Button size="sm" variant="ghost" aria-label={`Suspend ${r.name}`}><ShieldOff /></Button>} />
        )}
      </div>) },
  ], [act]);

  const pending = counts.data?.PENDING_REVIEW ?? 0;

  return (
    <>
      <PageHeader title="Recruiters" description="Agents who post openings for client companies. You approve every account." actions={<AddRecruitersDialog />} />

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => {
          const n = t.key ? counts.data?.[t.key] : Object.values(counts.data ?? {}).reduce((a, b) => a + b, 0);
          return (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:bg-background-2")}>
              {t.label}
              {n !== undefined && <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-primary-foreground/20" : t.key === "PENDING_REVIEW" && pending ? "bg-gold-soft text-gold font-medium" : "bg-background-2")}>{n}</span>}
            </button>
          );
        })}
      </div>

      <DataTable
        data={list.data?.items ?? []}
        columns={columns}
        loading={list.isPending}
        searchPlaceholder="Search name, email or agency…"
        exportName="recruiters" onRowClick={(r) => router.push(`/admin/recruiters/${r.id}`)}
        empty={tab === "PENDING_REVIEW"
          ? { title: "No recruiters are waiting for review", description: "New recruiter sign-ups appear here for your approval. You can also add recruiters yourself." }
          : { title: "No recruiters here yet", description: "Recruiters matching this view will appear here." }}
        renderCard={(r) => (
          <Card className="space-y-2 p-4">
            <div className="flex items-center gap-3"><Avatar name={r.name} size={36} /><div className="min-w-0"><p className="truncate font-medium">{r.name}</p><p className="truncate text-xs text-muted">{r.email}</p></div></div>
            <StatusBadge status={r.approvalStatus} />
            {r.approvalStatus !== "APPROVED" && <Button size="sm" className="w-full" onClick={() => act.mutate({ id: r.id, action: "approve", success: `${r.name} approved` })}><Check />Approve</Button>}
          </Card>
        )}
      />

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        {decision && (
          <DialogContent
            title={decision.kind === "reject" ? `Reject ${decision.row.name}?` : `Request changes from ${decision.row.name}`}
            description="They'll see your note on their account. A reason is required."
          >
            <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain what's needed…" aria-label="Note" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button>
              <Button variant={decision.kind === "reject" ? "danger" : "primary"} disabled={note.trim().length < 3} loading={act.isPending}
                onClick={() => act.mutate({ id: decision.row.id, action: decision.kind, body: { note }, success: decision.kind === "reject" ? "Recruiter rejected" : "Changes requested" }, { onSuccess: () => setDecision(null) })}>
                {decision.kind === "reject" ? "Reject" : "Send request"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
