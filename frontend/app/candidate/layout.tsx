import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AppShell role="candidate">{children}</AppShell>
    </Suspense>
  );
}
