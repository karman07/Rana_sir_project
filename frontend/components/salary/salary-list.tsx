"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { api, apiList } from "@/lib/api";
import { formatDate } from "@/lib/contracts";
import { money, periodLabel } from "@/lib/payments";
import { SALARY_LABEL, candidateSalaryLabel, type SalaryCounts, type SalaryItem } from "@/lib/salary";
import { DataTable } from "@/components/data/data-table";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { AskForPay } from "@/components/payments/ask-for-pay";
import { ExportButton } from "@/components/analytics/export-button";
import { cn } from "@/lib/utils";

type Role = "admin" | "recruiter" | "candidate";

const TABS: Record<Role, { key: string; label: string; statuses?: string; count?: (c: SalaryCounts) => number }[]> = {
  admin: [
    { key: "delays", label: "Delay reports", statuses: "UPCOMING,PENDING,PROCESSING,DELAYED", count: (c) => c.delayReports },
    { key: "open", label: "Open", statuses: "UPCOMING,PENDING,PROCESSING" },
    { key: "delayed", label: "Delayed", statuses: "DELAYED", count: (c) => c.DELAYED ?? 0 },
    { key: "disputed", label: "Disputed", statuses: "DISPUTED", count: (c) => c.DISPUTED ?? 0 },
    { key: "paid", label: "Paid", statuses: "PAID" },
    { key: "all", label: "All" },
  ],
  recruiter: [
    { key: "open", label: "Open", statuses: "UPCOMING,PENDING,PROCESSING,DELAYED,DISPUTED" },
    { key: "paid", label: "Paid", statuses: "PAID" },
    { key: "all", label: "All" },
  ],
  candidate: [{ key: "all", label: "All" }],
};

export function SalaryList({ role }: { role: Role }) {
  const router = useRouter();
  const tabs = TABS[role];
  const [tab, setTab] = useState(role === "admin" ? "open" : tabs[0].key);
  const t = tabs.find((x) => x.key === tab)!;
  const counts = useQuery({ queryKey: ["salaries", "counts"], queryFn: () => api<SalaryCounts>("/salaries/counts") });
  const list = useQuery({ queryKey: ["salaries", role, tab], queryFn: () => apiList<SalaryItem>(`/salaries?limit=100&sort=-period${t.statuses ? `&statuses=${t.statuses}` : ""}`) });
  // Candidates: what is coming next, whatever tab they are on.
  const next = useQuery({ queryKey: ["salaries", "next"], enabled: role === "candidate", queryFn: () => apiList<SalaryItem>("/salaries?limit=1&sort=payDate&statuses=UPCOMING,PENDING,PROCESSING,DELAYED") });
  const items = tab === "delays" ? (list.data?.items ?? []).filter((s) => s.delay?.status === "REPORTED") : list.data?.items ?? [];

  const columns = useMemo<ColumnDef<SalaryItem, unknown>[]>(() => [
    { accessorKey: "salaryNumber", header: "Salary", cell: ({ row: { original: s } }) => <div><p className="font-mono text-xs text-foreground-2">{s.salaryNumber}</p><p className="text-xs text-muted">{s.contractNumber}</p></div> },
    ...(role === "candidate"
      ? [{ id: "job", header: "Role", accessorFn: (s: SalaryItem) => s.job.title ?? "", cell: ({ row: { original: s } }: { row: { original: SalaryItem } }) => <div className="min-w-0"><p className="truncate">{s.job.title}</p><p className="truncate text-xs text-muted">{s.job.company}</p></div> } as ColumnDef<SalaryItem, unknown>]
      : [{ id: "candidate", header: "Candidate", accessorFn: (s: SalaryItem) => s.candidate?.name ?? "", cell: ({ row: { original: s } }: { row: { original: SalaryItem } }) => <div className="min-w-0"><p className="truncate font-medium">{s.candidate?.name}</p><p className="truncate text-xs text-muted">{s.job.title}</p></div> } as ColumnDef<SalaryItem, unknown>]),
    { accessorKey: "period", header: "Period", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm">{periodLabel(getValue() as string)}</span> },
    { id: "amount", header: role === "recruiter" ? "Amount" : "Pay", enableSorting: false, cell: ({ row: { original: s } }) => <span className="whitespace-nowrap text-sm font-medium tabular-nums">{money(role === "recruiter" ? s.grossAmount : s.amount, s.currency)}</span> },
    { accessorKey: "payDate", header: "Expected", cell: ({ row: { original: s } }) => (
      <div className="whitespace-nowrap text-sm">{formatDate(s.payDate)}{s.payDate !== s.originalPayDate && <p className="text-xs text-gold">was {formatDate(s.originalPayDate)}</p>}</div>) },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: s } }) => (
      <div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={s.status} label={role === "candidate" ? candidateSalaryLabel(s) : SALARY_LABEL[s.status]} />{role !== "candidate" && s.delay?.status === "REPORTED" && <StatusBadge status="PENDING" label="Delay reported" className="!bg-gold-soft !text-gold" />}</div>) },
  ], [role]);

  const n = next.data?.items[0];
  return (
    <>
      <PageHeader
        title="Salary"
        description={role === "admin" ? "Every candidate's pay, period by period, and the delays that need your word." : role === "recruiter" ? "Pay for your candidates. Submit hours for hourly contracts, and report a delay if the company will be late." : "Your pay for each period, and when to expect it."}
       actions={<ExportButton dataset="salary" />}
      />
      {role === "candidate" && <AskForPay />}
      {role === "candidate" && n && (
        <Card className="mb-5 border-primary/25 bg-primary/[0.03]">
          <CardBody className="flex flex-wrap items-center gap-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><CalendarClock className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground-2">Next pay · {periodLabel(n.period)}</p>
              <p className="text-xl font-semibold tabular-nums">{money(n.amount, n.currency)}<span className="ml-2 text-sm font-normal text-foreground-2">expected {formatDate(n.payDate)}</span></p>
            </div>
            {n.status === "DELAYED" && <p className="flex items-center gap-1.5 text-sm text-gold"><TriangleAlert className="size-4" />Delayed from {formatDate(n.originalPayDate)}</p>}
          </CardBody>
        </Card>
      )}
      {tabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
          {tabs.map((x) => {
            const c = counts.data && x.count ? x.count(counts.data) : 0;
            return (
              <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
                className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === x.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:text-foreground")}>
                {x.label}{c > 0 && <span className={cn("rounded-full px-1.5 text-xs", tab === x.key ? "bg-primary-foreground/20" : "bg-gold-soft font-medium text-gold")}>{c}</span>}
              </button>
            );
          })}
        </div>
      )}
      <DataTable
        data={items} columns={columns} loading={list.isPending} exportName="salary" searchPlaceholder="Search SAL number or contract…"
        onRowClick={(s) => router.push(`/${role}/salary/${s.id}`)}
        empty={{ title: tab === "delays" ? "No delay reports" : "No salary records here", description: "Salary appears for each month of an active contract." }}
        renderCard={(s) => <Card className="p-4"><p className="font-medium">{s.job.title} · {periodLabel(s.period)}</p><p className="text-sm text-foreground-2">{money(role === "recruiter" ? s.grossAmount : s.amount, s.currency)} · expected {formatDate(s.payDate)}</p><div className="mt-2"><StatusBadge status={s.status} label={role === "candidate" ? candidateSalaryLabel(s) : SALARY_LABEL[s.status]} /></div></Card>}
      />
    </>
  );
}
