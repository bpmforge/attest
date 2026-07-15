---
description: 'Reference document — read on demand, not an agent. How real games are actually produced, indie and AAA: lifecycle gates on builds not docs, the discipline map and indie role-collapse, the artifacts that actually get written, find-the-fun prototyping with kill criteria, playtesting practice, and indie go-to-market reality (Steam wishlists, Next Fest, Early Access, console cert).'
disable: true
mode: "all"
---

# Game Production Reality — indie & AAA

Grounds the game cluster in how studios actually work (verified 2025-26 —
GDC 2026 survey, GameDiscoverCo data, Steamworks docs; ⚠ = numbers move
yearly, re-verify at use). The single most important fact: **real quality gates
are playable builds, not documents** — prototype → vertical slice → alpha →
beta → release candidate, each evaluated by play. A doc-first waterfall
pipeline is textbook fiction.

---

## 1. The lifecycle, with gates

| Stage | Gate artifact | "Done" means | Indie divergence |
|---|---|---|---|
| **Concept/pitch** | One-pager + pitch deck (hook, genre **comps**, audience, team, ask) | Someone with money agrees it should exist | A tweet-length hook + Steam comp research |
| **Pre-production** | Throwaway prototypes + lean GDD + risk register | **"The fun is found"** — core loop playtests well with strangers; tech risks retired | Same, informal |
| **Vertical slice** | The VS build: one small segment at **final quality bar** | A stranger plays 10-30 min that feels like the shipped game. It's a *quality proof*, not "level 1 done" — usually rebuilt in production | The polished Steam demo doubles as the VS |
| **Production** | Milestone builds every 4-12 weeks | All systems in, content blocked out | Rolling, straight toward demo/EA |
| **Alpha** | **Feature-complete** build ("feature lock" — no new mechanics after) | Full QA ramp + optimization begin | Informal; "the Discord build" |
| **Beta** | **Content-complete** build ("content lock" — bugs/balance/perf only) | Zero missing content | Demo/EA branch |
| **Cert** | Release candidate + TRC/XR/lotcheck evidence | Platform holder passes the build | **Skipped unless console** — Steam has no cert ($100 Direct fee + store review). Console: plan **2-3 rounds, 6-10 weeks per platform**; most indies use a porting partner who owns cert |
| **Gold** | Ship build; **day-one patch developed in parallel is normal**, not failure | | Steam "gold" is soft — updatable until the button |
| **Live-ops** | Roadmap, patch cadence, events | Never done | Post-launch updates + community |

**AAA mode:** gates are **contractual** — publisher milestone payments attach to
gate approval; internal greenlight ladders (concept → prototype → VS →
production → ship review) genuinely kill projects at each rung, and healthy
studios celebrate cheap kills. **Indie mode:** same lifecycle, informal gates,
role-collapse (§2), and marketing-from-prototype (§5).

## 2. The discipline map (and indie collapse)

- **Design** splits at scale: game director (vision, final call) / **systems**
  (mechanics, designs *and implements* in-engine) / **level** (player flow,
  encounters, blockout long before art) / **economy-balance** (spreadsheets +
  simulation) / **narrative designer ≠ writer** (integrates story into systems —
  branching logic, barks, quest structure; writers write the prose) /
  **technical designer** (designer who codes, owns designer tools) / **UX**.
- **Production:** the producer is *not the boss* — removes blockers, owns the
  milestone schedule and tracker. "Scrum-but" is universal: sprints exist, but
  milestone/cert dates dominate.
- **Engineering:** gameplay / engine-systems / **tools (chronically understaffed,
  highest leverage)** / graphics / network / build-DevOps.
- **Art:** concept / 3D (environment-character-props) / **technical artist**
  (shaders, rigging, pipeline — the art↔engineering bridge) / animation / VFX /
  UI / art director (owns the art bible).
- **Audio:** **composer** (often contract even at AAA) ≠ **sound designer**
  (SFX/foley/implementation) ≠ audio programmer. Implementation lives in
  **FMOD/Wwise middleware**, not the engine, wherever a dedicated audio person exists.
- **QA is three disciplines:** functional (bugs) / **compliance-cert** (knows the
  TRC/XR/lotcheck line items, runs mock-cert) / embedded automation (SDET).
  Fun-testing (playtest) is a *fourth*, owned by design/UR, not QA.
- **Indie collapse (1-5 people):** solo = design+code+production+marketing, with
  art/audio **bought** (asset packs, contract composer, capsule artist).
  Classic 2-person split: code+design / art+design. The roles indies most
  dangerously skip: **producer (scope control), UX, and marketing-as-a-discipline.**

