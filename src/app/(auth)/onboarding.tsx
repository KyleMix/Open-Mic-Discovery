import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ageSignalError } from '@/features/auth/ageSignal';
import { completeOnboarding, signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/session';
import { validateBirthYear, validateDisplayName } from '@/features/auth/validation';
import { geocodeHomeArea } from '@/features/profile/geocode';
import { homeAreaError, homeAreaQuery, normalizeHomeArea } from '@/features/profile/home-area';
import { useOnboardingStore } from '@/stores/onboarding';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { spacing } from '@/theme';

export default function OnboardingScreen() {
  const router = useRouter();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const acceptedEulaVersion = useOnboardingStore((s) => s.acceptedEulaVersion);
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  const [stageName, setStageName] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [homeRegion, setHomeRegion] = useState('');
  const [homeZip, setHomeZip] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The accepted version lives in memory only, so a reload (OTA update,
  // memory pressure) or a direct deep link lands here without it. The EULA
  // screen is the one that can restock it; go there instead of failing the
  // submit with a message nothing on this screen can act on.
  useEffect(() => {
    if (session && !acceptedEulaVersion) {
      router.replace('/(auth)/eula');
    }
  }, [session, acceptedEulaVersion, router]);

  async function submit() {
    const area = normalizeHomeArea({ city: homeCity, region: homeRegion, postalCode: homeZip });
    const nextErrors = {
      stageName: validateDisplayName(stageName),
      homeArea: homeAreaError(area),
      birthYear: validateBirthYear(birthYear, new Date()),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }
    // Platform age signal, only when the AGE_SIGNAL_ENABLED flag is on.
    // An under-gate signal takes the same block path as the birth-year
    // check; nothing beyond this pass/fail is stored.
    const signalError = await ageSignalError();
    if (signalError) {
      setErrors({ ...nextErrors, birthYear: signalError });
      return;
    }
    if (!session || !acceptedEulaVersion) {
      setError('Your session expired. Sign out below, then sign in again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Best effort on device; discovery falls back to its default center
      // when the platform cannot geocode (web, odd inputs).
      const coords = await geocodeHomeArea(homeAreaQuery(area));
      await completeOnboarding({
        userId: session.user.id,
        stageName: stageName.trim(),
        // No private name is collected at signup; it starts as the stage name.
        displayName: stageName.trim(),
        homeCity: area.city || null,
        homeRegion: area.region || null,
        homePostalCode: area.postalCode || null,
        homeLat: coords?.lat ?? null,
        homeLng: coords?.lng ?? null,
        birthYear: Number(birthYear),
        // Everyone starts as a performer. Running a mic is opt-in from the My
        // Mics tab, which is where someone is when they want it.
        isPerformer: true,
        isProducer: false,
        disciplines: [],
        eulaVersion: acceptedEulaVersion,
      });
      resetOnboarding();
      await queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
      // The root gate moves to the tabs once the profile query refreshes.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish setup.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Title>What name goes on the list?</Title>
        <Body>
          This is your stage name: what hosts and other performers see when you sign up. Your
          email is never shown to anyone.
        </Body>
        <Field
          label="Stage name"
          value={stageName}
          onChangeText={(v) => {
            setStageName(v);
            setErrors((e) => ({ ...e, stageName: null }));
          }}
          onBlur={() => setErrors((e) => ({ ...e, stageName: validateDisplayName(stageName) }))}
          error={errors.stageName}
          placeholder="Demi Delta"
        />
        <Body>
          Where is home? We use this only to show mics near you. It is never shown on your profile
          or to anyone else.
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
        <Field
          label="Birth year"
          inputMode="numeric"
          value={birthYear}
          onChangeText={(v) => {
            setBirthYear(v);
            setErrors((e) => ({ ...e, birthYear: null }));
          }}
          onBlur={() =>
            setErrors((e) => ({ ...e, birthYear: validateBirthYear(birthYear, new Date()) }))
          }
          error={errors.birthYear}
          placeholder="1994"
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Finish setup" busy={busy} disabled={busy} onPress={submit} />
        <Button
          label="Not now: sign out"
          kind="secondary"
          onPress={() => {
            // The gate holds this screen until setup finishes, so leaving
            // needs a real way out rather than a trap, same as the EULA.
            signOut().catch(() => setError('Could not sign out. Check your connection.'));
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
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
