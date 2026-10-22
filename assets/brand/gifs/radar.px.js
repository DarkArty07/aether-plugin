// radar.px.js: «Cinco metas. Una sigla.» 160 x 105 px, 360 cuadros a 30 fps (12 s), bucle sin corte.
// Aether sirve cinco metas cuyas iniciales forman RADAR, y cada informe del Lead reporta las cinco.
// Un astrolabio de mármol sobre su pedestal (anillo graduado, meridianos, brazo de barrido) gira tres vueltas
// (una cada 120 cuadros): en la primera se encienden las cinco estrellas de la constelación y las cinco letras
// talladas en cinco tablillas de mármol, en la segunda respiran en secuencia, en la tercera se apagan al paso
// del barrido para que el bucle reinicie limpio. Clawd mira el instrumento desde el estilóbato, junto a un busto.
// Cielo: nebulosa violeta con estrellas y un planeta con anillos. El informe BRIEF es una ventanita de los 90.
// Mismo lenguaje que aether.px.js: los personajes van "en dos", el barrido, los anillos, las chispas y
// los medidores se mueven en cada cuadro; paleta del kit; destello con dither Bayer; texto solo con c.text.
include("kit.px.js")

const W = 160, H = 105;

// ------------------------------------------------------------------ tiempos y geometría
const N = 360, TURN = 120;                       // 3 vueltas exactas
const CX = 44, CY = 54, RS = 29, RO = 33;        // centro, radio útil de la esfera y radio del anillo de mármol
const HIT = 104, HOLD = 4, NEG = 2;              // el cuadro de la última letra, su hit-stop y su negativo
const th = (f) => -Math.PI / 2 + (TAU * f) / TURN;   // ángulo del barrido (horario en pantalla, 0 = este)
const GROUND = 99;                               // el canto del estilóbato: donde pisan Clawd, el busto y el pedestal

// Cinco metas: letra, color, momento en que el barrido pasa por su estrella (vuelta 1), radio y posición.
const GOALS = [
  { ch: "R", k: "u", t: 16, rad: 18 },
  { ch: "A", k: "O", t: 38, rad: 24 },
  { ch: "D", k: "b", t: 60, rad: 14 },
  { ch: "A", k: "O", t: 82, rad: 22 },
  { ch: "R", k: "h", t: HIT, rad: 26 },
];
GOALS.forEach((g, i) => {
  const a = th(g.t);
  g.i = i; g.x = Math.round(CX + Math.cos(a) * g.rad); g.y = Math.round(CY + Math.sin(a) * g.rad);
  g.sx = 87 + i * 14;                            // tablilla de la letra (13 x 21)
});
const SY = 22, SW = 13, SH = 21;

const OUT = 10;                                  // cuadros que dura el apagado de una meta (vuelta 3)
const goalOff = (g) => 240 + g.t;
const amt = (g, f) => (f < g.t ? 0 : f < goalOff(g) ? 1 : 1 - clamp01((f - goalOff(g)) / OUT));
const litCount = (f) => GOALS.filter((g) => f >= g.t && f < goalOff(g)).length;
const pop = (g, f) => ease((f - g.t) / 8);       // 0..1 al encenderse (medidor)
const RAMP = ["W", "e", "3", "l", "L", "2"];     // mármol: de la luz a la sombra violeta

// ------------------------------------------------------------------ utilidades de dibujo
// Disco con dither Bayer: densidad máxima dens en el centro, cae hacia el borde.
function ditherDisc(c, cx, cy, r, col, dens, ox = 0, hole = 0) {
  for (let y = Math.ceil(cy - r); y <= cy + r; y++)
    for (let x = Math.ceil(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r || d < hole || !inside(x, y)) continue;
      if (bay(x + ox, y) < dens * (1 - d / (r + 1))) c.px(x, y, col);
    }
}
// Marco de dither alrededor de una tablilla (resplandor de la letra).
function ditherFrame(c, x, y, w, h, m, col, dens) {
  for (let yy = y - m; yy < y + h + m; yy++)
    for (let xx = x - m; xx < x + w + m; xx++) {
      if (!inside(xx, yy) || (xx >= x && xx < x + w && yy >= y && yy < y + h)) continue;
      const d = Math.max(x - xx, xx - (x + w - 1), y - yy, yy - (y + h - 1));
      if (bay(xx, yy) < dens * (1 - (d - 1) / m)) c.px(xx, yy, col);
    }
}
// Chispas: n partículas de 1 px que salen de (x, y), con gravedad ligera. t = cuadros desde el inicio.
function spark(c, x, y, t, n, speed, life, cols, seed) {
  if (t < 0 || t >= life) return;
  const rnd = seeded(seed);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rnd() * 0.9, v = speed * (0.7 + rnd() * 0.6);
    const px = Math.round(x + Math.cos(a) * v * t), py = Math.round(y + Math.sin(a) * v * t + 0.035 * t * t);
    const col = t > life * 0.7 ? "r" : cols[k % cols.length];
    if (inside(px, py)) c.px(px, py, col);
    if (t < life * 0.4 && inside(px + 1, py)) c.px(px + 1, py, col);
  }
}
const sparkle = (c, x, y, size, col = "y", arm = "l") => {
  if (size <= 0) return;
  if (inside(x, y)) c.px(x, y, col);
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, arm);
};
// Una estrella de cuatro puntas: núcleo y brazos.
const star4 = (c, x, y, arm, col, core) => {
  for (let k = 1; k <= arm; k++) for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, col);
  c.px(x, y, core);
};

