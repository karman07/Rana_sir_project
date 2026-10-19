export interface JobChange {
  id: string; changeNumber: string; type: "EDIT" | "CLOSE"; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reason: string; submittedAt: string; decidedByName?: string; decidedAt?: string; decisionNote?: string;
  changes: { field: string; label: string; from: unknown; to: unknown }[];
  job: { id: string; jobRequestId: string; jobNumber?: string; title?: string; status?: string; company?: string };
  recruiter?: { id: string; name: string };
  liveApplications?: number;
  actions: ("approve" | "reject" | "cancel")[];
}

export const CHANGE_LABEL = { EDIT: "Edit request", CLOSE: "Closure request" } as const;
export const showValue = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v));
