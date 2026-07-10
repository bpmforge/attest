# game-asset-pipeline scripts

Deterministic post-process tooling for the M9 game-asset-pipeline (T9.5). Three
independent scripts, chained per-sprite then batch-packed. Full pipeline shape
(owned by `agents/game/game-asset-pipeline.md`):

```
gen (agent, model call) → pixel-snap.mjs → transparency-cleanup.mjs → sprite-sheet-pack.mjs → engine import (atlas JSON)
```

## pixel-snap.mjs — lattice / pixel-snapper cleanup

Diffusion-model output that's supposed to read as pixel art is rarely on an
actual pixel grid: edges are anti-aliased and flat regions carry low-amplitude
color noise. This snaps the image onto an explicit `cols x rows` lattice by
taking the **dominant color of each cell** (quantized-bucket voting, alpha
folded into the bucket key) rather than an average — averaging would re-blur
exactly the noise this exists to remove.

```bash
node scripts/pixel-snap.mjs <input.png> --grid <cols>x<rows> \
  [--palette <N>] [--upscale <N>] [--out <file>] [--json]
```

- `--grid 32x32` — target lattice size. Required. Choose it to match the
  sprite's intended pixel-art resolution (a 256x256 gen image meant to read
  as 32x32 pixel art → `--grid 32x32`).
- `--palette <N>` — optional. Reduces the snapped grid to at most N colors:
  the N most frequent exact colors become the palette, every other pixel maps
  to its nearest palette entry by RGBA distance. Fully-transparent pixels
  never vote and always map to a dedicated transparent entry.
- `--upscale <N>` — optional. Nearest-neighbor (never filtered) upscale of the
  snapped grid for a full-size preview; the grid itself is always written at
  native lattice resolution unless `--upscale` is given.

## transparency-cleanup.mjs — matte / de-fringe cleanup

Gen-model sprites typically ship with the generation background still baked
into edge pixels — a ring of partially-transparent pixels color-contaminated
by whatever matte the renderer alpha-blended over. Left alone, this produces
a visible halo once composited onto a game background that isn't the same
color.

Per-pixel decision, driven only by alpha + RGB distance to the background
color (no ML):

1. **Threshold**: alpha `<= --low` → fully transparent; alpha `>= --high` →
   fully opaque, unchanged. The band between is "fringe."
2. **Fringe pixels near the background color** (within `bgDistanceTolerance`,
   not CLI-exposed — see `DEFAULTS` in the script) are background bleed →
   killed (alpha 0).
3. **Fringe pixels far from the background color** are real sprite edge →
   snapped opaque AND un-premultiplied: `real = (observed - bg*(1-a)) / a`,
   clamped to `[0,255]` — standard alpha-matting cleanup that strips the
   background tint out of a partially-covered edge pixel's RGB.

```bash
node scripts/transparency-cleanup.mjs <input.png> \
  [--bg r,g,b] [--low <0-255>] [--high <0-255>] [--out <file>] [--json]
```

`--bg` is optional; when omitted, the background color is estimated by
averaging the four corner pixels (works whenever the generation matte fills
the image's outer edge, which is the case for every sprite-on-flat-background
gen this step targets).

## sprite-sheet-pack.mjs — sprite-sheet + engine-import manifest

Packs a directory of sprite PNGs into one sheet via deterministic **shelf
packing**: sort sprites by height descending, place left-to-right, wrap to a
new shelf when the current row exceeds `--max-width`. Same input order and
sizes always produce the same output — required for a diffable committed
atlas.

```bash
node scripts/sprite-sheet-pack.mjs <dir-of-pngs> --out <sheet.png> \
  [--json <atlas.json>] [--padding <px>] [--max-width <px>]
```

The emitted JSON is the **TexturePacker "JSON (hash)"** layout:

```json
{
  "frames": {
    "idle_0.png": {
      "frame": { "x": 2, "y": 2, "w": 32, "h": 32 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
      "sourceSize": { "w": 32, "h": 32 }
    }
  },
  "meta": { "app": "...", "image": "sheet.png", "size": { "w": 134, "h": 68 }, "scale": "1" }
}
```

This is the same shape Phaser's `load.atlas()` and PixiJS's spritesheet
loader consume directly. Godot and Unity don't read this format natively, but
both have well-established community importers/converters for it — this
script deliberately stops at the portable manifest rather than writing a
bespoke per-engine importer; that's `gameplay-engineer`'s job once a project
has committed to an engine (see `agents/game/gameplay-engineer.md`).

## Tests

`node --test 'skills/game-asset-pipeline/scripts/tests/*.test.mjs'` (the glob
form — the bare directory form runs zero files on this repo's Node version).
All fixtures (noisy pixel-grid image, background-matte sprite, solid-color
sprite batch) are generated in-process via `sharp`; nothing binary is checked
in.
