"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Building2, Check, FileSignature, Mail, MapPin, Phone, ShieldOff, TriangleAlert, UserCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiPost, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/audit";
import { money } from "@/lib/payments";
import { EntityActivity } from "@/components/data/entity-activity";
import { StatCard } from "@/components/data/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CompanyMark } from "@/components/ui/company-mark";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";

interface RecruiterProfileData {
  id: string; user: { name: string; email: string; phone?: string; country?: string; status: string; emailVerified: boolean; createdAt: string; lastLoginAt?: string };
  profile: { agencyName?: string; approvalStatus: string; reviewNote?: string; submittedAt?: string; reviewedAt?: string; createdByAdmin?: string };
  stats: { totalJobs: number; liveJobs: number; candidatesSent: number; selected: number; hired: number; activeContracts: number; overduePayments: number };
  money: { currency: string; billed: number; commission: number }[];
  companies: { id: string; name: string; location?: string; industry?: string; companyStatus: string; linkStatus: string }[];
  jobs: { id: string; requestId: string; jobNumber: string; title: string; status: string; applications: number }[];
}
interface CompanyProfileData {
  id: string; company: { name: string; industry?: string; website?: string; location?: string; country?: string; logoUrl?: string; approvalStatus: string; reviewNote?: string; submittedAt?: string; reviewedAt?: string; createdBy?: string; createdAt: string };
  stats: { jobs: number; liveJobs: number; applications: number; selected: number; hired: number; activeContracts: number; contracts: number };
  money: { currency: string; billed: number; outstanding: number }[];
  recruiters: { id: string; name: string; email: string; linkStatus: string }[];
  jobs: { id: string; jobNumber: string; title: string; status: string; applications: number }[];
}

