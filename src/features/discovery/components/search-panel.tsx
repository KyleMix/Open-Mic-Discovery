import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Body } from '@/components/ui';
import { selectDiscoveryFilters, hasActiveFilters, useFiltersStore } from '@/stores/filters';
import { useRecentSearches, type SavedSearch } from '@/stores/recent-searches';
import { fonts, maxFontScale, minTouchTarget, palette, radius, spacing, type } from '@/theme';

type Props = {
  /** Run a recent query again. */
  onPickRecent: (query: string) => void;
  /** Apply a saved search: its query and its whole filter state. */
  onPickSaved: (saved: SavedSearch) => void;
  /** The current query, for the save form. */
  query: string;
};

/**
 * What an empty, focused search input shows: the last few searches, the
 * saved ones by name, and a way to save the current search. All local to
 * the device. "Tuesdays under 15 minutes from me" is the kind of thing a
 * working comic runs weekly; this makes it one tap.
 */
export function SearchPanel({ onPickRecent, onPickSaved, query }: Props) {
  const { recent, saved, clearRecent, saveSearch, removeSaved } = useRecentSearches();
  const filters = useFiltersStore();
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = query.trim().length > 0 || hasActiveFilters(filters);

  if (recent.length === 0 && saved.length === 0 && !canSave) {
    return null;
  }

  return (
    <View style={styles.panel}>
      {saved.length > 0 ? (
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.heading}>
            Saved searches
          </Text>
          {saved.map((sv) => (
            <View key={sv.name} style={styles.rowWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Run saved search ${sv.name}`}
                onPress={() => onPickSaved(sv)}
                style={styles.row}
              >
                <Ionicons name="bookmark" size={16} color={palette.textSecondary} />
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.rowLabel}>
                  {sv.name}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete saved search ${sv.name}`}
                hitSlop={8}
                onPress={() => removeSaved(sv.name)}
                style={styles.rowAction}
              >
                <Ionicons name="close" size={16} color={palette.textFaint} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {recent.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.headingRow}>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.heading}>
              Recent
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear recent searches"
              onPress={clearRecent}
            >
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.clear}>
                Clear
              </Text>
            </Pressable>
          </View>
          {recent.map((q) => (
            <Pressable
              key={q}
              accessibilityRole="button"
              accessibilityLabel={`Search again for ${q}`}
              onPress={() => onPickRecent(q)}
              style={styles.row}
            >
              <Ionicons name="time-outline" size={16} color={palette.textSecondary} />
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.rowLabel}>
                {q}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {canSave ? (
        saving ? (
          <View style={styles.saveForm}>
            <TextInput
              accessibilityLabel="Name this search"
              placeholder="Name this search"
              placeholderTextColor={palette.textFaint}
              style={styles.saveInput}
              value={saveName}
              onChangeText={setSaveName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (saveName.trim()) {
                  saveSearch(saveName.trim(), query, selectDiscoveryFilters(filters));
                  setSaveName('');
                  setSaving(false);
                }
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save the search"
              disabled={!saveName.trim()}
              onPress={() => {
                saveSearch(saveName.trim(), query, selectDiscoveryFilters(filters));
                setSaveName('');
                setSaving(false);
              }}
              style={styles.row}
            >
              <Text
                maxFontSizeMultiplier={maxFontScale}
                style={[styles.clear, !saveName.trim() && { color: palette.textDisabled }]}
              >
                Save
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save this search and its filters"
            onPress={() => setSaving(true)}
            style={styles.row}
          >
            <Ionicons name="bookmark-outline" size={16} color={palette.textSecondary} />
            <Body>Save this search</Body>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  section: {
    gap: spacing.xs,
  },
  heading: {
    color: palette.textFaint,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
    textTransform: 'uppercase',
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  clear: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
    textDecorationLine: 'underline',
  },
  rowWrap: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  rowAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
  },
  rowLabel: {
    color: palette.text,
    fontSize: type.body.fontSize,
  },
  saveForm: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  saveInput: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: palette.text,
    flex: 1,
    fontSize: type.body.fontSize,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
  },
});
