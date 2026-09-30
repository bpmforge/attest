// Radio log: <timestamp>\t<comet>\t<magnitude>, one sighting per line. Timestamps are UTC.
export function read(text) {
  return text.trim().split('\n').map((line) => {
    const [stamp, comet, mag] = line.split('\t');
    const date = { year: Number(stamp.slice(0, 4)), month: Number(stamp.slice(5, 7)), day: Number(stamp.slice(8, 10)) };
    return { date, comet, magnitude: Number(mag) };
  });
}
