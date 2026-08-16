import { getConfigError } from './env';

describe('getConfigError', () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = url;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  });

  it('accepts a well formed http or https url with an anon key', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    expect(getConfigError()).toBeNull();

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    expect(getConfigError()).toBeNull();
  });

  it('reports a missing url', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    expect(getConfigError()).toMatch(/EXPO_PUBLIC_SUPABASE_URL is missing/);
  });

  it('rejects a url that survived shell quoting, the CI failure this guards', () => {
    // `supabase status -o env` prints API_URL="http://127.0.0.1:54321"; a
    // leading quote baked into the build fails supabase-js validation. The
    // guard must catch it rather than let createClient throw in the tree.
    process.env.EXPO_PUBLIC_SUPABASE_URL = '"http://127.0.0.1:54321"';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    expect(getConfigError()).toMatch(/not a valid HTTP or HTTPS URL/);
  });

  it('rejects a url with the wrong scheme', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'ftp://example.com';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    expect(getConfigError()).toMatch(/not a valid HTTP or HTTPS URL/);
  });

  it('reports a missing anon key once the url is valid', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(getConfigError()).toMatch(/EXPO_PUBLIC_SUPABASE_ANON_KEY is missing/);
  });
});
