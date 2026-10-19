"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { api, apiList } from "@/lib/api";
import { formatDate, payText, type ContractCounts, type ContractListItem } from "@/lib/contracts";
import { DataTable } from "@/components/data/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ExportButton } from "@/components/analytics/export-button";

import { cn } from "@/lib/utils";

type Role = "admin" | "recruiter" | "candidate";
export type ContractView = "active" | "pending" | "expiring" | "changes";

const PENDING = "DRAFT,PENDING_ADMIN_APPROVAL,PENDING_RECRUITER_APPROVAL,PENDING_CANDIDATE_APPROVAL";
const VIEWS: Record<ContractView, { title: string; description: string; statuses?: string; ending?: boolean; empty: string }> = {
  active: { title: "Active contracts", description: "Contracts that are in force, including those ending soon.", statuses: "ACTIVE,EXPIRING", empty: "No active contracts yet" },
  pending: { title: "Pending contracts", description: "Drafts and contracts waiting for someone's approval.", statuses: PENDING, empty: "Nothing is waiting" },
  expiring: { title: "Expiring contracts", description: "Contracts ending within the next 30 days.", ending: true, empty: "Nothing is ending soon" },
  changes: { title: "Contract changes", description: "Active contracts with a change waiting for approval.", statuses: "ACTIVE,EXPIRING", empty: "No changes are waiting" },
};

const TABS: { key: string; label: string; statuses?: string }[] = [
  { key: "attention", label: "Needs attention", statuses: "DRAFT,PENDING_ADMIN_APPROVAL,PENDING_RECRUITER_APPROVAL,PENDING_CANDIDATE_APPROVAL" },
  { key: "active", label: "Active", statuses: "ACTIVE,EXPIRING" },
  { key: "ended", label: "Ended", statuses: "EXPIRED,TERMINATED" },
  { key: "all", label: "All" },
];

function daysLabel(c: ContractListItem) {
  if (c.daysLeft === null || c.daysLeft === undefined || !["ACTIVE", "EXPIRING"].includes(c.status)) return null;
  return c.daysLeft <= 0 ? "ends today" : `${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} left`;
}

export function ContractsList({ role, view }: { role: Role; view?: ContractView }) {
  const router = useRouter();
  const [tab, setTab] = useState(role === "candidate" ? "attention" : "attention");
  const cfg = view ? VIEWS[view] : undefined;
  const tabCfg = TABS.find((t) => t.key === tab)!;
  const counts = useQuery({ queryKey: ["contracts", "counts"], queryFn: () => api<ContractCounts>("/contracts/counts") });

  const path = cfg
    ? `/contracts?limit=100${cfg.ending ? "&endingWithinDays=30" : `&statuses=${cfg.statuses}`}`
    : `/contracts?limit=100${tabCfg.statuses ? `&statuses=${tabCfg.statuses}` : ""}`;
  const list = useQuery({ queryKey: ["contracts", role, view ?? tab], queryFn: () => apiList<ContractListItem>(path) });
  const items = (view === "changes" ? list.data?.items.filter((c) => c.changePending) : list.data?.items) ?? [];

  const columns = useMemo<ColumnDef<ContractListItem, unknown>[]>(() => [
    { accessorKey: "contractNumber", header: "Contract", cell: ({ getValue }) => <span className="font-mono text-xs text-foreground-2">{getValue() as string}</span> },
    ...(role === "candidate" ? [] : [{ id: "candidate", header: "Candidate", accessorFn: (c: ContractListItem) => c.candidate.name ?? "", cell: ({ row: { original: c } }: { row: { original: ContractListItem } }) => (
      <div className="flex items-center gap-3"><Avatar name={c.candidate.name ?? "?"} size={32} /><div className="min-w-0"><p className="truncate font-medium">{c.candidate.name}</p><p className="truncate text-xs text-muted">{c.candidate.email}</p></div></div>) } as ColumnDef<ContractListItem, unknown>]),
    { id: "job", header: "Role", accessorFn: (c) => c.job.title ?? "", cell: ({ row: { original: c } }) => <div className="min-w-0"><p className="truncate">{c.job.title}</p><p className="truncate text-xs text-muted">{c.job.company}</p></div> },
    { id: "pay", header: "Pay", enableSorting: false, cell: ({ row: { original: c } }) => <span className="whitespace-nowrap text-sm tabular-nums">{payText(c.terms?.salary)}</span> },
    { id: "dates", header: "Dates", accessorFn: (c) => c.startDate, cell: ({ row: { original: c } }) => (
      <div className="text-sm"><p className="whitespace-nowrap">{formatDate(c.startDate)}{c.endDate ? ` → ${formatDate(c.endDate)}` : " → open-ended"}</p>{daysLabel(c) && <p className="text-xs text-gold">{daysLabel(c)}</p>}</div>) },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: c } }) => <div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={c.status} />{c.changePending && <StatusBadge status="PENDING" className="!bg-gold-soft !text-gold" />}</div> },
  ], [role]);

  const base = `/${role}/contracts`;
  return (
    <>
      <PageHeader actions={<ExportButton dataset="contracts" />} title={cfg?.title ?? "Contracts"} description={cfg?.description ?? (role === "candidate" ? "Agreements for roles you've been selected for." : "Contracts for selected candidates, from draft to active.")} />
      {!cfg && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:text-foreground")}>
              {t.label}
              {t.key === "attention" && counts.data && counts.data.pendingTotal > 0 && <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-primary-foreground/20" : "bg-gold-soft font-medium text-gold")}>{counts.data.pendingTotal}</span>}
            </button>
          ))}
        </div>
      )}
      <DataTable
        data={items} columns={columns} loading={list.isPending} exportName="contracts" searchPlaceholder="Search by contract number…"
        onRowClick={(c) => router.push(`${base}/${c.id}`)}
        empty={{ title: cfg?.empty ?? "No contracts here", description: "Contracts appear once a selected candidate has an agreement drafted." }}
        renderCard={(c) => <Card className="p-4"><p className="font-medium">{c.job.title}</p><p className="text-sm text-foreground-2">{c.job.company} · {payText(c.terms?.salary)}</p><div className="mt-2"><StatusBadge status={c.status} /></div></Card>}
      />
    </>
  );
}
