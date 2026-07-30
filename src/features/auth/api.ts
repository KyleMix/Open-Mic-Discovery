import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';

type Discipline = Database['public']['Enums']['discipline'];

/** Supabase network failures can carry empty or non-string messages. */
function authMessage(error: { message?: unknown }, fallback: string): string {
  return typeof error.message === 'string' && error.message.trim().length > 0
    ? error.message
    : fallback;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(authMessage(error, 'Could not reach the server. Check your connection.'));
  }
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signUp({ email, password });
  if (error) {
    throw new Error(authMessage(error, 'Could not reach the server. Check your connection.'));
  }
}

/**
 * Emails a password-reset link that deep-links back into the app at
 * /reset-password. With PKCE the code in that link can only be exchanged
 * by the device that requested it, so the email says to open it here.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const redirectTo = Linking.createURL('reset-password');
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) {
    throw new Error(authMessage(error, 'Could not send the reset email. Check your connection.'));
  }
}

/** Turns the code from a reset link into a signed-in recovery session. */
export async function exchangeRecoveryCode(code: string): Promise<void> {
  const { error } = await getSupabase().auth.exchangeCodeForSession(code);
  if (error) {
    throw new Error(
      authMessage(
        error,
        'That reset link is expired or was requested on another device. Request a new one.',
      ),
    );
  }
}

/** Sets a new password for the signed-in (recovery) session. */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) {
    throw new Error(authMessage(error, 'Could not update the password. Try again.'));
  }
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

/** Native Sign in with Apple (iOS only), exchanged for a Supabase session. */
export async function signInWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw new Error('Apple sign in did not return a token.');
  }
  const { error } = await getSupabase().auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Google via the Supabase OAuth flow in an auth session browser. */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = Linking.createURL('auth-callback');
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    throw new Error(error?.message ?? 'Could not start Google sign in.');
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    throw new Error('Google sign in was cancelled.');
  }
  const code = new URL(result.url).searchParams.get('code');
  if (!code) {
    throw new Error('Google sign in did not return a code.');
  }
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    throw new Error(exchangeError.message);
  }
}

export type OnboardingInput = {
  userId: string;
  handle: string;
  displayName: string;
  homeCity: string | null;
  homeRegion: string | null;
  homePostalCode: string | null;
  homeLat: number | null;
  homeLng: number | null;
  birthYear: number;
  isPerformer: boolean;
  isProducer: boolean;
  disciplines: Discipline[];
  eulaVersion: string;
};

/**
 * Creates the profile and role rows in one pass. The profile insert carries
 * the accepted EULA version; the server stamps the acceptance timestamp.
 * The home area (city+state or ZIP, geocoded on device when possible) is
 * required by a database constraint and stays private to the owner.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<void> {
  const supabase = getSupabase();
  const { error: profileError } = await supabase.from('profiles').insert({
    id: input.userId,
    handle: input.handle,
    display_name: input.displayName,
    home_city: input.homeCity,
    home_region: input.homeRegion,
    home_postal_code: input.homePostalCode,
    home_lat: input.homeLat,
    home_lng: input.homeLng,
    birth_year: input.birthYear,
    is_performer: input.isPerformer,
    is_producer: input.isProducer,
    eula_version: input.eulaVersion,
  });
  if (profileError) {
    if (profileError.code === '23505') {
      throw new Error('That handle is taken. Try another.');
    }
    throw new Error(profileError.message);
  }
  if (input.isPerformer) {
    const { error } = await supabase.from('performer_profiles').insert({
      profile_id: input.userId,
      disciplines: input.disciplines,
    });
    if (error) {
      throw new Error(error.message);
    }
  }
  if (input.isProducer) {
    const { error } = await supabase.from('producer_profiles').insert({
      profile_id: input.userId,
    });
    if (error) {
      throw new Error(error.message);
    }
  }
  const { error: prefsError } = await supabase.from('notification_prefs').insert({
    profile_id: input.userId,
  });
  if (prefsError) {
    throw new Error(prefsError.message);
  }
}
