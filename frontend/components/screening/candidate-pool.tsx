"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatMoney } from "@rms/shared";
import { apiList } from "@/lib/api";
import { DataTable } from "@/components/data/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ExportButton } from "@/components/analytics/export-button";

interface Row { id: string; name: string; email: string; headline?: string; location?: string; experienceYears?: number; skills?: string[]; expectedSalary?: { amount: number; currency: string }; applicationCount: number; latestStatus?: string; createdAt: string; emailVerified: boolean }

export function CandidatePool() {
  const router = useRouter();
  const [skill, setSkill] = useState("");
  const [debounced, setDebounced] = useState("");
  const [minExp, setMinExp] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(skill), 350); return () => clearTimeout(t); }, [skill]);
  const q = useQuery({ queryKey: ["candidate-pool", debounced, minExp], queryFn: () => apiList<Row>(`/candidate-pool?limit=100${debounced ? `&skill=${encodeURIComponent(debounced)}` : ""}${minExp ? `&minExperience=${minExp}` : ""}`) });
  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    { accessorKey: "name", header: "Candidate", cell: ({ row: { original: r } }) => <div className="flex items-center gap-3"><Avatar name={r.name} size={34} /><div className="min-w-0"><p className="truncate font-medium">{r.name}</p><p className="truncate text-xs text-muted">{r.headline ?? r.email}</p></div></div> },
    { accessorKey: "location", header: "Location", cell: ({ getValue }) => (getValue() as string) || <span className="text-muted">—</span> },
    { accessorKey: "experienceYears", header: "Experience", cell: ({ getValue }) => (getValue() != null ? `${getValue()} yrs` : <span className="text-muted">—</span>) },
    { id: "skills", header: "Skills", enableSorting: false, cell: ({ row: { original: r } }) => <div className="flex max-w-64 flex-wrap gap-1">{(r.skills ?? []).slice(0, 4).map((s) => <span key={s} className="rounded bg-background-2 px-1.5 py-0.5 text-xs">{s}</span>)}</div> },
    { id: "salary", header: "Expected", enableSorting: false, cell: ({ row: { original: r } }) => (r.expectedSalary ? formatMoney(r.expectedSalary).replace(/\.00$/, "") : "—") },
    { accessorKey: "applicationCount", header: "Applications" },
    { accessorKey: "latestStatus", header: "Latest", cell: ({ getValue }) => (getValue() ? <StatusBadge status={getValue() as string} /> : <span className="text-muted">—</span>) },
  ], []);
  return (
    <>
      <PageHeader title="Candidate pool" description="Everyone who has signed up. Open a profile for their full history." actions={<ExportButton dataset="candidates" />} />
      <DataTable data={q.data?.items ?? []} columns={columns} loading={q.isPending} exportName="candidates" searchPlaceholder="Search name, email, headline or city…" pageSize={15}
        onRowClick={(r) => router.push(`/admin/candidates/${r.id}`)}
        filters={<><Input aria-label="Skill" className="w-40" placeholder="Skill…" value={skill} onChange={(e) => setSkill(e.target.value)} /><Input aria-label="Minimum experience" className="w-32" inputMode="numeric" placeholder="Min yrs" value={minExp} onChange={(e) => setMinExp(e.target.value.replace(/\D/g, ""))} /></>}
        empty={{ title: "No candidates match", description: "Try a broader search." }}
        renderCard={(r) => <Card className="p-4"><div className="flex items-center gap-3"><Avatar name={r.name} size={36} /><div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.headline ?? r.email}</p></div></div></Card>} />
    </>
  );
}
