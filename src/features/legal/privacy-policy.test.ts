import { parseEulaMarkdown } from '@/features/auth/eula-markdown';
import { SUPPORT_EMAIL } from '@/lib/support';

import { PRIVACY_POLICY_MD } from './privacy-policy';

describe('privacy policy content', () => {
  it('contains no em dashes (standing copy rule)', () => {
    expect(PRIVACY_POLICY_MD).not.toContain('—');
  });

  it('parses into a titled document with headings and bullets', () => {
    const blocks = parseEulaMarkdown(PRIVACY_POLICY_MD);
    expect(blocks[0]).toEqual({ kind: 'title', text: 'Privacy policy' });
    expect(blocks.some((b) => b.kind === 'heading')).toBe(true);
    expect(blocks.some((b) => b.kind === 'bullet')).toBe(true);
  });

  it('names the support contact so the contact section is never a dead end', () => {
    expect(PRIVACY_POLICY_MD).toContain(SUPPORT_EMAIL);
  });

  it('covers the declarations the store forms are answered from', () => {
    for (const required of [
      'Home area',
      'background location',
      'RevenueCat',
      'Sentry',
      'Supabase',
      'Delete account',
      'never sell',
    ]) {
      expect(PRIVACY_POLICY_MD).toContain(required);
    }
  });
});
