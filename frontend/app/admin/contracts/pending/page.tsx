import { ContractsList } from "@/components/contracts/contracts-list";

export const metadata = { title: "Pending contracts" };

export default function Page() {
  return <ContractsList role="admin" view="pending" />;
}
