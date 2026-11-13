import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';

/**
 * The SHC mark (S-018): a navy shield with a gold "S" and a gold inner rule. Steady and trustworthy, for a care
 * provider. Pure SVG; the same drawing is in public/logo.svg, app/icon.svg and the phone app icon.
 */
export function LogoMark({ className = 'h-9 w-9', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d="M24 2.5 42 8.6v14.2c0 11.3-7.4 19.2-18 22.7C13.4 42 6 34.1 6 22.8V8.6Z" fill="#1b2a4a" />
      <path d="M24 6.4 38.4 11.3v11.5c0 9.1-5.8 15.6-14.4 18.7C15.4 38.4 9.6 31.9 9.6 22.8V11.3Z" fill="none" stroke="#c9a227" strokeWidth="1.2" />
      <path
        d="M30.2 16.6c-1.4-1.5-3.5-2.3-6-2.3-3.7 0-6.3 2-6.3 4.9 0 6.4 12.7 3.8 12.7 9.9 0 3.1-2.9 5.3-6.9 5.3-2.7 0-5.1-.9-6.7-2.6"
        fill="none"
        stroke="#c9a227"
        strokeWidth="3.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/** Mark + name, for headers and the sign-in screen. `tone` = the background it sits on. */
export function Logo({ tone = 'light', tagline = true }: { tone?: 'light' | 'dark'; tagline?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark className="h-10 w-10" />
      <span className="leading-tight">
        <span className={`block font-display text-xl font-bold tracking-[0.08em] ${tone === 'dark' ? 'text-white' : 'text-ink'}`}>{PRODUCT_NAME}</span>
        {tagline && <span className={`block text-xs ${tone === 'dark' ? 'text-accent-200' : 'text-slate-600'}`}>{PRODUCT_TAGLINE}</span>}
      </span>
    </span>
  );
}
