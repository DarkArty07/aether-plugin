'use strict';
// node build.js <sheet.png | player.html> <out.gif> <scale> [--fps N] [--transparent]
// Builds the GIF from a pxl sprite sheet (the .png and .json of `pxl build`, or a player page), with no dependencies.
// --fps N fixes the rate; pass it for a sheet from pxl, whose JSON rounds 33.3 ms to 33 (see delayPlan in lib.js).
// Frames are differential: only the box that changed is written, and the pixels that did not change are
// transparent over the previous frame (disposal 1). A frame identical to the one before is not written;
// its delay is added to the previous one, so the timing stays exact.
// --transparent is for a sheet whose empty pixels are meant to be see-through (a character on a page, no scene
// behind it): each frame is then written on its own, as the box of its opaque pixels, with disposal 2 (the box is
// cleared before the next frame) and the pixels pxl marks transparent left transparent. It is still small, because
// the box is only as large as the character. Without the flag such a pixel is drawn in its palette colour.
// Writes <out.gif>.map.json next to it (which source frames each GIF frame stands for); verify.js reads it.
// Build into a temporary folder and copy only the .gif into the repo.
const fs = require('fs');
const { loadSheet, delayPlan, takeFps } = require('./lib.js');

const args = process.argv.slice(2);
const fps = takeFps(args);
const transparent = args.includes('--transparent');
if (transparent) args.splice(args.indexOf('--transparent'), 1);
const [input, outPath, scaleArg] = args;
const S = Number(scaleArg);
if (!input || !outPath || !Number.isInteger(S) || S < 1) {
  console.error('usage: node build.js <sheet.png | player.html> <out.gif> <scale> [--fps N] [--transparent], scale a whole number');
  process.exit(2);
}
const sh = loadSheet(input);
const plan = delayPlan(sh, fps);
const { FW, FH, N } = sh;
const nColors = sh.plte.length / 3;
// pxl marks an erased pixel ("_") transparent, and a frame of this GIF is opaque, so such a pixel would be drawn in
// its palette colour. A sheet that carries the entry but never uses it is fine; one that uses it has a hole in the art.
const clear = new Set();                 // the palette entries that pxl marks transparent
if (sh.trns) sh.trns.forEach((a, i) => { if (a < 255) clear.add(i); });
if (transparent && !clear.size) {
  console.error('--transparent needs a sheet with a transparent palette entry, and this one has none (nothing in it is empty)');
  process.exit(2);
}
if (clear.size && !transparent) {
  let n = 0;
  const hit = new Set();
  for (let f = 0; f < sh.N; f++) for (const v of sh.frame(f)) if (clear.has(v)) { n++; hit.add(f); }
  if (n) console.warn(`WARNING: ${n} pixels in ${hit.size} frames are transparent in the sheet (an erase with "_" on a full canvas); the GIF draws them in their palette colour`);
}
const bits = Math.max(2, Math.ceil(Math.log2(nColors + 1)));
const T = nColors;                       // the transparent index is the first free one
const W = FW * S, H = FH * S;

function lzw(idx, minCode) {
  const clear = 1 << minCode, eoi = clear + 1, A = 1 << minCode;
  const table = new Int32Array(4096 * A).fill(-1);
  const out = [];
  let size = minCode + 1, next = eoi + 1, cur = 0, nb = 0;
  const emit = (c) => {
    cur |= c << nb; nb += size;
    while (nb >= 8) { out.push(cur & 255); cur >>>= 8; nb -= 8; }
  };
  emit(clear);
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = prefix * A + k, v = table[key];
    if (v !== -1) { prefix = v; continue; }
    emit(prefix);
    if (next === (1 << size) && size < 12) size++;
    if (next < 4096) table[key] = next++;
    else { emit(clear); table.fill(-1); size = minCode + 1; next = eoi + 1; }
    prefix = k;
  }
  emit(prefix);
  if (next === (1 << size) && size < 12) size++;
  emit(eoi);
  if (nb > 0) out.push(cur & 255);
  return Buffer.from(out);
}

