import { captureException } from '@sentry/react-native';

import { NETWORK_MESSAGE, userError, userMessage } from './user-error';

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

describe('userError', () => {
  it('maps known Postgres codes to plain language', () => {
    expect(
      userError({ code: '42501', message: 'new row violates row-level security' }, 'x').message,
    ).toContain('not allowed');
    expect(userError({ code: '23505', message: 'duplicate key value' }, 'x').message).toContain(
      'already exists',
    );
    expect(
      userError({ code: 'PGRST116', message: 'JSON object requested' }, 'x').message,
    ).toContain('could not be found');
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

describe('userMessage', () => {
  it('shows the translated message rather than the screen guessing a cause', () => {
    const failure = userError({ code: '42501', message: 'denied by policy' }, 'Could not load.');
    expect(userMessage(failure, 'Could not load mics. Try again.')).toContain('not allowed');
  });

  it('blames the connection only when it was the connection', () => {
    const offline = userError({ message: 'TypeError: Failed to fetch' }, 'Could not load mics.');
    expect(userMessage(offline, 'x')).toBe(NETWORK_MESSAGE);

    // What the 404 from a database missing a migration looked like: the
    // server answered, so nothing here may tell the reader to check wifi.
    const answered = userError(
      { code: 'PGRST202', message: 'Could not find the function public.search_discover' },
      'Could not load mics. Try again.',
    );
    const shown = userMessage(answered, 'Could not load mics. Try again.');
    expect(shown).toBe('Could not load mics. Try again.');
    expect(shown).not.toMatch(/connection/i);
  });

  it('falls back for anything that did not come from userError', () => {
    expect(userMessage(new Error('relation "mic_series" does not exist'), 'Could not load.')).toBe(
      'Could not load.',
    );
    expect(userMessage(undefined, 'Could not load.')).toBe('Could not load.');
    expect(userMessage({ message: 'raw' }, 'Could not load.')).toBe('Could not load.');
  });
});
