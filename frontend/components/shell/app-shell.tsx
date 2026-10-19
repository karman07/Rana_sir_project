"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Dialog } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo, Sidebar, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";
import { NAV, type RoleKey } from "./nav";
import { HOME, useSession } from "@/lib/auth";
import { ShellSkeleton } from "./shell-skeleton";
import { RecruiterGate } from "./recruiter-gate";
import { CommandPalette } from "./command-palette";

const KEY = "sidebar-collapsed";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

function BottomNav({ role }: { role: RoleKey }) {
  const pathname = usePathname();
  const items = NAV[role].flatMap((s) => s.items).slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Primary">
      {items.map((it) => {
        const active = pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-primary" : "text-muted")}>
            <it.icon className="size-5" />{it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ role, children }: { role: RoleKey; children: React.ReactNode }) {
  const { user, loading, logout } = useSession();
  const router = useRouter();
  const path = usePathname();
  const wrongRole = !!user && user.role.toLowerCase() !== role;

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (wrongRole) router.replace(HOME[user.role]);
  }, [loading, user, wrongRole, path, router]);

  if (loading || !user || wrongRole) return <ShellSkeleton />;
  return <ShellFrame role={role} user={user} onLogout={logout}>{children}</ShellFrame>;
}

function ShellFrame({ role, user, onLogout, children }: {
  role: RoleKey; user: { name: string; email: string; recruiter?: { approvalStatus: string; reviewNote?: string } }; onLogout: () => void; children: React.ReactNode;
}) {
  const storedCollapsed = useSyncExternalStore(subscribe, () => localStorage.getItem(KEY) === "1", () => false);
  const [override, setOverride] = useState<boolean | null>(null);
  const collapsed = override ?? storedCollapsed;
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const pathname = usePathname();
  // Cmd+K (Mac) or Ctrl+K (everything else) opens search from anywhere.
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((o) => !o); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  // Admin sidebar shows how many items are waiting on a decision.
  const summary = useQuery({
    queryKey: ["approvals", "summary"], enabled: role === "admin", refetchInterval: 60_000,
    queryFn: () => api<{ total: number; byCategory: Record<string, number> }>("/approvals/summary"),
  });
  const badges = useMemo(() => {
    const b = summary.data?.byCategory;
    if (!b) return {};
    return {
      "/admin/approvals": summary.data!.total, "/admin/job-requests": b.JOB_REQUEST ?? 0,
      "/admin/recruiters": b.RECRUITER_ACCOUNT ?? 0, "/admin/companies": (b.COMPANY ?? 0) + (b.COMPANY_LINK ?? 0),
    } as Record<string, number>;
  }, [summary.data]);

  const toggle = () => {
    const next = !collapsed;
    setOverride(next);
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch {}
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} collapsed={collapsed} onToggle={toggle} badges={badges} />
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0d1411]/50 lg:hidden" />
          <DialogPrimitive.Content className="fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-border bg-card lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Site navigation</DialogPrimitive.Description>
            <div className="flex h-14 items-center justify-between border-b border-divider px-4">
              <Logo />
              <DialogPrimitive.Close aria-label="Close menu" className="rounded-md p-1 hover:bg-background-2"><X className="size-4" /></DialogPrimitive.Close>
            </div>
            <SidebarNav role={role} onNavigate={() => setDrawer(false)} badges={badges} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} onMenu={() => setDrawer(true)} onSearch={() => setPalette(true)} user={user} onLogout={onLogout} />
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={cn("mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8", role === "candidate" && "pb-24 lg:pb-6")}
        >
          {role === "recruiter" && user.recruiter && user.recruiter.approvalStatus !== "APPROVED"
            ? <RecruiterGate status={user.recruiter.approvalStatus} note={user.recruiter.reviewNote} />
            : children}
        </motion.main>
      </div>
      {role === "candidate" && <BottomNav role={role} />}
      <CommandPalette role={role} open={palette} onOpenChange={setPalette} />
    </div>
  );
}
