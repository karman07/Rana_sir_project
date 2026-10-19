"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { NotificationSettingRow } from "@/lib/communication";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shell/page-header";

export function NotificationSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notification-settings"], queryFn: () => api<NotificationSettingRow[]>("/notification-settings") });
  const set = useMutation({
    mutationFn: ({ event, patch }: { event: string; patch: { inApp?: boolean; email?: boolean } }) => api<NotificationSettingRow>(`/notification-settings/${event}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onMutate: async ({ event, patch }) => {
      await qc.cancelQueries({ queryKey: ["notification-settings"] });
      const prev = qc.getQueryData<NotificationSettingRow[]>(["notification-settings"]);
      qc.setQueryData<NotificationSettingRow[]>(["notification-settings"], (rows) => rows?.map((r) => (r.event === event ? { ...r, ...patch } : r)));
      return { prev };
    },
    onError: (e, _v, ctx) => { qc.setQueryData(["notification-settings"], ctx?.prev); toast.error(e instanceof ApiError ? e.message : "Could not save that"); },
  });

  const groups = useMemo(() => {
    const map = new Map<string, NotificationSettingRow[]>();
    for (const r of q.data ?? []) map.set(r.group, [...(map.get(r.group) ?? []), r]);
    return [...map.entries()];
  }, [q.data]);

  return (
    <>
      <Link href="/admin/settings" className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-2 hover:text-foreground"><ArrowLeft className="size-4" />Settings</Link>
      <PageHeader title="Notification preferences" description="Choose which events tell people, and how: a notice inside the app, an email, or both. Changes apply straight away." />
      {q.isPending ? <div className="space-y-4"><Skeleton className="h-40 w-full rounded-[16px]" /><Skeleton className="h-40 w-full rounded-[16px]" /></div> : (
        <div className="space-y-5">
          {groups.map(([group, rows]) => (
            <Card key={group}>
              <CardHeader title={group} />
              <CardBody className="p-0">
                <div className="hidden grid-cols-[1fr_5rem_5rem] gap-3 px-5 pb-2 text-xs font-medium uppercase tracking-wider text-muted sm:grid"><span>Event</span><span className="text-center">In-app</span><span className="text-center">Email</span></div>
                <ul className="divide-y divide-divider">
                  {rows.map((r) => (
                    <li key={r.event} className="grid items-center gap-3 px-5 py-3 sm:grid-cols-[1fr_5rem_5rem]">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium">{r.label}{r.locked && <Lock className="size-3.5 text-muted" aria-label="Always on" />}</p>
                        {r.description && <p className="text-xs text-muted">{r.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 sm:justify-center"><span className="text-xs text-muted sm:hidden">In-app</span><Switch checked={r.inApp} disabled={r.locked} onCheckedChange={(v) => set.mutate({ event: r.event, patch: { inApp: v } })} label={`${r.label}: in-app notice`} /></div>
                      <div className="flex items-center gap-2 sm:justify-center"><span className="text-xs text-muted sm:hidden">Email</span><Switch checked={r.email} disabled={r.locked} onCheckedChange={(v) => set.mutate({ event: r.event, patch: { email: v } })} label={`${r.label}: email`} /></div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
