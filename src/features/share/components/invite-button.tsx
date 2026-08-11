import { useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useSession } from '@/features/auth/session';
import { sendAppInvite } from '@/features/share/invite';

/**
 * The one "invite friends" button, so the Profile tab, Settings, and the
 * Network screen all send the identical invitation and none of them
 * reimplements the platform fallbacks. Works signed out too: a guest who
 * loves the app is still an inviter.
 */

type Props = {
  label?: string;
  kind?: 'primary' | 'secondary';
};

export function InviteButton({ label = 'Invite friends', kind = 'secondary' }: Props) {
  const { session } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // A fast double tap can beat the disabling re-render; the ref cannot.
  const busyRef = useRef(false);

  function onPress() {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    sendAppInvite(session?.user.id ?? null)
      .then((outcome) => {
        if (outcome === 'copied') {
          toast.show('Invite copied. Paste it to whoever should be here.');
        }
      })
      .catch(() => {
        toast.show('Could not open the share sheet. Try again.');
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  }

  return <Button label={label} kind={kind} busy={busy} onPress={onPress} />;
}
