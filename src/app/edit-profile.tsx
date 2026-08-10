import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useDiscardGuard } from '@/components/discard-guard';
import { disciplineGlyphs, Glyph } from '@/components/glyph';
import { useToast } from '@/components/toast';
import {
  Body,
  Button,
  ErrorText,
  Field,
  KeyboardShift,
  LoadingView,
  Screen,
  Title,
  ToggleRow,
} from '@/components/ui';
import { validateDisplayName, validateRoles } from '@/features/auth/validation';
import { useOwnProfile, usePerformerDisciplines } from '@/features/auth/queries';
import { useMySeries } from '@/features/producer/queries';
import { useSession } from '@/features/auth/session';
import { AvatarCircle } from '@/features/profile/avatar-circle';
import { pickAndUploadAvatar } from '@/features/profile/avatar';
import { geocodeHomeArea } from '@/features/profile/geocode';
import { homeAreaError, homeAreaQuery, normalizeHomeArea } from '@/features/profile/home-area';
import { useUpdateProfile, useUpdateRoles } from '@/features/profile/queries';
import { handleError, normalizeHandle, normalizeUrl, urlError } from '@/features/profile/social';
import {
  type Discipline,
  disciplineAccents,
  fonts,
  maxFontScale,
  palette,
  spacing,
  type,
} from '@/theme';

const DISCIPLINES: Discipline[] = ['music', 'comedy', 'poetry', 'other'];

function disciplineDescription(d: Discipline): string {
  switch (d) {
    case 'music':
      return 'Songs, covers, originals, instrumentals.';
    case 'comedy':
      return 'Standup, sketch, improv.';
    case 'poetry':
      return 'Poems, spoken word, prose.';
    case 'other':
      return 'Storytelling, magic, anything else with a mic.';
  }
}

export default function EditProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);
  const performerDisciplines = usePerformerDisciplines(session?.user.id);

  // Both queries are disabled without a session, and a disabled query is
  // pending forever: a signed-out deep link sat on this spinner for good.
  if (!session) {
    return (
      <>
        <ScreenHeader title="Edit profile" />
        <Screen>
          <Title>Edit profile</Title>
          <Body>Sign in to edit your profile.</Body>
          <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
        </Screen>
      </>
    );
  }
  if (profile.isPending || performerDisciplines.isPending) {
    return (
      <>
        <ScreenHeader title="Edit profile" />
        <LoadingView label="Loading your profile" />
      </>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ScreenHeader title="Edit profile" />
        <Title>Edit profile</Title>
        <ErrorText>Could not load your profile. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => profile.refetch()} />
      </ScrollView>
    );
  }
  return (
    <EditProfileForm
      profile={profile.data}
      initialDisciplines={(performerDisciplines.data ?? []) as Discipline[]}
      userId={session!.user.id}
    />
  );
}

type ProfileRow = NonNullable<ReturnType<typeof useOwnProfile>['data']>;

