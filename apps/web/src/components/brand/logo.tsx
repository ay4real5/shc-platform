import { useId } from 'react';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';

/**
 * The SHC mark (D-103 design system): a teal tile with a flowing white "S" and a coral spark — care
 * that grows. Pure SVG, so it is crisp everywhere; the same drawing is in public/logo.svg, app/icon.svg and the
 * mobile app icon.
 */
export function LogoMark({ className = 'h-9 w-9', title }: { className?: string; title?: string }) {
  const id = useId();
  const tile = `${id}-tile`;
  const spark = `${id}-spark`;
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2fc2ae" />
          <stop offset="0.55" stopColor="#0f766e" />
          <stop offset="1" stopColor="#042f2e" />
        </linearGradient>
        <linearGradient id={spark} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fea697" />
          <stop offset="1" stopColor="#ef5a46" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${tile})`} />
      {/* A flowing "S". */}
      <path d="M31 15.8c-1.8-1.7-4.2-2.6-7-2.6-4.3 0-7.4 2.3-7.4 5.7 0 7.5 15 4.4 15 11.6 0 3.6-3.4 6.2-8.1 6.2-3.1 0-5.9-1.1-7.8-3" fill="none" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* The coral spark. */}
      <circle cx="37.5" cy="10.5" r="3.6" fill={`url(#${spark})`} />
      <circle cx="37.5" cy="10.5" r="5.6" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  );
}

/** Mark + name, for headers and the login screen. `tone` = the background it sits on. */
export function Logo({ tone = 'light', tagline = true }: { tone?: 'light' | 'dark'; tagline?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark className="h-10 w-10 drop-shadow-[0_6px_14px_rgb(15_118_110_/_0.35)]" />
      <span className="leading-tight">
        <span className={`block font-display text-[17px] font-extrabold tracking-tight ${tone === 'dark' ? 'text-white' : 'text-ink'}`}>
          {PRODUCT_NAME}<span className="text-accent-400">.</span>
        </span>
        {tagline && <span className={`block text-xs ${tone === 'dark' ? 'text-brand-200' : 'text-brand-700'}`}>{PRODUCT_TAGLINE}</span>}
      </span>
    </span>
  );
}
