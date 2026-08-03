import { signupCta } from './cta';

const base = {
  signedIn: true,
  isPerformer: true as boolean | null,
  signupPending: false,
  hasSignup: false,
  windowState: 'open' as const,
  signupMethod: 'first_come' as const,
  occurrenceStatus: 'scheduled' as const,
};

describe('signupCta', () => {
  it('offers the join action when the window is open', () => {
    expect(signupCta(base)).toEqual({ kind: 'join', label: 'Sign me up' });
    expect(signupCta({ ...base, signupMethod: 'lottery' })).toEqual({
      kind: 'join',
      label: 'Put my name in the draw',
    });
  });

  it('offers sign-in to guests', () => {
    expect(signupCta({ ...base, signedIn: false })).toEqual({
      kind: 'sign-in',
      label: 'Sign in to get on the list',
    });
  });

  it('shows nothing once signed up, while lookups are pending, or without the performer role', () => {
    expect(signupCta({ ...base, hasSignup: true })).toBeNull();
    expect(signupCta({ ...base, signupPending: true })).toBeNull();
    expect(signupCta({ ...base, isPerformer: false })).toBeNull();
    expect(signupCta({ ...base, isPerformer: null })).toBeNull();
  });

  it('shows nothing outside the window or for non-signable nights', () => {
    expect(signupCta({ ...base, windowState: 'not_yet' })).toBeNull();
    expect(signupCta({ ...base, windowState: 'closed' })).toBeNull();
    expect(signupCta({ ...base, signupMethod: 'host_booked' })).toBeNull();
    expect(signupCta({ ...base, occurrenceStatus: 'cancelled' })).toBeNull();
  });
});
