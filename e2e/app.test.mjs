// End-to-end user journeys against the production build (`npm run build` first).
// Run with: npm run test:e2e
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 4321;
const BASE = `http://localhost:${PORT}/`;
const data = JSON.parse(readFileSync(new URL('../src/data/ranges.json', import.meta.url), 'utf8'));
const byId = new Map(data.ranges.map((r) => [r.id, r]));

/** Label of the reference action for the hand currently asked. */
function truth(rangeId, hand) {
  const r = byId.get(rangeId);
  const [actionId] = Object.keys(r.hands[hand]);
  return r.actions.find((a) => a.id === actionId).label;
}

let server;
let browser;

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start');
}

async function newPage(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.errors = errors;
  return page;
}

async function current(page) {
  const el = page.locator('main.session');
  return { rangeId: await el.getAttribute('data-range'), hand: await el.getAttribute('data-hand') };
}

async function answerCorrectly(page) {
  const { rangeId, hand } = await current(page);
  await page.locator('.answer', { hasText: new RegExp(`^${escape(truth(rangeId, hand))}`) }).first().click();
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

async function startBtnSession(page, count = '10', mode = 'Aléatoire') {
  await page.goto(`${BASE}#/ranges`);
  await page.locator('.spot-card').first().locator('.select-all').click();
  await page.locator('.select-bar .btn-primary').click();
  await page.locator('.mode-card', { hasText: mode }).click();
  await page.locator('.sheet .seg button', { hasText: new RegExp(`^${count}$`) }).click();
  await page.locator('.sheet .btn-primary.btn-lg').click();
  await page.waitForSelector('main.session');
}

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

describe('Range Lab', () => {
  test('first launch shows the welcome screen and the 18 ranges', async () => {
    const page = await newPage();
    await page.goto(BASE);
    await page.waitForSelector('text=Bienvenue');
    assert.match(await page.textContent('.home'), /18 ranges/);
    await page.goto(`${BASE}#/ranges`);
    assert.equal(await page.locator('.stack-row').count(), 18);
    assert.equal(await page.locator('.spot-card').count(), 6);
    assert.deepEqual(page.errors, []);
  });

  test('filters only show real categories and narrow the list', async () => {
    const page = await newPage();
    await page.goto(`${BASE}#/ranges`);
    await page.locator('.seg button', { hasText: 'Heads-up' }).click();
    assert.equal(await page.locator('.stack-row').count(), 6);
    await page.locator('.chip', { hasText: 'vs limp' }).click();
    assert.equal(await page.locator('.stack-row').count(), 1);
    assert.match(await page.textContent('.spot-card'), /HU BB/);
  });

  test('a full session grades answers against the PDF ranges and records statistics', async () => {
    const page = await newPage();
    await startBtnSession(page, '10');

    // 1st question: correct answer
    await answerCorrectly(page);
    await page.waitForSelector('.feedback.ok');

    // 2nd question: deliberately wrong answer
    await page.click('.fb-next');
    const { rangeId, hand } = await current(page);
    const right = truth(rangeId, hand);
    const wrong = page.locator('.answer').filter({ hasNotText: new RegExp(`^${escape(right)}`) }).first();
    await wrong.click();
    await page.waitForSelector('.feedback.ko');
    assert.match(await page.textContent('.fb-ref'), new RegExp(escape(right)));
    await page.click('.fb-next');

    // Remaining questions (including the re-ask of the missed hand): all correct.
    let answered = 2;
    while (await page.locator('main.session').count()) {
      if (await page.locator('.fb-next').count()) {
        await page.click('.fb-next');
        continue;
      }
      await answerCorrectly(page);
      await page.waitForSelector('.feedback.ok');
      answered++;
    }
    await page.waitForSelector('.results');
    assert.equal(answered, 11, '10 questions + 1 re-ask of the missed hand');
    assert.match(await page.textContent('.results-facts'), /10\/11/);
    assert.equal(await page.locator('.error-row').count(), 1);

    await page.goto(`${BASE}#/stats`);
    assert.match(await page.textContent('.kpis'), /Questions\s*11/);
    assert.match(await page.textContent('.kpi-hero'), /91 %/);
    assert.deepEqual(page.errors, []);

    // Persistence across reloads.
    await page.reload();
    await page.goto(`${BASE}#/history`);
    assert.equal(await page.locator('.session-row').count(), 1);
    await page.goto(`${BASE}#/history/review`);
    assert.equal(await page.locator('.hand-chip').count(), 1);
    assert.equal(await page.locator('.hand-chip').textContent(), hand);
  });

  test('an interrupted session can be resumed after closing the app', async () => {
    const page = await newPage();
    await startBtnSession(page, '10');
    await answerCorrectly(page);
    await page.click('.fb-next');
    await answerCorrectly(page);
    const before = await current(page);
    await page.reload();
    await page.goto(BASE);
    await page.waitForSelector('.resume-card');
    assert.match(await page.textContent('.resume-card'), /2\/10/);
    await page.click('.resume-card');
    await page.waitForSelector('main.session');
    const after = await current(page);
    assert.notDeepEqual(after, before, 'resumes on the next question');
    assert.match(await page.textContent('.session-count'), /3\/10/);
  });

  test('exam mode gives no feedback until the end', async () => {
    const page = await newPage();
    await startBtnSession(page, '10', 'Examen');
    for (let i = 0; i < 10; i++) {
      assert.equal(await page.locator('.feedback').count(), 0);
      await answerCorrectly(page);
      if (i < 9) await page.waitForFunction((n) => document.querySelector('.session-count')?.textContent?.startsWith(`${n}/`), i + 2);
    }
    await page.waitForSelector('.results');
    assert.match(await page.textContent('.results-hero'), /100 %/);
    assert.match(await page.textContent('.results-hero'), /précision/);
  });

  test('deep links work after a refresh and unknown routes fall back home', async () => {
    const page = await newPage();
    await page.goto(`${BASE}#/range/hu-bb-8`);
    await page.reload();
    await page.waitForSelector('.rgrid');
    assert.equal(await page.locator('.rcell').count(), 169);
    assert.match(await page.textContent('.legend'), /Profil dépendant/);
    await page.goto(`${BASE}#/nope/xyz`);
    await page.waitForSelector('.home');
  });

  test('small phone (320×568): no horizontal scroll, every answer reachable', async () => {
    const page = await newPage({ width: 320, height: 568 });
    await page.goto(`${BASE}#/ranges`);
    await page.locator('.seg button', { hasText: 'Heads-up' }).click();
    await page.locator('.spot-card').first().locator('.select-all').click(); // HU SB: 6-7 answers
    await page.locator('.select-bar .btn-primary').click();
    await page.locator('.sheet .btn-primary.btn-lg').click();
    await page.waitForSelector('main.session');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= 320, `page is ${width}px wide`);
    const answers = page.locator('.answer');
    const { rangeId } = await current(page);
    assert.equal(await answers.count(), byId.get(rangeId).actions.length);
    assert.ok((await answers.count()) >= 6);
    await answers.last().scrollIntoViewIfNeeded();
    assert.ok(await answers.last().isVisible());
  });
});
