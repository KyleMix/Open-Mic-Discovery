import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Button, ErrorText, Field, KeyboardShift, Screen, Title } from '@/components/ui';
import { ScreenHeader } from '@/components/screen-header';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { useBlockedUsers, useDeleteAccount, useUnblockUser } from '@/features/safety/queries';
import { SUPPORT_EMAIL, contactSupport } from '@/lib/support';
import { fonts, maxFontScale, palette, radius, spacing, type } from '@/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const blocked = useBlockedUsers(session?.user.id);
  const unblock = useUnblockUser();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!session) {
    return (
      <>
        <ScreenHeader title="Settings" />
        <Screen>
          <SignUpPrompt
            title="Settings live with an account"
            reason="Blocked users, notification choices, and account controls all belong to an account."
          />
        </Screen>
      </>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <ScreenHeader title="Settings" />
      <Title>Settings</Title>

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Notifications
      </Text>
      <Button
        label="Notification preferences"
        kind="secondary"
        onPress={() => router.push('/notification-prefs')}
      />

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Legal
      </Text>
      {/* The in-app copies are the source of truth until the hosted pages
          exist; the old hosted-URL buttons opened a 404. Help below links
          the same screens, kept here too so Legal is not an empty header. */}
      <Button label="Terms of use" kind="secondary" onPress={() => router.push('/terms')} />
      <Button label="Privacy policy" kind="secondary" onPress={() => router.push('/privacy')} />

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Blocked users
      </Text>
      {blocked.isPending ? (
        <Body>Loading</Body>
      ) : blocked.isError ? (
        <>
          <ErrorText>Could not load blocked users.</ErrorText>
          <Button label="Try again" kind="secondary" onPress={() => blocked.refetch()} />
        </>
      ) : blocked.data.length === 0 ? (
        <Body>Nobody is blocked. Blocking hides that user from you everywhere in the app.</Body>
      ) : (
        <>
          {unblock.isError ? (
            <ErrorText>
              {unblock.error instanceof Error
                ? unblock.error.message
                : 'Could not unblock them. Try again.'}
            </ErrorText>
          ) : null}
          {blocked.data
            .filter((b): b is typeof b & { blocked_id: string } => b.blocked_id != null)
            .map((b) => (
              <View key={b.blocked_id} style={styles.blockRow}>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.blockText}>
                  {b.display_name ?? 'Blocked user'}
                  {b.handle ? ` (@${b.handle})` : ''}
                </Text>
                <Button
                  label="Unblock"
                  kind="secondary"
                  busy={unblock.isPending}
                  onPress={() =>
                    unblock.mutate({ blockerId: session.user.id, blockedId: b.blocked_id })
                  }
                />
              </View>
            ))}
        </>
      )}

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Help
      </Text>
      <Body>
        Stuck, or something in the app is wrong? Email us at {SUPPORT_EMAIL} and a person reads it.
      </Body>
      <Button
        label="Contact support"
        kind="secondary"
        onPress={() => contactSupport('Open Mic Explorer support')}
      />
      <Button label="Read the terms" kind="secondary" onPress={() => router.push('/terms')} />
      <Button
        label="Read the privacy policy"
        kind="secondary"
        onPress={() => router.push('/privacy')}
      />

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        Account
      </Text>
      <Body>
        Deleting your account removes your sign-in and personal data immediately. Anonymized records
        of past signups are retained so signup history stays intact. This cannot be undone.
      </Body>
      <Button label="Delete account" onPress={() => setConfirmOpen(true)} />

      <DeleteConfirmModal visible={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </ScrollView>
  );
}

function DeleteConfirmModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session } = useSession();
  const deleteAccount = useDeleteAccount(session?.user.id);
  const [confirmText, setConfirmText] = useState('');
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardShift>
          {/* The sheet reaches the physical screen bottom; the last button
              must clear the home indicator. */}
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
              Delete your account?
            </Text>
            <Body>This is immediate and permanent. Type DELETE to confirm.</Body>
            <Field
              label="Confirmation"
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              placeholder="DELETE"
            />
            {deleteAccount.isError ? (
              <ErrorText>
                {deleteAccount.error instanceof Error
                  ? deleteAccount.error.message
                  : 'Could not delete the account.'}
              </ErrorText>
            ) : null}
            <Button
              label="Delete my account forever"
              busy={deleteAccount.isPending}
              disabled={confirmText.trim() !== 'DELETE'}
              onPress={() => deleteAccount.mutate()}
            />
            <Button label="Keep my account" kind="secondary" onPress={onClose} />
          </View>
        </KeyboardShift>
      </View>
    </Modal>
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
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    marginTop: spacing.sm,
  },
  blockRow: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  blockText: {
    color: palette.text,
    fontSize: type.body.fontSize,
  },
  backdrop: {
    backgroundColor: palette.scrim,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: spacing.sm,
    padding: spacing.lg,
  },
});
