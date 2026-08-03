import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { fonts, minTouchTarget, palette, spacing, type } from '@/theme';

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

export function LoadingView({ label }: { label: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator color={palette.text} size="large" />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string | null };

export function Field({ label, error, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        pressed && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? palette.bg : palette.text} />
      ) : (
        <Text style={[styles.buttonLabel, kind === 'secondary' && styles.buttonLabelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
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
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.caption}>{description}</Text>
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
    borderRadius: 10,
    color: palette.text,
    fontSize: type.body.fontSize,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  button: {
    alignItems: 'center',
    backgroundColor: palette.text,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: minTouchTarget + 4,
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
    borderRadius: 12,
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
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  toggleDotActive: {
    backgroundColor: palette.success,
  },
});
