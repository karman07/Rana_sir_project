"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, BriefcaseBusiness, CalendarCheck, Clock3, HandCoins, Landmark, TriangleAlert, UserCheck, Users, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/payments";
import { PERIOD_LABEL, STAGE_LABEL, num, pctText, type BucketKind, type PeriodKey, type SeriesPoint } from "@/lib/reports";
import { Funnel } from "@/components/dashboard/funnel";
import { StatCard } from "@/components/data/stat-card";
import { DataTable } from "@/components/data/data-table";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";
import { RankedBars, TimeChart, VIZ } from "./charts";
import { ExportButton } from "./export-button";
import { PeriodSwitch } from "./period-switch";

const TABS = [{ key: "recruitment", label: "Recruitment" }, { key: "financial", label: "Financial" }, { key: "recruiters", label: "Recruiters" }, { key: "candidates", label: "Candidates" }] as const;
type Tab = (typeof TABS)[number]["key"];

const STATUS = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

interface Recruitment { bucket: BucketKind; funnel: { key: string; count: number }[]; series: SeriesPoint[]; kpis: { applications: number; shortlisted: number; interviews: number; selected: number; hired: number; rejected: number; applicationToSelected: number | null; daysToSelect: number | null };
  byStatus: { status: string; count: number }[]; topJobs: { jobId: string; title: string; jobNumber: string; company?: string; applications: number; selected: number }[]; interviews: { scheduled: number; completed: number; cancelled: number; noShow: number } }
interface Financial { currency: string | null; currencies: string[]; series: SeriesPoint[]; kpis: { billed: number; commission: number; paidOut: number; awaiting: number; owedToCandidates: number; disputed: number; overdueCount: number; overdueAmount: number } | null;
  performance: { paidPayments: number; onTimeRate: number | null; avgDaysLate: number | null } | null; byStatus: { status: string; count: number; gross: number }[]; contracts: { active: number; expiringSoon: number } }
interface RecruiterRow { recruiterId: string; name: string; agency?: string; sent: number; approved: number; approvalRate: number | null; returned: number; selected: number; hired: number; daysToDecide: number | null; liveJobs: number; activeContracts: number; overduePayments: number }
interface Candidates { bucket: BucketKind; series: SeriesPoint[]; kpis: { total: number; active: number; verifiedRate: number | null; newInPeriod: number; applyingCandidates: number; avgApplications: number | null }; topSkills: { skill: string; count: number }[]; countries: { country: string; count: number }[] }

function Loading() { return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[16px]" />)}</div><Skeleton className="h-72 w-full rounded-[16px]" /></div>; }

function RecruitmentTab({ period }: { period: PeriodKey }) {
  const q = useQuery({ queryKey: ["report", "admin", "recruitment", period], queryFn: () => api<Recruitment>(`/analytics/admin/recruitment?period=${period}`) });
  if (!q.data) return <Loading />;
  const d = q.data, k = d.kpis;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Applications" value={num(k.applications)} icon={Users} hint={`${num(k.shortlisted)} shortlisted`} />
        <StatCard label="Selected" value={num(k.selected)} icon={UserCheck} hint={`${pctText(k.applicationToSelected)} of applications`} />
        <StatCard label="Time to select" value={k.daysToSelect === null ? "—" : `${num(k.daysToSelect, 1)} days`} icon={Clock3} hint="Median, apply to selected" />
        <StatCard label="Interviews" value={num(k.interviews)} icon={CalendarCheck} hint={`${d.interviews.completed} completed · ${d.interviews.noShow} no-shows`} />
      </div>
      <TimeChart title="Applications and selections" description="Applications by when they came in; selections by when the candidate was selected" data={d.series} bucket={d.bucket} kind="line"
        series={[{ key: "applications", label: "Applications", color: VIZ[0] }, { key: "selected", label: "Selected", color: VIZ[1] }]} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader title="Recruitment funnel" description="Applications that ever reached each stage" /><CardBody><Funnel stages={d.funnel.filter((f) => f.key !== "screening")} /></CardBody></Card>
        <RankedBars title="Where applications stand now" rows={d.byStatus.map((s) => ({ label: STATUS(s.status), value: s.count }))} />
      </div>
      <RankedBars title="Busiest jobs" description="Most applications in this period" rows={d.topJobs.map((j) => ({ label: j.title ?? "Untitled", sub: `${j.jobNumber} · ${j.company ?? ""}`, value: j.applications }))} />
    </div>
  );
}

