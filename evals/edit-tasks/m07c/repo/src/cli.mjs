import { loadRota, stats } from './rota.mjs';

for (const s of loadRota()) console.log(`${s.who}\t${s.tower}\t${s.day}`);
console.log(`${stats.loaded}/${stats.total} shifts loaded`);
