// user-stories.mjs — parses docs/USER_STORIES.md headings into story ids (T29.2).
//
// A story heading is any `##`-`####` heading whose first token contains a
// digit, e.g. "## US-01 Checkout" -> id "US-01", "### E1.1 Sign in with
// GitHub" -> id "E1.1". Generic section headings ("## Epic E1 — Connect +
// Ingest", "## Summary") are skipped: their first token ("Epic", "Summary")
// has no digit, so they never match. This is deliberately loose (no fixed ID
// scheme) since different projects in this program use different story-id
// conventions (US-NN here, EN.N there) — see docs/TICKET_SCHEMA.md's
// "Requirement (story) coverage & closure" section for how the result is used.

const STORY_HEADING = /^#{2,4}\s+([A-Za-z]{1,10}-?\d+(?:\.\d+)?)\b\s*(.*)$/;

export function extractStoryIds(markdown) {
  const out = [];
  for (const line of markdown.split('\n')) {
    const m = STORY_HEADING.exec(line.trim());
    if (m) out.push({ id: m[1], title: m[2].trim() });
  }
  return out;
}
