import { Reveal } from "./reveal";

export function PageHero({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50rem_24rem_at_90%_-20%,rgb(184_154_90/0.14),transparent),radial-gradient(40rem_24rem_at_0%_0%,rgb(53_107_85/0.10),transparent)]" />
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <Reveal>
          {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold">{eyebrow}</p>}
          <h1 className="max-w-3xl text-[clamp(2rem,4.4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.025em]">{title}</h1>
          {description && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-foreground-2">{description}</p>}
          {children && <div className="mt-8">{children}</div>}
        </Reveal>
      </div>
    </section>
  );
}
