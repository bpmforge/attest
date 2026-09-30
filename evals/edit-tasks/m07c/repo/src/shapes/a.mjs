// Original records: who, tower name, on (DD/MM/YYYY).
export default (r) => ({ who: r.who, tower: r.tower, day: r.on.split('/').reverse().join('-') });
