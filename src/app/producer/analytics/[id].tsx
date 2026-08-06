import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, LoadingView, Screen, Title } from '@/components/ui';
import { getSupabase } from '@/lib/supabase';
import { userError } from '@/lib/user-error';
import { fonts, palette, spacing, type } from '@/theme';

/** Signups and turnout per night for one listing. */
export default function AnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const stats = useQuery({
    queryKey: ['analytics', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = getSupabase();
      // Past nights only: the 90-day forward window otherwise fills the
      // screen with future zero-signup rows and skews every total.
      const { data: occurrences, error } = await supabase
        .from('mic_occurrences')
        .select('id, starts_at, status, signups(status)')
        .eq('series_id', id!)
        .lte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: false })
        .limit(20);
      if (error) {
        throw userError(error, 'Could not load analytics. Check your connection and try again.');
      }
      return occurrences;
    },
  });

  if (stats.isPending) {
    return <LoadingView label="Crunching the numbers" />;
  }
  if (stats.isError) {
    return (
      <Screen>
        <Title>Listing analytics</Title>
        <ErrorText>Could not load analytics.</ErrorText>
        <Button label="Try again" onPress={() => stats.refetch()} />
      </Screen>
    );
  }

  const nights = stats.data;
  const totals = nights.reduce(
    (acc, n) => {
      for (const s of n.signups) {
        acc.signups += 1;
        if (s.status === 'performed') {
          acc.performed += 1;
        }
        if (s.status === 'no_show') {
          acc.noShows += 1;
        }
      }
      return acc;
    },
    { signups: 0, performed: 0, noShows: 0 },
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Analytics',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      <View style={styles.totalsRow}>
        <Total label="Signups" value={totals.signups} />
        <Total label="Performed" value={totals.performed} />
        <Total label="No-shows" value={totals.noShows} />
      </View>
      {nights.length === 0 ? (
        <Body>No nights yet. Analytics fill in as your mic runs.</Body>
      ) : (
        nights.map((n) => (
          <View key={n.id} style={styles.nightRow}>
            <Text style={styles.nightDate}>
              {new Date(n.starts_at).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              {n.status === 'cancelled' ? ' (cancelled)' : ''}
            </Text>
            <Text style={styles.nightCount}>
              {n.signups.length} {n.signups.length === 1 ? 'signup' : 'signups'}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  totalsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  total: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  totalValue: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.title.fontSize,
  },
  totalLabel: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  nightRow: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  nightDate: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  nightCount: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
  },
});
