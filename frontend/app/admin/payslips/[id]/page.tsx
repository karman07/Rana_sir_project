import { Suspense } from "react";
import { PayslipView } from "@/components/payslips/payslip-view";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayslipView id={id} role="admin" />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
