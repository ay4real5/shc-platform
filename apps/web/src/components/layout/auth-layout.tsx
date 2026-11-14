import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';

const POINTS = [
  'Recruitment, from careers page to signed contract',
  'CQC-ready staff files: Right to Work, DBS and references',
  'Alerts before any check or training lapses',
  'UK hosted, UK GDPR compliant, encrypted and audited',
];

/** Signed-out pages (sign in, password reset, 2FA setup), S-025: the form on white, a blue-violet panel on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md animate-fade-in">{children}</div>
        </div>
        <p className="text-xs text-slate-500">SHC · Staff records are confidential.</p>
      </div>
      <section aria-label="About SHC" className="bg-hero m-3 hidden flex-col justify-center rounded-3xl p-14 text-white lg:flex">
        <p className="inline-flex w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25">Care workforce platform</p>
        <p className="mt-5 max-w-md font-display text-[44px] font-extrabold leading-[1.1] tracking-tight">Every carer ready. Every file in order.</p>
        <ul className="mt-8 flex max-w-md flex-col gap-4">
          {POINTS.map((text) => (
            <li key={text} className="flex items-start gap-3 text-[15px] text-white/90">
              <span aria-hidden className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20"><Check className="h-3.5 w-3.5" /></span>
              {text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
