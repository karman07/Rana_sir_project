"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BellOff, CheckCheck } from "lucide-react";
import { api, apiList, apiPost } from "@/lib/api";
import { TYPE_LABEL, iconFor, relativeTime, type AppNotification } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";

export function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [type, setType] = useState("");

  const qs = `limit=20${tab === "unread" ? "&unread=true" : ""}${type ? `&type=${type}` : ""}`;
  const q = useInfiniteQuery({
    queryKey: ["notifications", "page", qs], initialPageParam: 1,
    queryFn: ({ pageParam }) => apiList<AppNotification>(`/notifications?${qs}&page=${pageParam}`),
    getNextPageParam: (l) => (l.meta.page < l.meta.totalPages ? l.meta.page + 1 : undefined),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => apiPost("/notifications/read-all"), onSuccess: refresh });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.meta.total ?? 0;

  return (
    <>
      <PageHeader title="Notifications" description="Everything that needs your attention, newest first."
        actions={<Button variant="secondary" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}><CheckCheck />Mark all read</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-background-2 p-1 text-sm" role="tablist">
          {(["all", "unread"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-md px-3 py-1.5 font-medium capitalize transition-colors", tab === k ? "bg-card shadow-card" : "text-foreground-2")}>{k}</button>
          ))}
        </div>
        <Select aria-label="Type" className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {!q.isPending && <span className="ml-auto text-sm text-muted">{total} notification{total === 1 ? "" : "s"}</span>}
      </div>

      {q.isPending ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-[16px]" />)}</div>
      ) : q.isError ? (
        <ErrorState compact variant="server" onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={BellOff} title={tab === "unread" ? "No unread notifications" : "No notifications yet"} description={tab === "unread" ? "You've read everything." : "Updates about your applications, interviews, contracts and payments will show up here."} />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = iconFor(n.type);
            return (
              <button key={n.id} onClick={() => { if (!n.read) read.mutate(n.id); if (n.link) router.push(n.link); }} className="block w-full text-left">
                <Card className={cn("flex items-start gap-3 p-4 transition-colors hover:border-secondary-green/40", !n.read && "border-gold/40 bg-gold-soft/30")}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background-2 text-secondary-green"><Icon className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3"><span className={cn("text-sm", !n.read ? "font-semibold" : "font-medium")}>{n.title}</span><span className="shrink-0 text-xs text-muted">{relativeTime(n.createdAt)}</span></span>
                    {n.description && <span className="mt-0.5 block text-sm text-foreground-2">{n.description}</span>}
                    <span className="mt-1.5 inline-block rounded-full bg-background-2 px-2 py-0.5 text-[11px] text-foreground-2">{TYPE_LABEL[n.type] ?? n.type}</span>
                  </span>
                  {!n.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
                </Card>
              </button>
            );
          })}
          {q.hasNextPage && <div className="flex justify-center pt-2"><Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button></div>}
        </div>
      )}
    </>
  );
}
