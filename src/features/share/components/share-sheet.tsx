import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Button, LoadingView } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useSession } from '@/features/auth/session';
import { useMicDetail } from '@/features/discovery/queries';
import { recordShareEvent, type ShareAction } from '@/features/share/analytics';
import { buildCardModel, type ShareCardMic } from '@/features/share/card-data';
import { shareCaption, type ShareIntent } from '@/features/share/captions';
import { ShareCard } from '@/features/share/components/share-card';
import { useMySignup } from '@/features/signups/queries';
import { fonts, maxFontScale, palette, radius, spacing, type } from '@/theme';

// Native-backed modules, loaded at use time only: statically importing
// them pulled them into Expo Router's server render, which crashed on a
// native base class that does not exist in Node. Nothing here runs before
// a person taps, so nothing needs them sooner.
const loadClipboard = () => import('expo-clipboard');
const loadMediaLibrary = () => import('expo-media-library');
const loadSharing = () => import('expo-sharing');
const loadViewShot = () => import('react-native-view-shot');


/**
 * The share bottom sheet, reachable from the mic page and from list cards.
 *
 * The card image is the product here: it is captured from a hidden
 * full-size ShareCard (540pt, so at least 1080 physical pixels on any 2x
 * device) and handed to the OS with the caption. Some targets keep only
 * one of the two, which is why the card repeats nothing it cannot afford
 * to lose and the caption stands alone as a sentence.
 *
 * Intent defaults follow the person: owners promote, booked performers
 * announce, everyone else shares a neutral invitation. The toggle only
 * offers "I'm performing" to someone actually on the lineup.
 */

type Props = {
  seriesId: string;
  open: boolean;
  onClose: () => void;
};

