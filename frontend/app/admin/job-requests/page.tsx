import { JobRequestList } from "@/components/jobs/job-request-list";

export const metadata = { title: "Job requests" };

export default function Page() {
  return <JobRequestList mode="admin" />;
}
