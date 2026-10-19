"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, HandCoins, Wallet, Briefcase, Building2, CalendarClock, CheckCheck, ClipboardCheck, FileClock, FileSignature, FileWarning, Funnel, History, ShieldOff, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { api, apiPost, ApiError } from "@/lib/api";
import { formatDateTime, humanizeAction } from "@/lib/audit";
import { money } from "@/lib/payments";
import { useSession } from "@/lib/auth";
import { AttentionCard, StatCard } from "@/components/data/stat-card";
import { Timeline } from "@/components/data/timeline";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { DashboardError, DashboardSkeleton, greeting } from "./dashboard-states";
import { Funnel as FunnelChart } from "./funnel";
import { SignupsChart, type SignupPoint } from "./signups-chart";

interface QueueItem { id: string; type: "RECRUITER" | "COMPANY" | "JOB_REQUEST"; title: string; subtitle?: string | null; submittedAt: string; version?: number }
interface Overview {
  attention: { pendingRecruiters: number; pendingCompanies: number; pendingCompanyLinks: number; pendingJobRequests: number; candidatesToReview: number; recruiterDecisions: number; candidateRequests: number; contractApprovals: number; contractChanges: number; expiringContracts: number; pendingTotal: number };
  totals: { activeRecruiters: number; activeCandidates: number; approvedCompanies: number; suspendedUsers: number; liveJobs: number; interviewsThisWeek: number; activeContracts: number };
  funnel: { key: string; count: number }[];
  signups: SignupPoint[];
  queue: QueueItem[];
  recentActivity: { id: string; actorName?: string; actorRole: string; action: string; entityType: string; reason?: string; createdAt: string }[];
}

const waiting = (iso: string) => {
  const days = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
};

