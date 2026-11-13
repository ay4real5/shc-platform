import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-md border border-slate-200 bg-white shadow-[var(--shadow-card)] ${className}`} {...props} />;
}

export function Alert({
  tone = 'error',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: 'error' | 'info' | 'warning' }) {
  const tones = {
    error: 'border-rose-200 border-l-rose-600 bg-rose-50 text-rose-800',
    info: 'border-brand-200 border-l-brand-700 bg-brand-50 text-brand-900',
    warning: 'border-amber-200 border-l-amber-500 bg-amber-50 text-amber-900',
  };
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border-l-4 border px-3.5 py-2.5 text-sm ${tones[tone]} ${className}`} {...props} />;
}
