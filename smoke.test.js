// Smoke tests: load the actual page in a real (headless) browser and check
// that nothing is visibly broken. These don't need window.__TEST__ — they
// exercise the app the way a real visitor's browser would, including all
// its real CDN imports (WebLLM, Firebase) and the WebGPU capability check.
//
// This tier is intentionally shallow. It won't (and can't, in CI) actually
// download a multi-gigabyte model or run GPU inference — see /tests/README.md
// for why that's a deliberate boundary, not an oversight.

const { test, expect } = require('@playwright/test');

test('loads with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`uncaught exception: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/index.html');
  // Give the module script (imports, Firebase init, the WebGPU adapter
  // check) a moment to finish settling before judging the error list.
  await page.waitForTimeout(2000);

  expect(errors, `Unexpected console errors:\n${errors.join('\n')}`).toEqual([]);
});

test('shows the PotatoPowered title', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page).toHaveTitle(/PotatoPowered/);
});

test('shows the sign-in screen for a signed-out visitor', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#authForm')).toBeVisible();
});

test('model picker lists the expected models', async ({ page }) => {
  await page.goto('/index.html');
  const options = await page.locator('#modelSelect option').allTextContents();
  expect(options.join(' ')).toContain('SmolLM2 360M');
  expect(options.join(' ')).toContain('Llama 3.2 1B');
});

test('the header potato icon renders (not a broken/empty background)', async ({ page }) => {
  await page.goto('/index.html');
  const bgImage = await page.locator('#statusDot').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bgImage).toContain('data:image/png;base64');
});

test('WebGPU capability check degrades gracefully instead of throwing', async ({ page }) => {
  // Headless Chromium in CI typically has no real GPU adapter available,
  // which makes this a natural, free regression test for the exact fix
  // made earlier in this project: a missing/non-functional adapter should
  // route to the CPU-fallback messaging, not an uncaught error.
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/index.html');
  await page.waitForTimeout(1500);

  const hasAdapter = await page.evaluate(async () => {
    if (!('gpu' in navigator)) return false;
    try {
      return !!(await navigator.gpu.requestAdapter());
    } catch {
      return false;
    }
  });

  if (!hasAdapter) {
    const noteText = await page.locator('#systemNote').innerText();
    expect(noteText).toContain("doesn't support WebGPU");
    expect(await page.locator('#modelSelect').isDisabled()).toBe(true);
  }

  expect(errors).toEqual([]);
});
