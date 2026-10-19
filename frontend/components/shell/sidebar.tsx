"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { NAV, ROLE_LABEL, type RoleKey } from "./nav";

export function Logo({ collapsed, light }: { collapsed?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold", light ? "bg-[#f7f4ec] text-[#173b2f]" : "bg-primary text-primary-foreground")}>
        T<span className="text-gold">.</span>
      </span>
      {!collapsed && <span className={cn("text-[15px] font-semibold tracking-tight", light && "text-[#f7f4ec]")}>Talentbridge</span>}
    </div>
  );
}

export function SidebarNav({ role, collapsed, onNavigate, badges = {} }: { role: RoleKey; collapsed?: boolean; onNavigate?: () => void; badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={`${ROLE_LABEL[role]} navigation`}>
      {NAV[role].map((section, i) => (
        <div key={i}>
          {section.title && !collapsed && (
            <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted">{section.title}</p>
          )}
          {section.title && collapsed && <div className="mx-2 mb-1.5 border-t border-divider" />}
          <ul className="space-y-0.5">
            {section.items.map((rawItem) => {
              const item = { ...rawItem, badge: badges[rawItem.href] ?? rawItem.badge };
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-foreground-2 hover:bg-background-2 hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {collapsed && item.badge ? <span className="absolute right-1.5 top-1 size-2 rounded-full bg-gold" /> : null}
                  {!collapsed && item.badge ? (
                    <span className={cn("rounded-full px-1.5 text-[11px] font-medium", active ? "bg-primary-foreground/20" : "bg-gold-soft text-gold")}>{item.badge}</span>
                  ) : null}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content side="right" sideOffset={8} className="z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background">{item.label}</Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  ) : link}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ role, collapsed, onToggle, badges }: { role: RoleKey; collapsed: boolean; onToggle: () => void; badges?: Record<string, number> }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-background-2/50 transition-[width] duration-200 lg:flex",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-divider px-4", collapsed && "justify-center px-0")}>
        <Logo collapsed={collapsed} />
      </div>
      <SidebarNav role={role} collapsed={collapsed} badges={badges} />
      <button
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="m-3 flex items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-muted hover:bg-background-2 hover:text-foreground"
      >
        {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Collapse</>}
      </button>
    </aside>
  );
}
