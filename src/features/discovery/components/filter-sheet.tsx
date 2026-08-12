import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import { MultiSelectField } from '@/components/select';
import { SheetGrabber, useSheetAnimation } from '@/components/sheet-chrome';
import { Button, ToggleRow } from '@/components/ui';
import {
  SIGNUP_METHOD_DESCRIPTIONS,
  SIGNUP_METHOD_LABELS,
} from '@/features/discovery/components/mic-card';
import { RADIUS_CHOICES } from '@/features/discovery/distance';
import {
  AGE_LABELS,
  DISCIPLINES,
  DISCIPLINE_LABELS,
  TIME_WINDOWS,
  WHEN_PICKS,
  sheetFilterCount,
  useFiltersStore,
  type TimeOfDay,
} from '@/stores/filters';
import {
  disciplineAccents,
  fonts,
  maxFontScale,
  minTouchTarget,
  palette,
  radius,
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
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && [styles.chipActive, activeColor ? { borderColor: activeColor } : null],
        pressed && styles.chipPressed,
      ]}
    >
      {icon}
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
 * Every filter, one labeled question per section, in words a first-time
 * visitor understands. The headline questions (what kind, when, cost)
 * come first with every choice visible at once; the long tail lives
 * behind the Advanced filters expander so the sheet never overwhelms.
 * Producers get dense forms; performers get this.
 */
export function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const filters = useFiltersStore();
  const insets = useSafeAreaInsets();
  const animation = useSheetAnimation();

  const advancedCount = sheetFilterCount(filters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Anything already applied in Advanced must be visible on open;
  // otherwise start collapsed so the headline questions get the room.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setAdvancedOpen(advancedCount > 0);
    }
  }

  return (
    <Modal visible={visible} transparent animationType={animation} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          style={styles.backdropTouch}
          onPress={onClose}
        />
        {/* Clears the home indicator: the footer buttons sit at the very
            bottom of the physical screen. */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <SheetGrabber />
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.title}>
            Filters
          </Text>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Section title="What kind of mic?">
              <View style={styles.chipWrap}>
                <SheetChip
                  label="All"
                  active={filters.disciplines.length === 0}
                  onPress={() => filters.selectDiscipline(null)}
                />
                {DISCIPLINES.map((d) => {
                  const active = filters.disciplines.includes(d);
                  return (
                    <SheetChip
                      key={d}
                      label={DISCIPLINE_LABELS[d]}
                      active={active}
                      activeColor={disciplineAccents[d]}
                      onPress={() => filters.toggleDiscipline(d)}
                      icon={
                        <Glyph
                          name={disciplineGlyphs[d]}
                          size={16}
                          color={active ? disciplineAccents[d] : palette.textSecondary}
                        />
                      }
                    />
                  );
                })}
              </View>
            </Section>

            <Section title="When?">
              <View style={styles.chipWrap}>
                <SheetChip
                  label="Any day"
                  active={filters.when === null && filters.days.length === 0}
                  onPress={() => filters.setWhen(null)}
                />
                {WHEN_PICKS.map(({ when, label }) => (
                  <SheetChip
                    key={when}
                    label={label}
                    active={filters.when === when}
                    activeColor={disciplineAccents.music}
                    onPress={() => filters.setWhen(filters.when === when ? null : when)}
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

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                advancedCount > 0 ? `Advanced filters, ${advancedCount} applied` : 'Advanced filters'
              }
              accessibilityState={{ expanded: advancedOpen }}
              onPress={() => setAdvancedOpen((open) => !open)}
              style={({ pressed }) => [styles.advancedToggle, pressed && styles.chipPressed]}
            >
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.advancedToggleLabel}>
                {advancedCount > 0 ? `Advanced filters (${advancedCount})` : 'Advanced filters'}
              </Text>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.advancedToggleMark}>
                {advancedOpen ? '▲' : '▼'}
              </Text>
            </Pressable>

            {advancedOpen ? (
              <>
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
              </>
            ) : null}
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
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    maxHeight: '85%',
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
    fontFamily: fonts.regular,
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
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  chipActive: {
    backgroundColor: palette.bgPressed,
    borderColor: palette.text,
  },
  chipPressed: {
    backgroundColor: palette.bgPressed,
  },
  chipLabel: {
    color: palette.textSecondary,
    fontFamily: fonts.medium,
    fontSize: type.label.fontSize,
  },
  chipLabelActive: {
    color: palette.text,
  },
  advancedToggle: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.borderInput,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  advancedToggleLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.label.fontSize,
  },
  advancedToggleMark: {
    color: palette.textSecondary,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
