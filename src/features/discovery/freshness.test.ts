import { freshness } from './freshness';

const NOW = new Date('2026-07-28T12:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('freshness', () => {
  it('handles never-confirmed listings', () => {
    expect(freshness(null, NOW).tier).toBe('unknown');
  });

  it('tiers by age', () => {
    expect(freshness(daysAgo(0), NOW).tier).toBe('fresh');
    expect(freshness(daysAgo(14), NOW).tier).toBe('fresh');
    expect(freshness(daysAgo(15), NOW).tier).toBe('aging');
    expect(freshness(daysAgo(45), NOW).tier).toBe('aging');
    expect(freshness(daysAgo(46), NOW).tier).toBe('stale');
  });

  it('labels read naturally', () => {
    expect(freshness(daysAgo(0), NOW).label).toBe('Confirmed today');
    expect(freshness(daysAgo(1), NOW).label).toBe('Confirmed yesterday');
    expect(freshness(daysAgo(9), NOW).label).toBe('Confirmed 9 days ago');
  });
});