// ------------------------------------------------------------------ fondo: nebulosa violeta, planeta con anillos, estrellas
const SKYK = ["z", "n", "N", "m", "M", "v"];     // niveles de la nebulosa, de oscuro a claro
const PCX = 10, PCY = 31, PR = 7;                 // el planeta, en el rincón de arriba a la izquierda
const BG = (() => {
  const bg = new Array(W * H).fill("z"), open = new Array(W * H).fill(false);
  const set = (x, y, k, solid) => { if (x >= 0 && x < W && y >= 20 && y < GROUND && x < W) { bg[y * W + x] = k; if (solid) open[y * W + x] = false; } };
  // nebulosa: una banda diagonal de ruido tramada con Bayer, más un halo detrás del planeta
  for (let y = 20; y < GROUND; y++)
    for (let x = 0; x < W; x++) {
      const b1 = Math.exp(-(((y - (80 - 0.06 * (x - 80))) / 13) ** 2));
      const b2 = Math.exp(-((Math.hypot((x - PCX) / 1.5, y - PCY) / 15) ** 2));
      const n = 0.6 * vnoise(x, y, 26) + 0.4 * vnoise(x + 50, y + 20, 9);
      const L = clamp01((n * 1.3 - 0.2) * Math.max(b1 * 0.9, b2) * 1.3) * 4.2;
      let idx = Math.floor(L);
      if (bay(x, y) < L - idx) idx++;
      bg[y * W + x] = SKYK[Math.min(idx, 5)]; open[y * W + x] = true;
    }
  // planeta con anillos: mitad de atrás del anillo, esfera iluminada desde arriba a la izquierda, mitad de delante
  const tilt = -0.3, ct = Math.cos(tilt), st = Math.sin(tilt);
  const ring = (front) => {
    for (const [sc, col] of [[1, "V"], [0.82, "v"]])
      for (let i = 0; i < 720; i++) {
        const a = (i / 720) * TAU, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        const ex = Math.cos(a) * 13 * sc, ey = s * 3.4 * sc;
        set(Math.round(PCX + ex * ct - ey * st), Math.round(PCY + ex * st + ey * ct), col, true);
      }
  };
  ring(false);
  const PL = ["N", "2", "L", "l", "e"];
  for (let y = PCY - PR; y <= PCY + PR; y++)
    for (let x = PCX - PR; x <= PCX + PR; x++) {
      const nx = (x - PCX) / PR, ny = (y - PCY) / PR, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      let Lm = Math.max(0, -0.6 * nx - 0.55 * ny + 0.65 * nz) * 1.05 + 0.1 * Math.sin(ny * 7 + nx * 2);
      Lm = clamp01(Lm) * 4;
      let i = Math.floor(Lm); if (bay(x, y) < Lm - i) i++;
      set(x, y, PL[Math.min(i, 4)], true);
    }
  ring(true);
  return { bg, open };
})();
const STARS = (() => {
  const r = seeded(31337), out = [];
  const boxes = [[0, 44, 12, 52], [0, 21, 6, 10], [79, 21, 8, 22], [72, 64, 90, 6], [99, 70, 10, 28], [0, 90, 16, 8], [158, 64, 2, 34]];
  for (const [bx, by, bw, bh] of boxes)
    for (let k = 0; k < Math.round((bw * bh) / 38) + 2; k++) {
      const x = Math.floor(bx + r() * bw), y = Math.floor(by + r() * bh);
      if (BG.open[y * W + x]) out.push([x, y, 1 + Math.floor(r() * 2), Math.floor(r() * 90)]);
    }
  return out;
})();
const BIGSTARS = [[4, 62], [82, 28], [104, 80], [75, 74]];
function backdrop(c, f) {
  c.rect(0, 0, W, 21, "z");
  for (let y = 20; y < GROUND; y++) for (let x = 0; x < W; x++) c.px(x, y, BG.bg[y * W + x]);
  for (const [x, y, lv, ph] of STARS) c.px(x, y, ["G", "3", "W"][Math.min(2, lv - 1 + ((f + ph) % 90 < 6 ? 1 : 0))]);
  for (const [x, y] of BIGSTARS) { c.px(x, y, "W"); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.px(x + dx, y + dy, "a"); }
}

