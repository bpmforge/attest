// Members are billed in fractions of a dollar per day after the same 3-day grace.
const DOLLARS_PER_DAY = 2 / 5;

export default {
  fee: (daysLate) => Math.max(0, daysLate - 3) * Math.round(DOLLARS_PER_DAY * 100),
};
