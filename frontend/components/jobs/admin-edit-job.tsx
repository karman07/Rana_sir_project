"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Lock } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Job, JobRequest } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { JobRequestForm } from "./job-request-form";

/** Admin edits an opening at any point before it closes: while it waits for review, once approved, or while it is live. */
export function AdminEditJob({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["job-request", id, "edit"], queryFn: () => api<JobRequest>(`/job-requests/${id}`), staleTime: 0 });
  const job = useQuery({ queryKey: ["job", q.data?.jobId], queryFn: () => api<Job>(`/jobs/${q.data!.jobId}`), enabled: !!q.data?.jobId });
  if (q.isPending || (q.data?.jobId && job.isPending)) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-[16px]" />;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const r = q.data;
  const editable = r.status === "PENDING_ADMIN_REVIEW" || (r.status === "APPROVED" && (job.data?.status === "APPROVED" || job.data?.status === "PUBLISHED"));
  if (!editable) {
    return <EmptyState icon={Lock} title="This opening can't be edited here" description="It has been closed, or the request hasn't been decided in a way that allows edits."
      action={<Button asChild><Link href={`/admin/job-requests/${id}`}>Back to the opening</Link></Button>} />;
  }
  // The form edits the job itself once it is approved, and the request while it waits.
  const initial = job.data ? { ...r, spec: job.data.spec } : r;
  return (
    <>
      <PageHeader title="Edit opening" description={`${r.requestNumber} · ${r.spec?.title ?? ""}. Change anything. Candidates see the update straight away if it is live.`} />
      <JobRequestForm initial={initial} admin={{ jobId: r.status === "APPROVED" ? r.jobId : undefined }} />
    </>
  );
}
