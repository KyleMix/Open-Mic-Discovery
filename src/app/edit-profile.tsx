import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorText, Field, LoadingView, Title } from '@/components/ui';
import { validateDisplayName } from '@/features/auth/validation';
import { useOwnProfile } from '@/features/auth/queries';
import { useSession } from '@/features/auth/session';
import { AvatarCircle } from '@/features/profile/avatar-circle';
import { pickAndUploadAvatar } from '@/features/profile/avatar';
import { geocodeHomeArea } from '@/features/profile/geocode';
import { homeAreaError, homeAreaQuery, normalizeHomeArea } from '@/features/profile/home-area';
import { useUpdateProfile } from '@/features/profile/queries';
import {
  handleError,
  normalizeHandle,
  normalizeUrl,
  urlError,
} from '@/features/profile/social';
import { fonts, palette, spacing, type } from '@/theme';

export default function EditProfileScreen() {
  const { session } = useSession();
  const profile = useOwnProfile(session?.user.id);

  if (profile.isPending) {
    return <LoadingView label="Loading your profile" />;
  }
  if (profile.isError || !profile.data) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ScreenHeader />
        <Title>Edit profile</Title>
        <ErrorText>Could not load your profile. Check your connection.</ErrorText>
        <Button label="Try again" onPress={() => profile.refetch()} />
      </ScrollView>
    );
  }
  return <EditProfileForm profile={profile.data} userId={session!.user.id} />;
}

function ScreenHeader() {
  return (
    <Stack.Screen
      options={{
        headerShown: true,
        title: 'Edit profile',
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.text,
      }}
    />
  );
}

type ProfileRow = NonNullable<ReturnType<typeof useOwnProfile>['data']>;

function EditProfileForm({ profile, userId }: { profile: ProfileRow; userId: string }) {
  const router = useRouter();
  const update = useUpdateProfile(userId);

  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [homeCity, setHomeCity] = useState(profile.home_city ?? '');
  const [homeRegion, setHomeRegion] = useState(profile.home_region ?? '');
  const [homeZip, setHomeZip] = useState(profile.home_postal_code ?? '');
  const [instagram, setInstagram] = useState(profile.link_instagram ?? '');
  const [tiktok, setTiktok] = useState(profile.link_tiktok ?? '');
  const [youtube, setYoutube] = useState(profile.link_youtube ?? '');
  const [website, setWebsite] = useState(profile.link_website ?? '');

  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const nextErrors = {
      displayName: validateDisplayName(displayName),
      homeArea: homeAreaError(area),
      instagram: handleError(ig),
      tiktok: handleError(tt),
      youtube: urlError(yt),
      website: urlError(web),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }
    setError(null);
    try {
      // Re-geocode only when the area actually changed, so a failed lookup
      // never wipes coordinates that were already good.
      const areaChanged =
        area.city !== (profile.home_city ?? '') ||
        area.region !== (profile.home_region ?? '') ||
        area.postalCode !== (profile.home_postal_code ?? '');
      const coords = areaChanged ? await geocodeHomeArea(homeAreaQuery(area)) : null;
      await update.mutateAsync({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        home_city: area.city || null,
        home_region: area.region || null,
        home_postal_code: area.postalCode || null,
        ...(areaChanged
          ? { home_lat: coords?.lat ?? null, home_lng: coords?.lng ?? null }
          : {}),
        link_instagram: ig || null,
        link_tiktok: tt || null,
        link_youtube: yt || null,
        link_website: web || null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change your photo"
        onPress={changePhoto}
        disabled={photoBusy}
        style={styles.avatarWrap}
      >
        <AvatarCircle url={avatarUrl} name={displayName} size={96} />
        <Text style={styles.changePhoto}>{photoBusy ? 'Uploading...' : 'Change photo'}</Text>
      </Pressable>

      <Field
        label="Name"
        value={displayName}
        onChangeText={setDisplayName}
        error={errors.displayName}
      />
      <Field
        label="About you (optional)"
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={3}
        placeholder="What you play, your style, anything you want people to know."
      />
      <Text style={styles.sectionTitle}>Home area</Text>
      <Body>
        Used only to show mics near you. Never shown on your profile. Enter city and state, or
        a ZIP code.
      </Body>
      <View style={styles.areaRow}>
        <View style={styles.areaCity}>
          <Field label="City" value={homeCity} onChangeText={setHomeCity} placeholder="Seattle" />
        </View>
        <View style={styles.areaRegion}>
          <Field
            label="State"
            autoCapitalize="characters"
            value={homeRegion}
            onChangeText={setHomeRegion}
            placeholder="WA"
          />
        </View>
      </View>
      <Field
        label="Or ZIP code"
        inputMode="numeric"
        value={homeZip}
        onChangeText={setHomeZip}
        placeholder="98101"
      />
      {errors.homeArea ? <ErrorText>{errors.homeArea}</ErrorText> : null}

      <Text style={styles.sectionTitle}>Your links</Text>
      <Body>Optional. Paste a link or just type your username.</Body>
      <Field
        label="Instagram"
        autoCapitalize="none"
        autoCorrect={false}
        value={instagram}
        onChangeText={setInstagram}
        error={errors.instagram}
        placeholder="@yourname"
      />
      <Field
        label="TikTok"
        autoCapitalize="none"
        autoCorrect={false}
        value={tiktok}
        onChangeText={setTiktok}
        error={errors.tiktok}
        placeholder="@yourname"
      />
      <Field
        label="YouTube"
        autoCapitalize="none"
        autoCorrect={false}
        value={youtube}
        onChangeText={setYoutube}
        error={errors.youtube}
        placeholder="youtube.com/@yourname"
      />
      <Field
        label="Website"
        autoCapitalize="none"
        autoCorrect={false}
        value={website}
        onChangeText={setWebsite}
        error={errors.website}
        placeholder="yourname.com"
      />

      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Save" busy={update.isPending} disabled={update.isPending} onPress={save} />
    </ScrollView>
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
