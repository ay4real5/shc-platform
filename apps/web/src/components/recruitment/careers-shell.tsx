import type { ReactNode } from 'react';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The frame of the public careers pages: the company's name, the content, and a small "powered by" line.
 * Kept plain so it also sits well inside an iframe on the company's own website.
 */
export function CareersShell({ company, children }: { company?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-brand-900/[0.06] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <p className="font-display text-lg font-bold text-ink">{company ?? ' '}</p>
          <p className="text-sm text-slate-600">Careers</p>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 text-xs text-slate-500">Recruitment by {PRODUCT_NAME}</footer>
    </div>
  );
}
