'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';

/**
 * Regions (S5-02, S-028). The company's regions come from the API; the region a manager is looking at is remembered in
 * this browser and shared by every staff list (staff, onboarding, checks, training matrix, inspection pack, dashboard),
 * so choosing "Bristol" once narrows them all. Companies without regions never see any of this.
 */
const KEY = 'shc.region';
const EVENT = 'shc-region';

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
function write(value: string): void {
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useRegions(): string[] {
  const { request, can } = useAuth();
  const regions = useQuery({
    queryKey: ['agency', 'regions'],
    enabled: can('staff:read'),
    staleTime: 5 * 60_000,
    queryFn: async () => (await request<string[]>('/agency/regions')).data,
  });
  return regions.data ?? [];
}

/** The region being looked at ('' = all), only if it's still one of the company's regions. */
export function useRegion(): [string, (value: string) => void] {
  const regions = useRegions();
  const stored = useSyncExternalStore(subscribe, read, () => '');
  return [regions.includes(stored) ? stored : '', write];
}

/** `?region=…` (or `&region=…`) for API calls; empty when looking at all regions. */
export function regionParam(region: string, joiner: '?' | '&' = '?'): string {
  return region ? `${joiner}region=${encodeURIComponent(region)}` : '';
}

/** The region picker for page headers. Renders nothing for a company without regions. */
export function RegionFilter({ className = '' }: { className?: string }) {
  const regions = useRegions();
  const [region, setRegion] = useRegion();
  if (!regions.length) return null;
  return (
    <label className={`flex items-center gap-2 text-sm text-slate-700 ${className}`}>
      <MapPin aria-hidden className="h-4 w-4 text-brand-600" />
      <span className="sr-only">Region</span>
      <select
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        <option value="">All regions</option>
        {regions.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </label>
  );
}
