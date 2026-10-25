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

/** Label of the reference action of a PDF range for a hand. */
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

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

async function clickAnswer(page, label) {
  await page.locator('.answer', { hasText: new RegExp(`^${escape(label)}`) }).first().click();
}

async function answerCorrectly(page) {
  const { rangeId, hand } = await current(page);
  await clickAnswer(page, truth(rangeId, hand));
}

/** Sets the default question count from the home screen. */
async function setCount(page, label) {
  await page.goto(BASE);
  await page.locator('.quick-card .seg button', { hasText: new RegExp(`^${escape(label)}$`) }).click();
}

/** Starts a session on one PDF range from the "Entraîner" tab. */
async function trainOn(page, spotTitle, stack) {
  await page.goto(`${BASE}#/train`);
  const row = page.locator('.by-range', { has: page.locator('.row-title', { hasText: new RegExp(`^${escape(spotTitle)}$`) }) });
  await row.locator('.stack-btn', { hasText: new RegExp(`^${stack}$`) }).click();
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

describe('Expresso Ranges', () => {
  test('first launch: home, explorer and training list show the 18 PDF ranges', async () => {
    const page = await newPage();
    await page.goto(BASE);
    await page.waitForSelector('.home');
    assert.match(await page.textContent('.home-head'), /Expresso Ranges.*18 ranges/s);
    await page.goto(`${BASE}#/ranges`);
    assert.equal(await page.locator('.rcell').count(), 169);
    assert.match(await page.textContent('.range-title'), /BTN\s*25 BB.*PDF p\.02/s);
    await page.goto(`${BASE}#/train`);
    assert.equal(await page.locator('.by-range').count(), 6);
    assert.equal(await page.locator('.stack-btn').count(), 18);
    assert.deepEqual(page.errors, []);
  });

  test('custom training: combined filters count the available situations', async () => {
    const page = await newPage();
    await page.goto(`${BASE}#/custom`);
    await page.locator('.seg button', { hasText: 'Heads-Up' }).click();
    assert.match(await page.textContent('.launch-info'), /1014 situations disponibles · 169 mains · 6 ranges/);
    await page.locator('.chip', { hasText: /^HU BB$/ }).click();
    await page.locator('.chip', { hasText: /^8 BB$/ }).click();
    assert.match(await page.textContent('.launch-info'), /169 situations disponibles · 169 mains · 1 range/);
    await page.locator('.chip-action', { hasText: /^Call$/ }).click();
    assert.match(await page.textContent('.launch-info'), /53 situations disponibles/);
  });

  test('a full session grades answers against the PDF ranges and records statistics', async () => {
    const page = await newPage();
    await setCount(page, '10');
    await trainOn(page, 'BTN', 25);

    await answerCorrectly(page);
    await page.waitForSelector('.feedback.ok');
    await page.click('.fb-next');

    const { rangeId, hand } = await current(page);
    assert.equal(rangeId, '3max-btn-open-25');
    const right = truth(rangeId, hand);
    await page.locator('.answer').filter({ hasNotText: new RegExp(`^${escape(right)}`) }).first().click();
    await page.waitForSelector('.feedback.ko');
    assert.match(await page.textContent('.fb-ref'), new RegExp(escape(right)));
    await page.click('.fb-next');

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

    await page.goto(`${BASE}#/progress`);
    assert.match(await page.textContent('.progress-stats'), /Décisions\s*11/);
    assert.match(await page.textContent('.progress-top .ring'), /91 %/);
    assert.deepEqual(page.errors, []);

    await page.reload();
    await page.goto(`${BASE}#/history`);
    assert.equal(await page.locator('.session-row').count(), 1);
    await page.goto(`${BASE}#/history/review`);
    assert.equal(await page.locator('.hand-chip').textContent(), hand);
  });

  test('an interrupted session can be resumed after closing the app', async () => {
    const page = await newPage();
    await setCount(page, '10');
    await trainOn(page, 'SB vs BB', 15);
    await answerCorrectly(page);
    await page.click('.fb-next');
    await answerCorrectly(page);
    await page.reload();
    await page.goto(BASE);
    await page.waitForSelector('.resume-card');
    assert.match(await page.textContent('.resume-card'), /2 réponses sur 10/);
    await page.locator('.resume-card .btn-primary').click();
    await page.waitForSelector('main.session');
    assert.match(await page.textContent('.session-count'), /3 \/ 10/);
  });

  test('exam mode gives no feedback until the end', async () => {
    const page = await newPage();
    await page.goto(`${BASE}#/custom`);
    await page.locator('.chip', { hasText: /^BTN 25$/ }).click();
    await page.locator('.step .seg button', { hasText: /^Examen$/ }).click();
    const ten = page.locator('.step .seg button', { hasText: /^10$/ });
    await ten.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await ten.click();
    await page.locator('.launch-bar .btn-primary').click();
    await page.waitForSelector('main.session');
    for (let i = 0; i < 10; i++) {
      assert.equal(await page.locator('.feedback').count(), 0);
      await answerCorrectly(page);
      if (i < 9) await page.waitForFunction((n) => document.querySelector('.session-count')?.textContent?.startsWith(`${n} /`), i + 2);
    }
    await page.waitForSelector('.results');
    assert.match(await page.textContent('.results-hero'), /100 %.*précision/s);
  });

  test('unlimited session: questions keep coming until the player stops', async () => {
    const page = await newPage();
    await setCount(page, '∞');
    await page.locator('.quick-card .btn-primary').click();
    await page.waitForSelector('main.session');
    for (let i = 0; i < 3; i++) {
      await answerCorrectly(page);
      await page.click('.fb-next');
    }
    assert.match(await page.textContent('.session-count'), /4 \/ ∞/);
    await page.locator('.end-btn').click();
    await page.locator('.sheet .btn-primary', { hasText: 'Voir le bilan' }).click();
    await page.waitForSelector('.results');
    assert.match(await page.textContent('.results-facts'), /3\/3/);
  });

  test('editing a PDF range changes the questions and can be reverted', async () => {
    const page = await newPage();
    await page.goto(`${BASE}#/edit/3max-btn-open-25`);
    // Painting by touch: K2o (Fold in the PDF) becomes Minraise / Fold.
    await page.locator('.brush', { hasText: 'Minraise / Fold' }).click();
    await page.locator('.rcell[data-hand="K2o"]').click();
    assert.match(await page.textContent('.brush[aria-checked="true"]'), /Minraise \/ Fold\s*59/);
    await page.locator('.icon-btn[aria-label="Annuler la dernière modification"]').click();
    assert.match(await page.textContent('.brush[aria-checked="true"]'), /Minraise \/ Fold\s*58/);
    await page.locator('.brush', { hasText: 'Minraise / Call' }).click();
    await page.fill('#notation', '72o');
    await page.locator('.notation-row .btn', { hasText: 'Appliquer' }).click();
    await page.locator('.screen-head .btn-primary', { hasText: 'Enregistrer' }).click();
    await page.waitForSelector('.range-title');
    assert.match(await page.textContent('.range-badges'), /Modifiée/);
    await page.fill('#hand-search', '72o');
    assert.match(await page.textContent('.inspector'), /Minraise \/ Call/);

    // The custom filter now finds 21 "Minraise / Call" hands instead of 20.
    await page.goto(`${BASE}#/custom`);
    await page.locator('.chip', { hasText: /^BTN 25 ✎$/ }).click();
    await page.locator('.chip-action', { hasText: /^Minraise \/ Call$/ }).click();
    assert.match(await page.textContent('.launch-info'), /21 situations/);

    await page.goto(`${BASE}#/ranges/3max-btn-open-25`);
    await page.locator('.explorer-actions .btn', { hasText: 'Restaurer le PDF' }).click();
    await page.locator('.sheet .btn-danger', { hasText: 'Restaurer' }).click();
    await page.waitForFunction(() => !document.querySelector('.range-badges')?.textContent?.includes('Modifiée'));
    await page.fill('#hand-search', '72o');
    assert.match(await page.textContent('.inspector'), /Fold/);
    assert.deepEqual(page.errors, []);
  });

  test('a new range can be created, painted, trained on and deleted', async () => {
    const page = await newPage();
    await page.goto(`${BASE}#/new`);
    await page.locator('.chip', { hasText: /^20 BB$/ }).click();
    await page.locator('.launch-bar .btn-primary').click();
    await page.waitForSelector('.editor');
    await page.locator('.brush', { hasText: 'Open shove' }).click();
    await page.fill('#notation', '22+, A2s+');
    await page.locator('.notation-row .btn', { hasText: 'Appliquer' }).click();
    await page.locator('.screen-head .btn-primary', { hasText: 'Enregistrer' }).click();
    await page.waitForSelector('.range-title');
    assert.match(await page.textContent('.range-title'), /BTN\s*20 BB.*Personnalisée/s);
    assert.match(await page.textContent('.legend'), /Open shove\s*25 mains/);

    await setCount(page, '10');
    await trainOn(page, 'BTN', 20);
    const shove = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s']);
    const { rangeId, hand } = await current(page);
    assert.match(rangeId, /^custom-/);
    await clickAnswer(page, shove.has(hand) ? 'Open shove' : 'Fold');
    await page.waitForSelector('.feedback.ok');

    await page.goto(`${BASE}#/ranges/${rangeId}`);
    await page.locator('.explorer-actions .btn-danger', { hasText: 'Supprimer' }).click();
    await page.locator('.sheet .btn-danger', { hasText: 'Supprimer' }).click();
    await page.goto(`${BASE}#/train`);
    assert.equal(await page.locator('.stack-btn').count(), 18);
  });

  test('"Fidèle au PDF" colours reproduce the document swatches', async () => {
    const page = await newPage();
    await page.goto(`${BASE}#/settings`);
    await page.locator('.seg button', { hasText: 'Fidèle au PDF' }).click();
    await page.goto(`${BASE}#/ranges/3max-btn-open-25`);
    const bg = (h) => page.locator(`.rcell[data-hand="${h}"]`).evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(await bg('72o'), 'rgb(236, 236, 236)'); // Fold swatch of the PDF
    assert.equal(await bg('AA'), 'rgb(46, 158, 91)'); // Minraise / Call swatch
  });

  test('deep links work after a refresh and unknown routes fall back home', async () => {
    const page = await newPage();
    await page.goto(`${BASE}#/ranges/hu-bb-8`);
    await page.reload();
    await page.waitForSelector('.rgrid');
    assert.match(await page.textContent('.legend'), /Profil dépendant/);
    await page.goto(`${BASE}#/nope/xyz`);
    await page.waitForSelector('.home');
  });

  test('small phone (320×568): no horizontal scroll, every answer reachable', async () => {
    const page = await newPage({ width: 320, height: 568 });
    await trainOn(page, 'HU SB', 15);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= 320, `page is ${width}px wide`);
    const answers = page.locator('.answer');
    assert.equal(await answers.count(), byId.get('hu-sb-15').actions.length);
    await answers.last().scrollIntoViewIfNeeded();
    assert.ok(await answers.last().isVisible());
  });
});
