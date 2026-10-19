export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api";

export interface PageMeta { page: number; limit: number; total: number; totalPages: number }
export interface ApiList<T> { items: T[]; meta: PageMeta }

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: string[],
  ) {
    super(message);
  }
}

type Envelope = { success: true; data: unknown; meta?: PageMeta };

let refreshing: Promise<boolean> | null = null;

/** One in-flight refresh shared by all callers; resolves false when the session can't be renewed. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  try {
    // FormData sets its own multipart boundary header; everything else is JSON.
    const json = !(init?.body instanceof FormData);
    return await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...init,
      headers: { ...(json ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "We couldn't reach the server. Check your connection and try again.");
  }
}

async function request(path: string, init?: RequestInit): Promise<Envelope> {
  let res = await raw(path, init);
  // Expired access token: renew once and replay. Auth endpoints report their own 401s.
  if (res.status === 401 && !path.startsWith("/auth/") && (await refreshSession())) res = await raw(path, init);

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? "ERROR", e?.message ?? res.statusText, e?.details);
  }
  return body as Envelope;
}

const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) });

/** Single resource: returns the unwrapped `data`. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).data as T;
}
export const apiPost = <T>(path: string, data?: unknown) => api<T>(path, json("POST", data));

/** Paginated list: returns `{ items, meta }`. */
export async function apiList<T>(path: string, init?: RequestInit): Promise<ApiList<T>> {
  const body = await request(path, init);
  return { items: body.data as T[], meta: body.meta! };
}

/** Multipart upload (resume, supporting documents). */
export function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file);
  return api<T>(path, { method: "POST", body: form });
}

/** URL for an authorised document download (cookies are sent by the browser). */
export const documentUrl = (id: string, inline = false) => `${API_URL}/documents/${id}/download${inline ? "?inline=1" : ""}`;
