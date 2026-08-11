import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { SheetGrabber, useSheetAnimation } from '@/components/sheet-chrome';
import { fonts, maxFontScale, minTouchTarget, palette, radius, spacing, type } from '@/theme';

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  /** Optional one-line explanation shown under the label in the picker. */
  description?: string;
};

type TriggerProps = {
  label: string;
  valueLabel: string;
  placeholderShown: boolean;
  onPress: () => void;
};

/** The closed face of both pickers: looks like an input, opens the sheet. */
function SelectTrigger({ label, valueLabel, placeholderShown, onPress }: TriggerProps) {
  return (
    <View style={styles.field}>
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.fieldLabel}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${valueLabel}`}
        accessibilityHint="Opens a list of choices"
        onPress={onPress}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <Text
          maxFontSizeMultiplier={maxFontScale}
          numberOfLines={1}
          style={[styles.triggerText, placeholderShown && styles.triggerPlaceholder]}
        >
          {valueLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color={palette.textSecondary} />
      </Pressable>
    </View>
  );
}

function SheetShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const animation = useSheetAnimation();
  return (
    <Modal visible transparent animationType={animation} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          style={styles.backdropTouch}
          onPress={onClose}
        />
        {/* The sheet sits on the physical screen bottom; the footer button
            must clear the home indicator. */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <SheetGrabber />
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.sheetTitle}>
            {title}
          </Text>
          <ScrollView contentContainerStyle={styles.optionList}>{children}</ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}

function OptionRow({
  option,
  selected,
  role,
  onPress,
}: {
  option: SelectOption<string | number>;
  selected: boolean;
  role: 'radio' | 'checkbox';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={option.label}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        selected && styles.optionRowActive,
        pressed && styles.optionRowPressed,
      ]}
    >
      <View style={styles.optionText}>
        <Text
          maxFontSizeMultiplier={maxFontScale}
          style={[styles.optionLabel, selected && styles.optionLabelActive]}
        >
          {option.label}
        </Text>
        {option.description ? (
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.optionDescription}>
            {option.description}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={
          role === 'radio'
            ? selected
              ? 'radio-button-on'
              : 'radio-button-off'
            : selected
              ? 'checkbox'
              : 'square-outline'
        }
        size={22}
        color={selected ? palette.success : palette.textDisabled}
      />
    </Pressable>
  );
}

type SelectFieldProps<T extends string | number> = {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
};

/**
 * A single-choice dropdown. Use it wherever a field offers more options
 * than fit comfortably as chips; picking a choice closes the sheet.
 */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <SelectTrigger
        label={label}
        valueLabel={current?.label ?? 'Choose'}
        placeholderShown={!current}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <SheetShell title={label} onClose={() => setOpen(false)}>
          {options.map((option) => (
            <OptionRow
              key={String(option.value)}
              option={option}
              role="radio"
              selected={option.value === value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </SheetShell>
      ) : null}
    </>
  );
}

type MultiSelectFieldProps<T extends string | number> = {
  label: string;
  values: T[];
  options: SelectOption<T>[];
  onChange: (values: T[]) => void;
  /** Shown when nothing is selected, e.g. "Any way". */
  placeholder: string;
};

/**
 * A pick-several dropdown. The trigger summarizes the selection; the sheet
 * stays open while toggling and closes from its Done button.
 */
export function MultiSelectField<T extends string | number>({
  label,
  values,
  options,
  onChange,
  placeholder,
}: MultiSelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => values.includes(o.value));
  const summary = selected.length > 0 ? selected.map((o) => o.label).join(', ') : placeholder;

  function toggleValue(value: T) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  return (
    <>
      <SelectTrigger
        label={label}
        valueLabel={summary}
        placeholderShown={selected.length === 0}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <SheetShell
          title={label}
          onClose={() => setOpen(false)}
          footer={
            <View style={styles.footer}>
              <Button label="Done" onPress={() => setOpen(false)} />
            </View>
          }
        >
          {options.map((option) => (
            <OptionRow
              key={String(option.value)}
              option={option}
              role="checkbox"
              selected={values.includes(option.value)}
              onPress={() => toggleValue(option.value)}
            />
          ))}
        </SheetShell>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  trigger: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.borderInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  triggerPressed: {
    backgroundColor: palette.bgPressed,
  },
  triggerText: {
    color: palette.text,
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: type.body.fontSize,
  },
  triggerPlaceholder: {
    color: palette.textSecondary,
  },
  backdrop: {
    backgroundColor: palette.scrim,
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    maxHeight: '70%',
  },
  sheetTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  optionList: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  optionRow: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: minTouchTarget,
    padding: spacing.md,
  },
  optionRowActive: {
    borderColor: palette.text,
  },
  optionRowPressed: {
    backgroundColor: palette.bgPressed,
  },
  optionText: {
    flex: 1,
    gap: spacing.xs,
  },
  optionLabel: {
    color: palette.textSecondary,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  optionLabelActive: {
    color: palette.text,
  },
  optionDescription: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
