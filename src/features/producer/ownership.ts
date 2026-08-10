/**
 * Who can manage a mic, mirrored from the RLS predicate ("series owner
 * update", 20260801000500): the owner, the creator while the listing is
 * unclaimed, or an admin.
 *
 * Series ids are public (every share link carries one), and mic_series is
 * publicly readable, so the management screens load for anyone who types the
 * route. The server refuses the writes either way; this exists so a
 * performer deep-linking /producer/<id> sees "not yours" instead of a fully
 * rendered console whose every control is doomed, and, worse, an empty
 * roster presented as fact about someone else's real, full list.
 */
export type SeriesOwnership = {
  owner_id: string | null;
  created_by: string | null;
};

export function canManageSeries(
  series: SeriesOwnership,
  userId: string | null | undefined,
  isAdmin = false,
): boolean {
  if (!userId) {
    return false;
  }
  if (isAdmin) {
    return true;
  }
  if (series.owner_id != null) {
    return series.owner_id === userId;
  }
  return series.created_by === userId;
}
