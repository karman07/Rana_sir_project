"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Logo } from "@/components/shell/sidebar";
import { EmbeddedAuthContext, LoginForm, RegisterForm, type EmbeddedAuth } from "./forms";

type Mode = "signin" | "signup";
interface OpenOptions { mode?: Mode; next?: string; as?: "candidate" | "recruiter" }
interface Ctx { open: (o?: OpenOptions) => void; close: () => void }

const AuthDialogContext = createContext<Ctx | null>(null);

/** Opens the sign-in / sign-up dialog from anywhere. Falls back to a no-op outside the provider. */
export function useAuthDialog(): Ctx {
  return useContext(AuthDialogContext) ?? { open: () => undefined, close: () => undefined };
}

/** Closes the dialog when the route changes. Kept in its own component so only it waits on the URL. */
function CloseOnNavigate({ close }: { close: () => void }) {
  const pathname = usePathname();
  useEffect(() => { close(); }, [pathname, close]);
  return null;
}

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(OpenOptions & { mode: Mode }) | null>(null);
  const close = useCallback(() => setState(null), []);
  const open = useCallback((o: OpenOptions = {}) => setState({ mode: "signin", ...o }), []);

  const embedded = useMemo<EmbeddedAuth | null>(() => state && ({
    next: state.next ?? null, as: state.as, close,
    switchTo: (mode, as) => setState((s) => s && { ...s, mode, as: as ?? s.as }),
  }), [state, close]);

  const ctx = useMemo(() => ({ open, close }), [open, close]);

  return (
    <AuthDialogContext.Provider value={ctx}>
      {children}
      <Suspense><CloseOnNavigate close={close} /></Suspense>
      <DialogPrimitive.Root open={!!state} onOpenChange={(o) => !o && close()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0d1411]/55 backdrop-blur-[2px]" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border border-border bg-card p-7 shadow-card focus:outline-none">
            <DialogPrimitive.Title className="sr-only">{state?.mode === "signup" ? "Create your account" : "Sign in"}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Sign in or create an account to continue.</DialogPrimitive.Description>
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-background-2 hover:text-foreground" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
            <div className="mb-6"><Logo /></div>
            {embedded && (
              <EmbeddedAuthContext.Provider value={embedded}>
                <Suspense>{state?.mode === "signup" ? <RegisterForm key="signup" /> : <LoginForm key="signin" />}</Suspense>
              </EmbeddedAuthContext.Provider>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </AuthDialogContext.Provider>
  );
}
