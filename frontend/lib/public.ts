export interface PublicStats { openJobs: number; companies: number; candidates: number; placements: number; departments: { name: string; count: number }[] }

/** Compact, honest numbers: exact below 1,000, otherwise rounded down with a "+". */
export function compactCount(n: number) {
  if (n < 1000) return String(n);
  return `${Math.floor(n / 100) / 10}k+`.replace(".0k", "k");
}
