"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Briefcase, Building2, CornerDownLeft, FileSignature, FileText, History, Loader2, Receipt, Search, Banknote, UserCheck, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NAV, type RoleKey } from "./nav";

interface Hit { id: string; title: string; subtitle?: string; href: string }
interface Group { type: string; label: string; items: Hit[] }
interface Row { key: string; group: string; title: string; subtitle?: string; href: string; icon: LucideIcon }

const ICON: Record<string, LucideIcon> = { job: Briefcase, candidate: UsersRound, recruiter: UserCheck, company: Building2, application: FileText, contract: FileSignature, payment: Wallet, salary: Banknote, payslip: Receipt };
const RECENT_KEY = "palette-recent";

const readRecent = (): Hit[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } };
const saveRecent = (h: Hit) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([h, ...readRecent().filter((x) => x.href !== h.href)].slice(0, 5))); } catch { /* private mode: no recents */ } };

/**
 * Cmd/Ctrl+K: jump to any page, or find a person, job, contract, payment or document without clicking through lists.
 * Results come from the server already limited to what this person may open.
 */
export function CommandPalette({ role, open, onOpenChange }: { role: RoleKey; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Hit[]>([]);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQ(""); setTerm(""); setActive(0); setRecent(readRecent()); } }, [open]);
  useEffect(() => { const h = setTimeout(() => setTerm(q.trim()), 180); return () => clearTimeout(h); }, [q]);

  const pages = useMemo(() => NAV[role].flatMap((s) => s.items.map((i) => ({ ...i, section: s.title }))), [role]);
  const search = useQuery({ queryKey: ["search", term], enabled: open && term.length >= 2, staleTime: 15_000, queryFn: () => api<{ groups: Group[] }>(`/search?q=${encodeURIComponent(term)}`) });

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Row[] = [];
    if (!needle) {
      for (const h of recent) out.push({ key: `r:${h.href}`, group: "Recent", title: h.title, subtitle: h.subtitle, href: h.href, icon: History });
      for (const p of pages.slice(0, 8)) out.push({ key: `p:${p.href}`, group: "Go to", title: p.label, subtitle: p.section, href: p.href, icon: p.icon });
      return out;
    }
    for (const p of pages.filter((p) => p.label.toLowerCase().includes(needle)).slice(0, 5)) out.push({ key: `p:${p.href}`, group: "Pages", title: p.label, subtitle: p.section, href: p.href, icon: p.icon });
    if (term === q.trim()) for (const g of search.data?.groups ?? []) for (const i of g.items) out.push({ key: `${g.type}:${i.id}`, group: g.label, title: i.title, subtitle: i.subtitle, href: i.href, icon: ICON[g.type] ?? FileText });
    return out;
  }, [q, term, pages, recent, search.data]);

  useEffect(() => { setActive(0); }, [rows.length, term]);
  useEffect(() => { list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const go = (r: Row) => {
    saveRecent({ id: r.key, title: r.title, subtitle: r.subtitle, href: r.href });
    onOpenChange(false);
    router.push(r.href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (rows.length ? (a + 1) % rows.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0)); }
    else if (e.key === "Enter" && rows[active]) { e.preventDefault(); go(rows[active]); }
  };

  const searching = term.length >= 2 && (search.isFetching || term !== q.trim());
  const empty = q.trim().length >= 2 && !searching && rows.length === 0;
  let lastGroup = "";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0d1411]/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[16px] border border-border bg-card shadow-card focus:outline-none" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Search and jump to</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-divider px-4">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search people, jobs, contracts… or jump to a page"
              role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={rows[active] ? `palette-opt-${active}` : undefined} aria-autocomplete="list" aria-label="Search"
              style={{ outline: "none", boxShadow: "none" }} className="h-14 w-full border-0 bg-transparent text-[15px] placeholder:text-muted"
            />
            {searching ? <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-label="Searching" /> : <kbd className="hidden shrink-0 rounded border border-border bg-background-2 px-1.5 text-[11px] text-muted sm:block">Esc</kbd>}
          </div>
          <div ref={list} id="palette-list" role="listbox" aria-label="Results" className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
            {rows.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <div key={r.key}>
                  {header && <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">{header}</p>}
                  <button
                    id={`palette-opt-${i}`} data-idx={i} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => go(r)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", i === active ? "bg-primary text-primary-foreground" : "hover:bg-background-2")}
                  >
                    <r.icon className={cn("size-4 shrink-0", i === active ? "text-primary-foreground/80" : "text-foreground-2")} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.title}</span>{r.subtitle && <span className={cn("block truncate text-xs", i === active ? "text-primary-foreground/70" : "text-muted")}>{r.subtitle}</span>}</span>
                    {i === active && <CornerDownLeft className="size-3.5 shrink-0 opacity-70" />}
                  </button>
                </div>
              );
            })}
            {empty && <p className="px-3 py-8 text-center text-sm text-muted">Nothing found for “{q.trim()}”. Try a name, a number like CON-0001, or a job title.</p>}
            {q.trim().length === 1 && <p className="px-3 py-6 text-center text-sm text-muted">Keep typing…</p>}
            {search.isError && <p className="px-3 py-6 text-center text-sm text-danger">Search isn&apos;t available right now.</p>}
          </div>
          <div className="flex items-center justify-between border-t border-divider px-4 py-2 text-[11px] text-muted" aria-hidden>
            <span><kbd className="rounded border border-border bg-background-2 px-1">↑</kbd> <kbd className="rounded border border-border bg-background-2 px-1">↓</kbd> to move</span>
            <span><kbd className="rounded border border-border bg-background-2 px-1">↵</kbd> to open</span>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{rows.length} result{rows.length === 1 ? "" : "s"}</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
