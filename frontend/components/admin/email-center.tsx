"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, CheckCircle2, Mail, MailWarning, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { api, apiList, apiPost, ApiError } from "@/lib/api";
import { formatDateTime, humanizeAction } from "@/lib/audit";
import { StatCard } from "@/components/data/stat-card";
import { DataTable } from "@/components/data/data-table";
import { Timeline } from "@/components/data/timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DrawerContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

interface EmailRow {
  id: string; to: string; toName?: string; template: string; subject: string; status: string; attempts: number; scheduled?: boolean;
  createdAt: string; sentAt?: string; failureReason?: string; nextAttemptAt: string; bodyRedacted?: boolean;
  html?: string; events?: { status: string; at: string; detail?: string }[]; related?: { type?: string; id?: string };
}
interface Stats { total: number; last24h: number; scheduled: number; queued: number; sent: number; delivered: number; failed: number; bounced: number }

const TABS = [
  { key: "", label: "All" }, { key: "SENT", label: "Sent" }, { key: "DELIVERED", label: "Delivered" }, { key: "QUEUED", label: "Queued" },
  { key: "SCHEDULED", label: "Scheduled" }, { key: "FAILED", label: "Failed" }, { key: "BOUNCED", label: "Bounced" },
];
const TONE: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = { SENT: "info", DELIVERED: "success", QUEUED: "warning", SENDING: "warning", FAILED: "danger", BOUNCED: "danger", COMPLAINED: "danger" };

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["email", id], queryFn: () => api<EmailRow>(`/emails/${id}`) });
  const retry = useMutation({
    mutationFn: () => apiPost(`/emails/${id}/retry`),
    onSuccess: () => { toast.success("Queued for another attempt"); qc.invalidateQueries({ queryKey: ["email"] }); qc.invalidateQueries({ queryKey: ["emails"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not retry"),
  });
  const e = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title={e?.subject ?? "Email"} description={e ? `To ${e.to}` : undefined} className="w-[min(96vw,40rem)]">
        {q.isPending ? <Skeleton className="h-64 w-full" /> : e && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} tone={TONE[e.status]} /><span className="text-muted">Template: {e.template}</span><span className="text-muted">Attempts: {e.attempts}</span></div>
            {e.failureReason && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{e.failureReason}</p>}
            {(e.status === "FAILED" || e.status === "BOUNCED") && <Button size="sm" loading={retry.isPending} onClick={() => retry.mutate()}><RotateCcw />Retry sending</Button>}
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Preview{e.bodyRedacted ? " (content removed after sending — it held a one-time link)" : ""}</p>
              <iframe title="Email preview" sandbox="" srcDoc={e.html} className="h-96 w-full rounded-lg border border-border bg-white" />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Delivery log</p>
              <Timeline items={(e.events ?? []).map((v) => ({ title: humanizeAction(v.status), description: v.detail, time: formatDateTime(v.at) })).reverse()} />
            </div>
          </div>
        )}
      </DrawerContent>
    </Dialog>
  );
}

export function EmailCenter() {
  const [tab, setTab] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const status = useQuery({ queryKey: ["emails", "status"], queryFn: () => api<{ live: boolean; provider: string }>("/emails/status") });
  const stats = useQuery({ queryKey: ["emails", "stats"], queryFn: () => api<Stats>("/emails/stats"), refetchInterval: 20_000 });
  const list = useQuery({ queryKey: ["emails", "list", tab], queryFn: () => apiList<EmailRow>(`/emails?limit=100${tab ? `&status=${tab}` : ""}`), refetchInterval: 20_000 });

  const columns = useMemo<ColumnDef<EmailRow, unknown>[]>(() => [
    { accessorKey: "createdAt", header: "Created", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm text-foreground-2">{formatDateTime(getValue() as string)}</span> },
    { accessorKey: "to", header: "Recipient", cell: ({ row: { original: e } }) => <div className="min-w-0"><p className="truncate font-medium">{e.toName ?? e.to}</p><p className="truncate text-xs text-muted">{e.to}</p></div> },
    { accessorKey: "subject", header: "Subject", cell: ({ getValue }) => <span className="line-clamp-1 max-w-72 text-sm">{getValue() as string}</span> },
    { accessorKey: "template", header: "Template", cell: ({ getValue }) => <span className="rounded bg-background-2 px-1.5 py-0.5 font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: e } }) => <StatusBadge status={e.scheduled ? "SCHEDULED" : e.status} tone={e.scheduled ? "gold" : TONE[e.status]} /> },
    { accessorKey: "attempts", header: "Tries" },
  ], []);

  const s = stats.data;
  return (
    <>
      <PageHeader title="Email Center" description="Every email the platform sends, with delivery status. Failed emails retry automatically."
        actions={<><Button asChild variant="secondary"><Link href="/admin/templates">Templates</Link></Button><Button asChild variant="secondary"><Link href="/admin/settings/email">Settings</Link></Button></>} />
      {status.data && !status.data.live && (
        <Link href="/admin/settings/email" className="mb-4 flex items-center gap-3 rounded-[14px] border border-gold/40 bg-gold-soft px-4 py-3 text-sm transition-colors hover:bg-gold-soft/70">
          <MailWarning className="size-5 text-gold" /><span className="flex-1"><span className="font-medium">Emails are not being delivered.</span> No provider key is set on the server.</span><span className="font-medium text-primary">See why</span>
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent" value={s ? String(s.sent) : "—"} icon={Send} hint={s ? `${s.delivered} confirmed delivered` : undefined} />
        <StatCard label="Queued" value={s ? String(s.queued) : "—"} icon={Mail} hint="Waiting to send" />
        <StatCard label="Scheduled" value={s ? String(s.scheduled) : "—"} icon={CalendarClock} />
        <StatCard label="Needs attention" value={s ? String(s.failed + s.bounced) : "—"} icon={s && s.failed + s.bounced > 0 ? MailWarning : CheckCircle2} hint={s ? `${s.failed} failed · ${s.bounced} bounced` : undefined} />
      </div>
      <div className="mt-6 mb-4 flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn("rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:bg-background-2")}>{t.label}</button>
        ))}
      </div>
      <DataTable data={list.data?.items ?? []} columns={columns} loading={list.isPending} exportName="emails" pageSize={15} searchPlaceholder="Search recipient, subject or template…"
        onRowClick={(e) => setOpen(e.id)}
        empty={{ title: tab === "FAILED" ? "No failed emails" : "No emails here", description: tab === "FAILED" ? "Everything has been delivered." : "Emails appear here as the platform sends them." }} />
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
