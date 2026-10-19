import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicJobDetail } from "@/components/public/public-job-detail";

export const metadata: Metadata = { title: "Job details" };

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicJobDetail id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
