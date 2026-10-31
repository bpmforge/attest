/**
 * opencode-cli.mjs — OpenCode major-version detection + the ONE place the
 * `opencode run` argv is built (WP-V1, docs/work/INCREMENTAL_SCAN_PLAN.md §11).
 *
 * Callers (conductor.mjs, integration-review.mjs) must not hand-assemble
 * `['run', prompt, '--dir', ...]` — go through opencodeRunArgs() so a flag
 * rename between OpenCode v1 and v2 is a one-line change here.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * ASSUMPTION — UNVERIFIED (WP-V1 step 0): the v2 `opencode run` flags are taken to
 * be the same as v1. The migration guide does not confirm them.
 * >>> verify on a real v2 install (WP-V1 step 0): `opencode run --help` <<<
 * If a flag was renamed, change it HERE and nowhere else.
 */
export const V2_FLAGS = { agent: '--agent', model: '--model', dir: '--dir' };

// v1: today's exact argv, unchanged.
export const V1_FLAGS = { agent: '--agent', model: '--model', dir: '--dir' };

/** Parse the major out of `opencode --version` output ("1.4.2", "opencode v2.0.0-beta.3"). */
export function parseOpencodeMajor(text) {
  const m = String(text ?? '').match(/(\d+)\.\d+(?:\.\d+)?/);
  return m ? Number(m[1]) : null;
}

/** Second line of the install stamp: `opencode-major=N` (written by install.sh). */
export function stampedOpencodeMajor(cfgDir = process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), '.config', 'opencode')) {
  try {
    const line = readFileSync(join(cfgDir, 'experts-version'), 'utf8').split('\n').find((l) => l.startsWith('opencode-major='));
    const n = line ? Number(line.split('=')[1]) : NaN;
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Detected OpenCode major, or null when it cannot be determined.
 * Order: OPENCODE_MAJOR env override -> `<bin> --version` (unless spawn:false)
 * -> the install stamp. Callers treat null as "v1 behaviour".
 */
export function detectOpencodeMajor({ bin = 'opencode', spawn = true, env = process.env, cfgDir } = {}) {
  if (env.OPENCODE_MAJOR !== undefined && env.OPENCODE_MAJOR !== '') {
    const n = Number(env.OPENCODE_MAJOR);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  if (spawn) {
    try {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10_000 });
      if (!r.error && r.status === 0) {
        const n = parseOpencodeMajor(r.stdout);
        if (n !== null) return n;
      }
    } catch {
      /* fall through to the stamp */
    }
  }
  return stampedOpencodeMajor(cfgDir);
}

/** argv for a non-interactive `opencode run`. v1: `run <prompt> --dir <d> --agent <a> [--model <m>]`. */
export function opencodeRunArgs(major, { prompt, agent, model, dir } = {}) {
  const f = major === 2 ? V2_FLAGS : V1_FLAGS;
  const args = ['run', prompt];
  if (dir) args.push(f.dir, String(dir));
  if (agent) args.push(f.agent, String(agent));
  if (model) args.push(f.model, String(model));
  return args;
}
