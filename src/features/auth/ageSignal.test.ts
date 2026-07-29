import type { AgeRangeResponse } from 'expo-age-range';

import { ageSignalError, evaluateAgeSignal } from './ageSignal';

const adult: AgeRangeResponse = { lowerBound: 18, upperBound: null };

describe('evaluateAgeSignal', () => {
  it('passes an adult signal', () => {
    expect(evaluateAgeSignal(adult, 18)).toBe('pass');
  });

  it('blocks when the upper bound is below the gate', () => {
    expect(evaluateAgeSignal({ lowerBound: 13, upperBound: 17 }, 18)).toBe('block');
  });

  it('blocks when the declared range starts under the gate', () => {
    expect(evaluateAgeSignal({ lowerBound: 16, upperBound: null }, 18)).toBe('block');
  });

  it('blocks supervised child accounts on Android', () => {
    expect(
      evaluateAgeSignal({ lowerBound: null, upperBound: null, userStatus: 'SUPERVISED' }, 18),
    ).toBe('block');
    expect(
      evaluateAgeSignal(
        { lowerBound: null, upperBound: null, userStatus: 'SUPERVISED_APPROVAL_DENIED' },
        18,
      ),
    ).toBe('block');
  });

  it('passes unknown signals: the birth-year gate stays authoritative', () => {
    expect(evaluateAgeSignal({ lowerBound: null, upperBound: null }, 18)).toBe('pass');
    expect(
      evaluateAgeSignal({ lowerBound: null, upperBound: null, userStatus: 'UNKNOWN' }, 18),
    ).toBe('pass');
  });

  it('respects a different gate value', () => {
    expect(evaluateAgeSignal({ lowerBound: 17, upperBound: null }, 17)).toBe('pass');
    expect(evaluateAgeSignal({ lowerBound: 17, upperBound: null }, 18)).toBe('block');
  });
});

describe('ageSignalError', () => {
  it('does nothing while the flag is off', async () => {
    const request = jest.fn();
    expect(await ageSignalError(false, request)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('requests the range at the gate threshold when enabled', async () => {
    const request = jest.fn().mockResolvedValue(adult);
    expect(await ageSignalError(true, request, 18)).toBeNull();
    expect(request).toHaveBeenCalledWith({ threshold1: 18 });
  });

  it('routes an under-gate signal into the existing block path message', async () => {
    const request = jest.fn().mockResolvedValue({ lowerBound: 13, upperBound: 17 });
    expect(await ageSignalError(true, request, 18)).toBe(
      'You must be at least 18 to use Open Mic Finder.',
    );
  });

  it('passes when the platform request fails: nothing is stored, gate still applies', async () => {
    const request = jest.fn().mockRejectedValue(new Error('unavailable'));
    expect(await ageSignalError(true, request, 18)).toBeNull();
  });
});
