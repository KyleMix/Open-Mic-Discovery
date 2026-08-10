/**
 * Quoting for values interpolated into a PostgREST .or() filter string.
 *
 * The filter list is comma-separated and grouped with parentheses, so a
 * search term containing either ("Joe's Bar, Seattle", "The Vault
 * (Downtown)") terminated the list early and the whole request came back
 * 400. PostgREST accepts a double-quoted value with backslash escapes for
 * embedded quotes and backslashes, which keeps every printable character
 * searchable.
 */
export function quotedIlikePattern(term: string): string {
  return `"%${term.replace(/([\\"])/g, '\\$1')}%"`;
}
