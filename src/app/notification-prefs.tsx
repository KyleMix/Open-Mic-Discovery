import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Body, Button, ErrorText, LoadingView, ToggleRow } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { requestForegroundLocation } from '@/features/discovery/location';
import { useUpdatePrefs } from '@/features/notifications/queries';
import { getSupabase } from '@/lib/supabase';
import { fonts, palette, spacing, type } from '@/theme';

/** Granular notification opt-outs. Everything here defaults conservative. */
export default function NotificationPrefsScreen() {
  const { session } = useSession();
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
        throw new Error(error.message);
      }
      return data;
    },
  });

  if (!session || prefs.isPending) {
    return <LoadingView label="Loading preferences" />;
  }
  if (prefs.isError) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ErrorText>Could not load preferences.</ErrorText>
        <Button label="Try again" onPress={() => prefs.refetch()} />
      </ScrollView>
    );
  }

  const p = prefs.data ?? {
    profile_id: session.user.id,
    signup_updates: true,
    favorite_reminders: true,
    new_mic_nearby: false,
    nearby_radius_km: 25,
    weekly_digest: false,
    updated_at: '',
  };

  const set = (patch: Partial<typeof p>) =>
    update.mutate({ userId: session.user.id, patch: { ...p, ...patch } });

  async function enableNearby() {
    setLocationNote(null);
    const result = await requestForegroundLocation();
    if (result.status !== 'granted') {
      setLocationNote(
        'Nearby alerts need a one-time location to know what "near you" means. Allow location and try again.',
      );
      return;
    }
    const { error } = await getSupabase()
      .from('profiles')
      .update({ home_location: `POINT(${result.lng} ${result.lat})` })
      .eq('id', session!.user.id);
    if (error) {
      setLocationNote('Could not save your home area. Try again.');
      return;
    }
    set({ new_mic_nearby: true });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Notifications',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
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
        description="When a new mic appears within your chosen radius. Turning this on saves your current location once as your home area; it is never tracked."
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
        <>
          <Text style={styles.radiusLabel}>How far away counts as near you?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[
              { km: 10, label: '5 miles' },
              { km: 25, label: '15 miles' },
              { km: 50, label: '30 miles' },
              { km: 100, label: '60 miles' },
            ].map(({ km, label }) => (
              <Button
                key={km}
                label={label}
                kind={p.nearby_radius_km === km ? 'primary' : 'secondary'}
                onPress={() => set({ nearby_radius_km: km })}
              />
            ))}
          </ScrollView>
        </>
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
  radiusLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
});
