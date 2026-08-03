import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import { FilterSheet } from '@/features/discovery/components/filter-sheet';
import {
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
        accessibilityLabel="When and more filters"
      >
        <Chip
          label="Any day"
          active={quickPick === 'any' && filters.dateBound === null}
          onPress={() => filters.setQuickPick('any', todayIso)}
        />
        <Chip
          label="Tonight"
          active={filters.dateBound === 'today'}
          activeColor={disciplineAccents.music}
          onPress={() =>
            filters.setQuickPick(filters.dateBound === 'today' ? 'any' : 'today', todayIso)
          }
        />
        <Chip
          label="This weekend"
          active={filters.dateBound === 'weekend'}
          activeColor={disciplineAccents.music}
          onPress={() =>
            filters.setQuickPick(filters.dateBound === 'weekend' ? 'any' : 'weekend', todayIso)
          }
        />
        <Chip
          label="Free"
          active={filters.freeOnly}
          activeColor={palette.success}
          onPress={() => filters.setFreeOnly(!filters.freeOnly)}
        />
        <Chip
          label={moreCount > 0 ? `More filters (${moreCount})` : 'More filters'}
          active={moreCount > 0}
          activeColor={disciplineAccents.poetry}
          onPress={() => setSheetOpen(true)}
        />
        {hasActiveFilters(filters) || filters.dateBound !== null ? (
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
    fontSize: 15,
  },
  chipLabelActive: {
    color: palette.text,
  },
});
