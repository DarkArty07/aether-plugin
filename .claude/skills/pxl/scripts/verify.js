'use strict';
// node verify.js <sheet.png | player.html> <file.gif> <scale> [--fps N]
// Decodes the GIF from scratch (code that shares nothing with build.js) and compares every frame with the sheet
// enlarged by the same factor. Also checks the box of each frame, its delay, the loop block and that the whole
// run of source frames is covered. Exits 1 on any difference. Pass the same --fps that build.js got.
const fs = require('fs');
const { loadSheet, scaled, delayPlan, takeFps } = require('./lib.js');

const args = process.argv.slice(2);
const fps = takeFps(args);
const [input, gifPath, scaleArg] = args;
const S = Number(scaleArg);
if (!input || !gifPath || !Number.isInteger(S) || S < 1) {
  console.error('usage: node verify.js <sheet.png | player.html> <file.gif> <scale> [--fps N]');
  process.exit(2);
}
const sh = loadSheet(input);
const plan = delayPlan(sh, fps);
const buf = fs.readFileSync(gifPath);
const map = JSON.parse(fs.readFileSync(gifPath + '.map.json', 'utf8'));

function lzwDecode(data, minCode, outLen) {
  const clear = 1 << minCode, eoi = clear + 1;
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  const out = new Uint8Array(outLen);
  let size = minCode + 1, next = eoi + 1, prev = -1, first = 0, o = 0, p = 0, bb = 0, bc = 0;
  for (;;) {
    while (bc < size && p < data.length) { bb |= data[p++] << bc; bc += 8; }
    if (bc < size) break;
    const code = bb & ((1 << size) - 1); bb >>>= size; bc -= size;
    if (code === clear) { size = minCode + 1; next = eoi + 1; prev = -1; continue; }
    if (code === eoi) break;
    if (prev === -1) { out[o++] = code; prev = code; first = code; continue; }
    let c = code, sp = 0;
    if (c >= next) { stack[sp++] = first; c = prev; }
    while (c >= clear) { stack[sp++] = suffix[c]; c = prefix[c]; }
    stack[sp++] = c; first = c;
    if (next < 4096) { prefix[next] = prev; suffix[next] = first; next++; if (next === (1 << size) && size < 12) size++; }
    prev = code;
    while (sp) out[o++] = stack[--sp];
  }
  if (o !== outLen) throw new Error(`LZW gave ${o} pixels, expected ${outLen}`);
  return out;
}

if (buf.toString('latin1', 0, 6) !== 'GIF89a') throw new Error('not a GIF89a file');
let p = 6;
const W = buf.readUInt16LE(p), H = buf.readUInt16LE(p + 2), pk = buf[p + 4];
p += 7;
p += (pk & 0x80 ? 1 << ((pk & 7) + 1) : 0) * 3;
const canvas = new Uint8Array(W * H);
let n = 0, gce = null, loops = null, errors = 0, totalDelay = 0;
const cache = new Map();
const expected = (i) => { if (!cache.has(i)) cache.set(i, scaled(sh.frame(i), sh.FW, sh.FH, S)); return cache.get(i); };
for (;;) {
  const b = buf[p++];
  if (b === 0x3b) break;
  if (b === 0x21) {
    const label = buf[p++];
    if (label === 0xf9) gce = { packed: buf[p + 1], delay: buf.readUInt16LE(p + 2), t: buf[p + 4] };
    if (label === 0xff) loops = buf.toString('latin1', p + 1, p + 12) + ':' + buf.readUInt16LE(p + 15);
    while (buf[p] !== 0) p += buf[p] + 1;
    p++;
    continue;
  }
  if (b !== 0x2c) throw new Error('unknown block ' + b.toString(16));
  const x = buf.readUInt16LE(p), y = buf.readUInt16LE(p + 2), w = buf.readUInt16LE(p + 4), h = buf.readUInt16LE(p + 6);
  p += 9;
  const minCode = buf[p++];
  const chunks = [];
  while (buf[p] !== 0) { chunks.push(buf.subarray(p + 1, p + 1 + buf[p])); p += buf[p] + 1; }
  p++;
  const pix = lzwDecode(Buffer.concat(chunks), minCode, w * h);
  const hasT = gce.packed & 1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = pix[j * w + i];
    if (!(hasT && v === gce.t)) canvas[(y + j) * W + x + i] = v;
  }
  const m = map[n];
  if (!m || m.x * S !== x || m.y * S !== y || m.w * S !== w || m.h * S !== h) { errors++; console.log('different box in frame', n); }
  const want = expected(m.from);
  let bad = 0;
  for (let k = 0; k < W * H; k++) if (canvas[k] !== want[k]) bad++;
  if (bad) { errors++; console.log(`frame ${n} (source ${m.from}): ${bad} pixels differ`); }
  let sumD = 0; for (let i = m.from; i <= m.to; i++) sumD += plan[i];
  if (sumD !== gce.delay) { errors++; console.log(`frame ${n}: delay ${gce.delay} != ${sumD}`); }
  // frames merged into this one must be identical to its first
  for (let i = m.from + 1; i <= m.to; i++) { const e = expected(i); for (let k = 0; k < W * H; k++) if (e[k] !== want[k]) { errors++; console.log('merged frame is not identical:', i); break; } }
  totalDelay += gce.delay;
  n++;
  cache.delete(m.from - 1);
}
console.log(`size ${W}x${H}, ${n} frames, loop ${loops}, ${totalDelay / 100} s, errors: ${errors}`);
console.log(`covers source frames ${map[0].from} to ${map[map.length - 1].to} of ${sh.N - 1}`);
process.exit(errors ? 1 : 0);
