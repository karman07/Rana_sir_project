"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Inbox, UserRoundSearch } from "lucide-react";
import { formatMoney } from "@rms/shared";
import { api, apiList } from "@/lib/api";
import { timeAgo, type ApplicationListItem } from "@/lib/applications";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";
import { ScoreBadge } from "./score-bar";

const TABS = [
  { key: "SENT_TO_RECRUITER,RECRUITER_REVIEW", label: "Needs your decision" },
  { key: "RECRUITER_APPROVED,INTERVIEW", label: "Approved" },
  { key: "SELECTED,CONTRACT,PLACED", label: "Selected / placed" },
  { key: "", label: "All" },
];

export function RecruiterCandidates() {
  const [tab, setTab] = useState(TABS[0].key);
  const q = useQuery({ queryKey: ["applications", "recruiter", tab], queryFn: () => apiList<ApplicationListItem>(`/applications?limit=100${tab ? `&statuses=${tab}` : ""}&sort=-updatedAt`) });
  const all = useQuery({ queryKey: ["applications", "counts"], queryFn: () => api<Record<string, number>>("/applications/counts") });
  const count = (key: string) => (key ? key.split(",").reduce((n, k) => n + (all.data?.[k] ?? 0), 0) : Object.values(all.data ?? {}).reduce((a, b) => a + b, 0));

  return (
    <>
      <PageHeader title="Candidates" description="The best candidates our team has shortlisted for your openings. Decide who moves forward." />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:bg-background-2")}>
            {t.label}{all.data && <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-primary-foreground/20" : t.key === TABS[0].key && count(t.key) ? "bg-gold-soft font-medium text-gold" : "bg-background-2")}>{count(t.key)}</span>}
          </button>
        ))}
      </div>
      {q.isPending ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-[16px]" />)}</div> : q.isError ? <ErrorState compact variant="server" onRetry={() => q.refetch()} /> : q.data.items.length === 0 ? (
        <EmptyState icon={tab === TABS[0].key ? Inbox : UserRoundSearch} title={tab === TABS[0].key ? "No candidates are waiting for you" : "Nothing here yet"}
          description={tab === TABS[0].key ? "Our team screens every applicant first and sends only the best matches here for your decision." : "Candidates appear here as they progress."} />
      ) : (
        <div className="space-y-3">
          {q.data.items.map((a) => (
            <Link key={a.id} href={`/recruiter/candidates/${a.id}`} className="block">
              <Card className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:border-secondary-green/40 sm:p-5">
                <Avatar name={a.candidate?.name ?? "?"} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.candidate?.name}</p>
                  <p className="truncate text-sm text-foreground-2">{a.job.title} · {a.company.name}</p>
                  <p className="text-xs text-muted">{a.expectedSalary ? `${formatMoney(a.expectedSalary).replace(/\.00$/, "")} expected · ` : ""}{a.noticePeriodDays != null ? `${a.noticePeriodDays}d notice · ` : ""}sent {timeAgo(a.updatedAt).toLowerCase()}</p>
                </div>
                <div className="text-center"><p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Our score</p><ScoreBadge value={a.adminScore ?? null} /></div>
                <StatusBadge status={a.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