export function AdminDashboard() {
  const { user } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["overview", "admin"], queryFn: () => api<Overview>("/analytics/admin/overview") });

  const pay = useQuery({ queryKey: ["payments", "counts"], queryFn: () => api<{ CLIENT_PAID?: number; RECEIVED?: number; DISPUTED?: number; overdue: number }>("/payments/counts") });
  const earn = useQuery({ queryKey: ["payments", "summary"], queryFn: () => api<{ totals: { currency: string; commissionEarned: number }[] }>("/payments/summary") });
  const approve = useMutation({
    mutationFn: ({ id, type }: { id: string; type: "RECRUITER" | "COMPANY" }) => apiPost(`/${type === "RECRUITER" ? "recruiters" : "companies"}/${id}/approve`, {}),
    onSuccess: () => {
      toast.success("Approved");
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["overview", "admin"] });
      qc.invalidateQueries({ queryKey: ["recruiters"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not approve"),
  });

  const header = <PageHeader title={`${greeting()}, ${user?.name.split(" ")[0] ?? ""}`} description="Here's what needs your attention today." />;
  if (q.isPending) return <>{header}<DashboardSkeleton /></>;
  if (q.isError) return <>{header}<DashboardError error={q.error} onRetry={() => q.refetch()} /></>;
  const d = q.data;

  return (
    <>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AttentionCard label="Pending approvals" value={String(d.attention.pendingTotal)} icon={ClipboardCheck}
          hint={d.attention.pendingTotal ? `${d.attention.pendingJobRequests} job · ${d.attention.pendingRecruiters} recruiter · ${d.attention.pendingCompanies} company` : "You're all caught up"} href="/admin/approvals" />
        <AttentionCard label="Candidates to review" value={String(d.attention.candidatesToReview)} icon={Users} hint={d.attention.recruiterDecisions ? `${d.attention.recruiterDecisions} returned by recruiters` : "In the screening queue"} href="/admin/screening" />
        <StatCard label="Active recruiters" value={String(d.totals.activeRecruiters)} icon={UserCheck} hint={`${d.totals.activeCandidates} active candidates`} href="/admin/recruiters" />
        <StatCard label="Interviews this week" value={String(d.totals.interviewsThisWeek)} icon={CalendarClock} href="/admin/interviews" />
        <StatCard label="Live jobs" value={String(d.totals.liveJobs)} icon={Briefcase} hint={`${d.attention.pendingJobRequests} requests to review`} href="/admin/jobs" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <AttentionCard label="Contracts to approve" value={String(d.attention.contractApprovals + d.attention.contractChanges)} icon={FileClock}
          hint={d.attention.contractChanges ? `${d.attention.contractApprovals} new · ${d.attention.contractChanges} changes` : "Waiting for Admin"} href={d.attention.contractApprovals ? "/admin/contracts/pending" : "/admin/contracts/changes"} />
        <AttentionCard label="Contracts ending soon" value={String(d.attention.expiringContracts)} icon={FileWarning} hint="Within 30 days" href="/admin/contracts/expiring" />
        <StatCard label="Active contracts" value={String(d.totals.activeContracts)} icon={FileSignature} href="/admin/contracts" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <AttentionCard label="Payments to confirm" value={String(pay.data?.CLIENT_PAID ?? 0)} icon={Wallet} hint={pay.data?.overdue ? `${pay.data.overdue} overdue from companies` : "Companies say they have paid"} href="/admin/payments" />
        <AttentionCard label="Payouts due" value={String(pay.data?.RECEIVED ?? 0)} icon={Banknote} hint={pay.data?.DISPUTED ? `${pay.data.DISPUTED} disputed` : "Money in, candidates to pay"} href="/admin/payments" />
        <StatCard label="Commission earned" value={earn.data?.totals[0] ? money(earn.data.totals[0].commissionEarned, earn.data.totals[0].currency) : "—"} icon={HandCoins} hint={earn.data && earn.data.totals.length > 1 ? `${earn.data.totals[0].currency} · see Commissions for others` : "From confirmed payments"} href="/admin/commissions" />
      </div>
      {d.totals.suspendedUsers > 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-foreground-2"><ShieldOff className="size-4" />{d.totals.suspendedUsers} suspended account{d.totals.suspendedUsers > 1 ? "s" : ""}</p>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Approval queue" description="Oldest first" action={<Button asChild variant="ghost" size="sm"><Link href="/admin/approvals">Open Approval Center</Link></Button>} />
          <CardBody>
            {d.queue.length === 0 ? (
              <EmptyState icon={CheckCheck} title="Nothing is waiting for review" description="New recruiter sign-ups and company requests appear here for your decision." />
            ) : (
              <ul className="divide-y divide-divider">
                {d.queue.map((item) => (
                  <li key={`${item.type}-${item.id}`} className="flex items-center gap-3 py-3">
                    {item.type === "RECRUITER" ? <Avatar name={item.title} size={36} /> : <span className="flex size-9 items-center justify-center rounded-full bg-background-2 text-secondary-green">{item.type === "COMPANY" ? <Building2 className="size-4" /> : <Briefcase className="size-4" />}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted">{item.type === "RECRUITER" ? "Recruiter sign-up" : item.type === "COMPANY" ? "Company request" : (item.version ?? 1) > 1 ? "Job request · resubmitted" : "Job request"}{item.subtitle ? ` · ${item.subtitle}` : ""} · waiting {waiting(item.submittedAt)}</p>
                    </div>
                    {item.type === "JOB_REQUEST" ? (
                      <Button asChild size="sm" variant="secondary"><Link href={`/admin/job-requests/${item.id}`}>Review</Link></Button>
                    ) : (
                      <Button size="sm" loading={approve.isPending && approve.variables?.id === item.id} onClick={() => approve.mutate({ id: item.id, type: item.type as "RECRUITER" | "COMPANY" })}>Approve</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <SignupsChart data={d.signups} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Hiring funnel" description="Applications → screening → shortlist → interview → hired" />
          <CardBody>{d.funnel[0]?.count ? <FunnelChart stages={d.funnel} /> : <EmptyState icon={Funnel} title="No applications yet" description="The funnel fills in as soon as candidates start applying to approved jobs." />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<Button asChild variant="ghost" size="sm"><Link href="/admin/audit-logs">Audit log</Link></Button>} />
          <CardBody>
            {d.recentActivity.length === 0 ? (
              <EmptyState icon={History} title="No activity yet" description="Actions across the platform are listed here." />
            ) : (
              <Timeline items={d.recentActivity.map((e) => ({
                title: humanizeAction(e.action),
                description: [e.actorName ? `by ${e.actorName}` : null, e.reason].filter(Boolean).join(" — ") || undefined,
                time: formatDateTime(e.createdAt),
              }))} />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
