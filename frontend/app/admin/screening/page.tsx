import { Suspense } from "react";
import { ScreeningWorkspace } from "@/components/screening/screening-workspace";

export const metadata = { title: "Screening" };

export default function Page() {
  return (
    <Suspense>
      <ScreeningWorkspace />
    </Suspense>
  );
}
