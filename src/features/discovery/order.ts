/**
 * Default list order: the mic you can get to soonest, closest first.
 * Sorts by the calendar day of each mic's next upcoming night (so tonight
 * beats tomorrow regardless of distance), then by distance within a day.
 * Mics with no upcoming date sink to the bottom, nearest first.
 */

type Sortable = {
  next_starts_at: string | null;
  distance_m: number | null;
};

function dayStamp(iso: string): number {
  const d = new Date(iso);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function sortSoonestNearest<T extends Sortable>(mics: T[]): T[] {
  return [...mics].sort((a, b) => {
    const aDay = a.next_starts_at ? dayStamp(a.next_starts_at) : Number.MAX_SAFE_INTEGER;
    const bDay = b.next_starts_at ? dayStamp(b.next_starts_at) : Number.MAX_SAFE_INTEGER;
    if (aDay !== bDay) {
      return aDay - bDay;
    }
    const aDist = a.distance_m ?? Number.MAX_SAFE_INTEGER;
    const bDist = b.distance_m ?? Number.MAX_SAFE_INTEGER;
    return aDist - bDist;
  });
}
