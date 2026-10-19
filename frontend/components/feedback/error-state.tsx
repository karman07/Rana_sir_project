import Link from "next/link";
import { AlertTriangle, FileQuestion, Lock, ServerCrash, TimerReset, WifiOff, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VARIANTS = {
  "not-found": { icon: FileQuestion, code: "404", title: "We couldn't find that page", description: "It may have moved, or the link might be wrong." },
  forbidden: { icon: Lock, code: "403", title: "You don't have access to this", description: "Your role doesn't include this area. If you think that's a mistake, contact your admin." },
  server: { icon: ServerCrash, code: "500", title: "Something went wrong on our side", description: "We've logged the problem. Please try again in a moment." },
  network: { icon: WifiOff, code: "", title: "You appear to be offline", description: "Check your connection and try again." },
  session: { icon: TimerReset, code: "", title: "Your session has expired", description: "For your security you've been signed out. Sign in again to continue." },
  validation: { icon: AlertTriangle, code: "", title: "Some details need fixing", description: "Review the highlighted fields and try again." },
} satisfies Record<string, { icon: LucideIcon; code: string; title: string; description: string }>;

export type ErrorVariant = keyof typeof VARIANTS;

export function ErrorState({ variant, onRetry, className, compact }: {
  variant: ErrorVariant; onRetry?: () => void; className?: string; compact?: boolean;
}) {
  const v = VARIANTS[variant];
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-12" : "min-h-screen px-6", className)}>
      <div className="mb-5 flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold"><v.icon className="size-6" /></div>
      {v.code && <p className="mb-1 text-sm font-medium tracking-widest text-muted">{v.code}</p>}
      <h1 className="text-2xl font-semibold tracking-tight">{v.title}</h1>
      <p className="mt-2 max-w-md text-sm text-foreground-2">{v.description}</p>
      <div className="mt-6 flex gap-2">
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
        {variant === "session" ? <Button asChild><Link href="/">Sign in</Link></Button>
          : <Button variant={onRetry ? "secondary" : "primary"} asChild><Link href="/">Go home</Link></Button>}
      </div>
    </div>
  );
}
