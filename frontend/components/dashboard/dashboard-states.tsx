import { ErrorState } from "@/components/feedback/error-state";
import { ApiError } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 w-full rounded-[16px]" />)}</div>
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72 w-full rounded-[16px]" /><Skeleton className="h-72 w-full rounded-[16px]" /></div>
    </div>
  );
}

export function DashboardError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const network = error instanceof ApiError && error.status === 0;
  return <ErrorState compact variant={network ? "network" : "server"} onRetry={onRetry} />;
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
