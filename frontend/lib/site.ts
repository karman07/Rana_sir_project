import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_URL, api } from "./api";

export interface SiteContent {
  announcement: { enabled: boolean; text: string; linkLabel: string; linkUrl: string };
  hero: { headline: string; subheadline: string; searchPlaceholder: string; backgroundImage: string; backgroundVideo: string; overlayStrength: number };
  quickLinks: { label: string; query: string }[];
  trustedBy: { enabled: boolean; label: string; companies: { name: string; logo: string; url: string }[] };
  categories: { enabled: boolean; title: string; items: { label: string; query: string; description: string }[] };
  featuredJobs: { title: string; subtitle: string; count: number };
  stats: { show: boolean };
  testimonials: { enabled: boolean; title: string; items: { quote: string; name: string; role: string; company: string }[] };
  faqs: { q: string; a: string }[];
  contact: { email: string; phone: string; address: string; hours: string };
  footer: { tagline: string };
  seo: { title: string; description: string };
}

const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

/** Uploaded images are stored as `/api/public/assets/<file>`; resolve them against the API server. */
export const assetUrl = (path: string) => (path.startsWith("/") ? `${API_ORIGIN}${path}` : path);

const subscribe = () => () => {};
/** False on the server and during hydration, true afterwards. Lets cached data appear only after the first client render matches the server HTML. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/** Public data hook: identical first render on server and client, even if another component already fetched it. */
export function useAfterHydration<T>(data: T | undefined): T | undefined {
  return useHydrated() ? data : undefined;
}

export function useSiteContent() {
  const q = useQuery({ queryKey: ["public", "site"], queryFn: () => api<SiteContent>("/public/site"), staleTime: 60_000 });
  const hydrated = useHydrated();
  return { ...q, data: hydrated ? q.data : undefined, isPending: q.isPending || !hydrated };
}
