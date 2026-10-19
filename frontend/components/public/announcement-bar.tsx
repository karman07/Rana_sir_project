"use client";

import Link from "next/link";
import { useSiteContent } from "@/lib/site";

/** Optional site-wide notice, switched on and written by Admin. */
export function AnnouncementBar() {
  const { data } = useSiteContent();
  const a = data?.announcement;
  if (!a?.enabled || !a.text.trim()) return null;
  return (
    <div className="bg-[#b89a5a] px-4 py-2 text-center text-sm font-medium text-[#18211d]">
      {a.text}
      {a.linkUrl && a.linkLabel && <Link href={a.linkUrl} className="ml-2 underline underline-offset-2 hover:no-underline">{a.linkLabel}</Link>}
    </div>
  );
}
