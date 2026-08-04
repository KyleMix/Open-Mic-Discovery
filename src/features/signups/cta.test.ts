import { signupCta } from './cta';

const base = {
  signedIn: true,
  isPerformer: true as boolean | null,
  signupPending: false,
  myStatus: null,
  mySlot: null,
  windowState: 'open' as const,
  signupMethod: 'first_come' as const,
  occurrenceStatus: 'scheduled' as const,
  opensLabel: 'This Friday',
  taken: null,
  capacity: null,
} as const;

describe('signupCta', () => {
  it('offers the join action when the window is open', () => {
    expect(signupCta({ ...base })).toEqual({
      kind: 'join',
      label: 'Sign me up',
      detail: undefined,
    });
    expect(signupCta({ ...base, signupMethod: 'lottery' })).toEqual({
      kind: 'join',
      label: 'Put my name in the draw',
      detail: undefined,
    });
  });

  it('shows spots taken, and flips to the waitlist when full', () => {
    expect(signupCta({ ...base, taken: 3, capacity: 10 })).toEqual({
      kind: 'join',
      label: 'Sign me up',
      detail: '3 of 10 spots taken',
    });
    expect(signupCta({ ...base, taken: 10, capacity: 10 })).toEqual({
      kind: 'join',
      label: 'Join the waitlist',
      detail: 'Full · 10 of 10 spots taken',
    });
  });

  it('offers sign-in to guests', () => {
    expect(signupCta({ ...base, signedIn: false })).toEqual({
      kind: 'sign-in',
      label: 'Sign in to get on the list',
    });
  });

  it('shows your signup as a status once on the list', () => {
    expect(signupCta({ ...base, myStatus: 'confirmed', mySlot: 3 })).toEqual({
      kind: 'status',
      label: 'On the list · Slot 3',
    });
    expect(signupCta({ ...base, myStatus: 'waitlisted' })).toEqual({
      kind: 'status',
      label: 'Waitlisted',
    });
  });

  it('says when the list opens and when it has closed', () => {
    expect(signupCta({ ...base, windowState: 'not_yet' })).toEqual({
      kind: 'status',
      label: 'Signups open This Friday',
    });
    expect(signupCta({ ...base, windowState: 'closed' })).toEqual({
      kind: 'status',
      label: 'Signups are closed. Walk-ups may be possible at the venue.',
    });
  });

  it('shows nothing while lookups are pending or without the performer role', () => {
    expect(signupCta({ ...base, signupPending: true })).toBeNull();
    expect(signupCta({ ...base, isPerformer: false })).toBeNull();
    expect(signupCta({ ...base, isPerformer: null })).toBeNull();
  });

  it('shows nothing for non-signable nights', () => {
    expect(signupCta({ ...base, signupMethod: 'host_booked' })).toBeNull();
    expect(signupCta({ ...base, occurrenceStatus: 'cancelled' })).toBeNull();
  });
});
