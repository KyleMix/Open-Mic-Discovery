import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, Field, LoadingView, Title } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useBlockedUsers, useDeleteAccount, useUnblockUser } from '@/features/safety/queries';
import { fonts, palette, spacing, type } from '@/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const blocked = useBlockedUsers(session?.user.id);
  const unblock = useUnblockUser();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!session) {
    return <LoadingView label="Settings" />;
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Settings',
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      <Title>Settings</Title>

      <Text style={styles.sectionTitle}>Notifications</Text>
      <Button
        label="Notification preferences"
        kind="secondary"
        onPress={() => router.push('/notification-prefs')}
      />

      <Text style={styles.sectionTitle}>Subscriptions</Text>
      <Button
        label="Producer Pro and Restore Purchases"
        kind="secondary"
        onPress={() => router.push('/paywall')}
      />

      <Text style={styles.sectionTitle}>Blocked users</Text>
      {blocked.isPending ? (
        <Body>Loading...</Body>
      ) : blocked.isError ? (
        <ErrorText>Could not load blocked users.</ErrorText>
      ) : blocked.data.length === 0 ? (
        <Body>Nobody is blocked. Blocking hides that user from you everywhere in the app.</Body>
      ) : (
        blocked.data.map((b) => (
          <View key={b.blocked_id} style={styles.blockRow}>
            <Text style={styles.blockText}>Blocked user</Text>
            <Button
              label="Unblock"
              kind="secondary"
              busy={unblock.isPending}
              onPress={() =>
                unblock.mutate({ blockerId: session.user.id, blockedId: b.blocked_id })
              }
            />
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Account</Text>
      <Body>
        Deleting your account removes your sign-in and personal data immediately. Anonymized records
        of past signups are retained so event history stays intact. This cannot be undone.
      </Body>
      <Button label="Delete account" onPress={() => setConfirmOpen(true)} />

      <DeleteConfirmModal visible={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </ScrollView>
  );
}

function DeleteConfirmModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const deleteAccount = useDeleteAccount();
  const [confirmText, setConfirmText] = useState('');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sectionTitle}>Delete your account?</Text>
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
    borderRadius: 12,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
