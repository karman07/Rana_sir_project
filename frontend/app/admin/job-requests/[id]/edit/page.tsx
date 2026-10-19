import { Suspense } from "react";
import { AdminEditJob } from "@/components/jobs/admin-edit-job";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminEditJob id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
