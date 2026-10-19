"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@rms/shared";
import { apiList, apiPost, ApiError } from "@/lib/api";
import { timeAgo, type ApplicationListItem } from "@/lib/applications";
import { DataTable } from "@/components/data/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ScoreBadge } from "./score-bar";

/** Candidates Admin has shortlisted and not yet sent to a recruiter. */
export function Shortlisted() {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["applications", "shortlisted"], queryFn: () => apiList<ApplicationListItem>("/applications?limit=100&statuses=ADMIN_SHORTLISTED&sort=-adminScore") });
  const send = useMutation({
    mutationFn: (ids: string[]) => apiPost<{ sent: number; failed: number }>("/screening/send-to-recruiter", { applicationIds: ids }),
    onSuccess: (r) => { toast.success(`${r.sent} sent to the recruiter${r.failed ? `, ${r.failed} couldn't be sent` : ""}`); for (const k of ["applications", "screening", "overview", "approvals"]) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not send"),
  });
  const columns = useMemo<ColumnDef<ApplicationListItem, unknown>[]>(() => [
    { id: "candidate", header: "Candidate", accessorFn: (a) => a.candidate?.name ?? "", cell: ({ row: { original: a } }) => <div className="flex items-center gap-3"><Avatar name={a.candidate?.name ?? "?"} size={32} /><div><p className="font-medium">{a.candidate?.name}</p><p className="text-xs text-muted">{a.candidate?.email}</p></div></div> },
    { id: "job", header: "Job", accessorFn: (a) => a.job.title ?? "", cell: ({ row: { original: a } }) => <div><p>{a.job.title}</p><p className="text-xs text-muted">{a.company.name}</p></div> },
    { id: "score", header: "Admin score", accessorFn: (a) => a.adminScore ?? -1, cell: ({ row: { original: a } }) => <ScoreBadge value={a.adminScore ?? null} /> },
    { id: "salary", header: "Expected", enableSorting: false, cell: ({ row: { original: a } }) => (a.expectedSalary ? formatMoney(a.expectedSalary).replace(/\.00$/, "") : "—") },
    { accessorKey: "updatedAt", header: "Shortlisted", cell: ({ getValue }) => <span className="text-sm text-foreground-2">{timeAgo(getValue() as string)}</span> },
  ], []);
  return (
    <>
      <PageHeader title="Shortlisted candidates" description="Ready to go. Select the best ones and send them to the recruiter." />
      <DataTable data={q.data?.items ?? []} columns={columns} loading={q.isPending} selectable searchPlaceholder="Search…" exportName="shortlisted"
        onRowClick={(a) => router.push(`/admin/applications/${a.id}`)}
        bulkActions={(rows) => <Button size="sm" loading={send.isPending} onClick={() => send.mutate(rows.map((r) => r.id))}><Send />Send {rows.length} to recruiter</Button>}
        empty={{ title: "No shortlisted candidates waiting", description: "Shortlist candidates from the screening workspace and they'll appear here, ready to send." }} />
    </>
  );
}
