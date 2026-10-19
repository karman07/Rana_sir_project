"use client";

import { useAuthDialog } from "@/components/auth/auth-dialog";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, Menu, X } from "lucide-react";
import { HOME, useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shell/sidebar";
import { cn } from "@/lib/utils";

export const PUBLIC_LINKS = [
  { href: "/jobs", label: "Find jobs" },
  { href: "/for-companies", label: "For companies" },
  { href: "/for-candidates", label: "For candidates" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/contact", label: "Contact" },
];

export function PublicHeader() {
  const { user, loading } = useSession();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const auth = useAuthDialog();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // On the landing page the header floats over the dark hero until the page is scrolled.
  const onHero = pathname === "/" && !scrolled;
  const actions = (mobile = false) =>
    user ? (
      <Button asChild className={mobile ? "w-full" : undefined}><Link href={HOME[user.role]}>Open dashboard<ArrowRight /></Link></Button>
    ) : (
      <>
        <Button variant={mobile ? "secondary" : "ghost"} className={cn(mobile && "w-full", !mobile && onHero && "text-[#f7f4ec] hover:bg-white/10 hover:text-white")} onClick={() => { setOpen(false); auth.open({ mode: "signin" }); }}>Sign in</Button>
        <Button className={cn(mobile && "w-full", !mobile && onHero && "bg-[#f7f4ec] text-[#173b2f] hover:bg-white")} onClick={() => { setOpen(false); auth.open({ mode: "signup" }); }}>Get started<ArrowRight /></Button>
      </>
    );

  return (
    <header className={cn("sticky top-0 z-40 transition-colors", scrolled || pathname !== "/" ? "border-b border-border bg-background/85 backdrop-blur" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" aria-label="Talentbridge home"><Logo light={onHero} /></Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {PUBLIC_LINKS.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href + "/"));
            return <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-2 text-sm transition-colors", onHero ? "text-[#f7f4ec]/85 hover:text-white" : "hover:text-foreground", active ? (onHero ? "font-medium text-white" : "font-medium text-foreground") : onHero ? "" : "text-foreground-2")}>{l.label}</Link>;
          })}
        </nav>
        <div className={cn("ml-auto hidden items-center gap-2 lg:flex", loading && "opacity-0")}>{actions()}</div>
        <button className={cn("ml-auto rounded-lg p-2 lg:hidden", onHero ? "text-[#f7f4ec] hover:bg-white/10" : "text-foreground-2 hover:bg-background-2")} aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
      </div>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0d1411]/40 lg:hidden" />
          <DialogPrimitive.Content className="fixed right-0 top-0 z-50 flex h-full w-[min(88vw,22rem)] flex-col bg-card p-5 shadow-card lg:hidden">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Site navigation</DialogPrimitive.Description>
            <div className="mb-6 flex items-center justify-between"><Logo /><DialogPrimitive.Close aria-label="Close menu" className="rounded-md p-1.5 hover:bg-background-2"><X className="size-5" /></DialogPrimitive.Close></div>
            <nav className="flex flex-1 flex-col gap-1">
              {PUBLIC_LINKS.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base font-medium hover:bg-background-2">{l.label}</Link>)}
            </nav>
            <div className="flex flex-col gap-2">{actions(true)}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </header>
  );
}
