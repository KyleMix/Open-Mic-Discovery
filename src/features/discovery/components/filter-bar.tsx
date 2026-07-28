import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import { SIGNUP_METHOD_LABELS } from '@/features/discovery/components/mic-card';
import { TIME_WINDOWS, hasActiveFilters, useFiltersStore, type TimeOfDay } from '@/stores/filters';
import {
  disciplineAccents,
  fonts,
  minTouchTarget,
  palette,
  spacing,
  type Discipline,
} from '@/theme';
import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];

const DISCIPLINES: Discipline[] = ['music', 'comedy', 'poetry', 'other'];
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
const RADII = [8, 16, 40, 80];

type ChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  icon?: React.ReactNode;
};

function Chip({ label, active, onPress, activeColor, icon }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filter: ${label}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        active && [styles.chipActive, activeColor ? { borderColor: activeColor } : null],
      ]}
    >
      {icon}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

/** One horizontally scrolling row of every discovery filter. */
export function FilterBar() {
  const filters = useFiltersStore();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel="Filters"
    >
      {hasActiveFilters(filters) ? (
        <Chip label="Reset" active={false} onPress={filters.reset} />
      ) : null}
      {DISCIPLINES.map((d) => (
        <Chip
          key={d}
          label={d.charAt(0).toUpperCase() + d.slice(1)}
          active={filters.disciplines.includes(d)}
          activeColor={disciplineAccents[d]}
          onPress={() => filters.toggleDiscipline(d)}
          icon={
            <Glyph
              name={disciplineGlyphs[d]}
              size={14}
              color={filters.disciplines.includes(d) ? disciplineAccents[d] : palette.textSecondary}
            />
          }
        />
      ))}
      <Chip
        label="Free"
        active={filters.freeOnly}
        onPress={() => filters.setFreeOnly(!filters.freeOnly)}
      />
      {DAYS.map(({ day, label }) => (
        <Chip
          key={day}
          label={label}
          active={filters.days.includes(day)}
          onPress={() => filters.toggleDay(day)}
        />
      ))}
      {(Object.keys(TIME_WINDOWS) as TimeOfDay[]).map((t) => (
        <Chip
          key={t}
          label={TIME_WINDOWS[t].label}
          active={filters.timeOfDay === t}
          onPress={() => filters.setTimeOfDay(filters.timeOfDay === t ? null : t)}
        />
      ))}
      {METHODS.map((m) => (
        <Chip
          key={m}
          label={SIGNUP_METHOD_LABELS[m]}
          active={filters.methods.includes(m)}
          onPress={() => filters.toggleMethod(m)}
        />
      ))}
      {RADII.map((km) => (
        <Chip
          key={km}
          label={`${km} km`}
          active={filters.radiusKm === km}
          onPress={() => filters.setRadiusKm(km)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: Math.max(36, minTouchTarget - 8),
    paddingHorizontal: spacing.md,
  },
  chipActive: {
    backgroundColor: palette.bgPressed,
    borderColor: palette.text,
  },
  chipLabel: {
    color: palette.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  chipLabelActive: {
    color: palette.text,
  },
});
