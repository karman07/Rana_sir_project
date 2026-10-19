"use client";

import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { apiList } from "@/lib/api";
import { formatDateTime, humanizeAction, type AuditEntry } from "@/lib/audit";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Timeline } from "./timeline";

/** Activity timeline for any entity, built from the audit log. Admin-only data (the API enforces it). */
export function EntityActivity({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["audit", entityType, entityId],
    queryFn: () => apiList<AuditEntry>(`/audit-logs?entityType=${entityType}&entityId=${entityId}&limit=50&sort=-createdAt`),
  });

  if (isPending) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (isError) return <p className="text-sm text-danger">Couldn&apos;t load activity.</p>;
  if (!data.items.length) return <EmptyState icon={History} title="No activity yet" description="Actions on this record will be listed here." />;

  return (
    <Timeline
      items={data.items.map((e) => ({
        title: humanizeAction(e.action),
        description: [e.actorName ? `by ${e.actorName}` : null, e.reason].filter(Boolean).join(" — ") || undefined,
        time: formatDateTime(e.createdAt),
        state: "done" as const,
      }))}
    />
  );
}
