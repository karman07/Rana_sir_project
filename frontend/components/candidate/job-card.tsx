"use client";

import { useAuthDialog } from "@/components/auth/auth-dialog";
import Link from "next/link";
import { useSession } from "@/lib/auth";
import { Bookmark, BookmarkCheck, Briefcase, Clock, MapPin, Users } from "lucide-react";
import { formatMoney } from "@rms/shared";
import { timeAgo } from "@/lib/applications";
import { EMPLOYMENT_LABEL, WORK_MODE_LABEL, payLabel, type Job } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CompanyMark } from "@/components/ui/company-mark";
import { cn } from "@/lib/utils";

export type CandidateJob = Job & { saved?: boolean; application?: { id: string; status: string } | null };

export function salaryLabel(spec: CandidateJob["spec"]) {
  return payLabel(spec.compensation, formatMoney);
}

/** Where a visitor should go to apply: straight to the form if they are a candidate, otherwise sign in first. */
export function applyHref(jobId: string, role?: string) {
  const target = `/candidate/jobs/${jobId}/apply`;
  return role === "CANDIDATE" ? target : `/login?next=${encodeURIComponent(target)}`;
}

export function JobCard({ job, onToggleSave, saving, publicMode }: { job: CandidateJob; onToggleSave?: (job: CandidateJob) => void; saving?: boolean; publicMode?: boolean }) {
  const { user } = useSession();
  const auth = useAuthDialog();
  const detail = publicMode ? `/jobs/${job.id}` : `/candidate/jobs/${job.id}`;
  const s = job.spec, q = s.requirements;
  const salary = salaryLabel(s);
  const exp = q?.experienceMin !== undefined ? `${q.experienceMin}${q.experienceMax !== undefined ? `–${q.experienceMax}` : "+"} yrs` : null;
  return (
    <Card className="p-5 transition-colors hover:border-secondary-green/40">
      <div className="flex items-start gap-4">
        <CompanyMark name={job.company.name} logoUrl={job.company.logoUrl} className="size-12 text-sm" />
        <div className="min-w-0 flex-1">
          <Link href={detail} className="block truncate text-[16px] font-semibold tracking-tight hover:text-primary">{s.title}</Link>
          <p className="truncate text-sm text-foreground-2">{job.company.name}</p>
        </div>
        {onToggleSave && <button onClick={() => onToggleSave(job)} disabled={saving} aria-pressed={!!job.saved} aria-label={job.saved ? "Remove from saved jobs" : "Save job"}
          className={cn("rounded-lg p-2 transition-colors hover:bg-background-2", job.saved ? "text-gold" : "text-muted")}>
          {job.saved ? <BookmarkCheck className="size-5" /> : <Bookmark className="size-5" />}
        </button>}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground-2">
        <span className="flex items-center gap-1.5"><MapPin className="size-4 text-muted" />{s.location}{s.workMode ? ` · ${WORK_MODE_LABEL[s.workMode]}` : ""}</span>
        {s.employmentType && <span className="flex items-center gap-1.5"><Briefcase className="size-4 text-muted" />{EMPLOYMENT_LABEL[s.employmentType]}</span>}
        {exp && <span className="flex items-center gap-1.5"><Clock className="size-4 text-muted" />{exp}</span>}
        {s.openings ? <span className="flex items-center gap-1.5"><Users className="size-4 text-muted" />{s.openings} opening{s.openings > 1 ? "s" : ""}</span> : null}
      </div>

      {q?.technicalSkills?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">{q.technicalSkills.slice(0, 5).map((t) => <span key={t} className="rounded-md bg-background-2 px-2 py-0.5 text-xs">{t}</span>)}</div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
        <div>
          {salary && <p className="font-semibold tabular-nums text-foreground">{salary}</p>}
          <p className="text-xs text-muted">Posted {timeAgo(job.publishedAt)}</p>
        </div>
        {job.application ? (
          <Button asChild variant="secondary" size="sm"><Link href={`/candidate/applications/${job.application.id}`}>Applied <StatusBadge status={job.application.status} className="ml-1 py-0" /></Link></Button>
        ) : (
          publicMode && !user
            ? <Button size="sm" onClick={() => auth.open({ mode: "signin", next: `/candidate/jobs/${job.id}/apply` })}>Apply</Button>
            : <Button asChild size="sm"><Link href={publicMode ? applyHref(job.id, user?.role) : `/candidate/jobs/${job.id}/apply`}>Apply</Link></Button>
        )}
      </div>
    </Card>
  );
}
