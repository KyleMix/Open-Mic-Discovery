import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Universal Links (iOS) and App Links (Android) for mic detail pages.
 * https://openmicfinder.app/mic/<id> must open the app's mic screen from a
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
    expect(appJson.expo.ios.associatedDomains).toContain('applinks:openmicfinder.app');
  });

  it('declares a verified Android intent filter for mic pages', () => {
    const filter = appJson.expo.android.intentFilters?.find((f) =>
      f.data.some((d) => d.host === 'openmicfinder.app'),
    );
    expect(filter).toBeDefined();
    expect(filter?.autoVerify).toBe(true);
    expect(filter?.action).toBe('VIEW');
    expect(filter?.category).toEqual(expect.arrayContaining(['BROWSABLE', 'DEFAULT']));
    expect(filter?.data).toContainEqual({
      scheme: 'https',
      host: 'openmicfinder.app',
      pathPrefix: '/mic/',
    });
  });

  it('has an Expo Router route for /mic/[id], so cold starts resolve', () => {
    expect(existsSync(join(root, 'src', 'app', 'mic', '[id].tsx'))).toBe(true);
  });

  it('serves an apple-app-site-association covering /mic/*', () => {
    const detail = aasa.applinks.details[0];
    expect(detail.appIDs[0].endsWith('.com.openmicexplorer.app')).toBe(true);
    expect(detail.components.some((c) => c['/'] === '/mic/*')).toBe(true);
  });

  it('serves an assetlinks.json for the Android package', () => {
    expect(assetLinks[0].relation).toContain('delegate_permission/common.handle_all_urls');
    expect(assetLinks[0].target.package_name).toBe(appJson.expo.android.package);
    expect(assetLinks[0].target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
  });
});
