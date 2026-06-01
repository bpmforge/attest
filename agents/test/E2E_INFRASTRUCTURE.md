---
name: e2e-infrastructure
description: Canonical Playwright and Cypress infrastructure templates — playwright.config.ts, auth.setup.ts, fixtures.ts, global-setup.ts, BasePage.ts, CI workflow. Also includes integration test patterns (in-memory DB, transaction rollback, test containers). Load when scaffolding a new E2E test suite.
metadata:
  type: protocol
---

# E2E Infrastructure Templates

Load this when producing Phase 3.5/4 E2E infrastructure deliverables. These templates are checked by `validate-e2e-setup.sh` and enable UC-level pass/fail verdicts via `validate-tests-mapping.sh`.

---

## Playwright Infrastructure

Every SDLC project using Playwright MUST produce these files.

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/',
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  // MANDATORY — validate-tests-mapping.sh reads test-results.json for UC verdicts
  reporter: [
    ['json', { outputFile: 'test-results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  projects: [
    { name: 'setup', testMatch: '**/auth.setup.ts' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
    // Optional cross-browser:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'], storageState: 'e2e/.auth/user.json' }, dependencies: ['setup'] },
  ],
});
```

### e2e/auth.setup.ts — saves session once, all tests reuse it

```typescript
import { test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', process.env.TEST_USER_EMAIL!);
  await page.fill('[data-testid="password"]', process.env.TEST_USER_PASSWORD!);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: authFile });
});
```

### e2e/pages/BasePage.ts — Page Object Model base

```typescript
import { type Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}
  async waitForLoad() { await this.page.waitForLoadState('networkidle'); }
  async getToastMessage() { return this.page.getByTestId('toast').textContent(); }
}
```

Each page gets a class under `e2e/pages/`. Properties hold locators; methods hold actions. Tests call page methods — selectors never appear in spec files.

### e2e/fixtures.ts — custom test.extend() fixtures

```typescript
import { test as base, expect } from '@playwright/test';

type AppFixtures = {
  // API-level helper: faster than UI for test data setup/teardown
  api: {
    post(path: string, data: unknown): Promise<unknown>;
    del(path: string): Promise<void>;
  };
};

export const test = base.extend<AppFixtures>({
  api: async ({ request }, use) => {
    const cleanup: Array<() => Promise<void>> = [];
    await use({
      async post(path, data) {
        const res = await request.post(path, { data });
        return res.json();
      },
      async del(path) {
        cleanup.push(() => request.delete(path).then(() => {}));
      },
    });
    for (const fn of cleanup) await fn().catch(() => {});
  },
});

export { expect };
```

All spec files import `{ test, expect }` from `./fixtures`, never from `@playwright/test`.

### e2e/global-setup.ts — DB reset + seed before the test run

```typescript
import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';

export default async function globalSetup(_config: FullConfig) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  execSync('npx prisma migrate reset --force --skip-seed', { stdio: 'inherit' });
  execSync('npx prisma db seed',                          { stdio: 'inherit' });
}
```

Adjust for your ORM/migration tool. Key invariant: every test run starts from a known-clean database state.

### CI workflow (.github/workflows/e2e.yml or .gitea/workflows/e2e.yml)

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
        env: { NODE_ENV: production }
      - name: Start app
        run: npm start &
        env: { NODE_ENV: test, DATABASE_URL: sqlite:./test.db,
               TEST_USER_EMAIL: test@example.com, TEST_USER_PASSWORD: testpass }
      - run: npx wait-on http://localhost:3000/health --timeout 30000
      - run: npx playwright test
        env: { CI: 'true', TEST_BASE_URL: 'http://localhost:3000' }
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: playwright-report, path: playwright-report/, retention-days: 30 }
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: test-results-json, path: test-results.json, retention-days: 30 }
```

For sharding across runners (large suites):
```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]
steps:
  - run: npx playwright test --shard=${{ matrix.shard }}/4
```

---

## Cypress Equivalent Patterns

If using Cypress instead of Playwright, produce:
- `cypress.config.ts` with `reporter: 'mochawesome'` (or `@cypress/junit-reporter`) and `outputFile`
- `cypress/support/commands.ts` — custom `cy.login()`, `cy.createFixture()` commands
- `cypress/fixtures/` — JSON fixture files
- `cypress/e2e/uc-NNN-*.cy.ts` — spec files with `describe('UC-NNN: ...')` naming

---

## Integration Test Patterns

Use real dependencies where possible (in-memory DB, test containers). Test the full request → service → database → response cycle. Clean up between tests.

**In-memory database (SQLite):**
```typescript
beforeEach(async () => {
  db = new Database(':memory:');
  await runMigrations(db);
});
afterEach(() => db.close());
```

**Transaction rollback:**
```typescript
let tx: Transaction;
beforeEach(async () => { tx = await db.beginTransaction(); });
afterEach(async () => { await tx.rollback(); });
```

**Test containers (when in-memory isn't enough):**
```typescript
const container = await new PostgreSqlContainer().start();
const connectionString = container.getConnectionUri();
```
