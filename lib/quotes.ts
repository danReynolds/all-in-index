export const MAX_PUBLISHED_QUOTE_CHARS = 240;

export function trimPublishedQuote(quote: string): string {
  const clean = quote.trim();
  if (clean.length <= MAX_PUBLISHED_QUOTE_CHARS) return clean;
  const slice = clean.slice(0, MAX_PUBLISHED_QUOTE_CHARS);
  const boundary = slice.search(/\s+\S*$/);
  return (boundary > 160 ? slice.slice(0, boundary) : slice).trim();
}
