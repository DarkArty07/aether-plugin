'use strict';
// node zoom.js <sheet.png | player.html> <out.png> <zoom> [--cols N] <frame>[:<y0>-<y1>] ...
// Writes a PNG of source frames (or a band of rows of one) enlarged by a whole factor, to read small text and
// check single pixels. With no --cols the bands stack top to bottom; with --cols N they tile in a grid.
//   node zoom.js "Clawd Aether.html" /tmp/hud.png 8 182:0-13 300:105-120
//   node zoom.js "Clawd Aether.html" /tmp/sheet.png 2 --cols 4 0 60 150 214 340 586
// Needs no browser: it reads the sheet and writes the PNG itself.
const fs = require('fs');
const zlib = require('zlib');
const { loadSheet } = require('./lib.js');

const args = process.argv.slice(2);
const colsAt = args.indexOf('--cols');
const cols = colsAt >= 0 ? Number(args.splice(colsAt, 2)[1]) : 0;
const [htmlPath, outPath, zoomArg, ...specs] = args;
const Z = Number(zoomArg);
if (!htmlPath || !outPath || !Number.isInteger(Z) || Z < 1 || !specs.length || (colsAt >= 0 && !(cols >= 1))) {
  console.error('usage: node zoom.js <sheet.png | player.html> <out.png> <zoom> [--cols N] <frame>[:<y0>-<y1>] ...');
  process.exit(2);
}
const sh = loadSheet(htmlPath);
const GAP = 8;
const bands = specs.map((spec) => {
  const [f, rows] = spec.split(':');
  const [y0, y1] = rows ? rows.split('-').map(Number) : [0, sh.FH];
  if (!(Number(f) >= 0 && Number(f) < sh.N) || !(y0 >= 0 && y1 > y0 && y1 <= sh.FH)) throw new Error(`bad frame spec ${spec}`);
  return { f: Number(f), y0, y1, h: (y1 - y0) * Z };
});
const bw = sh.FW * Z;
const nCols = cols || 1;
const nRows = Math.ceil(bands.length / nCols);
const rowH = Array.from({ length: nRows }, (_, r) => Math.max(...bands.slice(r * nCols, r * nCols + nCols).map((b) => b.h)));
const W = nCols * bw + (nCols - 1) * GAP, H = rowH.reduce((a, b) => a + b, 0) + (nRows - 1) * GAP;
const img = Buffer.alloc(W * H * 3, 40);
const rowTop = rowH.map((_, r) => rowH.slice(0, r).reduce((a, b) => a + b + GAP, 0));
bands.forEach((b, i) => {
  const ox = (i % nCols) * (bw + GAP), oy = rowTop[Math.floor(i / nCols)];
  const fr = sh.frame(b.f);
  for (let y = b.y0; y < b.y1; y++) for (let x = 0; x < sh.FW; x++) {
    const c = fr[y * sh.FW + x] * 3;
    for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
      const o = ((oy + (y - b.y0) * Z + dy) * W + ox + x * Z + dx) * 3;
      img[o] = sh.plte[c]; img[o + 1] = sh.plte[c + 1]; img[o + 2] = sh.plte[c + 2];
    }
  }
});
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(outPath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${outPath}: ${W}x${H}, ${bands.length} band(s) at x${Z}`);
