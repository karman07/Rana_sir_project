import {
  BarChart3, Bell, BriefcaseBusiness, Building2, CalendarClock, ClipboardCheck, FileSignature,
  FileText, FolderOpen, Gauge, Handshake, Inbox, LayoutDashboard, Mail, Receipt, ScrollText,
  Settings, ShieldCheck, Star, UserCheck, UserRound, UsersRound, Wallet, Banknote, Coins, FileClock,
  FileWarning, FilePen, Search, SearchCheck, Send, BadgePercent, type LucideIcon,
} from "lucide-react";

export type RoleKey = "admin" | "recruiter" | "candidate";

export interface NavItem { label: string; href: string; icon: LucideIcon; badge?: number }
export interface NavSection { title?: string; items: NavItem[] }

const a = (p: string) => `/admin/${p}`;

export const NAV: Record<RoleKey, NavSection[]> = {
  admin: [
    { items: [{ label: "Dashboard", href: a("dashboard"), icon: LayoutDashboard }, { label: "Approval Center", href: a("approvals"), icon: ClipboardCheck }] },
    { title: "Recruitment", items: [
      { label: "Job Requests", href: a("job-requests"), icon: Inbox },
      { label: "Jobs", href: a("jobs"), icon: BriefcaseBusiness },
      { label: "Applications", href: a("applications"), icon: FileText },
      { label: "Candidate Pool", href: a("candidates"), icon: UsersRound },
      { label: "Screening Queue", href: a("screening"), icon: SearchCheck },
      { label: "Shortlisted", href: a("shortlisted"), icon: Star },
      { label: "Interviews", href: a("interviews"), icon: CalendarClock },
      { label: "Placements", href: a("placements"), icon: Handshake },
    ] },
    { title: "People", items: [
      { label: "Recruiters", href: a("recruiters"), icon: UserCheck },
      { label: "Companies", href: a("companies"), icon: Building2 },
    ] },
    { title: "Finance", items: [
      { label: "Payments", href: a("payments"), icon: Wallet },
      { label: "Commissions", href: a("commissions"), icon: BadgePercent },
      { label: "Salary", href: a("salary"), icon: Banknote },
      { label: "Payslips", href: a("payslips"), icon: Receipt },
      { label: "Transactions", href: a("transactions"), icon: Coins },
    ] },
    { title: "Contracts", items: [
      { label: "Active", href: a("contracts"), icon: FileSignature },
      { label: "Pending", href: a("contracts/pending"), icon: FileClock },
      { label: "Expiring", href: a("contracts/expiring"), icon: FileWarning },
      { label: "Changes", href: a("contracts/changes"), icon: FilePen },
    ] },
    { title: "Communication", items: [
      { label: "Email Center", href: a("emails"), icon: Mail },
      { label: "Notifications", href: a("notifications"), icon: Bell },
      { label: "Templates", href: a("templates"), icon: ScrollText },
    ] },
    { title: "Insights", items: [
      { label: "Analytics", href: a("analytics"), icon: BarChart3 },
      { label: "Documents", href: a("documents"), icon: FolderOpen },
      { label: "Audit Log", href: a("audit-logs"), icon: ShieldCheck },
      { label: "Settings", href: a("settings"), icon: Settings },
    ] },
  ],
  recruiter: [
    { items: [{ label: "Dashboard", href: "/recruiter/dashboard", icon: LayoutDashboard }] },
    { title: "Hiring", items: [
      { label: "Jobs", href: "/recruiter/jobs", icon: BriefcaseBusiness },
      { label: "Companies", href: "/recruiter/companies", icon: Building2 },
      { label: "Candidates", href: "/recruiter/candidates", icon: UsersRound },
      { label: "Interviews", href: "/recruiter/interviews", icon: CalendarClock },
    ] },
    { title: "Finance", items: [
      { label: "Contracts", href: "/recruiter/contracts", icon: FileSignature },
      { label: "Payments", href: "/recruiter/payments", icon: Wallet },
      { label: "Salary", href: "/recruiter/salary", icon: Banknote },
      { label: "Documents", href: "/recruiter/documents", icon: FolderOpen },
    ] },
    { title: "Insights", items: [{ label: "Analytics", href: "/recruiter/analytics", icon: BarChart3 }] },
    { items: [{ label: "Notifications", href: "/recruiter/notifications", icon: Bell }] },
  ],
  candidate: [
    { items: [
      { label: "Home", href: "/candidate/dashboard", icon: Gauge },
      { label: "Jobs", href: "/candidate/jobs", icon: Search },
      { label: "Applications", href: "/candidate/applications", icon: Send },
      { label: "Interviews", href: "/candidate/interviews", icon: CalendarClock },
    ] },
    { title: "Employment", items: [
      { label: "Contracts", href: "/candidate/contracts", icon: FileSignature },
      { label: "Payments", href: "/candidate/payments", icon: Wallet },
      { label: "Salary", href: "/candidate/salary", icon: Banknote },
      { label: "Payslips", href: "/candidate/payslips", icon: Receipt },
      { label: "Documents", href: "/candidate/documents", icon: FolderOpen },
    ] },
    { title: "Insights", items: [{ label: "Your activity", href: "/candidate/analytics", icon: BarChart3 }] },
    { items: [
      { label: "Notifications", href: "/candidate/notifications", icon: Bell },
      { label: "Profile", href: "/candidate/profile", icon: UserRound },
    ] },
  ],
};

export const ROLE_LABEL: Record<RoleKey, string> = { admin: "Admin", recruiter: "Recruiter", candidate: "Candidate" };

export function findNavItem(role: RoleKey, pathname: string): NavItem | undefined {
  const all = NAV[role].flatMap((s) => s.items);
  return all.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/")).sort((x, y) => y.href.length - x.href.length)[0];
}

