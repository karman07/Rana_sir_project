"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send, Star } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import { RECOMMENDATION_LABEL } from "@/lib/interviews";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Rating({ label, value, onChange, required }: { label: string; value: number; onChange: (n: number) => void; required?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-foreground-2">{label}{required && <span className="text-danger"> *</span>}</p>
      <div className="flex gap-0.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(value === n && !required ? 0 : n)} className="rounded p-0.5 hover:scale-110">
            <Star className={cn("size-5 transition-colors", n <= value ? "fill-gold text-gold" : "text-border")} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Structured interview feedback. Submitting again revises your earlier entry. */
export function FeedbackForm({ interviewId, onSaved }: { interviewId: string; onSaved: () => void }) {
  const [overall, setOverall] = useState(0);
  const [tech, setTech] = useState(0);
  const [comm, setComm] = useState(0);
  const [culture, setCulture] = useState(0);
  const [rec, setRec] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: () => apiPost(`/interviews/${interviewId}/feedback`, {
      overallRating: overall, technicalRating: tech || undefined, communicationRating: comm || undefined, cultureFit: culture || undefined,
      recommendation: rec, strengths: strengths || undefined, weaknesses: weaknesses || undefined, notes: notes || undefined,
    }),
    onSuccess: () => { toast.success("Feedback saved"); onSaved(); },
    onError: (e) => toast.error(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not save feedback"),
  });

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-medium">Add your feedback</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Rating label="Overall" required value={overall} onChange={setOverall} />
        <Rating label="Technical" value={tech} onChange={setTech} />
        <Rating label="Communication" value={comm} onChange={setComm} />
        <Rating label="Culture fit" value={culture} onChange={setCulture} />
      </div>
      <Field label="Recommendation" htmlFor="fb-rec">
        <Select id="fb-rec" value={rec} onChange={(e) => setRec(e.target.value)}><option value="">Choose…</option>{Object.entries(RECOMMENDATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Strengths" htmlFor="fb-s"><Textarea id="fb-s" rows={3} value={strengths} onChange={(e) => setStrengths(e.target.value)} /></Field>
        <Field label="Weaknesses" htmlFor="fb-w"><Textarea id="fb-w" rows={3} value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} /></Field>
      </div>
      <Field label="Notes" htmlFor="fb-n"><Textarea id="fb-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button disabled={!overall || !rec} loading={save.isPending} onClick={() => save.mutate()}><Send />Submit feedback</Button>
    </div>
  );
}
