import { Suspense } from "react";
import { SalaryDetailView } from "@/components/salary/salary-detail";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SalaryDetailView id={id} role="admin" />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
