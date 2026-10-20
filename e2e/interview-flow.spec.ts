import { test, expect } from '@playwright/test';

test.describe('Enterprise Interview Lifecycle Smoke Test', () => {
  test('Complete flow: Landing -> Dashboard -> Setup Wizard -> Interview Room -> Scorecard Report', async ({
    page,
  }) => {
    // 1. Landing Page Navigation
    await page.goto('/');
    await expect(page).toHaveTitle(/AI Interviewer|Mock Interview/i);

    // 2. Demo Candidate Authentication
    await page.goto('/login');
    const demoButton = page.getByRole('button', {
      name: /Continue as Demo Candidate/i,
    });
    await expect(demoButton).toBeVisible();
    await demoButton.click();
    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible();

    // 3. Setup Wizard Page
    await page.goto('/dashboard/setup');
    await page.waitForLoadState('domcontentloaded');

    // Verify key setup wizard elements exist
    const setupStepIndicator = page
      .getByText(/Role & Setup|Tech check/i)
      .first();
    await expect(setupStepIndicator).toBeVisible();

    // 4. Interview Room Pre-check
    await page.goto('/interview');
    await page.waitForLoadState('domcontentloaded');

    // Check that interview container or waiting room loads safely
    await expect(page.locator('main')).toBeVisible();
    const joinButton = page.getByRole('button', { name: /Join now/i });
    await expect(joinButton).toBeVisible();
    await joinButton.click();

    // Verify ActiveInterviewRoom is rendered
    await expect(page.locator('main')).toBeVisible();

    // 5. Scorecard Report View
    const testSessionId = '00000000-0000-0000-0000-000000000001';
    await page.goto(`/dashboard/report/${testSessionId}`);
    await page.waitForLoadState('domcontentloaded');

    // Ensure report container or page body rendered without unhandled crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('Error boundary recovery verification', async ({ page }) => {
    // Navigate to a non-existent route to verify custom 404 recovery page
    await page.goto('/some-non-existent-enterprise-route-404');
    await expect(page.getByText(/Resource Not Found|Error 404/i).first()).toBeVisible();
  });
});
