import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={cn(
              "flex size-6 items-center justify-center rounded-full border text-xs font-medium",
              done && "border-primary bg-primary text-primary-foreground",
              active && "border-primary text-primary",
              !done && !active && "text-muted",
            )}>
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("whitespace-nowrap text-sm", active ? "font-medium" : "text-foreground-2")}>{label}</span>
            {i < steps.length - 1 && <span className={cn("mx-1 h-px w-8", done ? "bg-primary" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}
