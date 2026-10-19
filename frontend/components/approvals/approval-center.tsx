"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ChevronLeft, ChevronRight, Clock, Flame, Inbox, Search } from "lucide-react";
import { toast } from "sonner";
import { api, apiList, apiPost, ApiError } from "@/lib/api";
import { StatCard } from "@/components/data/stat-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";
import { ApprovalCard, waitingLabel, type ApprovalActionKey, type ApprovalItem } from "./approval-card";

interface Summary {
  total: number; high: number; medium: number; oldestSubmittedAt: string | null;
  byCategory: Record<string, number>; categories: { key: string; label: string; description: string }[];
}

const LIMIT = 15;

export function ApprovalCenter() {
  const router = useRouter();
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ item: ApprovalItem; action: "reject" | "request-changes" } | null>(null);

  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const summary = useQuery({ queryKey: ["approvals", "summary"], queryFn: () => api<Summary>("/approvals/summary"), refetchInterval: 60_000 });
  const qs = `limit=${LIMIT}&page=${page}${category ? `&category=${category}` : ""}${priority ? `&priority=${priority}` : ""}${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`;
  const list = useQuery({ queryKey: ["approvals", "list", qs], queryFn: () => apiList<ApprovalItem>(`/approvals?${qs}`), placeholderData: keepPreviousData, refetchInterval: 60_000 });

  const decide = useMutation({
    mutationFn: ({ item, action, body }: { item: ApprovalItem; action: ApprovalActionKey; body?: { note?: string; publish?: boolean } }) =>
      apiPost(`/approvals/${item.category}/${item.entityId}/${action}`, body ?? {}),
    onSuccess: (_r, { item, action }) => {
      toast.success(action === "approve" ? `${item.title} approved` : action === "reject" ? `${item.title} rejected` : `Changes requested for ${item.title}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action failed"),
    onSettled: () => {
      for (const key of ["approvals", "overview", "recruiters", "companies", "job-requests", "audit"]) qc.invalidateQueries({ queryKey: [key] });
    },
  });

  const onAction = (item: ApprovalItem, action: ApprovalActionKey) => {
    if (action === "approve" && item.category === "JOB_REQUEST" && item.href) { router.push(item.href); return; } // our commission is set on the opening's own page
    if (action === "approve") decide.mutate({ item, action, body: item.category === "JOB_REQUEST" ? { publish: true } : {} });
    else setPending({ item, action });
  };

  const s = summary.data;
  const filtered = !!(category || priority || debounced);
  const meta = list.data?.meta;

  return (
    <>
      <PageHeader title="Approval Center" description="Everything waiting on an Admin decision, most urgent first." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting on you" value={s ? String(s.total) : "—"} icon={Inbox} hint={s && s.total === 0 ? "You're all caught up" : "Across all categories"} />
        <StatCard label="High priority" value={s ? String(s.high) : "—"} icon={Flame} hint="Waiting 3+ days, or resubmitted" />
        <StatCard label="Longest wait" value={s?.oldestSubmittedAt ? waitingLabel(Math.floor((Date.now() - +new Date(s.oldestSubmittedAt)) / 86_400_000)) : "—"} icon={Clock} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Category">
          {[{ key: "", label: "All", n: s?.total }, ...(s?.categories ?? []).map((c) => ({ key: c.key, label: c.label, n: s?.byCategory[c.key] }))].map((t) => (
            <button key={t.key} role="tab" aria-selected={category === t.key} onClick={() => { setCategory(t.key); setPage(1); }}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors", category === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground-2 hover:bg-background-2")}>
              {t.label}
              {t.n !== undefined && <span className={cn("rounded-full px-1.5 text-xs", category === t.key ? "bg-primary-foreground/20" : t.n > 0 && t.key ? "bg-gold-soft font-medium text-gold" : "bg-background-2")}>{t.n}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
            <Input className="pl-8" placeholder="Search requests…" aria-label="Search requests" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Priority" className="w-auto" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
            <option value="">Any priority</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="NORMAL">New</option>
          </Select>
        </div>
      </div>

      <div className="mt-4 space-y-3" aria-live="polite">
        {list.isPending ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 w-full rounded-[16px]" />)
        ) : list.isError ? (
          <ErrorState compact variant={list.error instanceof ApiError && list.error.status === 0 ? "network" : "server"} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={CheckCheck} title={filtered ? "No requests match these filters" : "Nothing is waiting for your decision"}
            description={filtered ? "Try a different category, priority or search." : "New recruiter sign-ups, companies and job requests will appear here the moment they're submitted."}
            action={filtered ? <Button variant="secondary" onClick={() => { setCategory(""); setPriority(""); setSearch(""); }}>Clear filters</Button> : undefined} />
        ) : (
          list.data.items.map((item) => (
            <ApprovalCard key={item.id} item={item} busy={decide.isPending && decide.variables?.item.id === item.id} onAction={onAction} />
          ))
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-foreground-2">
          <span>{meta.total} requests</span>
          <div className="flex items-center gap-2">
            <span>Page {meta.page} of {meta.totalPages}</span>
            <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></Button>
            <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight /></Button>
          </div>
        </div>
      )}

      <ReasonDialog
        open={!!pending} onOpenChange={(o) => !o && setPending(null)} destructive={pending?.action === "reject"}
        title={pending?.action === "reject" ? `Reject ${pending?.item.title}?` : `Request changes: ${pending?.item.title}`}
        description={pending?.action === "reject" ? "The requester will see your reason." : "Tell them exactly what to fix. They can update and resubmit."}
        confirmLabel={pending?.action === "reject" ? "Reject" : "Send request"}
        onSubmit={(note) => decide.mutateAsync({ item: pending!.item, action: pending!.action, body: { note } })}
      />
    </>
  );
}
