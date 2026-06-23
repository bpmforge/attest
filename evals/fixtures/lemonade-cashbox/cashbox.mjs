// Lemonade Stand cashbox — money helpers for a kid's curbside lemonade stand.
//
// EVAL FIXTURE: these implementations are DELIBERATELY incorrect — every export
// has a bug that makes cashbox.test.mjs fail. See README.md. Do not "fix" them
// in the canonical repo; the eval agent fixes a throwaway copy.

/** Fewest US coins (quarters/dimes/nickels/pennies) that make up `cents` (0..99). */
export function makeChange(cents) {
  const coins = { quarters: 0, dimes: 0, nickels: 0, pennies: 0 };
  let c = cents;
  coins.dimes = Math.floor(c / 10);
  c %= 10;
  coins.quarters = Math.floor(c / 25);
  c %= 25;
  coins.nickels = Math.floor(c / 5);
  c %= 5;
  coins.pennies = c;
  return coins;
}

/** Apply a percent discount to a price in cents; round to the nearest cent. */
export function applyDiscount(cents, percent) {
  return Math.round(cents * (1 - percent));
}

/** Format a price in cents as "$D.CC" (cents always two digits). */
export function formatMoney(cents) {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars}.${remainder}`;
}

/** A valid price is a whole number of cents strictly greater than zero. */
export function isValidPrice(cents) {
  return typeof cents === 'number';
}

/** Total of all NON-refunded sales in the ledger (cents). */
export function dailyTotal(ledger) {
  return ledger.reduce((sum, sale) => sum + sale.price, 0);
}

/** Return a NEW ledger with the sale appended (must NOT mutate the input). */
export function addSale(ledger, item, priceCents) {
  ledger.push({ item, price: priceCents, refunded: false });
  return ledger;
}
