import { agencyRegions, cleanRegions } from './regions.js';

describe('regions (S-028)', () => {
  it('reads the list from settings', () => {
    expect(agencyRegions({ regions: ['North', 'South', 3] })).toEqual(['North', 'South']);
    expect(agencyRegions({})).toEqual([]);
    expect(agencyRegions(null)).toEqual([]);
  });

  it('tidies a typed list', () => {
    expect(cleanRegions(['  Greater   Manchester ', '', 'bristol', 'Bristol'])).toEqual({ regions: ['Greater Manchester', 'bristol'], problem: null });
    expect(cleanRegions(['x'.repeat(61)]).problem).toMatch(/too long/);
    expect(cleanRegions(Array.from({ length: 31 }, (_, i) => `R${i}`)).problem).toMatch(/Up to 30/);
  });
});
