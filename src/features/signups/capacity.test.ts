import { spotsDetail, spotsLabel } from './capacity';

describe('how full a night reads', () => {
  it('counts down as people take spots', () => {
    expect(spotsLabel(9)?.label).toBe('9 spots left');
    expect(spotsLabel(1)?.label).toBe('1 spot left');
  });

  it('turns urgent when the number is the argument', () => {
    expect(spotsLabel(9)?.tone).toBe('plain');
    expect(spotsLabel(3)?.tone).toBe('urgent');
    expect(spotsLabel(1)?.tone).toBe('urgent');
  });

  it('says full, in its own tone, once there are none', () => {
    expect(spotsLabel(0)).toEqual({ label: 'Full', tone: 'full' });
  });

  it('never shows a negative, whatever the count says', () => {
    // The view clamps at zero, but a stale cache could still arrive here.
    expect(spotsLabel(-2)).toEqual({ label: 'Full', tone: 'full' });
  });

  it('says nothing at all when the host set no cap', () => {
    // Inventing a number for an uncapped mic would be a lie with urgency
    // attached, which is the worst kind.
    expect(spotsLabel(null)).toBeNull();
    expect(spotsLabel(undefined)).toBeNull();
  });
});

describe('the longer form on the mic page', () => {
  it('gives the fraction, so the number has a scale', () => {
    expect(spotsDetail(4, 20)).toBe('4 of 20 spots left.');
  });

  it('explains what full actually means, because it is not closed', () => {
    // A full first-come night still takes signups; people get bumped.
    expect(spotsDetail(0, 20)).toBe(
      'Full. All 20 spots are taken, and new signups join the waitlist.',
    );
  });

  it('adds the performers who said they are coming but have not signed up', () => {
    expect(spotsDetail(4, 20, 3)).toBe(
      '4 of 20 spots left. 3 more performers say they are coming.',
    );
    expect(spotsDetail(4, 20, 1)).toBe(
      '4 of 20 spots left. 1 more performer says they are coming.',
    );
  });

  it('stays quiet about them when there are none', () => {
    expect(spotsDetail(4, 20, 0)).toBe('4 of 20 spots left.');
  });

  it('says nothing without a cap to count against', () => {
    expect(spotsDetail(null, 20)).toBeNull();
    expect(spotsDetail(4, null)).toBeNull();
  });
});
