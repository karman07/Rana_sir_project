import { Check } from "lucide-react";
import { JOURNEY_LABELS, journeyIndex } from "@/lib/applications";
import { cn } from "@/lib/utils";

/** Horizontal progress through the hiring journey; compact enough for a phone. */
export function Journey({ status, className }: { status: string; className?: string }) {
  const closed = status === "REJECTED" || status === "WITHDRAWN";
  const idx = journeyIndex(status);
  return (
    <ol className={cn("flex w-full items-start", className)} aria-label="Hiring progress">
      {JOURNEY_LABELS.map((label, i) => {
        const done = !closed && (i < idx || status === "PLACED");
        const current = !closed && i === idx && status !== "PLACED";
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={cn("absolute left-[-50%] top-3 h-0.5 w-full", done || current ? "bg-primary" : "bg-border")} aria-hidden />}
            <span className={cn("z-10 flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
              done && "border-primary bg-primary text-primary-foreground", current && "border-gold bg-gold-soft text-gold", !done && !current && "border-border bg-card text-muted", closed && "opacity-50")}>
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("mt-1.5 text-[11px] leading-tight sm:text-xs", current ? "font-semibold text-foreground" : "text-muted")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
