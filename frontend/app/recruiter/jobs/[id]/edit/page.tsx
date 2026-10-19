import { Suspense } from "react";
import { EditJobRequest } from "@/components/jobs/edit-job-request";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditJobRequest id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