## 3. Artifacts that actually get written

| Artifact | Reality | Living? |
|---|---|---|
| One-pager/pitch | Universal; publishers reject on hook/comps | Per pitch round |
| **GDD** | The 200-page monolith is **dead**. Modern: a living wiki, one page per system, cross-linked; the **build is the truth** and stale GDDs are distrusted | **Living** |
| Technical design doc | Per-*risky*-system (netcode, saves, streaming), ADR-style + spike | Per system |
| **Art bible** | Real wherever >1 artist or outsourcing: palette, shape language, material rules, budgets — the outsourcing quality anchor | Frozen-ish in production |
| Audio design doc | At teams with an audio lead: sonic direction, mix rules, middleware event naming, memory/voice budgets | Semi-living |
| Level design docs | Blockout maps + flow diagrams + beat charts per level | Until content lock |
| **Balance spreadsheets** | The most-used design artifact in the industry — sheets exported to JSON/CSV the build consumes, paired with simulation scripts | **Living forever** |
| Milestone schedule | Contractual at AAA; Notion/Trello roadmap indie | Renegotiated |
| Cert checklists | NDA'd, hundreds of items; studios keep internal pre-cert lists (save-data interruption, controller disconnect, storage-full are the classic indie fails) | Per SDK version ⚠ |

## 4. Find the fun (pre-production discipline)

- **Time-boxed 2-4 week prototypes with success criteria written BEFORE
  building** — which mechanics to validate and how fun will be assessed.
  Throwaway code is correct; wrong-engine/paper prototypes are fine.
- **Kill criteria are defined at the gate.** Without them a prototype produces
  opinions, not answers. Indie kill criteria are as much *market* (comp titles'
  median revenue, hook testability) as fun.
- **Playtest practice:** test with people who have **never seen the game** (the
  team goes noseblind in days); AAA runs moderated playtests at ~5 canonical
  points (concept, first playable, alpha, beta, pre-launch);
  **telemetry-driven tuning** is standard at AA+ — instrumented builds stream
  deaths/positions/completions → heatmaps and funnel drop-offs → tune from
  data, not anecdotes. Indies approximate with Steam demo stats + Discord +
  lightweight analytics.

## 5. Indie go-to-market reality ⚠ (numbers move yearly)

- **The Steam page IS the marketing plan.** Ship "Coming Soon" as soon as
  trailer + screenshots exist — commonly **6-12 months pre-launch**; wishlists
  compound and seed launch visibility. Capsule art quality measurably moves CTR.
- **Wishlist math:** median first-month sales ≈ **~27% of launch wishlists**;
  <5k = quiet launch; 7-10k+ to crack Popular Upcoming.
- **Next Fest is an amplifier, not a discovery engine** (3×/year; one entry per
  game — time it 1-6 months pre-launch): bring <1k wishlists → median +462;
  10k+ → +6,360. Counterintuitive: **~68-88% of Next Fest wishlists come from
  people who never download the demo** — capsule/trailer do the work. The demo
  is your vertical slice doing double duty.
- **Early Access: EA launch = THE launch.** Only ~20% of EA graduates do better
  at 1.0; median 1.0 30-day revenue ≈ 40% of EA-launch. Median EA duration ~14
  months; price EA ~20-30% below 1.0. Suits systems-driven replayable games;
  punishes narrative games.
- **Console porting:** register at platform portals → concept approval →
  devkits under NDA; most indies use a porting partner. Submit to the strictest
  platform first (Nintendo/Sony) — pass there and Xbox usually passes first try.
- Ongoing: launch-week streamer/curator keys beat press for most genres; a
  Discord from first demo onward is the standing playtest pool.

## 6. What this means for the agent pipeline

1. **Gate on builds, not docs** — the vertical-slice gate is the centerpiece;
   pre-production adds a *prototype gate with kill criteria*; production adds
   *alpha (feature lock)* and *beta (content lock)* labels.
2. **Three verification disciplines, three owners:** is it fun (playtest +
   telemetry) / is it correct (functional QA) / is it compliant (cert).
3. **Indie mode = role-collapse + GTM-from-prototype; AAA mode = contractual
   gates + cert discipline.** Ask which mode the project is in; the same
   lifecycle applies with different formality.
4. Balance work is spreadsheet+simulation-shaped; GDDs are living wikis;
   marketing starts at the prototype, not at beta.
