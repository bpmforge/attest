---
description: 'Reference document — read on demand, not an agent. The runnable QA/V&V technique library for qa-vnv-engineer: layout-defect detection, visual regression, resilient journey automation, evidence/reporting, and axe accessibility.'
disable: true
mode: "all"
---

# QA & V&V Testing Playbook

The runnable technique behind `qa-vnv-engineer`. Load this before building
checks — it has the exact geometry math, computed-style extraction, Playwright
config, and reporter wiring so you never guess an API from memory.

**Targets:** Playwright Test (`@playwright/test`) v1.4x, Node/TypeScript;
accessibility via `@axe-core/playwright` (axe-core 4.x). Confirm exact flag names
against the project's pinned versions — a few options noted with ⚠ move between
minor releases.

Interactive (playwright-mcp) runs use `agents/shared/BROWSER_TESTING.md`. Durable
suites build on the config/fixtures in `agents/test/E2E_INFRASTRUCTURE.md`.

---

## 0. The two disciplines (say it in the report)

- **Verification** — *"did we build it right?"* Conformance of the artifact to
  its spec/design/acceptance criteria. Spec-referenced.
- **Validation** — *"did we build the right thing?"* Fitness of the running
  system for real user need, in the real browser/viewport. User-referenced.

A screen that renders exactly per the mockup (verification ✓) but that no user
can complete the task on (validation ✗) is the classic split. IEEE 1012 frames
V&V as an *independent* process (maker ≠ checker), rigor scaled to an integrity
level. ISO/IEC/IEEE 29119 supplies the document vocabulary below (test plan,
test design, RTM, completion report) — cite it as vocabulary, not gospel.

---

## 1. V&V artifacts you own

| Artifact | Practical contents |
|---|---|
| **Test plan** | Scope, items, features to/not-to test, approach, environment, entry/exit criteria, risks. |
| **Test cases** | Preconditions, steps, test data, **expected result**, postconditions — each traces to ≥1 requirement. |
| **Requirements Traceability Matrix (RTM)** | Bidirectional **Requirement → Test → Result → Defect → Evidence**. The spine: no orphan requirement (untested), no orphan test (untraceable). |
| **Entry criteria** | Must hold before testing starts: app deployed, smoke green, seed data present, auth available. |
| **Exit criteria** | To declare done: e.g. 100% P0 executed, ≥95% pass, 0 open Critical/High, coverage ≥ target, every requirement traced. |
| **Acceptance criteria** | Per-story testable conditions of satisfaction (Given/When/Then). The user's definition of correct. |
| **Defect report** | Repro, actual vs expected, environment, **evidence** (trace/video/screenshot/log), severity, priority. |
| **Completion report** | Executed vs planned, pass/fail, defect density, coverage %, residual risk, release recommendation. |

### RTM template
```markdown
| Req / UC / AC | Test id            | Type | Result | Defect  | Evidence                         |
|---------------|--------------------|------|--------|---------|----------------------------------|
| AC-142        | e2e/settings.spec  | V    | PASS   | —       | evidence/2026-07-15/settings.zip |
| REQ-90        | layout @ 375w      | V    | FAIL   | BUG-311 | evidence/.../overflow-375.png    |
```
Every row resolves; every row links a real artifact. Coverage = rows-with-a-test
÷ requirements; it's a computable exit criterion.

### Defect taxonomy — keep severity ⟂ priority (always separate)
- **Severity** (technical impact, set by QA):
  - **S1 Critical/Blocker** — crash, data loss, security, core flow unusable, no workaround
  - **S2 Major** — major function broken, workaround painful
  - **S3 Minor** — non-core/degraded UX, workaround exists
  - **S4 Trivial** — cosmetic, typo, minor misalignment
- **Priority** (business urgency, set by PO): P1 (now) → P4 (if time).
- The matrix matters: a **low-severity / high-priority** bug (typo in the
  company name on the landing page) is real. Never collapse the axes. Map
  axe `impact` (critical/serious/moderate/minor) and Playwright failure class
  onto S1–S4.

### Acceptance criteria — the validation contract (Gherkin)
```gherkin
Feature: Change notification setting
  Scenario: User disables email notifications
    Given a signed-in user on the home page
    When they open the avatar menu and go to Settings > Notifications
    And they toggle "Email notifications" off
    Then the toggle shows off
    And a "Preferences saved" confirmation appears
    And on reload the toggle is still off   # persistence = the real validation
```

