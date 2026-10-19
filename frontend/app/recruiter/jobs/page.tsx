import { JobRequestList } from "@/components/jobs/job-request-list";

export const metadata = { title: "Your openings" };

export default function Page() {
  return <JobRequestList mode="recruiter" />;
}
