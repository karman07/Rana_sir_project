import { PaymentsList } from "@/components/payments/payments-list";

export const metadata = { title: "Payments" };

export default function Page() {
  return <PaymentsList role="admin" />;
}
