"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText } from "lucide-react";
import { apiList, documentUrl } from "@/lib/api";
import { formatDate } from "@/lib/contracts";
import { money, periodLabel } from "@/lib/payments";
import type { PayslipListItem } from "@/lib/payslips";
import { DataTable } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shell/page-header";
import { ExportButton } from "@/components/analytics/export-button";

export function PayslipsList({ role }: { role: "admin" | "candidate" }) {
  const router = useRouter();
  const list = useQuery({ queryKey: ["payslips", role], queryFn: () => apiList<PayslipListItem>("/payslips?limit=100&sort=-period") });
  const columns = useMemo<ColumnDef<PayslipListItem, unknown>[]>(() => [
    { accessorKey: "payslipNumber", header: "Payslip", cell: ({ getValue }) => <span className="font-mono text-xs text-foreground-2">{getValue() as string}</span> },
    ...(role === "admin" ? [{ id: "candidate", header: "Candidate", accessorFn: (p: PayslipListItem) => p.candidate.name ?? "", cell: ({ row: { original: p } }: { row: { original: PayslipListItem } }) => <div className="min-w-0"><p className="truncate font-medium">{p.candidate.name}</p><p className="truncate text-xs text-muted">{p.jobTitle}</p></div> } as ColumnDef<PayslipListItem, unknown>] : []),
    ...(role === "candidate" ? [{ id: "job", header: "Role", accessorFn: (p: PayslipListItem) => p.jobTitle ?? "", cell: ({ row: { original: p } }: { row: { original: PayslipListItem } }) => <div className="min-w-0"><p className="truncate">{p.jobTitle}</p><p className="truncate text-xs text-muted">{p.company}</p></div> } as ColumnDef<PayslipListItem, unknown>] : []),
    { accessorKey: "period", header: "Period", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm">{periodLabel(getValue() as string)}</span> },
    { accessorKey: "netPay", header: "Net pay", cell: ({ row: { original: p } }) => <span className="whitespace-nowrap text-sm font-medium tabular-nums">{money(p.netPay, p.currency)}</span> },
    { accessorKey: "issuedOn", header: "Issued", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm text-foreground-2">{formatDate(getValue() as string)}</span> },
    { id: "pdf", header: "", enableSorting: false, cell: ({ row: { original: p } }) => p.pdfDocumentId ? (
      <Button asChild variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}><a href={documentUrl(p.pdfDocumentId)} aria-label={`Download ${p.payslipNumber} as PDF`}><FileText />PDF</a></Button>) : null },
  ], [role]);

  return (
    <>
      <PageHeader title="Payslips" description={role === "admin" ? "Every payslip issued. Each is a permanent record and is never edited." : "A payslip for every payment you've received, to keep or download."} actions={<ExportButton dataset="payslips" />} />
      <DataTable
        data={list.data?.items ?? []} columns={columns} loading={list.isPending} exportName="payslips" searchPlaceholder={role === "admin" ? "Search PSL number, candidate or contract…" : "Search by payslip or contract…"}
        onRowClick={(p) => router.push(`/${role}/payslips/${p.id}`)}
        empty={{ title: "No payslips yet", description: role === "candidate" ? "Your payslip appears as soon as your pay has been sent." : "A payslip is issued automatically when a candidate's payout is recorded." }}
        renderCard={(p) => <Card className="p-4"><p className="font-medium">{p.jobTitle} · {periodLabel(p.period)}</p><p className="text-sm text-foreground-2">{money(p.netPay, p.currency)} · {p.payslipNumber}</p></Card>}
      />
    </>
  );
}