function EditProfileForm({
  profile,
  initialDisciplines,
  userId,
}: {
  profile: ProfileRow;
  initialDisciplines: Discipline[];
  userId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateProfile(userId);
  const updateRoles = useUpdateRoles(userId);
  // Only consulted for the warning below; hosts rarely mean to abandon
  // live listings by flipping a toggle.
  const mySeries = useMySeries(userId);

  const [isPerformer, setIsPerformer] = useState(profile.is_performer);
  const [isProducer, setIsProducer] = useState(profile.is_producer);
  const [disciplines, setDisciplines] = useState<Discipline[]>(initialDisciplines);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [stageName, setStageName] = useState(profile.stage_name);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [homeCity, setHomeCity] = useState(profile.home_city ?? '');
  const [homeRegion, setHomeRegion] = useState(profile.home_region ?? '');
  const [homeZip, setHomeZip] = useState(profile.home_postal_code ?? '');
  const [instagram, setInstagram] = useState(profile.link_instagram ?? '');
  const [tiktok, setTiktok] = useState(profile.link_tiktok ?? '');
  const [youtube, setYoutube] = useState(profile.link_youtube ?? '');
  const [website, setWebsite] = useState(profile.link_website ?? '');
  const [spotify, setSpotify] = useState(profile.link_spotify ?? '');
  const [appleMusic, setAppleMusic] = useState(profile.link_apple_music ?? '');

  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The photo saves immediately; every text field only saves on Save, so
  // back navigation asks before dropping typed-in changes.
  const dirty =
    displayName !== profile.display_name ||
    bio !== (profile.bio ?? '') ||
    homeCity !== (profile.home_city ?? '') ||
    homeRegion !== (profile.home_region ?? '') ||
    homeZip !== (profile.home_postal_code ?? '') ||
    instagram !== (profile.link_instagram ?? '') ||
    tiktok !== (profile.link_tiktok ?? '') ||
    youtube !== (profile.link_youtube ?? '') ||
    website !== (profile.link_website ?? '');
  const { guardElement, bypassGuard } = useDiscardGuard({
    when: dirty,
    title: 'Discard profile changes?',
    body: 'Your edits are not saved. Leaving now loses them.',
    discardLabel: 'Discard changes',
  });

  const setFieldError = (field: string, message: string | null) =>
    setErrors((cur) => ({ ...cur, [field]: message }));
  const clearFieldError = (field: string) => setFieldError(field, null);
  const areaOnBlur = () =>
    setFieldError(
      'homeArea',
      homeAreaError(normalizeHomeArea({ city: homeCity, region: homeRegion, postalCode: homeZip })),
    );

  async function changePhoto() {
    setPhotoBusy(true);
    setError(null);
    try {
      const url = await pickAndUploadAvatar(userId);
      if (url) {
        setAvatarUrl(url);
        await update.mutateAsync({ avatar_url: url });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload the photo. Try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    const area = normalizeHomeArea({ city: homeCity, region: homeRegion, postalCode: homeZip });
    const ig = normalizeHandle(instagram);
    const tt = normalizeHandle(tiktok);
    const yt = normalizeUrl(youtube);
    const web = normalizeUrl(website);
    const spot = normalizeUrl(spotify);
    const apple = normalizeUrl(appleMusic);
    const nextErrors = {
      stageName: validateDisplayName(stageName),
      displayName: validateDisplayName(displayName),
      homeArea: homeAreaError(area),
      roles: validateRoles(isPerformer, isProducer),
      instagram: handleError(ig),
      tiktok: handleError(tt),
      youtube: urlError(yt),
      spotify: urlError(spot),
      appleMusic: urlError(apple),
      website: urlError(web),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }
    setError(null);
    try {
      const rolesChanged =
        isPerformer !== profile.is_performer ||
        isProducer !== profile.is_producer ||
        disciplines.join(',') !== initialDisciplines.join(',');
      if (rolesChanged) {
        await updateRoles.mutateAsync({ isPerformer, isProducer, disciplines });
      }
      // Re-geocode only when the area actually changed, so a failed lookup
      // never wipes coordinates that were already good.
      const areaChanged =
        area.city !== (profile.home_city ?? '') ||
        area.region !== (profile.home_region ?? '') ||
        area.postalCode !== (profile.home_postal_code ?? '');
      const coords = areaChanged ? await geocodeHomeArea(homeAreaQuery(area)) : null;
      await update.mutateAsync({
        stage_name: stageName.trim(),
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        home_city: area.city || null,
        home_region: area.region || null,
        home_postal_code: area.postalCode || null,
        ...(areaChanged ? { home_lat: coords?.lat ?? null, home_lng: coords?.lng ?? null } : {}),
        link_instagram: ig || null,
        link_tiktok: tt || null,
        link_youtube: yt || null,
        link_website: web || null,
        link_spotify: spot || null,
        link_apple_music: apple || null,
      });
      toast.show('Profile saved.');
      bypassGuard(() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    }
  }

  return (
    <KeyboardShift grow>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Edit profile" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change your photo"
          onPress={changePhoto}
          disabled={photoBusy}
          style={styles.avatarWrap}
        >
          <AvatarCircle url={avatarUrl} name={stageName} size={96} />
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.changePhoto}>
            {photoBusy ? 'Uploading...' : 'Change photo'}
          </Text>
        </Pressable>

        <Field
          label="Stage name"
          value={stageName}
          onChangeText={(v) => {
            setStageName(v);
            clearFieldError('stageName');
          }}
          onBlur={() => setFieldError('stageName', validateDisplayName(stageName))}
          error={errors.stageName}
        />
        <Body>This is the name on every signup list and public profile.</Body>
        <Field
          label="Name (private)"
          value={displayName}
          onChangeText={(v) => {
            setDisplayName(v);
            clearFieldError('displayName');
          }}
          onBlur={() => setFieldError('displayName', validateDisplayName(displayName))}
          error={errors.displayName}
        />
        <Body>Only you see this. Nothing outside your own account ever shows it.</Body>
        <Field
          label="About you (optional)"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={3}
          placeholder="What you play, your style, anything you want people to know."
        />

        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
          What you do
        </Text>
        <Body>Pick everything that applies. Most people in a scene end up doing both.</Body>
        <ToggleRow
          label="Performer"
          description="Find mics, sign up for spots, track where you have played."
          value={isPerformer}
          onToggle={setIsPerformer}
        />
        <ToggleRow
          label="Host"
          description="Run listings, manage signup lists, post lineups."
          value={isProducer}
          onToggle={setIsProducer}
        />
        {!isProducer && profile.is_producer && (mySeries.data?.length ?? 0) > 0 ? (
          <Body>
            You still run {mySeries.data!.length === 1 ? 'a mic' : `${mySeries.data!.length} mics`}.
            Turning this off hides them from you, but they stay live for everyone else until you
            pause them from My Mics first.
          </Body>
        ) : null}
        {errors.roles ? <ErrorText>{errors.roles}</ErrorText> : null}
        {isPerformer ? (
          <>
            <Body>What do you perform?</Body>
            {DISCIPLINES.map((d) => (
              <ToggleRow
                key={d}
                label={d.charAt(0).toUpperCase() + d.slice(1)}
                description={disciplineDescription(d)}
                value={disciplines.includes(d)}
                onToggle={() =>
                  setDisciplines((current) =>
                    current.includes(d) ? current.filter((x) => x !== d) : [...current, d],
                  )
                }
                icon={
                  <Glyph
                    name={disciplineGlyphs[d]}
                    size={28}
                    color={disciplines.includes(d) ? disciplineAccents[d] : palette.textDisabled}
                  />
                }
              />
            ))}
          </>
        ) : null}

        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
          Home area
        </Text>
        <Body>
          Used only to show mics near you. Never shown on your profile. Enter city and state, or a
          ZIP code.
        </Body>
        <View style={styles.areaRow}>
          <View style={styles.areaCity}>
            <Field
              label="City"
              value={homeCity}
              onChangeText={(v) => {
                setHomeCity(v);
                clearFieldError('homeArea');
              }}
              onBlur={areaOnBlur}
              placeholder="Seattle"
            />
          </View>
          <View style={styles.areaRegion}>
            <Field
              label="State"
              autoCapitalize="characters"
              value={homeRegion}
              onChangeText={(v) => {
                setHomeRegion(v);
                clearFieldError('homeArea');
              }}
              onBlur={areaOnBlur}
              placeholder="WA"
            />
          </View>
        </View>
        <Field
          label="Or ZIP code"
          inputMode="numeric"
          value={homeZip}
          onChangeText={(v) => {
            setHomeZip(v);
            clearFieldError('homeArea');
          }}
          onBlur={areaOnBlur}
          placeholder="98101"
        />
        {errors.homeArea ? <ErrorText>{errors.homeArea}</ErrorText> : null}

        <Text maxFontSizeMultiplier={maxFontScale} style={styles.sectionTitle}>
          Your links
        </Text>
        <Body>Optional. Paste a link or just type your username.</Body>
        <Field
          label="Instagram"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          value={instagram}
          onChangeText={(v) => {
            setInstagram(v);
            clearFieldError('instagram');
          }}
          onBlur={() => setFieldError('instagram', handleError(normalizeHandle(instagram)))}
          error={errors.instagram}
          placeholder="@yourname"
        />
        <Field
          label="TikTok"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          value={tiktok}
          onChangeText={(v) => {
            setTiktok(v);
            clearFieldError('tiktok');
          }}
          onBlur={() => setFieldError('tiktok', handleError(normalizeHandle(tiktok)))}
          error={errors.tiktok}
          placeholder="@yourname"
        />
        <Field
          label="YouTube"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          value={youtube}
          onChangeText={(v) => {
            setYoutube(v);
            clearFieldError('youtube');
          }}
          onBlur={() => setFieldError('youtube', urlError(normalizeUrl(youtube)))}
          error={errors.youtube}
          placeholder="youtube.com/@yourname"
        />
        <Field
          label="Spotify"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          value={spotify}
          onChangeText={(v) => {
            setSpotify(v);
            clearFieldError('spotify');
          }}
          onBlur={() => setFieldError('spotify', urlError(normalizeUrl(spotify)))}
          error={errors.spotify}
          placeholder="open.spotify.com/artist/..."
        />
        <Field
          label="Apple Music"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          value={appleMusic}
          onChangeText={(v) => {
            setAppleMusic(v);
            clearFieldError('appleMusic');
          }}
          onBlur={() => setFieldError('appleMusic', urlError(normalizeUrl(appleMusic)))}
          error={errors.appleMusic}
          placeholder="music.apple.com/..."
        />
        <Field
          label="Website"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          value={website}
          onChangeText={(v) => {
            setWebsite(v);
            clearFieldError('website');
          }}
          onBlur={() => setFieldError('website', urlError(normalizeUrl(website)))}
          error={errors.website}
          placeholder="yourname.com"
        />

        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          label="Save"
          busy={update.isPending || updateRoles.isPending}
          disabled={update.isPending || updateRoles.isPending}
          onPress={save}
        />
        {guardElement}
      </ScrollView>
    </KeyboardShift>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: palette.bg,
    flex: 1,
  },
  content: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  avatarWrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  changePhoto: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: type.body.fontSize,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
    marginTop: spacing.sm,
  },
  areaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  areaCity: {
    flex: 2,
  },
  areaRegion: {
    flex: 1,
  },
});
