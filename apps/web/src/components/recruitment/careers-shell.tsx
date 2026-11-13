import type { ReactNode } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The frame of the public careers pages (S-018): a navy band with the company's name and a gold rule, the content
 * on cream, and a small "powered by" line. Kept simple so it also sits well inside an iframe on the company's website.
 */
export function CareersShell({ company, children }: { company?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-hero text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5">
          <p className="font-display text-xl font-semibold">{company ?? ' '}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Careers</p>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">{children}</main>
      <footer className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-8 text-xs text-slate-600">
        <LogoMark className="h-4 w-4" /> Recruitment by {PRODUCT_NAME}
      </footer>
    </div>
  );
}
