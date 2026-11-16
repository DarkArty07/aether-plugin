'use strict';
// node check-in-chromium.js <sheet.png | player.html> <file.gif> <scale> <contact.png>
// A second opinion from a decoder that is not ours: Chromium's ImageDecoder opens the GIF, and a set of frames
// (every chapter start, the hit-stop, the shake and a few more) is compared pixel by pixel with the sheet.
// It also tiles 16 frames into a contact sheet to look at. Needs playwright-core and a Chromium:
// set PLAYWRIGHT_CORE to its folder (the owner's machine has one under ~/Desktop/agentes/aether/website/node_modules).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadSheet, scaled } = require('./lib.js');

const candidates = [
  process.env.PLAYWRIGHT_CORE,
  path.join(os.homedir(), 'Desktop/agentes/aether/website/node_modules/playwright-core'),
  'playwright-core',
].filter(Boolean);
let chromium = null;
for (const c of candidates) { try { ({ chromium } = require(c)); break; } catch { /* try the next */ } }
if (!chromium) {
  console.error('playwright-core not found; set PLAYWRIGHT_CORE to its folder');
  process.exit(2);
}

(async () => {
  const [htmlPath, gifPath, scaleArg, outPng] = process.argv.slice(2);
  const S = Number(scaleArg);
  if (!htmlPath || !gifPath || !Number.isInteger(S) || !outPng) {
    console.error('usage: node check-in-chromium.js <sheet.png | player.html> <file.gif> <scale> <contact.png>');
    process.exit(2);
  }
  const sh = loadSheet(htmlPath);
  const map = JSON.parse(fs.readFileSync(gifPath + '.map.json', 'utf8'));
  const b64 = fs.readFileSync(gifPath).toString('base64');
  // the chapter starts of Clawd Aether; for another animation edit this list
  const CHAPTERS = [0, 60, 150, 182, 214, 241, 272, 340, 384, 456, 586, 654, 690, 724, 770, 815];
  const picks = [...new Set([...CHAPTERS, 1, 2, 3, 100, 217, 219, 222, 300, 500, 700, 800])].filter((i) => i < sh.N).sort((a, b) => a - b);
  const keptOf = (o) => map.findIndex((m) => m.from <= o && o <= m.to);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('file:///');
  const res = await page.evaluate(async ({ b64, idxs, S, FW, contact }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dec = new ImageDecoder({ data: bin, type: 'image/gif' });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack.frameCount;
    const rgba = {};
    const cell = FW * S, cols = 4, rows = Math.ceil(contact.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * cell; cv.height = rows * cell;
    const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false; cx.fillStyle = '#111'; cx.fillRect(0, 0, cv.width, cv.height);
    const tmp = document.createElement('canvas'); tmp.width = cell; tmp.height = cell; const tx = tmp.getContext('2d');
    const take = async (k, keep, slot) => {
      const { image } = await dec.decode({ frameIndex: k });
      tx.clearRect(0, 0, cell, cell); tx.drawImage(image, 0, 0);
      if (keep) {
        const d = tx.getImageData(0, 0, cell, cell).data;
        let s = ''; const CH = 0x8000;
        for (let i = 0; i < d.length; i += CH) s += String.fromCharCode.apply(null, d.subarray(i, i + CH));
        rgba[k] = btoa(s);
      }
      if (slot >= 0) cx.drawImage(tmp, (slot % cols) * cell, Math.floor(slot / cols) * cell);
      image.close();
    };
    for (const k of idxs) await take(k, true, contact.indexOf(k));
    for (const k of contact) if (!idxs.includes(k)) await take(k, false, contact.indexOf(k));
    return { count, rgba, png: cv.toDataURL('image/png') };
  }, { b64, idxs: picks.map(keptOf), S, FW: sh.FW, contact: CHAPTERS.filter((i) => i < sh.N).map(keptOf) });
  await browser.close();

  console.log('Chromium counts', res.count, 'frames; the map has', map.length);
  const pal = sh.plte;
  let bad = 0;
  for (const o of picks) {
    const k = keptOf(o);
    const want = scaled(sh.frame(map[k].from), sh.FW, sh.FH, S);
    const got = Buffer.from(res.rgba[k], 'base64');
    let diff = 0;
    for (let p = 0; p < want.length; p++) {
      const c = want[p] * 3;
      if (got[p * 4] !== pal[c] || got[p * 4 + 1] !== pal[c + 1] || got[p * 4 + 2] !== pal[c + 2] || got[p * 4 + 3] !== 255) diff++;
    }
    if (diff) { bad++; console.log(`source frame ${o} (kept ${k}): ${diff} pixels differ`); }
  }
  console.log(`compared ${picks.length} frames in Chromium, with differences: ${bad}`);
  fs.writeFileSync(outPng, Buffer.from(res.png.split(',')[1], 'base64'));
  console.log('contact sheet:', outPng);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
