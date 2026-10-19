"use client";

import { usePathname } from "next/navigation";
import { Hammer } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "./page-header";
import { findNavItem, type RoleKey } from "./nav";

export function ComingSoon({ role }: { role: RoleKey }) {
  const pathname = usePathname();
  const item = findNavItem(role, pathname);
  const title = item?.label ?? "Page";
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={item?.icon ?? Hammer} title={`${title} is being built`}
        description="The shell, navigation and permissions are ready. This screen is delivered in a later build part." />
    </>
  );
}
