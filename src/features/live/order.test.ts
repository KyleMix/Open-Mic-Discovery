import { liveOrder, performerName, type LiveRow } from './order';

const row = (over: Partial<LiveRow>): LiveRow => ({
  id: 'sg-1',
  status: 'confirmed',
  slot_position: 1,
  created_at: '2026-08-10T18:00:00.000Z',
  stage_name: 'The First',
  handle: 'first',
  guest_name: null,
  performer_id: 'p-1',
  on_deck_at: null,
  ...over,
});

describe('where the night is up to', () => {
  // A tuple, so indexing stays defined under noUncheckedIndexedAccess.
  const first = row({ id: 'a', slot_position: 1, stage_name: 'First' });
  const second = row({ id: 'b', slot_position: 2, stage_name: 'Second' });
  const third = row({ id: 'c', slot_position: 3, stage_name: 'Third' });
  const list = [first, second, third];

  it('starts at the top of the list', () => {
    const live = liveOrder(list);
    expect(performerName(live.current)).toBe('First');
    expect(performerName(live.next)).toBe('Second');
    expect(live.done).toBe(0);
  });

  it('moves on as people are marked done, with no state on the device', () => {
    // The host's phone can die mid-night and the answer stays the same.
    const live = liveOrder([{ ...first, status: 'performed' }, second, third]);
    expect(performerName(live.current)).toBe('Second');
    expect(performerName(live.next)).toBe('Third');
    expect(live.done).toBe(1);
  });

  it('treats a no-show as done, because the night still moved past them', () => {
    const live = liveOrder([{ ...first, status: 'no_show' }, second, third]);
    expect(performerName(live.current)).toBe('Second');
    expect(live.done).toBe(1);
  });

  it('runs out cleanly at the end rather than looping', () => {
    const live = liveOrder(list.map((r) => ({ ...r, status: 'performed' as const })));
    expect(live.current).toBeNull();
    expect(live.next).toBeNull();
    expect(live.done).toBe(3);
  });

  it('looks a set ahead, which is what on deck runs on', () => {
    const live = liveOrder(list);
    expect(performerName(live.afterNext)).toBe('Third');
    // And runs out rather than wrapping around.
    expect(liveOrder([first, second]).afterNext).toBeNull();
  });

  it('has nobody up next on the last set', () => {
    const live = liveOrder([
      { ...first, status: 'performed' },
      { ...second, status: 'performed' },
      third,
    ]);
    expect(performerName(live.current)).toBe('Third');
    expect(live.next).toBeNull();
  });

  it('leaves the waitlist out until the host promotes someone', () => {
    const live = liveOrder([...list, row({ id: 'w', status: 'waitlisted', slot_position: null })]);
    expect(live.order).toHaveLength(3);
  });

  it('puts a performer with no number at the back, not the front', () => {
    // A plain numeric compare on null would have opened the night with them.
    const live = liveOrder([
      row({ id: 'x', slot_position: null, stage_name: 'Late add' }),
      ...list,
    ]);
    expect(performerName(live.current)).toBe('First');
    expect(performerName(live.order[3] ?? null)).toBe('Late add');
  });

  it('falls back to the handle, and then to something sayable', () => {
    expect(performerName(row({ stage_name: null }))).toBe('first');
    expect(performerName(row({ stage_name: null, handle: null }))).toBe('Name hidden');
    expect(performerName(row({ stage_name: null, handle: null, guest_name: 'Door Name' }))).toBe(
      'Door Name',
    );
    expect(performerName(null)).toBe('Performer');
  });
});
