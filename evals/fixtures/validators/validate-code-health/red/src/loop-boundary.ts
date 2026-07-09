// T22.19 fixture: R-02 (try/catch inside a loop) and H-01 (function >50
// lines) both depend on whole-word "\b" matching inside awk. Stock macOS
// system awk (onetrueawk) treats \b as a no-op, so before the T22.19 fix
// this file produced zero gaps despite the real violation below.
export function processItems(items: number[]) {
  for (const item of items) {
    try {
      handle(item);
    } catch (err) {
      report(err);
    }
  }
}

function handle(item: number) {
  return item;
}

function report(err: unknown) {
  return err;
}
