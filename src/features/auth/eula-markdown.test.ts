import { parseEulaMarkdown } from './eula-markdown';

describe('parseEulaMarkdown', () => {
  it('splits titles, headings, bullets, and paragraphs', () => {
    const md = [
      '# Open Mic Finder End User License Agreement',
      '',
      '## 1. What this app is',
      'A directory of open mics.',
      'Listings are community maintained.',
      '- No harassment',
      '- No spam',
    ].join('\n');
    expect(parseEulaMarkdown(md)).toEqual([
      { kind: 'title', text: 'Open Mic Finder End User License Agreement' },
      { kind: 'heading', text: '1. What this app is' },
      {
        kind: 'paragraph',
        text: 'A directory of open mics. Listings are community maintained.',
      },
      { kind: 'bullet', text: 'No harassment' },
      { kind: 'bullet', text: 'No spam' },
    ]);
  });

  it('strips bold markers and blank lines', () => {
    expect(parseEulaMarkdown('This is **important** text.\n\n\nNext paragraph.')).toEqual([
      { kind: 'paragraph', text: 'This is important text.' },
      { kind: 'paragraph', text: 'Next paragraph.' },
    ]);
  });
});
