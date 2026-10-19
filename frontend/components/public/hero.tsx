"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Pause, Play, Search } from "lucide-react";
import { api, apiList } from "@/lib/api";
import { compactCount, type PublicStats } from "@/lib/public";
import { assetUrl, useAfterHydration, useSiteContent } from "@/lib/site";
import { EMPLOYMENT_LABEL } from "@/lib/jobs";
import { salaryLabel, type CandidateJob } from "@/components/candidate/job-card";
import { Skeleton } from "@/components/ui/skeleton";

export function usePublicStats() {
  const q = useQuery({ queryKey: ["public", "stats"], queryFn: () => api<PublicStats>("/public/stats"), staleTime: 5 * 60_000 });
  const data = useAfterHydration(q.data);
  return { ...q, data, isPending: q.isPending || data === undefined };
}

/** Stack of real, live jobs shown beside the headline when no background image is set. */
function LiveJobs() {
  const q = useQuery({ queryKey: ["public", "hero-jobs"], queryFn: () => apiList<CandidateJob>("/public/jobs?limit=3"), staleTime: 60_000 });
  const data = useAfterHydration(q.data);
  const jobs = data?.items ?? [];
  if (!jobs.length) return null;
  return (
    <div className="relative hidden w-full max-w-sm lg:block" aria-label="Latest openings">
      <div className="absolute -right-8 -top-8 size-48 rounded-full bg-[#b89a5a]/25 blur-3xl" />
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[#f7f4ec]/60">Open right now</p>
      <div className="relative space-y-3">
        {jobs.map((j, i) => (
          <Link key={j.id} href={`/jobs/${j.id}`} style={{ marginLeft: i * 14 }} className="block rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur transition-colors hover:bg-white/[0.12]">
            <p className="truncate font-semibold text-[#f7f4ec]">{j.spec.title}</p>
            <p className="truncate text-sm text-[#f7f4ec]/65">{j.company.name}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-[#f7f4ec]/70">
              <span className="flex items-center gap-1"><MapPin className="size-3.5" />{j.spec.location}{j.spec.employmentType ? ` · ${EMPLOYMENT_LABEL[j.spec.employmentType]}` : ""}</span>
              <span className="font-medium text-[#d0b477]">{salaryLabel(j.spec)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  const router = useRouter();
  const site = useSiteContent();
  const stats = usePublicStats();
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const c = site.data;

  useEffect(() => {
    // People who prefer reduced motion get a still background.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);
  useEffect(() => { const v = video.current; if (v) (playing ? v.play().catch(() => undefined) : v.pause()); }, [playing, c?.hero.backgroundVideo]);

  const go = (q: string) => router.push(q.trim() ? `/jobs?search=${encodeURIComponent(q.trim())}` : "/jobs");
  const hero = c?.hero;
  const hasMedia = !!(hero?.backgroundImage || hero?.backgroundVideo);

  return (
    <section className="relative -mt-16 isolate overflow-hidden bg-[#0f2a21] text-[#f7f4ec]">
      {/* Background: admin image/video when set, otherwise a deep-forest gradient with a soft gold glow. */}
      {hero?.backgroundImage && <img src={assetUrl(hero.backgroundImage)} alt="" className="absolute inset-0 -z-20 size-full object-cover" />}
      {hero?.backgroundVideo && <video ref={video} src={assetUrl(hero.backgroundVideo)} muted loop playsInline autoPlay={playing} className="absolute inset-0 -z-20 size-full object-cover" />}
      <div className="absolute inset-0 -z-10" style={{ background: hasMedia ? `linear-gradient(90deg, rgba(10,22,17,${(hero!.overlayStrength + 25) / 100}) 0%, rgba(10,22,17,${hero!.overlayStrength / 100}) 55%, rgba(10,22,17,${hero!.overlayStrength / 160}) 100%)` : "radial-gradient(60rem 36rem at 85% 0%, rgba(184,154,90,0.20), transparent), radial-gradient(50rem 30rem at 0% 100%, rgba(53,107,85,0.35), transparent), linear-gradient(180deg,#0f2a21,#173b2f)" }} />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-10 pt-32 lg:min-h-[520px] lg:grid-cols-[1.5fr_1fr] lg:pb-14">
        <div>
          {!c ? <Skeleton className="h-40 w-full max-w-xl bg-white/10" /> : (
            <h1 className="max-w-3xl text-[clamp(2.4rem,5.6vw,4.4rem)] font-light leading-[1.04] tracking-[-0.035em]">{hero!.headline}</h1>
          )}
          {c && <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#f7f4ec]/75">{hero!.subheadline}</p>}

        </div>
        {!hasMedia && <LiveJobs />}
      </div>


      <div className="mx-auto max-w-6xl px-5 pb-16 lg:-mt-6 lg:pb-20">
        <form onSubmit={(e) => { e.preventDefault(); go(query); }} role="search" className="flex max-w-3xl items-center gap-2 rounded-xl bg-white p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]">
          <label htmlFor="hero-search" className="sr-only">Search jobs</label>
          <input id="hero-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={hero?.searchPlaceholder ?? "Search jobs"} autoComplete="off"
            className="h-12 min-w-0 flex-1 bg-transparent px-4 text-base text-[#18211d] outline-none placeholder:text-[#6f766f]" />
          <button type="submit" aria-label="Search jobs" className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#173b2f] text-white transition-colors hover:bg-[#0f2d23]"><Search className="size-5" /></button>
        </form>

        {/* One row, always: extra buttons scroll sideways instead of wrapping onto a second line. */}
        {c && c.quickLinks.length > 0 && (
          <ul className="-mx-5 mt-5 flex flex-nowrap gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Popular searches">
            {c.quickLinks.map((l) => (
              <li key={l.label} className="shrink-0"><button onClick={() => go(l.query)} className="group flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/35 bg-white/5 px-4 py-2.5 text-sm text-[#f7f4ec] backdrop-blur transition-colors hover:bg-white hover:text-[#173b2f]">{l.label}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></button></li>
            ))}
          </ul>
        )}
      </div>

      {c?.trustedBy.enabled && c.trustedBy.companies.length > 0 && (
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10 gap-y-4 px-5 py-6">
            <span className="text-sm text-[#f7f4ec]/70">{c.trustedBy.label}</span>
            <ul className="flex flex-1 flex-wrap items-center gap-x-10 gap-y-3">
              {c.trustedBy.companies.map((co) => {
                const inner = co.logo
                  ? <img src={assetUrl(co.logo)} alt={co.name} className="h-11 w-auto max-w-48 object-contain brightness-0 invert opacity-80 transition-opacity hover:opacity-100" />
                  : <span className="text-lg font-semibold tracking-tight text-[#f7f4ec]/80">{co.name}</span>;
                return <li key={co.name}>{co.url ? <a href={co.url} target="_blank" rel="noreferrer noopener">{inner}</a> : inner}</li>;
              })}
            </ul>
            {hero?.backgroundVideo && (
              <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause background video" : "Play background video"} className="flex size-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
            )}
          </div>
        </div>
      )}

      {c?.stats.show && (
        <div className="border-t border-white/10 bg-black/10">
          <dl className="mx-auto grid max-w-6xl grid-cols-3 gap-4 px-5 py-4 text-center sm:flex sm:justify-center sm:gap-14">
            {[["open roles", stats.data?.openJobs], ["client companies", stats.data?.companies], ["placements", stats.data?.placements]].map(([l, v]) => (
              <div key={l as string} className="flex flex-col items-center gap-0.5 sm:flex-row sm:gap-2"><dd className="text-xl font-semibold tabular-nums">{stats.isPending ? "–" : compactCount((v as number) ?? 0)}</dd><dt className="text-xs text-[#f7f4ec]/65 sm:text-sm">{l as string}</dt></div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
