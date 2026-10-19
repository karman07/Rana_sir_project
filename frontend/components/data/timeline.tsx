import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  title: string;
  description?: string;
  time?: string;
  state?: "done" | "current" | "upcoming";
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative">
      {items.map((item, i) => {
        const state = item.state ?? "done";
        return (
          <li key={i} className="relative flex gap-3 pb-6 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px bg-divider" />}
            <span className={cn(
              "z-10 mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border",
              state === "done" && "border-primary bg-primary text-primary-foreground",
              state === "current" && "border-gold bg-gold-soft",
              state === "upcoming" && "border-border bg-card",
            )}>
              {state === "done" ? <Check className="size-3" /> : state === "current" ? <span className="size-2 rounded-full bg-gold" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className={cn("text-sm font-medium", state === "upcoming" && "text-muted")}>{item.title}</p>
                {item.time && <time className="text-xs text-muted">{item.time}</time>}
              </div>
              {item.description && <p className="mt-0.5 text-sm text-foreground-2">{item.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const ActivityTimeline = Timeline;
