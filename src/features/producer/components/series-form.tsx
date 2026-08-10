import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import tzLookup from 'tz-lookup';

import { Glyph, disciplineGlyphs } from '@/components/glyph';
import { SelectField } from '@/components/select';
import { Body, Button, ErrorText, Field } from '@/components/ui';
import { describeRecurrence } from '@/features/discovery/recurrence';
import { rruleMatches } from '@/features/producer/rrule-match';
import {
  SIGNUP_METHOD_DESCRIPTIONS,
  SIGNUP_METHOD_LABELS,
} from '@/features/discovery/components/mic-card';
import { PinPicker } from '@/features/producer/components/pin-picker';
import { venueAddressQuery } from '@/features/producer/venue-address';
import { geocodeVenueAddress } from '@/features/producer/venue-geocode';
import {
  coerceSignupOpensMinutes,
  defaultSignupOpensMinutes,
  isWalkIn,
  signupOpensChoices,
  parseSignupOpensMinutes,
} from '@/features/producer/signup-opens';
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
import {
  type Discipline,
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

// Launch-region zones. The device zone is offered too when it is not one of
// these, so a listing created anywhere gets an honest local time.
const TIMEZONE_CHOICES: { id: string; label: string }[] = [
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
];

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export type SeriesFormValues = {
  title: string;
  description: string;
  disciplines: Discipline[];
  signupMethod: SignupMethod;
  rrule: string;
  anchorDate: string;
  /** False when editing without changing the pattern kind: the stored
   * anchor must survive the save. */
  anchorDateChanged: boolean;
  startTime: string;
  timezone: string;
  signupOpensMinutes: number;
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
  signup_opens: string | null;
  /** Current venue, shown so the venue can be changed to another listed one. */
  venue_label: string | null;
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
  /** Fires when entries diverge from (or return to) their initial values. */
  onDirtyChange?: (dirty: boolean) => void;
};

function chipStyle(active: boolean) {
  return [styles.chip, active && styles.chipActive];
}

/** The first calendar date on or after the anchor that the rule generates,
 * as a short label, or null when nothing matches in the next five weeks. */
function firstMatchingDate(rrule: string, anchorDate: string): string | null {
  const start = Date.parse(`${anchorDate}T00:00:00Z`);
  if (Number.isNaN(start)) {
    return null;
  }
  for (let i = 0; i < 35; i++) {
    const day = new Date(start + i * 86_400_000);
    const iso = day.toISOString().slice(0, 10);
    if (rruleMatches(rrule, anchorDate, iso)) {
      return day.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  return null;
}

export function SeriesForm({ existing, busy, error, submitLabel, onSubmit, onDirtyChange }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [disciplines, setDisciplines] = useState<Discipline[]>(existing?.disciplines ?? []);
  const [method, setMethod] = useState<SignupMethod>(existing?.signup_method ?? 'first_come');
  const [recurrence, setRecurrence] = useState<RecurrenceChoice>(
    (existing && parseRrule(existing.rrule)) ?? { kind: 'weekly', days: [] },
  );
  // What the form opened with, so editing can tell a changed pattern kind
  // from an untouched one: an untouched biweekly must keep its stored
  // anchor (re-sending a fresh one silently flips the week parity), while
  // a switch to biweekly needs the parity question asked.
  const [initialKind] = useState(() => (existing && parseRrule(existing.rrule))?.kind ?? null);
  const kindChanged = existing != null && recurrence.kind !== initialKind;
  const [biweeklyNextWeek, setBiweeklyNextWeek] = useState(false);
  const existingTime = existing?.start_time?.slice(0, 5).split(':');
  const [hour, setHour] = useState<number>(existingTime ? Number(existingTime[0]) : 19);
  const [minute, setMinute] = useState<number>(existingTime ? Number(existingTime[1]) : 0);
  const [timezone, setTimezone] = useState<string>(
    existing?.timezone ?? deviceTimezone() ?? 'America/Los_Angeles',
  );
  // A hand-picked timezone always wins; otherwise the venue pin decides.
  const [timezoneTouched, setTimezoneTouched] = useState(false);
  const [signupOpensMinutes, setSignupOpensMinutes] = useState(
    existing
      ? parseSignupOpensMinutes(existing.signup_opens, existing.signup_method)
      : defaultSignupOpensMinutes('first_come'),
  );
  const [costDollars, setCostDollars] = useState(
    existing ? String(existing.cost_cents / 100) : '0',
  );
  const [costNote, setCostNote] = useState(existing?.cost_note ?? '');
  const [setLength, setSetLength] = useState(
    existing?.set_length_minutes ? String(existing.set_length_minutes) : '',
  );
  const [capacity, setCapacity] = useState(existing?.capacity ? String(existing.capacity) : '');
  const [formError, setFormError] = useState<string | null>(null);
  // Inline validation for the text fields; the chip-driven requirements
  // (disciplines, schedule, venue) still surface at submit, next to the
  // button, because there is no blur moment to hang them on.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const setFieldError = (field: string, message: string | null) =>
    setFieldErrors((cur) => ({ ...cur, [field]: message }));
  const numberError = (value: string, label: string): string | null =>
    value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0)
      ? `${label} must be a number.`
      : null;

  // Venue. In edit mode the current venue shows with a Change action;
  // picking another listed venue moves the whole series there. Adding a
  // brand-new venue is create-mode only.
  const [venueQuery, setVenueQuery] = useState('');
  const venueResults = useVenueSearch(venueQuery);
  const [venueId, setVenueId] = useState<string | undefined>();
  const [venueLabel, setVenueLabel] = useState<string | null>(existing?.venue_label ?? null);
  const [addingVenue, setAddingVenue] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueNeighborhood, setVenueNeighborhood] = useState('');
  const [venueCity, setVenueCity] = useState('');
  const [venueRegion, setVenueRegion] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const placePin = useCallback(
    (next: { lat: number; lng: number } | null) => {
      setPin(next);
      // The venue's coordinates know their own timezone; a producer placing
      // a Chicago pin should not have to know their bar is Central time.
      if (next && !timezoneTouched) {
        try {
          setTimezone(tzLookup(next.lat, next.lng));
        } catch {
          // Out-of-range coordinates; keep the current choice.
        }
      }
    },
    [timezoneTouched],
  );

  const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const rrule = buildRrule(recurrence);
  const preview = rrule ? describeRecurrence(rrule, startTime) : null;
  // "Every other Wednesday" alone cannot answer which alternating week;
  // the first concrete date can, so the preview names it for biweeklies.
  const firstNight =
    rrule && recurrence.kind === 'biweekly' && (!existing || kindChanged)
      ? firstMatchingDate(
          rrule,
          computeAnchorDate(recurrence, new Date(), biweeklyNextWeek, timezone),
        )
      : null;
  const signupOpensOptions = signupOpensChoices(method).map(({ minutes, label }) => ({
    value: minutes,
    label,
  }));

  // Look the venue up from its address so producers never have to copy
  // coordinates out of a map. Runs once the address is complete, leaves the
  // pin alone after any manual placement, and never blocks the form: the
  // picker below stays available whether the lookup succeeds, fails, or (on
  // web) is unavailable entirely.
  const addressQuery = venueAddressQuery({
    street: venueAddress,
    city: venueCity,
    region: venueRegion,
  });
  const [lookup, setLookup] = useState<'idle' | 'searching' | 'found' | 'failed'>('idle');
  const pinnedByHand = useRef(false);
  const lookedUp = useRef<string | null>(null);

  useEffect(() => {
    if (!addingVenue || !addressQuery || pinnedByHand.current) {
      return;
    }
    if (lookedUp.current === addressQuery) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      lookedUp.current = addressQuery;
      setLookup('searching');
      const coords = await geocodeVenueAddress(addressQuery);
      if (cancelled) {
        return;
      }
      if (coords) {
        placePin(coords);
        setLookup('found');
      } else {
        setLookup('failed');
      }
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addingVenue, addressQuery, placePin]);

  async function findAddressAgain() {
    if (!addressQuery) {
      return;
    }
    pinnedByHand.current = false;
    lookedUp.current = addressQuery;
    setLookup('searching');
    const coords = await geocodeVenueAddress(addressQuery);
    if (coords) {
      placePin(coords);
      setLookup('found');
    } else {
      setLookup('failed');
    }
  }

  // ~20 fields of typed-in work; the parent guards navigation on this so
  // a stray back tap cannot silently discard it all.
  const snapshot = JSON.stringify([
    title,
    description,
    disciplines,
    method,
    recurrence,
    biweeklyNextWeek,
    hour,
    minute,
    timezone,
    signupOpensMinutes,
    costDollars,
    costNote,
    setLength,
    capacity,
    venueId ?? null,
    venueLabel,
    addingVenue,
    venueName,
    venueAddress,
    venueNeighborhood,
    venueCity,
    venueRegion,
    pin,
  ]);
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot !== initialSnapshot;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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
    if (existing) {
      // Editing: a cleared venue must be re-picked before saving.
      if (!venueId && !venueLabel) {
        setFormError('Pick the venue for this mic.');
        return;
      }
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
      // The venue's zone, not the device's: the server reads this date in
      // the series timezone, so a producer listing a mic in another zone
      // late at night would otherwise anchor to the wrong ISO week and
      // invert every alternate night of a biweekly schedule.
      anchorDate: computeAnchorDate(recurrence, new Date(), biweeklyNextWeek, timezone),
      anchorDateChanged: existing == null || kindChanged,
      startTime,
      timezone,
      signupOpensMinutes,
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
        onChangeText={(v) => {
          setTitle(v);
          setFieldError('title', null);
        }}
        onBlur={() => setFieldError('title', title.trim() ? null : 'Give the mic a name.')}
        error={fieldErrors.title}
        placeholder="The Basement Open Mic"
      />

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionLabel}>
        Disciplines
      </Text>
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
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionLabel}>
        When does it happen?
      </Text>
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
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
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
              <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
                {WEEKDAY_LABELS[code]}
              </Text>
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
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
                  {ORDINAL_LABELS[o]}
                </Text>
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
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
                  {WEEKDAY_LABELS[code]}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {recurrence.kind === 'biweekly' && (!existing || kindChanged) ? (
        <View style={styles.chipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !biweeklyNextWeek }}
            onPress={() => setBiweeklyNextWeek(false)}
            style={chipStyle(!biweeklyNextWeek)}
          >
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
              Happens this week
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: biweeklyNextWeek }}
            onPress={() => setBiweeklyNextWeek(true)}
            style={chipStyle(biweeklyNextWeek)}
          >
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
              Starts next week
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionLabel}>
        Start time
      </Text>
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
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionLabel}>
        Timezone
      </Text>
      <View style={styles.chipRow}>
        {(TIMEZONE_CHOICES.some((t) => t.id === timezone)
          ? TIMEZONE_CHOICES
          : [...TIMEZONE_CHOICES, { id: timezone, label: timezone }]
        ).map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityState={{ selected: timezone === t.id }}
            accessibilityLabel={`${t.label} time`}
            onPress={() => {
              setTimezone(t.id);
              setTimezoneTouched(true);
            }}
            style={chipStyle(timezone === t.id)}
          >
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Body>The start time is local time at the venue, in this timezone.</Body>

      {preview ? (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.preview}>
          {preview}
          {firstNight ? ` · First night ${firstNight}` : ''}
        </Text>
      ) : null}

      <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionLabel}>
        Signups
      </Text>
      <SelectField
        label="How performers get on stage"
        value={method}
        options={METHOD_OPTIONS}
        onChange={(next) => {
          setMethod(next);
          // A walk-in list measures its lead time in minutes and everything
          // else in days, so the current pick may not exist in the new set.
          setSignupOpensMinutes((current) => coerceSignupOpensMinutes(current, next));
        }}
      />
      <SelectField
        label={isWalkIn(method) ? 'When the list opens' : 'When signups open'}
        value={signupOpensMinutes}
        options={signupOpensOptions}
        onChange={setSignupOpensMinutes}
      />
      <Body>
        {isWalkIn(method)
          ? 'The list opens this long before each show and closes at showtime.'
          : 'Signups open this far ahead of each night and close at showtime.'}
      </Body>

      <View style={styles.pairRow}>
        <View style={styles.pairItem}>
          <Field
            label="Cost ($)"
            value={costDollars}
            onChangeText={(v) => {
              setCostDollars(v);
              setFieldError('cost', null);
            }}
            onBlur={() => setFieldError('cost', numberError(costDollars, 'Cost'))}
            error={fieldErrors.cost}
            inputMode="decimal"
          />
        </View>
        <View style={styles.pairItem}>
          <Field
            label="Set length (min)"
            value={setLength}
            onChangeText={(v) => {
              setSetLength(v);
              setFieldError('setLength', null);
            }}
            onBlur={() => setFieldError('setLength', numberError(setLength, 'Set length'))}
            error={fieldErrors.setLength}
            inputMode="numeric"
          />
        </View>
        <View style={styles.pairItem}>
          <Field
            label="Spots"
            value={capacity}
            onChangeText={(v) => {
              setCapacity(v);
              setFieldError('capacity', null);
            }}
            onBlur={() => setFieldError('capacity', numberError(capacity, 'Spots'))}
            error={fieldErrors.capacity}
            inputMode="numeric"
          />
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

      <>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionLabel}>
          Venue
        </Text>
        {existing ? <Body>Changing the venue moves this and all future nights there.</Body> : null}
        {venueLabel ? (
          <View style={styles.venuePicked}>
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
              {venueLabel}
            </Text>
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
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionLabel}>
              Location
            </Text>
            {lookup === 'searching' ? (
              <Body>Finding the address on the map...</Body>
            ) : lookup === 'found' ? (
              <Body>Found it from the address. Move the pin if it is not quite right.</Body>
            ) : lookup === 'failed' ? (
              <Body>
                Could not find that address automatically. Place the venue yourself below.
              </Body>
            ) : (
              <Body>
                Fill in the street, city, and state above and the location fills itself in.
              </Body>
            )}
            <PinPicker
              pin={pin}
              onChange={(next) => {
                pinnedByHand.current = true;
                placePin(next);
              }}
            />
            {addressQuery ? (
              <Button
                label={lookup === 'searching' ? 'Looking up the address' : 'Use the address above'}
                kind="secondary"
                busy={lookup === 'searching'}
                onPress={findAddressAgain}
              />
            ) : null}
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
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.chipText}>
                  {v.name}
                </Text>
                <Text maxFontSizeMultiplier={maxFontScale} style={styles.venueMeta}>
                  {v.address_line}, {v.city}, {v.region}
                </Text>
              </Pressable>
            ))}
            {!existing ? (
              <Button
                label="Venue is not listed: add it"
                kind="secondary"
                onPress={() => setAddingVenue(true)}
              />
            ) : null}
          </>
        )}
      </>

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
    minHeight: minTouchTarget,
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
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  venueResult: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.xxs,
    padding: spacing.md,
  },
  venueMeta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
});
