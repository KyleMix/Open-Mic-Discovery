import * as WebBrowser from 'expo-web-browser';

/**
 * The hosted privacy policy and terms URLs.
 *
 * Currently unmounted: these pages do not exist on the domain yet, so
 * Settings points at the in-app /privacy and /terms screens instead
 * (docs/UX_FINDINGS.md, H3). Re-link these once the owner hosts the pages;
 * they open in the in-app browser, never an external tab.
 */
export const LEGAL_LINKS = {
  privacyPolicy: { label: 'Privacy Policy', url: 'https://openmicfinder.app/privacy' },
  termsOfUse: { label: 'Terms of Use (EULA)', url: 'https://openmicfinder.app/terms' },
} as const;

async function defaultProbe(url: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, { method: 'HEAD', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Opens a legal page in the in-app browser. Probes connectivity first so an
 * offline tap gets a friendly inline message instead of a dead browser page.
 * Returns null on success, or the error message to show.
 */
export async function openLegalLink(
  url: string,
  open: (target: string) => Promise<unknown> = (target) => WebBrowser.openBrowserAsync(target),
  probe: (target: string) => Promise<void> = defaultProbe,
): Promise<string | null> {
  try {
    await probe(url);
  } catch {
    return 'That page needs a connection. Check your network and try again.';
  }
  try {
    await open(url);
    return null;
  } catch {
    return 'Could not open the page. Try again.';
  }
}
