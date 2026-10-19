import { Suspense } from "react";
import { RecruiterJobDetail } from "@/components/jobs/recruiter-job-detail";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecruiterJobDetail id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
