/**
 * Who is hosting and who is featured.
 *
 * One screen serves both cases. With no `occurrence` param it edits the
 * series default, which is what the mic does every week. With one, it edits a
 * single night, and the series default is still shown so it is obvious what
 * is being departed from.
 *
 * A credit can be linked to an account or typed by hand. Linking is offered
 * first because it keeps working: the person's stage name and links follow
 * their profile instead of going stale in a listing.
 */
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Body, Button, ErrorText, Field, LoadingView, Screen, Title } from '@/components/ui';
import { AvatarCircle } from '@/features/profile/avatar-circle';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { useMicDetail } from '@/features/discovery/queries';
import { NotYourMic } from '@/features/producer/components/not-your-mic';
import { canManageSeries } from '@/features/producer/ownership';
import { setReturnTo } from '@/stores/return-to';
import {
  useManageCredits,
  usePersonSearch,
  useRemoveCredit,
  useSetCredit,
  type PickablePerson,
} from '@/features/credits/queries';
import type { CreditRole } from '@/features/credits/resolve';
import { normalizeHandle, normalizeUrl, handleError, urlError } from '@/features/profile/social';
import { fonts, minTouchTarget, palette, spacing, type } from '@/theme';

type Draft = {
  profile: PickablePerson | null;
  name: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  spotify: string;
  appleMusic: string;
};

const EMPTY: Draft = {
  profile: null,
  name: '',
  instagram: '',
  tiktok: '',
  youtube: '',
  spotify: '',
  appleMusic: '',
};

