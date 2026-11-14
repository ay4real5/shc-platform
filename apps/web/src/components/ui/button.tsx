import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  // Solid royal blue (S-025).
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:opacity-60',
  // Blue into violet, for the one action on a page you most want people to notice.
  accent: 'bg-gradient-to-r from-brand-600 to-accent-600 font-semibold text-white shadow-[var(--shadow-glow)] hover:from-brand-700 hover:to-accent-700 disabled:opacity-60',
  secondary: 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:opacity-50',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:bg-rose-600/60',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-not-allowed';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

/** A link that looks like a button (never nest a <button> inside a link). */
export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}
