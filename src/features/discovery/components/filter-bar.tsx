import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import { FilterSheet } from '@/features/discovery/components/filter-sheet';
import { SIGNUP_METHOD_LABELS } from '@/features/discovery/components/mic-card';
import { radiusLabel } from '@/features/discovery/distance';
import type { WhenFilter } from '@/features/discovery/query-tokens';
import {
  AGE_LABELS,
  TIME_WINDOWS,
  hasActiveFilters,
  sheetFilterCount,
  useFiltersStore,
} from '@/stores/filters';
import {
  type Discipline,
  disciplineAccents,
  fonts,
  maxFontScale,
  minTouchTarget,
  palette,
  spacing,
  type,
} from '@/theme';

const DISCIPLINES: Discipline[] = ['music', 'comedy', 'poetry', 'other'];
const DISCIPLINE_LABELS: Record<Discipline, string> = {
  music: 'Music',
  comedy: 'Comedy',
  poetry: 'Poetry',
  other: 'Other',
};

const WHEN_PICKS: { when: WhenFilter; label: string }[] = [
  { when: 'tonight', label: 'Tonight' },
  { when: 'tomorrow', label: 'Tomorrow' },
  { when: 'week', label: 'This week' },
  { when: 'weekend', label: 'This weekend' },
];

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  icon?: React.ReactNode;
  /** Applied chips read as removable: the label carries a dismiss mark. */
  dismissible?: boolean;
};

function Chip({ label, active, onPress, activeColor, icon, dismissible }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dismissible ? `Remove filter: ${label}` : label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        active && [styles.chipActive, activeColor ? { borderColor: activeColor } : null],
      ]}
    >
      {icon}
      <Text
        maxFontSizeMultiplier={maxFontScale}
        style={[styles.chipLabel, active && styles.chipLabelActive]}
      >
        {dismissible ? `${label} ✕` : label}
      </Text>
    </Pressable>
  );
}

/**
 * The face of discovery: what kind of mic, when, and every other applied
 * constraint as a chip you can see and dismiss. Nothing filters silently:
 * the radius always shows its current value, and each sheet filter
 * surfaces here the moment it applies. The search box feeds the same
 * state: typing "tonight" lights the same Tonight chip a tap would.
 */
export function FilterBar() {
  const filters = useFiltersStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  const moreCount = sheetFilterCount(filters);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel="What kind of mic"
      >
        <Chip
          label="All"
          active={filters.disciplines.length === 0}
          onPress={() => filters.selectDiscipline(null)}
        />
        {DISCIPLINES.map((d) => {
          const active = filters.disciplines.includes(d);
          return (
            <Chip
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
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel="When"
      >
        <Chip
          label="Any day"
          active={filters.when === null && filters.days.length === 0}
          onPress={() => filters.setWhen(null)}
        />
        {WHEN_PICKS.map(({ when, label }) => (
          <Chip
            key={when}
            label={label}
            active={filters.when === when}
            activeColor={disciplineAccents.music}
            onPress={() => filters.setWhen(filters.when === when ? null : when)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel="Applied filters and more"
      >
        <Chip
          label="Free"
          active={filters.freeOnly}
          activeColor={palette.success}
          onPress={() => filters.setFreeOnly(!filters.freeOnly)}
        />
        {/* The radius always constrains results, so it always shows. */}
        <Chip
          label={`Within ${radiusLabel(filters.radiusKm)}`}
          active={false}
          onPress={() => setSheetOpen(true)}
        />
        {filters.days.map((day) => {
          // Days come from the picker, always 1 to 7; skip rather than
          // render a blank chip if a stale persisted value ever appears.
          const label = DAY_SHORT[day - 1];
          if (!label) {
            return null;
          }
          return (
            <Chip
              key={day}
              label={label}
              active
              activeColor={disciplineAccents.music}
              dismissible
              onPress={() => filters.toggleDay(day)}
            />
          );
        })}
        {filters.timeOfDay ? (
          <Chip
            label={TIME_WINDOWS[filters.timeOfDay].label}
            active
            activeColor={disciplineAccents.comedy}
            dismissible
            onPress={() => filters.setTimeOfDay(null)}
          />
        ) : null}
        {filters.methods.map((m) => (
          <Chip
            key={m}
            label={SIGNUP_METHOD_LABELS[m]}
            active
            activeColor={disciplineAccents.poetry}
            dismissible
            onPress={() => filters.toggleMethod(m)}
          />
        ))}
        {filters.ages.map((a) => (
          <Chip
            key={a}
            label={AGE_LABELS[a]}
            active
            activeColor={disciplineAccents.comedy}
            dismissible
            onPress={() => filters.toggleAge(a)}
          />
        ))}
        <Chip
          label={moreCount > 0 ? `More filters (${moreCount})` : 'More filters'}
          active={moreCount > 0}
          activeColor={disciplineAccents.poetry}
          onPress={() => setSheetOpen(true)}
        />
        {hasActiveFilters(filters) ? (
          <Chip label="Clear all filters" active={false} onPress={filters.reset} />
        ) : null}
      </ScrollView>
      <FilterSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
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
});
