import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Button } from '@/components/ui';
import { fonts, maxFontScale, palette, spacing, type } from '@/theme';

type Props = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

/** One bottom-sheet confirmation, shared instead of re-implemented per screen. */
export function ConfirmSheet({ title, body, confirmLabel, onConfirm, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* The sheet reaches the physical screen bottom, so the last button
            must clear the home indicator, not just have decorative padding. */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.title}>
            {title}
          </Text>
          <Body>{body}</Body>
          <Button label={confirmLabel} onPress={onConfirm} />
          <Button label="Back" kind="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * In-sheet discard confirmation for modals with typed input: swapped into
 * the sheet's content instead of stacking a second modal, so closing with
 * text entered asks before wiping it.
 */
export function DiscardPrompt({
  onDiscard,
  onKeep,
}: {
  onDiscard: () => void;
  onKeep: () => void;
}) {
  return (
    <>
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.title}>
        Discard what you typed?
      </Text>
      <Body>Your text is not saved anywhere once this closes.</Body>
      <Button label="Discard" onPress={onDiscard} />
      <Button label="Keep writing" kind="secondary" onPress={onKeep} />
    </>
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
});