function FinancialTab({ period }: { period: PeriodKey }) {
  const [currency, setCurrency] = useState<string>();
  const q = useQuery({ queryKey: ["report", "admin", "financial", period, currency], queryFn: () => api<Financial>(`/analytics/admin/financial?period=${period}${currency ? `&currency=${currency}` : ""}`) });
  if (!q.data) return <Loading />;
  const d = q.data, k = d.kpis, cur = d.currency ?? "USD";
  if (!k) return <Card><CardBody className="py-10 text-center text-sm text-muted">No payments yet. Money figures appear once contracts start billing.</CardBody></Card>;
  const m = (n: number) => money(n, cur);
  const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n / 100);
  return (
    <div className="space-y-5">
      {d.currencies.length > 1 && (
        <div className="flex items-center gap-2 text-sm"><label htmlFor="cur" className="text-foreground-2">Currency</label><Select id="cur" value={cur} onChange={(e) => setCurrency(e.target.value)} className="w-28">{d.currencies.map((c) => <option key={c}>{c}</option>)}</Select><span className="text-xs text-muted">Amounts are never added across currencies.</span></div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Commission earned" value={m(k.commission)} icon={HandCoins} hint="From confirmed payments" />
        <StatCard label="Billed" value={m(k.billed)} icon={Banknote} hint={`${m(k.awaiting)} still to come in`} />
        <StatCard label="Paid to candidates" value={m(k.paidOut)} icon={Landmark} hint={k.owedToCandidates ? `${m(k.owedToCandidates)} owed` : "Nothing owed"} />
        <StatCard label="Overdue" value={String(k.overdueCount)} icon={TriangleAlert} hint={k.overdueCount ? `${m(k.overdueAmount)} past due` : "Nothing late"} />
      </div>
      <TimeChart title="Money by month" description={`Billed, commission earned and paid out (${cur})`} data={d.series} bucket="month" kind="bar" height={260} fmt={(n) => money(n, cur)} axisFmt={compact}
        series={[{ key: "billed", label: "Billed", color: VIZ[0] }, { key: "commission", label: "Commission", color: VIZ[1] }, { key: "paidOut", label: "Paid out", color: VIZ[2] }]} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="How companies pay" description="Payments the company has recorded" />
          <CardBody>
            {d.performance ? (
              <dl className="grid grid-cols-3 gap-4 text-center">
                <div><dt className="text-xs text-muted">On time</dt><dd className="text-2xl font-semibold tabular-nums">{pctText(d.performance.onTimeRate)}</dd></div>
                <div><dt className="text-xs text-muted">Average days late</dt><dd className="text-2xl font-semibold tabular-nums">{num(d.performance.avgDaysLate, 1)}</dd></div>
                <div><dt className="text-xs text-muted">Payments paid</dt><dd className="text-2xl font-semibold tabular-nums">{d.performance.paidPayments}</dd></div>
              </dl>
            ) : <p className="text-sm text-muted">No company has recorded a payment yet.</p>}
            <p className="mt-4 text-sm text-foreground-2">{d.contracts.active} active contract{d.contracts.active === 1 ? "" : "s"}{d.contracts.expiringSoon ? ` · ${d.contracts.expiringSoon} ending soon` : ""}</p>
          </CardBody>
        </Card>
        <RankedBars title="Payments by stage" rows={d.byStatus.sort((a, b) => b.count - a.count).map((s) => ({ label: STATUS(s.status), sub: m(s.gross), value: s.count }))} />
      </div>
    </div>
  );
}

function RecruitersTab({ period }: { period: PeriodKey }) {
  const q = useQuery({ queryKey: ["report", "admin", "recruiters", period], queryFn: () => api<{ rows: RecruiterRow[] }>(`/analytics/admin/recruiters?period=${period}`) });
  const columns = useMemo<ColumnDef<RecruiterRow, unknown>[]>(() => [
    { accessorKey: "name", header: "Recruiter", cell: ({ row: { original: r } }) => <div className="min-w-0"><p className="truncate font-medium">{r.name}</p><p className="truncate text-xs text-muted">{r.agency}</p></div> },
    { accessorKey: "sent", header: "Candidates sent" },
    { accessorKey: "approved", header: "Approved" },
    { accessorKey: "approvalRate", header: "Approval rate", cell: ({ getValue }) => <span className="tabular-nums">{pctText(getValue() as number | null)}</span> },
    { accessorKey: "daysToDecide", header: "Days to decide", cell: ({ getValue }) => <span className="tabular-nums">{num(getValue() as number | null, 1)}</span> },
    { accessorKey: "selected", header: "Selected" },
    { accessorKey: "hired", header: "Placed" },
    { accessorKey: "liveJobs", header: "Live jobs" },
    { accessorKey: "activeContracts", header: "Active contracts" },
    { accessorKey: "overduePayments", header: "Overdue payments", cell: ({ getValue }) => <span className={cn("tabular-nums", (getValue() as number) > 0 && "font-medium text-danger")}>{getValue() as number}</span> },
  ], []);
  return <DataTable data={q.data?.rows ?? []} columns={columns} loading={q.isPending} exportName="recruiter-performance" searchPlaceholder="Search recruiters…" empty={{ title: "No recruiter activity", description: "Recruiters appear here once candidates have been sent to them." }} />;
}

function CandidatesTab({ period }: { period: PeriodKey }) {
  const q = useQuery({ queryKey: ["report", "admin", "candidates", period], queryFn: () => api<Candidates>(`/analytics/admin/candidates?period=${period}`) });
  if (!q.data) return <Loading />;
  const d = q.data, k = d.kpis;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Candidates" value={num(k.total)} icon={UsersRound} hint={`${num(k.active)} active`} />
        <StatCard label="New in period" value={num(k.newInPeriod)} icon={Users} />
        <StatCard label="Applying" value={num(k.applyingCandidates)} icon={BriefcaseBusiness} hint={`${num(k.avgApplications, 1)} applications each`} />
        <StatCard label="Email verified" value={pctText(k.verifiedRate)} icon={UserCheck} />
      </div>
      <TimeChart title="New candidates" description={`Sign-ups, ${PERIOD_LABEL[period]}`} data={d.series} bucket={d.bucket} kind="line" series={[{ key: "candidates", label: "Candidates", color: VIZ[0] }]} />
      <div className="grid gap-5 xl:grid-cols-2">
        <RankedBars title="Most common skills" rows={d.topSkills.map((s) => ({ label: s.skill, value: s.count }))} empty="Skills appear as candidates complete their profiles." />
        <RankedBars title="Where candidates are" rows={d.countries.map((c) => ({ label: c.country, value: c.count }))} />
      </div>
    </div>
  );
}

export function AdminAnalytics() {
  const [tab, setTab] = useState<Tab>("recruitment");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const dataset = tab === "financial" ? "payments" : tab === "candidates" ? "candidates" : "applications";
  return (
    <>
      <PageHeader title="Analytics" description={`How the business is doing over ${PERIOD_LABEL[period]}.`} actions={<ExportButton dataset={dataset} period={period} label="Export data" />} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:text-foreground")}>{t.label}</button>)}
        </div>
        <PeriodSwitch value={period} onChange={setPeriod} />
      </div>
      {tab === "recruitment" && <RecruitmentTab period={period} />}
      {tab === "financial" && <FinancialTab period={period} />}
      {tab === "recruiters" && <RecruitersTab period={period} />}
      {tab === "candidates" && <CandidatesTab period={period} />}
    </>
  );
}
