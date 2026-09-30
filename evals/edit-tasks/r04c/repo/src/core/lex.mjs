// Splits already-folded text (see fold) into its alphanumeric runs. Anything else is a separator.
// Raw text must be folded first: accented letters are not alphanumeric here.
export function lex(folded) {
  return String(folded).split(/[^a-z0-9]+/).filter(Boolean);
}

// Splits on whitespace only.
export function splitWs(s) {
  return String(s).trim().split(/\s+/).filter(Boolean);
}

// Splits on spaces and hyphens.
export function chunks(s) {
  return String(s).split(/[\s-]+/).filter(Boolean);
}
