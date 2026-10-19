import { ContractsList } from "@/components/contracts/contracts-list";

export const metadata = { title: "Contract changes" };

export default function Page() {
  return <ContractsList role="admin" view="changes" />;
}
