import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Universal Links (iOS) and App Links (Android) for mic detail pages.
 * https://www.stonedgooseproductions.com/open-mics/mic/<id> must open the app's mic screen from a
 * cold start, so the store configs, the router route, and the well-known
 * files have to stay in agreement. Manual verification procedure:
 * docs/DEPLOY_WEB.md.
 */

// Jest runs from the repo root; this test only reads repo files.
const root = process.cwd();
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as {
  expo: {
    ios: { associatedDomains?: string[]; bundleIdentifier: string };
    android: {
      package: string;
      intentFilters?: {
        action: string;
        autoVerify?: boolean;
        data: { scheme: string; host: string; pathPrefix?: string }[];
        category: string[];
      }[];
    };
  };
};
const aasa = JSON.parse(
  readFileSync(join(root, 'web', '.well-known', 'apple-app-site-association'), 'utf8'),
) as {
  applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] };
};
const assetLinks = JSON.parse(
  readFileSync(join(root, 'web', '.well-known', 'assetlinks.json'), 'utf8'),
) as {
  relation: string[];
  target: { package_name: string; sha256_cert_fingerprints: string[] };
}[];

describe('deep link configuration', () => {
  it('declares the iOS associated domain', () => {
    expect(appJson.expo.ios.associatedDomains).toContain('applinks:www.stonedgooseproductions.com');
  });

  it('declares a verified Android intent filter for mic pages', () => {
    const filter = appJson.expo.android.intentFilters?.find((f) =>
      f.data.some((d) => d.host === 'www.stonedgooseproductions.com'),
    );
    expect(filter).toBeDefined();
    expect(filter?.autoVerify).toBe(true);
    expect(filter?.action).toBe('VIEW');
    expect(filter?.category).toEqual(expect.arrayContaining(['BROWSABLE', 'DEFAULT']));
    expect(filter?.data).toContainEqual({
      scheme: 'https',
      host: 'www.stonedgooseproductions.com',
      pathPrefix: '/open-mics/mic/',
    });
  });

  it('has an Expo Router route for /mic/[id], so cold starts resolve', () => {
    expect(existsSync(join(root, 'src', 'app', 'mic', '[id].tsx'))).toBe(true);
  });

  it('serves an apple-app-site-association covering /open-mics/mic/*', () => {
    const detail = aasa.applinks.details[0];
    if (!detail) {
      throw new Error('apple-app-site-association has no applinks details');
    }
    expect(detail.appIDs[0]?.endsWith('.com.openmicexplorer.app')).toBe(true);
    expect(detail.components.some((c) => c['/'] === '/open-mics/mic/*')).toBe(true);
  });

  it('serves an assetlinks.json for the Android package', () => {
    const link = assetLinks[0];
    if (!link) {
      throw new Error('assetlinks.json is empty');
    }
    expect(link.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(link.target.package_name).toBe(appJson.expo.android.package);
    expect(link.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
  });

  // The association files ship with TODO placeholders until the owner has
  // the Apple Team ID and Play signing fingerprint (docs/DEPLOY_WEB.md).
  // The suite used to pass silently on the placeholders, which read as
  // "universal links verified" when every shared link was falling back to
  // the web. This warns loudly while they remain, and once real values
  // land it starts asserting their format so a typo cannot pass either.
  it('does not mistake the deploy placeholders for working universal links', () => {
    const appId = aasa.applinks.details[0]?.appIDs[0] ?? '';
    const prints = assetLinks[0]?.target.sha256_cert_fingerprints ?? [];
    const placeholders = [
      appId.startsWith('TODO') ? 'apple-app-site-association TODO_TEAM_ID' : null,
      prints.some((f) => f.startsWith('TODO')) ? 'assetlinks.json TODO fingerprint' : null,
    ].filter(Boolean);
    if (placeholders.length > 0) {
      console.warn(
        `Universal links are DEAD until these deploy with real values: ${placeholders.join(
          ', ',
        )}. See docs/DEPLOY_WEB.md.`,
      );
    }
    if (!appId.startsWith('TODO')) {
      expect(appId).toMatch(/^[A-Z0-9]{10}\.com\.openmicexplorer\.app$/);
    }
    for (const f of prints.filter((x) => !x.startsWith('TODO'))) {
      expect(f).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
  });
});
