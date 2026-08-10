import { ROSTER_STATUS_LABELS, STATUS_LABELS } from '@/features/signups/labels';
import { Constants } from '@/types/database.types';

import {
  FLAG_REASON_LABELS,
  REPORT_REASON_LABELS,
  REPORT_TARGET_LABELS,
  sanctionMessage,
} from './labels';

describe('safety and signup label maps', () => {
  it('covers every enum value with no raw underscores leaking through', () => {
    const cases: [readonly string[], Record<string, string>][] = [
      [Constants.public.Enums.report_reason, REPORT_REASON_LABELS],
      [Constants.public.Enums.report_target, REPORT_TARGET_LABELS],
      [Constants.public.Enums.flag_reason, FLAG_REASON_LABELS],
      [Constants.public.Enums.signup_status, STATUS_LABELS],
      [Constants.public.Enums.signup_status, ROSTER_STATUS_LABELS],
    ];
    for (const [values, labels] of cases) {
      for (const value of values) {
        expect(labels[value]).toBeTruthy();
        expect(labels[value]).not.toContain('_');
      }
    }
  });

  it('renders roster statuses in plain language', () => {
    expect(ROSTER_STATUS_LABELS.no_show).toBe('Marked no-show');
    expect(ROSTER_STATUS_LABELS.drawn).not.toContain('You');
  });
});

describe('sanctionMessage', () => {
  it('words a warning as a warning', () => {
    expect(
      sanctionMessage({ type: 'warned', scope: 'all_writes', reason: 'Be kind.', expires_at: null }),
    ).toBe('A warning from the moderators: Be kind.');
  });

  it('names the suspended area and the end date', () => {
    const msg = sanctionMessage({
      type: 'suspended',
      scope: 'signups',
      reason: 'Repeated no-shows.',
      expires_at: '2026-09-01T00:00:00.000Z',
    });
    expect(msg).toContain('Signing up is suspended until');
    expect(msg).toContain('Repeated no-shows.');
  });

  it('says a ban plainly', () => {
    expect(
      sanctionMessage({ type: 'banned', scope: 'all_writes', reason: 'Harassment.', expires_at: null }),
    ).toBe('Your account has been disabled by the moderators. Harassment.');
  });
});