// El estilóbato: un escalón de mármol con su greca, a lo ancho; ahí pisan el pedestal, el busto y Clawd.
const KEYR = ["XXXXXXX.", "X.....X.", "X.XXX.XX"];
function stylobate(c) {
  c.hline(0, GROUND, W, "W"); c.hline(0, GROUND + 1, W, "e");
  c.rect(0, GROUND + 2, W, 3, "2");
  for (let r = 0; r < 3; r++) for (let x = 0; x < W; x++) if (KEYR[r][x & 7] === "X") c.px(x, GROUND + 2 + r, "l");
  c.hline(0, GROUND + 5, W, "1");
}

// ------------------------------------------------------------------ el pedestal del astrolabio (y su placa con la vuelta)
function pedestal(c, f) {
  // ménsulas que sostienen el anillo
  for (const s of [-1, 1]) {
    const x0 = CX + s * 21;
    c.poly([x0 - s * 3, 88, x0 + s * 6, 88, x0 + s * 6, 84, x0 + s * 1, 79, x0 - s * 3, 79], "e");
    c.poly([x0 - s * 3, 79, x0 + s * 1, 79, x0 + s * 6, 84, x0 + s * 6, 86], "3");
  }
  // capitel
  c.hline(16, 88, 56, "W"); c.hline(16, 89, 56, "e"); c.hline(17, 89, 54, "3"); c.px(16, 89, "e"); c.px(71, 89, "l");
  // fuste con estrías y la placa tallada
  c.rect(21, 90, 46, 7, "e");
  c.vline(21, 90, 7, "W"); c.vline(66, 90, 7, "l"); c.vline(22, 90, 7, "3"); c.vline(65, 90, 7, "L");
  c.rect(25, 90, 38, 7, "1");
  c.hline(25, 90, 38, "z"); c.vline(25, 90, 7, "z"); c.hline(25, 96, 38, "3"); c.vline(62, 90, 7, "2");
  const flash = [TURN, 2 * TURN].some((t) => f >= t && f < t + 6);
  c.text(26, 91, `SWEEP ${Math.floor(f / TURN) + 1}/3`, flash ? "y" : "l");
  // base
  c.hline(18, 97, 52, "e"); c.hline(18, 98, 52, "3"); c.px(18, 97, "W"); c.px(69, 98, "L");
}

