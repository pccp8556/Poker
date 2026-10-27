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

/** Reference action of a PDF range for a hand (id and label). */
function truthAction(rangeId, hand) {
  const r = byId.get(rangeId);
  const [actionId] = Object.keys(r.hands[hand]);
  return { id: actionId, label: r.actions.find((a) => a.id === actionId).label };
}

/**
 * How each plan is played at the table: first decision, then (for two-step
 * plans) the answer to the opponent's raise — a function of that raise.
 */
const FIRST = {
  fold: ['fold'],
  check: ['call'],
  call: ['call'],
  'profile-dependent': ['call'],
  shove: ['max', 'raise'],
  '3bet-allin': ['max', 'raise'],
  'iso-allin': ['max', 'raise'],
  'minraise-fold': ['min', 'raise'],
  'minraise-call': ['min', 'raise'],
  'raise3x-fold': ['preset', 'raise'],
  'raise3x-call': ['preset', 'raise'],
  '3bet-nai-fold': ['min', 'raise'],
  '3bet-nai-call': ['min', 'raise'],
  'iso-fold': ['min', 'raise'],
  'iso-call': ['min', 'raise'],
  'limp-fold': ['call'],
  'limp-call': ['call'],
  'limp-reraise': ['call'],
  'limp-reraise-vs-2.5x': ['call'],
  'limp-call-vs-3bet': ['call'],
  'limp-call-vs-2.5x': ['call'],
};
const SECOND = {
  fold: () => ['fold'],
  call: () => ['call'],
  reraise: () => ['max', 'raise'],
  callUnlessAllIn: (reaction) => (reaction === 'allin' ? ['fold'] : ['call']),
};
const THEN = {
  'minraise-fold': SECOND.fold,
  'minraise-call': SECOND.call,
  'raise3x-fold': SECOND.fold,
  'raise3x-call': SECOND.call,
  '3bet-nai-fold': SECOND.fold,
  '3bet-nai-call': SECOND.call,
  'iso-fold': SECOND.fold,
  'iso-call': SECOND.call,
  'limp-fold': SECOND.fold,
  'limp-call': SECOND.call,
  'limp-reraise': SECOND.reraise,
  'limp-reraise-vs-2.5x': SECOND.reraise,
  'limp-call-vs-3bet': SECOND.callUnlessAllIn,
  'limp-call-vs-2.5x': SECOND.callUnlessAllIn,
};

async function presses(page, keys) {
  for (const k of keys) {
    if (k === 'fold') await page.click('.ab-fold');
    else if (k === 'call') await page.click('.ab-call');
    else if (k === 'raise') await page.click('.ab-raise');
    else if (k === 'min') await page.locator('.ab-presets button').nth(0).click();
    else if (k === 'preset') await page.locator('.ab-presets button').nth(1).click();
    else if (k === 'max') await page.locator('.ab-presets button').nth(3).click();
  }
}

/** Waits until the hero has to act again after the opponent's answer; returns that answer. */
async function waitForReaction(page) {
  await page.waitForFunction(() => {
    const m = document.querySelector('main.session');
    return m?.dataset.phase === 'hero' && m.dataset.reaction !== '';
  });
  return page.locator('main.session').getAttribute('data-reaction');
}

/** Plays a plan of the range at the table, using the client's buttons. */
async function playAction(page, actionId) {
  await page.waitForSelector('main.session[data-phase="hero"]');
  await presses(page, FIRST[actionId]);
  const then = THEN[actionId];
  if (then) await presses(page, then(await waitForReaction(page)));
}

async function current(page) {
  const el = page.locator('main.session');
  await page.waitForSelector('main.session[data-phase="hero"]');
  return { rangeId: await el.getAttribute('data-range'), hand: await el.getAttribute('data-hand') };
}

