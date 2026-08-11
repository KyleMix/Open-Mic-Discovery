import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiscardPrompt } from '@/components/confirm-sheet';
import { Body, Button, ErrorText, Field, KeyboardShift } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { setReturnTo } from '@/stores/return-to';
import { REPORT_REASON_LABELS } from '@/features/safety/labels';
import {
  useBlockUser,
  useSubmitReport,
  type ReportReason,
  type ReportTarget,
} from '@/features/safety/queries';
import { fonts, maxFontScale, minTouchTarget, palette, radius, spacing, type } from '@/theme';

const REASONS: { reason: ReportReason; label: string }[] = (
  [
    'spam',
    'harassment',
    'hate',
    'sexual_content',
    'violence_threat',
    'impersonation',
    'illegal',
    'other',
  ] as const
).map((reason) => ({ reason, label: REPORT_REASON_LABELS[reason] }));

type Props = {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  /** When reporting a person, offer to block them in the same flow. */
  blockableUserId?: string;
  targetLabel: string;
};

/**
 * The Report action (Guideline 1.2), one component reused on every surface:
 * listings, venues, and profiles wherever their content appears.
 */
export function ReportModal({
  visible,
  onClose,
  targetType,
  targetId,
  blockableUserId,
  targetLabel,
}: Props) {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const report = useSubmitReport();
  const block = useBlockUser();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const insets = useSafeAreaInsets();

  function reallyClose() {
    setReason(null);
    setDetails('');
    setDone(false);
    setConfirmDiscard(false);
    report.reset();
    onClose();
  }

  function close() {
    if (!done && (reason !== null || details.trim())) {
      setConfirmDiscard(true);
      return;
    }
    reallyClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <KeyboardShift>
          {/* The sheet reaches the physical screen bottom; the last button
              must clear the home indicator. */}
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
            {confirmDiscard ? (
              <DiscardPrompt onDiscard={reallyClose} onKeep={() => setConfirmDiscard(false)} />
            ) : done ? (
              <>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.title}>
                  Report received
                </Text>
                <Body>
                  Thank you. Reports are reviewed within 24 hours and acted on when they break the
                  rules everyone accepted.
                </Body>
                {block.isError ? (
                  <ErrorText>
                    {block.error instanceof Error
                      ? block.error.message
                      : 'Could not block them. Try again.'}
                  </ErrorText>
                ) : null}
                {blockableUserId && session && blockableUserId !== session.user.id ? (
                  <Button
                    label="Also block this user"
                    kind="secondary"
                    busy={block.isPending}
                    onPress={() =>
                      block.mutate(
                        { blockerId: session.user.id, blockedId: blockableUserId },
                        { onSuccess: close },
                      )
                    }
                  />
                ) : null}
                <Button label="Done" onPress={close} />
              </>
            ) : !session ? (
              <>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.title}>
                  Sign in to report
                </Text>
                <Body>Reporting needs an account so our moderators can follow up.</Body>
                <Button
                  label="Sign in"
                  onPress={() => {
                    close();
                    setReturnTo(pathname);
                    router.push('/(auth)/sign-in');
                  }}
                />
                <Button label="Cancel" kind="secondary" onPress={close} />
              </>
            ) : (
              <>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.title}>
                  Report {targetLabel}
                </Text>
                {REASONS.map((r) => (
                  <Pressable
                    key={r.reason}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: reason === r.reason }}
                    onPress={() => setReason(r.reason)}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      reason === r.reason && styles.reasonRowActive,
                      pressed && styles.reasonRowPressed,
                    ]}
                  >
                    <Text maxFontSizeMultiplier={maxFontScale} style={styles.reasonText}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
                <Field
                  label="Details (optional)"
                  value={details}
                  onChangeText={setDetails}
                  placeholder="What happened?"
                />
                {report.isError ? (
                  <ErrorText>
                    {report.error instanceof Error ? report.error.message : 'Could not submit.'}
                  </ErrorText>
                ) : null}
                <Button
                  label="Submit report"
                  busy={report.isPending}
                  disabled={!reason}
                  onPress={() =>
                    report.mutate(
                      {
                        reporterId: session.user.id,
                        targetType,
                        targetId,
                        reason: reason!,
                        details: details.trim() || null,
                      },
                      { onSuccess: () => setDone(true) },
                    )
                  }
                />
                <Button label="Cancel" kind="secondary" onPress={close} />
              </>
            )}
          </View>
        </KeyboardShift>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  reasonRow: {
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  reasonRowActive: {
    borderColor: palette.text,
  },
  reasonRowPressed: {
    backgroundColor: palette.bgPressed,
  },
  reasonText: {
    color: palette.text,
    fontSize: type.body.fontSize,
  },
});
