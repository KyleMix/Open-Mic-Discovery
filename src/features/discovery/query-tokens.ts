/**
 * A small, closed set of temporal and qualifier tokens that can be typed
 * into the search box: "open mic tonight" should behave like typing "open
 * mic" with the Tonight chip on. Each stripped token becomes a visible
 * chip the person can dismiss, so results never change for an invisible
 * reason.
 *
 * Deliberately rule based and deliberately small. Full weekday names
 * only, no abbreviations ("sat" is a word people type for other
 * reasons), no general date parsing, and nothing ambiguous: a token that
 * is not an exact match stays in the text query.
 */

export type WhenFilter = 'tonight' | 'tomorrow' | 'week' | 'weekend';

export type QueryToken =
  | { kind: 'when'; when: WhenFilter }
  | { kind: 'day'; day: number } // ISO weekday, 1 Monday .. 7 Sunday
  | { kind: 'free' }
  | { kind: 'age'; age: 'all_ages' | 'eighteen_plus' | 'twenty_one_plus' }
  | { kind: 'nearMe' };

export type ParsedQuery = {
  /** What is left for the text search after tokens are stripped. */
  text: string;
  tokens: QueryToken[];
};

type Rule = { pattern: RegExp; token: QueryToken };

const DAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

// Phrases before words so "this weekend" is never consumed as "weekend"
// plus a stray "this". The age patterns end on a lookahead because \b
// does not follow a "+".
const RULES: Rule[] = [
  { pattern: /\bthis weekend\b/i, token: { kind: 'when', when: 'weekend' } },
  { pattern: /\bthis week\b/i, token: { kind: 'when', when: 'week' } },
  { pattern: /\bnear me\b/i, token: { kind: 'nearMe' } },
  { pattern: /\ball ages\b/i, token: { kind: 'age', age: 'all_ages' } },
  { pattern: /\btonight\b/i, token: { kind: 'when', when: 'tonight' } },
  { pattern: /\btoday\b/i, token: { kind: 'when', when: 'tonight' } },
  { pattern: /\btomorrow\b/i, token: { kind: 'when', when: 'tomorrow' } },
  { pattern: /\bweekend\b/i, token: { kind: 'when', when: 'weekend' } },
  { pattern: /\bfree\b/i, token: { kind: 'free' } },
  { pattern: /\b18\+(?=\s|$)/i, token: { kind: 'age', age: 'eighteen_plus' } },
  { pattern: /\b21\+(?=\s|$)/i, token: { kind: 'age', age: 'twenty_one_plus' } },
  ...DAY_NAMES.map((name, i) => ({
    pattern: new RegExp(`\\b${name}\\b`, 'i'),
    token: { kind: 'day', day: i + 1 } as QueryToken,
  })),
];

function sameToken(a: QueryToken, b: QueryToken): boolean {
  return (
    a.kind === b.kind &&
    (a.kind !== 'when' || a.when === (b as { when: WhenFilter }).when) &&
    (a.kind !== 'day' || a.day === (b as { day: number }).day) &&
    (a.kind !== 'age' || a.age === (b as { age: string }).age)
  );
}

export function parseQueryTokens(raw: string): ParsedQuery {
  let text = raw;
  const tokens: QueryToken[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      text = text.replace(rule.pattern, ' ');
      if (!tokens.some((t) => sameToken(t, rule.token))) {
        tokens.push(rule.token);
      }
    }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), tokens };
}

/** The label a stripped token's chip shows, so the person can undo it. */
export function tokenLabel(token: QueryToken): string {
  switch (token.kind) {
    case 'when':
      return token.when === 'tonight'
        ? 'Tonight'
        : token.when === 'tomorrow'
          ? 'Tomorrow'
          : token.when === 'week'
            ? 'This week'
            : 'This weekend';
    case 'day': {
      const name = DAY_NAMES[token.day - 1];
      // Day tokens are only minted from the rule table, so the index is
      // always 1 to 7; the fallback keeps the chip readable if that ever
      // stops being true.
      if (!name) {
        return `Day ${token.day}`;
      }
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    case 'free':
      return 'Free';
    case 'age':
      return token.age === 'all_ages' ? 'All ages' : token.age === 'eighteen_plus' ? '18+' : '21+';
    case 'nearMe':
      return 'Near me';
  }
}
