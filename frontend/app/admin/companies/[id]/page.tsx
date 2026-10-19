import { Suspense } from "react";
import { CompanyProfile } from "@/components/admin/profiles";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyProfile id={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
