"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { JobRequest } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { Lock } from "lucide-react";
import { JobRequestForm } from "./job-request-form";

export function EditJobRequest({ id, change }: { id: string; change?: boolean }) {
  const q = useQuery({ queryKey: ["job-request", id], queryFn: () => api<JobRequest>(`/job-requests/${id}`), staleTime: 0 });
  if (q.isPending) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-[16px]" />;
  if (q.isError) return <ErrorState compact variant={q.error instanceof ApiError && q.error.status === 404 ? "not-found" : "server"} onRetry={() => q.refetch()} />;
  const r = q.data;
  if (change ? r.status !== "APPROVED" || !r.jobId : r.status !== "DRAFT" && r.status !== "CHANGES_REQUESTED" && r.status !== "PENDING_ADMIN_REVIEW") {
    return <EmptyState icon={Lock} title="This opening can't be edited right now" description="It has already been decided. Once an opening is live, ask for a change from its page."
      action={<Button asChild><Link href={`/recruiter/jobs/${id}`}>View opening</Link></Button>} />;
  }
  if (change) {
    return (
      <>
        <PageHeader title="Request an edit" description={`${r.requestNumber} · ${r.spec?.title ?? ""}. Candidates keep seeing the current version until our team approves.`} />
        <JobRequestForm initial={r} changeFor={{ jobId: r.jobId! }} />
      </>
    );
  }
  return (
    <>
      <PageHeader title={r.status === "DRAFT" ? "Continue your opening" : "Update your opening"} description={`${r.requestNumber}${r.spec?.title ? ` · ${r.spec.title}` : ""}`} />
      <JobRequestForm initial={r} />
    </>
  );
}
