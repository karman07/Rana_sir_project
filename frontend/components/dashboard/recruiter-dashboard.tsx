"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Briefcase, Building2, CalendarClock, Inbox, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { Stepper } from "@/components/data/stepper";
import { FileClock, FileSignature, FileWarning, Wallet } from "lucide-react";
import { AttentionCard, StatCard } from "@/components/data/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { DashboardError, DashboardSkeleton, greeting } from "./dashboard-states";

interface Overview {
  approval: { status: string; note: string | null };
  candidates: { needsDecision: number; approved: number; interview: number; selected: number; placed: number };
  openings: { drafts: number; inReview: number; changesRequested: number; live: number };
  companies: { id: string; name: string; industry?: string; location?: string; approvalStatus: string }[];
  totals: { approvedCompanies: number; pendingCompanies: number };
}

export function RecruiterDashboard() {
  const { user } = useSession();
  const q = useQuery({ queryKey: ["overview", "recruiter"], queryFn: () => api<Overview>("/analytics/recruiter/overview") });
  const ct = useQuery({ queryKey: ["contracts", "counts"], queryFn: () => api<{ ACTIVE?: number; EXPIRING?: number; pendingTotal: number; expiringSoon: number }>("/contracts/counts") });
  const pay = useQuery({ queryKey: ["payments", "counts"], queryFn: () => api<{ AWAITING_CLIENT?: number; DISPUTED?: number; overdue: number }>("/payments/counts") });
  const iv = useQuery({ queryKey: ["interviews", "summary"], queryFn: () => api<{ upcoming: number; thisWeek: number; awaitingFeedback: number }>("/interviews/summary") });
  const header = <PageHeader title={`${greeting()}, ${user?.name.split(" ")[0] ?? ""}`} description="Candidates to decide on, and how your hiring is progressing." />;
  if (q.isPending) return <>{header}<DashboardSkeleton /></>;
  if (q.isError) return <>{header}<DashboardError error={q.error} onRetry={() => q.refetch()} /></>;
  const d = q.data;

  return (
    <>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AttentionCard label="Needs your decision" value={String(d.candidates.needsDecision)} icon={Inbox}
          hint={d.openings.changesRequested ? `${d.openings.changesRequested} opening${d.openings.changesRequested > 1 ? "s" : ""} need changes` : "Candidates sent by our team"} href="/recruiter/candidates" />
        <StatCard label="Live openings" value={String(d.openings.live)} icon={Briefcase} hint={`${d.openings.inReview} in review · ${d.openings.drafts} drafts`} href="/recruiter/jobs" />
        <StatCard label="Upcoming interviews" value={String(iv.data?.upcoming ?? 0)} icon={CalendarClock} hint={iv.data?.awaitingFeedback ? `${iv.data.awaitingFeedback} awaiting your feedback` : `${iv.data?.thisWeek ?? 0} this week`} href="/recruiter/interviews" />
        <StatCard label="Client companies" value={String(d.totals.approvedCompanies)} icon={Building2} hint={d.totals.pendingCompanies ? `${d.totals.pendingCompanies} awaiting approval` : "All approved"} />
        <StatCard label="Candidates in progress" value={String(d.candidates.approved + d.candidates.interview + d.candidates.selected)} icon={Users} hint={`${d.candidates.placed} placed`} href="/recruiter/candidates" />
      </div>
      {!!((pay.data?.AWAITING_CLIENT ?? 0) + (pay.data?.DISPUTED ?? 0)) && (
        <Link href="/recruiter/payments" className="mt-4 flex items-center gap-3 rounded-[14px] border border-gold/40 bg-gold-soft px-4 py-3 text-sm transition-colors hover:bg-gold-soft/70">
          <Wallet className="size-5 text-gold" /><span className="flex-1"><span className="font-medium">{(pay.data?.AWAITING_CLIENT ?? 0) + (pay.data?.DISPUTED ?? 0)} payment{(pay.data?.AWAITING_CLIENT ?? 0) + (pay.data?.DISPUTED ?? 0) > 1 ? "s" : ""} to record.</span>{pay.data?.overdue ? ` ${pay.data.overdue} overdue.` : ""} Pay the amount due, then record it so we can confirm.</span><span className="font-medium text-primary">Open</span>
        </Link>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <AttentionCard label="Contracts in progress" value={String(ct.data?.pendingTotal ?? 0)} icon={FileClock} hint="Drafts and waiting for approval" href="/recruiter/contracts" />
        <StatCard label="Active contracts" value={String((ct.data?.ACTIVE ?? 0) + (ct.data?.EXPIRING ?? 0))} icon={FileSignature} href="/recruiter/contracts" />
        <StatCard label="Ending soon" value={String(ct.data?.expiringSoon ?? 0)} icon={FileWarning} hint="Within 30 days" href="/recruiter/contracts" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Candidates for review" />
          <CardBody>
            {d.candidates.needsDecision ? <div className="text-center"><p className="text-3xl font-semibold tabular-nums">{d.candidates.needsDecision}</p><p className="mt-1 text-sm text-foreground-2">candidate{d.candidates.needsDecision > 1 ? "s are" : " is"} waiting for your decision.</p><Button asChild className="mt-4"><Link href="/recruiter/candidates">Review candidates</Link></Button></div>
              : <EmptyState icon={Inbox} title="No candidates are waiting for you" description="Our team screens every applicant first and sends only the best matches here for your decision." />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Your client companies" description="Companies you can post openings for" />
          <CardBody>
            {d.companies.length === 0 ? (
              <EmptyState icon={Building2} title="No companies yet" description="Add the companies you recruit for. Our team approves each one before you can post openings." action={<Button asChild><Link href="/recruiter/companies">Add a company</Link></Button>} />
            ) : (
              <ul className="divide-y divide-divider">
                {d.companies.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-background-2 text-secondary-green"><Building2 className="size-4" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.name}</p><p className="truncate text-xs text-muted">{[c.industry, c.location].filter(Boolean).join(" · ")}</p></div>
                    <StatusBadge status={c.approvalStatus} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Hiring pipeline" />
        <CardBody>
          <Stepper steps={["Received", "Reviewing", "Approved", "Interview", "Selected", "Hired"]} current={d.candidates.placed ? 5 : d.candidates.selected ? 4 : d.candidates.interview ? 3 : d.candidates.approved ? 2 : d.candidates.needsDecision ? 1 : 0} />
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">{([["Deciding", d.candidates.needsDecision], ["Approved", d.candidates.approved], ["Interview", d.candidates.interview], ["Selected", d.candidates.selected], ["Placed", d.candidates.placed]] as const).map(([l, n]) => <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="text-xl font-semibold tabular-nums">{n}</dd></div>)}</dl>
        </CardBody>
      </Card>
    </>
  );
}
