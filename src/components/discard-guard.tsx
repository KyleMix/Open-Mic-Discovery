import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ConfirmSheet } from '@/components/confirm-sheet';

type NavigationAction = { type: string };
type BeforeRemoveEvent = {
  preventDefault: () => void;
  data: { action: NavigationAction };
};
type GuardableNavigation = {
  addListener: (kind: 'beforeRemove', cb: (e: BeforeRemoveEvent) => void) => () => void;
  dispatch: (action: NavigationAction) => void;
};

type Options = {
  when: boolean;
  title: string;
  body: string;
  discardLabel: string;
};

/**
 * Blocks back navigation while a form holds unsaved input: the removal is
 * intercepted, a confirm sheet asks, and only an explicit Discard lets the
 * original navigation through. bypassGuard runs a navigation (a save's own
 * router.back, a create's replace) without triggering the question.
 */
export function useDiscardGuard({ when, title, body, discardLabel }: Options): {
  guardElement: ReactNode;
  bypassGuard: (navigate: () => void) => void;
} {
  // The vendored react-navigation in expo-router does not re-export
  // usePreventRemove; the beforeRemove event underneath it is stable.
  const navigation = useNavigation() as unknown as GuardableNavigation;
  const [pending, setPending] = useState<NavigationAction | null>(null);
  const bypass = useRef(false);

  useEffect(() => {
    if (!when) {
      return;
    }
    return navigation.addListener('beforeRemove', (e) => {
      if (bypass.current) {
        return;
      }
      e.preventDefault();
      setPending(e.data.action);
    });
  }, [navigation, when]);

  const guardElement = pending ? (
    <ConfirmSheet
      title={title}
      body={body}
      confirmLabel={discardLabel}
      onConfirm={() => {
        const action = pending;
        setPending(null);
        bypass.current = true;
        navigation.dispatch(action);
      }}
      onClose={() => setPending(null)}
    />
  ) : null;

  return {
    guardElement,
    bypassGuard: (navigate) => {
      bypass.current = true;
      navigate();
    },
  };
}
