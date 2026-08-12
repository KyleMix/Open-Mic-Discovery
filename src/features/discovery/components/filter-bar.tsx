import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import {
  DISCIPLINE_LABELS,
  FilterSheet,
  WHEN_PICKS,
} from '@/features/discovery/components/filter-sheet';
import { SIGNUP_METHOD_LABELS } from '@/features/discovery/components/mic-card';
import { radiusLabel } from '@/features/discovery/distance';
import {
  AGE_LABELS,
  TIME_WINDOWS,
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
  icon?: React.ReactNode;
  /** Applied chips read as removable: the label carries a dismiss mark. */
  dismissible?: boolean;
};

function Chip({ label, onPress, activeColor, icon, dismissible }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dismissible ? `Remove filter: ${label}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        activeColor ? { borderColor: activeColor } : null,
        pressed && styles.chipPressed,
      ]}
    >
      {icon}
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipLabel}>
        {dismissible ? `${label} ✕` : label}
      </Text>
    </Pressable>
  );
}

/**
 * The face of discovery: one obvious Filters button that opens every
 * choice at once, and each applied constraint as a chip you can see and
 * dismiss. The chips wrap instead of scrolling sideways, so nothing is
 * ever cut off or hiding past the screen edge. Nothing filters silently:
 * the radius always shows its current value, every sheet filter surfaces
 * here the moment it applies, and the search box feeds the same state:
 * typing "tonight" sets the same Tonight filter a tap would.
 */
export function FilterBar() {
  const filters = useFiltersStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  const count = activeFilterCount(filters);
  const whenLabel = WHEN_PICKS.find((p) => p.when === filters.when)?.label;

  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityLabel="Filters and applied filters">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Filters, ${count} active` : 'Filters'}
          onPress={() => setSheetOpen(true)}
          style={({ pressed }) => [styles.filtersButton, pressed && styles.filtersButtonPressed]}
        >
          <Ionicons name="options" size={18} color={palette.bg} />
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.filtersButtonLabel}>
            Filters
          </Text>
          {count > 0 ? (
            <View style={styles.badge}>
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.badgeLabel}>
                {count}
              </Text>
            </View>
          ) : null}
        </Pressable>
        {filters.disciplines.map((d) => (
          <Chip
            key={d}
            label={DISCIPLINE_LABELS[d]}
            activeColor={disciplineAccents[d]}
            dismissible
            onPress={() => filters.toggleDiscipline(d)}
            icon={<Glyph name={disciplineGlyphs[d]} size={16} color={disciplineAccents[d]} />}
          />
        ))}
        {whenLabel ? (
          <Chip
            label={whenLabel}
            activeColor={disciplineAccents.music}
            dismissible
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
            <Chip
              key={day}
              label={label}
              activeColor={disciplineAccents.music}
              dismissible
              onPress={() => filters.toggleDay(day)}
            />
          );
        })}
        {filters.freeOnly ? (
          <Chip
            label="Free"
            activeColor={palette.success}
            dismissible
            onPress={() => filters.setFreeOnly(false)}
          />
        ) : null}
        {filters.timeOfDay ? (
          <Chip
            label={TIME_WINDOWS[filters.timeOfDay].label}
            activeColor={disciplineAccents.comedy}
            dismissible
            onPress={() => filters.setTimeOfDay(null)}
          />
        ) : null}
        {filters.methods.map((m) => (
          <Chip
            key={m}
            label={SIGNUP_METHOD_LABELS[m]}
            activeColor={disciplineAccents.poetry}
            dismissible
            onPress={() => filters.toggleMethod(m)}
          />
        ))}
        {filters.ages.map((a) => (
          <Chip
            key={a}
            label={AGE_LABELS[a]}
            activeColor={disciplineAccents.comedy}
            dismissible
            onPress={() => filters.toggleAge(a)}
          />
        ))}
        {/* The radius always constrains results, so it always shows. */}
        <Chip label={`Within ${radiusLabel(filters.radiusKm)}`} onPress={() => setSheetOpen(true)} />
        {hasActiveFilters(filters) ? (
          <Chip label="Clear all" onPress={filters.reset} />
        ) : null}
      </View>
      <FilterSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.xs,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  filtersButton: {
    alignItems: 'center',
    backgroundColor: palette.text,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  filtersButtonPressed: {
    opacity: 0.8,
  },
  filtersButtonLabel: {
    color: palette.bg,
    fontFamily: fonts.medium,
    fontSize: type.label.fontSize,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: palette.bg,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  badgeLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
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
