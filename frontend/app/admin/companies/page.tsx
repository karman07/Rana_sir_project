import { CompaniesView } from "@/components/companies/companies-view";

export const metadata = { title: "Companies" };

export default function Page() {
  return <CompaniesView mode="admin" />;
}
