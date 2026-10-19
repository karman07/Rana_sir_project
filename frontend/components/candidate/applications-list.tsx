"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileSearch } from "lucide-react";
import { formatMoney } from "@rms/shared";
import { apiList } from "@/lib/api";
import { CANDIDATE_STATUS, TERMINAL, timeAgo, type ApplicationListItem } from "@/lib/applications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";
import { Journey } from "./journey";

export function ApplicationsList() {
  const [tab, setTab] = useState<"active" | "closed">("active");
  const q = useQuery({ queryKey: ["applications", "candidate"], queryFn: () => apiList<ApplicationListItem>("/applications?limit=100&sort=-updatedAt") });
  const all = q.data?.items ?? [];
  const items = all.filter((a) => (tab === "active" ? !TERMINAL.includes(a.status) : TERMINAL.includes(a.status)));
  const counts = { active: all.filter((a) => !TERMINAL.includes(a.status)).length, closed: all.filter((a) => TERMINAL.includes(a.status)).length };

  return (
    <>
      <PageHeader title="My applications" description="Where you stand with every role you've applied for." />
      <div className="mb-4 flex gap-1.5" role="tablist">
        {([["active", "In progress"], ["closed", "Closed"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2")}>
            {label}<span className={cn("rounded-full px-1.5 text-xs", tab === k ? "bg-primary-foreground/20" : "bg-background-2")}>{counts[k]}</span>
          </button>
        ))}
      </div>

      {q.isPending ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-[16px]" />)}</div>
      ) : q.isError ? (
        <ErrorState compact variant="server" onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        all.length === 0 ? (
          <EmptyState icon={FileSearch} title="You haven't applied to any jobs yet" description="Find a role that fits and apply in a few minutes. Every step of the process shows up here." action={<Button asChild><Link href="/candidate/jobs">Browse jobs</Link></Button>} />
        ) : <EmptyState icon={FileSearch} title={tab === "active" ? "Nothing in progress" : "No closed applications"} description={tab === "active" ? "All your applications have finished. Find a new role to apply for." : "Applications that end — rejected or withdrawn — appear here."} />
      ) : (
        <div className="space-y-4">
          {items.map((a) => {
            const st = CANDIDATE_STATUS[a.status];
            return (
              <Link key={a.id} href={`/candidate/applications/${a.id}`} className="block">
                <Card className="p-5 transition-colors hover:border-secondary-green/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[16px] font-semibold tracking-tight">{a.job.title}</h2>
                      <p className="truncate text-sm text-foreground-2">{a.company.name} · {a.job.location}</p>
                    </div>
                    <ChevronRight className="mt-1 size-5 shrink-0 text-muted" />
                  </div>
                  <div className="mt-4 mb-1"><Journey status={a.status} /></div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3 text-sm">
                    <span className={cn("font-medium", a.status === "REJECTED" ? "text-danger" : a.status === "PLACED" || a.status === "SELECTED" ? "text-success" : "text-foreground")}>{st?.label}</span>
                    <span className="text-xs text-muted">
                      Applied {timeAgo(a.createdAt)} · {a.applicationNumber}
                      {a.expectedSalary ? ` · ${formatMoney(a.expectedSalary).replace(/\.00$/, "")} expected` : ""}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
