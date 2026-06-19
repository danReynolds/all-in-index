export const MAX_PUBLISHED_QUOTE_CHARS = 240;

export function trimPublishedQuote(quote: string): string {
  const clean = quote.trim();
  if (clean.length <= MAX_PUBLISHED_QUOTE_CHARS) return clean;
  const slice = clean.slice(0, MAX_PUBLISHED_QUOTE_CHARS);
  const boundary = slice.search(/\s+\S*$/);
  return (boundary > 160 ? slice.slice(0, boundary) : slice).trim();
}

/** Lowercase, strip punctuation/quotes, collapse whitespace — for verbatim matching. */
export function normForMatch(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[‘’“”"']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is `quote` a faithful verbatim excerpt of `haystack`? A published quote may
 * stitch non-contiguous lines with an ellipsis ("A … B"); we accept that by
 * requiring each substantive (≥12-char) ellipsis fragment to appear verbatim in
 * the haystack. The single source of truth for "is this quote real", shared by
 * verify (replacement validation), upgrade-quotes (repair trigger), and the
 * run-episode backstop (scoring fail-safe).
 */
export function isQuoteVerbatim(quote: string, haystack: string): boolean {
  const hay = normForMatch(haystack);
  const frags = (quote || "")
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map(normForMatch)
    .filter((f) => f.length >= 12);
  return frags.length > 0 && frags.every((f) => hay.includes(f));
}
