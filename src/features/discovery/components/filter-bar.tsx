import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FilterSheet } from '@/features/discovery/components/filter-sheet';
import { SIGNUP_METHOD_LABELS } from '@/features/discovery/components/mic-card';
import { radiusLabel } from '@/features/discovery/distance';
import {
  AGE_LABELS,
  DISCIPLINE_LABELS,
  TIME_WINDOWS,
  WHEN_LABELS,
  activeFilterCount,
  hasActiveFilters,
  useFiltersStore,
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

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ChipProps = {
  label: string;
  onPress: () => void;
  activeColor?: string;
};

/** An applied filter, shown so it can be seen and removed in one tap. */
function AppliedChip({ label, onPress, activeColor }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove filter: ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        activeColor ? { borderColor: activeColor } : null,
        pressed && styles.chipPressed,
      ]}
    >
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipLabel}>
        {`${label} ✕`}
      </Text>
    </Pressable>
  );
}

/**
 * The face of discovery. Every choice lives in one sheet behind the
 * Filters button, opened by a control that cannot be missed: no
 * horizontal chip rows whose far ends hide off screen. Nothing filters
 * silently: the button counts everything applied, the radius always
 * shows its current value, and each applied filter renders here as a
 * chip you can see and dismiss. The search box feeds the same state:
 * typing "tonight" applies the same Tonight filter a tap would.
 */
export function FilterBar() {
  const filters = useFiltersStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  const count = activeFilterCount(filters);

  return (
    <View style={styles.wrap}>
      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Filters, ${count} applied` : 'Filters'}
          accessibilityHint="Pick what kind of mic, when, and more"
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [styles.filtersButton, pressed && styles.chipPressed]}
        >
          <Ionicons name="options" size={18} color={palette.text} />
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.filtersButtonLabel}>
            {count > 0 ? `Filters (${count})` : 'Filters'}
          </Text>
        </Pressable>
        {/* The radius always constrains results, so it always shows. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Within ${radiusLabel(filters.radiusKm)}. Change the distance`}
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipLabel}>
            {`Within ${radiusLabel(filters.radiusKm)}`}
          </Text>
        </Pressable>
      </View>
      {hasActiveFilters(filters) ? (
        <View style={styles.appliedRow} accessibilityLabel="Applied filters">
          {filters.disciplines.map((d) => (
            <AppliedChip
              key={d}
              label={DISCIPLINE_LABELS[d]}
              activeColor={disciplineAccents[d]}
              onPress={() => filters.toggleDiscipline(d)}
            />
          ))}
          {filters.when ? (
            <AppliedChip
              label={WHEN_LABELS[filters.when]}
              activeColor={disciplineAccents.music}
              onPress={() => filters.setWhen(null)}
            />
          ) : null}
          {filters.days.map((day) => {
            // Days come from the picker, always 1 to 7; skip rather than
            // render a blank chip if a stale persisted value ever appears.
            const label = DAY_SHORT[day - 1];
            if (!label) {
              return null;
            }
            return (
              <AppliedChip
                key={day}
                label={label}
                activeColor={disciplineAccents.music}
                onPress={() => filters.toggleDay(day)}
              />
            );
          })}
          {filters.freeOnly ? (
            <AppliedChip
              label="Free"
              activeColor={palette.success}
              onPress={() => filters.setFreeOnly(false)}
            />
          ) : null}
          {filters.timeOfDay ? (
            <AppliedChip
              label={TIME_WINDOWS[filters.timeOfDay].label}
              activeColor={disciplineAccents.comedy}
              onPress={() => filters.setTimeOfDay(null)}
            />
          ) : null}
          {filters.methods.map((m) => (
            <AppliedChip
              key={m}
              label={SIGNUP_METHOD_LABELS[m]}
              activeColor={disciplineAccents.poetry}
              onPress={() => filters.toggleMethod(m)}
            />
          ))}
          {filters.ages.map((a) => (
            <AppliedChip
              key={a}
              label={AGE_LABELS[a]}
              activeColor={disciplineAccents.comedy}
              onPress={() => filters.toggleAge(a)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            onPress={filters.reset}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipLabel}>
              Clear all
            </Text>
          </Pressable>
        </View>
      ) : null}
      <FilterSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filtersButton: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.borderInput,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  filtersButtonLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.label.fontSize,
  },
  appliedRow: {
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
  chipPressed: {
    backgroundColor: palette.bgPressed,
  },
  chipLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.label.fontSize,
  },
});
