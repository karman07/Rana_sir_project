"use client";

import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import { AuthDialogProvider } from "@/components/auth/auth-dialog";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status > 0 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  // Light mode only for now: the dark palette stays in globals.css but is not exposed anywhere.
  return (
    <ThemeProvider attribute="class" forcedTheme="light" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <TooltipProvider delayDuration={200}><AuthDialogProvider>{children}</AuthDialogProvider></TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 12 },
        }}
      />
    </ThemeProvider>
  );
}
