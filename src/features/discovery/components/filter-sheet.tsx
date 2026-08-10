import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MultiSelectField } from '@/components/select';
import { Button, ToggleRow } from '@/components/ui';
import {
  SIGNUP_METHOD_DESCRIPTIONS,
  SIGNUP_METHOD_LABELS,
} from '@/features/discovery/components/mic-card';
import { RADIUS_CHOICES } from '@/features/discovery/distance';
import { AGE_LABELS, TIME_WINDOWS, useFiltersStore, type TimeOfDay } from '@/stores/filters';
import {
  disciplineAccents,
  fonts,
  maxFontScale,
  minTouchTarget,
  palette,
  spacing,
  type,
} from '@/theme';
import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];
type AgeRestriction = Database['public']['Enums']['age_restriction'];

const AGES: AgeRestriction[] = ['all_ages', 'eighteen_plus', 'twenty_one_plus'];

const DAYS: { day: number; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 7, label: 'Sun' },
];
const METHODS: SignupMethod[] = ['first_come', 'lottery', 'reserved_slot', 'host_booked'];

function SheetChip({
  label,
  active,
  onPress,
  activeColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        active && [styles.chipActive, activeColor ? { borderColor: activeColor } : null],
      ]}
    >
      <Text
        maxFontSizeMultiplier={maxFontScale}
        style={[styles.chipLabel, active && styles.chipLabelActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
        {title}
      </Text>
      {caption ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionCaption}>
          {caption}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/**
 * Everything beyond the quick chips, one labeled question per section, in
 * words a first-time visitor understands. Producers get dense forms;
 * performers get this.
 */
export function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const filters = useFiltersStore();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          style={styles.backdropTouch}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.title}>
            Filters
          </Text>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Section title="Which days?" caption="Pick as many as you like.">
              <View style={styles.chipWrap}>
                {DAYS.map(({ day, label }) => (
                  <SheetChip
                    key={day}
                    label={label}
                    active={filters.days.includes(day)}
                    activeColor={disciplineAccents.music}
                    onPress={() => filters.toggleDay(day)}
                  />
                ))}
              </View>
            </Section>

            <Section title="What time?">
              <View style={styles.chipWrap}>
                <SheetChip
                  label="Any time"
                  active={filters.timeOfDay === null}
                  onPress={() => filters.setTimeOfDay(null)}
                />
                {(Object.keys(TIME_WINDOWS) as TimeOfDay[]).map((t) => (
                  <SheetChip
                    key={t}
                    label={TIME_WINDOWS[t].label}
                    active={filters.timeOfDay === t}
                    activeColor={disciplineAccents.comedy}
                    onPress={() => filters.setTimeOfDay(filters.timeOfDay === t ? null : t)}
                  />
                ))}
              </View>
            </Section>

            <Section title="Cost">
              <ToggleRow
                label="Free mics only"
                description="Hide mics that charge to get in."
                value={filters.freeOnly}
                onToggle={filters.setFreeOnly}
              />
            </Section>

            <Section
              title="How you get on stage"
              caption="Only show mics that sign people up this way."
            >
              <MultiSelectField
                label="Signup style"
                placeholder="Any way"
                values={filters.methods}
                options={METHODS.map((m) => ({
                  value: m,
                  label: SIGNUP_METHOD_LABELS[m],
                  description: SIGNUP_METHOD_DESCRIPTIONS[m],
                }))}
                onChange={filters.setMethods}
              />
            </Section>

            <Section
              title="Who can get in?"
              caption="Based on the venue's age policy. Venues that have not said stay hidden while this is on."
            >
              <View style={styles.chipWrap}>
                {AGES.map((a) => (
                  <SheetChip
                    key={a}
                    label={AGE_LABELS[a]}
                    active={filters.ages.includes(a)}
                    activeColor={disciplineAccents.comedy}
                    onPress={() => filters.toggleAge(a)}
                  />
                ))}
              </View>
            </Section>

            <Section title="How far will you go?">
              <View style={styles.chipWrap}>
                {RADIUS_CHOICES.map(({ km, label }) => (
                  <SheetChip
                    key={km}
                    label={label}
                    active={filters.radiusKm === km}
                    activeColor={disciplineAccents.poetry}
                    onPress={() => filters.setRadiusKm(km)}
                  />
                ))}
              </View>
            </Section>
          </ScrollView>
          <View style={styles.footer}>
            <Button label="Show mics" onPress={onClose} />
            <Button label="Clear all filters" kind="secondary" onPress={filters.reset} />
          </View>
        </View>
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
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '85%',
    paddingBottom: spacing.lg,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: palette.border,
    borderRadius: 3,
    height: 5,
    marginVertical: spacing.sm,
    width: 44,
  },
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  scroll: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  sectionCaption: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  chipActive: {
    backgroundColor: palette.bgPressed,
    borderColor: palette.text,
  },
  chipLabel: {
    color: palette.textSecondary,
    fontFamily: fonts.medium,
    fontSize: type.label.fontSize,
  },
  chipLabelActive: {
    color: palette.text,
  },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
