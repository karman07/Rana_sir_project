import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/public/page-hero";
import { PublicJobs } from "@/components/public/public-jobs";

export const metadata: Metadata = { title: "Find jobs", description: "Browse open roles. Every job is reviewed and approved by our team before it is published." };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Find jobs" title="Roles worth applying for" description="Every job here has been reviewed and approved by our team — with pay (hourly or monthly) and requirements shown up front." />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Suspense><PublicJobs /></Suspense>
      </div>
    </>
  );
}
