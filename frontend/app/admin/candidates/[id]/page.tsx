import { Suspense } from "react";
import { AdminCandidateProfile } from "@/components/screening/candidate-profile";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminCandidateProfile id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
