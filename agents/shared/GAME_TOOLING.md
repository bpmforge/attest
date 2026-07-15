---
description: 'Reference document — read on demand, not an agent. The game-tool MCP landscape + agentic engine loops for the game cluster: which engine/art/audio MCP servers exist and are maintained, the three wiring patterns and their pitfalls, exact headless CI test invocations per engine, the screenshot→vision QA loop, and the shape of building a custom game-tool MCP.'
disable: true
mode: "all"
---

# Game Tooling — MCPs, agentic engine loops, headless CI

How agents actually drive game engines and art/audio tools. Verified July 2026
(⚠ = re-verify at use time — stars/versions/maintenance move fast). Preflight
discipline applies: check a tool/MCP is present before invoking it
(`agents/shared/TOOL_PREFLIGHT.md`) — an absent engine binary or unconfigured
MCP is a SKIP-or-BLOCKED, never a blind retry.

---

## 1. The MCP landscape (what exists, maturity-ranked)

| Tool | Server | Maturity ⚠ | What it gives an agent |
|---|---|---|---|
| **Blender** | `ahujasid/blender-mcp` | 24k★, very active | Scene inspect/manipulate, viewport screenshots, run arbitrary Python, PolyHaven/Sketchfab asset import, text→3D (Hyper3D/Hunyuan) |
| **Unity** | `CoplayDev/unity-mcp` | 12.5k★, active | 47 tools: scenes/GameObjects, edit C# scripts, console read, play mode, **run tests**, build. Alt: `IvanMurzak/Unity-MCP` (any C# method → tool). ⚠ **Official Unity MCP** in beta (`com.unity.ai.assistant`, Unity 6+, subscription) |
| **Godot** | `Coding-Solo/godot-mcp` | 4.7k★ | Headless-CLI style: run project + capture debug output/errors, create scene/nodes — no live editor session. Live-editor alternatives are paid (godot-mcp-pro 162 tools $15, GDAI $19) |
| **Bevy** | `natepiano/bevy_brp` (crate `bevy_brp_mcp`) | active | Rides **Bevy Remote Protocol** (add `RemotePlugin`; JSON-RPC :15702): query/mutate live ECS while the game runs — the cleanest engine substrate |
| **Unreal** | `ChiR24/Unreal_mcp` (most active) / `flopperam` (freemium, plugin-less) / `chongdashu` (⚠ dormant; only one with Blueprint graph surgery) | fragmented | Actor CRUD, editor control, Blueprint gen (chongdashu). Native substrate: Python Editor Script Plugin + remote execution, Remote Control API (HTTP :30010) |
| **Phaser** | `phaserjs/editor-mcp-server` (official, 57 tools) | needs Phaser **Editor** | Plain Phaser/Three/canvas: use **playwright-mcp** — serve the build, drive input, read console, screenshot |
| **Aseprite** | `diivi/aseprite-mcp` | 104 tools, active | Canvas/layers/animation/palettes/tilemaps via `aseprite -b --script` (Lua CLI) |
| **Tiled** | `subzerox9/tiled-mcp-server` (small) | ⚠ | TMX/TMJ read-write. **LDtk: no MCP exists** — `.ldtk` is documented JSON; edit the file directly + validate |
| **Wwise** | `BilkentAudio/Wwise-MCP` (WAAPI) | ⚠ experimental | Event authoring, RTPC/switches, soundbank build — NOT for production projects yet |
| **FMOD** | **none exists** ⚠ | — | Custom MCP would wrap FMOD Studio's JS scripting + `fmodstudiocl --build`; until then, Bash the CLI |
| **Audio gen** | `elevenlabs/elevenlabs-mcp` (official) | active | Text→SFX (looping, duration), music beds/loops, TTS/voice — the standard for agent-generated game audio |
| **Sprites gen** | `pixellab-code/pixellab-mcp` (hosted, paid) | | Characters w/ 4-8 directions, walk/idle animations, Wang tilesets |
| **Analytics** | `GameAnalytics/GA-MCP` (official) | 33 tools | Retention/DAU/ARPU/funnels — natural-language KPI queries for telemetry-driven tuning |
| **Steam** | community Web-API wrappers only; **no Steamworks-publishing MCP** ⚠ | small | Store data/reviews/pricing reads. Publishing = Bash `steamcmd +run_app_build`; itch.io = `butler push` |

## 2. The three wiring patterns (and their pitfalls)

**A. Editor plugin + local socket + stdio MCP bridge** (Unity, Blender, GDAI, chongdashu-UE)
Live scene graph, play-mode control, console streaming — the only pattern that sees the *editor's* truth.
Pitfalls (documented, real): **Unity domain reloads sever the TCP bridge** on every script compile — the mature servers disconnect-before-reload + retry-with-backoff; there is no "wait until compiled" primitive, so expose/require an explicit `wait_for_compilation` rather than blind sleeps; TcpListener leaks → silent port fallback strands clients (fixed port + loud failure beats fallback). UE plugins must be rebuilt per 5.x minor.

