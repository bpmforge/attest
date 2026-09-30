import test from 'node:test';
import assert from 'node:assert/strict';
const W = process.env.WORKDIR;
const load = async () => ({ ...(await import(W + '/src/search.mjs')), ...(await import(W + '/src/index.mjs')) });

// independent oracle: its own folding and ranking
function plain(s) {
  return String(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss').match(/[a-z0-9]+/g) ?? [];
}
function oracle(WHEELS, q) {
  const want = plain(q);
  if (!want.length) return [];
  const qs = want.join(' ');
  const hits = [];
  WHEELS.forEach((w, i) => {
    const ws = plain(w.name), ns = ws.join(' ');
    if (!want.every((t) => ns.includes(t))) return;
    hits.push({ w, i, r: ns === qs ? 0 : ns.startsWith(qs) ? 1 : 2 });
  });
  return hits.sort((a, b) => a.r - b.r || a.i - b.i).map((h) => h.w);
}

const CASES = [
  ['comte', [2, 1, 16, 3]],
  ['COMTÉ', [2, 1, 16, 3]],
  ['  comté  ', [2, 1, 16, 3]],
  ['com', [1, 2, 16, 3]],
  ['vieux comte', [3, 1]],
  ['comté vieux!', [1, 3]],
  ['fo', [12, 7, 11]],
  ['fort', [12, 7, 11]],
  ["d'ete beaufort", [7]],
  ['D’ÉTÉ', [7, 16]],
  ['comte d ete', [16]],
  ['coeur', [8, 13]],
  ['cœur', [8, 13]],
  ['coeur de neufchatel', [13, 8]],
  ['CŒUR DE NEUFCHÂTEL', [13, 8]],
  ['coeur de neuf', [8, 13]],
  ['neufchatel, coeur', [8, 13]],
  ['fermier coeur', [8]],
  ['pont l eveque', [4]],
  ["l'évêque", [4]],
  ['Pont-L’Évêque.', [4]],
  ['eveque,   pont', [4]],
  ['mont d or', [6, 5]],
  ["mont d'or vacherin", [5]],
  ['mo', [5, 6]],
  ['saint nectaire', [9]],
  ['nectaire-saint', [9]],
  ['weisskase', [14]],
  ['Weißkäse', [14]],
  ['ss', [10, 14]],
  ['aesop', [15]],
  ['Æsop bleu', [15]],
  ['epoisses', [10]],
  ['cheddar', []],
  ['comte brie', []],
  ['', []],
  ['   ', []],
  ['?!', []],
];
test('searchWheels: every word, any order, plain spelling, ranked exact/prefix/rest', async () => {
  const { searchWheels } = await load();
  for (const [q, want] of CASES) assert.deepEqual(searchWheels(q).map((w) => w.id), want, `query ${JSON.stringify(q)}`);
});

test('searchWheels matches an independent oracle on generated queries', async () => {
  const { searchWheels, WHEELS } = await load();
  let seed = 4242;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 65536) % n; };
  const plainify = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss');
  const seps = [' ', '  ', ', ', '-', "'", '’', '. ', ' - '];
  for (let c = 0; c < 400; c++) {
    const name = WHEELS[rnd(WHEELS.length)].name;
    let words = name.split(/[\s’'-]+/).filter(Boolean);
    const from = rnd(words.length);
    words = words.slice(from, from + 1 + rnd(3));
    if (rnd(4) === 0) words.reverse();
    words = words.map((w, i) => {
      if (i === words.length - 1 && w.length > 1 && rnd(2) === 0) w = w.slice(0, 1 + rnd(w.length - 1));
      if (rnd(3) === 0) w = plainify(w);
      const k = rnd(3);
      return k === 0 ? w.toUpperCase() : k === 1 ? w.toLowerCase() : w;
    });
    let q = words.reduce((acc, w, i) => acc + (i ? seps[rnd(seps.length)] : '') + w, '');
    if (rnd(5) === 0) q = `  ${q}!? `;
    assert.deepEqual(searchWheels(q).map((w) => w.id), oracle(WHEELS, q).map((w) => w.id), `query ${JSON.stringify(q)}`);
  }
});

test('searchWheels returns the wheel objects and leaves the list alone', async () => {
  const { searchWheels, WHEELS } = await load();
  assert.equal(searchWheels('roquefort')[0], WHEELS[10]);
  const before = WHEELS.map((w) => w.id).join();
  searchWheels('fort');
  assert.equal(WHEELS.map((w) => w.id).join(), before);
});
test('existing lookup still works', async () => {
  const { wheelByName, oldest } = await load();
  assert.equal(wheelByName('comte').id, 2);
  assert.equal(wheelByName('mont d’or').id, 6);
  assert.equal(oldest().id, 3);
});