export function ShareSheet({ seriesId, open, onClose }: Props) {
  if (!open) {
    return null;
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* A sibling touch layer, not a wrapper: a backdrop button wrapping
            the sheet nests <button> inside <button> on web, which is invalid
            HTML and breaks hydration. Same shape as select.tsx. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the share sheet"
          style={styles.backdropTouch}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <SheetBody seriesId={seriesId} onClose={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** Capture size in points: 2x devices already reach 1080 physical pixels. */
const CAPTURE_SIZE = 540;
const PREVIEW_SIZE = 240;

type Busy = 'share' | 'copy' | 'save' | 'story' | null;

function SheetBody({ seriesId, onClose }: { seriesId: string; onClose: () => void }) {
  const detail = useMicDetail(seriesId);
  const { session } = useSession();
  const toast = useToast();
  const squareRef = useRef<View>(null);
  const storyRef = useRef<View>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // State alone cannot stop a fast double tap: the second press can land
  // before the disabling re-render does. The ref flips synchronously.
  const busyRef = useRef(false);
  const [chosen, setChosen] = useState<ShareIntent | null>(null);

  const series = detail.data?.series ?? null;
  const next = detail.data?.occurrences.find((o) => o.status !== 'cancelled') ?? null;
  const userId = session?.user.id;
  const my = useMySignup(next?.id, userId);
  const isOwner = !!series && !!userId && (series.owner_id ?? series.created_by) === userId;
  const onLineup = my.data?.status === 'confirmed' || my.data?.status === 'drawn';

  const defaultIntent: ShareIntent = isOwner ? 'producer' : onLineup ? 'performer' : 'neutral';
  const intent = chosen ?? defaultIntent;

  const opened = useRef(false);
  useEffect(() => {
    if (series && !opened.current) {
      opened.current = true;
      recordShareEvent({
        seriesId,
        occurrenceId: next?.id ?? null,
        profileId: userId ?? null,
        intent: defaultIntent,
        action: 'sheet_open',
      });
    }
  }, [series, seriesId, next?.id, userId, defaultIntent]);

  if (detail.isPending) {
    return <LoadingView label="Getting this mic ready to share" />;
  }
  if (detail.isError || !series) {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.heading} maxFontSizeMultiplier={maxFontScale}>
          Could not load this mic
        </Text>
        <Button label="Try again" onPress={() => detail.refetch()} />
        <Button label="Close" kind="secondary" onPress={onClose} />
      </View>
    );
  }

  const mic: ShareCardMic = {
    series_id: series.id,
    title: series.title,
    rrule: series.rrule,
    start_time: series.start_time,
    timezone: series.timezone,
    signup_method: series.signup_method,
    signup_closes: series.signup_closes,
    cost_cents: series.cost_cents,
    disciplines: series.disciplines,
    venue_name: series.venue?.name ?? null,
    neighborhood: series.venue?.neighborhood ?? null,
    city: series.venue?.city ?? null,
    next_starts_at: next?.starts_at ?? null,
    poster_url: series.poster_url,
  };
  const model = buildCardModel(mic);
  const caption = shareCaption(mic, intent, new Date());

  function record(action: ShareAction, channel?: string | null) {
    recordShareEvent({
      seriesId,
      occurrenceId: next?.id ?? null,
      profileId: userId ?? null,
      intent,
      action,
      channel,
    });
  }

  function switchIntent(to: ShareIntent) {
    if (to === intent) {
      return;
    }
    setChosen(to);
    record('intent_switch');
  }

  async function capture(variant: 'square' | 'story'): Promise<string> {
    const ref = variant === 'story' ? storyRef : squareRef;
    return loadViewShot().then(({ captureRef }) =>
      captureRef(ref, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: 1080,
        height: variant === 'story' ? 1920 : 1080,
      }),
    );
  }

  /**
   * One action at a time: a double tap must not queue a second render.
   * Runs only from press handlers, never during render, which is also what
   * keeps the ref reads legal under the compiler.
   */
  function runGuarded(kind: Exclude<Busy, null>, run: () => Promise<void>): void {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(kind);
    run()
      .catch(() => {
        toast.show('That did not go through. Try again.');
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(null);
      });
  }

  const doShare = () =>
    runGuarded('share', async () => {
      const uri = await capture('square');
      if (Platform.OS === 'ios') {
        // iOS takes both attachments and reports the destination when the
        // person completes the share.
        const result = await Share.share({ url: uri, message: caption });
        if (result.action === Share.sharedAction) {
          record('share_completed', result.activityType ?? null);
        }
      } else {
        // Android's share intent drops text on most image targets, so the
        // caption rides the clipboard instead of getting silently lost.
        await (await loadClipboard()).setStringAsync(caption);
        toast.show('Caption copied. Paste it wherever the image lands.');
        await (await loadSharing()).shareAsync(uri, { mimeType: 'image/png', dialogTitle: series.title });
        // Best effort: Android does not say whether the person completed it.
        record('share_completed', null);
      }
    });

  const doCopy = () =>
    runGuarded('copy', async () => {
      await (await loadClipboard()).setStringAsync(caption);
      toast.show('Caption copied.');
      record('copy_caption');
    });

  const doSave = () =>
    runGuarded('save', async () => {
      const MediaLibrary = await loadMediaLibrary();
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        toast.show('Open Settings to let the app save images.');
        return;
      }
      const uri = await capture('square');
      await MediaLibrary.saveToLibraryAsync(uri);
      toast.show('Saved to your photos.');
      record('save_image');
    });

  const doStory = () =>
    runGuarded('story', async () => {
      const uri = await capture('story');
      if (Platform.OS === 'ios') {
        await Share.share({ url: uri });
      } else {
        await (await loadSharing()).shareAsync(uri, { mimeType: 'image/png', dialogTitle: series.title });
      }
      record('story_share');
    });

  return (
    <View style={styles.body}>
      <Text style={styles.heading} maxFontSizeMultiplier={maxFontScale}>
        Share this mic
      </Text>

      <View style={styles.previewRow}>
        <ShareCard model={model} variant="square" size={PREVIEW_SIZE} />
      </View>

      {onLineup || isOwner ? (
        <View style={styles.toggleRow}>
          {onLineup ? (
            <IntentTab
              label="I'm performing"
              active={intent === 'performer'}
              onPress={() => switchIntent('performer')}
            />
          ) : null}
          <IntentTab
            label="Promote this mic"
            active={intent !== 'performer'}
            onPress={() => switchIntent(isOwner ? 'producer' : 'neutral')}
          />
        </View>
      ) : null}

      <Text style={styles.caption} numberOfLines={4} maxFontSizeMultiplier={maxFontScale}>
        {caption}
      </Text>

      <Button label="Share" onPress={doShare} busy={busy === 'share'} disabled={!!busy} />
      <View style={styles.secondaryRow}>
        <View style={styles.secondaryButton}>
          <Button
            label="Copy caption"
            kind="secondary"
            onPress={doCopy}
            busy={busy === 'copy'}
            disabled={!!busy}
          />
        </View>
        <View style={styles.secondaryButton}>
          <Button
            label="Save image"
            kind="secondary"
            onPress={doSave}
            busy={busy === 'save'}
            disabled={!!busy}
          />
        </View>
      </View>
      <Button
        label="Story size (9:16)"
        kind="secondary"
        onPress={doStory}
        busy={busy === 'story'}
        disabled={!!busy}
      />

      {/* Capture targets: mounted, full size, parked off screen. Capturing
          the small preview instead would upscale and soften the export. */}
      <View style={styles.captureFarm} pointerEvents="none">
        <View ref={squareRef} collapsable={false}>
          <ShareCard model={model} variant="square" size={CAPTURE_SIZE} />
        </View>
        <View ref={storyRef} collapsable={false}>
          <ShareCard model={model} variant="story" size={CAPTURE_SIZE} />
        </View>
      </View>
    </View>
  );
}

function IntentTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text
        style={[styles.tabLabel, active && styles.tabLabelActive]}
        maxFontSizeMultiplier={maxFontScale}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: palette.scrim,
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: palette.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  body: {
    gap: spacing.sm,
  },
  stateWrap: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  heading: {
    color: palette.text,
    fontFamily: fonts.semibold,
    fontSize: type.heading.fontSize,
  },
  previewRow: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tab: {
    borderColor: palette.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabActive: {
    backgroundColor: palette.bgPressed,
    borderColor: palette.brand,
  },
  tabLabel: {
    color: palette.textSecondary,
    fontFamily: fonts.medium,
    fontSize: type.caption.fontSize,
  },
  tabLabelActive: {
    color: palette.text,
  },
  caption: {
    color: palette.textSecondary,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
  },
  captureFarm: {
    left: -10000,
    position: 'absolute',
    top: 0,
  },
});
