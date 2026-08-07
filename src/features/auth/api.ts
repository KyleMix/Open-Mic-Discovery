import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { PostgrestError } from '@supabase/supabase-js';

import { clearCachedData } from '@/lib/query-client';
import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import { deriveHandleBase, handleWithSuffix, randomHandleSuffix } from './handle';
import type { Database } from '@/types/database.types';

type Discipline = Database['public']['Enums']['discipline'];

/**
 * Auth errors a person can act on. Known GoTrue messages get a specific
 * translation; everything else falls through to the shared mapper, so no
 * raw server string ever reaches a screen.
 */
function authError(error: { code?: string | null; message?: unknown }, fallback: string): Error {
  const raw = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (raw.includes('invalid login credentials')) {
    return new Error('Email or password is wrong. Check them, or use Forgot your password.');
  }
  if (raw.includes('already registered')) {
    return new Error('An account with that email already exists. Sign in instead.');
  }
  if (raw.includes('email not confirmed')) {
    return new Error('Confirm your email first: open the link we sent you, then sign in.');
  }
  if (raw.includes('rate limit')) {
    return new Error('Too many attempts. Wait a minute and try again.');
  }
  if (raw.includes('weak password') || raw.includes('password should be')) {
    return new Error('That password is too weak. Use at least 10 characters.');
  }
  return userError(error, fallback);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) {
    throw authError(error, 'Could not sign in. Check your connection and try again.');
  }
}

/**
 * Creates the account. When the project requires email confirmation,
 * signUp succeeds with no session; the caller must tell the user to go
 * check their inbox instead of silently doing nothing.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<{ needsEmailConfirmation: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) {
    throw authError(error, 'Could not create the account. Check your connection and try again.');
  }
  return { needsEmailConfirmation: data.session === null };
}

/**
 * Password recovery. The email link redirects into the app via the custom
 * scheme; the reset screen exchanges the code and sets the new password.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: Linking.createURL('reset-password'),
  });
  if (error) {
    throw authError(error, 'Could not send the reset email. Check your connection and try again.');
  }
}

export async function exchangeRecoveryCode(code: string): Promise<void> {
  const { error } = await getSupabase().auth.exchangeCodeForSession(code);
  if (error) {
    throw authError(
      error,
      'That reset link is expired or was requested on another device. Request a new one.',
    );
  }
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) {
    throw authError(error, 'Could not update the password. Try again.');
  }
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) {
    throw authError(error, 'Sign out failed. Try again.');
  }
  // Never leave the previous account's cached data behind for the next
  // sign-in on this device.
  await clearCachedData().catch(() => null);
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
    throw authError(error, 'Apple sign in failed. Try again.');
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
    throw error
      ? authError(error, 'Could not start Google sign in. Try again.')
      : new Error('Could not start Google sign in.');
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
    throw authError(exchangeError, 'Could not finish Google sign in. Try again.');
  }
}

export type OnboardingInput = {
  userId: string;
  displayName: string;
  homeCity: string | null;
  homeRegion: string | null;
  homePostalCode: string | null;
  homeLat: number | null;
  homeLng: number | null;
  stageName: string;
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
 *
 * stage_name is the public identity; display_name is private and no longer
 * collected at signup, so it starts as a copy of the stage name and only
 * diverges if someone sets a private name in Edit profile.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<void> {
  const supabase = getSupabase();

  // The handle is derived from the stage name, so two people picking the same
  // stage name is expected rather than exceptional. Retry with a suffix; asking
  // someone to invent a unique handle is the field this change removed.
  const base = deriveHandleBase(input.stageName);
  let lastError: PostgrestError | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = attempt === 0 ? base : handleWithSuffix(base, randomHandleSuffix());
    const { error } = await supabase.from('profiles').insert({
      id: input.userId,
      handle,
      display_name: input.displayName,
      stage_name: input.stageName,
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
    if (!error) {
      lastError = null;
      break;
    }
    lastError = error;
    if (error.code !== '23505') {
      break;
    }
  }
  if (lastError) {
    if (lastError.code === '23505') {
      throw new Error('Could not set up your profile. Try a slightly different stage name.');
    }
    // A raw database string as the first thing a new user ever reads is
    // the worst possible introduction; translate it like everything else.
    throw userError(lastError, 'Could not finish setup. Check your connection and try again.');
  }
  if (input.isPerformer) {
    const { error } = await supabase.from('performer_profiles').insert({
      profile_id: input.userId,
      disciplines: input.disciplines,
    });
    if (error) {
      throw userError(error, 'Could not finish setup. Try again.');
    }
  }
  if (input.isProducer) {
    const { error } = await supabase.from('producer_profiles').insert({
      profile_id: input.userId,
    });
    if (error) {
      throw userError(error, 'Could not finish setup. Try again.');
    }
  }
  const { error: prefsError } = await supabase.from('notification_prefs').insert({
    profile_id: input.userId,
  });
  if (prefsError) {
    throw userError(prefsError, 'Could not finish setup. Try again.');
  }
}
