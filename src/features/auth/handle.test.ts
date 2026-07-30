import { deriveHandleBase, handleWithSuffix, randomHandleSuffix } from './handle';

const VALID = /^[a-z0-9_]{3,30}$/;

describe('deriveHandleBase', () => {
  it('slugs an ordinary stage name', () => {
    expect(deriveHandleBase('Demi Delta')).toBe('demi_delta');
    expect(deriveHandleBase('The Log Cabin Crew')).toBe('the_log_cabin_crew');
  });

  it('strips accents rather than turning them into separators', () => {
    // "ren_e" would be a worse handle than "renee" for the same person.
    expect(deriveHandleBase('Renée')).toBe('renee');
  });

  it('collapses punctuation and trims the edges', () => {
    expect(deriveHandleBase('  !!! Dana --- Danger !!!  ')).toBe('dana_danger');
    expect(deriveHandleBase('J.R. "Slim" Okafor')).toBe('j_r_slim_okafor');
  });

  it('still produces a legal handle from a name that slugs to almost nothing', () => {
    // The database check constraint rejects anything shorter than 3.
    expect(deriveHandleBase('JO')).toMatch(VALID);
    expect(deriveHandleBase('!!!')).toMatch(VALID);
    expect(deriveHandleBase('')).toBe('performer');
    expect(deriveHandleBase('日本語')).toBe('performer');
  });

  it('never exceeds the 30 character limit', () => {
    const long = deriveHandleBase('A Truly Preposterously Long Stage Name For One Person');
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long).toMatch(VALID);
  });
});

describe('handleWithSuffix', () => {
  it('appends the suffix when there is room', () => {
    expect(handleWithSuffix('demi_delta', 'a1')).toBe('demi_delta_a1');
  });

  it('trims the base, not the suffix, to stay inside the limit', () => {
    const result = handleWithSuffix('a'.repeat(30), 'zz9');
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result.endsWith('_zz9')).toBe(true);
    expect(result).toMatch(VALID);
  });

  it('does not leave a double underscore when the trim lands on one', () => {
    expect(handleWithSuffix('demi_', 'a1')).toBe('demi_a1');
  });

  it('always returns something legal', () => {
    expect(handleWithSuffix('', 'a1')).toMatch(VALID);
    expect(handleWithSuffix('x', 'a1')).toMatch(VALID);
  });
});

describe('randomHandleSuffix', () => {
  it('is short and handle-safe', () => {
    for (let i = 0; i < 200; i++) {
      const suffix = randomHandleSuffix();
      expect(suffix).toMatch(/^[a-z0-9]{3}$/);
    }
  });
});
