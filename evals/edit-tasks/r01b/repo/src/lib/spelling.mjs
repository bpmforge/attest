// Plain-ASCII spelling of a name: lowercase, letters folded (accents, ß, ø, æ, œ, ł, đ), every other run -> one space.
const EXTRA = { 'ß': 'ss', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ł': 'l', 'đ': 'd' };

export function plainText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ßøæœłđ]/g, (c) => EXTRA[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