---

## 2. Layout / visual DEFECT detection (deterministic, no baseline needed)

Run inside the page via `page.evaluate()`. These tell you *what and why* (this
panel overflows by 40px at 375w) where a screenshot only tells you *that*
something changed. Run these **before** pixel diffs; lead defect reports with the
measured number, attach the diff as corroboration.

### 2a. Overlap / collision (getBoundingClientRect intersection)
```ts
// Returns pairs of selectors whose boxes intersect beyond `tolerance` px.
async function findOverlaps(page, selectors: string[], tolerance = 0) {
  return page.evaluate(({ selectors, tolerance }) => {
    const nodes = selectors.map(sel => {
      const el = document.querySelector(sel);
      return el ? { sel, el, r: el.getBoundingClientRect() } : null;
    }).filter(Boolean) as { sel: string; el: Element; r: DOMRect }[];

    const intersect = (a: DOMRect, b: DOMRect) => {
      const x = Math.min(a.right, b.right)  - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return x > tolerance && y > tolerance ? { overlapX: x, overlapY: y, area: x * y } : null;
    };

    const hits: any[] = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i], B = nodes[j];
        // Legitimate overlaps: one contains the other (icon in button, modal over backdrop).
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        const o = intersect(A.r, B.r);
        if (o) hits.push({ a: A.sel, b: B.sel, ...o });
      }
    return hits;
  }, { selectors, tolerance });
}
```
Overlap alone ≠ defect — nested/stacked elements legitimately overlap. Filter by
DOM relationship (done above) and restrict `selectors` to panels you expect to be
disjoint (`.sidebar`, `.main`, `.header`, `.footer`, cards in a grid).

### 2b. Real color + WCAG contrast (getComputedStyle)
```ts
async function contrastReport(page, selector: string) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector) as HTMLElement;
    const cs = getComputedStyle(el);
    const fg = cs.color;                                  // resolved, e.g. "rgb(51, 51, 51)"
    let bgEl: HTMLElement | null = el, bg = 'rgba(0, 0, 0, 0)';
    while (bgEl) {                                        // first non-transparent backdrop
      const c = getComputedStyle(bgEl).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break; }
      bgEl = bgEl.parentElement;
    }
    const parse = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]: number[]) => {               // WCAG relative luminance
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const L1 = lum(parse(fg)), L2 = lum(parse(bg));
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const fontPx = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = fontPx >= 24 || (fontPx >= 18.66 && bold);   // WCAG "large text"
    const req = large ? 3.0 : 4.5;                              // AA (AAA = 4.5 / 7)
    return { fg, bg, ratio: +ratio.toFixed(2), required: req, passAA: ratio >= req, fontPx, large };
  }, selector);
}
```
Thresholds: **AA** 4.5:1 normal / 3:1 large; **AAA** 7:1 / 4.5:1. The ancestor-walk
approximates the backdrop; for the audit of record use axe (§6), which handles
gradients, overlap, and opacity. Compare `fg`/`bg` to `docs/design/tokens.json`
when present — color drift from the tokens is a **verification** finding.