const Loading = () => <div className="space-y-4"><Skeleton className="h-24 w-full rounded-[16px]" /><div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[16px]" />)}</div></div>;
function Fact({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) { return <span className="flex items-center gap-1.5 text-sm text-foreground-2"><Icon className="size-3.5 text-muted" />{children}</span>; }

export function RecruiterProfile({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["directory", "recruiter", id], queryFn: () => api<RecruiterProfileData>(`/directory/recruiters/${id}`) });
  const act = useMutation({
    mutationFn: ({ action }: { action: string; ok: string }) => apiPost(`/recruiters/${id}/${action}`, {}),
    onSuccess: (_r, v) => { toast.success(v.ok); for (const k of ["directory", "recruiters", "approvals", "audit"]) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action failed"),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const d = q.data, u = d.user, s = d.stats;
  return (
    <>
      <Link href="/admin/recruiters" className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Recruiters</Link>
      <PageHeader title={u.name} description={d.profile.agencyName ?? "Independent recruiter"}
        actions={
          <>
            {d.profile.approvalStatus !== "APPROVED" && <Button onClick={() => act.mutate({ action: "approve", ok: `${u.name} approved` })}><Check />Approve</Button>}
            {u.status === "SUSPENDED"
              ? <Button variant="secondary" onClick={() => act.mutate({ action: "reactivate", ok: `${u.name} reactivated` })}><UserCheck />Reactivate</Button>
              : <ConfirmationDialog destructive title={`Suspend ${u.name}?`} description="They are signed out straight away and can't sign in until reactivated." confirmLabel="Suspend" onConfirm={async () => { await act.mutateAsync({ action: "suspend", ok: `${u.name} suspended` }); }} trigger={<Button variant="secondary"><ShieldOff />Suspend</Button>} />}
          </>
        } />
      <Card className="mb-5"><CardBody className="flex flex-wrap items-center gap-5">
        <Avatar name={u.name} size={56} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={d.profile.approvalStatus} />{u.status === "SUSPENDED" && <StatusBadge status="SUSPENDED" tone="danger" />}{!u.emailVerified && <StatusBadge status="PENDING" label="Email not verified" />}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1"><Fact icon={Mail}>{u.email}</Fact>{u.phone && <Fact icon={Phone}>{u.phone}</Fact>}{u.country && <Fact icon={MapPin}>{u.country}</Fact>}</div>
          <p className="text-xs text-muted">Joined {formatDateTime(u.createdAt)}{u.lastLoginAt ? ` · last signed in ${formatDateTime(u.lastLoginAt)}` : " · hasn't signed in yet"}{d.profile.createdByAdmin ? ` · created by ${d.profile.createdByAdmin}` : ""}</p>
        </div>
      </CardBody></Card>
      {d.profile.reviewNote && d.profile.approvalStatus !== "APPROVED" && <Card className="mb-5 border-gold/40"><CardBody><p className="text-sm font-medium">Review note</p><p className="mt-1 text-sm text-foreground-2">{d.profile.reviewNote}</p></CardBody></Card>}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Live openings" value={String(s.liveJobs)} icon={Briefcase} hint={`${s.totalJobs} in total`} />
        <StatCard label="Candidates sent" value={String(s.candidatesSent)} icon={Users} hint={`${s.selected} selected · ${s.hired} placed`} />
        <StatCard label="Active contracts" value={String(s.activeContracts)} icon={FileSignature} />
        <StatCard label="Overdue payments" value={String(s.overduePayments)} icon={s.overduePayments ? TriangleAlert : Check} hint={s.overduePayments ? "Past their due date" : "None late"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Client companies" />
            <CardBody>
              {d.companies.length === 0 ? <p className="text-sm text-muted">No companies yet.</p> : (
                <ul className="divide-y divide-divider">{d.companies.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <Link href={`/admin/companies/${c.id}`} className="min-w-0 flex-1 hover:text-primary"><span className="block truncate font-medium">{c.name}</span><span className="block truncate text-xs text-muted">{[c.industry, c.location].filter(Boolean).join(" · ")}</span></Link>
                    <StatusBadge status={c.linkStatus} />
                  </li>))}</ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Openings" description="Most recent" />
            <CardBody>
              {d.jobs.length === 0 ? <p className="text-sm text-muted">No openings yet.</p> : (
                <ul className="divide-y divide-divider">{d.jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <Link href={`/admin/job-requests/${j.requestId}`} className="min-w-0 flex-1 hover:text-primary"><span className="block truncate font-medium">{j.title}</span><span className="block text-xs text-muted">{j.jobNumber} · {j.applications} application{j.applications === 1 ? "" : "s"}</span></Link>
                    <StatusBadge status={j.status} />
                  </li>))}</ul>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-5">
          {d.money.length > 0 && (
            <Card>
              <CardHeader title="Money" description="Admin only" />
              <CardBody className="space-y-3">{d.money.map((m) => (
                <div key={m.currency} className="rounded-lg bg-background-2 px-3 py-2.5 text-sm tabular-nums">
                  <p className="mb-1 text-xs text-muted">{m.currency}</p>
                  <p className="flex justify-between"><span className="text-foreground-2">Billed to companies</span>{money(m.billed, m.currency)}</p>
                  <p className="flex justify-between"><span className="text-foreground-2">Commission earned</span><span className="font-medium text-primary">{money(m.commission, m.currency)}</span></p>
                </div>))}</CardBody>
            </Card>
          )}
          <Card><CardHeader title="Review history" /><CardBody><EntityActivity entityType="RecruiterProfile" entityId={d.id} /></CardBody></Card>
        </div>
      </div>
    </>
  );
}

export function CompanyProfile({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["directory", "company", id], queryFn: () => api<CompanyProfileData>(`/directory/companies/${id}`) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const d = q.data, c = d.company, s = d.stats;
  return (
    <>
      <Link href="/admin/companies" className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Companies</Link>
      <PageHeader title={c.name} description={[c.industry, c.location].filter(Boolean).join(" · ") || "Client company"} />
      <Card className="mb-5"><CardBody className="flex flex-wrap items-center gap-5">
        <CompanyMark name={c.name} logoUrl={c.logoUrl} className="size-14 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <StatusBadge status={c.approvalStatus} />
          <div className="flex flex-wrap gap-x-5 gap-y-1">{c.website && <Fact icon={Building2}><a href={c.website} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">{c.website}</a></Fact>}{c.country && <Fact icon={MapPin}>{c.country}</Fact>}</div>
          <p className="text-xs text-muted">Added {formatDateTime(c.createdAt)}{c.createdBy ? ` by ${c.createdBy}` : ""}</p>
        </div>
      </CardBody></Card>
      {c.reviewNote && c.approvalStatus !== "APPROVED" && <Card className="mb-5 border-gold/40"><CardBody><p className="text-sm font-medium">Review note</p><p className="mt-1 text-sm text-foreground-2">{c.reviewNote}</p></CardBody></Card>}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Live openings" value={String(s.liveJobs)} icon={Briefcase} hint={`${s.jobs} in total`} />
        <StatCard label="Applications" value={String(s.applications)} icon={Users} hint={`${s.selected} selected · ${s.hired} placed`} />
        <StatCard label="Active contracts" value={String(s.activeContracts)} icon={FileSignature} hint={`${s.contracts} in total`} />
        <StatCard label="Recruiters" value={String(d.recruiters.length)} icon={UserCheck} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Recruiters" description="Who represents this company" />
            <CardBody>
              {d.recruiters.length === 0 ? <EmptyState icon={UserCheck} title="No recruiters yet" description="A recruiter links to a company, and you approve the link." /> : (
                <ul className="divide-y divide-divider">{d.recruiters.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <Link href={`/admin/recruiters/${r.id}`} className="min-w-0 flex-1 hover:text-primary"><span className="block truncate font-medium">{r.name}</span><span className="block truncate text-xs text-muted">{r.email}</span></Link>
                    <StatusBadge status={r.linkStatus} />
                  </li>))}</ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Openings" description="Most recent" />
            <CardBody>
              {d.jobs.length === 0 ? <p className="text-sm text-muted">No openings yet.</p> : (
                <ul className="divide-y divide-divider">{d.jobs.map((j) => <li key={j.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{j.title}</span><span className="block text-xs text-muted">{j.jobNumber} · {j.applications} application{j.applications === 1 ? "" : "s"}</span></span><StatusBadge status={j.status} /></li>)}</ul>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-5">
          {d.money.length > 0 && (
            <Card><CardHeader title="Billing" description="Admin only" /><CardBody className="space-y-3">{d.money.map((m) => (
              <div key={m.currency} className="rounded-lg bg-background-2 px-3 py-2.5 text-sm tabular-nums">
                <p className="mb-1 text-xs text-muted">{m.currency}</p>
                <p className="flex justify-between"><span className="text-foreground-2">Billed</span>{money(m.billed, m.currency)}</p>
                <p className="flex justify-between"><span className="text-foreground-2">Still to come in</span><span className={m.outstanding ? "font-medium text-gold" : ""}>{money(m.outstanding, m.currency)}</span></p>
              </div>))}</CardBody></Card>
          )}
          <Card><CardHeader title="Activity" /><CardBody><EntityActivity entityType="Company" entityId={d.id} /></CardBody></Card>
        </div>
      </div>
    </>
  );
}
