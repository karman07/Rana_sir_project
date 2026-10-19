import { ContractsList } from "@/components/contracts/contracts-list";

export const metadata = { title: "Contracts" };

export default function Page() {
  return <ContractsList role="candidate" />;
}