### 2c. Overflow / clipping / truncation / offscreen
```ts
async function overflowReport(page, selector: string) {
  return page.evaluate((selector) => {
    const els = [...document.querySelectorAll(selector)] as HTMLElement[];
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    return els.map(el => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      return {
        overflowX: el.scrollWidth  - el.clientWidth,     // content wider than its box
        overflowY: el.scrollHeight - el.clientHeight,
        isTruncated: el.scrollWidth > el.clientWidth &&
                     (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden'),
        clipped: (cs.overflow === 'hidden' || cs.overflowY === 'hidden') && el.scrollHeight > el.clientHeight,
        offscreen: r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh,
        text: (el.textContent || '').trim().slice(0, 60),
      };
    }).filter(x => x.overflowX > 1 || x.overflowY > 1 || x.offscreen);
  }, selector);
}
```
**Global horizontal-scroll smell** (the #1 responsive defect):
```ts
const hScroll = await page.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth);
// then find the culprit(s):
const wideEls = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter(el => el.getBoundingClientRect().right > window.innerWidth)
  .map(el => ({ tag: el.tagName, cls: el.className, right: Math.round(el.getBoundingClientRect().right) }))
  .slice(0, 20));
```

### 2d. Responsive matrix
```ts
const VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'laptop',  width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
];

for (const vp of VIEWPORTS) {
  test(`layout integrity @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    const hScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hScroll, `horizontal overflow at ${vp.name}`).toBe(false);
    const overlaps = await findOverlaps(page, ['.sidebar', '.main', '.header', '.footer']);
    expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
  });
}
```
Prefer Playwright's `devices` presets (`import { devices } from '@playwright/test'`;
`devices['iPhone 13']`) in `projects[]` for real UA + viewport + DPR when emulating
a named device.

---

## 3. Visual regression

Two camps: framework-owned snapshots (Playwright built-in, backed by
`pixelmatch`) vs AI-diffing cloud (Applitools, Percy, Chromatic, Lost Pixel).
Pixel diffing is free + self-hosted but flaky on fonts/anti-aliasing; perceptual
diffing suppresses noise but adds a vendor.

### 3a. Playwright `toHaveScreenshot()` — verified defaults
| Option | Default | Meaning |
|---|---|---|
| `threshold` | **0.2** | Per-pixel YIQ color-diff tolerance, 0 strict → 1 lax |
| `maxDiffPixels` | unset | Absolute differing-pixel budget |
| `maxDiffPixelRatio` | unset | Fraction (0–1) of differing pixels allowed |
| `animations` | **"disabled"** | Freezes CSS/Web animations for stable shots |
| `caret` | **"hide"** | Hides text caret |
| `mask` | — | Locators overlaid with a solid box pre-capture |
| `maskColor` | **"#FF00FF"** | Mask fill |
| `scale` | **"css"** | CSS pixels (DPR-independent) — key for cross-machine stability |
| `stylePath` | — | Inject CSS before capture (hide dynamic regions) |
| `fullPage` | **false** | Whole scrollable page vs viewport |

```ts
// playwright.config.ts
export default defineConfig({
  expect: {
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.01,   // tolerate ≤1% differing pixels (anti-alias/font noise)
      animations: 'disabled',
      scale: 'css',
      stylePath: './tests/screenshot.css',
    },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
});
```
```ts
await expect(page).toHaveScreenshot('dashboard.png', {
  mask: [page.locator('.timestamp'), page.getByTestId('user-avatar'), page.locator('.ad-slot')],
  maxDiffPixels: 100,
});
```
```css
/* tests/screenshot.css — neutralize non-determinism */
*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
.timestamp, .live-clock { visibility: hidden !important; }
```
**Baseline lifecycle:** first run with no baseline **fails** and writes the
reference PNG (committed to git). On intended change:
`npx playwright test --update-snapshots` (⚠ has `missing`/`changed`/`all` sub-modes
in current versions — scope with `-g`/project to avoid clobbering). Failures emit
`-expected.png` / `-actual.png` / `-diff.png` into `test-results/`, embedded in the
HTML report for review. **Generate baselines inside the CI container** (or the
pinned `mcr.microsoft.com/playwright:v1.4x` image) and commit those — dev-vs-CI
font/anti-alias rendering is the #1 source of visual flake. New/changed diffs are
findings **pending human review**, never silent auto-updates.

### 3b. pixelmatch directly
```ts
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
const diff = new PNG({ width, height });
const numDiff = pixelmatch(baseline.data, actual.data, diff.data, width, height,
  { threshold: 0.1, includeAA: false }); // includeAA:false ignores anti-aliased pixels
```

### 3c. Hosted / AI platforms — selection heuristic
- **Chromatic** (Storybook team; TurboSnap re-snaps only changed stories) → component-driven teams.
- **Playwright built-in** → existing E2E, zero new deps.
- **Applitools Eyes** / **Percy** (AI/perceptual diff, noise suppression; Percy's Visual Review Agent, late 2025) → dynamic-content pain + budget.
- **Lost Pixel** (OSS, Percy/Chromatic-shaped) → want cloud-review UX without lock-in.

---

## 4. User-JOURNEY automation (resilient + self-documenting)

Rules pros follow:
1. **Accessible/role-based locators first** — `getByRole`, `getByLabel`,
   `getByText`, `getByPlaceholder`; fall back to `getByTestId` only when there's
   no accessible handle. Avoid CSS/XPath tied to structure or generated classes.
2. **Auto-waiting + web-first assertions** — Playwright waits for actionability;
   `expect(locator).toBeVisible()` retries. **Never `waitForTimeout`** — assert
   the condition.
3. **Page Object Model** — selectors + interactions per page/section; a UI change
   is a one-file edit.
4. **Handle hidden/dynamic nav explicitly** — open the disclosure (avatar menu)
   as a step; assert the menuitem is visible before clicking.
5. **Prove the outcome** — assert control state **and persistence** (reload).

The stated scenario, as Page Objects (home → avatar → Settings → tab → toggle →
assert + persist):
```ts
// pages/AppHeader.ts
import { Page, Locator, expect } from '@playwright/test';
export class AppHeader {
  constructor(private page: Page) {}
  get avatarButton(): Locator { return this.page.getByRole('button', { name: /account|profile|user menu/i }); }
  async openSettings() {
    await this.avatarButton.click();                                  // reveal hidden dropdown
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Settings' }).click();   // -> /settings
  }
}