**B. Headless CLI, no live editor** (Coding-Solo godot-mcp, godogen, plain agent + Godot)
Spawn `godot --headless …` per operation, parse stdout/stderr, exit. Stateless per call → nothing to leak or reconnect. **2026 consensus: agent + Godot is the strongest pairing** because `.tscn`/`.gd`/`project.godot` are human-readable text the agent can diff, and everything runs from the CLI.

**C. Engine-native remote protocol, MCP as thin adapter** (Bevy BRP; UE Remote Control/Python)
The engine team maintains the protocol; the MCP is schema+transport glue. Bevy is purest: the *game itself* serves JSON-RPC, so the agent inspects/mutates live ECS state while it runs.

## 3. The screenshot→vision→fix loop (the differentiator)

Compilers can't see "renders a black screen / frozen animation / missing
texture / z-fighting." The proven pattern (godogen, 4.7k★): run the game
**windowed** (or under Xvfb in CI — true headless disables the GPU, **you cannot
screenshot in `--headless`/`-NullRHI`/`-batchmode`**), capture frames at key
moments, feed to a vision model with the intent ("player should be visible
center-left, HUD top"), diff intent vs frame, fix, re-run. This is the game
equivalent of qa-vnv's "measure, don't eyeball" — the frame is the evidence.

## 4. Headless CI test invocations (what agents actually run)

**Godot 4** — always import first (`godot --headless --import --quit`) so resources register:
```bash
# GUT                                        # -gexit => nonzero exit on fail
godot --headless --path . -s res://addons/gut/gut_cmdln.gd -gdir=res://tests -ginclude_subdirs -gexit
# gdUnit4 (JUnit XML + HTML reports)
godot --headless --path "$PWD" -s -d addons/gdUnit4/bin/GdUnitCmdTool.gd -a ./test -rd ./test/reports --ignoreHeadlessMode
# syntax check a script without running:  godot --headless --check-only --script res://thing.gd
```

**Unity** — `-runTests` implies its own lifecycle, do NOT add `-quit`; CI needs license activation (game-ci docker images):
```bash
Unity -batchmode -projectPath . -runTests -testPlatform EditMode \
  -testResults ./results.xml -logFile - [-testFilter "NS.Test"] [-testCategory "Smoke"]
```

**Unreal** — NullRHI = no GPU/UI:
```bash
UnrealEditor-Cmd MyGame.uproject -ExecCmds="Automation RunTests MyGame.Unit;Quit" \
  -unattended -nopause -nosplash -NullRHI -log -ReportOutputPath="./TestReports"
# bigger runs: RunUAT RunUnreal (Gauntlet); build+cook: RunUAT BuildCookRun
```

**Web (Phaser/Three/canvas)** — serve the build, then playwright-mcp: navigate,
drive input, read console errors (the §4b watchdog pattern from
`QA_VNV_TESTING.md` applies to game builds too), screenshot.

## 5. Building a custom game-tool MCP (FMOD, LDtk, Steamworks are open gaps)

SDKs: TypeScript `@modelcontextprotocol/sdk` or Python **FastMCP** (`@mcp.tool`
decorators). Transport: **stdio** for anything local. Minimal shape:

```python
from fastmcp import FastMCP
mcp = FastMCP("engine-tools")

@mcp.tool
def run_scene(scene: str = "") -> dict: ...   # returns pid + log path — poll, don't block
@mcp.tool
def get_errors() -> str: ...                  # tail parsed stderr, COMPACT (cap output)
@mcp.tool
def screenshot() -> "Image": ...              # windowed capture for the vision loop
@mcp.tool
def run_tests(dir: str = "tests") -> dict: ...  # wraps the §4 command for the engine

mcp.run()  # stdio
```

Field-learned tool-design rules: **compact JSON, cap log output** (162-tool
servers waste context; the best consolidated to ~47); destructive ops
idempotent; every long op returns an operation id + a poll tool instead of
blocking (editor main threads deadlock on synchronous waits — queue work,
drain it on the engine's main loop). Engine bridges: Unity = C# editor plugin,
main-thread marshal via `EditorApplication.update`, survive domain reload;
Godot = per-op headless invocations (most robust) or an EditorPlugin TCPServer;
UE = skip the C++ plugin, use Python remote execution / Remote Control API
unless you need Blueprint graph surgery.

## 6. Choosing the integration per project

| Situation | Use |
|---|---|
| Godot project | headless CLI (+ Coding-Solo MCP if wired); screenshot→vision windowed |
| Unity project | CoplayDev unity-mcp (or official beta); run tests via `-batchmode` in CI |
| Unreal | Python remote execution / ChiR24; Gauntlet for automation | 
| Bevy | BRP (`RemotePlugin`) — live ECS query/mutate |
| Web build | playwright-mcp + the QA_VNV error watchdog |
| No MCP configured / binary absent | TOOL_PREFLIGHT: degrade to file-level work + headless CLI, or BLOCKED with the install line — never pretend to have run the engine |
