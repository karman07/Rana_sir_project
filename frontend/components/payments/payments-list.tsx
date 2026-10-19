"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Clock3, HandCoins, Landmark, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api, apiList, apiPost, ApiError } from "@/lib/api";
import { money, periodLabel, roleStage, type PaymentCounts, type PaymentItem, type PaymentSummary } from "@/lib/payments";
import { formatDate } from "@/lib/contracts";
import { DataTable } from "@/components/data/data-table";
import { StatCard } from "@/components/data/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { BulkConfirm, BulkPayout, BulkRelease } from "./bulk-actions";
import { ExportButton } from "@/components/analytics/export-button";
import { cn } from "@/lib/utils";

type Role = "admin" | "recruiter" | "candidate";

const TABS: Record<Role, { key: string; label: string; statuses?: string; requested?: boolean; overdue?: boolean; count?: (c: PaymentCounts) => number }[]> = {
  admin: [
    { key: "confirm", label: "Released, to confirm", statuses: "CLIENT_PAID", count: (c) => c.CLIENT_PAID ?? 0 },
    { key: "payouts", label: "Payouts due", statuses: "RECEIVED", count: (c) => c.RECEIVED ?? 0 },
    { key: "requested", label: "Candidate requests", requested: true },
    { key: "awaiting", label: "Awaiting company", statuses: "AWAITING_CLIENT", count: (c) => c.AWAITING_CLIENT ?? 0 },
    { key: "disputed", label: "Disputed", statuses: "DISPUTED", count: (c) => c.DISPUTED ?? 0 },
    { key: "done", label: "Completed", statuses: "PAYOUT_SENT,COMPLETED" },
    { key: "all", label: "All" },
  ],
  recruiter: [
    { key: "topay", label: "To pay", statuses: "AWAITING_CLIENT,DISPUTED", count: (c) => (c.AWAITING_CLIENT ?? 0) + (c.DISPUTED ?? 0) },
    { key: "requested", label: "Candidate requests", requested: true },
    { key: "confirming", label: "Awaiting confirmation", statuses: "CLIENT_PAID" },
    { key: "paid", label: "Paid", statuses: "RECEIVED,PAYOUT_SENT,COMPLETED" },
    { key: "all", label: "All" },
  ],
  candidate: [{ key: "all", label: "All" }],
};

