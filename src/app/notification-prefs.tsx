import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Body, Button, ErrorText, LoadingView, ToggleRow } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useUpdatePrefs } from '@/features/notifications/queries';
import { getSupabase } from '@/lib/supabase';
import { fonts, palette, spacing, type } from '@/theme';

/** Granular notification opt-outs. Everything here defaults conservative. */
export default function NotificationPrefsScreen() {
  const { session } = useSession();
  const update = useUpdatePrefs();
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
        description="When a new mic appears within your chosen radius of your home city."
        value={p.new_mic_nearby}
        onToggle={(v) => set({ new_mic_nearby: v })}
      />
      {p.new_mic_nearby ? (
        <>
          <Text style={styles.radiusLabel}>Alert radius</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[10, 25, 50, 100].map((km) => (
              <Button
                key={km}
                label={`${km} km`}
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
