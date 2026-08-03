import { captureException } from '@sentry/react-native';

import { NETWORK_MESSAGE, userError } from './user-error';

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

describe('userError', () => {
  it('maps known Postgres codes to plain language', () => {
    expect(userError({ code: '42501', message: 'new row violates row-level security' }, 'x').message).toContain(
      'not allowed',
    );
    expect(userError({ code: '23505', message: 'duplicate key value' }, 'x').message).toContain(
      'already exists',
    );
    expect(userError({ code: 'PGRST116', message: 'JSON object requested' }, 'x').message).toContain(
      'could not be found',
    );
  });

  it('recognizes network failures regardless of code', () => {
    expect(userError({ message: 'TypeError: Failed to fetch' }, 'x').message).toBe(NETWORK_MESSAGE);
    expect(userError({ message: 'Network request failed' }, 'x').message).toBe(NETWORK_MESSAGE);
  });

  it('returns the action-specific fallback for anything unknown, never the raw message', () => {
    const result = userError(
      { code: '99999', message: 'op ERROR: relation "signups" violates constraint' },
      'Could not sign you up. Try again.',
    );
    expect(result.message).toBe('Could not sign you up. Try again.');
    expect(result.message).not.toContain('constraint');
  });

  it('reports the raw error to Sentry before translating', () => {
    const raw = { code: '23503', message: 'violates foreign key' };
    userError(raw, 'x');
    expect(captureException).toHaveBeenCalledWith(raw);
  });
});
