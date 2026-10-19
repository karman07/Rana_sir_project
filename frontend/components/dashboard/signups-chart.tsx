"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface SignupPoint { date: string; candidates: number; recruiters: number }

const SERIES = [
  { key: "candidates", label: "Candidates", color: "var(--chart-1)" },
  { key: "recruiters", label: "Recruiters", color: "var(--chart-2)" },
] as const;

const short = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-card">
      <p className="mb-1 font-medium">{short(label!)}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center gap-2 text-foreground-2">
          <span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}
          <span className="ml-auto pl-4 font-medium tabular-nums text-foreground">{payload.find((p) => p.dataKey === s.key)?.value ?? 0}</span>
        </p>
      ))}
    </div>
  );
}

export function SignupsChart({ data }: { data: SignupPoint[] }) {
  const [table, setTable] = useState(false);
  const total = (k: "candidates" | "recruiters") => data.reduce((n, d) => n + d[k], 0);

  return (
    <Card>
      <CardHeader
        title="New sign-ups"
        description={`Last ${data.length} days`}
        action={<Button variant="ghost" size="sm" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? <LineIcon /> : <Table2 />}{table ? "Chart" : "Table"}</Button>}
      />
      <CardBody>
        <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-foreground-2">
              <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}
              <span className="font-medium tabular-nums text-foreground">{total(s.key)}</span>
            </li>
          ))}
        </ul>
        {table ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-divider">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Candidates</th><th className="px-3 py-2 font-medium">Recruiters</th></tr></thead>
              <tbody>{[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t border-divider"><td className="px-3 py-1.5">{short(d.date)}</td><td className="px-3 py-1.5 tabular-nums">{d.candidates}</td><td className="px-3 py-1.5 tabular-nums">{d.recruiters}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="h-56" role="img" aria-label={`Daily sign-ups: ${total("candidates")} candidates and ${total("recruiters")} recruiters in the last ${data.length} days`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--divider)" />
                <XAxis dataKey="date" tickFormatter={short} tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={12} minTickGap={32} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={12} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
                {SERIES.map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
