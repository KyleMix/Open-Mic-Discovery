import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import { FilterSheet } from '@/features/discovery/components/filter-sheet';
import {
  WEEKEND_DAYS,
  dayQuickPick,
  hasActiveFilters,
  isoWeekday,
  sheetFilterCount,
  useFiltersStore,
} from '@/stores/filters';
import {
  disciplineAccents,
  fonts,
  minTouchTarget,
  palette,
  spacing,
  type Discipline,
} from '@/theme';

const DISCIPLINES: Discipline[] = ['music', 'comedy', 'poetry', 'other'];
const DISCIPLINE_LABELS: Record<Discipline, string> = {
  music: 'Music',
  comedy: 'Comedy',
  poetry: 'Poetry',
  other: 'Other',
};

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
      accessibilityLabel={label}
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

/**
 * The simple face of discovery: one question per row. Row one asks what
 * kind of mic, row two asks when, plus Free and a door into the full
 * filter sheet for everything else.
 */
export function FilterBar() {
  const filters = useFiltersStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  const todayIso = isoWeekday(new Date());
  const quickPick = dayQuickPick(filters.days, todayIso);
  const moreCount = sheetFilterCount(filters, todayIso);
  const selected = filters.disciplines.length === 1 ? filters.disciplines[0] : null;

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
          active={selected === null && filters.disciplines.length === 0}
          onPress={() => filters.selectDiscipline(null)}
        />
        {DISCIPLINES.map((d) => (
          <Chip
            key={d}
            label={DISCIPLINE_LABELS[d]}
            active={selected === d}
            activeColor={disciplineAccents[d]}
            onPress={() => filters.selectDiscipline(selected === d ? null : d)}
            icon={
              <Glyph
                name={disciplineGlyphs[d]}
                size={16}
                color={selected === d ? disciplineAccents[d] : palette.textSecondary}
              />
            }
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityLabel="When and more filters"
      >
        <Chip
          label="Any day"
          active={quickPick === 'any'}
          onPress={() => filters.setDays([])}
        />
        <Chip
          label="Today"
          active={quickPick === 'today'}
          onPress={() => filters.setDays(quickPick === 'today' ? [] : [todayIso])}
        />
        <Chip
          label="Weekend"
          active={quickPick === 'weekend'}
          onPress={() => filters.setDays(quickPick === 'weekend' ? [] : WEEKEND_DAYS)}
        />
        <Chip
          label="Free"
          active={filters.freeOnly}
          onPress={() => filters.setFreeOnly(!filters.freeOnly)}
        />
        <Chip
          label={moreCount > 0 ? `More filters (${moreCount})` : 'More filters'}
          active={moreCount > 0}
          onPress={() => setSheetOpen(true)}
        />
        {hasActiveFilters(filters) ? (
          <Chip label="Clear all" active={false} onPress={filters.reset} />
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
    fontSize: 15,
  },
  chipLabelActive: {
    color: palette.text,
  },
});
