"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, BookmarkCheck, Briefcase, Building2, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/applications";
import { EMPLOYMENT_LABEL, WORK_MODE_LABEL } from "@/lib/jobs";
import { SpecView } from "@/components/jobs/spec-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompanyMark } from "@/components/ui/company-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";
import { salaryLabel, type CandidateJob } from "./job-card";

export function CandidateJobDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["job", id], queryFn: () => api<CandidateJob>(`/jobs/${id}`) });
  const save = useMutation({
    mutationFn: (saved: boolean) => api(`/candidates/me/saved-jobs/${id}`, { method: saved ? "DELETE" : "PUT" }),
    onSuccess: (_r, saved) => { toast.success(saved ? "Removed from saved jobs" : "Job saved"); qc.invalidateQueries({ queryKey: ["job", id] }); qc.invalidateQueries({ queryKey: ["jobs", "candidate"] }); },
    onError: () => toast.error("Couldn't update your saved jobs"),
  });

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full rounded-[16px]" /><Skeleton className="h-72 w-full rounded-[16px]" /></div>;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const j = q.data, s = j.spec;
  const salary = salaryLabel(s);

  const cta = j.application ? (
    <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto"><Link href={`/candidate/applications/${j.application.id}`}>View your application</Link></Button>
  ) : (
    <Button asChild size="lg" className="w-full sm:w-auto"><Link href={`/candidate/jobs/${id}/apply`}>Apply now</Link></Button>
  );

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2"><Link href="/candidate/jobs"><ArrowLeft />All jobs</Link></Button>
      <Card className="p-6">
        <div className="flex flex-wrap items-start gap-4">
          <CompanyMark name={j.company.name} logoUrl={j.company.logoUrl} className="size-16 rounded-2xl text-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground-2">{j.company.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground-2">
              <span className="flex items-center gap-1.5"><MapPin className="size-4 text-muted" />{s.location}{s.workMode ? ` · ${WORK_MODE_LABEL[s.workMode]}` : ""}</span>
              {s.employmentType && <span className="flex items-center gap-1.5"><Briefcase className="size-4 text-muted" />{EMPLOYMENT_LABEL[s.employmentType]}</span>}
              {s.department && <span className="flex items-center gap-1.5"><Building2 className="size-4 text-muted" />{s.department}</span>}
              {s.openings ? <span className="flex items-center gap-1.5"><Users className="size-4 text-muted" />{s.openings} opening{s.openings > 1 ? "s" : ""}</span> : null}
            </div>
          </div>
          <button onClick={() => save.mutate(!!j.saved)} disabled={save.isPending} aria-pressed={!!j.saved} aria-label={j.saved ? "Remove from saved jobs" : "Save job"}
            className={cn("rounded-lg border border-border p-2.5 hover:bg-background-2", j.saved ? "text-gold" : "text-muted")}>
            {j.saved ? <BookmarkCheck className="size-5" /> : <Bookmark className="size-5" />}
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-5">
          <div>
            {salary && <p className="text-lg font-semibold tabular-nums">{salary}</p>}
            <p className="text-xs text-muted">{j.jobNumber} · Posted {timeAgo(j.publishedAt)}</p>
          </div>
          <div className="hidden items-center gap-3 sm:flex">{j.application && <StatusBadge status={j.application.status} />}{cta}</div>
        </div>
      </Card>

      <div className="mt-6 pb-24 sm:pb-0"><SpecView spec={s} internal={false} /></div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur sm:hidden" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>{cta}</div>
    </>
  );
}
