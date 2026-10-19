"use client";

import { useSearchParams } from "next/navigation";
import { JobSearch } from "@/components/candidate/job-search";

export function PublicJobs() {
  return <JobSearch publicMode initialSearch={useSearchParams().get("search") ?? ""} />;
}
