import type { ReactNode } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The frame of the public careers pages (S-025): a blue-violet band with the company’s name, the content
 * on light grey, and a small "powered by" line. Kept simple so it also sits well inside an iframe on the company's website.
 */
export function CareersShell({ company, logo, children }: { company?: string; logo?: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-hero text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-3">
            {logo && (
              <span className="flex h-14 items-center rounded-xl bg-white px-3 py-1.5 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- the company's own logo as a small data: URL (S-032) */}
                <img src={logo} alt="" className="max-h-full w-auto max-w-[180px] object-contain" />
              </span>
            )}
            <p className="font-display text-xl font-semibold">{company ?? ' '}</p>
          </div>
          <p className="text-sm font-medium text-white/85">Careers</p>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">{children}</main>
      <footer className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-8 text-xs text-slate-600">
        <LogoMark className="h-4 w-4" /> Recruitment by {PRODUCT_NAME}
      </footer>
    </div>
  );
}