async function answerCorrectly(page) {
  const { rangeId, hand } = await current(page);
  await playAction(page, truthAction(rangeId, hand).id);
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

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
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

/** Starts a custom session on one range, restricted to some expected actions. */
async function trainCustom(page, rangeChip, actionLabels) {
  await page.goto(`${BASE}#/custom`);
  await page.locator('.chip', { hasText: new RegExp(`^${escape(rangeChip)}$`) }).click();
  for (const label of actionLabels) await page.locator('.chip-action', { hasText: new RegExp(`^${escape(label)}$`) }).click();
  await page.locator('.launch-bar .btn-primary').click();
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
    const right = truthAction(rangeId, hand);
    // A wrong line: fold a playable hand, or shove a folding hand.
    await playAction(page, right.id === 'fold' ? 'shove' : 'fold');
    await page.waitForSelector('.feedback.ko');
    assert.match(await page.textContent('.fb-ref'), new RegExp(escape(right.label)));
    assert.match(await page.textContent('.fb-line'), right.id === 'fold' ? /Ta ligne : Tapis \(25 BB\)/ : /Ta ligne : Passer/);
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
    await playAction(page, shove.has(hand) ? 'shove' : 'fold');
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

  test('small phone (320×568): no horizontal scroll, the table controls are reachable', async () => {
    const page = await newPage({ width: 320, height: 568 });
    await trainOn(page, 'HU SB', 15);
    await page.waitForSelector('main.session[data-phase="hero"]');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= 320, `page is ${width}px wide`);
    for (const sel of ['.ab-fold', '.ab-call', '.ab-raise', '.ab-presets button >> nth=3']) {
      const box = await page.locator(sel).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 320 && box.y + box.height <= 568, `${sel} visible`);
    }
    await answerCorrectly(page);
    await page.waitForSelector('.feedback.ok');
    await page.click('.fb-next');
    // A double tap on a button plays (and records) the hand once.
    await page.waitForSelector('main.session[data-phase="hero"]');
    await page.locator('.ab-fold').evaluate((b) => {
      b.click();
      b.click();
    });
    await page.waitForSelector('.feedback');
    await page.click('.fb-next');
    await page.waitForSelector('main.session[data-phase="hero"]');
    assert.match(await page.textContent('.session-count'), /^3 \//);
  });

  test('landscape phone: the opponent goes to the end of the action (BTN 25: minraise, then 6 BB raise)', async () => {
    const page = await newPage({ width: 844, height: 390 });
    await trainCustom(page, 'BTN 25', ['Minraise / Call', 'Minraise / Fold']);
    // Table layout: the controls stay on screen.
    const bar = await page.locator('.actionbar').boundingBox();
    assert.ok(bar && bar.y + bar.height <= 390 && bar.x + bar.width <= 844);
    for (let i = 0; i < 3; i++) {
      // Blinds are posted, the hero opens from the button.
      const { rangeId, hand } = await current(page);
      assert.match(await page.textContent('.pot'), /Pot : 1,5 BB/);
      const right = truthAction(rangeId, hand);
      await presses(page, ['min', 'raise']);
      assert.equal(await waitForReaction(page), 'raise');
      // The re-raise is three times the minraise; the third player folds.
      assert.match(await page.textContent('.opp:not(:has(.folded)) .action-bubble'), /Relance à 6 BB/);
      // 2 + 6 BB, plus the dead blind of the player who folds (1 BB or 0,5 BB).
      assert.match(await page.textContent('.pot'), /Pot : (9|8,5) BB/);
      assert.match(await page.textContent('.ab-call'), /Suivre\s*4 BB/);
      await presses(page, right.id === 'minraise-call' ? ['call'] : ['fold']);
      await page.waitForSelector('.feedback.ok');
      assert.match(await page.textContent('.fb-line'), /Relance à 2 BB → (SB|BB) relance à 6 BB → (Suivre|Passer)/);
      await page.click('.fb-next');
    }
    assert.deepEqual(page.errors, []);
  });

  test('SB vs BTN: the button minraises, a non all-in 3bet meets a shove', async () => {
    const page = await newPage({ width: 844, height: 390 });
    await trainCustom(page, 'SB vs BTN 25', ['3bet non all-in / Call', '3bet non all-in / Fold']);
    for (let i = 0; i < 3; i++) {
      const { rangeId, hand } = await current(page);
      assert.match(await page.textContent('.opp[data-position="BTN"] .action-bubble'), /Relance à 2 BB/);
      const right = truthAction(rangeId, hand);
      await presses(page, ['min', 'raise']);
      assert.equal(await waitForReaction(page), 'allin');
      assert.match(await page.textContent('.opp[data-position="BTN"] .action-bubble'), /Tapis/);
      assert.match(await page.textContent('.ab-call'), /Suivre tapis/);
      await presses(page, right.id === '3bet-nai-call' ? ['call'] : ['fold']);
      await page.waitForSelector('.feedback.ok');
      await page.click('.fb-next');
    }
    assert.deepEqual(page.errors, []);
  });
});
