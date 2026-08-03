import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph } from '@/components/glyph';
import {
  Body,
  Button,
  ErrorText,
  Field,
  KeyboardShift,
  LoadingView,
  Screen,
  Title,
} from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { freshness } from '@/features/discovery/freshness';
import { useMicDetail } from '@/features/discovery/queries';
import { describeRecurrence } from '@/features/discovery/recurrence';
import { SeriesForm, type SeriesFormValues } from '@/features/producer/components/series-form';
import { pickAndUploadPoster } from '@/features/producer/poster';
import {
  useConfirmSeries,
  useSeriesOccurrences,
  useUpdateOccurrence,
  useUpdateSeries,
} from '@/features/producer/queries';
import { contactSupport } from '@/lib/support';
import { fonts, palette, spacing, type, type Discipline } from '@/theme';
import type { Database } from '@/types/database.types';

type Occurrence = Database['public']['Tables']['mic_occurrences']['Row'];

export default function ManageSeriesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useMicDetail(id);
  const occurrences = useSeriesOccurrences(id);
  const confirm = useConfirmSeries();
  const updateSeries = useUpdateSeries();
  const updateOccurrence = useUpdateOccurrence();

  const { session } = useSession();
  const [editing, setEditing] = useState(false);
  const [posterBusy, setPosterBusy] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);
  const [nightAction, setNightAction] = useState<{
    occurrence: Occurrence;
    mode: 'cancel' | 'edit';
  } | null>(null);

  if (detail.isPending) {
    return <LoadingView label="Loading your mic" />;
  }
  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <Title>My mic</Title>
        <ErrorText>Could not load this listing.</ErrorText>
        <Button label="Try again" onPress={() => detail.refetch()} />
      </Screen>
    );
  }

  const series = detail.data.series;
  const fresh = freshness(series.last_confirmed_at, new Date());

  async function changePoster() {
    if (!session) {
      return;
    }
    setPosterBusy(true);
    setPosterError(null);
    try {
      const url = await pickAndUploadPoster(session.user.id, series.id);
      if (url) {
        updateSeries.mutate({ seriesId: series.id, patch: { poster_url: url } });
      }
    } catch (e) {
      setPosterError(e instanceof Error ? e.message : 'Could not upload the poster. Try again.');
    } finally {
      setPosterBusy(false);
    }
  }

  function submitEdit(values: SeriesFormValues) {
    updateSeries.mutate(
      {
        seriesId: series.id,
        patch: {
          title: values.title,
          description: values.description || null,
          disciplines: values.disciplines,
          signup_method: values.signupMethod,
          rrule: values.rrule,
          start_time: values.startTime,
          timezone: values.timezone,
          signup_opens: `${values.signupOpensDays} days`,
          cost_cents: Math.round(Number(values.costDollars || '0') * 100),
          cost_note: values.costNote || null,
          set_length_minutes: values.setLengthMinutes ? Number(values.setLengthMinutes) : null,
          capacity: values.capacity ? Number(values.capacity) : null,
          ...(values.venueId ? { venue_id: values.venueId } : {}),
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: series.title,
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{series.title}</Text>
        {series.moderation_status === 'pending' ? (
          <Text style={styles.heldNote}>
            Held for review: a moderator checks the wording before this listing goes public. Right
            now only you can see it.
          </Text>
        ) : series.moderation_status === 'rejected' ? (
          <>
            <Text style={styles.rejectedNote}>
              This listing was rejected in review and is not public. Edit the wording to resubmit,
              or contact support.
            </Text>
            <Button
              label="Contact support"
              kind="secondary"
              onPress={() => contactSupport(`Rejected listing: ${series.title}`)}
            />
          </>
        ) : null}
        <Text style={styles.meta}>
          {describeRecurrence(series.rrule, series.start_time) ?? 'Schedule varies'} ·{' '}
          {series.venue?.name}
        </Text>
        <View style={styles.freshRow}>
          <Glyph name="freshness-badge" size={16} color={fresh.color} />
          <Text style={[styles.meta, { color: fresh.color }]}>{fresh.label}</Text>
        </View>
        <Body>
          One tap keeps your listing trusted: confirming updates the freshness badge every performer
          sees.
        </Body>
        <Button
          label="Confirm this listing is accurate"
          busy={confirm.isPending}
          onPress={() => confirm.mutate(series.id)}
        />
        {confirm.isError ? (
          <ErrorText>Could not confirm the listing. Check your connection and try again.</ErrorText>
        ) : null}
        <View style={styles.buttonRow}>
          <View style={styles.buttonFlex}>
            <Button
              label="Analytics"
              kind="secondary"
              onPress={() => router.push(`/producer/analytics/${series.id}`)}
            />
          </View>
          <View style={styles.buttonFlex}>
            <Button
              label={editing ? 'Close editor' : 'Edit mic (all future nights)'}
              kind="secondary"
              onPress={() => setEditing(!editing)}
            />
          </View>
          <View style={styles.buttonFlex}>
            <Button
              label={series.is_active ? 'Pause listing' : 'Resume listing'}
              kind="secondary"
              busy={updateSeries.isPending && !editing}
              onPress={() => {
                if (series.is_active) {
                  setConfirmPause(true);
                } else {
                  updateSeries.mutate({
                    seriesId: series.id,
                    patch: { is_active: true },
                  });
                }
              }}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Poster</Text>
        {series.poster_url ? (
          <Image
            source={{ uri: series.poster_url }}
            accessibilityLabel="Event poster"
            style={styles.poster}
            contentFit="cover"
          />
        ) : (
          <Body>
            A poster makes your listing pop. Performers see it at the top of your mic page.
          </Body>
        )}
        <Button
          label={series.poster_url ? 'Replace poster' : 'Add a poster'}
          kind="secondary"
          busy={posterBusy}
          onPress={changePoster}
        />
        {posterError ? <ErrorText>{posterError}</ErrorText> : null}

        {editing ? (
          <View style={styles.editorBox}>
            <Body>
              These changes apply to this and all future nights. Nights you cancelled or edited
              individually are left alone. To change a single night, use the list below instead.
            </Body>
            <SeriesForm
              existing={{
                title: series.title,
                description: series.description,
                disciplines: series.disciplines as Discipline[],
                signup_method: series.signup_method,
                rrule: series.rrule,
                start_time: series.start_time,
                timezone: series.timezone,
                signup_opens: series.signup_opens,
                venue_label: series.venue ? `${series.venue.name}, ${series.venue.city}` : null,
                cost_cents: series.cost_cents,
                cost_note: series.cost_note,
                set_length_minutes: series.set_length_minutes,
                capacity: series.capacity,
              }}
              busy={updateSeries.isPending}
              error={
                updateSeries.isError
                  ? updateSeries.error instanceof Error
                    ? updateSeries.error.message
                    : 'Could not save.'
                  : null
              }
              submitLabel="Save for all future nights"
              onSubmit={submitEdit}
            />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Upcoming nights</Text>
        {occurrences.isPending ? (
          <Body>Loading nights...</Body>
        ) : occurrences.isError ? (
          <ErrorText>Could not load upcoming nights.</ErrorText>
        ) : occurrences.data.length === 0 ? (
          <Body>No upcoming nights. Resume the listing or adjust the schedule.</Body>
        ) : (
          occurrences.data.map((occ) => (
            <View key={occ.id} style={styles.nightRow}>
              <View style={styles.nightInfo}>
                <Text style={[styles.nightDate, occ.status === 'cancelled' && styles.cancelled]}>
                  {new Date(occ.starts_at).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                  {occ.override_title ? ` · ${occ.override_title}` : ''}
                </Text>
                {occ.status === 'cancelled' ? (
                  <Text style={styles.cancelledNote}>
                    Cancelled{occ.cancellation_note ? `: ${occ.cancellation_note}` : ''}
                  </Text>
                ) : null}
              </View>
              {occ.status === 'cancelled' ? (
                <Button
                  label="Restore"
                  kind="secondary"
                  onPress={() =>
                    updateOccurrence.mutate({
                      occurrenceId: occ.id,
                      seriesId: series.id,
                      patch: { status: 'scheduled', cancellation_note: null },
                    })
                  }
                />
              ) : (
                <View style={styles.nightActions}>
                  <Button label="List" onPress={() => router.push(`/producer/night/${occ.id}`)} />
                  <Button
                    label="This night"
                    kind="secondary"
                    onPress={() => setNightAction({ occurrence: occ, mode: 'edit' })}
                  />
                  <Button
                    label="Cancel"
                    kind="secondary"
                    onPress={() => setNightAction({ occurrence: occ, mode: 'cancel' })}
                  />
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {nightAction ? (
        <NightModal
          seriesId={series.id}
          occurrence={nightAction.occurrence}
          mode={nightAction.mode}
          onClose={() => setNightAction(null)}
        />
      ) : null}

      {confirmPause ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setConfirmPause(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <Text style={styles.sectionTitle}>Pause this listing?</Text>
              <Body>
                Pausing removes the upcoming nights from the schedule until you resume. Performers
                can still find the listing, with no dates.
              </Body>
              <Button
                label="Pause listing"
                busy={updateSeries.isPending}
                onPress={() =>
                  updateSeries.mutate(
                    { seriesId: series.id, patch: { is_active: false } },
                    { onSettled: () => setConfirmPause(false) },
                  )
                }
              />
              <Button label="Back" kind="secondary" onPress={() => setConfirmPause(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function NightModal({
  seriesId,
  occurrence,
  mode,
  onClose,
}: {
  seriesId: string;
  occurrence: Occurrence;
  mode: 'cancel' | 'edit';
  onClose: () => void;
}) {
  const update = useUpdateOccurrence();
  const [note, setNote] = useState('');
  const [overrideTitle, setOverrideTitle] = useState(occurrence.override_title ?? '');
  const [overrideCost, setOverrideCost] = useState(
    occurrence.override_cost_cents != null ? String(occurrence.override_cost_cents / 100) : '',
  );

  const dateLabel = new Date(occurrence.starts_at).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  function submit() {
    if (mode === 'cancel') {
      update.mutate(
        {
          occurrenceId: occurrence.id,
          seriesId,
          patch: { status: 'cancelled', cancellation_note: note.trim() || null },
        },
        { onSuccess: onClose },
      );
    } else {
      update.mutate(
        {
          occurrenceId: occurrence.id,
          seriesId,
          patch: {
            override_title: overrideTitle.trim() || null,
            override_cost_cents: overrideCost.trim()
              ? Math.round(Number(overrideCost) * 100)
              : null,
          },
        },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardShift>
          <View style={styles.modalSheet}>
            <Text style={styles.sectionTitle}>
              {mode === 'cancel' ? `Cancel ${dateLabel}?` : `Edit ${dateLabel} only`}
            </Text>
            {mode === 'cancel' ? (
              <>
                <Body>
                  Only this night is cancelled. The rest of the schedule is untouched, and
                  performers see the cancellation on the listing.
                </Body>
                <Field
                  label="Reason (shown to performers, optional)"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Venue is closed for a private event"
                />
              </>
            ) : (
              <>
                <Body>
                  Changes here apply to this night only. Use the Edit mic button for this and all
                  future nights.
                </Body>
                <Field
                  label="Special title (optional)"
                  value={overrideTitle}
                  onChangeText={setOverrideTitle}
                  placeholder="Holiday showcase"
                />
                <Field
                  label="Cost for this night ($, optional)"
                  value={overrideCost}
                  onChangeText={setOverrideCost}
                  inputMode="decimal"
                />
              </>
            )}
            {update.isError ? (
              <ErrorText>
                {update.error instanceof Error ? update.error.message : 'Could not save.'}
              </ErrorText>
            ) : null}
            <Button
              label={mode === 'cancel' ? 'Cancel this night' : 'Save this night'}
              busy={update.isPending}
              onPress={submit}
            />
            <Button label="Back" kind="secondary" onPress={onClose} />
          </View>
        </KeyboardShift>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.title.fontSize,
  },
  meta: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  heldNote: {
    color: palette.warning,
    fontSize: type.caption.fontSize,
  },
  rejectedNote: {
    color: palette.danger,
    fontSize: type.caption.fontSize,
  },
  freshRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonFlex: {
    flex: 1,
  },
  editorBox: {
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  poster: {
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 220,
    width: '100%',
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    marginTop: spacing.sm,
  },
  nightRow: {
    alignItems: 'center',
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  nightInfo: {
    flex: 1,
    gap: 2,
  },
  nightDate: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  cancelled: {
    color: palette.textFaint,
    textDecorationLine: 'line-through',
  },
  cancelledNote: {
    color: palette.danger,
    fontSize: type.caption.fontSize,
  },
  nightActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
