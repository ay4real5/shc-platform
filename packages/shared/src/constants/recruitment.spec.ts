import { findHistoryGaps } from './recruitment.js';

const TODAY = '2026-11-12';

describe('findHistoryGaps', () => {
  it('finds nothing when jobs run back to back up to today', () => {
    expect(
      findHistoryGaps(
        [
          { kind: 'job', startDate: '2020-01-01', endDate: '2023-06-30' },
          { kind: 'job', startDate: '2023-07-01', endDate: null },
        ],
        TODAY,
      ),
    ).toEqual([]);
  });

  it('tolerates a month between jobs and overlapping part-time jobs', () => {
    expect(
      findHistoryGaps(
        [
          { kind: 'job', startDate: '2020-01-01', endDate: '2022-12-31' },
          { kind: 'job', startDate: '2021-05-01', endDate: '2021-09-30' },
          { kind: 'job', startDate: '2023-01-25', endDate: null },
        ],
        TODAY,
      ),
    ).toEqual([]);
  });

  it('reports an unexplained gap, and accepts it once a gap entry explains it', () => {
    const jobs = [
      { kind: 'job' as const, startDate: '2019-01-01', endDate: '2021-03-31' },
      { kind: 'job' as const, startDate: '2021-09-01', endDate: null },
    ];
    expect(findHistoryGaps(jobs, TODAY)).toEqual([{ from: '2021-04-01', to: '2021-08-31', days: 153 }]);
    expect(findHistoryGaps([...jobs, { kind: 'gap', startDate: '2021-04-01', endDate: '2021-08-31' }], TODAY)).toEqual([]);
  });

  it('reports time since the last job ended', () => {
    expect(findHistoryGaps([{ kind: 'job', startDate: '2020-01-01', endDate: '2026-01-31' }], TODAY)).toEqual([
      { from: '2026-02-01', to: TODAY, days: 285 },
    ]);
  });
});

describe('canMoveStage', () => {
  it('moves freely between open stages, never into or out of hired, and reopens rejected ones', async () => {
    const { canMoveStage } = await import('./recruitment.js');
    expect(canMoveStage('applied', 'interview')).toBe(true);
    expect(canMoveStage('offer', 'screened')).toBe(true);
    expect(canMoveStage('interview', 'rejected')).toBe(true);
    expect(canMoveStage('rejected', 'screened')).toBe(true);
    expect(canMoveStage('offer', 'hired')).toBe(false);
    expect(canMoveStage('hired', 'applied')).toBe(false);
    expect(canMoveStage('applied', 'applied')).toBe(false);
    expect(canMoveStage('applied', 'nonsense')).toBe(false);
  });
});
