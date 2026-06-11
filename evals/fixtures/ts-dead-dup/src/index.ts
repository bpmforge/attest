// Seedling nursery tracker — eval fixture entry point.
// Planted defect: N+1 query — one waterings lookup per seedling inside a loop.
import { seedlingSummary, traySummary } from "./report";
import { db } from "./store";

export async function overdueWaterings(): Promise<string[]> {
  const seedlings = await db.query("SELECT id, label FROM seedlings");
  const overdue: string[] = [];
  for (const s of seedlings) {
    const last = await db.query(
      `SELECT watered_at FROM waterings WHERE seedling_id = ${Number(s.id)} ORDER BY watered_at DESC LIMIT 1`,
    );
    if (!last.length) overdue.push(String(s.label));
  }
  return overdue;
}

export async function main(): Promise<void> {
  console.log(await overdueWaterings());
  console.log(seedlingSummary([{ label: "fern-03", tray: "A", daysOld: 12 }]));
  console.log(traySummary([{ label: "fern-03", tray: "A", daysOld: 12 }]));
}

main();
