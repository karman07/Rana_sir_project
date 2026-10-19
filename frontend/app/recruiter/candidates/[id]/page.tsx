import { Suspense } from "react";
import { RecruiterReview } from "@/components/screening/recruiter-review";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecruiterReview id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
