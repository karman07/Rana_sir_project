"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as LineIcon, Table2 } from "lucide-react";
import { bucketLabel, type BucketKind, type SeriesPoint } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export interface SeriesDef { key: string; label: string; color: string }
export const VIZ = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)"] as const;
const AXIS = { fontSize: 12, fill: "var(--muted)" } as const;

function Tip({ active, payload, label, series, kind, fmt }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; series: SeriesDef[]; kind: BucketKind; fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-card">
      <p className="mb-1 font-medium">{bucketLabel(label!, kind)}</p>
      {series.map((s) => (
        <p key={s.key} className="flex items-center gap-2 text-foreground-2">
          <span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}
          <span className="ml-auto pl-4 font-medium tabular-nums text-foreground">{fmt(payload.find((p) => p.dataKey === s.key)?.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Change over time as a line (counts) or grouped bars (money by month). One axis, thin marks, a quiet grid, a legend whenever there is more
 * than one series, a hover tooltip, and a table view so nothing depends on colour alone.
 */
export function TimeChart({ title, description, data, series, kind, bucket, fmt = (n) => n.toLocaleString(), axisFmt, height = 240 }: {
  title: string; description?: string; data: SeriesPoint[]; series: SeriesDef[]; kind: "line" | "bar"; bucket: BucketKind; fmt?: (n: number) => string; axisFmt?: (n: number) => string; height?: number;
}) {
  const [table, setTable] = useState(false);
  const total = (k: string) => data.reduce((n, d) => n + Number(d[k] ?? 0), 0);
  const tick = (b: string) => bucketLabel(b, bucket);
  const every = Math.max(0, Math.ceil(data.length / 8) - 1);
  const empty = data.length === 0 || series.every((s) => total(s.key) === 0);

  return (
    <Card>
      <CardHeader title={title} description={description}
        action={<Button variant="ghost" size="sm" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? <LineIcon /> : <Table2 />}{table ? "Chart" : "Table"}</Button>} />
      <CardBody>
        {series.length > 1 && (
          <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-foreground-2">
                {kind === "line" ? <span className="h-0.5 w-4 rounded" style={{ background: s.color }} /> : <span className="size-2.5 rounded-sm" style={{ background: s.color }} />}
                {s.label}<span className="font-medium tabular-nums text-foreground">{fmt(total(s.key))}</span>
              </li>
            ))}
          </ul>
        )}
        {table ? (
          <div className="overflow-auto rounded-lg border border-divider" style={{ maxHeight: height }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 font-medium">When</th>{series.map((s) => <th key={s.key} className="px-3 py-2 text-right font-medium">{s.label}</th>)}</tr></thead>
              <tbody>{[...data].reverse().map((d) => <tr key={d.bucket} className="border-t border-divider"><td className="px-3 py-1.5">{tick(d.bucket)}</td>{series.map((s) => <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">{fmt(Number(d[s.key] ?? 0))}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : empty ? (
          <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>Nothing in this period yet.</div>
        ) : (
          <div style={{ height }} role="img" aria-label={`${title}: ${series.map((s) => `${fmt(total(s.key))} ${s.label.toLowerCase()}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              {kind === "line" ? (
                <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke="var(--divider)" vertical={false} />
                  <XAxis dataKey="bucket" tickFormatter={tick} interval={every} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--divider)" }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} tickFormatter={(v) => (axisFmt ?? fmt)(Number(v))} />
                  <Tooltip content={<Tip series={series} kind={bucket} fmt={fmt} />} cursor={{ stroke: "var(--border)" }} />
                  {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={data.length <= 14 ? { r: 3, strokeWidth: 2, stroke: "var(--card)", fill: s.color } : false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }} />)}
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }} barGap={2} barCategoryGap="28%">
                  <CartesianGrid stroke="var(--divider)" vertical={false} />
                  <XAxis dataKey="bucket" tickFormatter={tick} interval={every} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--divider)" }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => (axisFmt ?? fmt)(Number(v))} />
                  <Tooltip content={<Tip series={series} kind={bucket} fmt={fmt} />} cursor={{ fill: "var(--background-2)" }} />
                  {series.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />)}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** A ranked list as horizontal bars: names are readable, the count is on the bar, one colour because it is one measure. */
export function RankedBars({ title, description, rows, empty = "Nothing yet." }: { title: string; description?: string; rows: { label: string; value: number; sub?: string }[]; empty?: string }) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {rows.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
          <ol className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate" title={r.label}>{r.label}{r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}</span>
                <div className="h-3 rounded-full bg-background-2"><div className="h-3 rounded-full" style={{ width: `${Math.max(3, (r.value / top) * 100)}%`, background: "var(--viz-1)" }} /></div>
                <span className="w-10 text-right font-medium tabular-nums">{r.value}</span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
