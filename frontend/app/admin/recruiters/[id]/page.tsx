import { Suspense } from "react";
import { RecruiterProfile } from "@/components/admin/profiles";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecruiterProfile id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
