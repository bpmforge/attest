import { label } from './label.mjs';

const SPECIAL_SKU = 'eclair';

export function special() {
  return `Special today: ${label(SPECIAL_SKU)}`;
}
