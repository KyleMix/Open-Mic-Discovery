import {
  validateBirthYear,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateRoles,
} from './validation';

const NOW = new Date('2026-07-28T12:00:00Z');

describe('auth validation', () => {
  it('accepts valid emails and rejects junk', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('not-an-email')).not.toBeNull();
    expect(validateEmail('')).not.toBeNull();
  });

  it('requires passwords of at least 10 characters', () => {
    expect(validatePassword('short')).not.toBeNull();
    expect(validatePassword('long-enough-pass')).toBeNull();
  });


  it('bounds display names', () => {
    expect(validateDisplayName('Demi')).toBeNull();
    expect(validateDisplayName('  ')).not.toBeNull();
    expect(validateDisplayName('x'.repeat(61))).not.toBeNull();
  });

  it('age-gates under-18 birth years', () => {
    expect(validateBirthYear('1994', NOW)).toBeNull();
    expect(validateBirthYear('2008', NOW)).toBeNull();
    expect(validateBirthYear('2009', NOW)).not.toBeNull();
    expect(validateBirthYear('2031', NOW)).not.toBeNull();
    expect(validateBirthYear('abcd', NOW)).not.toBeNull();
  });

  it('requires at least one role and allows both', () => {
    expect(validateRoles(true, false)).toBeNull();
    expect(validateRoles(true, true)).toBeNull();
    expect(validateRoles(false, false)).not.toBeNull();
  });
});