// ------------------------------------------------------------------ el astrolabio
function scope(c, f) {
  const a = th(f);
  c.circ(CX, CY, 30, "c");
  FACE_STARS.forEach(([dx, dy]) => c.px(CX + dx, CY + dy, "1"));
  // estela del barrido: cuña de 72 grados, dither Bayer que se desvanece hacia atrás
  const wedge = 1.25;
  for (let y = CY - RS; y <= CY + RS; y++)
    for (let x = CX - RS; x <= CX + RS; x++) {
      const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
      if (d > RS + 0.5 || d < 1) continue;
      let diff = (a - Math.atan2(dy, dx)) % TAU;
      if (diff < 0) diff += TAU;
      if (diff >= wedge) continue;
      const v = (1 - diff / wedge) ** 1.35;
      if (bay(x, y) < Math.min(1, v + 0.02)) c.px(x, y, v > 0.5 ? "l" : v > 0.22 ? "L" : "2");
    }
  // meridianos (esfera armilar), anillos de alcance, cruz y marcas
  c.ellipse(CX, CY, 11, RS - 1, "1", true); c.ellipse(CX, CY, RS - 1, 11, "1", true);
  c.ring(CX, CY, 10, "1"); c.ring(CX, CY, 20, "1");
  c.hline(CX - RS, CY, 2 * RS + 1, "1"); c.vline(CX, CY - RS, 2 * RS + 1, "1");
  for (const r of [10, 20]) {
    c.hline(CX + r - 1, CY - 1, 3, "2"); c.hline(CX + r - 1, CY + 1, 3, "2");
    c.hline(CX - r - 1, CY - 1, 3, "2"); c.hline(CX - r - 1, CY + 1, 3, "2");
    c.vline(CX - 1, CY + r - 1, 3, "2"); c.vline(CX + 1, CY + r - 1, 3, "2");
    c.vline(CX - 1, CY - r - 1, 3, "2"); c.vline(CX + 1, CY - r - 1, 3, "2");
  }
  // el anillo de mármol: luz arriba a la izquierda, sombra violeta abajo a la derecha, borde biselado
  for (let y = CY - RO; y <= CY + RO; y++)
    for (let x = CX - RO; x <= CX + RO; x++) {
      const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
      if (d < 30 || d > RO + 0.5) continue;
      const ang = Math.atan2(dy, dx), L = -(Math.cos(ang) + Math.sin(ang)) * 0.7071;
      const v = ((1 - L) / 2) * 3.3 + (d < 30.8 ? 1 : 0) + (d > 32.8 ? 1 : 0);
      let idx = Math.floor(v); if (bay(x, y) < v - idx) idx++;
      c.px(x, y, RAMP[Math.min(idx, 5)]);
    }
  for (let k = 0; k < 36; k++) {                 // graduación tallada
    const b = (k / 36) * TAU, major = k % 3 === 0;
    for (const r of major ? [31.2, 32.2] : [31.7])
      c.px(Math.round(CX + Math.cos(b) * r), Math.round(CY + Math.sin(b) * r), major ? "2" : "L");
  }
  // brazo del barrido (alidada): punta de luz sobre el anillo, contrapeso al otro lado, buje de mármol
  const ca = Math.cos(a), sa = Math.sin(a);
  c.line(CX, CY, Math.round(CX + ca * 31), Math.round(CY + sa * 31), "W");
  c.px(Math.round(CX + ca * 32), Math.round(CY + sa * 32), "y");
  c.px(Math.round(CX + ca * 30), Math.round(CY + sa * 30), "y");
  c.line(CX, CY, Math.round(CX - ca * 7), Math.round(CY - sa * 7), "3");
  c.circ(Math.round(CX - ca * 9), Math.round(CY - sa * 9), 1, "e");
  c.rect(CX - 1, CY - 1, 3, 3, "e"); c.px(CX - 1, CY - 1, "W"); c.px(CX + 1, CY + 1, "L");
}
const FACE_STARS = (() => {
  const r = seeded(808), out = [];
  while (out.length < 9) {
    const dx = Math.round((r() * 2 - 1) * 27), dy = Math.round((r() * 2 - 1) * 27), d = Math.hypot(dx, dy);
    if (d > 27 || d < 3) continue;
    if (Math.abs(Math.abs(d) - 10) < 2 || Math.abs(d - 20) < 2 || Math.abs(dx) < 2 || Math.abs(dy) < 2) continue;
    if (GOALS.some((g) => Math.hypot(g.x - CX - dx, g.y - CY - dy) < 6)) continue;
    out.push([dx, dy]);
  }
  return out;
})();

// Anillos de ping que salen del centro: el grande del golpe y uno cada 40 cuadros en la vuelta 2.
const PINGS = [HIT, 164, 204];
function pings(c, f) {
  PINGS.forEach((p0, k) => {
    const t = f - p0, big = k === 0, life = big ? 16 : 36;
    if (t < 0 || t > life) return;
    const r = Math.round(2 + (RS - 2) * (big ? ease(t / life) ** 0.6 : t / life));
    const col = t < 2 ? "y" : t < life * 0.45 ? "W" : t < life * 0.75 ? "l" : "L";
    c.ring(CX, CY, r, col);
    if (big && t < 10) c.ring(CX, CY, Math.max(1, r - 2), t < 5 ? "e" : "L");
    if (t % 2 === 0 || big) ditherDisc(c, CX, CY, r, col, big ? 0.3 : 0.14, 0, Math.max(0, r - 3));
  });
}
// Cuánto sacude un ping a la estrella g (respira cuando el anillo la cruza).
function pingBump(g, f) {
  let m = 0;
  PINGS.forEach((p0, k) => {
    if (k === 0) return;
    const t = f - p0, r = 2 + (RS - 2) * (t / 36);
    if (t >= 0 && t <= 36) m = Math.max(m, clamp01(1 - Math.abs(r - g.rad) / 3.2));
  });
  return m;
}

// La constelación: una línea punteada une cada estrella con la siguiente cuando ambas están encendidas.
function constellation(c, f) {
  for (let i = 1; i < GOALS.length; i++) {
    const g0 = GOALS[i - 1], g1 = GOALS[i];
    if (f < g1.t) continue;
    const off0 = f - goalOff(g0);
    let p = off0 < 0 ? ease((f - g1.t) / 9) : 1 - ease(off0 / OUT);   // crece desde la anterior; al apagarse se recoge
    if (p <= 0) continue;
    const dx = g1.x - g0.x, dy = g1.y - g0.y, n = Math.max(Math.abs(dx), Math.abs(dy));
    for (let k = 2; k < n - 1; k += 2) {
      if (k / n > p) break;
      c.px(Math.round(g0.x + (dx * k) / n), Math.round(g0.y + (dy * k) / n), off0 >= 0 ? "2" : "F");
    }
  }
}

