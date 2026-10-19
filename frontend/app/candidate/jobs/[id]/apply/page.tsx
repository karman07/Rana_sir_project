import { Suspense } from "react";
import { ApplyForm } from "@/components/candidate/apply-form";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplyForm jobId={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
