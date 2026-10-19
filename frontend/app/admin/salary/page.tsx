import { SalaryList } from "@/components/salary/salary-list";

export const metadata = { title: "Salary" };

export default function Page() {
  return <SalaryList role="admin" />;
}
