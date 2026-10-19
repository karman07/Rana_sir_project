"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Bell, ChevronRight, LogOut, Menu, Search, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ROLE_LABEL, type RoleKey } from "./nav";

const pretty = (s: string) => s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function Breadcrumb() {
  const parts = usePathname().split("/").filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      {parts.map((p, i) => {
        const href = "/" + parts.slice(0, i + 1).join("/");
        const last = i === parts.length - 1;
        return (
          <span key={href} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted" />}
            {last ? <span className="truncate font-medium">{pretty(p)}</span>
              : <Link href={i === 0 ? `${href}/dashboard` : href} className="truncate text-foreground-2 hover:text-foreground">{pretty(p)}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

function MenuItem({ icon: Icon, children, danger, onSelect }: { icon: typeof Bell; children: React.ReactNode; danger?: boolean; onSelect?: () => void }) {
  return (
    <Dropdown.Item onSelect={onSelect} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-background-2", danger && "text-danger")}>
      <Icon className="size-4" />{children}
    </Dropdown.Item>
  );
}

export function Topbar({ role, onMenu, onSearch, user, onLogout }: { role: RoleKey; onMenu: () => void; onSearch: () => void; user: { name: string; email: string }; onLogout: () => void }) {
  const base = `/${role}`;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={onMenu}><Menu /></Button>
      <Breadcrumb />
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onSearch}
          className="mr-1 hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted hover:border-secondary-green/50 md:flex"
          aria-label="Search (Ctrl or Command K)" aria-keyshortcuts="Control+K Meta+K"
        >
          <Search className="size-4" />Search
          <kbd className="ml-6 rounded border border-border bg-background-2 px-1.5 text-[11px]">⌘K</kbd>
        </button>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={onSearch}><Search /></Button>
        <NotificationBell base={base} />
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button className="ml-1 rounded-full" aria-label="Account menu"><Avatar name={user.name} size={32} /></button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content align="end" sideOffset={8} className="z-50 w-56 rounded-xl border border-border bg-card p-1 shadow-card">
              <div className="px-2 py-2">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted">{user.email}</p>
                <p className="mt-1 inline-block rounded bg-background-2 px-1.5 text-[11px] text-foreground-2">{ROLE_LABEL[role]}</p>
              </div>
              <Dropdown.Separator className="my-1 h-px bg-divider" />
              <MenuItem icon={UserRound}>Profile</MenuItem>
              <MenuItem icon={Settings}>Preferences</MenuItem>
              <Dropdown.Separator className="my-1 h-px bg-divider" />
              <MenuItem icon={LogOut} danger onSelect={onLogout}>Sign out</MenuItem>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </header>
  );
}
