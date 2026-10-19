import { API_URL } from "./api";

export type PeriodKey = "7d" | "30d" | "90d" | "12m" | "all";
export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "90d", label: "90 days" }, { key: "12m", label: "12 months" }, { key: "all", label: "All time" },
];
export const PERIOD_LABEL: Record<PeriodKey, string> = { "7d": "the last 7 days", "30d": "the last 30 days", "90d": "the last 90 days", "12m": "the last 12 months", all: "all time" };

export type BucketKind = "day" | "week" | "month";
export interface SeriesPoint { bucket: string; [k: string]: number | string }

/** "2026-10-08" -> "Oct 8", a week -> "Oct 6", a month "2026-10" -> "Oct 26". */
export function bucketLabel(b: string, kind: BucketKind) {
  if (kind === "month") return new Date(`${b}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
  return new Date(`${b}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

export const STAGE_LABEL: Record<string, string> = {
  applications: "Applications", shortlisted: "Shortlisted", sentToRecruiter: "Sent to recruiter", recruiterApproved: "Recruiter approved", interview: "Interview", selected: "Selected", hired: "Hired",
};

export const exportUrl = (dataset: string, format: "csv" | "xlsx", period?: PeriodKey, status?: string) =>
  `${API_URL}/exports/${dataset}?format=${format}${period ? `&period=${period}` : ""}${status ? `&status=${status}` : ""}`;

export const num = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: digits }));
export const pctText = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);
