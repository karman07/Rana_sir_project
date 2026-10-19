"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Bookmark, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES, toMinor } from "@rms/shared";
import { api, apiList, type ApiList } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { EMPLOYMENT_LABEL, EMPLOYMENT_TYPES, WORK_MODE_LABEL, WORK_MODES } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Dialog, DrawerContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";
import { JobCard, type CandidateJob } from "./job-card";

interface Filters { location: string; employmentType: string; workMode: string; maxExperience: string; minSalary: string; currency: string; skill: string }
const BLANK = (currency: string): Filters => ({ location: "", employmentType: "", workMode: "", maxExperience: "", minSalary: "", currency, skill: "" });
const LIMIT = 10;

function FilterFields({ f, set }: { f: Filters; set: (p: Partial<Filters>) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Location" htmlFor="f-loc"><Input id="f-loc" placeholder="City or country" value={f.location} onChange={(e) => set({ location: e.target.value })} /></Field>
      <Field label="Work mode" htmlFor="f-mode"><Select id="f-mode" value={f.workMode} onChange={(e) => set({ workMode: e.target.value })}><option value="">Any</option>{WORK_MODES.map((m) => <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>)}</Select></Field>
      <Field label="Employment type" htmlFor="f-type"><Select id="f-type" value={f.employmentType} onChange={(e) => set({ employmentType: e.target.value })}><option value="">Any</option>{EMPLOYMENT_TYPES.map((m) => <option key={m} value={m}>{EMPLOYMENT_LABEL[m]}</option>)}</Select></Field>
      <Field label="Your experience (years)" htmlFor="f-exp" hint="Shows jobs asking for this much or less"><Input id="f-exp" inputMode="numeric" value={f.maxExperience} onChange={(e) => set({ maxExperience: e.target.value.replace(/\D/g, "") })} /></Field>
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <Field label="Minimum salary / year" htmlFor="f-sal"><Input id="f-sal" inputMode="decimal" value={f.minSalary} onChange={(e) => set({ minSalary: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label="Currency" htmlFor="f-cur"><Select id="f-cur" value={f.currency} onChange={(e) => set({ currency: e.target.value })}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      <Field label="Skill" htmlFor="f-skill"><Input id="f-skill" placeholder="e.g. React" value={f.skill} onChange={(e) => set({ skill: e.target.value })} /></Field>
    </div>
  );
}

export function JobSearch({ publicMode = false, initialSearch = "" }: { publicMode?: boolean; initialSearch?: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const home = user?.currency ?? "USD";
  const [tab, setTab] = useState<"all" | "saved">("all");
  const [search, setSearch] = useState(initialSearch);
  const [debounced, setDebounced] = useState(initialSearch);
  const [filters, setFilters] = useState<Filters>(BLANK(home));
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { const t = setTimeout(() => setDebouncedFilters(filters), 400); return () => clearTimeout(t); }, [filters]);
  const set = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  const params = new URLSearchParams({ limit: String(LIMIT) });
  if (tab === "saved") params.set("saved", "true");
  if (debounced.trim()) params.set("search", debounced.trim());
  const f = debouncedFilters;
  if (f.location) params.set("location", f.location);
  if (f.employmentType) params.set("employmentType", f.employmentType);
  if (f.workMode) params.set("workMode", f.workMode);
  if (f.maxExperience) params.set("maxExperience", f.maxExperience);
  if (f.skill) params.set("skill", f.skill);
  if (f.minSalary && Number(f.minSalary) > 0) { params.set("minSalary", String(toMinor(Number(f.minSalary), f.currency))); params.set("currency", f.currency); }
  const base = publicMode ? "/public/jobs" : "/jobs";
  const key = [publicMode ? "public-jobs" : "jobs", "candidate", params.toString()];

  const q = useInfiniteQuery({
    queryKey: key, initialPageParam: 1,
    queryFn: ({ pageParam }) => apiList<CandidateJob>(`${base}?${params}&page=${pageParam}`),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

  const toggle = useMutation({
    mutationFn: (job: CandidateJob) => api(`/candidates/me/saved-jobs/${job.id}`, { method: job.saved ? "DELETE" : "PUT" }),
    onMutate: async (job) => {
      await qc.cancelQueries({ queryKey: ["jobs", "candidate"] });
      qc.setQueriesData<InfiniteData<ApiList<CandidateJob>>>({ queryKey: ["jobs", "candidate"] }, (old) => old && ({ ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((j) => (j.id === job.id ? { ...j, saved: !job.saved } : j)) })) }));
      return { job };
    },
    onError: (_e, job) => { toast.error("Couldn't update your saved jobs"); qc.invalidateQueries({ queryKey: ["jobs", "candidate"] }); void job; },
    onSuccess: (_r, job) => { toast.success(job.saved ? "Removed from saved jobs" : "Job saved"); if (tab === "saved") qc.invalidateQueries({ queryKey: ["jobs", "candidate"] }); },
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.meta.total ?? 0;
  const active = Object.entries(filters).some(([k, v]) => k !== "currency" && v !== "") || search !== "";
  const clear = () => { setSearch(""); setFilters(BLANK(home)); };

  return (
    <>
      {!publicMode && <PageHeader title="Find your next role" description="Every job here has been reviewed and approved by our team." />}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" />
          <Input className="h-11 pl-9 text-base" placeholder="Search by title, skill or location" aria-label="Search jobs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="secondary" className="h-11 lg:hidden" onClick={() => setDrawer(true)}><SlidersHorizontal />Filters</Button>
        {!publicMode && <div className="flex rounded-lg bg-background-2 p-1 text-sm" role="tablist">
          {([["all", "All jobs"], ["saved", "Saved"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-md px-3 py-1.5 font-medium transition-colors", tab === k ? "bg-card shadow-card" : "text-foreground-2")}>{label}</button>
          ))}
        </div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-[16px] border border-border bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Filters</h2>{active && <button onClick={clear} className="text-sm text-primary hover:underline">Clear</button>}</div>
            <FilterFields f={filters} set={set} />
          </div>
        </aside>

        <section aria-live="polite">
          {!q.isPending && !q.isError && <p className="mb-3 text-sm text-foreground-2">{total} job{total === 1 ? "" : "s"}{tab === "saved" ? " saved" : ""}</p>}
          {q.isPending ? (
            <div className="space-y-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-48 w-full rounded-[16px]" />)}</div>
          ) : q.isError ? (
            <ErrorState compact variant="server" onRetry={() => q.refetch()} />
          ) : items.length === 0 ? (
            tab === "saved" ? (
              <EmptyState icon={Bookmark} title="No saved jobs yet" description="Tap the bookmark on any job to keep it here for later." action={<Button onClick={() => setTab("all")}>Browse jobs</Button>} />
            ) : (
              <EmptyState icon={SearchX} title={active ? "No jobs match your search" : "No jobs are open right now"} description={active ? "Try fewer filters or a broader search." : "New roles are added regularly. Check back soon."}
                action={active ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : undefined} />
            )
          ) : (
            <div className="space-y-4">
              {items.map((j) => <JobCard key={j.id} job={j} publicMode={publicMode} onToggleSave={publicMode ? undefined : (job) => toggle.mutate(job)} saving={toggle.isPending && toggle.variables?.id === j.id} />)}
              {q.hasNextPage && <div className="flex justify-center pt-2"><Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Show more jobs</Button></div>}
            </div>
          )}
        </section>
      </div>

      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DrawerContent title="Filters" description="Narrow down the jobs you see" side="right">
          <FilterFields f={filters} set={set} />
          <div className="mt-6 flex gap-2"><Button variant="secondary" className="flex-1" onClick={clear}><X />Clear</Button><Button className="flex-1" onClick={() => setDrawer(false)}>Show results</Button></div>
        </DrawerContent>
      </Dialog>
    </>
  );
}
