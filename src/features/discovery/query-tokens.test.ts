import { parseQueryTokens, tokenLabel } from './query-tokens';

describe('parseQueryTokens', () => {
  it('strips "tonight" and keeps the rest as text', () => {
    expect(parseQueryTokens('open mic tonight')).toEqual({
      text: 'open mic',
      tokens: [{ kind: 'when', when: 'tonight' }],
    });
  });

  it('treats "today" as tonight', () => {
    expect(parseQueryTokens('comedy today').tokens).toEqual([{ kind: 'when', when: 'tonight' }]);
  });

  it('converts "free 21+" into two chips and no text', () => {
    expect(parseQueryTokens('free 21+')).toEqual({
      text: '',
      tokens: [{ kind: 'free' }, { kind: 'age', age: 'twenty_one_plus' }],
    });
  });

  it('parses a weekday name into a day token', () => {
    expect(parseQueryTokens('tuesday')).toEqual({
      text: '',
      tokens: [{ kind: 'day', day: 2 }],
    });
  });

  it('prefers "this weekend" over the bare word inside it', () => {
    expect(parseQueryTokens('poetry this weekend')).toEqual({
      text: 'poetry',
      tokens: [{ kind: 'when', when: 'weekend' }],
    });
  });

  it('does not read "this week" out of "this weekend"', () => {
    expect(parseQueryTokens('this weekend').tokens).toEqual([{ kind: 'when', when: 'weekend' }]);
  });

  it('parses "near me" and "all ages" phrases', () => {
    expect(parseQueryTokens('all ages music near me')).toEqual({
      text: 'music',
      tokens: [{ kind: 'nearMe' }, { kind: 'age', age: 'all_ages' }],
    });
  });

  it('is case-insensitive', () => {
    expect(parseQueryTokens('Open Mic TONIGHT').tokens).toEqual([
      { kind: 'when', when: 'tonight' },
    ]);
  });

  it('leaves partial and embedded words alone', () => {
    // "freehouse" contains free, "saturdays" contains saturday with a
    // trailing s: neither is an exact token, so both stay text.
    expect(parseQueryTokens('freehouse saturdays')).toEqual({
      text: 'freehouse saturdays',
      tokens: [],
    });
  });

  it('leaves 21+ alone when glued to other text', () => {
    expect(parseQueryTokens('21+only')).toEqual({ text: '21+only', tokens: [] });
  });

  it('dedupes a token typed twice', () => {
    expect(parseQueryTokens('free free comedy').tokens).toEqual([{ kind: 'free' }]);
  });

  it('returns everything unchanged when nothing matches', () => {
    expect(parseQueryTokens('capitol theater')).toEqual({
      text: 'capitol theater',
      tokens: [],
    });
  });

  it('collapses leftover whitespace', () => {
    expect(parseQueryTokens('  open   mic   tonight  ').text).toBe('open mic');
  });
});

describe('tokenLabel', () => {
  it('labels every token kind', () => {
    expect(tokenLabel({ kind: 'when', when: 'tonight' })).toBe('Tonight');
    expect(tokenLabel({ kind: 'when', when: 'tomorrow' })).toBe('Tomorrow');
    expect(tokenLabel({ kind: 'when', when: 'week' })).toBe('This week');
    expect(tokenLabel({ kind: 'when', when: 'weekend' })).toBe('This weekend');
    expect(tokenLabel({ kind: 'day', day: 2 })).toBe('Tuesday');
    expect(tokenLabel({ kind: 'free' })).toBe('Free');
    expect(tokenLabel({ kind: 'age', age: 'eighteen_plus' })).toBe('18+');
    expect(tokenLabel({ kind: 'age', age: 'all_ages' })).toBe('All ages');
    expect(tokenLabel({ kind: 'nearMe' })).toBe('Near me');
  });
});
