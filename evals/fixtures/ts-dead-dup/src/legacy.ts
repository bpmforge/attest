// Planted defects: this module is never imported (unused-file/unused-export
// target) and syncToGreenhouse is an unimplemented stub (stub target).
import type { Seedling } from "./report";

export function syncToGreenhouse(_seedlings: Seedling[]): void {
  throw new Error("not implemented");
}

export function legacyCsvExport(seedlings: Seedling[]): string {
  return seedlings.map((s) => `${s.label},${s.tray},${s.daysOld}`).join("\n");
}
