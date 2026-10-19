export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorRole: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const humanizeAction = (a: string) => a.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