export default function CreditsScreen() {
  const { id, occurrence } = useLocalSearchParams<{ id: string; occurrence?: string }>();
  const occurrenceId = occurrence ?? null;
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const credits = useManageCredits(id);
  const profile = useOwnProfile(session?.user.id);
  const detail = useMicDetail(id);

  if (credits.isPending || (session && (detail.isPending || profile.isPending))) {
    return (
      <>
        <ScreenHeader title="Lineup" />
        <LoadingView label="Loading lineup" />
      </>
    );
  }
  if (credits.isError) {
    return (
      <>
        <ScreenHeader title="Lineup" />
        <Screen>
          <Title>Lineup</Title>
          <ErrorText>Could not load the lineup. Check your connection.</ErrorText>
          <Button label="Try again" onPress={() => credits.refetch()} />
        </Screen>
      </>
    );
  }
  if (!session) {
    return (
      <>
        <ScreenHeader title="Lineup" />
        <Screen>
          <Title>Lineup</Title>
          <Body>Sign in to manage this mic.</Body>
          <Button
            label="Sign in"
            onPress={() => {
              setReturnTo(occurrenceId ? `${pathname}?occurrence=${occurrenceId}` : pathname);
              router.push('/(auth)/sign-in');
            }}
          />
        </Screen>
      </>
    );
  }
  // Credits are publicly readable, so this editor loaded for anyone with
  // the id and presented live Change and Remove buttons on someone else's
  // lineup. The writes were refused; the screen should not offer them.
  if (
    detail.data?.series &&
    !canManageSeries(detail.data.series, session.user.id, profile.data?.is_admin ?? false)
  ) {
    return (
      <>
        <ScreenHeader title="Lineup" />
        <NotYourMic seriesId={id} />
      </>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen
        options={{ headerShown: true, title: occurrenceId ? 'This night' : 'Lineup' }}
      />
      <Title>{occurrenceId ? 'Just this night' : 'Every night'}</Title>
      <Body>
        {occurrenceId
          ? 'Set a guest host or a one-off feature. Other nights keep the usual lineup.'
          : 'Who normally hosts, and who is featured. You can change either for a single night from the Upcoming nights list.'}
      </Body>

      <RoleEditor
        role="featured"
        label="Featured artist"
        seriesId={id}
        occurrenceId={occurrenceId}
        userId={session.user.id}
        existing={credits.data}
      />
      <RoleEditor
        role="host"
        label="Host"
        seriesId={id}
        occurrenceId={occurrenceId}
        userId={session.user.id}
        existing={credits.data}
      />
    </ScrollView>
  );
}

function RoleEditor({
  role,
  label,
  seriesId,
  occurrenceId,
  userId,
  existing,
}: {
  role: CreditRole;
  label: string;
  seriesId: string;
  occurrenceId: string | null;
  userId: string;
  existing: ReturnType<typeof useManageCredits>['data'];
}) {
  const rows = existing ?? [];
  const current = rows.find((c) => c.role === role && c.occurrence_id === occurrenceId) ?? null;
  const seriesDefault = rows.find((c) => c.role === role && c.occurrence_id === null) ?? null;

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setCredit = useSetCredit();
  const removeCredit = useRemoveCredit();

  const igError = handleError(normalizeHandle(draft.instagram));
  const ttError = handleError(normalizeHandle(draft.tiktok));
  const ytError = urlError(normalizeUrl(draft.youtube));
  const spError = urlError(normalizeUrl(draft.spotify));
  const amError = urlError(normalizeUrl(draft.appleMusic));
  const blocked = Boolean(igError || ttError || ytError || spError || amError);

  async function save() {
    setError(null);
    try {
      await setCredit.mutateAsync({
        seriesId,
        occurrenceId,
        role,
        userId,
        profileId: draft.profile?.id ?? null,
        name: draft.profile ? null : draft.name,
        link_instagram: normalizeHandle(draft.instagram) || null,
        link_tiktok: normalizeHandle(draft.tiktok) || null,
        link_youtube: normalizeUrl(draft.youtube) || null,
        link_website: null,
        link_spotify: normalizeUrl(draft.spotify) || null,
        link_apple_music: normalizeUrl(draft.appleMusic) || null,
      });
      setEditing(false);
      setDraft(EMPTY);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>

      {current ? (
        <View style={styles.currentRow}>
          <Text style={styles.currentName}>
            {current.name ?? 'Linked account'}
            {current.moderation_status === 'pending' ? ' (waiting on review)' : ''}
          </Text>
          <Button
            label="Remove"
            kind="secondary"
            onPress={() => {
              setError(null);
              removeCredit
                .mutateAsync({ creditId: current.id, seriesId })
                .catch((e: unknown) =>
                  setError(e instanceof Error ? e.message : 'Could not remove. Try again.'),
                );
            }}
          />
        </View>
      ) : (
        <Body>
          {occurrenceId && seriesDefault
            ? `Usually ${seriesDefault.name ?? 'a linked account'}. Add someone to change just this night.`
            : 'Nobody set yet.'}
        </Body>
      )}

      {editing ? (
        <View style={styles.form}>
          <PersonPicker
            selected={draft.profile}
            onSelect={(profile) => setDraft((d) => ({ ...d, profile }))}
          />
          {draft.profile ? (
            <Body>
              Their name and links come from their profile, so they stay right when it changes.
            </Body>
          ) : (
            <>
              <Field
                label="Name"
                value={draft.name}
                onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
                placeholder="Who is on"
              />
              <Field
                label="Instagram"
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="url"
                value={draft.instagram}
                onChangeText={(instagram) => setDraft((d) => ({ ...d, instagram }))}
                error={igError}
                placeholder="@theirname"
              />
              <Field
                label="TikTok"
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="url"
                value={draft.tiktok}
                onChangeText={(tiktok) => setDraft((d) => ({ ...d, tiktok }))}
                error={ttError}
                placeholder="@theirname"
              />
              <Field
                label="YouTube"
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="url"
                value={draft.youtube}
                onChangeText={(youtube) => setDraft((d) => ({ ...d, youtube }))}
                error={ytError}
                placeholder="youtube.com/@theirname"
              />
              <Field
                label="Spotify"
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="url"
                value={draft.spotify}
                onChangeText={(spotify) => setDraft((d) => ({ ...d, spotify }))}
                error={spError}
                placeholder="open.spotify.com/artist/..."
              />
              <Field
                label="Apple Music"
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="url"
                value={draft.appleMusic}
                onChangeText={(appleMusic) => setDraft((d) => ({ ...d, appleMusic }))}
                error={amError}
                placeholder="music.apple.com/..."
              />
            </>
          )}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label={setCredit.isPending ? 'Saving' : 'Save'}
            onPress={save}
            disabled={blocked || setCredit.isPending}
          />
          <Button
            label="Cancel"
            kind="secondary"
            onPress={() => {
              setEditing(false);
              setDraft(EMPTY);
              setError(null);
            }}
          />
        </View>
      ) : (
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label={current ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
            kind="secondary"
            onPress={() => setEditing(true)}
          />
        </>
      )}
    </View>
  );
}

/** Search accounts to credit, or leave it alone and type a name instead. */
function PersonPicker({
  selected,
  onSelect,
}: {
  selected: PickablePerson | null;
  onSelect: (person: PickablePerson | null) => void;
}) {
  const [query, setQuery] = useState('');
  const people = usePersonSearch(query);

  if (selected) {
    return (
      <View style={styles.currentRow}>
        <AvatarCircle url={selected.avatar_url} name={selected.stage_name} size={36} />
        <Text style={styles.currentName}>{selected.stage_name}</Text>
        <Button label="Not them" kind="secondary" onPress={() => onSelect(null)} />
      </View>
    );
  }

  return (
    <View style={styles.picker}>
      <Field
        label="Find them on Open Mic Explorer"
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name or handle"
      />
      {query.trim().length >= 2 && people.isPending ? <Body>Searching</Body> : null}
      {people.isError ? <ErrorText>Could not search right now.</ErrorText> : null}
      {people.data?.length === 0 ? (
        <Body>Nobody by that name. Type their details in below instead.</Body>
      ) : null}
      {people.data?.map((person) => (
        <Pressable
          key={person.id}
          accessibilityRole="button"
          accessibilityLabel={`Credit ${person.stage_name}`}
          onPress={() => onSelect(person)}
          style={({ pressed }) => [styles.personRow, pressed && styles.personRowPressed]}
        >
          <AvatarCircle url={person.avatar_url} name={person.stage_name} size={36} />
          <View style={styles.personText}>
            <Text style={styles.currentName}>{person.stage_name}</Text>
            <Text style={styles.handle}>@{person.handle}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: palette.bg,
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  section: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  form: {
    gap: spacing.sm,
  },
  currentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  currentName: {
    color: palette.text,
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  picker: {
    gap: spacing.sm,
  },
  personRow: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: minTouchTarget,
    padding: spacing.sm,
  },
  personRowPressed: {
    backgroundColor: palette.bgPressed,
  },
  personText: {
    flex: 1,
  },
  handle: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
});
