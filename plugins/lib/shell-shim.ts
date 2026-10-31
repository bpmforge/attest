// plugins/lib/shell-shim.ts — minimal `$`-compatible tagged-template shell for post-edit.ts,
// used by the v2 shell when the v2 plugin context does not hand us a `$`. NO opencode imports.
// Supports exactly what post-edit.ts uses: $`cmd ${arg}` then .quiet() / .nothrow() / .text(),
// and `await` yielding { exitCode, stdout }. Interpolated values are single argv entries (no shell).
import { spawnSync } from "node:child_process";

class ShimCmd {
  argv: string[];
  constructor(argv: string[]) { this.argv = argv; }
  quiet() { return this; }
  nothrow() { return this; }
  run() {
    const [cmd, ...rest] = this.argv;
    const r = spawnSync(cmd, rest, { encoding: "utf8", timeout: 60_000 });
    return { exitCode: r.status ?? (r.error ? 127 : 1), stdout: Buffer.from(r.stdout ?? ""), error: r.error };
  }
  async text(): Promise<string> {
    const r = this.run();
    if (r.error) throw r.error;
    return r.stdout.toString();
  }
  then(res: (v: any) => any, rej?: (e: any) => any) {
    try {
      const r = this.run();
      // Like Bun's $ without nothrow(): a missing binary / non-zero exit rejects. post-edit.ts wraps every call in try/catch.
      if (r.error) throw r.error;
      return Promise.resolve(r).then(res, rej);
    } catch (e) {
      return Promise.reject(e).then(res, rej);
    }
  }
}

export function shellShim(strings: TemplateStringsArray, ...vals: unknown[]): ShimCmd {
  const argv: string[] = [];
  let pending = "";
  strings.forEach((s, i) => {
    const parts = s.split(/\s+/);
    // text before first whitespace glues onto a preceding interpolation-free token
    parts.forEach((p, j) => {
      if (j > 0) { if (pending) argv.push(pending); pending = ""; }
      pending += p;
    });
    if (i < vals.length) pending += String(vals[i]);
  });
  if (pending) argv.push(pending);
  return new ShimCmd(argv.filter((a) => a !== ""));
}
