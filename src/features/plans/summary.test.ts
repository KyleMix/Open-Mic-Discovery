import { attendanceSummary, goingStatusLabel } from './summary';

const ROW = {
  planning: true,
  signup_status: null,
  slot_position: null,
  on_deck_at: null,
  occurrence_status: 'scheduled' as const,
};

describe('what the Going tab says about a night', () => {
  it('names the plan when that is all there is', () => {
    expect(goingStatusLabel(ROW)).toBe('Planning to attend');
  });

  it('prefers the signup, because a slot outranks an intention', () => {
    expect(goingStatusLabel({ ...ROW, signup_status: 'confirmed', slot_position: 3 })).toBe(
      'On the list · Slot 3',
    );
  });

  it('drops the slot when there is not one yet', () => {
    expect(goingStatusLabel({ ...ROW, signup_status: 'requested' })).toBe('In the draw');
  });

  it('puts on deck above everything, since it means you are up now', () => {
    expect(
      goingStatusLabel({
        ...ROW,
        signup_status: 'confirmed',
        slot_position: 2,
        on_deck_at: '2026-08-10T02:00:00.000Z',
      }),
    ).toBe('You are on deck');
  });

  it('says cancelled first of all, whatever else was true', () => {
    // Turning up to a cancelled room is the failure this app exists to stop.
    expect(
      goingStatusLabel({
        ...ROW,
        signup_status: 'confirmed',
        on_deck_at: '2026-08-10T02:00:00.000Z',
        occurrence_status: 'cancelled',
      }),
    ).toBe('Cancelled');
  });
});

describe('what the producer sees before the doors open', () => {
  const counts = (plan: number, performer: number, signup: number) => ({
    plan_count: plan,
    performer_plan_count: performer,
    signup_count: signup,
  });

  it('leads with the headcount on a walk-in night, where there is no list to read', () => {
    expect(attendanceSummary(counts(9, 6, 0), true)).toBe(
      '9 people planning to attend, 6 of them performing.',
    );
  });

  it('leads with the list when there is one', () => {
    expect(attendanceSummary(counts(9, 6, 4), false)).toBe(
      '4 people on the list. 9 people planning to attend, 6 of them performing.',
    );
  });

  it('says so plainly when everyone coming is performing', () => {
    expect(attendanceSummary(counts(5, 5, 0), true)).toBe(
      '5 people planning to attend, all performing.',
    );
  });

  it('and when none of them are, which is a different night to run', () => {
    expect(attendanceSummary(counts(5, 0, 0), true)).toBe(
      '5 people planning to attend, none of them performing.',
    );
  });

  it('counts one person as one person', () => {
    expect(attendanceSummary(counts(1, 1, 0), true)).toBe(
      '1 person planning to attend, all performing.',
    );
    expect(attendanceSummary(counts(0, 0, 1), false)).toBe('1 person on the list.');
  });

  it('says nothing is there rather than printing zeros', () => {
    expect(attendanceSummary(counts(0, 0, 0), true)).toBe('Nobody has said they are coming yet.');
    expect(attendanceSummary(counts(0, 0, 0), false)).toBe(
      'Nobody on the list yet, and nobody has said they are coming.',
    );
  });

  it('treats missing counts as zero rather than crashing on a fresh night', () => {
    expect(
      attendanceSummary({ plan_count: null, performer_plan_count: null, signup_count: null }, true),
    ).toBe('Nobody has said they are coming yet.');
  });
});
