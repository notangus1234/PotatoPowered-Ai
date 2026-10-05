# PotatoPowered tests

Nothing in this folder (or `package.json`, `playwright.config.js`, the
`.github/workflows/test.yml` workflow) is deployed. GitHub Pages still
serves exactly one file — `index.html` — untouched. This is dev-only
tooling that lives alongside it in the repo.

## Running locally

```
npm install
npx playwright install chromium   # one-time, downloads the test browser
npm test                          # runs everything
npm run test:unit                 # just tests/unit
npm run test:e2e                  # just tests/e2e
npm run test:ui                   # interactive mode, watch tests run
```

`playwright.config.js` starts a plain local static server
(`python3 -m http.server`) to serve the repo root before running tests, and
shuts it down after. This is necessary, not optional — `index.html` loads
its logic via `<script type="module">`, and Chromium refuses to load ES
modules from a `file://` URL, even ones that only import remote CDN URLs.

## What's covered, and why it's split this way

**`tests/unit/`** — pure logic functions, called directly. Things like the
leveling formula, the duplicate-question similarity check, refusal
detection, and Smart Auto's task classifier are all plain functions with no
DOM or network dependency, which makes them fast, deterministic, and cheap
to test thoroughly (edge cases, regressions, boundary values).

These still run through a real (headless) browser rather than plain
Node — `index.html`'s functions live inside its `<script type="module">`,
and there's no separate file to `import`/`require` them from without either
adding a build step (which this project deliberately avoids) or
duplicating the logic into a second copy that could quietly drift out of
sync with the real thing. Instead, a small **TEST HOOK** block at the very
end of `index.html`'s script checks for `window.__TEST__ === true` (set by
the test harness *before* the page's own script runs) and, only then,
exposes the real functions on `window.__potatoTestExports`. For every
normal visitor, that block does nothing at all.

**`tests/e2e/`** — loads the real page as a real visitor's browser would
(imports, Firebase, the WebGPU capability check, all of it) and checks
nothing is visibly broken: it loads without console errors, the title and
sign-in form render, the model list has the expected options, the header
icon actually renders, and the WebGPU-unavailable path degrades to the
CPU-fallback message instead of throwing.

## What this suite deliberately does NOT do

- **Doesn't download or run a real model.** CI runners generally don't have
  a GPU, and even the small CPU-fallback model is multiple hundred MB —
  too slow and too flaky to run on every push. Model loading is exercised
  manually, the way it always has been.
- **Doesn't judge reply quality.** Whether an answer is *good* is a human
  judgment call, not something a test suite can meaningfully assert.
- **Doesn't cover Firebase writes.** Tests run against the real Firebase
  project (there's no local emulator configured) but never sign in, so no
  real user data is touched. Auth/sync flows are still a manual check.

If any of those become worth automating later (a Firebase emulator for
sync logic, a scheduled — not per-push — job that actually loads the
smallest model), that's a reasonable next step, just not this one.
