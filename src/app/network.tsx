import { ScreenHeader } from '@/components/screen-header';
import { NetworkScreen } from '@/features/network/network-screen';

/**
 * Network lives under Profile rather than as a tab: it is checked when a
 * request arrives or after a night out, not every session, and the tab bar
 * stays within the 3 to 5 destinations the platforms expect. The Profile
 * tab carries the waiting-request badge so an ask is still seen.
 */
export default function NetworkRoute() {
  return (
    <>
      <ScreenHeader title="Network" />
      <NetworkScreen />
    </>
  );
}
