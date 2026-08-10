import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { SocialLinkRow } from '@/components/social-links';
import {
  Body,
  Button,
  ErrorText,
  Field,
  LoadingView,
  Screen,
  Title,
  ToggleRow,
} from '@/components/ui';
import { useOwnProfile } from '@/features/auth/queries';
import { SignUpPrompt } from '@/features/auth/components/sign-up-prompt';
import { useSession } from '@/features/auth/session';
import { eventDate, eventTime } from '@/features/discovery/local-time';
import { PersonRow } from '@/features/network/components/person-row';
import {
  useAcceptRequest,
  useConnectionNights,
  useMyConnections,
  useRemoveConnection,
  useSearchPeople,
  useSendRequest,
  useSetShareAttendance,
  type ConnectionNight,
  type ConnectionRow,
} from '@/features/network/queries';
import { roleLabel, splitConnections } from '@/features/network/summary';
import { buildSocialLinks } from '@/features/profile/social';
import { ReportModal } from '@/features/safety/components/report-modal';
import { fonts, maxFontScale, palette, radius, spacing, type } from '@/theme';

/**
 * The Network tab: the people you have connected with, the requests between
 * you, and where your people will be next. Connections exist to turn "I saw
 * you at the Rusty Fret" into the next gig, so the tab leads with people and
 * ends with nights.
 */
