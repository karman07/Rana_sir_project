import Link from "next/link";
import { Logo } from "@/components/shell/sidebar";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#173b2f] p-12 text-[#f7f4ec] lg:flex">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#f7f4ec] text-[#173b2f]">T<span className="text-[#b89a5a]">.</span></span>
          Talentbridge
        </Link>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">Connecting exceptional talent with exceptional companies.</p>
          <p className="mt-4 text-sm leading-relaxed text-[#f7f4ec]/70">
            Every candidate is screened by our team. Every contract, payment and payslip is tracked in one place.
          </p>
        </div>
        <div className="flex gap-8 text-sm text-[#f7f4ec]/70">
          <div><p className="text-2xl font-semibold text-[#d0b477]">Screened</p>before they reach you</div>
          <div><p className="text-2xl font-semibold text-[#d0b477]">Traceable</p>every payment</div>
        </div>
      </aside>
      <main className="flex flex-col">
        <Link href="/" className="flex items-center p-5 lg:hidden" aria-label="Talentbridge home"><Logo /></Link>
        <div className="flex flex-1 items-center justify-center px-5 pb-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