function blips(c, f) {
  for (const g of GOALS) {
    const u = f - g.t, a = amt(g, f), off = f - goalOff(g);
    if (a <= 0) {
      c.px(g.x, g.y, "9");                         // la estrella fija, apagada
      if (u >= -5 && u < 0) c.px(g.x, g.y, u % 2 ? "x" : "9");    // el barrido casi llega
      continue;
    }
    const bump = f >= 240 ? 0 : Math.max(pingBump(g, f), f >= 112 ? letterBump(g.i, f) * 0.8 : 0);
    // marca fija y respiración
    if (u >= 0 && u < 22 || off >= 0) {
      // golpe de aparición
      if (u >= 0 && u < 22) {
        const rr = Math.round(2 + u * 0.65);
        const col = u < 2 ? "y" : u < 9 ? g.k : u < 14 ? "F" : "9";
        if (u < 16) c.ring(g.x, g.y, rr, col);
        if (u >= 3 && u < 11) c.ring(g.x, g.y, rr - 3, u < 7 ? g.k : "F");
        if (u < 8) ditherDisc(c, g.x, g.y, 8, g.k, 0.8 * (1 - u / 8), u);
        spark(c, g.x, g.y, u - 1, 6, 0.85, 13, [g.k, "y"], 500 + g.i);
      }
      if (off >= 0 && off < OUT) {                  // se apaga: el anillo se contrae
        c.ring(g.x, g.y, Math.max(1, 6 - off * 0.5 | 0), off < 4 ? "x" : "F");
        ditherDisc(c, g.x, g.y, 5, g.k, 0.5 * (1 - off / OUT), off);
      }
    }
    ditherDisc(c, g.x, g.y, 4 + Math.round(bump * 2), g.k, 0.16 + bump * 0.4, 0);
    const col = a < 1 ? "F" : g.k;
    const arm = u >= 0 && u < 3 ? 2 : bump > 0.55 && a >= 1 ? 2 : 1;      // la estrella de cuatro puntas respira
    star4(c, g.x, g.y, arm, u >= 0 && u < 3 ? "y" : col, a >= 1 && u >= 3 ? "y" : u >= 0 && u < 3 ? "y" : col);
    if (a >= 1 && u >= 3) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) c.px(g.x + dx, g.y + dy, bump > 0.3 ? g.k : "F");
  }
}

