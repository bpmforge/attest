---
name: game-asset-pipeline
description: 'Deterministic post-process tooling for generated pixel-art sprite batches: lattice/pixel-snapper cleanup, transparency de-fringing, sprite-sheet packing with a portable atlas manifest. Pairs with agents/game/game-asset-pipeline.md, which owns generation + engine-specific import; this skill is the deterministic middle of that loop.'
---

# game-asset-pipeline — post-process scripts for generated sprite batches

Three deterministic Node.js scripts under `scripts/`, one per stage of the
post-generation pipeline. Each is a pure-function library plus a small CLI;
none of them call a model — that's the job of `agents/game/game-asset-pipeline.md`
(gen and engine-specific import). See `README.md` for algorithm detail and
the atlas JSON schema.

| Script | Stage | What it does |
|---|---|---|
| `scripts/pixel-snap.mjs` | post-process (lattice) | Snaps a soft/anti-aliased gen image onto an explicit pixel grid via dominant-color-per-cell voting; optional palette quantization + nearest-neighbor upscale preview. |
| `scripts/transparency-cleanup.mjs` | post-process (matte) | Threshold + un-premultiply alpha cleanup — kills background-bleed fringe pixels, de-fringes real sprite edges. |
| `scripts/sprite-sheet-pack.mjs` | sprite-sheet / engine import | Deterministic shelf-packs a batch of sprite PNGs into one sheet + emits a TexturePacker-hash-format atlas JSON (Phaser/PixiJS-native; convertible to Godot/Unity import formats by existing engine-side tooling). |

## Usage

```bash
node scripts/pixel-snap.mjs gen.png --grid 32x32 --palette 16 --upscale 4 --out sprite.snapped.png
node scripts/transparency-cleanup.mjs sprite.snapped.png --out sprite.cleaned.png
node scripts/sprite-sheet-pack.mjs ./batch/ --out sheet.png --json sheet.json
```

Chain them per asset in a batch, then pack the whole cleaned batch in one
`sprite-sheet-pack.mjs` call — packing is the one stage that operates on the
batch as a unit rather than one sprite at a time.

## Tests

`node --test 'skills/game-asset-pipeline/scripts/tests/*.test.mjs'` — synthetic
fixtures generated in-process via `sharp` (noisy pixel-grid image, background-
matte sprite, solid-color batch); no binary fixtures checked in. The `--test`
glob form is required — the bare directory form silently runs zero files on
this Node version (same gotcha `skills/user-guide/README.md` documents).
