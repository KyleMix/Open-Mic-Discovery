import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import { SelectField } from '@/components/select';
import { Body, Button, ErrorText, Field } from '@/components/ui';
import { describeRecurrence } from '@/features/discovery/recurrence';
import {
  SIGNUP_METHOD_DESCRIPTIONS,
  SIGNUP_METHOD_LABELS,
} from '@/features/discovery/components/mic-card';
import { PinPicker } from '@/features/producer/components/pin-picker';
import {
  DEFAULT_SIGNUP_OPENS_DAYS,
  SIGNUP_OPENS_CHOICES,
  parseSignupOpensDays,
} from '@/features/producer/signup-opens';
import { defaultTimezone, timezoneOptions } from '@/features/producer/timezones';
import {
  buildRrule,
  computeAnchorDate,
  parseRrule,
  WEEKDAY_CODES,
  type OrdinalChoice,
  type RecurrenceChoice,
  type WeekdayCode,
} from '@/features/producer/rrule-builder';
import { useVenueSearch } from '@/features/producer/queries';
import { disciplineAccents, fonts, palette, spacing, type, type Discipline } from '@/theme';
import type { Database } from '@/types/database.types';

type SignupMethod = Database['public']['Enums']['signup_method'];

const WEEKDAY_LABELS: Record<WeekdayCode, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};
const ORDINAL_LABELS: Record<OrdinalChoice, string> = {
  '1': 'First',
  '2': 'Second',
  '3': 'Third',
  '4': 'Fourth',
  '-1': 'Last',
};
const DISCIPLINES: Discipline[] = ['music', 'comedy', 'poetry', 'other'];
const METHODS: SignupMethod[] = ['first_come', 'lottery', 'reserved_slot', 'host_booked'];

function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: hourLabel(h) }));
const MINUTE_OPTIONS = [0, 15, 30, 45].map((m) => ({
  value: m,
  label: `:${String(m).padStart(2, '0')}`,
}));
const METHOD_OPTIONS = METHODS.map((m) => ({
  value: m,
  label: SIGNUP_METHOD_LABELS[m],
  description: SIGNUP_METHOD_DESCRIPTIONS[m],
}));
const SIGNUP_OPENS_OPTIONS = SIGNUP_OPENS_CHOICES.map(({ days, label }) => ({
  value: days,
  label,
}));

export type SeriesFormValues = {
  title: string;
  description: string;
  disciplines: Discipline[];
  signupMethod: SignupMethod;
  rrule: string;
  anchorDate: string;
  startTime: string;
  timezone: string;
  signupOpensDays: number;
  costDollars: string;
  costNote: string;
  setLengthMinutes: string;
  capacity: string;
  venueId?: string;
  newVenue?: {
    name: string;
    address_line: string;
    city: string;
    region: string;
    neighborhood: string | null;
    lat: number;
    lng: number;
  };
};

type ExistingSeries = {
  title: string;
  description: string | null;
  disciplines: Discipline[];
  signup_method: SignupMethod;
  rrule: string;
  start_time: string;
  timezone: string;
  signup_opens: string;
  cost_cents: number;
  cost_note: string | null;
  set_length_minutes: number | null;
  capacity: number | null;
};

type Props = {
  /** When set, the form edits this series (venue stays fixed). */
  existing?: ExistingSeries;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (values: SeriesFormValues) => void;
};

function chipStyle(active: boolean) {
  return [styles.chip, active && styles.chipActive];
}

