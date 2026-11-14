import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';

/**
 * The SHC mark (S-025): the letters "SHC" in white on a rounded blue-to-violet tile. Plain and modern; used where a
 * small square is needed (loading screen, printed pack, careers page, browser tab). Same drawing in public/logo.svg
 * and app/icon.svg.
 */
export function LogoMark({ className = 'h-9 w-9', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="shc-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f52e8" />
          <stop offset="1" stopColor="#6a35f0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#shc-mark)" />
      <text x="24" y="30.5" textAnchor="middle" fontFamily="Manrope, Arial, sans-serif" fontSize="16" fontWeight="800" letterSpacing="0.5" fill="#ffffff">
        SHC
      </text>
    </svg>
  );
}

/** The wordmark for headers and the sign-in screen: just the name, bold. `tone` = the background it sits on. */
export function Logo({ tone = 'light', tagline = true }: { tone?: 'light' | 'dark'; tagline?: boolean }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className={`font-display text-2xl font-extrabold tracking-tight ${tone === 'dark' ? 'text-white' : 'text-ink'}`}>
        {PRODUCT_NAME}
        <span className={tone === 'dark' ? 'text-brand-200' : 'text-brand-600'}>.</span>
      </span>
      {tagline && <span className={`text-xs ${tone === 'dark' ? 'text-brand-100' : 'text-slate-500'}`}>{PRODUCT_TAGLINE}</span>}
    </span>
  );
}
