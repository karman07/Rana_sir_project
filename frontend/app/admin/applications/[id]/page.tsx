import { Suspense } from "react";
import { AdminApplicationDetail } from "@/components/applications/admin-application-detail";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminApplicationDetail id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