// ------------------------------------------------------------------ las letras
// Onda de respiración, de izquierda a derecha, en la vuelta 2 (y cada vez más suave en la 3).
function letterBump(i, f) {
  if (f < 112) return 0;
  const env = f < 236 ? 1 : 0.35;
  const s = Math.sin((TAU * (f - 112 - i * 6)) / 40);
  return s > 0 ? s * s * env : 0;
}
// Rebote de la tablilla al encenderse: ancla, destello, sobrepaso y asentamiento.
const OUTSET = [0, 0, 2, 2, 1, 1, 0, 0];
function letters(c, f) {
  // resplandor violeta de fondo primero, para que las tablillas lo tapen
  for (const g of GOALS) {
    const u = f - g.t, a = amt(g, f), bump = letterBump(g.i, f);
    let dens = a * (0.06 + bump * 0.32);
    if (u >= 0 && u < 12) dens = Math.max(dens, 0.7 * (1 - u / 12));
    if (dens > 0.01) ditherFrame(c, g.sx, SY, SW, SH, 3, u >= 0 && u < 4 ? "l" : "L", dens);
  }
  for (const g of GOALS) {
    const u = f - g.t, a = amt(g, f), off = f - goalOff(g), bump = letterBump(g.i, f);
    let o = 0, dy = 0, hi = "W", lo = "L", face = "2", ink = "W";
    if (u >= -4 && u < 0 && a <= 0) { hi = u % 2 ? "y" : "l"; lo = hi; }            // anticipación: se carga
    if (a > 0) {
      hi = "3";
      if (bump > 0.9) { hi = "y"; lo = "l"; }
      if (f >= g.t && f < g.t + 24) {
        const w = two(u);
        o = OUTSET[Math.min(w, OUTSET.length - 1)];
        dy = [0, 0, -2, -1, 0, 1, 0][Math.min(w, 6)];
        if (u < 2) { face = "W"; hi = "y"; lo = "y"; ink = "L"; }
        else if (u < 4) { face = "l"; ink = "1"; }
      }
      if (off >= 0 && off < OUT) { hi = off < 2 ? "y" : "3"; }
    }
    const x = g.sx - o, y = SY - o, w = SW + 2 * o, h = SH + 2 * o;
    // cara de mármol, con la sombra violeta abajo
    c.rect(x, y, w, h, "e");
    c.rect(x + 1, y + h - 3, w - 2, 2, "3");
    c.hline(x + 1, y + h - 4, w - 2, "e");
    // la cara se enciende: violeta profundo (con dither al apagarse)
    if (a > 0)
      for (let yy = y + 1; yy < y + h - 1; yy++)
        for (let xx = x + 1; xx < x + w - 1; xx++)
          if (face !== "2" || a >= 1 || bay(xx, yy) < a) c.px(xx, yy, face);
    c.hline(x, y, w, hi); c.vline(x, y, h, hi); c.hline(x, y + h - 1, w, lo); c.vline(x + w - 1, y, h, lo);
    if (a > 0 && face === "2") { c.hline(x + 1, y + 1, w - 2, "L"); c.vline(x + 1, y + 1, h - 2, "L"); }   // el bisel interior
    // la gema sobre la letra: del color de su meta
    const gx = x + (w >> 1), gy = y + 2 + (o > 0 ? 0 : 0);
    const gk = a > 0 ? g.k : "l";
    c.px(gx, gy - 1, a > 0 ? gk : "3"); c.px(gx - 1, gy, a > 0 ? gk : "3"); c.px(gx + 1, gy, a > 0 ? gk : "3");
    c.px(gx, gy + 1, a > 0 ? gk : "3"); c.px(gx, gy, a > 0 ? "y" : "l");
    // la letra tallada
    const tx = g.sx + 2, ty = SY + 4 + dy;
    if (a <= 0) {
      c.text(tx + 1, ty + 1, g.ch, "W", { scale: 3 });
      c.text(tx, ty, g.ch, "l", { scale: 3 });
    } else {
      const keep = off >= 0 ? clamp01(1 - off / OUT) : 1;                  // se disuelve con dither
      c.clip((xx, yy) => bay(xx, yy) < keep || (off >= 0 && keep > 0.9), () => c.text(tx + 1, ty + 1, g.ch, "z", { scale: 3 }));
      c.clip((xx, yy) => bay(xx, yy) < keep || (off >= 0 && keep > 0.9), () => c.text(tx, ty, g.ch, ink, { scale: 3 }));
      if (u >= 2 && u < 6) c.hline(tx, ty - 1, 9, "y");                    // brillo al llegar
    }
    if (u >= 1 && u < 15) spark(c, g.sx + 6, SY + 1, u - 1, 5, 0.8, 14, ["l", "y"], 700 + g.i);
  }
}
// El informe BRIEF: una ventanita de los 90, con la tira RADAR de cinco cuadros que se llenan con cada meta.
function brief(c, f, n) {
  const X = 87, Y = 44, WW = 69, HH = 19, flash = f >= HIT && f < HIT + 4;
  c.rect(X + 1, Y + HH, WW, 1, "Z"); c.rect(X + WW, Y + 1, 1, HH, "Z");                // sombra
  c.rect(X, Y, WW, HH, "g");
  c.hline(X, Y, WW, "y"); c.vline(X, Y, HH, "y"); c.hline(X, Y + HH - 1, WW, "E"); c.vline(X + WW - 1, Y, HH, "E");
  // barra de título: degradado de violeta a violeta claro, con tramado
  for (let yy = Y + 1; yy < Y + 8; yy++)
    for (let xx = X + 1; xx < X + WW - 1; xx++)
      c.px(xx, yy, flash ? "l" : bay(xx, yy) < (xx - X) / WW ? "L" : "2");
  c.text(X + 4, Y + 2, "BRIEF", "y");
  for (const [bx, kind] of [[X + 47, 0], [X + 53, 1], [X + 59, 2]]) {                    // las tres cajitas
    c.rect(bx, Y + 2, 5, 5, "g"); c.hline(bx, Y + 2, 5, "y"); c.vline(bx, Y + 2, 5, "y"); c.hline(bx, Y + 6, 5, "E"); c.vline(bx + 4, Y + 2, 5, "E");
    if (kind === 0) c.hline(bx + 1, Y + 5, 3, "c");
    else if (kind === 1) c.box(bx + 1, Y + 3, 3, 3, "c");
    else for (const [dx, dy] of [[1, 3], [3, 3], [2, 4], [1, 5], [3, 5]]) c.px(bx + dx, Y + dy, "c");
  }
  // el pozo hundido, con la palabra y los cinco cuadros
  c.rect(X + 2, Y + 9, WW - 4, 9, "W");
  c.hline(X + 2, Y + 9, WW - 4, "G"); c.vline(X + 2, Y + 9, 9, "G"); c.hline(X + 2, Y + 17, WW - 4, "y"); c.vline(X + WW - 3, Y + 9, 9, "y");
  c.text(X + 6, Y + 11, "RADAR", "I");
  GOALS.forEach((g, i) => {
    const a = amt(g, f), x = 118 + i * 7, u = f - g.t, bump = letterBump(i, f);
    const col = a <= 0 ? "G" : u >= 0 && u < 3 ? "y" : bump > 0.9 ? "y" : a < 1 ? "F" : g.k;
    c.rect(x, Y + 11, 5, 5, col);
    c.hline(x, Y + 15, 5, a <= 0 ? "U" : col === "y" ? "y" : "E"); c.vline(x + 4, Y + 11, 5, a <= 0 ? "U" : col === "y" ? "y" : "E");   // bisel
    if (a > 0 && u >= 3) c.px(x, Y + 11, "y");
  });
}

