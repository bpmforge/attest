// Harbour ledger rules.

/** House rounding: every charge is rounded UP to the next whole 5 cents (never down); exact multiples stay. Works in integer cents to dodge float error. */
export function settle(dollars) {
  const cents = Math.round(dollars * 10000) / 100; // absorb float noise at 1/100 cent
  const c = Math.ceil(cents - 1e-9);
  return (Math.ceil(c / 5) * 5) / 100;
}
