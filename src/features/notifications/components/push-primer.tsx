import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Body, Button } from '@/components/ui';
import { getPushPermissionState, registerPushToken } from '@/lib/notifications';
import { palette, spacing } from '@/theme';

/**
 * The ask before the OS asks.
 *
 * The system notification dialog used to fire as a side effect of signing
 * up or starring a mic, with no warning: the classic cold prompt that
 * tanks grant rates. This renders the reason first, and the dialog fires
 * only from a deliberate tap on the button. After a denial it says so
 * honestly and points at system settings, because a prefs screen full of
 * toggles that silently deliver nothing is worse than no screen at all.
 */
export function PushPrimer({ userId, message }: { userId: string; message: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const state = useQuery({
    queryKey: ['push-permission'],
    queryFn: getPushPermissionState,
  });

  if (state.data === 'undetermined') {
    return (
      <View style={styles.box}>
        <Body>{message}</Body>
        <Button
          label="Turn on notifications"
          kind="secondary"
          busy={busy}
          onPress={async () => {
            setBusy(true);
            await registerPushToken(userId, { promptIfNeeded: true });
            await queryClient.invalidateQueries({ queryKey: ['push-permission'] });
            setBusy(false);
          }}
        />
      </View>
    );
  }
  if (state.data === 'denied') {
    return (
      <View style={styles.box}>
        <Body>
          Notifications are switched off for this app in system settings, so reminders and status
          updates cannot arrive.
        </Body>
        <Button
          label="Open system settings"
          kind="secondary"
          onPress={() => Linking.openSettings().catch(() => null)}
        />
      </View>
    );
  }
  // Granted needs no furniture, and environments without push get silence.
  return null;
}

const styles = StyleSheet.create({
  box: {
    borderColor: palette.border,
    borderRadius: 12,
    borderTopWidth: 0,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
});