// pages/SettingsPage.ts
export class SettingsPage {
  constructor(private page: Page) {}
  get notificationsTab(): Locator { return this.page.getByRole('tab', { name: 'Notifications' }); }
  get emailToggle(): Locator      { return this.page.getByRole('switch', { name: 'Email notifications' }); }
  async gotoNotifications() {
    await this.notificationsTab.click();
    await expect(this.page.getByRole('tabpanel', { name: 'Notifications' })).toBeVisible();
  }
  async setEmailNotifications(on: boolean) {
    const isOn = (await this.emailToggle.getAttribute('aria-checked')) === 'true';
    if (isOn !== on) await this.emailToggle.click();
    await expect(this.emailToggle).toHaveAttribute('aria-checked', String(on));
  }
}
```
```ts
// e2e/settings.spec.ts
import { test, expect } from '@playwright/test';
import { AppHeader } from '../pages/AppHeader';
import { SettingsPage } from '../pages/SettingsPage';

test('user disables email notifications and it persists', async ({ page }) => {
  await page.goto('/');                                   // storageState auth (see §5 / E2E_INFRASTRUCTURE)
  await test.step('Navigate to Notifications settings', async () => {
    await new AppHeader(page).openSettings();
    await expect(page).toHaveURL(/\/settings/);
    await new SettingsPage(page).gotoNotifications();
  });
  const settings = new SettingsPage(page);
  await test.step('Toggle email notifications off', async () => {
    await settings.setEmailNotifications(false);
    await expect(page.getByText('Preferences saved')).toBeVisible();
  });
  await test.step('Verify persistence after reload', async () => {
    await page.reload();
    await settings.gotoNotifications();
    await expect(settings.emailToggle).toHaveAttribute('aria-checked', 'false');
  });
});
```
`test.step()` gives named phases that appear in the HTML report and trace —
critical for evidence. Auth once via a setup project writing `storageState` so
journeys don't re-login (see `E2E_INFRASTRUCTURE.md`).

---

## 5. Evidence & reporting ("show me proof")

Attach, per failing (and often passing) step: **trace** (DOM snapshots + action
log + network + console, time-travel), **video**, **screenshots** (per-step /
on-failure, incl. the visual `-diff.png`), console/network logs, plus **JUnit
XML** (CI) and a human **HTML/Allure** report. The RTM links each result to its
requirement.

### 5a. Capture config (verified modes)
```ts
// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'on-first-retry',        // full trace on failure retry (cheap + useful)
    // trace: 'retain-on-failure',  // if not running retries
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // heavy evidence run (audits/demos): trace:'on', video:'on', screenshot:'on'
  },
  retries: process.env.CI ? 2 : 0,
});
```
`trace` modes: `off | on | on-first-retry | on-all-retries | retain-on-failure`.
View: `npx playwright show-trace trace.zip` or `trace.playwright.dev`. The trace
is the single most valuable artifact — lead defect reports with it.

### 5b. Reporters
```ts
reporter: [
  ['list'],
  ['html',  { open: 'never', outputFolder: 'playwright-report' }],
  ['junit', { outputFile: 'results/junit.xml' }],   // CI analytics ingestion
  ['json',  { outputFile: 'results/results.json' }],
  ['allure-playwright', { resultsDir: 'allure-results', detail: true, suiteTitle: true }],
],
```
- **HTML** — self-contained; embeds screenshots, video, trace links, step tree, diffs. Ship as the run's shareable artifact.
- **JUnit XML** — machine-readable; GitHub/GitLab/Jenkins test reporting.
- **Allure** — richest for QA: steps, attachments, severity labels, history/trends, defect categories.

### 5c. Allure attachments + RTM labels (verified API)
```ts
import { test } from '@playwright/test';
import * as allure from 'allure-js-commons';   // ⚠ confirm path against installed allure-js v3.x

