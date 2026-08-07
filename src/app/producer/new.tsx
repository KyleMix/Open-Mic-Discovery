import { Stack, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDiscardGuard } from '@/components/discard-guard';
import { Body, Button, Screen, Title } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { SeriesForm, type SeriesFormValues } from '@/features/producer/components/series-form';
import { signupOpensInterval } from '@/features/producer/signup-opens';
import { useCreateSeries } from '@/features/producer/queries';
import { setReturnTo } from '@/stores/return-to';
import { palette } from '@/theme';

export default function NewSeriesScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const create = useCreateSeries();
  const [dirty, setDirty] = useState(false);
  const { guardElement, bypassGuard } = useDiscardGuard({
    when: dirty,
    title: 'Discard this listing?',
    body: 'Nothing is saved yet. Leaving now loses everything you entered.',
    discardLabel: 'Discard it',
  });

  function submit(values: SeriesFormValues) {
    if (!session) {
      return;
    }
    create.mutate(
      {
        userId: session.user.id,
        venueId: values.venueId,
        newVenue: values.newVenue,
        series: {
          title: values.title,
          description: values.description || null,
          disciplines: values.disciplines,
          signup_method: values.signupMethod,
          rrule: values.rrule,
          anchor_date: values.anchorDate,
          start_time: values.startTime,
          timezone: values.timezone,
          signup_opens: signupOpensInterval(values.signupOpensMinutes),
          cost_cents: Math.round(Number(values.costDollars || '0') * 100),
          cost_note: values.costNote || null,
          set_length_minutes: values.setLengthMinutes ? Number(values.setLengthMinutes) : null,
          capacity: values.capacity ? Number(values.capacity) : null,
        },
      },
      { onSuccess: (seriesId) => bypassGuard(() => router.replace(`/producer/${seriesId}`)) },
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Add a mic',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      {!session ? (
        <Screen>
          <Title>Sign in first</Title>
          <Body>Creating a listing needs an account.</Body>
          <Button
            label="Sign in"
            onPress={() => {
              setReturnTo(pathname);
              router.push('/(auth)/sign-in');
            }}
          />
        </Screen>
      ) : (
        <SeriesForm
          busy={create.isPending}
          error={
            create.isError
              ? create.error instanceof Error
                ? create.error.message
                : 'Could not create the mic.'
              : null
          }
          submitLabel="Create listing"
          onSubmit={submit}
          onDirtyChange={setDirty}
        />
      )}
      {guardElement}
    </View>
  );
}
