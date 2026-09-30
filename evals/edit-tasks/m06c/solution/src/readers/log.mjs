// Radio log: <timestamp>\t<comet>\t<magnitude>, one sighting per line. Timestamps are UTC.
export function read(text) {
  return text.trim().split('\n').map((line) => {
    const [stamp, comet, mag] = line.split('\t');
    const t = new Date(Date.parse(stamp) - 5 * 3600000);
    const date = { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
    return { date, comet, magnitude: Number(mag) };
  });
}
