"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Eye, EyeOff, Loader2, MailCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Role } from "@rms/shared";
import { apiPost, ApiError } from "@/lib/api";
import { HOME, useSession, type SessionUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GoogleButton } from "./google-button";

const password = z.string().min(8, "At least 8 characters").max(72).regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number");

function Heading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-foreground-2">{description}</p>}
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className="pr-10" {...props} />
      <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-2 rounded p-1 text-muted hover:text-foreground">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{message}</p>;
}

const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

/** Where to go after authenticating: a safe `next` path inside the user's own area, otherwise their home. */
export function destinationFor(role: SessionUser["role"], next: string | null) {
  const prefix = `/${role.toLowerCase()}/`;
  // Only same-site paths in the user's own app area (blocks open redirects and cross-role links).
  return next && next.startsWith(prefix) && !next.startsWith("//") && !next.includes("://") ? next : HOME[role];
}

/**
 * The same forms run as full pages (/login, /register) and inside the sign-in dialog.
 * In the dialog there is no URL to read, so where to go next and how to switch forms come from here.
 */
export interface EmbeddedAuth { next: string | null; close: () => void; switchTo: (mode: "signin" | "signup", as?: "candidate" | "recruiter") => void; as?: "candidate" | "recruiter" }
export const EmbeddedAuthContext = createContext<EmbeddedAuth | null>(null);

function useNextParam() {
  const embedded = useContext(EmbeddedAuthContext);
  const params = useSearchParams();
  return embedded ? embedded.next : params.get("next");
}

function useAfterAuth() {
  const router = useRouter();
  const next = useNextParam();
  const embedded = useContext(EmbeddedAuthContext);
  const { setUser } = useSession();
  return useCallback((user: SessionUser) => {
    setUser(user);
    embedded?.close();
    router.replace(destinationFor(user.role, next));
  }, [router, next, setUser, embedded]);
}

/** Already signed in? Skip the form, but still honour where they were headed (e.g. a job they were applying for). */
function useRedirectIfSignedIn() {
  const { user, loading } = useSession();
  const router = useRouter();
  const next = useNextParam();
  const embedded = useContext(EmbeddedAuthContext);
  useEffect(() => { if (!embedded && !loading && user) router.replace(destinationFor(user.role, next)); }, [loading, user, router, next, embedded]);
}

/** Appends the current `next` destination to a link so it survives switching between sign in and register. */
function useWithNext() {
  const next = useNextParam();
  return (path: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);
}

/* ---------------- Email verification ---------------- */

function CheckInbox({ email, title = "Check your inbox" }: { email: string; title?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const resend = async () => {
    setState("sending");
    try { await apiPost("/auth/resend-verification-email", { email }); setState("sent"); }
    catch (e) { setState("idle"); toast.error(errorMessage(e)); }
  };
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><MailCheck className="size-6" /></div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-foreground-2">We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Open it to activate your account, then sign in.</p>
      <p className="mt-1 text-xs text-muted">The link works for 24 hours. Check your spam folder if you can't find it.</p>
      <Button type="button" variant="secondary" className="mt-5" loading={state === "sending"} disabled={state === "sent"} onClick={resend}>{state === "sent" ? "Sent again" : "Resend the email"}</Button>
    </div>
  );
}

/* ---------------- Login ---------------- */

const loginSchema = z.object({ email: z.email("Enter a valid email"), password: z.string().min(1, "Enter your password") });

export function LoginForm({ variant = "member" }: { variant?: "member" | "admin" }) {
  useRedirectIfSignedIn();
  const withNext = useWithNext();
  const afterAuth = useAfterAuth();
  const embedded = useContext(EmbeddedAuthContext);
  const [error, setError] = useState<string>();
  const [unverified, setUnverified] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });
  const admin = variant === "admin";

  const submit = handleSubmit(async (values) => {
    setError(undefined);
    try {
      const { user } = await apiPost<{ user: SessionUser }>("/auth/login", values);
      if (admin && user.role !== Role.ADMIN) {
        await apiPost("/auth/logout");
        setError("This sign-in is for platform administrators only.");
        return;
      }
      afterAuth(user);
    } catch (e) {
      if (e instanceof ApiError && e.code === "EMAIL_NOT_VERIFIED") setUnverified(values.email);
      else setError(errorMessage(e));
    }
  });

  if (unverified) return <CheckInbox email={unverified} title="Confirm your email first" />;

  return (
    <>
      <Heading title={admin ? "Admin sign in" : "Welcome back"} description={admin ? "Restricted to platform administrators." : "Sign in to continue to your workspace."} />
      {!admin && <GoogleButton onSuccess={afterAuth} />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
        </Field>
        <div className="text-right"><Link href="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link></div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Sign in</Button>
      </form>
      {!admin && (
        <p className="mt-6 text-center text-sm text-foreground-2">New here?{" "}
          {embedded
            ? <button type="button" onClick={() => embedded.switchTo("signup")} className="font-medium text-primary hover:underline">Create an account</button>
            : <Link href={withNext("/register")} className="font-medium text-primary hover:underline">Create an account</Link>}
        </p>
      )}
    </>
  );
}

/* ---------------- Register ---------------- */

const registerSchema = z.object({
  name: z.string().min(2, "Enter your full name").max(80),
  email: z.email("Enter a valid email"),
  password,
  agencyName: z.string().max(120).optional(),
});

