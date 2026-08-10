import { quotedIlikePattern } from './postgrest';

describe('quotedIlikePattern', () => {
  it('wraps the pattern so commas and parentheses cannot end the filter list', () => {
    expect(quotedIlikePattern("Joe's Bar, Seattle")).toBe('"%Joe\'s Bar, Seattle%"');
    expect(quotedIlikePattern('The Vault (Downtown)')).toBe('"%The Vault (Downtown)%"');
  });

  it('escapes embedded quotes and backslashes', () => {
    expect(quotedIlikePattern('say "hi"')).toBe('"%say \\"hi\\"%"');
    expect(quotedIlikePattern('back\\slash')).toBe('"%back\\\\slash%"');
  });
});
