import { sortSoonestNearest } from './order';

function mic(id: string, nextStartsAt: string | null, distanceM: number | null) {
  return { id, next_starts_at: nextStartsAt, distance_m: distanceM };
}

describe('sortSoonestNearest', () => {
  it('puts an earlier night first regardless of distance', () => {
    const sorted = sortSoonestNearest([
      mic('far-tonight', '2026-07-28T20:00:00Z', 30000),
      mic('near-tomorrow', '2026-07-29T20:00:00Z', 500),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['far-tonight', 'near-tomorrow']);
  });

  it('breaks same-day ties by distance', () => {
    const sorted = sortSoonestNearest([
      mic('far', '2026-07-28T22:00:00Z', 9000),
      mic('near', '2026-07-28T19:00:00Z', 1200),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['near', 'far']);
  });

  it('sinks mics with no upcoming date to the bottom', () => {
    const sorted = sortSoonestNearest([
      mic('dateless', null, 100),
      mic('scheduled', '2026-08-02T20:00:00Z', 50000),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['scheduled', 'dateless']);
  });

  it('does not mutate the input', () => {
    const input = [mic('b', '2026-07-29T20:00:00Z', 1), mic('a', '2026-07-28T20:00:00Z', 1)];
    sortSoonestNearest(input);
    expect(input[0]!.id).toBe('b');
  });
});
