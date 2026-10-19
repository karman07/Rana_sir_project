import { Skeleton } from "@/components/ui/skeleton";

export function ShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-64 shrink-0 border-r border-border bg-background-2/50 p-4 lg:block">
        <Skeleton className="mb-6 h-8 w-32" />
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="mb-2 h-8 w-full" />)}
      </div>
      <div className="flex-1">
        <div className="h-14 border-b border-border" />
        <div className="space-y-4 p-8"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>
      </div>
    </div>
  );
}
