"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Clock3, FileSignature, Inbox, ThumbsUp, UserCheck, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/payments";
import { PERIOD_LABEL, num, pctText, type BucketKind, type PeriodKey, type SeriesPoint } from "@/lib/reports";
import { Funnel } from "@/components/dashboard/funnel";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { RankedBars, TimeChart, VIZ } from "./charts";
import { ExportButton } from "./export-button";
import { PeriodSwitch } from "./period-switch";

const STATUS = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const Loading = () => <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[16px]" />)}</div><Skeleton className="h-72 w-full rounded-[16px]" /></div>;

interface RecruiterReport { bucket: BucketKind; funnel: { key: string; count: number }[]; series: SeriesPoint[]; kpis: { received: number; decided: number; approved: number; approvalRate: number | null; daysToDecide: number | null; selected: number; hired: number };
  jobs: { jobId: string; title: string; jobNumber: string; applications: number; sent: number; selected: number }[]; payments: { currency: string; due: number; paid: number }[] }

export function RecruiterAnalytics() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const q = useQuery({ queryKey: ["report", "recruiter", period], queryFn: () => api<RecruiterReport>(`/analytics/recruiter/report?period=${period}`) });
  const d = q.data, k = d?.kpis;
  return (
    <>
      <PageHeader title="Analytics" description={`How your hiring is going over ${PERIOD_LABEL[period]}.`} actions={<ExportButton dataset="applications" period={period} label="Export candidates" />} />
      <div className="mb-5 flex justify-end"><PeriodSwitch value={period} onChange={setPeriod} /></div>
      {!d || !k ? <Loading /> : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Candidates received" value={num(k.received)} icon={Inbox} hint={`${num(k.decided)} decided`} />
            <StatCard label="Approval rate" value={pctText(k.approvalRate)} icon={ThumbsUp} hint={`${num(k.approved)} approved`} />
            <StatCard label="Time to decide" value={k.daysToDecide === null ? "—" : `${num(k.daysToDecide, 1)} days`} icon={Clock3} hint="Median, from receiving to approving" />
            <StatCard label="Selected" value={num(k.selected)} icon={UserCheck} hint={`${num(k.hired)} placed`} />
          </div>
          <TimeChart title="Applications and selections" description="For your openings" data={d.series} bucket={d.bucket} kind="line" series={[{ key: "applications", label: "Applications", color: VIZ[0] }, { key: "selected", label: "Selected", color: VIZ[1] }]} />
          <div className="grid gap-5 xl:grid-cols-2">
            <Card><CardHeader title="Your funnel" description="Candidates sent to you, by how far they got" /><CardBody><Funnel stages={d.funnel} /></CardBody></Card>
            <RankedBars title="Your openings" description="By applications" rows={d.jobs.map((j) => ({ label: j.title ?? "Untitled", sub: `${j.jobNumber} · ${j.sent} sent · ${j.selected} selected`, value: j.applications }))} />
          </div>
          {d.payments.length > 0 && (
            <Card>
              <CardHeader title="Payments" description="What your companies owe and have paid" />
              <CardBody><ul className="grid gap-4 sm:grid-cols-2">{d.payments.map((p) => (
                <li key={p.currency} className="rounded-xl bg-background-2 px-4 py-3"><p className="flex items-center gap-2 text-xs text-muted"><Wallet className="size-3.5" />{p.currency}</p><p className="mt-1 text-sm">To pay <span className="font-semibold tabular-nums">{money(p.due, p.currency)}</span></p><p className="text-sm text-foreground-2">Paid <span className="tabular-nums">{money(p.paid, p.currency)}</span></p></li>
              ))}</ul></CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

interface CandidateReport { bucket: BucketKind; series: SeriesPoint[]; byStatus: { status: string; count: number }[]; kpis: { applications: number; interviews: number; completedInterviews: number; daysToFirstResponse: number | null; activeContracts: number };
  earnings: { currency: string; total: number; months: { bucket: string; net: number }[] }[]; upcoming: { currency: string; amount: number; count: number }[] }

export function CandidateAnalytics() {
  const [period, setPeriod] = useState<PeriodKey>("90d");
  const q = useQuery({ queryKey: ["report", "candidate", period], queryFn: () => api<CandidateReport>(`/analytics/candidate/report?period=${period}`) });
  const d = q.data, k = d?.kpis;
  return (
    <>
      <PageHeader title="Your activity" description={`Your applications and pay over ${PERIOD_LABEL[period]}.`} actions={<ExportButton dataset="applications" period={period} label="Export applications" />} />
      <div className="mb-5 flex justify-end"><PeriodSwitch value={period} onChange={setPeriod} /></div>
      {!d || !k ? <Loading /> : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Applications" value={num(k.applications)} icon={Users} />
            <StatCard label="Interviews" value={num(k.interviews)} icon={CalendarCheck} hint={`${k.completedInterviews} completed`} />
            <StatCard label="First reply" value={k.daysToFirstResponse === null ? "—" : `${num(k.daysToFirstResponse, 1)} days`} icon={Clock3} hint="Median, after you apply" />
            <StatCard label="Active contracts" value={num(k.activeContracts)} icon={FileSignature} />
          </div>
          <TimeChart title="Your applications" data={d.series} bucket={d.bucket} kind="line" series={[{ key: "applications", label: "Applications", color: VIZ[0] }]} />
          <div className="grid gap-5 xl:grid-cols-2">
            <RankedBars title="Where your applications stand" rows={d.byStatus.map((s) => ({ label: STATUS(s.status), value: s.count }))} empty="Apply to a job to see your progress here." />
            {d.upcoming.length > 0 ? (
              <Card><CardHeader title="Pay on its way" description="Upcoming and being processed" /><CardBody><ul className="space-y-2">{d.upcoming.map((u) => <li key={u.currency} className="flex items-baseline justify-between text-sm"><span className="text-foreground-2">{u.count} period{u.count === 1 ? "" : "s"}</span><span className="text-xl font-semibold tabular-nums">{money(u.amount, u.currency)}</span></li>)}</ul></CardBody></Card>
            ) : <RankedBars title="Pay on its way" rows={[]} empty="Nothing upcoming right now." />}
          </div>
          {d.earnings.map((e) => (
            <TimeChart key={e.currency} title={`What you were paid (${e.currency})`} description={`${money(e.total, e.currency)} in total`} bucket="month" kind="bar" height={220} fmt={(n) => money(n, e.currency)} axisFmt={(n) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n / 100)}
              data={e.months.map((m) => ({ bucket: m.bucket, net: m.net }))} series={[{ key: "net", label: "Net pay", color: VIZ[0] }]} />
          ))}
        </div>
      )}
    </>
  );
}
