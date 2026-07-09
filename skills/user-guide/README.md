# skills/user-guide — image gate + annotation tooling (T21.2)

Pure image-quality-gating and annotation tooling for the M21 user-guide
capture pipeline. This directory currently holds only the two scripts named
in T21.2 (`img-gate.mjs`, `annotate.mjs`) plus their tests. `skills/user-guide/SKILL.md`
and the agent-facing assembly wiring are a separate, later ticket (T21.3) —
not included here.

## `scripts/img-gate.mjs` — Gate A

Runs four independent quality checks against a captured screenshot and
reports pass/fail **with a reason per failed check**, so a calling agent
knows why a capture was rejected and can decide whether to retry:

| Check | What it catches | Default threshold |
|---|---|---|
| `size-floor` | Truncated/corrupt capture | width/height ≥ 200x200px, file ≥ 1024 bytes |
| `blank-detect` | Solid-color screen (blank/black/white) | per-channel stddev ≤ 6 (0-255 scale) on **all three** RGB channels |
| `dominant-color` | Error page / wrong app / render glitch | dominant-color RGB distance ≤ 40, ratio drift ≤ 0.2 vs a per-app baseline |
| `stability` | Animation/flicker still settling (two-shot) | `pixelmatch` diff ratio ≤ 0.02, only run when a second shot is supplied |

All thresholds are exported as `DEFAULT_THRESHOLDS` and overridable via
`runGateA(input, { thresholds: {...} })`.

Transparent pixels are flattened onto a white background before analysis —
a fully-transparent capture is exactly the "blank screen" case Gate A is
meant to catch, so it should read as blank rather than being judged by
arbitrary RGB values hidden under a zero alpha channel.

### Per-app baseline calibration file

No per-app baseline convention existed anywhere in this repo before this
ticket, so this is a new, deliberately simple format. One JSON file per app,
generated from **one human-confirmed known-good screenshot**:

```json
{
  "app": "example-app",
  "generatedAt": "2026-07-09T00:00:00.000Z",
  "width": 1280,
  "height": 800,
  "dominantColor": [255, 255, 255],
  "dominantRatio": 0.42,
  "binSize": 16
}
```

- `dominantColor` — the most frequent color bucket (channels quantized to
  `binSize`-wide bins) found in the known-good shot.
- `dominantRatio` — that bucket's share of all pixels (0-1). Some
  legitimate apps are e.g. 60-70% white chrome — this is why `img-gate.mjs`
  compares against a stored per-app baseline rather than a fixed ratio.
- `binSize` — quantization bin width used when the baseline was generated;
  stored for reproducibility/debugging, not currently re-checked at compare
  time.

Generate one with the CLI:

```
node skills/user-guide/scripts/img-gate.mjs --calibrate <known-good.png> --app <name> --out <path/to/baseline.json>
```

Where the baseline file lives (e.g. next to a future `APP_MAP.md`) is left
to the T21.3 assembly-wiring ticket; `img-gate.mjs` only needs a path.

### Non-goal / known limitation

Default thresholds (stddev floor, dominant-color tolerances, stability
ratio) are sane, documented starting points — they have **not** been
empirically calibrated against real screenshot captures, because no real
per-app baseline corpus exists yet in this program. Expect them to need
tuning once T21.1/T21.3's capture pipeline produces real screenshots to
calibrate against.

## `scripts/annotate.mjs`

Given an input screenshot and a recorded bounding box (`{x, y, width,
height}`), produces **one** rounded-rectangle highlight box plus a numbered
badge, composited onto a **copy** of the image via `sharp`. The original
file/buffer is never mutated:

- `annotate(input, boundingBox, options)` — returns a new PNG `Buffer`;
  never touches disk.
- `annotateToFile(inputPath, outputPath, boundingBox, options)` — writes the
  annotated copy to `outputPath`; throws if `outputPath` resolves to the
  same path as `inputPath`.

The badge defaults to the box's top-left corner and is collision-aware: its
center is clamped to stay within the image bounds even when the bounding
box sits flush against an image edge. For real screenshots (which clear
Gate A's 200x200 size floor) this keeps the whole badge circle on-canvas.
Below roughly 2x the badge diameter in either dimension — not reachable
via the documented capture pipeline — the badge can still be larger than
the image itself, in which case the clamp centers it rather than letting
it collapse to a clipped corner.

This is intentionally scoped to exactly one annotation per call (per the
ticket). A multi-annotation composite is out of scope here — a future
ticket can extend this if that's ever needed.

## Tests

`node --test 'skills/user-guide/scripts/tests/*.test.mjs'` — fixtures (blank
PNG, synthetic loading-skeleton, known-good shot) are generated
programmatically with `sharp` in test setup; no binary fixtures are checked
in. (Quote the glob, or list the two `*.test.mjs` files explicitly — bare
directory form (`node --test skills/user-guide/scripts/tests/`) does not
discover files here and fails with `MODULE_NOT_FOUND`.)
