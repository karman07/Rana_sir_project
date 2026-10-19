"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** A horizontally scrolling row with snap points and previous/next buttons (the "browse" scroll used on the landing page). */
export function HScroller({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);
  useEffect(() => { update(); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }, [update, children]);

  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(ref.current.clientWidth * 0.8, 280), behavior: "smooth" });
  const btn = "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-card transition-opacity hover:bg-background-2 disabled:pointer-events-none disabled:opacity-0 md:flex";

  return (
    <div className={cn("relative", className)}>
      <button type="button" aria-label={`Scroll ${label} left`} disabled={edge.start} onClick={() => by(-1)} className={cn(btn, "-left-5")}><ChevronLeft className="size-5" /></button>
      <div ref={ref} onScroll={update} role="region" aria-label={label} tabIndex={0}
        className="-mx-5 flex snap-x snap-mandatory scroll-pl-5 gap-5 overflow-x-auto scroll-smooth px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      <button type="button" aria-label={`Scroll ${label} right`} disabled={edge.end} onClick={() => by(1)} className={cn(btn, "-right-5")}><ChevronRight className="size-5" /></button>
    </div>
  );
}
