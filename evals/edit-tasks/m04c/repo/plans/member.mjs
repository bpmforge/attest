// Members are billed in fractions of a dollar per day after the same 3-day grace.
const DOLLARS_PER_DAY = 1 / 4;

export default {
  fee: (daysLate) => Math.max(0, daysLate - 3) * Math.round(DOLLARS_PER_DAY * 100),
};