// 1) the distinct frames and the box that changed in each, in source pixels
const kept = [];                         // { x, y, w, h, from, to, delay, pix, first }
let prev = null;
for (let i = 0; i < N; i++) {
  const cur = sh.frame(i), d = plan[i];
  if (transparent) {
    // each frame stands alone: the box of its opaque pixels, the empty ones transparent, and the box is cleared after it
    if (prev && cur.every((v, k) => v === prev[k])) { const last = kept[kept.length - 1]; last.delay += d; last.to = i; continue; }
    let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      if (clear.has(cur[y * FW + x])) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) { x0 = y0 = x1 = y1 = 0; }   // nothing on screen: one transparent pixel keeps the frame and its delay
    const w = x1 - x0 + 1, h = y1 - y0 + 1, pix = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = cur[(y0 + y) * FW + x0 + x];
      pix[y * w + x] = clear.has(v) ? T : v;
    }
    kept.push({ x: x0, y: y0, w, h, from: i, to: i, delay: d, pix });
  } else if (!prev) {
    kept.push({ x: 0, y: 0, w: FW, h: FH, from: i, to: i, delay: d, pix: cur, first: true });
  } else {
    let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      if (cur[y * FW + x] !== prev[y * FW + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) { const last = kept[kept.length - 1]; last.delay += d; last.to = i; prev = cur; continue; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, pix = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = cur[(y0 + y) * FW + x0 + x], b = prev[(y0 + y) * FW + x0 + x];
      pix[y * w + x] = a === b ? T : a;
    }
    kept.push({ x: x0, y: y0, w, h, from: i, to: i, delay: d, pix });
  }
  prev = cur;
}

// 2) the file
const parts = [];
const u16 = (v) => Buffer.from([v & 255, v >> 8]);
parts.push(Buffer.from('GIF89a'), u16(W), u16(H), Buffer.from([0x80 | 0x70 | (bits - 1), 0, 0]));
const gct = Buffer.alloc((1 << bits) * 3);
sh.plte.copy(gct);
parts.push(gct);
parts.push(Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0'), Buffer.from([3, 1, 0, 0, 0]));   // loop forever
for (const f of kept) {
  const flags = transparent ? (2 << 2) | 1 : (1 << 2) | (f.first ? 0 : 1);   // disposal 2 + transparent index, or disposal 1 (+ transparent index after the first frame)
  parts.push(Buffer.from([0x21, 0xf9, 4, flags, f.delay & 255, f.delay >> 8, transparent || !f.first ? T : 0, 0]));
  parts.push(Buffer.from([0x2c]), u16(f.x * S), u16(f.y * S), u16(f.w * S), u16(f.h * S), Buffer.from([0]));
  const w = f.w * S, big = new Uint8Array(w * f.h * S);
  for (let y = 0; y < f.h; y++) {
    const row = y * S * w;
    for (let x = 0; x < f.w; x++) { const v = f.pix[y * f.w + x]; for (let k = 0; k < S; k++) big[row + x * S + k] = v; }
    for (let k = 1; k < S; k++) big.copyWithin(row + k * w, row, row + w);
  }
  const minCode = Math.max(2, bits);
  parts.push(Buffer.from([minCode]));
  const data = lzw(big, minCode);
  for (let p = 0; p < data.length; p += 255) {
    const n = Math.min(255, data.length - p);
    parts.push(Buffer.from([n]), data.subarray(p, p + n));
  }
  parts.push(Buffer.from([0]));
}
parts.push(Buffer.from([0x3b]));
const gif = Buffer.concat(parts);
fs.writeFileSync(outPath, gif);
fs.writeFileSync(outPath + '.map.json', JSON.stringify(kept.map(({ x, y, w, h, from, to, delay }) => ({ x, y, w, h, from, to, delay }))));
const total = kept.reduce((s, f) => s + f.delay, 0);
console.log(`${outPath}: ${W}x${H}, ${kept.length} frames kept of ${N}, ${total / 100} s, ${(gif.length / 1e6).toFixed(2)} MB, ${nColors} colours`);
