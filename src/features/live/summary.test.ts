import { liveCounts, spotsOpen } from './summary';
import type { LiveRow } from './order';

const row = (over: Partial<LiveRow>): LiveRow => ({
  id: 'sg-1',
  status: 'confirmed',
  slot_position: 1,
  created_at: '2026-08-10T18:00:00.000Z',
  stage_name: 'Someone',
  handle: 'someone',
  performer_id: 'p-1',
  on_deck_at: null,
  ...over,
});

describe('liveCounts', () => {
  it('counts who is waiting separately from who is on the list', () => {
    const rows = [
      row({ id: 'a', status: 'performed' }),
      row({ id: 'b', status: 'confirmed' }),
      row({ id: 'c', status: 'waitlisted' }),
      row({ id: 'd', status: 'waitlisted' }),
    ];
    // onList and done come from the running order, which already excludes
    // waitlisted names: they are not in the night until the host adds them.
    expect(liveCounts(rows, 2, 1)).toEqual({ onList: 2, done: 1, toGo: 1, waitlist: 2 });
  });

  it('reports a finished list as nothing left to go', () => {
    expect(liveCounts([], 6, 6)).toEqual({ onList: 6, done: 6, toGo: 0, waitlist: 0 });
  });
});

describe('spotsOpen', () => {
  it('says how many are left against the cap', () => {
    expect(spotsOpen(4, 12)).toEqual({ value: '4', caption: 'of 12 open', full: false });
  });

  it('says Full rather than a zero, and marks it', () => {
    expect(spotsOpen(0, 8)).toEqual({ value: 'Full', caption: 'all 8 taken', full: true });
  });

  it('invents nothing when the host never capped the night', () => {
    expect(spotsOpen(null, null)).toEqual({ value: 'Open', caption: 'no cap set', full: false });
    expect(spotsOpen(undefined, undefined).value).toBe('Open');
  });
});
