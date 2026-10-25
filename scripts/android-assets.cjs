// Generates the Android launcher icons and splash screens from public/icon.svg.
// Usage: node scripts/android-assets.cjs   (requires the `playwright` dev dependency + Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const svg = fs.readFileSync(path.join(ROOT, 'public/icon.svg'), 'utf8');
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
// Foreground only (cards), without the rounded background, for adaptive icons.
const cards = inner.replace(/<rect width="512" height="512"[^>]*\/>/, '').replace(/<circle[^>]*\/>/, '');
const BG = '#0f2a20';
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const page = (body, w, h, bg = 'transparent') =>
  `<html><body style="margin:0;width:${w}px;height:${h}px;background:${bg};display:grid;place-items:center;overflow:hidden">${body}</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  const shot = async (html, w, h, file, transparent = true) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(html);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: transparent });
  };
  for (const [d, k] of Object.entries(DENS)) {
    const legacy = Math.round(48 * k);
    const fg = Math.round(108 * k);
    const dir = path.join(RES, `mipmap-${d}`);
    await shot(page(`<svg width="${legacy}" height="${legacy}" viewBox="0 0 512 512">${inner}</svg>`, legacy, legacy), legacy, legacy, path.join(dir, 'ic_launcher.png'));
    await shot(
      page(`<div style="width:${legacy}px;height:${legacy}px;border-radius:50%;overflow:hidden;background:${BG}"><svg width="${legacy}" height="${legacy}" viewBox="40 40 432 432">${cards}</svg></div>`, legacy, legacy),
      legacy, legacy, path.join(dir, 'ic_launcher_round.png'),
    );
    // Adaptive foreground: artwork kept inside the central 66 % safe zone.
    const art = Math.round(fg * 0.62);
    await shot(page(`<svg width="${art}" height="${art}" viewBox="60 60 392 392">${cards}</svg>`, fg, fg), fg, fg, path.join(dir, 'ic_launcher_foreground.png'));
  }
  // Splash screens (legacy, pre-Android 12): dark background + centred icon.
  const splash = async (w, h, file) => {
    const s = Math.round(Math.min(w, h) * 0.26);
    await shot(page(`<svg width="${s}" height="${s}" viewBox="0 0 512 512">${inner}</svg>`, w, h, '#090c0b'), w, h, file, false);
  };
  for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const f = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    await splash(w, h, f);
  }
  fs.writeFileSync(path.join(RES, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
  await browser.close();
  console.log('Android icons and splash screens generated');
})();
