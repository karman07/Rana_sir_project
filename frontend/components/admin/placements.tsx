"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Handshake, UserCheck, Users } from "lucide-react";
import { apiList } from "@/lib/api";
import { formatDate, payText, type ContractListItem } from "@/lib/contracts";
import { ExportButton } from "@/components/analytics/export-button";
import { StatCard } from "@/components/data/stat-card";
import { DataTable } from "@/components/data/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";

type Placement = ContractListItem & { activatedAt?: string };

/** A placement is a candidate who accepted a contract: the point at which the hiring succeeded. */
export function Placements() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["contracts", "placements"], queryFn: () => apiList<Placement>("/contracts?limit=100&statuses=ACTIVE,EXPIRING,EXPIRED,TERMINATED&sort=-createdAt") });
  const items = (q.data?.items ?? []).filter((c) => c.activatedAt).sort((a, b) => +new Date(b.activatedAt!) - +new Date(a.activatedAt!));
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = items.filter((c) => c.activatedAt!.slice(0, 7) === month).length;
  const live = items.filter((c) => ["ACTIVE", "EXPIRING"].includes(c.status)).length;

  const columns = useMemo<ColumnDef<Placement, unknown>[]>(() => [
    { id: "candidate", header: "Candidate", accessorFn: (c) => c.candidate.name ?? "", cell: ({ row: { original: c } }) => <div className="flex items-center gap-3"><Avatar name={c.candidate.name ?? "?"} size={32} /><div className="min-w-0"><p className="truncate font-medium">{c.candidate.name}</p><p className="truncate text-xs text-muted">{c.candidate.email}</p></div></div> },
    { id: "role", header: "Role", accessorFn: (c) => c.job.title ?? "", cell: ({ row: { original: c } }) => <div className="min-w-0"><p className="truncate">{c.job.title}</p><p className="truncate text-xs text-muted">{c.job.company}</p></div> },
    { id: "recruiter", header: "Recruiter", accessorFn: (c) => c.recruiter?.name ?? "" },
    { accessorKey: "activatedAt", header: "Placed on", cell: ({ getValue }) => <span className="whitespace-nowrap text-sm">{formatDate((getValue() as string | undefined)?.slice(0, 10))}</span> },
    { id: "pay", header: "Contract rate", enableSorting: false, cell: ({ row: { original: c } }) => <span className="whitespace-nowrap text-sm tabular-nums">{payText(c.terms?.salary)}</span> },
    { id: "ends", header: "Ends", accessorFn: (c) => c.endDate ?? "", cell: ({ row: { original: c } }) => <span className="whitespace-nowrap text-sm text-foreground-2">{c.endDate ? formatDate(c.endDate) : "Open-ended"}</span> },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  ], []);

  return (
    <>
      <PageHeader title="Placements" description="Candidates who have accepted a contract: every successful hire, with who placed them." actions={<ExportButton dataset="contracts" label="Export" />} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Placed this month" value={String(thisMonth)} icon={Handshake} />
        <StatCard label="Currently working" value={String(live)} icon={UserCheck} />
        <StatCard label="All placements" value={String(items.length)} icon={Users} />
      </div>
      <DataTable data={items} columns={columns} loading={q.isPending} exportName="placements" searchPlaceholder="Search candidate, role or company…" onRowClick={(c) => router.push(`/admin/contracts/${c.id}`)}
        empty={{ title: "No placements yet", description: "A placement appears here as soon as a candidate accepts their contract." }}
        renderCard={(c) => <Card className="p-4"><p className="font-medium">{c.candidate.name}</p><p className="text-sm text-foreground-2">{c.job.title} · {c.job.company}</p></Card>} />
    </>
  );
}
