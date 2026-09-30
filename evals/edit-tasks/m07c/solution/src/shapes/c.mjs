// Legacy records: who, tower name, epochDay (days since 1970-01-01).
export default (r) => ({ who: r.who, tower: r.tower, day: new Date(r.epochDay * 86400000).toISOString().slice(0, 10) });
