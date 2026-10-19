"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { api, apiList, apiPost } from "@/lib/api";
import { iconFor, relativeTime, type AppNotification } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotificationBell({ base }: { base: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const count = useQuery({ queryKey: ["notifications", "count"], queryFn: () => api<{ count: number }>("/notifications/unread-count"), refetchInterval: 30_000, refetchIntervalInBackground: false });
  const recent = useQuery({ queryKey: ["notifications", "recent"], queryFn: () => apiList<AppNotification>("/notifications?limit=6"), enabled: open });

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => apiPost("/notifications/read-all"), onSuccess: refresh });

  const unread = count.data?.count ?? 0;
  const go = (n: AppNotification) => {
    if (!n.read) read.mutate(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <Bell />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <button onClick={() => readAll.mutate()} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"><CheckCheck className="size-3.5" />Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {recent.isPending ? (
              <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-md bg-background-2" />)}</div>
            ) : recent.data?.items.length ? (
              recent.data.items.map((n) => {
                const Icon = iconFor(n.type);
                return (
                  <button key={n.id} onClick={() => go(n)} className={cn("flex w-full gap-3 border-b border-divider px-4 py-3 text-left transition-colors last:border-0 hover:bg-background-2", !n.read && "bg-gold-soft/40")}>
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-background-2 text-secondary-green"><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2"><span className={cn("text-sm", !n.read && "font-semibold")}>{n.title}</span>{!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" aria-label="Unread" />}</span>
                      {n.description && <span className="line-clamp-2 text-xs text-foreground-2">{n.description}</span>}
                      <span className="mt-0.5 block text-xs text-muted">{relativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-10 text-center"><Bell className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm font-medium">You're all caught up</p><p className="text-xs text-foreground-2">New updates will appear here.</p></div>
            )}
          </div>
          <Link href={`${base}/notifications`} onClick={() => setOpen(false)} className="block border-t border-divider px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-background-2">View all notifications</Link>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
