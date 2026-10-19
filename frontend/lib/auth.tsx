"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Role } from "@rms/shared";
import { api, apiPost, ApiError } from "./api";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  country?: string;
  currency?: string;
  avatarUrl?: string;
  recruiter?: { approvalStatus: string; reviewNote?: string; agencyName?: string };
}

export const HOME: Record<Role, string> = {
  ADMIN: "/admin/dashboard",
  RECRUITER: "/recruiter/dashboard",
  CANDIDATE: "/candidate/dashboard",
};

const SESSION_KEY = ["session"] as const;

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  setUser: (u: SessionUser) => void;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data, isPending } = useQuery({
    queryKey: SESSION_KEY,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const { user } = await api<{ user: SessionUser }>("/auth/me");
        return user;
      } catch (e) {
        // Access cookie may just have expired: try the refresh cookie once.
        if (e instanceof ApiError && e.status === 401) {
          try {
            const { user } = await apiPost<{ user: SessionUser }>("/auth/refresh");
            return user;
          } catch {
            return null;
          }
        }
        throw e;
      }
    },
  });

  const setUser = useCallback((u: SessionUser) => qc.setQueryData(SESSION_KEY, u), [qc]);
  const logout = useCallback(async () => {
    await apiPost("/auth/logout").catch(() => undefined);
    qc.clear();
    qc.setQueryData(SESSION_KEY, null);
    router.replace("/login");
  }, [qc, router]);

  const value = useMemo(() => ({ user: data ?? null, loading: isPending, setUser, logout }), [data, isPending, setUser, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useSession must be used inside AuthProvider");
  return ctx;
}
