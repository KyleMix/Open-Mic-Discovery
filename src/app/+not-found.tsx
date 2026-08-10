import { useRouter } from 'expo-router';

import { ScreenHeader } from '@/components/screen-header';
import { Body, Button, Screen, Title } from '@/components/ui';

/**
 * Where a link that matches nothing lands. Without this route, expo-router
 * ships its own light-themed "Unmatched Route" screen, in production, with
 * a link to the app's sitemap: a stale share link or a truncated deep link
 * ended on a developer tool.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <ScreenHeader title="Not found" />
      <Screen>
        <Title>That page is not here</Title>
        <Body>
          The link may be old, or the thing it pointed at may have been taken down. The mics are
          still where they always are.
        </Body>
        <Button label="Find a mic" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    </>
  );
}
