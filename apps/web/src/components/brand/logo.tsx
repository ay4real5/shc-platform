import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';

/**
 * The SHC mark (S-029), drawn after Support Health Care Ltd's own logo: their leaf-green disc inside a lime ring, a
 * white house roof with a small window, and the letters "SHC" in a serif like their "SH" monogram. Same drawing in
 * public/logo.svg and app/icon.svg.
 */
export function LogoMark({ className = 'h-9 w-9', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <circle cx="24" cy="24" r="24" fill="#cacc2c" />
      <circle cx="24" cy="24" r="21" fill="#669a40" />
      <path d="M10.5 22.5 24 12l13.5 10.5" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27.6 15.2h1.5v1.5h-1.5zM29.5 15.2H31v1.5h-1.5zM27.6 17.1h1.5v1.5h-1.5zM29.5 17.1H31v1.5h-1.5z" fill="#ffffff" />
      <text x="24" y="34.5" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="13" fontWeight="700" letterSpacing="0.3" fill="#ffffff">
        SHC
      </text>
    </svg>
  );
}

/** Mark + name, for headers and the sign-in screen. `tone` = the background it sits on. */
export function Logo({ tone = 'light', tagline = true }: { tone?: 'light' | 'dark'; tagline?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="h-10 w-10" />
      <span className="flex flex-col leading-tight">
        <span className={`font-display text-xl font-extrabold tracking-tight ${tone === 'dark' ? 'text-white' : 'text-brand-800'}`}>{PRODUCT_NAME}</span>
        {tagline && <span className={`text-xs ${tone === 'dark' ? 'text-brand-100' : 'text-slate-500'}`}>{PRODUCT_TAGLINE}</span>}
      </span>
    </span>
  );
}