export function RegisterForm() {
  useRedirectIfSignedIn();
  const withNext = useWithNext();
  const afterAuth = useAfterAuth();
  const params = useSearchParams();
  const embedded = useContext(EmbeddedAuthContext);
  const [kind, setKind] = useState<"candidate" | "recruiter">((embedded ? embedded.as : params.get("as")) === "recruiter" ? "recruiter" : "candidate");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(registerSchema) });

  const submit = handleSubmit(async (values) => {
    setError(undefined);
    try {
      const body = { ...values, agencyName: kind === "recruiter" ? values.agencyName || undefined : undefined, country: guessCountry() };
      const res = await apiPost<{ user: SessionUser | null; verificationRequired?: boolean; email?: string }>(`/auth/register/${kind}`, body);
      if (res.verificationRequired || !res.user) { setPending(res.email ?? values.email); return; }
      toast.success(kind === "recruiter" ? "Account created. An admin will review it shortly." : "Welcome aboard!");
      afterAuth(res.user);
    } catch (e) {
      if (e instanceof ApiError && e.details?.length) setError(e.details[0]);
      else setError(errorMessage(e));
    }
  });

  if (pending) return <CheckInbox email={pending} />;

  return (
    <>
      <Heading title="Create your account" description={kind === "candidate" ? "Find roles and track every step of your hiring." : "Post openings for your client companies. Accounts are reviewed by our team."} />
      <div role="tablist" className="mb-5 grid grid-cols-2 rounded-lg bg-background-2 p-1 text-sm">
        {(["candidate", "recruiter"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} type="button" onClick={() => setKind(k)}
            className={cn("rounded-md py-1.5 font-medium transition-colors", kind === k ? "bg-card shadow-card" : "text-foreground-2")}>
            {k === "candidate" ? "I'm looking for work" : "I'm hiring"}
          </button>
        ))}
      </div>
      <GoogleButton intent={kind === "recruiter" ? "RECRUITER" : "CANDIDATE"} onSuccess={afterAuth} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Full name" htmlFor="name" error={errors.name?.message}><Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} /></Field>
        {kind === "recruiter" && (
          <Field label="Agency or company name" htmlFor="agency" hint="Optional"><Input id="agency" {...register("agencyName")} /></Field>
        )}
        <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} /></Field>
        <Field label="Password" htmlFor="password" hint="8+ characters with a letter and a number" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-foreground-2">Already registered?{" "}
        {embedded
          ? <button type="button" onClick={() => embedded.switchTo("signin")} className="font-medium text-primary hover:underline">Sign in</button>
          : <Link href={withNext("/login")} className="font-medium text-primary hover:underline">Sign in</Link>}
      </p>
    </>
  );
}

/** Best-effort country from the browser locale (e.g. en-IN → IN); used only to pick a default currency. */
function guessCountry() {
  const m = /-([A-Z]{2})\b/.exec(navigator.language ?? "");
  return m?.[1];
}

/* ---------------- Forgot / reset ---------------- */

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email: z.email("Enter a valid email") })) });

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold"><MailCheck className="size-6" /></div>
        <Heading title="Check your inbox" description="If an account exists for that email, we've sent a link to reset your password. It expires in 1 hour." />
        <Button asChild variant="secondary" className="w-full"><Link href="/login">Back to sign in</Link></Button>
      </div>
    );
  }
  return (
    <>
      <Heading title="Reset your password" description="Enter your email and we'll send you a reset link." />
      <form onSubmit={handleSubmit(async (v) => { setError(undefined); try { await apiPost("/auth/forgot-password", v); setSent(true); } catch (e) { setError(errorMessage(e)); } })} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" {...register("email")} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Send reset link</Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Back to sign in</Link></p>
    </>
  );
}

const resetSchema = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const invite = params.get("invite") === "1";
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(resetSchema) });

  if (!token) {
    return (
      <div className="text-center">
        <Heading title="This link is incomplete" description="Open the link from your email again, or request a new one." />
        <Button asChild><Link href="/forgot-password">Request a new link</Link></Button>
      </div>
    );
  }
  return (
    <>
      <Heading title={invite ? "Activate your account" : "Choose a new password"} description={invite ? "You've been invited as a recruiter. Set a password to get started." : "Use something you don't use elsewhere."} />
      <form onSubmit={handleSubmit(async (v) => {
        setError(undefined);
        try {
          await apiPost("/auth/reset-password", { token, password: v.password });
          toast.success(invite ? "Account activated. Sign in to continue." : "Password updated. Sign in with your new password.");
          router.replace("/login");
        } catch (e) { setError(errorMessage(e)); }
      })} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="New password" htmlFor="password" error={errors.password?.message}><PasswordInput id="password" autoComplete="new-password" {...register("password")} /></Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}><PasswordInput id="confirm" autoComplete="new-password" {...register("confirm")} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{invite ? "Activate account" : "Update password"}</Button>
      </form>
    </>
  );
}

/* ---------------- Verify email ---------------- */

export function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"working" | "ok" | "failed">(token ? "working" : "failed");
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiPost("/auth/verify-email", { token }).then(() => !cancelled && setState("ok")).catch(() => !cancelled && setState("failed"));
    return () => { cancelled = true; };
  }, [token]);

  const view = {
    working: { icon: <Loader2 className="size-6 animate-spin" />, title: "Verifying your email…", text: "This only takes a moment." },
    ok: { icon: <CheckCircle2 className="size-6 text-success" />, title: "Email verified", text: "Thanks — your email address is confirmed." },
    failed: { icon: <XCircle className="size-6 text-danger" />, title: "This link isn't valid", text: "It may have expired or already been used. Sign in and request a new verification email." },
  }[state];
  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-background-2">{view.icon}</div>
      <Heading title={view.title} description={view.text} />
      {state !== "working" && <Button asChild><Link href="/login">Continue to sign in</Link></Button>}
    </div>
  );
}
