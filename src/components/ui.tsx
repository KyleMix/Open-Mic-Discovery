import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { fonts, maxFontScale, minTouchTarget, palette, radius, spacing, type } from '@/theme';

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

/**
 * A Screen for forms: scrolls, and rides above the keyboard so inputs and
 * the submit button are never covered on small phones.
 */
export function FormScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.flexBg}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flexBg}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Wraps content that contains a text input (a bottom sheet, or a whole
 * scrolling screen with grow) so the keyboard pushes it up, not over it.
 */
export function KeyboardShift({ children, grow }: { children: ReactNode; grow?: boolean }) {
  return (
    <KeyboardAvoidingView
      style={grow ? styles.flexBg : undefined}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale} style={styles.title}>
      {children}
    </Text>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return (
    <Text maxFontSizeMultiplier={maxFontScale} style={styles.body}>
      {children}
    </Text>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" maxFontSizeMultiplier={maxFontScale} style={styles.error}>
      {children}
    </Text>
  );
}

export function LoadingView({ label }: { label: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator color={palette.text} size="large" />
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.body}>
        {label}
      </Text>
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string | null };

export function Field({ label, error, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.fieldLabel}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        maxFontSizeMultiplier={maxFontScale}
        placeholderTextColor={palette.textFaint}
        style={styles.input}
        {...inputProps}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  kind?: 'primary' | 'secondary';
};

export function Button({ label, onPress, disabled, busy, kind = 'primary' }: ButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? palette.bg : palette.text} />
      ) : (
        <Text
          maxFontSizeMultiplier={maxFontScale}
          style={[styles.buttonLabel, kind === 'secondary' && styles.buttonLabelSecondary]}
        >
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

type ToggleRowProps = {
  label: string;
  description: string;
  value: boolean;
  onToggle: (next: boolean) => void;
  /** Optional leading icon, e.g. a discipline glyph. */
  icon?: ReactNode;
};

export function ToggleRow({ label, description, value, onToggle, icon }: ToggleRowProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onToggle(!value)}
      style={[styles.toggleRow, value && styles.toggleRowActive]}
    >
      {icon}
      <View style={styles.toggleText}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.fieldLabel}>
          {label}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.caption}>
          {description}
        </Text>
      </View>
      <View style={[styles.toggleDot, value && styles.toggleDotActive]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  flexBg: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  formContent: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.title.fontSize,
    letterSpacing: 0.5,
    lineHeight: type.title.lineHeight,
  },
  body: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  caption: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
  },
  error: {
    color: palette.danger,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  input: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    color: palette.text,
    fontSize: type.body.fontSize,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  button: {
    alignItems: 'center',
    backgroundColor: palette.text,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: minTouchTarget + 4,
    paddingHorizontal: spacing.md,
  },
  buttonSecondary: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    color: palette.bg,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
    letterSpacing: 0.5,
  },
  buttonLabelSecondary: {
    color: palette.text,
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: minTouchTarget + 12,
    padding: spacing.md,
  },
  toggleRowActive: {
    borderColor: palette.text,
  },
  toggleText: {
    flex: 1,
    gap: spacing.xs,
  },
  toggleDot: {
    backgroundColor: palette.bgPressed,
    borderRadius: radius.md,
    height: 24,
    width: 24,
  },
  toggleDotActive: {
    backgroundColor: palette.success,
  },
});
