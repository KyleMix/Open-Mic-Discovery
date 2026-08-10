import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, maxFontScale, minTouchTarget, palette, radius, spacing, type } from '@/theme';

type ToastAction = { label: string; onPress: () => void };
type ToastState = { message: string; action?: ToastAction } | null;
type ToastApi = { show: (message: string, action?: ToastAction) => void };

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Success feedback that mutations previously gave silently (a star flip,
 * a chip changing color). One accessible primitive: shows for a few
 * seconds, announces to screen readers, and can carry a single action
 * such as Undo. Safe without a provider: show() becomes a no-op, so
 * hooks that toast still work in tests and isolated renders.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  return useMemo(() => api ?? { show: () => undefined }, [api]);
}

const TOAST_MS = 4000;
// With an action attached (Undo), the timer must be long enough to read,
// decide, and reach the button: 8 seconds, above the 7-second floor.
const TOAST_ACTION_MS = 8000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, action?: ToastAction) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    // One toast at a time: a new message replaces the old outright.
    setToast({ message, action });
    AccessibilityInfo.announceForAccessibility(message);
    timer.current = setTimeout(() => setToast(null), action ? TOAST_ACTION_MS : TOAST_MS);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastBar toast={toast} onDone={() => setToast(null)} /> : null}
    </ToastContext.Provider>
  );
}

function ToastBar({ toast, onDone }: { toast: NonNullable<ToastState>; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + spacing.xl + minTouchTarget }]}
    >
      <View style={styles.bar} accessibilityLiveRegion="polite">
        <Text maxFontSizeMultiplier={maxFontScale} style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            onPress={() => {
              toast.action?.onPress();
              onDone();
            }}
            style={styles.action}
          >
            <Text maxFontSizeMultiplier={maxFontScale} style={styles.actionLabel}>
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          onPress={onDone}
          style={styles.action}
        >
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.dismissLabel}>
            ✕
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  bar: {
    alignItems: 'center',
    backgroundColor: palette.bgPressed,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    maxWidth: 480,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  message: {
    color: palette.text,
    flexShrink: 1,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
  },
  actionLabel: {
    color: palette.warning,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
  },
  dismissLabel: {
    color: palette.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: type.body.fontSize,
  },
});
