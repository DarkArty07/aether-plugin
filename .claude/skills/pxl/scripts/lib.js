'use strict';
// Reads a pxl sprite sheet (the .png and .json that `pxl build` writes, or the sheet a pxl player page carries
// inline) and the helpers the other scripts share.
// A player page defines two constants this file looks for:
//   const FW = 120, FH = 120, COLS = 34, N = 816, TICK = 1000 / 30
//   const SHEET = "data:image/png;base64,..."
// If the template changes, fix the two patterns in loadPlayerPage(); it fails loudly rather than guessing.
const fs = require('fs');
const zlib = require('zlib');

// An indexed (colour type 3), 8-bit, non-interlaced PNG into one byte per pixel, plus its palette.
function decodePng(buf) {
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; il = data[12]; }
    else if (type === 'PLTE') plte = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || ct !== 3 || il !== 0) throw new Error(`unsupported PNG: bit depth ${bd}, colour type ${ct}, interlace ${il}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)];
    const src = y * (w + 1) + 1;
    const dst = y * w;
    for (let x = 0; x < w; x++) {
      const a = x > 0 ? px[dst + x - 1] : 0;
      const b = y > 0 ? px[dst - w + x] : 0;
      const c = x > 0 && y > 0 ? px[dst - w + x - 1] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[dst + x] = v & 255;
    }
  }
  return { w, h, px, plte, trns };
}

// Two inputs give the same shape: { FW, FH, N, plte, trns, frame(i), durations, fps }, where frame(i) is
// FW * FH palette indexes, `durations` the per-frame milliseconds when the input has them (else null) and `fps`
// the rate the input implies (else null).
//   - a sheet written by `pxl build`: <name>.png and the <name>.json beside it (one animation, uniform frames);
//   - a pxl player page (.html), whose script holds the sheet inline.
function loadSheet(file) {
  if (/\.html?$/i.test(file)) return loadPlayerPage(file);
  const png = decodePng(fs.readFileSync(file));
  const json = JSON.parse(fs.readFileSync(file.replace(/\.png$/i, '.json'), 'utf8'));
  const list = Object.entries(json.frames);
  if (!list.length) throw new Error('the sheet JSON lists no frames');
  const { w: FW, h: FH } = list[0][1].frame;
  for (const [name, f] of list) {
    if (f.frame.w !== FW || f.frame.h !== FH || f.rotated || f.trimmed) throw new Error(`${name}: frames must all be ${FW}x${FH}, not rotated or trimmed (one animation per sheet)`);
  }
  const frame = (i) => {
    const out = new Uint8Array(FW * FH);
    const { x, y } = list[i][1].frame;
    for (let r = 0; r < FH; r++) out.set(png.px.subarray((y + r) * png.w + x, (y + r) * png.w + x + FW), r * FW);
    return out;
  };
  return { FW, FH, N: list.length, plte: png.plte, trns: png.trns, frame, durations: list.map(([, f]) => f.duration), fps: null };
}

function loadPlayerPage(htmlPath) {
  const text = fs.readFileSync(htmlPath, 'utf8');
  const g = /const FW = (\d+), FH = (\d+), COLS = (\d+), N = (\d+), TICK = 1000 \/ (\d+)/.exec(text);
  const s = /const SHEET = "data:image\/png;base64,([A-Za-z0-9+/=]+)"/.exec(text);
  if (!g || !s) throw new Error('SHEET or the frame size constants are not in the page: the pxl player template changed');
  const [FW, FH, COLS, N, fps] = g.slice(1, 6).map(Number);
  const png = decodePng(Buffer.from(s[1], 'base64'));
  if (png.w !== FW * COLS) throw new Error(`sheet is ${png.w} px wide, expected ${FW * COLS}`);
  if (Math.ceil(N / COLS) * FH !== png.h) throw new Error(`sheet is ${png.h} px tall, which does not fit ${N} frames`);
  const frame = (i) => {
    const out = new Uint8Array(FW * FH);
    const x0 = (i % COLS) * FW, y0 = Math.floor(i / COLS) * FH;
    for (let y = 0; y < FH; y++) out.set(png.px.subarray((y0 + y) * png.w + x0, (y0 + y) * png.w + x0 + FW), y * FW);
    return out;
  };
  return { FW, FH, N, plte: png.plte, trns: png.trns, frame, durations: null, fps };
}

// Frame delays in hundredths of a second, one per source frame. A GIF stores whole hundredths, so 30 fps (33.3 ms)
// cannot be written as it is. The delays are the running total of the milliseconds rounded down, minus what was
// already written: at 30 fps that is 3, 3, 4 repeating, every three frames take exactly 10 and the loop keeps its
// true length (816 frames = 27.2 s). pxl's own GIF rounds each frame to 3 and plays 8% fast.
// An explicit `fps` wins over the sheet's own durations: pxl's JSON rounds 33.3 ms to 33.
function delayPlan(sh, fps) {
  const rate = fps || sh.fps;
  const ms = rate ? Array(sh.N).fill(1000 / rate) : sh.durations;
  if (!ms) throw new Error('the input has no frame times: pass --fps');
  const out = [];
  let total = 0, written = 0;
  for (const d of ms) {
    total += d;
    const cs = Math.floor(total / 10 + 1e-6);
    out.push(cs - written);
    written = cs;
  }
  if (out.some((d) => d < 2)) throw new Error('a frame is shorter than 20 ms; a GIF cannot hold it');
  return out;
}

// --fps N from the arguments, removed from the list.
function takeFps(args) {
  const at = args.indexOf('--fps');
  if (at < 0) return null;
  const v = Number(args.splice(at, 2)[1]);
  if (!(v > 0)) throw new Error('--fps needs a positive number');
  return v;
}

// A frame of palette indexes enlarged by a whole factor, with no smoothing.
function scaled(frame, FW, FH, S) {
  const out = new Uint8Array(FW * S * FH * S);
  const W = FW * S;
  for (let y = 0; y < FH; y++) {
    const row = y * S * W;
    for (let x = 0; x < FW; x++) {
      const v = frame[y * FW + x];
      for (let k = 0; k < S; k++) out[row + x * S + k] = v;
    }
    for (let k = 1; k < S; k++) out.copyWithin(row + k * W, row, row + W);
  }
  return out;
}

module.exports = { loadSheet, scaled, delayPlan, takeFps };
