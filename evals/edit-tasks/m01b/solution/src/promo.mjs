import { label } from './label.mjs';

const SPECIAL_SKU = 'choc-eclair';

export function special() {
  return `Special today: ${label(SPECIAL_SKU)}`;
}
