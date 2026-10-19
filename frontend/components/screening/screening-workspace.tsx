"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, GitCompareArrows, Inbox, Send, Star, X } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@rms/shared";
import { api, apiPost, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/applications";
import type { QueueJob, Ranking, RankingRow } from "@/lib/screening";
import { DataTable } from "@/components/data/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";
import { CompareDialog } from "./compare-dialog";
import { ScoreBadge, ScoreBar } from "./score-bar";

const STAGE_FILTERS = [
  { key: "", label: "Everyone" }, { key: "APPLIED,ADMIN_REVIEW", label: "To screen" }, { key: "ADMIN_INTERVIEW", label: "Our interview" }, { key: "ADMIN_SHORTLISTED", label: "Shortlisted" },
  { key: "SENT_TO_RECRUITER,RECRUITER_REVIEW,RECRUITER_APPROVED,INTERVIEW,SELECTED,CONTRACT,PLACED", label: "Sent on" }, { key: "REJECTED,WITHDRAWN", label: "Closed" },
];

export function ScreeningWorkspace() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [jobId, setJobId] = useState(params.get("job") ?? "");
  const [stage, setStage] = useState("APPLIED,ADMIN_REVIEW");
  const [compare, setCompare] = useState<string[] | null>(null);
  const [reject, setReject] = useState<RankingRow[] | null>(null);

  const queue = useQuery({ queryKey: ["screening", "queue"], queryFn: () => api<QueueJob[]>("/screening/queue") });
  useEffect(() => { if (!jobId && queue.data?.length) setJobId(queue.data[0].id); }, [jobId, queue.data]);

  const ranking = useQuery({
    queryKey: ["screening", "ranking", jobId, stage], enabled: !!jobId,
    queryFn: () => api<Ranking>(`/screening/jobs/${jobId}${stage ? `?statuses=${stage}` : ""}`),
  });

  const refresh = () => { for (const k of ["screening", "applications", "approvals", "overview", "audit"]) qc.invalidateQueries({ queryKey: [k] }); };
  const act = useMutation({
    mutationFn: async ({ rows, action, reason }: { rows: RankingRow[]; action: "shortlist" | "send" | "reject"; reason?: string }) => {
      if (action === "send") return apiPost<{ sent: number; failed: number }>("/screening/send-to-recruiter", { applicationIds: rows.map((r) => r.id) });
      for (const r of rows) await apiPost(`/screening/${r.id}/${action}`, action === "reject" ? { reason } : {});
      return { sent: rows.length, failed: 0 };
    },
    onSuccess: (res, v) => {
      toast.success(v.action === "send" ? `${res.sent} sent to the recruiter${res.failed ? `, ${res.failed} couldn't be sent` : ""}` : v.action === "shortlist" ? `${v.rows.length} shortlisted` : `${v.rows.length} rejected`);
      refresh();
    },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : "Action failed"); refresh(); },
  });

  const columns = useMemo<ColumnDef<RankingRow, unknown>[]>(() => [
    { id: "candidate", header: "Candidate", accessorFn: (r) => r.candidate.name, cell: ({ row: { original: r } }) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.candidate.name} size={34} />
        <div className="min-w-0"><p className="truncate font-medium">{r.candidate.name}</p><p className="truncate text-xs text-muted">{r.candidate.headline ?? r.candidate.email}</p>
          {r.tags.length > 0 && <div className="mt-0.5 flex gap-1">{r.tags.slice(0, 2).map((t) => <span key={t} className="rounded bg-gold-soft px-1.5 text-[10px] text-gold">{t}</span>)}</div>}
        </div>
      </div>) },
    { id: "exp", header: "Experience", accessorFn: (r) => r.experienceYears ?? -1, cell: ({ row: { original: r } }) => (r.experienceYears !== null ? `${r.experienceYears} yrs` : <span className="text-muted">—</span>) },
    { id: "skills", header: "Skills match", accessorFn: (r) => r.match.skills.percent, cell: ({ row: { original: r } }) => <ScoreBar value={r.match.skills.percent} /> },
    { id: "match", header: "Job match", accessorFn: (r) => r.match.overall, cell: ({ row: { original: r } }) => <ScoreBar value={r.match.overall} /> },
    { id: "resume", header: "Resume", accessorFn: (r) => r.resumeScore ?? -1, cell: ({ row: { original: r } }) => <ScoreBadge value={r.resumeScore} /> },
    { id: "admin", header: "Admin score", accessorFn: (r) => r.adminScore ?? -1, cell: ({ row: { original: r } }) => <ScoreBadge value={r.adminScore} /> },
    { id: "salary", header: "Expected", enableSorting: false, cell: ({ row: { original: r } }) => (r.expectedSalary ? <span className="whitespace-nowrap text-sm tabular-nums">{formatMoney(r.expectedSalary).replace(/\.00$/, "")}</span> : <span className="text-muted">—</span>) },
    { id: "avail", header: "Availability", accessorFn: (r) => r.noticePeriodDays ?? 999, cell: ({ row: { original: r } }) => (r.noticePeriodDays === null ? <span className="text-muted">—</span> : r.noticePeriodDays === 0 ? "Immediate" : `${r.noticePeriodDays} days`) },
    { id: "status", header: "Status", accessorFn: (r) => r.status, cell: ({ row: { original: r } }) => <StatusBadge status={r.status} /> },
  ], []);

  const job = ranking.data?.job;
  return (
    <>
      <PageHeader title="Screening" description="Review applicants against each job, score them, and decide who the recruiter sees." />
      {queue.isPending ? <Skeleton className="h-96 w-full rounded-[16px]" /> : queue.isError ? <ErrorState compact variant="server" onRetry={() => queue.refetch()} /> : queue.data.length === 0 ? (
        <EmptyState icon={Inbox} title="No candidates are waiting for review" description="When candidates apply to a live job, they appear here for screening." action={<Button asChild variant="secondary"><Link href="/admin/applications">All applications</Link></Button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-2">
            <p className="px-1 text-xs font-medium uppercase tracking-wider text-muted">Jobs with applicants</p>
            {queue.data.map((j) => (
              <button key={j.id} onClick={() => setJobId(j.id)} className={cn("w-full rounded-xl border p-3 text-left transition-colors", jobId === j.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-background-2")}>
                <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold">{j.title}</p>{j.waiting > 0 && <span className="rounded-full bg-gold-soft px-2 text-xs font-semibold text-gold">{j.waiting}</span>}</div>
                <p className="truncate text-xs text-muted">{j.company} · {j.jobNumber}</p>
                <p className="mt-1.5 text-xs text-foreground-2">{j.applied} new · {j.inReview} in review · {j.shortlisted} shortlisted</p>
                {j.oldest && j.waiting > 0 && <p className="text-[11px] text-muted">Oldest waiting {timeAgo(j.oldest).toLowerCase()}</p>}
              </button>
            ))}
          </aside>

          <section className="min-w-0">
            {ranking.isPending ? <Skeleton className="h-96 w-full rounded-[16px]" /> : ranking.isError ? <ErrorState compact variant="server" onRetry={() => ranking.refetch()} /> : (
              <>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div><h2 className="text-lg font-semibold tracking-tight">{job!.title}</h2><p className="text-sm text-foreground-2">{job!.company} · {job!.openings ?? 1} opening{(job!.openings ?? 1) > 1 ? "s" : ""} · needs {job!.skills.slice(0, 4).join(", ")}</p></div>
                  <div className="flex flex-wrap gap-1.5" role="tablist">
                    {STAGE_FILTERS.map((f) => <button key={f.key} role="tab" aria-selected={stage === f.key} onClick={() => setStage(f.key)} className={cn("rounded-lg border px-3 py-1 text-sm", stage === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:bg-background-2")}>{f.label}</button>)}
                  </div>
                </div>
                <DataTable
                  data={ranking.data.rows} columns={columns} selectable pageSize={12} searchPlaceholder="Search candidates…" exportName="ranking"
                  onRowClick={(r) => router.push(`/admin/applications/${r.id}`)}
                  bulkActions={(rows) => (
                    <>
                      {rows.length >= 2 && rows.length <= 4 && <Button size="sm" variant="secondary" onClick={() => setCompare(rows.map((r) => r.id))}><GitCompareArrows />Compare</Button>}
                      <Button size="sm" variant="secondary" loading={act.isPending && act.variables?.action === "shortlist"} onClick={() => act.mutate({ rows, action: "shortlist" })}><Star />Shortlist</Button>
                      <Button size="sm" loading={act.isPending && act.variables?.action === "send"} onClick={() => act.mutate({ rows, action: "send" })}><Send />Send to recruiter</Button>
                      <Button size="sm" variant="outlineDanger" onClick={() => setReject(rows)}><X />Reject</Button>
                    </>
                  )}
                  empty={{ title: stage === "APPLIED,ADMIN_REVIEW" ? "Everyone has been screened" : "No candidates here", description: "Try another stage filter." }}
                  renderCard={(r) => <Card className="p-4"><div className="flex items-center gap-3"><Avatar name={r.candidate.name} size={36} /><div><p className="font-medium">{r.candidate.name}</p><p className="text-xs text-muted">Match {r.match.overall}% · Admin {r.adminScore ?? "—"}</p></div></div><div className="mt-2"><StatusBadge status={r.status} /></div></Card>}
                />
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Check className="size-3.5" />Select 2–4 rows to compare. Open a row to score, add notes and tags. Job match is a rules-based guide — your score decides.</p>
              </>
            )}
          </section>
        </div>
      )}
      {compare && <CompareDialog ids={compare} onClose={() => setCompare(null)} />}
      <ReasonDialog open={!!reject} onOpenChange={(o) => !o && setReject(null)} destructive title={`Reject ${reject?.length ?? 0} candidate${(reject?.length ?? 0) > 1 ? "s" : ""}?`}
        description="The candidates are told their applications won't move forward. Your reason is internal." confirmLabel="Reject"
        onSubmit={(reason) => act.mutateAsync({ rows: reject!, action: "reject", reason })} />
    </>
  );
}
