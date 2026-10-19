"use client";

import { ErrorState } from "@/components/feedback/error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState variant="server" onRetry={reset} />;
}
