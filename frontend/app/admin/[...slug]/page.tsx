import { Suspense } from "react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function Page() {
  return (
    <Suspense>
      <ComingSoon role="admin" />
    </Suspense>
  );
}
