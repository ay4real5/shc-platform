import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';

const POINTS = [
  'Recruitment, from careers page to signed contract',
  'CQC-ready staff files: Right to Work, DBS and references',
  'Alerts before any check or training lapses',
  'UK hosted, UK GDPR compliant, encrypted and audited',
];

/** Signed-out pages (sign in, password reset, 2FA setup), S-018: the form on cream, a navy panel on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md animate-fade-in">{children}</div>
        </div>
        <p className="text-xs text-slate-600">SHC · Staff records are confidential.</p>
      </div>
      <section aria-label="About SHC" className="bg-hero hidden flex-col justify-center border-b-0 border-l-4 border-l-accent-500 p-14 text-white lg:flex">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">Care workforce platform</p>
        <p className="mt-4 max-w-md font-display text-[42px] font-semibold leading-[1.12]">Every carer ready. Every file in order.</p>
        <span aria-hidden className="mt-6 block h-[3px] w-16 bg-accent-500" />
        <ul className="mt-8 flex max-w-md flex-col gap-4">
          {POINTS.map((text) => (
            <li key={text} className="flex items-start gap-3 text-[15px] text-brand-50">
              <Check aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" />
              {text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
