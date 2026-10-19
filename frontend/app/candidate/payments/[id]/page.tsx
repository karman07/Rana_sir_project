import { Suspense } from "react";
import { PaymentDetailView } from "@/components/payments/payment-detail";

async function Inner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentDetailView id={id} role="candidate" />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}