export function SeriesForm({ existing, busy, error, submitLabel, onSubmit }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [disciplines, setDisciplines] = useState<Discipline[]>(existing?.disciplines ?? []);
  const [method, setMethod] = useState<SignupMethod>(existing?.signup_method ?? 'first_come');
  const [recurrence, setRecurrence] = useState<RecurrenceChoice>(
    (existing && parseRrule(existing.rrule)) ?? { kind: 'weekly', days: [] },
  );
  const [biweeklyNextWeek, setBiweeklyNextWeek] = useState(false);
  const existingTime = existing?.start_time?.slice(0, 5).split(':');
  const [hour, setHour] = useState<number>(existingTime ? Number(existingTime[0]) : 19);
  const [minute, setMinute] = useState<number>(existingTime ? Number(existingTime[1]) : 0);
  const [signupOpensDays, setSignupOpensDays] = useState(
    existing ? parseSignupOpensDays(existing.signup_opens) : DEFAULT_SIGNUP_OPENS_DAYS,
  );
  const [timezone, setTimezone] = useState(existing?.timezone ?? defaultTimezone());
  const [costDollars, setCostDollars] = useState(
    existing ? String(existing.cost_cents / 100) : '0',
  );
  const [costNote, setCostNote] = useState(existing?.cost_note ?? '');
  const [setLength, setSetLength] = useState(
    existing?.set_length_minutes ? String(existing.set_length_minutes) : '',
  );
  const [capacity, setCapacity] = useState(existing?.capacity ? String(existing.capacity) : '');
  const [formError, setFormError] = useState<string | null>(null);

  // Venue (create mode only)
  const [venueQuery, setVenueQuery] = useState('');
  const venueResults = useVenueSearch(venueQuery);
  const [venueId, setVenueId] = useState<string | undefined>();
  const [venueLabel, setVenueLabel] = useState<string | null>(null);
  const [addingVenue, setAddingVenue] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueNeighborhood, setVenueNeighborhood] = useState('');
  const [venueCity, setVenueCity] = useState('');
  const [venueRegion, setVenueRegion] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const rrule = buildRrule(recurrence);
  const preview = rrule ? describeRecurrence(rrule, startTime) : null;

  function toggleIn<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  function submit() {
    setFormError(null);
    if (!title.trim()) {
      setFormError('Give the mic a name.');
      return;
    }
    if (disciplines.length === 0) {
      setFormError('Pick at least one discipline.');
      return;
    }
    if (!rrule) {
      setFormError('Pick when the mic happens.');
      return;
    }
    const cost = Math.round(Number(costDollars || '0') * 100);
    if (!Number.isFinite(cost) || cost < 0) {
      setFormError('Cost must be a number.');
      return;
    }
    if (!existing) {
      if (!venueId && !addingVenue) {
        setFormError('Pick the venue, or add a new one.');
        return;
      }
      if (addingVenue) {
        if (!venueName.trim() || !venueAddress.trim() || !venueCity.trim() || !venueRegion.trim()) {
          setFormError('Fill in the venue name, address, city, and state.');
          return;
        }
        if (!pin) {
          setFormError('Set the venue location so performers can find it.');
          return;
        }
      }
    }
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      disciplines,
      signupMethod: method,
      rrule,
      anchorDate: computeAnchorDate(recurrence, new Date(), biweeklyNextWeek),
      startTime,
      timezone,
      signupOpensDays,
      costDollars,
      costNote: costNote.trim(),
      setLengthMinutes: setLength,
      capacity,
      venueId,
      newVenue: addingVenue
        ? {
            name: venueName.trim(),
            address_line: venueAddress.trim(),
            neighborhood: venueNeighborhood.trim() || null,
            city: venueCity.trim(),
            region: venueRegion.trim(),
            lat: pin!.lat,
            lng: pin!.lng,
          }
        : undefined,
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Field
        label="Mic name"
        value={title}
        onChangeText={setTitle}
        placeholder="The Basement Open Mic"
      />

      <Text style={styles.sectionLabel}>Disciplines</Text>
      <View style={styles.chipRow}>
        {DISCIPLINES.map((d) => (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: disciplines.includes(d) }}
            accessibilityLabel={d}
            onPress={() => setDisciplines((cur) => toggleIn(cur, d))}
            style={chipStyle(disciplines.includes(d))}
          >
            <Glyph
              name={disciplineGlyphs[d]}
              size={14}
              color={disciplines.includes(d) ? disciplineAccents[d] : palette.textSecondary}
            />
            <Text style={styles.chipText}>{d.charAt(0).toUpperCase() + d.slice(1)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>When does it happen?</Text>
      <View style={styles.chipRow}>
        {(['weekly', 'biweekly', 'monthly'] as const).map((kind) => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityState={{ selected: recurrence.kind === kind }}
            onPress={() =>
              setRecurrence(
                kind === 'monthly'
                  ? { kind, ordinals: [], day: 'TU' }
                  : { kind, days: recurrence.kind !== 'monthly' ? recurrence.days : [] },
              )
            }
            style={chipStyle(recurrence.kind === kind)}
          >
            <Text style={styles.chipText}>
              {kind === 'weekly'
                ? 'Every week'
                : kind === 'biweekly'
                  ? 'Every other week'
                  : 'Monthly'}
            </Text>
          </Pressable>
        ))}
      </View>

      {recurrence.kind !== 'monthly' ? (
        <View style={styles.chipRow}>
          {WEEKDAY_CODES.map((code) => (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: recurrence.days.includes(code) }}
              accessibilityLabel={WEEKDAY_LABELS[code]}
              onPress={() =>
                setRecurrence({ ...recurrence, days: toggleIn(recurrence.days, code) })
              }
              style={chipStyle(recurrence.days.includes(code))}
            >
              <Text style={styles.chipText}>{WEEKDAY_LABELS[code]}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.chipRow}>
            {(Object.keys(ORDINAL_LABELS) as OrdinalChoice[]).map((o) => (
              <Pressable
                key={o}
                accessibilityRole="button"
                accessibilityState={{ selected: recurrence.ordinals.includes(o) }}
                accessibilityLabel={`${ORDINAL_LABELS[o]} of the month`}
                onPress={() =>
                  setRecurrence({ ...recurrence, ordinals: toggleIn(recurrence.ordinals, o) })
                }
                style={chipStyle(recurrence.ordinals.includes(o))}
              >
                <Text style={styles.chipText}>{ORDINAL_LABELS[o]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipRow}>
            {WEEKDAY_CODES.map((code) => (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityState={{ selected: recurrence.day === code }}
                accessibilityLabel={WEEKDAY_LABELS[code]}
                onPress={() => setRecurrence({ ...recurrence, day: code })}
                style={chipStyle(recurrence.day === code)}
              >
                <Text style={styles.chipText}>{WEEKDAY_LABELS[code]}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {recurrence.kind === 'biweekly' && !existing ? (
        <View style={styles.chipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !biweeklyNextWeek }}
            onPress={() => setBiweeklyNextWeek(false)}
            style={chipStyle(!biweeklyNextWeek)}
          >
            <Text style={styles.chipText}>Happens this week</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: biweeklyNextWeek }}
            onPress={() => setBiweeklyNextWeek(true)}
            style={chipStyle(biweeklyNextWeek)}
          >
            <Text style={styles.chipText}>Starts next week</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Start time</Text>
      <View style={styles.pairRow}>
        <View style={[styles.pairItem, { flex: 2 }]}>
          <SelectField label="Hour" value={hour} options={HOUR_OPTIONS} onChange={setHour} />
        </View>
        <View style={styles.pairItem}>
          <SelectField
            label="Minutes"
            value={minute}
            options={MINUTE_OPTIONS}
            onChange={setMinute}
          />
        </View>
      </View>
      <SelectField
        label="Timezone"
        value={timezone}
        options={timezoneOptions(existing?.timezone)}
        onChange={setTimezone}
      />
      <Body>Times are always local to the venue, even across daylight saving.</Body>

      {preview ? <Text style={styles.preview}>{preview}</Text> : null}

      <Text style={styles.sectionLabel}>Signups</Text>
      <SelectField
        label="How performers get on stage"
        value={method}
        options={METHOD_OPTIONS}
        onChange={setMethod}
      />
      <SelectField
        label="When signups open"
        value={signupOpensDays}
        options={SIGNUP_OPENS_OPTIONS}
        onChange={setSignupOpensDays}
      />
      <Body>Signups open this far ahead of each night and close at showtime.</Body>

      <View style={styles.pairRow}>
        <View style={styles.pairItem}>
          <Field
            label="Cost ($)"
            value={costDollars}
            onChangeText={setCostDollars}
            inputMode="decimal"
          />
        </View>
        <View style={styles.pairItem}>
          <Field
            label="Set length (min)"
            value={setLength}
            onChangeText={setSetLength}
            inputMode="numeric"
          />
        </View>
        <View style={styles.pairItem}>
          <Field label="Spots" value={capacity} onChangeText={setCapacity} inputMode="numeric" />
        </View>
      </View>
      <Field
        label="Cost note (optional)"
        value={costNote}
        onChangeText={setCostNote}
        placeholder="One drink minimum"
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        placeholder="What should performers know before they show up?"
      />

      {!existing ? (
        <>
          <Text style={styles.sectionLabel}>Venue</Text>
          {venueLabel ? (
            <View style={styles.venuePicked}>
              <Text style={styles.chipText}>{venueLabel}</Text>
              <Button
                label="Change"
                kind="secondary"
                onPress={() => {
                  setVenueId(undefined);
                  setVenueLabel(null);
                }}
              />
            </View>
          ) : addingVenue ? (
            <>
              <Field label="Venue name" value={venueName} onChangeText={setVenueName} />
              <Field label="Street address" value={venueAddress} onChangeText={setVenueAddress} />
              <Field
                label="Neighborhood (optional)"
                value={venueNeighborhood}
                onChangeText={setVenueNeighborhood}
              />
              <View style={styles.pairRow}>
                <View style={[styles.pairItem, { flex: 2 }]}>
                  <Field label="City" value={venueCity} onChangeText={setVenueCity} />
                </View>
                <View style={styles.pairItem}>
                  <Field
                    label="State"
                    value={venueRegion}
                    onChangeText={setVenueRegion}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
              <Body>Place the venue so performers can find it.</Body>
              <PinPicker pin={pin} onChange={setPin} />
              <Button
                label="Search existing venues instead"
                kind="secondary"
                onPress={() => setAddingVenue(false)}
              />
            </>
          ) : (
            <>
              <Field
                label="Search venues"
                value={venueQuery}
                onChangeText={setVenueQuery}
                placeholder="Venue name or city"
              />
              {venueResults.data?.map((v) => (
                <Pressable
                  key={v.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${v.name}`}
                  onPress={() => {
                    setVenueId(v.id);
                    setVenueLabel(`${v.name}, ${v.city}`);
                  }}
                  style={styles.venueResult}
                >
                  <Text style={styles.chipText}>{v.name}</Text>
                  <Text style={styles.venueMeta}>
                    {v.address_line}, {v.city}, {v.region}
                  </Text>
                </Pressable>
              ))}
              <Button
                label="Venue is not listed: add it"
                kind="secondary"
                onPress={() => setAddingVenue(true)}
              />
            </>
          )}
        </>
      ) : null}

      {formError ? <ErrorText>{formError}</ErrorText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label={submitLabel} busy={busy} onPress={submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.heading.fontSize,
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipActive: {
    backgroundColor: palette.bgPressed,
    borderColor: palette.text,
  },
  chipText: {
    color: palette.text,
    fontSize: 14,
  },
  preview: {
    color: palette.success,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  pairRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pairItem: {
    flex: 1,
  },
  venuePicked: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  venueResult: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
    padding: spacing.md,
  },
  venueMeta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
});