export function PaymentsList({ role }: { role: Role }) {
  const router = useRouter();
  const qc = useQueryClient();
  const tabs = TABS[role];
  const [tab, setTab] = useState(tabs[0].key);
  const t = tabs.find((x) => x.key === tab)!;
  const counts = useQuery({ queryKey: ["payments", "counts"], queryFn: () => api<PaymentCounts>("/payments/counts") });
  const summary = useQuery({ queryKey: ["payments", "summary"], enabled: role === "admin", queryFn: () => api<PaymentSummary>("/payments/summary") });
  const list = useQuery({ queryKey: ["payments", role, tab], queryFn: () => apiList<PaymentItem>(`/payments?limit=100${t.statuses ? `&statuses=${t.statuses}` : ""}${t.requested ? "&requested=true" : ""}`) });

  const run = useMutation({
    mutationFn: () => apiPost<{ created: number; overdue: number }>("/payments/billing/run"),
    onSuccess: (r) => { toast.success(r.created ? `${r.created} payment${r.created > 1 ? "s" : ""} created` : "Nothing new to bill"); qc.invalidateQueries({ queryKey: ["payments"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not run billing"),
  });

  const columns = useMemo<ColumnDef<PaymentItem, unknown>[]>(() => [
    { accessorKey: "paymentNumber", header: "Payment", cell: ({ row: { original: p } }) => <div><p className="font-mono text-xs text-foreground-2">{p.paymentNumber}</p><p className="text-xs text-muted">{p.contractNumber}</p></div> },
    ...(role === "candidate" ? [] : [{ id: "candidate", header: "Candidate", accessorFn: (p: PaymentItem) => p.candidate?.name ?? "", cell: ({ row: { original: p } }: { row: { original: PaymentItem } }) => <div className="min-w-0"><p className="truncate font-medium">{p.candidate?.name}{p.candidateRequest && <span title={p.candidateRequest.note ?? "Asked for their pay"} className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold">Requested</span>}</p><p className="truncate text-xs text-muted">{p.job.title}</p></div> } as ColumnDef<PaymentItem, unknown>]),
    ...(role === "candidate" ? [{ id: "job", header: "Role", accessorFn: (p: PaymentItem) => p.job.title ?? "", cell: ({ row: { original: p } }: { row: { original: PaymentItem } }) => <div className="min-w-0"><p className="truncate">{p.job.title}</p><p className="truncate text-xs text-muted">{p.job.company}</p></div> } as ColumnDef<PaymentItem, unknown>] : []),
    { accessorKey: "period", header: "Period", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm">{periodLabel(getValue() as string)}</span> },
    { id: "amount", header: role === "candidate" ? "Your pay" : role === "recruiter" ? "Amount due" : "Company pays", enableSorting: false, cell: ({ row: { original: p } }) => <span className="whitespace-nowrap text-sm font-medium tabular-nums">{money(role === "admin" ? p.gross : role === "recruiter" ? p.amountDue : p.amount, p.currency)}</span> },
    ...(role === "admin" ? [{ id: "split", header: "Commission", enableSorting: false, cell: ({ row: { original: p } }: { row: { original: PaymentItem } }) => <span className="whitespace-nowrap text-sm tabular-nums text-foreground-2">{money(p.commission, p.currency)}</span> } as ColumnDef<PaymentItem, unknown>] : []),
    ...(role !== "candidate" ? [{ accessorKey: "dueDate", header: "Due", cell: ({ row: { original: p } }: { row: { original: PaymentItem } }) => <span className={cn("whitespace-nowrap text-sm", p.overdue && "font-medium text-danger")}>{formatDate(p.dueDate)}{p.overdue ? " · overdue" : ""}</span> } as ColumnDef<PaymentItem, unknown>] : []),
    { accessorKey: "status", header: "Status", cell: ({ row: { original: p } }) => <StatusBadge status={p.status} label={roleStage(role, p.status)} /> },
  ], [role]);

  // Lead with the currency that has the most going on.
  const totals = [...(summary.data?.totals ?? [])].sort((a, b) => b.commissionEarned + b.awaitingFromCompanies + b.toConfirm + b.payoutsDue - (a.commissionEarned + a.awaitingFromCompanies + a.toConfirm + a.payoutsDue));
  return (
    <>
      <PageHeader
        title="Payments"
        description={role === "admin" ? "Money in from companies, and pay out to candidates. Everything here is recorded by hand and confirmed by the other side." : role === "recruiter" ? "What is due from your companies. Record each payment once you have paid, and we'll confirm it." : "Your pay for each period. Confirm once it reaches you."}
        actions={<>{role === "admin" && <Button variant="secondary" loading={run.isPending} onClick={() => run.mutate()}><RefreshCw />Run billing</Button>}<ExportButton dataset="payments" /></>}
      />
      {role === "admin" && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {totals.length === 0 && <StatCard label="Commission earned" value="—" icon={HandCoins} hint="Once payments are confirmed" />}
          {totals.slice(0, 1).map((t) => (
            <div key={t.currency} className="contents">
              <StatCard label={`Awaiting from companies (${t.currency})`} value={money(t.awaitingFromCompanies + t.toConfirm, t.currency)} icon={Clock3} hint={t.toConfirm ? `${money(t.toConfirm, t.currency)} to confirm` : undefined} />
              <StatCard label="Commission earned" value={money(t.commissionEarned, t.currency)} icon={HandCoins} hint={t.commissionPending ? `+${money(t.commissionPending, t.currency)} on released payments, to confirm` : "From confirmed payments"} />
              <StatCard label="Owed to candidates" value={money(t.payoutsDue, t.currency)} icon={Landmark} hint="Money in, payout not sent" />
              <StatCard label="Paid out" value={money(t.paidOut, t.currency)} icon={Banknote} hint={t.disputed ? `${money(t.disputed, t.currency)} disputed` : undefined} />
            </div>
          ))}
          {totals.length > 1 && <p className="text-xs text-muted sm:col-span-2 xl:col-span-4">Showing {totals[0].currency}. Other currencies: {totals.slice(1).map((t) => t.currency).join(", ")}.</p>}
        </div>
      )}
      {tabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
          {tabs.map((x) => {
            const n = counts.data && x.count ? x.count(counts.data) : 0;
            return (
              <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
                className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === x.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:text-foreground")}>
                {x.label}
                {n > 0 && <span className={cn("rounded-full px-1.5 text-xs", tab === x.key ? "bg-primary-foreground/20" : "bg-gold-soft font-medium text-gold")}>{n}</span>}
              </button>
            );
          })}
          {role === "admin" && !!counts.data?.overdue && <span className="ml-auto flex items-center gap-1.5 text-sm text-danger"><TriangleAlert className="size-4" />{counts.data.overdue} overdue</span>}
        </div>
      )}
      <DataTable
        selectable={role !== "candidate"} getRowId={(p) => p.id}
        bulkActions={(rows) => (<>{role !== "candidate" && <BulkRelease rows={rows} role={role} />}{role === "admin" && <BulkConfirm rows={rows} />}{role === "admin" && <BulkPayout rows={rows} />}</>)}
        data={list.data?.items ?? []} columns={columns} loading={list.isPending} exportName="payments" searchPlaceholder="Search PAY number, transaction or contract…"
        onRowClick={(p) => router.push(`/${role}/payments/${p.id}`)}
        empty={{ title: "No payments here", description: role === "candidate" ? "Your pay appears here once the company's payment has been received." : "Payments are created each month for active contracts." }}
        renderCard={(p) => <Card className="p-4"><p className="font-medium">{p.job.title} · {periodLabel(p.period)}</p><p className="text-sm text-foreground-2">{money(role === "admin" ? p.gross : role === "recruiter" ? p.amountDue : p.amount, p.currency)}</p><div className="mt-2"><StatusBadge status={p.status} label={roleStage(role, p.status)} /></div></Card>}
      />
    </>
  );
}
