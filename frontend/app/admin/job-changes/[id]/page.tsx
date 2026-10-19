import { Suspense } from "react";
import { AdminJobChange } from "@/components/jobs/admin-job-change";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminJobChange id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
