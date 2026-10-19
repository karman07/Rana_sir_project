import { Suspense } from "react";
import { ContractDetailView } from "@/components/contracts/contract-detail";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractDetailView id={id} role="admin" />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
