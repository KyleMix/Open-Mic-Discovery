import { exchangeRecoveryCode, requestPasswordReset, updatePassword } from './api';

jest.mock('@/lib/supabase', () => {
  const auth = {
    resetPasswordForEmail: jest.fn(),
    exchangeCodeForSession: jest.fn(),
    updateUser: jest.fn(),
  };
  return { getSupabase: () => ({ auth }) };
});
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `openmicexplorer://${path}`,
}));
jest.mock('expo-apple-authentication', () => ({}));
jest.mock('expo-web-browser', () => ({}));

const { getSupabase } = jest.requireMock('@/lib/supabase') as {
  getSupabase: () => {
    auth: {
      resetPasswordForEmail: jest.Mock;
      exchangeCodeForSession: jest.Mock;
      updateUser: jest.Mock;
    };
  };
};
const auth = getSupabase().auth;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requestPasswordReset', () => {
  it('sends a trimmed email with the reset deep link', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await requestPasswordReset('  singer@example.com  ');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('singer@example.com', {
      redirectTo: 'openmicexplorer://reset-password',
    });
  });

  it('surfaces a readable error', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'over email rate limit' } });
    await expect(requestPasswordReset('singer@example.com')).rejects.toThrow(
      'Too many attempts. Wait a minute and try again.',
    );
  });
});

describe('exchangeRecoveryCode', () => {
  it('exchanges the code from the link', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    await exchangeRecoveryCode('one-time-code');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
  });

  it('explains expired or cross-device links when the server is vague', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: '' } });
    await expect(exchangeRecoveryCode('stale')).rejects.toThrow(
      'That reset link is expired or was requested on another device. Request a new one.',
    );
  });
});

describe('updatePassword', () => {
  it('updates the signed-in user', async () => {
    auth.updateUser.mockResolvedValue({ error: null });
    await updatePassword('brand-new-pass-1');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'brand-new-pass-1' });
  });

  it('surfaces a readable error', async () => {
    auth.updateUser.mockResolvedValue({ error: { message: 'weak password' } });
    await expect(updatePassword('short')).rejects.toThrow(
      'That password is too weak. Use at least 10 characters.',
    );
  });
});
