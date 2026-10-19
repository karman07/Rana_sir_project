import { Banknote, Bell, Briefcase, CalendarClock, FileSignature, FileText, Settings, type LucideIcon } from "lucide-react";

export interface AppNotification {
  id: string; title: string; description?: string; type: string; link?: string; read: boolean; createdAt: string; entityType?: string; entityId?: string;
}

export const TYPE_ICON: Record<string, LucideIcon> = {
  RECRUITMENT: Briefcase, INTERVIEW: CalendarClock, CONTRACT: FileSignature, PAYMENT: Banknote, SALARY: Banknote, SYSTEM: Settings, DOCUMENT: FileText,
};
export const iconFor = (type: string) => TYPE_ICON[type] ?? Bell;

export const TYPE_LABEL: Record<string, string> = {
  RECRUITMENT: "Recruitment", INTERVIEW: "Interviews", CONTRACT: "Contracts", PAYMENT: "Payments", SALARY: "Salary", SYSTEM: "System", DOCUMENT: "Documents",
};

export function relativeTime(iso: string) {
  const s = Math.floor((Date.now() - +new Date(iso)) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