test('checkout flow', async ({ page }, testInfo) => {
  await allure.severity('critical');
  await allure.label('requirement', 'REQ-142');   // ties evidence to the RTM
  await allure.step('Add item to cart', async () => {
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await allure.attachment('screenshot', await page.screenshot(), 'image/png');
  });
});
```
Attach the trace to any reporter:
```ts
await testInfo.attach('trace', { path: testInfo.outputPath('trace.zip'), contentType: 'application/zip' });
```
`allure-playwright` auto-attaches whatever `use` captured, so §5a feeds Allure for
free. Serve: `npx allure generate allure-results -o allure-report --clean && npx allure open`.

### 5d. Per-step screenshot helper (evidence trail without full trace)
```ts
async function step(page, testInfo, name: string, fn: () => Promise<void>) {
  await test.step(name, async () => {
    await fn();
    await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
  });
}
```

### 5e. CI wiring — every run yields a shareable report
```yaml
# .github/workflows/e2e.yml
jobs:
  e2e:
    runs-on: ubuntu-latest
    container: mcr.microsoft.com/playwright:v1.40.0-jammy   # ⚠ pin to your PW version -> stable baselines
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: |
            playwright-report/
            results/junit.xml
            test-results/            # traces, videos, diff PNGs
          retention-days: 30
      - name: Publish JUnit to checks
        if: ${{ !cancelled() }}
        uses: mikepenz/action-junit-report@v4
        with: { report_paths: 'results/junit.xml' }
```
Upload on failure **and** success so the report is always retrievable. Pinning the
container = consistent fonts = stable visual baselines.

---

## 6. axe-core accessibility (validation gate)

WCAG A/AA is a real user requirement. `@axe-core/playwright` wraps axe-core 4.x.
```ts
import AxeBuilder from '@axe-core/playwright';

test('home page has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```
Scope / exclude / rule control:
```ts
const results = await new AxeBuilder({ page })
  .include('main')
  .exclude('#third-party-widget')
  .withTags(['wcag2aa'])
  .disableRules(['color-contrast'])   // e.g. handled separately in §2b
  .analyze();
```
Attach machine-readable findings (each violation carries `id`, `impact`
critical/serious/moderate/minor, `help`, `helpUrl`, per-node `html` +
`failureSummary` — map `impact` → S1–S4):
```ts
await testInfo.attach('axe-results', {
  body: JSON.stringify(results.violations, null, 2), contentType: 'application/json',
});
```
Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` (⚠ 2.2 coverage
depends on axe-core version), `best-practice`. axe catches ~30–50% of WCAG issues
automatically — keyboard nav, focus order, meaningful alt text, and reflow still
need the manual checklist. axe = automated verification layer; manual audit =
validation layer. Deep remediation → `a11y-compliance`; you produce the evidence.

---

## 7. Synthesis — the run order

1. **Deterministic checks (§2) before pixel diffs (§3).** Geometry/computed-style
   tells you *what and why*; screenshots tell you *that*. Run both; lead with the
   deterministic finding + trace, attach the diff PNG.
2. **Separate severity from priority** on every defect.
3. **Every test carries a `requirement` label** so the run auto-populates the RTM;
   coverage becomes a computable exit criterion.
4. **Evidence is non-negotiable:** `trace: 'on-first-retry'` + `video:
   'retain-on-failure'` + `screenshot: 'only-on-failure'` + HTML + JUnit + Allure,
   uploaded from CI every run. The trace zip is the primary artifact.
5. **Baselines live in the pinned CI container**, committed to git.
6. **Role-based locators + POM + `test.step`** = journeys that are resilient *and*
   self-documenting in the evidence.

### Version-sensitive — re-verify against pinned versions
- Playwright `toHaveScreenshot` defaults above are current (threshold 0.2,
  animations "disabled", maskColor #FF00FF, scale "css", caret "hide"); confirm
  `--update-snapshots` sub-mode names for your minor version.
- Vendor features move fast (Percy Visual Review Agent late-2025; Applitools Eyes
  Storybook Addon early-2026; Chromatic TurboSnap) — "current as of early-mid 2026."
- axe-core `wcag22aa` coverage depends on the version pinned by `@axe-core/playwright`.
- `allure-js-commons` import path (`allure.step/attachment/label`) is the current
  unified API; older guides use `allure-playwright`'s export — confirm against installed v3.x.
