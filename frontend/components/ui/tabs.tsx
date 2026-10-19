"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...p }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List className={cn("flex gap-1 overflow-x-auto border-b border-divider", className)} {...p} />
);
export const TabsTrigger = ({ className, ...p }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn("-mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-foreground-2 transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground", className)}
    {...p}
  />
);
export const TabsContent = ({ className, ...p }: TabsPrimitive.TabsContentProps) => (
  <TabsPrimitive.Content className={cn("pt-5", className)} {...p} />
);
