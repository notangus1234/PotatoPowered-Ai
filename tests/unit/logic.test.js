// Unit tests for PotatoPowered's pure logic functions.
//
// These run through a real (headless) browser rather than plain Node,
// because index.html is loaded as an ES module and its functions live in
// that module's scope — there's no separate file to `require()` or
// `import` directly without either adding a build step (which the project
// deliberately avoids) or duplicating logic into a second copy that could
// drift out of sync with the real thing.
//
// Instead: `window.__TEST__ = true` is set before the page's own script
// runs (see the TEST HOOK block at the end of index.html's <script>), which
// makes the app expose its real, unmodified functions on
// `window.__potatoTestExports`. Every assertion below calls the actual
// function from the actual file that ships to users — never a re-implementation.

const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__TEST__ = true; });
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.__potatoTestExports);
});

async function call(page, fnName, ...args) {
  return page.evaluate(
    ({ fnName, args }) => window.__potatoTestExports[fnName](...args),
    { fnName, args },
  );
}

test.describe('calculateQuestionExp', () => {
  test('never awards less than the floor (25) even for a trivial message', async ({ page }) => {
    const exp = await call(page, 'calculateQuestionExp', 'hi');
    expect(exp).toBeGreaterThanOrEqual(25);
  });

  test('never awards more than the ceiling (1000) for an extreme message', async ({ page }) => {
    const huge = ('why explain how compare versus algorithm ```code``` '.repeat(50)) + '? ? ? ?';
    const exp = await call(page, 'calculateQuestionExp', huge);
    expect(exp).toBeLessThanOrEqual(1000);
  });

  test('rewards a longer, multi-signal question with more EXP than a short one', async ({ page }) => {
    const short = await call(page, 'calculateQuestionExp', 'what is 2+2');
    const rich = await call(
      page,
      'calculateQuestionExp',
      'Why does quicksort outperform bubble sort on large arrays, and how would you explain the ' +
      'algorithm step by step? What about the worst-case complexity versus merge sort?',
    );
    expect(rich).toBeGreaterThan(short);
  });
});

test.describe('legacyExpNeededForLevel', () => {
  test('matches the documented (10 + 2*level) * 1000 formula', async ({ page }) => {
    expect(await call(page, 'legacyExpNeededForLevel', 0)).toBe(10000);
    expect(await call(page, 'legacyExpNeededForLevel', 1)).toBe(12000);
    expect(await call(page, 'legacyExpNeededForLevel', 50)).toBe(110000);
  });

  test('increments by exactly 2000 (Bronze tier step) between consecutive levels', async ({ page }) => {
    const a = await call(page, 'legacyExpNeededForLevel', 10);
    const b = await call(page, 'legacyExpNeededForLevel', 11);
    expect(b - a).toBe(2000);
  });
});

test.describe('normalizeForCompare / contentWords / wordSimilarity', () => {
  test('normalizes case, punctuation, and extra whitespace the same way', async ({ page }) => {
    const a = await call(page, 'normalizeForCompare', "What's  the capital of France?");
    const b = await call(page, 'normalizeForCompare', 'whats the capital of france');
    expect(a).toBe(b);
  });

  test('strips stopwords so template words alone do not drive similarity', async ({ page }) => {
    const words = await call(page, 'contentWords', 'what is the capital of france');
    // "what", "is", "the", "of" are stopwords — only "capital" and "france" should remain.
    expect(words.sort()).toEqual(['capital', 'france'].sort());
  });

  test('regression: "capital of France?" and "capital of Germany?" are NOT near-duplicates', async ({ page }) => {
    // This is the exact false-positive the stopword filtering exists to prevent
    // (naive whole-sentence overlap would flag these as near-identical).
    const a = await call(page, 'normalizeForCompare', 'what is the capital of France?');
    const b = await call(page, 'normalizeForCompare', 'what is the capital of Germany?');
    const similarity = await call(page, 'wordSimilarity', a, b);
    expect(similarity).toBeLessThan(0.6); // SIMILARITY_THRESHOLD in the app
  });

  test('two rewordings of the same question score as near-duplicates', async ({ page }) => {
    const a = await call(page, 'normalizeForCompare', 'How do I center a div in CSS?');
    const b = await call(page, 'normalizeForCompare', 'how do you center a div with css');
    const similarity = await call(page, 'wordSimilarity', a, b);
    expect(similarity).toBeGreaterThanOrEqual(0.6);
  });
});

test.describe('looksLikeRefusal', () => {
  test('flags a clear refusal', async ({ page }) => {
    expect(await call(page, 'looksLikeRefusal', "I'm sorry, but I cannot help with that request.")).toBe(true);
  });

  test('does not flag an ordinary, non-refusal reply', async ({ page }) => {
    expect(await call(page, 'looksLikeRefusal', 'Sure! Here is how you center a div in CSS...')).toBe(false);
  });

  test('does not false-positive on a reply that merely discusses refusals', async ({ page }) => {
    // A reply *about* the concept of declining shouldn't itself be treated as one
    // unless it uses one of the actual refusal phrases.
    const reply = 'Some models are trained to decline certain requests for safety reasons.';
    expect(await call(page, 'looksLikeRefusal', reply)).toBe(false);
  });
});

test.describe('classifyTask (Smart Auto routing)', () => {
  test('classifies a short greeting as quick', async ({ page }) => {
    expect(await call(page, 'classifyTask', 'hey there')).toBe('quick');
  });

  test('classifies a message with a code fence as code', async ({ page }) => {
    expect(await call(page, 'classifyTask', 'Can you fix this?\n```js\nconsole.log(1)\n```')).toBe('code');
  });

  test('classifies a math word problem as reasoning', async ({ page }) => {
    expect(await call(page, 'classifyTask', 'Solve for x step by step: 3x + 5 = 20')).toBe('reasoning');
  });

  test('classifies an ordinary longer question as general', async ({ page }) => {
    expect(await call(page, 'classifyTask', 'What are some good books about the history of Rome?')).toBe('general');
  });
});

test.describe('escapeHtml', () => {
  test('escapes the characters that matter for XSS prevention', async ({ page }) => {
    const out = await call(page, 'escapeHtml', `<script>alert("hi")</script> & 'quotes'`);
    expect(out).not.toContain('<script>');
    expect(out).toBe('&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;');
  });
});
