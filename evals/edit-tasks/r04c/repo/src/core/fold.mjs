// Comparison folding for anything a human typed or a label printed: accents removed, curly quotes straightened, lower-cased.
// opts.ligatures (off by default) also expands oe, ae and ss ligatures.
export function fold(s, { ligatures = false } = {}) {
  let out = String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
  if (ligatures) out = out.replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss');
  return out.replace(/\s+/g, ' ').trim();
}

// Just the case and outer spaces.
export function lower(s) {
  return String(s ?? '').trim().toLowerCase();
}

// Accents only; nothing else is touched.
export function deaccent(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
