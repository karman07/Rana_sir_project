"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatMoney } from "@rms/shared";
import { api, apiList } from "@/lib/api";
import { humanize, timeAgo, type ApplicationListItem } from "@/lib/applications";
import { DataTable } from "@/components/data/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ExportButton } from "@/components/analytics/export-button";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "APPLIED", label: "New" }, { key: "ADMIN_REVIEW", label: "In review" }, { key: "ADMIN_INTERVIEW", label: "Our interview" }, { key: "ADMIN_SHORTLISTED", label: "Shortlisted" },
  { key: "SENT_TO_RECRUITER,RECRUITER_REVIEW,RECRUITER_APPROVED", label: "With recruiter" }, { key: "INTERVIEW", label: "Interview" },
  { key: "SELECTED,CONTRACT,PLACED", label: "Selected / placed" }, { key: "REJECTED,WITHDRAWN", label: "Closed" }, { key: "", label: "All" },
];

export function AdminApplications() {
  const router = useRouter();
  const [tab, setTab] = useState("APPLIED");
  const counts = useQuery({ queryKey: ["applications", "counts"], queryFn: () => api<Record<string, number>>("/applications/counts") });
  const list = useQuery({ queryKey: ["applications", "admin", tab], queryFn: () => apiList<ApplicationListItem>(`/applications?limit=100${tab ? `&statuses=${tab}` : ""}&sort=${tab === "APPLIED" ? "createdAt" : "-updatedAt"}`) });
  const countFor = (key: string) => (key ? key.split(",").reduce((n, k) => n + (counts.data?.[k] ?? 0), 0) : Object.values(counts.data ?? {}).reduce((a, b) => a + b, 0));

  const columns = useMemo<ColumnDef<ApplicationListItem, unknown>[]>(() => [
    { accessorKey: "applicationNumber", header: "Application", cell: ({ getValue }) => <span className="font-mono text-xs text-foreground-2">{getValue() as string}</span> },
    { id: "candidate", header: "Candidate", accessorFn: (a) => a.candidate?.name ?? "", cell: ({ row: { original: a } }) => (
      <div className="flex items-center gap-3"><Avatar name={a.candidate?.name ?? "?"} size={32} /><div className="min-w-0"><p className="truncate font-medium">{a.candidate?.name}</p><p className="truncate text-xs text-muted">{a.candidate?.email}</p></div></div>) },
    { id: "job", header: "Job", accessorFn: (a) => a.job.title ?? "", cell: ({ row: { original: a } }) => <div className="min-w-0"><p className="truncate">{a.job.title}</p><p className="truncate text-xs text-muted">{a.company.name}</p></div> },
    { id: "salary", header: "Expected", enableSorting: false, cell: ({ row: { original: a } }) => (a.expectedSalary ? <span className="whitespace-nowrap text-sm tabular-nums">{formatMoney(a.expectedSalary).replace(/\.00$/, "")}</span> : <span className="text-muted">—</span>) },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
    { accessorKey: "createdAt", header: "Applied", cell: ({ getValue }) => <span className="text-sm text-foreground-2">{timeAgo(getValue() as string)}</span> },
  ], []);

  return (
    <>
      <PageHeader actions={<ExportButton dataset="applications" />} title="Applications" description="Every application, by stage. Open one to review the candidate and move it forward." />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:bg-background-2")}>
            {t.label}
            {counts.data && <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-primary-foreground/20" : t.key === "APPLIED" && countFor(t.key) ? "bg-gold-soft font-medium text-gold" : "bg-background-2")}>{countFor(t.key)}</span>}
          </button>
        ))}
      </div>
      <DataTable
        data={list.data?.items ?? []} columns={columns} loading={list.isPending} exportName="applications" searchPlaceholder="Search candidate, email or APP number…"
        onRowClick={(a) => router.push(`/admin/applications/${a.id}`)}
        empty={{ title: tab === "APPLIED" ? "No new applications" : "Nothing at this stage", description: "Applications appear here as candidates apply and move through the process." }}
        renderCard={(a) => <Card className="p-4"><p className="font-medium">{a.candidate?.name}</p><p className="text-sm text-foreground-2">{a.job.title} · {a.company.name}</p><div className="mt-2 flex items-center gap-2"><StatusBadge status={a.status} /><span className="text-xs text-muted">{humanize(a.status)}</span></div></Card>}
      />
    </>
  );
}
