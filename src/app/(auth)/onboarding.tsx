import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { completeOnboarding } from '@/features/auth/api';
import { useSession } from '@/features/auth/session';
import {
  validateBirthYear,
  validateDisplayName,
  validateHandle,
  validateRoles,
} from '@/features/auth/validation';
import { useOnboardingStore } from '@/stores/onboarding';
import { Body, Button, ErrorText, Field, Screen, Title, ToggleRow } from '@/components/ui';
import { spacing, type Discipline } from '@/theme';

const DISCIPLINES: Discipline[] = ['music', 'comedy', 'poetry', 'other'];

export default function OnboardingScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const acceptedEulaVersion = useOnboardingStore((s) => s.acceptedEulaVersion);
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [isPerformer, setIsPerformer] = useState(false);
  const [isProducer, setIsProducer] = useState(false);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDiscipline = (d: Discipline) => {
    setDisciplines((current) =>
      current.includes(d) ? current.filter((x) => x !== d) : [...current, d],
    );
  };

  async function submit() {
    const nextErrors = {
      handle: validateHandle(handle),
      displayName: validateDisplayName(displayName),
      birthYear: validateBirthYear(birthYear, new Date()),
      roles: validateRoles(isPerformer, isProducer),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }
    if (!session || !acceptedEulaVersion) {
      setError('Session expired. Sign in again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding({
        userId: session.user.id,
        handle,
        displayName: displayName.trim(),
        homeCity: homeCity.trim() || null,
        birthYear: Number(birthYear),
        isPerformer,
        isProducer,
        disciplines: isPerformer && disciplines.length > 0 ? disciplines : [],
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Title>Who are you out there?</Title>
        <Body>Pick everything that applies. Most people in a scene end up doing both.</Body>
        <ToggleRow
          label="Performer"
          description="Find mics, sign up for slots, track where you have played."
          value={isPerformer}
          onToggle={setIsPerformer}
        />
        <ToggleRow
          label="Producer"
          description="Run listings, manage signup lists, post lineups."
          value={isProducer}
          onToggle={setIsProducer}
        />
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
                onToggle={() => toggleDiscipline(d)}
              />
            ))}
          </>
        ) : null}
        <Field
          label="Handle"
          autoCapitalize="none"
          value={handle}
          onChangeText={(v) => setHandle(v.toLowerCase())}
          error={errors.handle}
          placeholder="lowercase letters, numbers, underscores"
        />
        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          error={errors.displayName}
        />
        <Field
          label="Home city (optional)"
          value={homeCity}
          onChangeText={setHomeCity}
          placeholder="Seattle"
        />
        <Field
          label="Birth year"
          inputMode="numeric"
          value={birthYear}
          onChangeText={setBirthYear}
          error={errors.birthYear}
          placeholder="1994"
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Finish setup" busy={busy} disabled={busy} onPress={submit} />
      </ScrollView>
    </Screen>
  );
}

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

const styles = StyleSheet.create({
  scroll: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
});
