"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";

/** "Request more candidates" — goes to Admin as an item in the Approval Center (spec §27). */
export function RequestMoreDialog({ jobId, jobTitle, trigger }: { jobId: string; jobTitle?: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("3");
  const [reason, setReason] = useState("");
  const [req, setReq] = useState("");
  const [comments, setComments] = useState("");
  const send = useMutation({
    mutationFn: () => apiPost(`/jobs/${jobId}/request-more-candidates`, { count: Number(count), reason, updatedRequirements: req || undefined, comments: comments || undefined }),
    onSuccess: () => { toast.success("Request sent to our team"); setOpen(false); setReason(""); setReq(""); setComments(""); },
    onError: (e) => toast.error(e instanceof ApiError ? (e.code === "REQUEST_EXISTS" ? e.message : (e.details?.[0] ?? e.message)) : "Could not send"),
  });
  const valid = /^\d{1,3}$/.test(count) && Number(count) >= 1 && reason.trim().length >= 5;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button variant="secondary"><UsersRound />Request more candidates</Button>}</DialogTrigger>
      <DialogContent title="Request more candidates" description={jobTitle ? `For ${jobTitle}. Our team will review and source more candidates.` : "Our team will review and source more candidates."}>
        <div className="space-y-4">
          <Field label="How many more?" htmlFor="rm-count"><Input id="rm-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Why do you need more?" htmlFor="rm-reason"><Textarea id="rm-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. None of the candidates so far have the cloud experience we need." /></Field>
          <Field label="Updated requirements" htmlFor="rm-req" hint="Optional"><Textarea id="rm-req" rows={2} value={req} onChange={(e) => setReq(e.target.value)} /></Field>
          <Field label="Comments" htmlFor="rm-com" hint="Optional"><Input id="rm-com" value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
          <div className="flex justify-end"><Button disabled={!valid} loading={send.isPending} onClick={() => send.mutate()}>Send request</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
