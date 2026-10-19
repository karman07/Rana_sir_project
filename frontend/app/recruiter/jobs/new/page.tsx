import { JobRequestForm } from "@/components/jobs/job-request-form";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "New opening" };

export default function Page() {
  return (
    <>
      <PageHeader title="New opening" description="Tell us about the role. Our team reviews it before candidates can see it." />
      <JobRequestForm />
    </>
  );
}
