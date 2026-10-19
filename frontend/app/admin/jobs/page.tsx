import { JobsList } from "@/components/jobs/jobs-list";

export const metadata = { title: "Jobs" };

export default function Page() {
  return <JobsList mode="admin" />;
}
