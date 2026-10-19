"use client";

import { useAuthDialog } from "@/components/auth/auth-dialog";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Building2, MapPin, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { timeAgo } from "@/lib/applications";
import { EMPLOYMENT_LABEL, WORK_MODE_LABEL } from "@/lib/jobs";
import { applyHref, salaryLabel, type CandidateJob } from "@/components/candidate/job-card";
import { SpecView } from "@/components/jobs/spec-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompanyMark } from "@/components/ui/company-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/feedback/error-state";

export function PublicJobDetail({ id }: { id: string }) {
  const { user } = useSession();
  const q = useQuery({ queryKey: ["public", "job", id], queryFn: () => api<CandidateJob>(`/public/jobs/${id}`) });

  if (q.isPending) return <div className="mx-auto max-w-4xl space-y-4 px-5 py-10"><Skeleton className="h-8 w-32" /><Skeleton className="h-44 rounded-[16px]" /><Skeleton className="h-72 rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const j = q.data, s = j.spec, salary = salaryLabel(s);
  const auth = useAuthDialog();
  const canApply = !user || user.role === "CANDIDATE";

  const apply = canApply ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {user ? <Button asChild size="lg"><Link href={applyHref(id, user.role)}>Apply now</Link></Button> : <Button size="lg" onClick={() => auth.open({ mode: "signin", next: `/candidate/jobs/${id}/apply` })}>Apply now</Button>}
      {!user && <Button size="lg" variant="secondary" onClick={() => auth.open({ mode: "signup", next: `/candidate/jobs/${id}/apply` })}>Create an account</Button>}
    </div>
  ) : <p className="text-sm text-foreground-2">You&apos;re signed in as {user!.role.toLowerCase()}. Sign in as a candidate to apply.</p>;

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2"><Link href="/jobs"><ArrowLeft />All jobs</Link></Button>
      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <CompanyMark name={j.company.name} logoUrl={j.company.logoUrl} className="size-16 rounded-2xl text-xl" />
          <div className="min-w-0">
            <p className="text-sm text-foreground-2">{j.company.name}</p>
            <h1 className="text-[clamp(1.5rem,3vw,2.1rem)] font-semibold leading-tight tracking-[-0.02em]">{s.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground-2">
              <span className="flex items-center gap-1.5"><MapPin className="size-4 text-muted" />{s.location}{s.workMode ? ` · ${WORK_MODE_LABEL[s.workMode]}` : ""}</span>
              {s.employmentType && <span className="flex items-center gap-1.5"><Briefcase className="size-4 text-muted" />{EMPLOYMENT_LABEL[s.employmentType]}</span>}
              {s.department && <span className="flex items-center gap-1.5"><Building2 className="size-4 text-muted" />{s.department}</span>}
              {s.openings ? <span className="flex items-center gap-1.5"><Users className="size-4 text-muted" />{s.openings} opening{s.openings > 1 ? "s" : ""}</span> : null}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-6">
          <div>
            {salary && <p className="text-xl font-semibold tabular-nums">{salary}</p>}
            <p className="text-xs text-muted">{j.jobNumber} · Posted {timeAgo(j.publishedAt)}</p>
          </div>
          {apply}
        </div>
      </Card>
      <div className="mt-6"><SpecView spec={s} internal={false} /></div>
      <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
        <div><p className="font-semibold tracking-tight">Interested in this role?</p><p className="text-sm text-foreground-2">Apply in a few minutes. We&apos;ll keep you updated at every step.</p></div>
        {apply}
      </Card>
    </div>
  );
}
