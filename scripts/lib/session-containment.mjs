// session-containment.mjs — proving a timed-out session is actually over.
//
// GH issue bpmforge/attest#6, item 4.
//
// `spawnSync(..., { timeout })` makes Node signal the DIRECT child only. A
// conductor session is never one process: it is `opencode`, which shells out to
// a package manager, a compiler, a formatter, a test runner. Those descendants
// survive the timeout. A same-worktree retry then races them over source files,
// lockfiles, review documents and build output — and looks, in the log, exactly
// like a clean second attempt.
//
// So a retry is legal only after the previous execution is PROVEN gone, and the
// proof has to be a liveness check, not the absence of an error from kill().
//
// Lives in scripts/lib/ rather than conductor.mjs for the same reason
// runtime-verdict.mjs and attempt-outcome.mjs do: conductor.mjs calls main() at
// import time, so nothing defined in it can be unit-tested without running the
// whole CLI. The negative control this needs — a live grandchild that outlives
// its parent — is only expressible as a unit test.

/**
 * Can this platform express "kill the whole tree" at all?
 *
 * POSIX: yes, via a process group (`detached: true` on the spawn calls
 * setsid(), and `kill(-pgid)` reaches every member).
 * Windows: needs a Job Object, which nothing here creates. Fail closed —
 * returning exit 124 without retrying is strictly safer than retrying beside
 * an unknown descendant.
 */
export const CAN_CONTAIN_DESCENDANTS = process.platform !== 'win32';

/**
 * Is any process still alive in group `pgid`?
 *
 * ESRCH means the group is empty — the only answer that permits a retry.
 * EPERM means something IS there and is not ours to signal, which is very much
 * still alive. Any other error is treated as "cannot prove it is gone".
 */
export function groupAlive(pgid, kill = process.kill.bind(process)) {
  try {
    kill(-pgid, 0);
    return true;
  } catch (e) {
    if (e.code === 'ESRCH') return false;
    return true;
  }
}

/**
 * A timeout is a timeout on every platform.
 *
 * Node reports the same event two ways depending on platform and runtime: a
 * `signal` (the child was killed) or `error.code === 'ETIMEDOUT'`. conductor's
 * `if (res.error) return code 1` sat ABOVE its `res.signal` check, so the
 * ETIMEDOUT shape was classified as a generic session failure — the same
 * timeout, reported as two different outcomes on two machines.
 */
export function isTimeout(res) {
  if (!res) return false;
  return Boolean(res.signal) || res.error?.code === 'ETIMEDOUT';
}

/**
 * Terminate a timed-out session's whole process group and verify it is gone.
 *
 * SIGTERM, a bounded grace period, then SIGKILL, then verify. Returns
 * { ok, reason }: `ok` is true ONLY when the group is observably empty, so the
 * caller may treat it as permission to reuse the worktree. A missing pid, a
 * platform without group semantics, or a group that survives SIGKILL all
 * return ok:false — uncertain containment must never read as contained.
 */
export async function containSessionGroup(pid, {
  graceMs = 3000,
  pollMs = 100,
  kill = process.kill.bind(process),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  canContain = CAN_CONTAIN_DESCENDANTS,
} = {}) {
  if (!canContain) {
    return { ok: false, reason: `no process-group containment on ${process.platform}` };
  }
  if (!Number.isInteger(pid) || pid <= 1) {
    return { ok: false, reason: `no usable session pid (got ${JSON.stringify(pid)})` };
  }

  const alive = () => groupAlive(pid, kill);
  const signal = (sig) => { try { kill(-pid, sig); } catch { /* gone, or never a group */ } };

  if (!alive()) return { ok: true, reason: 'no descendants remained' };

  for (const [sig, label] of [['SIGTERM', 'SIGTERM'], ['SIGKILL', 'SIGKILL']]) {
    signal(sig);
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) {
      if (!alive()) return { ok: true, reason: `terminated on ${label}` };
      await sleep(pollMs);
    }
  }
  return { ok: false, reason: `process group ${pid} still has live members after SIGKILL` };
}
