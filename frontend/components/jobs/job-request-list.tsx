"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Briefcase, Plus } from "lucide-react";
import { api, apiList } from "@/lib/api";
import type { JobRequest } from "@/lib/jobs";
import { DataTable } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

const TABS_ADMIN = [
  { key: "PENDING_ADMIN_REVIEW", label: "Pending review" },
  { key: "CHANGES_REQUESTED", label: "Changes requested" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
];
const TABS_RECRUITER = [
  { key: "", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "PENDING_ADMIN_REVIEW", label: "In review" },
  { key: "CHANGES_REQUESTED", label: "Changes requested" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const date = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—");

export function JobRequestList({ mode }: { mode: "admin" | "recruiter" }) {
  const admin = mode === "admin";
  const router = useRouter();
  const tabs = admin ? TABS_ADMIN : TABS_RECRUITER;
  const [tab, setTab] = useState(tabs[0].key);
  const base = admin ? "/admin/job-requests" : "/recruiter/jobs";

  const counts = useQuery({ queryKey: ["job-requests", "counts", mode], queryFn: () => api<Record<string, number>>("/job-requests/counts") });
  const list = useQuery({ queryKey: ["job-requests", mode, tab], queryFn: () => apiList<JobRequest>(`/job-requests?limit=100${tab ? `&status=${tab}` : ""}`) });

  const columns = useMemo<ColumnDef<JobRequest, unknown>[]>(() => [
    { accessorKey: "requestNumber", header: "Request", cell: ({ getValue }) => <span className="font-mono text-xs text-foreground-2">{getValue() as string}</span> },
    { id: "title", header: "Opening", accessorFn: (r) => r.spec?.title ?? "Untitled", cell: ({ row: { original: r } }) => (
      <div className="min-w-0"><p className="truncate font-medium">{r.spec?.title || <span className="text-muted">Untitled draft</span>}</p><p className="truncate text-xs text-muted">{r.company?.name}{r.spec?.location ? ` · ${r.spec.location}` : ""}</p></div>) },
    ...(admin ? [{ id: "recruiter", header: "Recruiter", accessorFn: (r: JobRequest) => r.recruiter?.name ?? "", cell: ({ row: { original: r } }: { row: { original: JobRequest } }) => <span className="text-sm">{r.recruiter?.name}</span> } as ColumnDef<JobRequest, unknown>] : []),
    { id: "openings", header: "Openings", accessorFn: (r) => r.spec?.openings ?? 0, cell: ({ getValue }) => <span className="tabular-nums">{(getValue() as number) || "—"}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: r } }) => (
      <div className="flex flex-col items-start gap-1"><StatusBadge status={r.status} />{r.version > 1 && r.status === "PENDING_ADMIN_REVIEW" && <span className="text-xs text-gold">Resubmitted · v{r.version}</span>}</div>) },
    { id: "when", header: admin ? "Submitted" : "Updated", accessorFn: (r) => r.submittedAt ?? r.updatedAt, cell: ({ getValue }) => <span className="text-sm text-foreground-2">{date(getValue() as string)}</span> },
  ], [admin]);

  const pending = counts.data?.PENDING_ADMIN_REVIEW ?? 0;
  return (
    <>
      <PageHeader
        title={admin ? "Job requests" : "Your openings"}
        description={admin ? "Hiring requirements submitted by recruiters. Nothing goes live until you approve it." : "Openings you've submitted for your client companies, and where each one stands."}
        actions={!admin ? <Button asChild><Link href="/recruiter/jobs/new"><Plus />New opening</Link></Button> : undefined}
      />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {tabs.map((t) => {
          const n = t.key ? counts.data?.[t.key] : Object.values(counts.data ?? {}).reduce((a, b) => a + b, 0);
          return (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:bg-background-2")}>
              {t.label}
              {n !== undefined && <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-primary-foreground/20" : admin && t.key === "PENDING_ADMIN_REVIEW" && pending ? "bg-gold-soft font-medium text-gold" : "bg-background-2")}>{n}</span>}
            </button>
          );
        })}
      </div>
      <DataTable
        data={list.data?.items ?? []} columns={columns} loading={list.isPending} exportName={admin ? "job-requests" : undefined}
        searchPlaceholder="Search title, number or location…"
        onRowClick={(r) => router.push(`${base}/${r.id}`)}
        empty={admin
          ? { title: tab === "PENDING_ADMIN_REVIEW" ? "No job requests are waiting for review" : "Nothing here yet", description: "When a recruiter submits an opening, it appears here for your decision." }
          : { title: "You haven't posted any openings yet", description: "Create an opening for one of your client companies. Our team reviews it before candidates can see it.", action: <Button asChild><Link href="/recruiter/jobs/new"><Plus />New opening</Link></Button> }}
        renderCard={(r) => (
          <Card className="p-4"><div className="flex items-start gap-3"><Briefcase className="mt-0.5 size-4 text-muted" />
            <div className="min-w-0 flex-1"><Link href={`${base}/${r.id}`} className="font-medium">{r.spec?.title || "Untitled draft"}</Link><p className="text-xs text-muted">{r.company?.name}</p><div className="mt-2"><StatusBadge status={r.status} /></div></div></div></Card>
        )}
      />
    </>
  );
}
