import { useRouter } from 'expo-router';

import { Body, Button, Screen, Title } from '@/components/ui';

/**
 * What a management route renders for someone who does not manage the mic.
 *
 * Series and occurrence ids are public (share links carry them), so these
 * screens load for anyone who follows a link here. The server refuses every
 * write either way; this keeps the app from presenting a console it knows is
 * not theirs, or an empty roster as fact about someone else's full list.
 */
export function NotYourMic({ seriesId }: { seriesId?: string | null }) {
  const router = useRouter();
  return (
    <Screen>
      <Title>Not your mic</Title>
      <Body>
        This management page belongs to the host who runs this mic. If that is you, sign in with the
        account that manages it.
      </Body>
      {seriesId ? (
        <Button label="View the mic page" onPress={() => router.replace(`/mic/${seriesId}`)} />
      ) : (
        <Button label="Find a mic" onPress={() => router.replace('/(tabs)')} />
      )}
    </Screen>
  );
}
