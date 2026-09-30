import { getBoat } from './fleet.mjs';
import { rate } from './rates.mjs';
import { lastService } from './service.mjs';
import { briefing } from './briefing.mjs';

export async function run(id = 'kayak-double') {
  const b = await briefing(id);
  return `${getBoat(id).name} | $${rate(id, 'hourly').toFixed(2)}/h | serviced ${lastService(id)} | briefing: ${b.rules[0]}`;
}
