import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { SelectField } from '@/components/select';
import { ScreenHeader } from '@/components/screen-header';
import { PushPrimer } from '@/features/notifications/components/push-primer';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { Body, Button, ErrorText, LoadingView, ToggleRow } from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { requestForegroundLocation } from '@/features/discovery/location';
import { useUpdatePrefs } from '@/features/notifications/queries';
import { registerPushToken } from '@/lib/notifications';
import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import { palette, spacing } from '@/theme';

/** Granular notification opt-outs. Everything here defaults conservative. */
export default function NotificationPrefsScreen() {
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const update = useUpdatePrefs();
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const prefs = useQuery({
    queryKey: ['prefs', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('notification_prefs')
        .select('*')
        .eq('profile_id', session!.user.id)
        .maybeSingle();
      if (error) {
        throw userError(error, 'Could not load preferences. Check your connection and try again.');
      }
      return data;
    },
  });

  if (!session) {
    return (
      <>
        <ScreenHeader title="Notifications" />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <SignUpPrompt
            title="Reminders need somewhere to land"
            reason="Notification choices belong to an account, so they follow you to any device."
          />
        </ScrollView>
      </>
    );
  }
  if (prefs.isPending) {
    return (
      <>
        <ScreenHeader title="Notifications" />
        <LoadingView label="Loading preferences" />
      </>
    );
  }
  if (prefs.isError) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ScreenHeader title="Notifications" />
        <ErrorText>Could not load preferences.</ErrorText>
        <Button label="Try again" onPress={() => prefs.refetch()} />
      </ScrollView>
    );
  }

  const p = {
    signup_updates: prefs.data?.signup_updates ?? true,
    favorite_reminders: prefs.data?.favorite_reminders ?? true,
    new_mic_nearby: prefs.data?.new_mic_nearby ?? false,
    nearby_radius_km: prefs.data?.nearby_radius_km ?? 25,
    weekly_digest: prefs.data?.weekly_digest ?? false,
  };

  // Send only the preference fields. Spreading the whole row here used to
  // leak updated_at into the upsert, which the server rejects, so taps on
  // these toggles failed for anyone missing a prefs row.
  const set = (patch: Partial<typeof p>) => {
    update.mutate({ userId: session.user.id, patch: { ...p, ...patch } });
    // Turning any preference on is an explicit ask for pushes; make sure the
    // OS permission and token actually exist.
    if (Object.values(patch).some((v) => v === true)) {
      registerPushToken(session.user.id, { promptIfNeeded: true });
    }
  };

  async function enableNearby() {
    setLocationNote(null);
    // The profile's home area already carries coordinates for most people;
    // only fall back to a one-time device location when it does not.
    if (profile.data?.home_lat != null && profile.data?.home_lng != null) {
      set({ new_mic_nearby: true });
      return;
    }
    const result = await requestForegroundLocation();
    if (result.status !== 'granted') {
      setLocationNote(
        'Nearby alerts need to know your home area. Allow location once, or set your city in Edit profile, then try again.',
      );
      return;
    }
    const { error } = await getSupabase()
      .from('profiles')
      .update({ home_lat: result.lat, home_lng: result.lng })
      .eq('id', session!.user.id);
    if (error) {
      setLocationNote('Could not save your home area. Try again.');
      return;
    }
    set({ new_mic_nearby: true });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <ScreenHeader title="Notifications" />
      <PushPrimer
        userId={session.user.id}
        message="Turn on notifications and the choices below can actually reach you."
      />
      <ToggleRow
        label="Signup updates"
        description="When your spot is confirmed, drawn, waitlisted, or changed."
        value={p.signup_updates}
        onToggle={(v) => set({ signup_updates: v })}
      />
      <ToggleRow
        label="Favorite reminders"
        description="A nudge on the day a mic you favorited is happening."
        value={p.favorite_reminders}
        onToggle={(v) => set({ favorite_reminders: v })}
      />
      <ToggleRow
        label="New mics near you"
        description="When a new mic appears near your home area (from your profile). Your location is never tracked."
        value={p.new_mic_nearby}
        onToggle={(v) => {
          if (v) {
            enableNearby();
          } else {
            set({ new_mic_nearby: false });
          }
        }}
      />
      {locationNote ? <ErrorText>{locationNote}</ErrorText> : null}
      {p.new_mic_nearby ? (
        <SelectField
          label="How far away counts as near you?"
          value={p.nearby_radius_km}
          options={[
            { value: 10, label: '5 miles' },
            { value: 25, label: '15 miles' },
            { value: 50, label: '30 miles' },
            { value: 100, label: '60 miles' },
          ]}
          onChange={(km) => set({ nearby_radius_km: km })}
        />
      ) : null}
      <ToggleRow
        label="Weekly digest"
        description="One weekly summary of what is happening near you."
        value={p.weekly_digest}
        onToggle={(v) => set({ weekly_digest: v })}
      />
      {update.isError ? (
        <ErrorText>
          {update.error instanceof Error ? update.error.message : 'Could not save.'}
        </ErrorText>
      ) : null}
      <Body>
        Push permission is controlled by your device settings; these choices control what we send.
      </Body>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
