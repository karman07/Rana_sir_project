"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Save } from "lucide-react";
import { toast } from "sonner";
import { api, apiPost, ApiError } from "@/lib/api";
import type { Match } from "@/lib/screening";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { ScoreBar } from "./score-bar";

interface Props { applicationId: string; adminScore?: number; resumeScore?: number; adminNotes?: string; tags?: string[]; closed?: boolean }

const parse = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** Admin's scoring workspace for one application: the guide (automatic match) and the decision (scores, notes, tags). */
export function ScreeningPanel({ applicationId, adminScore, resumeScore, adminNotes, tags, closed }: Props) {
  const qc = useQueryClient();
  const match = useQuery({ queryKey: ["match", applicationId], queryFn: () => api<Match>(`/screening/${applicationId}/match`) });
  const [admin, setAdmin] = useState(adminScore?.toString() ?? "");
  const [resume, setResume] = useState(resumeScore?.toString() ?? "");
  const [notes, setNotes] = useState(adminNotes ?? "");
  const [tagList, setTagList] = useState<string[]>(tags ?? []);
  useEffect(() => { setAdmin(adminScore?.toString() ?? ""); setResume(resumeScore?.toString() ?? ""); setNotes(adminNotes ?? ""); setTagList(tags ?? []); }, [adminScore, resumeScore, adminNotes, tags]);

  const invalid = (v: string) => v !== "" && !(/^\d{1,3}$/.test(v) && Number(v) <= 100);
  const save = useMutation({
    mutationFn: () => apiPost(`/screening/${applicationId}`, { adminScore: parse(admin), resumeScore: parse(resume), notes, tags: tagList }),
    onSuccess: () => { toast.success("Screening saved"); for (const k of ["application", "screening", "audit", "applications"]) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e) => toast.error(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not save"),
  });
  const m = match.data;

  return (
    <Card>
      <CardHeader title="Screening" description="Score the candidate and leave notes for the team." />
      <CardBody className="space-y-4">
        {m && (
          <div className="rounded-xl bg-background-2 p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted">Job match (guide)</span><span className="text-lg font-semibold tabular-nums">{m.overall}%</span></div>
            <div className="space-y-1.5 text-xs text-foreground-2">
              <div className="flex items-center justify-between"><span>Skills</span><ScoreBar value={m.skills.percent} /></div>
              <div className="flex items-center justify-between"><span>Experience <span className="text-muted">({m.experience.years ?? "?"} vs {m.experience.required})</span></span><ScoreBar value={m.experience.percent} /></div>
              <div className="flex items-center justify-between"><span>Salary <span className="text-muted">({m.salary.note})</span></span><ScoreBar value={m.salary.percent} /></div>
            </div>
            {m.skills.missing.length > 0 && <p className="mt-2 text-xs text-danger">Missing: {m.skills.missing.join(", ")}</p>}
            {m.skills.matched.length > 0 && <p className="mt-1 flex items-start gap-1 text-xs text-success"><Check className="mt-0.5 size-3 shrink-0" />{m.skills.matched.join(", ")}</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your score (0–100)" htmlFor="s-admin" error={invalid(admin) ? "0–100" : undefined}><Input id="s-admin" inputMode="numeric" disabled={closed} value={admin} onChange={(e) => setAdmin(e.target.value)} /></Field>
          <Field label="Resume score" htmlFor="s-resume" error={invalid(resume) ? "0–100" : undefined}><Input id="s-resume" inputMode="numeric" disabled={closed} value={resume} onChange={(e) => setResume(e.target.value)} /></Field>
        </div>
        <Field label="Tags" htmlFor="s-tags"><TagInput id="s-tags" value={tagList} onChange={setTagList} placeholder="strong-communicator, follow-up…" max={12} /></Field>
        <Field label="Internal notes" htmlFor="s-notes" hint="Shared with the recruiter when you send this candidate."><Textarea id="s-notes" rows={4} disabled={closed} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <Button className="w-full" disabled={closed || invalid(admin) || invalid(resume)} loading={save.isPending} onClick={() => save.mutate()}><Save />Save screening</Button>
      </CardBody>
    </Card>
  );
}
