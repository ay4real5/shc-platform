/**
 * Regions (S5-02, S-028): a company working across several areas (Support Health Care Ltd covers nine) keeps a list of
 * its regions in its settings, gives each staff member one, and filters staff lists, readiness, expiries, the training
 * matrix, the dashboard and the inspection overview by region. A company with no regions sees no region controls.
 */
export const MAX_REGIONS = 30;
export const REGION_MAX_LENGTH = 60;

/** The company's regions from its settings JSON (empty when it hasn't set any). */
export function agencyRegions(settings: unknown): string[] {
  const list = typeof settings === 'object' && settings !== null ? (settings as Record<string, unknown>).regions : undefined;
  return Array.isArray(list) ? list.filter((r): r is string => typeof r === 'string') : [];
}

/** Tidies a list typed by a manager: trims, drops blanks and repeats (ignoring case). Returns a problem or the list. */
export function cleanRegions(input: readonly string[]): { regions: string[]; problem: string | null } {
  const regions: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    if (name.length > REGION_MAX_LENGTH) return { regions, problem: `"${name.slice(0, 20)}…" is too long: region names can be up to ${REGION_MAX_LENGTH} characters` };
    seen.add(name.toLowerCase());
    regions.push(name);
  }
  if (regions.length > MAX_REGIONS) return { regions, problem: `Up to ${MAX_REGIONS} regions` };
  return { regions, problem: null };
}
