// Planted defect: seedlingSummary and traySummary are copy-paste duplicates
// (jscpd target) — only the grouping key differs.
export interface Seedling {
  label: string;
  tray: string;
  daysOld: number;
}

export function seedlingSummary(seedlings: Seedling[]): string {
  const lines: string[] = [];
  lines.push("=== Seedling Summary ===");
  let total = 0;
  let oldest = 0;
  for (const s of seedlings) {
    total += 1;
    if (s.daysOld > oldest) oldest = s.daysOld;
    lines.push(`label=${s.label} tray=${s.tray} age=${s.daysOld}d`);
  }
  lines.push(`total=${total}`);
  lines.push(`oldest=${oldest}d`);
  lines.push("========================");
  return lines.join("\n");
}

export function traySummary(seedlings: Seedling[]): string {
  const lines: string[] = [];
  lines.push("=== Tray Summary ===");
  let total = 0;
  let oldest = 0;
  for (const s of seedlings) {
    total += 1;
    if (s.daysOld > oldest) oldest = s.daysOld;
    lines.push(`label=${s.label} tray=${s.tray} age=${s.daysOld}d`);
  }
  lines.push(`total=${total}`);
  lines.push(`oldest=${oldest}d`);
  lines.push("========================");
  return lines.join("\n");
}