// ------------------------------------------------------------------ el busto, a la izquierda de Clawd
const BUST = { x: 84, y: 67 };
function bust(c, f, n) {
  const { x, y } = BUST;
  // pedestal: losa, fuste acanalado y basa
  c.rect(x, y + 19, 14, 2, "W"); c.hline(x, y + 20, 14, "e"); c.vline(x + 13, y + 19, 2, "3");
  c.rect(x + 2, y + 21, 10, 9, "e");
  for (const i of [3, 6, 9]) c.vline(x + i, y + 21, 9, "l");
  c.vline(x + 2, y + 21, 9, "W"); c.vline(x + 11, y + 21, 9, "3");
  c.hline(x + 2, y + 21, 10, "L");
  c.rect(x, y + 30, 14, 2, "e"); c.hline(x, y + 30, 14, "W"); c.hline(x, y + 31, 14, "3");
  // pecho con la toga, cuello y cabeza
  c.poly([x, y + 19, x + 2, y + 14, x + 5, y + 12, x + 9, y + 12, x + 12, y + 14, x + 14, y + 19], "e");
  c.poly([x, y + 19, x + 2, y + 14, x + 4, y + 13, x + 5, y + 19], "W");
  c.poly([x + 10, y + 13, x + 12, y + 14, x + 14, y + 19, x + 11, y + 19], "3");
  c.line(x + 3, y + 18, x + 8, y + 14, "l", 1); c.line(x + 6, y + 18, x + 10, y + 15, "l", 1);
  c.rect(x + 5, y + 10, 4, 3, "e"); c.vline(x + 8, y + 10, 3, "3"); c.hline(x + 5, y + 12, 4, "l");
  c.ellipse(x + 7, y + 5, 4, 5, "W");
  c.vline(x + 10, y + 3, 5, "e"); c.vline(x + 11, y + 4, 3, "3");                  // el lado en sombra
  for (let i = 0; i < 8; i++) c.px(x + 3 + i, y + (i % 2 ? 0 : 1), i % 2 ? "L" : "l");               // rizos
  c.rect(x + 3, y + 1, 9, 2, "l"); c.hline(x + 4, y, 7, "L"); c.px(x + 3, y + 3, "l"); c.px(x + 11, y + 3, "L");
  c.hline(x + 4, y + 4, 2, "L"); c.hline(x + 8, y + 4, 2, "L");                    // cejas
  c.vline(x + 7, y + 5, 3, "3"); c.px(x + 7, y + 8, "l");                          // nariz
  c.hline(x + 6, y + 9, 3, "l");                                                  // boca
  // los ojos del busto siguen al instrumento: se encienden con cada meta y destellan con el golpe
  const spike = GOALS.some((g) => f >= g.t && f < g.t + 6 && f < 240) || (f >= HIT && f < HIT + 8);
  const eye = spike ? "y" : n > 0 ? "L" : "2";
  c.rect(x + 4, y + 5, 2, 1, eye); c.rect(x + 8, y + 5, 2, 1, eye);
}

