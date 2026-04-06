# Playwright Configuration Reference

Use this reference when setting up or reviewing Playwright test configurations.

## Standard Config
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Best Practices

### Selectors
- Prefer `data-testid` attributes: `page.locator('[data-testid="submit"]')`
- Avoid CSS classes (change with styling)
- Avoid XPath (fragile)
- Use role selectors for accessibility: `page.getByRole('button', { name: 'Submit' })`

### Waiting
- `await page.waitForLoadState('networkidle')` after navigation
- `await expect(locator).toBeVisible()` before interaction
- Never use `page.waitForTimeout()` — use proper assertions

### Page Object Model
```typescript
// pages/login.page.ts
export class LoginPage {
  constructor(private page: Page) {}
  readonly email = this.page.locator('[data-testid="email"]');
  readonly password = this.page.locator('[data-testid="password"]');
  readonly submit = this.page.locator('[data-testid="login-submit"]');

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
```

### Assertions
- `await expect(locator).toBeVisible()` — element exists and is visible
- `await expect(locator).toHaveText('Expected')` — text content match
- `await expect(locator).toHaveCount(5)` — number of matching elements
- `await expect(page).toHaveURL(/dashboard/)` — URL match

### Parallel Execution
```typescript
test.describe.configure({ mode: 'parallel' });
```

### Mobile Testing
```typescript
test.use({ viewport: { width: 375, height: 667 } });
```
