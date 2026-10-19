"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import { firebaseEnabled, googleIdToken } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** "Continue with Google" through Firebase; renders nothing until the Firebase config is in the environment. */
export function GoogleButton({ intent, onSuccess }: { intent?: "CANDIDATE" | "RECRUITER"; onSuccess: (u: SessionUser) => void }) {
  const [busy, setBusy] = useState(false);
  if (!firebaseEnabled) return null;

  const go = async () => {
    setBusy(true);
    try {
      const credential = await googleIdToken();
      const { user } = await apiPost<{ user: SessionUser }>("/auth/google", { credential, intent });
      onSuccess(user);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return; // they changed their mind
      toast.error(e instanceof ApiError ? e.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" size="lg" className="w-full gap-3" loading={busy} onClick={go}><GoogleMark />Continue with Google</Button>
      <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-divider" />or<span className="h-px flex-1 bg-divider" /></div>
    </>
  );
}