export function NetworkScreen() {
  const { session } = useSession();
  const [term, setTerm] = useState('');
  const [reporting, setReporting] = useState<{ id: string; name: string } | null>(null);

  const connections = useMyConnections(session?.user.id);
  const nights = useConnectionNights(session?.user.id);
  const profile = useOwnProfile(session?.user.id);
  const search = useSearchPeople(term, session?.user.id);
  const send = useSendRequest();
  const accept = useAcceptRequest();
  const remove = useRemoveConnection();
  const setShare = useSetShareAttendance();

  if (!session) {
    return (
      <Screen>
        <Title>Network</Title>
        <SignUpPrompt
          title="Know who else is out there"
          reason="Connections are mutual: you both say yes, and only then do you see each other's socials and which mics you are each heading to."
          perks={[
            'See which mics your people are hitting next',
            'Their socials, one tap away',
            'No messaging, no feed, and you can disconnect anytime',
          ]}
        />
      </Screen>
    );
  }
  if (connections.isPending) {
    return <LoadingView label="Loading your network" />;
  }
  const rows = connections.data;
  if (rows === undefined) {
    return (
      <Screen>
        <Title>Network</Title>
        <ErrorText>Could not load your network. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => connections.refetch()} />
      </Screen>
    );
  }

  const { requests, sent, connected } = splitConnections(rows);
  const knownIds = new Set(rows.map((r) => r.other_id));
  const searching = term.trim().length >= 2;
  const shareAttendance = profile.data?.share_attendance ?? true;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={connections.isFetching}
          onRefresh={() => {
            connections.refetch();
            nights.refetch();
          }}
          tintColor={palette.textSecondary}
        />
      }
    >
      <Field
        label="Add someone you met"
        value={term}
        onChangeText={setTerm}
        placeholder="Search by name or @handle"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {send.isError ? (
        <ErrorText>
          {send.error instanceof Error ? send.error.message : 'Could not send the request.'}
        </ErrorText>
      ) : null}
      {searching ? (
        <View style={styles.section}>
          {search.isPending ? (
            <Body>Searching</Body>
          ) : search.isError ? (
            <ErrorText>Could not search. Check your connection.</ErrorText>
          ) : search.data.length === 0 ? (
            <Body>
              Nobody matches that yet. People show up here once they have an account, so tell them
              about the app at the next mic.
            </Body>
          ) : (
            search.data.map((person) => (
              <PersonRow
                key={person.id}
                name={person.stage_name}
                handle={person.handle}
                subtitle={roleLabel(person)}
                avatarUrl={person.avatar_url}
                actions={
                  knownIds.has(person.id) ? (
                    <Text maxFontSizeMultiplier={maxFontScale} style={styles.already}>
                      In your network
                    </Text>
                  ) : (
                    <Button
                      label="Connect"
                      kind="secondary"
                      busy={send.isPending}
                      onPress={() => send.mutate({ userId: session.user.id, otherId: person.id })}
                    />
                  )
                }
              />
            ))
          )}
        </View>
      ) : null}

      {requests.length > 0 ? (
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
            Wants to connect
          </Text>
          {accept.isError ? (
            <ErrorText>
              {accept.error instanceof Error ? accept.error.message : 'Could not accept.'}
            </ErrorText>
          ) : null}
          {requests.map((row) => (
            <PersonRow
              key={row.other_id!}
              name={row.stage_name!}
              handle={row.handle ?? ''}
              subtitle={roleLabel(row)}
              avatarUrl={row.avatar_url}
              actions={
                <>
                  <Button
                    label="Accept"
                    busy={accept.isPending}
                    onPress={() =>
                      accept.mutate({ userId: session.user.id, otherId: row.other_id! })
                    }
                  />
                  <Button
                    label="Decline"
                    kind="secondary"
                    busy={remove.isPending}
                    onPress={() =>
                      remove.mutate({ userId: session.user.id, otherId: row.other_id! })
                    }
                  />
                </>
              }
            />
          ))}
        </View>
      ) : null}

      {sent.length > 0 ? (
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
            Waiting on them
          </Text>
          {sent.map((row) => (
            <PersonRow
              key={row.other_id!}
              name={row.stage_name!}
              handle={row.handle ?? ''}
              subtitle={roleLabel(row)}
              avatarUrl={row.avatar_url}
              actions={
                <Button
                  label="Withdraw"
                  kind="secondary"
                  busy={remove.isPending}
                  onPress={() => remove.mutate({ userId: session.user.id, otherId: row.other_id! })}
                />
              }
            />
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
          Your people
        </Text>
        {remove.isError ? (
          <ErrorText>
            {remove.error instanceof Error ? remove.error.message : 'Could not remove them.'}
          </ErrorText>
        ) : null}
        {connected.length === 0 ? (
          <Body>
            Nobody yet. Search for the people you cross paths with at mics; once you both say yes,
            their socials and their upcoming nights show here.
          </Body>
        ) : (
          connected.map((row) => (
            <ConnectionCard
              key={row.other_id!}
              row={row}
              onRemove={() => remove.mutate({ userId: session.user.id, otherId: row.other_id! })}
              onReport={() => setReporting({ id: row.other_id!, name: row.stage_name! })}
              removeBusy={remove.isPending}
            />
          ))
        )}
      </View>

      {connected.length > 0 ? (
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
            Where your people will be
          </Text>
          {nights.isPending ? (
            <Body>Loading</Body>
          ) : nights.isError ? (
            <ErrorText>Could not load where your people will be.</ErrorText>
          ) : nights.data.length === 0 ? (
            <Body>
              Nobody has said yes to an upcoming night yet. When they sign up or tap &quot;I am
              going&quot;, it shows here.
            </Body>
          ) : (
            nights.data.map((night) => (
              <NightLine key={`${night.other_id}-${night.occurrence_id}`} night={night} />
            ))
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
          Privacy
        </Text>
        <ToggleRow
          label="Share my nights"
          description="Let the people you are connected with see which upcoming mics you signed up for or are going to. Off hides them all without removing anyone."
          value={shareAttendance}
          onToggle={(v) => setShare.mutate({ userId: session.user.id, share: v })}
        />
        {setShare.isError ? (
          <ErrorText>
            {setShare.error instanceof Error ? setShare.error.message : 'Could not save.'}
          </ErrorText>
        ) : null}
        <Body>
          Connections see your public profile and your nights, nothing else. Removing a connection
          takes both away immediately.
        </Body>
      </View>

      <ReportModal
        visible={reporting !== null}
        onClose={() => setReporting(null)}
        targetType="profile"
        targetId={reporting?.id ?? ''}
        blockableUserId={reporting?.id}
        targetLabel={reporting?.name ?? 'this person'}
      />
    </ScrollView>
  );
}

function ConnectionCard({
  row,
  onRemove,
  onReport,
  removeBusy,
}: {
  row: ConnectionRow;
  onRemove: () => void;
  onReport: () => void;
  removeBusy: boolean;
}) {
  const links = buildSocialLinks(row);
  return (
    <PersonRow
      name={row.stage_name!}
      handle={row.handle ?? ''}
      subtitle={roleLabel(row)}
      avatarUrl={row.avatar_url}
      actions={
        <>
          <Button label="Remove" kind="secondary" busy={removeBusy} onPress={onRemove} />
          <Button label="Report" kind="secondary" onPress={onReport} />
        </>
      }
    >
      {links.length > 0 ? (
        <SocialLinkRow links={links} />
      ) : (
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.noLinks}>
          No socials on their profile yet.
        </Text>
      )}
    </PersonRow>
  );
}

function NightLine({ night }: { night: ConnectionNight }) {
  const router = useRouter();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${night.stage_name} is going to ${night.title}`}
      onPress={() => {
        if (night.series_id) {
          router.push(`/mic/${night.series_id}`);
        }
      }}
      style={styles.nightRow}
    >
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.nightWho}>
        {night.stage_name}
      </Text>
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.nightWhat}>
        {night.title}
        {night.venue_name ? ` at ${night.venue_name}` : ''}
      </Text>
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.nightWhen}>
        {night.starts_at
          ? `${eventDate(night.starts_at, night.timezone)} · ${eventTime(night.starts_at, night.timezone)}`
          : 'Date to be confirmed'}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    marginTop: spacing.sm,
  },
  already: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
  },
  noLinks: {
    color: palette.textFaint,
    fontSize: type.caption.fontSize,
  },
  nightRow: {
    backgroundColor: palette.bgElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 2,
    padding: spacing.md,
  },
  nightWho: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
  },
  nightWhat: {
    color: palette.textSecondary,
    fontSize: type.body.fontSize,
  },
  nightWhen: {
    color: palette.textFaint,
    fontSize: type.caption.fontSize,
  },
});
