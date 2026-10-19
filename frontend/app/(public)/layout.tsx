import { Suspense } from "react";
import { AnnouncementBar } from "@/components/public/announcement-bar";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow-card">Skip to content</a>
      <AnnouncementBar />
      <Suspense fallback={<div className="h-16" />}>
        <PublicHeader />
      </Suspense>
      <main id="main" className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
