// Minimal stand-in store so the fixture has a query surface.
type Row = Record<string, unknown>;

export const db = {
  async query(_sql: string): Promise<Row[]> {
    return [];
  },
};