// ------------------------------------------------------------------ Clawd
function clawd(f) {
  const s = { pose: "idle", dy: 0, eyes: "sq", flip: false, halo: null };
  const a = th(f - 6), cs = Math.cos(a), sn = Math.sin(a);
  s.eyes = Math.abs(cs) >= Math.abs(sn) ? (cs > 0 ? "right" : "left") : sn < 0 ? "up" : "down";
  if (f % 90 >= 40 && f % 90 < 44) s.eyes = "blink";
  const t = f - HIT;
  const g = GOALS.find((q) => q !== GOALS[4] && f >= q.t + 3 && f < q.t + 11 && f < 240);
  if (g) { s.pose = "point_l"; s.eyes = "left"; }                          // señala la estrella que acaba de saltar
  if (f >= HIT - 6 && f < HIT) { s.pose = "squash"; s.eyes = "wide"; }      // anticipación: se agacha
  else if (t >= 0 && t < 4) { s.pose = "surprise"; s.eyes = "wide"; s.halo = "y"; }
  else if (t >= 4 && t < 18) {                                             // salto con los brazos arriba
    const u = (t - 4) / 14;
    s.pose = "armsup"; s.eyes = "happy"; s.dy = -Math.round(15 * u * (1 - u)); s.halo = t < 10 ? "y" : "a";
  } else if (t >= 18 && t < 22) { s.pose = "squash"; s.eyes = "happy"; }
  else if (t >= 22 && t < 46) { s.pose = "armsup"; s.eyes = "happy"; if (t < 34) s.halo = "a"; }
  else if (t >= 46 && t < 52) s.eyes = "happy";
  // vuelta 2: saltitos al ritmo de la onda (cuando la última letra respira) y del ping que sale del centro
  for (const h of [164, 186, 204, 226]) {
    const q = f - h;
    if (q >= 0 && q < 8 && s.pose === "idle") { s.dy = -[1, 2, 2, 1][two(q)]; s.eyes = "happy"; }
  }
  return s;
}
// Contorno de 1 px alrededor de una máscara.
function halo(c, mask, col) {
  const m = new Uint8Array(W * H);
  for (const i of mask) m[i] = 1;
  for (const i of mask) {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const xx = x + dx, yy = y + dy;
      if (inside(xx, yy) && !m[yy * W + xx]) c.px(xx, yy, col);
    }
  }
}

// ------------------------------------------------------------------ barra
function hud(c, f, n) {
  const flash = f >= HIT && f < HIT + 4;
  c.rect(4, 3, 152, 11, flash ? "l" : "c");
  c.box(4, 3, 152, 11, "F");
  c.text(7, 6, "> RADAR", flash ? "c" : n === 5 ? "w" : "x");
  const right = `${n}/5`;
  c.text(153 - right.length * 4, 6, right, flash ? "c" : n === 5 ? "j" : "X");
  c.text(4, 15, "LIT", "X");
  c.box(17, 15, 139, 5, "F");
  c.rect(18, 16, 137, 3, "c");
  GOALS.forEach((g, i) => {
    const x = 18 + Math.round(i * 27.75), p = pop(g, f) * (f < g.t ? 0 : 1);
    const k = amt(g, f);
    const w = Math.round(25 * (f < goalOff(g) ? p : k));
    if (w > 0) c.rect(x, 16, w, 3, g.k);
    if (w > 0 && w < 25) c.px(x + w - 1, 16, "y");
  });
}

// ------------------------------------------------------------------ la animación
anim("radar", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HIT && f < HIT + HOLD) f = HIT;                // hit-stop: el mundo se congela tras la última letra
  const n = litCount(f);
  const st = clawd(f);
  const [x, y] = place(st.pose, st.flip, 132, GROUND + st.dy, 2);

  backdrop(c, f);
  bust(c, f, n);
  pedestal(c, f);
  stylobate(c);
  scope(c, f);
  pings(c, f);
  constellation(c, f);
  blips(c, f);
  letters(c, f);
  brief(c, f, n);
  const mask = drawPose(c, st.pose, x, y, 2, "o", st.flip);
  drawEyes(c, eyesOf(st.pose, x, y, 2, st.flip), 2, st.eyes, "k");
  if (st.halo) halo(c, mask, st.halo);
  if (f >= HIT + 4 && f < HIT + 40) {                    // chispas cósmicas sobre el festejo
    const t = f - HIT - 4;
    sparkle(c, 112, 64, [1, 2, 3, 2, 1][two(t) % 5] * (t < 30 ? 1 : 0), "y", "v");
    sparkle(c, 152, 70, [2, 3, 2, 1, 2][two(t + 3) % 5] * (t < 30 ? 1 : 0), "y", "l");
  }
  if (real >= HIT && real < HIT + NEG)                    // cuadro de impacto en negativo (el mármol y la noche se invierten)
    c.recolor({ z: "W", W: "z", Z: "e", e: "Z", c: "3", 3: "c", 1: "l", l: "1", 2: "L", L: "2", n: "V", N: "P", x: "1", g: "K", G: "J", I: "e" });
  hud(c, f, n);
})

sheet("radar_sheet", ["radar"], { pad: 0 })
