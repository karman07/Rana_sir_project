"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/audit";
import { LEDGER_LABEL, money, periodLabel, type LedgerLine } from "@/lib/payments";
import { DataTable } from "@/components/data/data-table";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

const TYPES = [{ key: "", label: "All" }, { key: "CLIENT_RECEIPT", label: "Received" }, { key: "COMMISSION", label: "Commission" }, { key: "CANDIDATE_PAYOUT", label: "Payouts" }, { key: "REVERSAL", label: "Reversals" }];

export function TransactionsView() {
  const router = useRouter();
  const [type, setType] = useState("");
  const list = useQuery({ queryKey: ["ledger", type], queryFn: () => apiList<LedgerLine & { paymentId: string }>(`/payments/ledger?limit=100${type ? `&type=${type}` : ""}`) });
  const columns = useMemo<ColumnDef<LedgerLine & { paymentId: string }, unknown>[]>(() => [
    { accessorKey: "createdAt", header: "When", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm text-foreground-2">{formatDateTime(getValue() as string)}</span> },
    { accessorKey: "type", header: "Type", cell: ({ getValue }) => <StatusBadge status={getValue() as string} label={LEDGER_LABEL[getValue() as LedgerLine["type"]]} tone={getValue() === "COMMISSION" ? "gold" : getValue() === "CANDIDATE_PAYOUT" ? "info" : getValue() === "REVERSAL" ? "danger" : "success"} /> },
    { id: "payment", header: "Payment", accessorFn: (l) => l.paymentNumber, cell: ({ row: { original: l } }) => <div><p className="font-mono text-xs">{l.paymentNumber} · {l.contractNumber}</p><p className="font-mono text-xs text-muted">{l.transactionId}</p></div> },
    { accessorKey: "period", header: "Period", cell: ({ getValue }) => periodLabel(getValue() as string) },
    { id: "ref", header: "Reference", enableSorting: false, cell: ({ row: { original: l } }) => <span className="font-mono text-xs text-foreground-2">{l.reference ?? "—"}</span> },
    { accessorKey: "amount", header: "Amount", cell: ({ row: { original: l } }) => <span className={cn("whitespace-nowrap font-medium tabular-nums", l.amount < 0 && "text-foreground-2")}>{l.amount < 0 ? "−" : "+"}{money(Math.abs(l.amount), l.currency)}</span> },
  ], []);
  return (
    <>
      <PageHeader title="Transactions" description="Every movement of money, in order. Lines are never edited; a correction is a new line." />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {TYPES.map((t) => <button key={t.key} role="tab" aria-selected={type === t.key} onClick={() => setType(t.key)} className={cn("rounded-lg border px-3 py-1.5 text-sm transition-colors", type === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:text-foreground")}>{t.label}</button>)}
      </div>
      <DataTable data={list.data?.items ?? []} columns={columns} loading={list.isPending} exportName="transactions" searchPlaceholder="Search PAY, transaction, contract or reference…" onRowClick={(l) => router.push(`/admin/payments/${l.paymentId}`)}
        empty={{ title: "No transactions yet", description: "Lines appear when a company's payment is confirmed and when a payout is recorded." }}
        renderCard={(l) => <Card className="p-4"><p className="font-medium">{LEDGER_LABEL[l.type]}</p><p className="text-sm text-foreground-2">{l.paymentNumber} · {money(Math.abs(l.amount), l.currency)}</p></Card>} />
    </>
  );
}
