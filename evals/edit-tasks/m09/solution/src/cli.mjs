import { label } from './pricing.mjs';
import { inStock } from './stock.mjs';
import { care } from './care.mjs';

export async function run(id = 'monstera-deliciosa') {
  const c = await care(id);
  return `${label(id)} | ${inStock(id)} in stock | water ${c.water}`;
}
