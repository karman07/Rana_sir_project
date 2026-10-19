"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, FileSignature, MailWarning, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, apiList, apiPost } from "@/lib/api";
import { CANDIDATE_STATUS, TERMINAL, timeAgo, type ApplicationListItem } from "@/lib/applications";
import { Journey } from "@/components/candidate/journey";
import { InterviewCard } from "@/components/interviews/candidate-interviews";
import type { InterviewItem } from "@/lib/interviews";
import { useSession } from "@/lib/auth";
import { Stepper } from "@/components/data/stepper";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { DashboardError, DashboardSkeleton, greeting } from "./dashboard-states";

interface Overview { emailVerified: boolean; profile: { percent: number; missing: string[] } }

export function CandidateDashboard() {
  const { user } = useSession();
  const q = useQuery({ queryKey: ["overview", "candidate"], queryFn: () => api<Overview>("/analytics/candidate/overview") });
  const apps = useQuery({ queryKey: ["applications", "candidate", "recent"], queryFn: () => apiList<ApplicationListItem>("/applications?limit=20&sort=-updatedAt") });
  const ct = useQuery({ queryKey: ["contracts", "counts"], queryFn: () => api<{ pendingTotal: number }>("/contracts/counts") });
  const pay = useQuery({ queryKey: ["payments", "counts"], queryFn: () => api<{ PAYOUT_SENT?: number }>("/payments/counts") });
  const delayed = useQuery({ queryKey: ["salaries", "delayed"], queryFn: () => apiList<{ id: string; period: string; payDate: string }>("/salaries?statuses=DELAYED&limit=1&sort=payDate") });
  const next = useQuery({ queryKey: ["interviews", "next"], queryFn: () => apiList<InterviewItem>("/interviews?upcoming=true&limit=1") });
  const resend = useMutation({ mutationFn: () => apiPost("/auth/resend-verification"), onSuccess: () => toast.success("Verification email sent") });

  const header = <PageHeader title={`${greeting()}, ${user?.name.split(" ")[0] ?? ""}`} description="Where you stand and what happens next." />;
  if (q.isPending) return <>{header}<DashboardSkeleton /></>;
  if (q.isError) return <>{header}<DashboardError error={q.error} onRetry={() => q.refetch()} /></>;
  const d = q.data;

  return (
    <>
      {header}
      {!d.emailVerified && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold-soft px-4 py-3 text-sm">
          <MailWarning className="size-4 shrink-0 text-gold" />
          <span className="flex-1">Verify your email so we can reach you about interviews and offers.</span>
          <Button size="sm" variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>Resend email</Button>
        </div>
      )}

      {delayed.data?.items[0] && (
        <Link href={`/candidate/salary/${delayed.data.items[0].id}`} className="mb-6 flex items-center gap-3 rounded-[14px] border border-gold/40 bg-gold-soft px-4 py-3 text-sm transition-colors hover:bg-gold-soft/70">
          <Wallet className="size-5 text-gold" /><span className="flex-1"><span className="font-medium">Your pay is delayed.</span> It&apos;s now expected on {new Date(`${delayed.data.items[0].payDate}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}. See why.</span><span className="font-medium text-primary">Details</span>
        </Link>
      )}
      {!!pay.data?.PAYOUT_SENT && (
        <Link href="/candidate/payments" className="mb-6 flex items-center gap-3 rounded-[14px] border border-gold/40 bg-gold-soft px-4 py-3 text-sm transition-colors hover:bg-gold-soft/70">
          <Wallet className="size-5 text-gold" /><span className="flex-1"><span className="font-medium">Your pay was sent.</span> Please confirm once it has reached you.</span><span className="font-medium text-primary">Confirm</span>
        </Link>
      )}
      {!!ct.data?.pendingTotal && (
        <Link href="/candidate/contracts" className="mb-6 flex items-center gap-3 rounded-[14px] border border-gold/40 bg-gold-soft px-4 py-3 text-sm transition-colors hover:bg-gold-soft/70">
          <FileSignature className="size-5 text-gold" /><span className="flex-1"><span className="font-medium">A contract is waiting for your answer.</span> Review the terms and accept or ask for changes.</span><span className="font-medium text-primary">Review</span>
        </Link>
      )}
      {next.data?.items[0] && <div className="mb-6"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-gold">Your next interview</p><InterviewCard i={next.data.items[0]} highlight /></div>}
      {(() => {
        const list = apps.data?.items ?? [];
        const latest = list.find((a) => !TERMINAL.includes(a.status)) ?? list[0];
        const active = list.filter((a) => !TERMINAL.includes(a.status)).length;
        if (!latest) {
          return (
            <Card>
              <CardHeader title="Your hiring journey" description="No applications yet — your first step is to apply." />
              <CardBody><Stepper steps={["Applied", "Under review", "Interview", "Selected", "Contract"]} current={0} /></CardBody>
            </Card>
          );
        }
        const st = CANDIDATE_STATUS[latest.status];
        return (
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{active > 1 ? `Latest of ${active} active applications` : "Your application"}</p>
                <h2 className="text-lg font-semibold tracking-tight">{latest.job.title}</h2>
                <p className="text-sm text-foreground-2">{latest.company.name} · applied {timeAgo(latest.createdAt).toLowerCase()}</p>
              </div>
              <Button asChild variant="secondary" size="sm"><Link href={`/candidate/applications/${latest.id}`}>View details</Link></Button>
            </div>
            <Journey status={latest.status} />
            <div className="mt-5 rounded-xl bg-background-2 p-4"><p className="font-medium">{st?.label}</p><p className="mt-0.5 text-sm text-foreground-2">{st?.blurb}</p></div>
            {list.length > 1 && <Link href="/candidate/applications" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">See all {list.length} applications</Link>}
          </Card>
        );
      })()}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile strength" description={`${d.profile.percent}% complete`} />
          <CardBody>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-background-2" role="progressbar" aria-valuenow={d.profile.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${d.profile.percent}%` }} />
            </div>
            {d.profile.missing.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />Your profile is complete.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.profile.missing.map((m) => <li key={m} className="flex items-center gap-2 text-foreground-2"><Circle className="size-3.5 text-muted" />{m}</li>)}
              </ul>
            )}
            <Button asChild variant="secondary" className="mt-4"><Link href="/candidate/profile">Edit profile</Link></Button>
          </CardBody>
        </Card>
        <EmptyState icon={Search} title={(apps.data?.items.length ?? 0) > 0 ? "Looking for more?" : "You haven't applied to anything yet"} description={(apps.data?.items.length ?? 0) > 0 ? "New roles are approved and published regularly." : "Browse approved jobs and apply in a few minutes. You'll see every step of the process here."}
          action={<Button asChild><Link href="/candidate/jobs">Find a job</Link></Button>} />
      </div>
    </>
  );
}
