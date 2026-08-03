import { freshness } from '@/features/discovery/freshness';

/**
 * Default list order, mirroring the mics_near server ranking: the mic you
 * can get to soonest first (tonight beats tomorrow regardless of distance),
 * then the freshest listing within a day (a confirmed-this-week mic beats
 * one nobody has touched in months), then distance. Mics with no upcoming
 * date sink to the bottom.
 */

type Sortable = {
  next_starts_at: string | null;
  distance_m: number | null;
  last_confirmed_at: string | null;
};

function dayStamp(iso: string): number {
  const d = new Date(iso);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

const TIER_RANK = { fresh: 0, aging: 1, stale: 2, unknown: 2 } as const;

export function sortSoonestNearest<T extends Sortable>(mics: T[]): T[] {
  const now = new Date();
  return [...mics].sort((a, b) => {
    const aDay = a.next_starts_at ? dayStamp(a.next_starts_at) : Number.MAX_SAFE_INTEGER;
    const bDay = b.next_starts_at ? dayStamp(b.next_starts_at) : Number.MAX_SAFE_INTEGER;
    if (aDay !== bDay) {
      return aDay - bDay;
    }
    const aTier = TIER_RANK[freshness(a.last_confirmed_at, now).tier];
    const bTier = TIER_RANK[freshness(b.last_confirmed_at, now).tier];
    if (aTier !== bTier) {
      return aTier - bTier;
    }
    const aDist = a.distance_m ?? Number.MAX_SAFE_INTEGER;
    const bDist = b.distance_m ?? Number.MAX_SAFE_INTEGER;
    return aDist - bDist;
  });
}
