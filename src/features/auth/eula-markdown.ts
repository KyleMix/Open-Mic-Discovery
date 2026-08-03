/**
 * The EULA is stored as markdown but was rendered as one raw text blob,
 * hash marks and all. This is a tiny renderer for the subset the document
 * actually uses: #, ##, bullet lists, paragraphs, and **bold** markers
 * (stripped, not styled).
 */
export type EulaBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'paragraph'; text: string };

function clean(text: string): string {
  return text.replaceAll('**', '').trim();
}

export function parseEulaMarkdown(md: string): EulaBlock[] {
  const blocks: EulaBlock[] = [];
  let paragraphBreak = true;
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      paragraphBreak = true;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', text: clean(line.slice(3)) });
    } else if (line.startsWith('# ')) {
      blocks.push({ kind: 'title', text: clean(line.slice(2)) });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ kind: 'bullet', text: clean(line.slice(2)) });
    } else {
      const last = blocks[blocks.length - 1];
      if (!paragraphBreak && last?.kind === 'paragraph') {
        last.text = `${last.text} ${clean(line)}`;
      } else {
        blocks.push({ kind: 'paragraph', text: clean(line) });
      }
      paragraphBreak = false;
      continue;
    }
    paragraphBreak = false;
  }
  return blocks;
}
