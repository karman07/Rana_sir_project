"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { apiPost, api, ApiError } from "@/lib/api";
import type { InterviewItem } from "@/lib/interviews";
import { TYPE_LABEL } from "@/lib/interviews";
import { browserZone, timezones, utcToZonedParts, zonedTimeToUtc } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";

type Mode = { kind: "create"; applicationId: string; candidateName?: string } | { kind: "edit"; interview: InterviewItem };

const DURATIONS = [15, 30, 45, 60, 90, 120];

/** Schedule a new interview, or edit/reschedule an existing one. A changed time creates the new slot and keeps the old as history. */
export function ScheduleInterviewDialog({ mode, trigger, open: openProp, onOpenChange }: { mode: Mode; trigger?: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const edit = mode.kind === "edit" ? mode.interview : null;

  const zones = useMemo(() => timezones(), []);
  const initialTz = edit?.timezone ?? browserZone();
  const initialParts = edit ? utcToZonedParts(edit.startsAt, initialTz) : { date: "", time: "10:00" };
  const [tz, setTz] = useState(initialTz);
  const [date, setDate] = useState(initialParts.date);
  const [time, setTime] = useState(initialParts.time);
  const [type, setType] = useState<InterviewItem["type"]>(edit?.type ?? "VIDEO");
  const [minutes, setMinutes] = useState(String(edit?.durationMinutes ?? 45));
  const [link, setLink] = useState(edit?.meetingLink ?? "");
  const [location, setLocation] = useState(edit?.location ?? "");
  const [phone, setPhone] = useState(edit?.phoneNumber ?? "");
  const [interviewers, setInterviewers] = useState<string[]>(edit?.interviewers.map((i) => i.name) ?? []);
  const [instructions, setInstructions] = useState(edit?.instructions ?? "");
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  const startsAt = date && time ? zonedTimeToUtc(date, time, tz) : null;
  const moved = !!(edit && startsAt && Math.abs(+startsAt - +new Date(edit.startsAt)) >= 60_000);
  const missing = type === "VIDEO" ? !link.trim() : type === "IN_PERSON" ? !location.trim() : false;
  const valid = !!startsAt && !missing && /^\d+$/.test(minutes);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        type, durationMinutes: Number(minutes), timezone: tz, startsAt: startsAt!.toISOString(),
        meetingLink: type === "VIDEO" ? link.trim() : undefined, location: type === "IN_PERSON" ? location.trim() : undefined, phoneNumber: type === "PHONE" ? phone.trim() || undefined : undefined,
        interviewers: interviewers.map((name) => ({ name })), instructions: instructions || undefined, notes: notes || undefined,
      };
      return mode.kind === "create" ? apiPost("/interviews", { ...body, applicationId: mode.applicationId }) : api(`/interviews/${mode.interview.id}`, { method: "PATCH", body: JSON.stringify({ ...body, reason: moved ? reason || undefined : undefined }) });
    },
    onSuccess: () => {
      toast.success(mode.kind === "create" ? "Interview scheduled. The candidate has been notified." : moved ? "Interview rescheduled. Everyone has been notified." : "Interview updated");
      for (const k of ["interviews", "interview", "application", "applications", "overview", "notifications"]) qc.invalidateQueries({ queryKey: [k] });
      setOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? (e.details?.[0] ?? e.message) : "Could not save the interview"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setError(undefined); }}>
      {trigger !== null && <DialogTrigger asChild>{trigger ?? <Button><CalendarPlus />Schedule interview</Button>}</DialogTrigger>}
      <DialogContent className="max-w-xl" title={mode.kind === "create" ? "Schedule an interview" : "Edit interview"} description={mode.kind === "create" ? (mode.candidateName ? `With ${mode.candidateName}. They're emailed and notified straight away.` : "The candidate is emailed and notified straight away.") : "Changing the date or time reschedules it and notifies everyone."}>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Interview type">
            {(Object.keys(TYPE_LABEL) as InterviewItem["type"][]).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${type === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-background-2"}`}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="iv-date"><Input id="iv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Time" htmlFor="iv-time"><Input id="iv-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Duration" htmlFor="iv-dur"><Select id="iv-dur" value={minutes} onChange={(e) => setMinutes(e.target.value)}>{DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}</Select></Field>
          </div>
          <Field label="Time zone" htmlFor="iv-tz" hint={startsAt ? `Starts ${startsAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} in your local time` : undefined}>
            <Select id="iv-tz" value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</Select>
          </Field>
          {type === "VIDEO" && <Field label="Meeting link" htmlFor="iv-link" hint="Zoom, Google Meet, Teams…"><Input id="iv-link" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} /></Field>}
          {type === "IN_PERSON" && <Field label="Location" htmlFor="iv-loc"><Input id="iv-loc" placeholder="Office address and floor" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>}
          {type === "PHONE" && <Field label="Phone number to call" htmlFor="iv-ph" hint="Optional. Defaults to the candidate's number."><Input id="iv-ph" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>}
          <Field label="Interviewers" htmlFor="iv-who" hint="Press Enter after each name"><TagInput id="iv-who" value={interviewers} onChange={setInterviewers} placeholder="Priya Nair…" max={8} /></Field>
          <Field label="Instructions for the candidate" htmlFor="iv-ins" hint="Shown to the candidate — how to join, what to prepare."><Textarea id="iv-ins" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
          <Field label="Internal notes" htmlFor="iv-notes" hint="Only our team and the recruiter see this."><Textarea id="iv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {moved && <Field label="Reason for rescheduling" htmlFor="iv-reason" hint="Optional. Included in the email to the candidate."><Input id="iv-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
          {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>{mode.kind === "create" ? "Schedule" : moved ? "Reschedule" : "Save changes"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
