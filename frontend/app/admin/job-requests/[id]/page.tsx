import { Suspense } from "react";
import { AdminJobReview } from "@/components/jobs/admin-job-review";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminJobReview id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
