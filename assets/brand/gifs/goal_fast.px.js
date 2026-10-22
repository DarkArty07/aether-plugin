// goal_fast.px.js: meta 1 de «Cinco metas. Una sigla.» (R · Rápido / FAST). 160 x 105 px, 360 cuadros a 30 fps (12 s), bucle sin corte.
// «Los modelos rápidos y baratos hacen el grueso del trabajo, y nada itera sin fin.»
// Un cangrejo ligero (verde) corre de la pila de disquetes a la meta, un disquete tras otro. Uno fuerte (rosa) espera
// sobre su plinto de mármol, como una estatua, con la etiqueta $$$ y los ojos a medio cerrar: se guarda para lo difícil.
// El tercer disquete lo rechaza el altar; entra al limitador de reintentos (una ventana de diálogo de los 90 titulada
// RETRY MAX 3, con flecha circular, reloj de arena y ITER 1/2/3), y al llegar al límite una losa de piedra con sello de
// cera roja cae y lo cierra (NO ENDLESS LOOPS) mientras el ligero ya va por el siguiente. El último disquete rompe la
// cinta entre las dos columnitas de meta: hit-stop, negativo, sacudida y confeti, una sola vez. Al final la pila se
// rehace y el bucle empieza igual que al principio.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): tarjetas -> disquetes de 3.5"; la pila, sobre un
// escalón de mármol; la meta, una columna de la victoria con corona de laurel y la bandera, y una cinta entre dos
// columnitas; el suelo, un estilóbato con greca; el cangrejo fuerte, sobre un plinto con friso de greca; el limitador,
// un diálogo de los 90; la compuerta, una losa de piedra con sello de cera. Fondo: nebulosa violeta, estrellas y un
// planeta con anillos, quietos (el peso del GIF va en la acción).
// Guion (cuadros virtuales v; el tiempo real se congela HOLD cuadros en el golpe):
//   0    pila de 6 disquetes, el ligero saluda        12/60/108/156/204/252  salidas de los 6 disquetes (48 cuadros cada una)
//   56/104/200/248/296  aterrizajes (296 = la cinta)   152  el altar rechaza el 3o; 168 a 240 reintentos 1, 2, 3; 240 losa
//   296 golpe       326 la pila se rehace y la losa sube     346 el ligero vuelve a casa
include("kit.px.js")

const W = 160, H = 105;
const N = 360, HIT = 296, HOLD = 4, NEG = 2;
const FLOOR = 86, HOME = 36, STOP = 100;            // estilóbato, casa del cangrejo y donde frena
const PILE_X = 9, PILE_BASE = 75;                   // la pila de disquetes (sobre su escalón) y la base
const POLE_X = 152, TAPE_Y = 70;                    // eje de la columna de la victoria / de su asta, altura de la cinta
const POST_L = 119, POST_R = 141;                   // las dos columnitas de la cinta (fuste de 4 px)
const CR = { x: 124, y: 74, w: 16, h: 12 };         // el altar de meta, con su ranura y el cuenta
const DUR = 48;                                     // cuadros por salida
const TRIPS = [12, 60, 108, 156, 204, 252].map((s, i) => ({ s, i, fail: i === 2, last: i === 5 }));
const LAND = 44;                                    // cuadro relativo en que el disquete cae en el altar
const OK_LANDS = TRIPS.filter((t) => !t.fail).map((t) => t.s + LAND);
const RT0 = 168, IT = 24, LIMIT = RT0 + 3 * IT;     // reintentos: entra el disquete, 3 vueltas, losa
const GATE_UP = 326, RESET = 322, REFILL0 = 326;

// El tiempo virtual: congelado HOLD cuadros en el golpe, sin saltos después.
const vOf = (r) => (r < HIT ? r : r < HIT + HOLD ? HIT : r - HOLD + 1);

// Paleta propia: rojos oscuros (rechazo, cera) y el mármol, de la luz lavanda a la sombra violeta.
pal({ q: "#4a1d33", d: "#8a2740",
  "&": "#f3eaff", "%": "#e6dcff", "^": "#cba6f7", "*": "#8466d6", "+": "#4a3a8a" });

// ------------------------------------------------------------------ utilidades de dibujo
function spark(c, x, y, t, n, speed, life, cols, seed) {
  if (t < 0 || t >= life) return;
  const rnd = seeded(seed);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rnd() * 0.9, vv = speed * (0.7 + rnd() * 0.6);
    const px = Math.round(x + Math.cos(a) * vv * t), py = Math.round(y + Math.sin(a) * vv * t + 0.035 * t * t);
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
function haloOf(c, mask, col) {
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
// Recorre el lienzo para sacudirlo (todo menos la barra de arriba). El cielo (nebulosa) se queda quieto: solo tiembla lo
// que está delante, y así el golpe no pesa en el GIF.
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 16; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.key(x, y);
  const sky = (x, y) => y < FLOOR && buf[y * W + x] === SKY.bg[y * W + x];
  for (let y = 16; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(16, y - dy));
      c.px(x, y, sky(sx, sy) ? SKY.bg[y * W + x] : buf[sy * W + sx]);
    }
}

// ------------------------------------------------------------------ el disquete de 3.5" (la tarjeta)
// 12 x 8: carcasa lavanda con contorno, postigo metálico con su ranura, etiqueta blanca con la franja del nivel (S).
const FLOPG = [
  "KKKKKKKKKKK.",
  "K3eGGGGGc3KK",
  "K3eGGGGGc33K",
  "K3eGGGGGG33K",
  "K3333333333K",
  "K3SWXXXXWW3K",
  "K3SWWWWWWW3K",
  "KKKKKKKKKKKK",
];
// Se redimensiona por vecino más cercano (de canto, ladeado, aplastado). solid pinta todo de un color (destello).
function flop(c, x, y, w = 12, h = 8, stripe = "t", solid = null) {
  for (let r = 0; r < h; r++)
    for (let q = 0; q < w; q++) {
      const ch = FLOPG[Math.min(7, Math.floor(((r + 0.5) * 8) / h))][Math.min(11, Math.floor(((q + 0.5) * 12) / w))];
      if (ch === "." || !inside(x + q, y + r)) continue;
      c.px(x + q, y + r, solid ?? (ch === "S" ? stripe : ch));
    }
}
// Cuatro vistas al girar: de frente, ladeado, de canto, ladeado.
const SPINS = [[12, 0], [9, 1], [3, 4], [9, 1]];
function spinFlop(c, x, y, t, stripe) { const [w, ox] = SPINS[two(t) % 4]; flop(c, x + ox, y, w, 8, stripe); }

// ------------------------------------------------------------------ fondo: nebulosa, estrellas, planeta (todo quieto)
const SKYK = ["z", "n", "N", "m", "M", "v"];                 // niveles de la nebulosa, de oscuro a claro
const SKY = (() => {
  const bg = new Array(W * H).fill("z"), open = new Array(W * H).fill(false);
  const set = (x, y, k, solid) => { if (x >= 0 && x < W && y >= 15 && y < FLOOR) { bg[y * W + x] = k; if (solid) open[y * W + x] = false; } };
  // nebulosa: una banda diagonal de ruido tramada con Bayer; más oscura abajo para que la acción se lea
  for (let y = 15; y < FLOOR; y++)
    for (let x = 0; x < W; x++) {
      const band = Math.exp(-(((y - (36 + 0.12 * (x - 80))) / 16) ** 2));
      const n = 0.6 * vnoise(x + 17, y + 5, 26) + 0.4 * vnoise(x + 50, y + 20, 9);
      let L = clamp01((n * 1.3 - 0.2) * band * 1.3) * 5.4;
      if (y > 52) L = Math.min(L, 2.2);
      let idx = Math.floor(L);
      if (bay(x, y) < L - idx) idx++;
      let k = SKYK[Math.min(idx, 5)];
      if (idx === 0 && bay(x, y) < clamp01((y - 54) / 24) * 0.7) k = "n";           // bruma violeta sobre el estilóbato
      bg[y * W + x] = k; open[y * W + x] = idx <= 1;
    }
  // planeta con anillos: la mitad de atrás del anillo, la esfera y la mitad de delante (detrás del diálogo y de la bandera)
  const PCX = 131, PCY = 40, PR = 7;
  const ring = (front) => {
    for (const [sc, col] of [[1, "V"], [0.8, "v"]])
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * TAU, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        set(Math.round(PCX + Math.cos(a) * 13 * sc + s * 1.5 * sc), Math.round(PCY + s * 3.4 * sc - Math.cos(a) * 0.1), col, true);
      }
  };
  ring(false);
  const PL = ["N", "2", "L", "l", "e"];
  for (let y = PCY - PR; y <= PCY + PR; y++)
    for (let x = PCX - PR; x <= PCX + PR; x++) {
      const nx = (x - PCX) / PR, ny = (y - PCY) / PR, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      let Lm = clamp01(Math.max(0, -0.6 * nx - 0.55 * ny + 0.65 * nz) * 1.05 + 0.1 * Math.sin(ny * 7 + nx * 2)) * 4;
      let i = Math.floor(Lm); if (bay(x, y) < Lm - i) i++;
      set(x, y, PL[Math.min(i, 4)], true);
    }
  ring(true);
  return { bg, open };
})();
const STARS = (() => {
  const r = seeded(2468), out = [];
  for (let i = 0; i < 70 && out.length < 34; i++) {
    const x = Math.floor(r() * W), y = 15 + Math.floor(r() * 50), lv = r() < 0.15 ? 3 : r() < 0.5 ? 2 : 1, ph = Math.floor(r() * 90);
    if (SKY.open[y * W + x]) out.push([x, y, lv, ph]);
  }
  return out;
})();
const STARC = [null, "G", "3", "W"];

// Columna dórica acanalada: ábaco y equino arriba, fuste de la luz a la sombra, basa. w = ancho del fuste.
function dcol(c, x, top, bot, w, put = (px, py, k) => c.px(px, py, k)) {
  for (let q = -1; q <= w; q++) { put(x + q, top, "&"); put(x + q, top + 1, "%"); }
  for (let q = 0; q < w; q++) put(x + q, top + 2, q === w - 1 ? "*" : "^");
  for (let y = top + 3; y < bot - 2; y++)
    for (let q = 0; q < w; q++) put(x + q, y, q === 0 ? "&" : q === w - 1 ? "*" : q >= w - 2 ? "^" : q % 2 ? "%" : "^");
  for (let q = -1; q <= w; q++) { put(x + q, bot - 2, "%"); put(x + q, bot - 1, q === w ? "*" : "^"); }
}
// Greca (meandro) de tres filas, para el friso del plinto y el estilóbato.
const GREC = ["aaaaaaa.", "a.....a.", "a.aaa.a."];
function backdrop(c, real) {
  for (let y = 15; y < FLOOR; y++) for (let x = 0; x < W; x++) c.px(x, y, SKY.bg[y * W + x]);
  for (const [x, y, lv, ph] of STARS) c.px(x, y, STARC[Math.min(3, lv + ((real + ph) % 90 < 6 ? 1 : 0))]);
  // el plinto del cangrejo fuerte: losa, friso de greca y dos columnas dóricas que lo sostienen
  c.rect(0, 51, 55, 8, "%"); c.hline(0, 51, 55, "&");
  for (let r = 0; r < 3; r++) for (let x = 0; x < 55; x++) if (GREC[r][x & 7] === "a") c.px(x, 54 + r, "*");
  c.hline(0, 57, 55, "^"); c.hline(0, 58, 55, "*");
  dcol(c, 1, 59, FLOOR, 4); dcol(c, 50, 59, FLOOR, 4);
  // el escalón de mármol bajo la pila de disquetes
  c.rect(7, 83, 16, 3, "%"); c.hline(7, 83, 16, "&"); c.hline(7, 85, 16, "*");
  // el estilóbato: arista, labio y greca
  c.hline(0, FLOOR, W, "&"); c.hline(0, FLOOR + 1, W, "%");
  c.rect(0, FLOOR + 2, W, 3, "^");
  for (let r = 0; r < 3; r++) for (let x = 0; x < W; x++) if (GREC[r][x & 7] === "a") c.px(x, FLOOR + 2 + r, "+");
}

// ------------------------------------------------------------------ el cangrejo fuerte (rosa, sobre su plinto)
function strong(c, real, v, look) {
  const [x, y] = place("idle", false, 28, 51, 2);
  c.ellipse(28, 51, 21, 1, "^");                      // su sombra contra la losa
  drawPose(c, "idle", x, y, 2, (px, py, r) => (r < 2 ? "H" : "h"));
  const eyes = eyesOf("idle", x, y, 2, false).map(([ex, ey]) => [ex + look, ey]);
  const awake = v >= HIT && v < HIT + 10;
  const blink = (real + 30) % 90 < 4;
  eyes.forEach(([ex, ey]) => {
    if (awake) { c.rect(ex, ey - 1, 4, 5, "c"); c.px(ex + 2, ey, "y"); return; }
    if (blink) { c.rect(ex, ey + 3, 4, 1, "c"); return; }
    c.rect(ex, ey, 4, 2, "6");                         // el párpado
    c.rect(ex, ey + 2, 4, 2, "c");                     // medio ojo
  });
  // la etiqueta de precio, colgada del pecho
  const sw = [0, 0, 1, 1, 0, 0, -1, -1][two(real) % 8] * (real % 90 < 45 ? 1 : 0);
  c.vline(28 + sw, 34, 3, "O");
  c.rect(21 + sw, 37, 15, 9, "c"); c.box(21 + sw, 37, 15, 9, "O");
  c.text(23 + sw, 39, "$$$", "O");
  const g = real % 90;
  if (g < 8) sparkle(c, 35 + sw, 38, [1, 2, 3, 3, 2, 2, 1, 1][g], "y", "O");
  if (awake) {
    const t = v - HIT;
    c.text(42, 22 + (t < 4 ? 0 : -1), "!", "O");
  }
}

// ------------------------------------------------------------------ la pila de disquetes
const JIT = [0, 1, -1, 1, 0, -1];                    // la pila no está al ras: cada disquete se corre un píxel
const pileY = (k) => PILE_BASE - 3 * k;
const grabAt = (k) => TRIPS[5 - k].s;               // el disquete k de la pila lo toma la salida 5 - k
const refillAt = (k) => REFILL0 + 4 * k;
function pile(c, v) {
  for (let k = 0; k < 6; k++) {
    if (v >= grabAt(k) && v < refillAt(k)) continue;
    const x = PILE_X + JIT[k], y = pileY(k), u = v - refillAt(k);
    if (u >= 0 && u < 2) { flop(c, x, y, 12, 8, "t", "y"); sparkle(c, x + 13, y + 1, u ? 2 : 3); continue; }
    if (u >= 2 && u < 4) { flop(c, x - 1, y + 2, 14, 6, "t"); continue; }
    flop(c, x, y, 12, 8, "t");
  }
}

// ------------------------------------------------------------------ el cangrejo ligero (verde)
const WALKAB = (t) => (two(t) % 2 ? "walk_b" : "walk_a");
function crabState(v) {
  const st = { x: HOME, pose: "idle", dy: 0, eyes: "sq", dir: 0, brake: false, carry: false, halo: null, mark: null, t: -1, trip: null };
  if (v < 12) {
    if (v >= 2 && v < 8) { st.pose = "armsup"; st.eyes = "happy"; st.dy = two(v) % 2 ? -1 : 0; }    // saluda al fuerte
    return st;
  }
  if (v >= HIT) {
    const h = v - HIT;
    st.x = STOP;
    if (h < 5) { st.pose = "surprise"; st.eyes = "wide"; st.halo = "y"; st.mark = "!"; }
    else if (h < 19) {
      const u = (h - 5) / 14;
      st.pose = "armsup"; st.eyes = "happy"; st.dy = -Math.round(24 * u * (1 - u)); st.halo = h < 11 ? "y" : "a";
    } else if (h < 23) { st.pose = "squash"; st.eyes = "happy"; }
    else if (h < 30) { st.pose = "armsup"; st.eyes = "happy"; if (h < 27) st.halo = "a"; }
    else if (h < 50) {
      const u = (h - 30) / 20;
      st.x = Math.round(STOP + (HOME - STOP) * ease(u)); st.pose = WALKAB(h); st.dy = two(h) % 2 ? -1 : 0; st.dir = -0.5;
    }
    return st;
  }
  for (const T of TRIPS) {
    const t = v - T.s;
    if (t < 0 || t >= DUR) continue;
    st.t = t; st.trip = T;
    if (t < 6) { st.pose = "squash"; }
    else if (t < 28) {
      const u = (t - 6) / 22;
      st.carry = true; st.dir = 1;
      st.x = Math.round(HOME + (STOP - HOME) * (1 - (1 - u) ** 1.8));
      st.pose = WALKAB(t); st.dy = two(t) % 2 ? -2 : 0;
    } else if (t < 32) { st.carry = t < 32; st.brake = true; st.x = STOP; st.pose = "squash"; }
    else if (t < 37) { st.x = STOP; st.pose = "armsup"; st.eyes = "happy"; st.dy = t >= 33 && t < 36 ? -2 : 0; }
    else if (T.last) { st.x = STOP; st.pose = "idle"; st.eyes = "wide"; }
    else {
      const u = (t - 36) / 12;
      st.dir = -1; st.x = Math.round(STOP + (HOME - STOP) * ease(u));
      st.pose = WALKAB(t); st.dy = two(t) % 2 ? -2 : 0;
      if (T.fail && t >= 38) { st.mark = "?"; st.eyes = "sq"; }
    }
    return st;
  }
  return st;
}
const headY = (st) => FLOOR + st.dy - POSES[st.pose].g.length - 7;

function drawCrab(c, st, real) {
  const [x, y] = place(st.pose, false, st.x, FLOOR + st.dy, 1);
  const sw = Math.max(8, 18 + st.dy * 3);                 // sombra: se achica al saltar
  c.hline(st.x - (sw >> 1), FLOOR, sw, "*");
  const mask = drawPose(c, st.pose, x, y, 1, (px, py, r) => (r < 2 ? "T" : "t"));
  const blink = st.eyes === "sq" && (real + 11) % 90 < 3;
  drawEyes(c, eyesOf(st.pose, x, y, 1, false), 1, blink ? "blink" : st.eyes, "c");
  if (st.halo) haloOf(c, mask, st.halo);
  if (st.mark) {
    const sq = two(real) % 2 ? 1 : 0;
    c.text(st.x - 1, y - 7 - sq, st.mark, st.mark === "!" ? "O" : "7");
  }
  if (st.mark === "?" ) c.text(st.x - 1, y - 7, "?", "O");
}

// Líneas de velocidad y polvo: salen del estado del cangrejo en cuadros anteriores.
function runFx(c, v, real) {
  const st = crabState(v);
  if (st.dir !== 0 && st.carry === (st.dir > 0) || st.dir === -1) {
    const d = Math.sign(st.dir), off = two(v) % 2 ? 3 : 0;
    [[8, 11, "x"], [13, 8, "l"], [4, 13, "G"]].forEach(([dy, len, col], i) => {
      const x0 = st.x - d * (15 + i * 2 + off) , y0 = FLOOR - dy - st.dy * 0;
      for (let q = 0; q < len; q++) {
        const xx = d > 0 ? x0 - q : x0 + q;
        if (bay(xx, y0) < 1 - q / (len + 2) && inside(xx, y0)) c.px(xx, y0, col);
      }
    });
  }
  // polvo de mármol detrás de los pies
  for (let k = 0; k < 5; k++) {
    const vs = v - (v % 3) - 3 * k, age = v - vs, sp = crabState(vs);
    if (sp.dir === 0 || sp.dir === -0.5 || age > 12) continue;
    if (age > 9) continue;
    const d = Math.sign(sp.dir), px = sp.x - d * (11 + age), py = FLOOR - 2 - (age >> 2);
    const col = age < 3 ? "&" : age < 6 ? "^" : "*";
    if (age < 6) c.rect(px, py, 2, 2, col); else { c.px(px, py, col); c.px(px + 2, py - 1, col); }
  }
  if (st.brake) {                                          // frena: polvo hacia adelante
    const a = st.t - 28;
    c.rect(st.x + 14 + a * 2, FLOOR - 3 - (a >> 1), 2, 2, a < 2 ? "&" : "^");
    c.rect(st.x + 12 + a, FLOOR - 2, 2, 1, a < 2 ? "&" : "*");
  }
}

// ------------------------------------------------------------------ disquetes en movimiento
const FLY_FROM = [STOP - 6, 62], FLY_TO = [CR.x + 2, CR.y - 8];
const WELL = { x: 59, y: 26, w: 40, h: 23 }, RCX = 79, RCY = 37;      // el pozo del diálogo, donde gira la flecha
function flight(t) {                                        // t 0..12
  const u = ease(t / 12);
  return bez(FLY_FROM, [(FLY_FROM[0] + FLY_TO[0]) / 2, 34], FLY_TO, u);
}
function movingCards(c, v) {
  for (const T of TRIPS) {
    const t = v - T.s;
    if (t < 0 || t >= DUR + 16) continue;
    if (t < 6) {                                            // sube de la pila a la cabeza
      const k = 5 - T.i, from = [PILE_X + JIT[k], pileY(k)], st = crabState(T.s + 6);
      const [x, y] = bez(from, [from[0] + 8, from[1] - 20], [HOME - 6, headY({ ...st, pose: "squash", dy: 0 })], ease(t / 6));
      flop(c, x, y);
    } else if (t < 32) {
      const st = crabState(v);
      flop(c, st.x - 6, headY(st));
    } else if (t <= LAND) {
      const [x, y] = flight(t - 32);
      if (t >= LAND - 2) flop(c, x, y, 12, 8, T.fail ? "u" : "t");
      else spinFlop(c, x, y, t, "t");
    } else if (!T.fail && t < LAND + 5) {                   // se hunde por la ranura del altar
      c.clip([CR.x + 1, 0, CR.w - 2, CR.y + 2], () => flop(c, FLY_TO[0], FLY_TO[1] + (t - LAND) * 2));
    } else if (T.fail && t < LAND + 16) {                   // rebota hacia el diálogo
      const u = ease((t - LAND) / 16);
      const [x, y] = bez(FLY_TO, [104, 4], [RCX - 6, RCY - 4], u);
      if (t - LAND < 3) flop(c, x, y, 12, 8, "u");
      else spinFlop(c, x, y, t, t - LAND < 8 ? "u" : "O");
    }
  }
}

// ------------------------------------------------------------------ la meta: columna de la victoria, bandera, altar
function done(v) { return v >= RESET ? Math.max(0, 5 - (v - RESET)) : OK_LANDS.filter((l) => v >= l).length; }
// Corona de laurel sobre el fuste: dos ramas que bajan desde arriba y se juntan en un lazo.
function wreath(c, v, real) {
  const cx = POLE_X, cy = 58;
  for (const side of [-1, 1])
    for (let i = 0; i < 19; i++) {
      const th = (22 + i * 8.6) * (Math.PI / 180), s = Math.sin(th), co = Math.cos(th);
      const at = (r) => [Math.round(cx + side * s * r), Math.round(cy - co * r)];
      const [bx, by] = at(5.5), [ox, oy] = at(7), [ix, iy] = at(4);
      c.px(bx, by, i % 2 ? "t" : "4");
      if (i % 2) c.px(ox, oy, "T"); else c.px(ix, iy, "4");
      if (i % 3 === 1) c.px(ix, iy, "t");
    }
  c.rect(cx - 2, cy + 7, 5, 2, "V"); c.px(cx, cy + 7, "u"); c.px(cx - 3, cy + 9, "V"); c.px(cx + 3, cy + 9, "V");   // el lazo
  const gl = OK_LANDS.find((l) => v >= l + 6 && v < l + 12 && l !== OK_LANDS[4]);
  if (gl !== undefined) sparkle(c, cx - 6, cy - 3, [1, 2, 2, 1, 1, 1][v - gl - 6], "y", "T");
}
function finish(c, v, real) {
  // línea de meta: taracea a cuadros en el estilóbato
  for (let x = 108; x < 116; x++) for (let y = FLOOR + 2; y < FLOOR + 5; y++) c.px(x, y, ((x >> 1) + (y >> 1)) & 1 ? "y" : "+");
  // la columna de la victoria: asta con la bandera de cuadros, capitel, fuste, corona de laurel y basa
  c.rect(POLE_X, 29, 2, 16, "e"); c.circ(POLE_X, 28, 1, "O");
  const amp = v >= HIT && v < HIT + 40 ? 2 : 1;
  for (let q = 0; q < 12; q++) {
    const dy = Math.round(Math.sin((TAU * real) / 36 - q * 0.55) * amp * (q / 11));
    for (let r = 0; r < 8; r++) c.px(POLE_X - 1 - q, 31 + r + dy, ((q >> 1) + (r >> 1)) & 1 ? "+" : "y");
  }
  dcol(c, POLE_X - 3, 44, 83, 7);
  c.rect(POLE_X - 5, 83, 11, 3, "%"); c.hline(POLE_X - 5, 83, 11, "&"); c.hline(POLE_X - 5, 85, 11, "*");
  wreath(c, v, real);
  // el altar: bloque de mármol con la ranura donde entra el disquete y cinco muescas de laurel que cuentan
  const reject = v >= TRIPS[2].s + LAND && v < TRIPS[2].s + LAND + 8;
  const sq = OK_LANDS.some((l) => v >= l + 4 && v < l + 8) ? 1 : 0;
  const cy = CR.y + sq, h = CR.h - sq;
  c.rect(CR.x, cy, CR.w, h, reject ? "q" : "%");
  c.hline(CR.x, cy, CR.w, reject ? "d" : "&"); c.vline(CR.x, cy, h, reject ? "d" : "&");
  c.vline(CR.x + CR.w - 1, cy, h, reject ? "q" : "^"); c.hline(CR.x, cy + h - 1, CR.w, reject ? "q" : "*");
  if (reject && two(v) % 2) c.box(CR.x, cy, CR.w, h, "u");
  c.hline(CR.x + 3, cy + 1, CR.w - 6, reject ? "d" : "*"); c.rect(CR.x + 3, cy + 2, CR.w - 6, 2, "c");   // la ranura
  const n = done(v);
  for (let i = 0; i < 5; i++) c.rect(CR.x + 1 + i * 3, cy + 6, 2, 3, i < n ? (v >= HIT && v < RESET ? "j" : "T") : "+");
  if (reject) {                                             // X roja
    const r = v - (TRIPS[2].s + LAND);
    for (let d = 0; d < 5; d++) { c.px(CR.x + 5 + d, CR.y - 10 + d - (r >> 2), "u"); c.px(CR.x + 9 - d, CR.y - 10 + d - (r >> 2), "u"); }
  }
  // la palomita sube del altar
  for (const l of OK_LANDS) {
    const t = v - l;
    if (t >= 4 && t < 20 && l !== OK_LANDS[4]) paintGrid(c, PROPS.check.map((row) => row.slice(0, Math.min(7, (t - 3) * 2 + 1))), CR.x + 5, CR.y - 12 - (t >> 2));
    if (t >= 0 && t < 6 && l !== OK_LANDS[4]) sparkle(c, CR.x + 8, CR.y - 2, [3, 3, 2, 2, 1, 1][t], "y", "T");
  }
}
// Las dos columnitas y la cinta de meta.
function tape(c, v) {
  const T0 = 262, T1 = 266, T2 = 274;
  if (v < T0 || v >= 336) return;
  const fade = v >= 326 ? clamp01((v - 326) / 8) : 0;
  const keep = (x, y) => fade === 0 || bay(x, y) >= fade;
  const put = (x, y, k) => { if (keep(x, y) && inside(x, y)) c.px(x, y, k); };
  const ph = v < T1 ? Math.round(24 * ease((v - T0) / (T1 - T0))) : 24;
  for (const px of [POST_L, POST_R]) {
    const top = FLOOR - ph;
    if (ph >= 8) {
      for (let q = -1; q <= 4; q++) { put(px + q, top, "&"); put(px + q, top + 1, "%"); }
      for (let y = top + 2; y < FLOOR - 2; y++) for (let q = 0; q < 4; q++) put(px + q, y, ["&", "%", "^", "*"][q]);
    } else for (let y = top; y < FLOOR - 2; y++) for (let q = 0; q < 4; q++) put(px + q, y, ["&", "%", "^", "*"][q]);
    for (let q = -1; q <= 4; q++) { put(px + q, FLOOR - 2, "%"); put(px + q, FLOOR - 1, q === 4 ? "*" : "^"); }
  }
  if (v < T1) return;
  const x0 = POST_L + 4, x1 = POST_R;
  const col = (x) => ((x >> 2) & 1 ? "u" : "y");
  if (v < HIT) {
    const len = Math.round((x1 - x0) * ease((v - T1) / (T2 - T1)));
    for (let x = x0; x < x0 + len; x++) { c.px(x, TAPE_Y - 1, col(x)); c.px(x, TAPE_Y, col(x)); c.px(x, TAPE_Y + 1, "d"); }
    if (v < T2) sparkle(c, x0 + len, TAPE_Y, 2, "y", "l");
    return;
  }
  const t = v - HIT, mid = FLY_TO[0] + 6;                  // se rompe donde cae el disquete
  const d = Math.min(16, Math.round(t * t * 0.18 + t * 0.4));
  const wob = Math.round(Math.sin(t / 2) * 1);
  const seg = (xa, ya, xb, yb) => {
    const L = Math.max(1, Math.abs(xb - xa));
    for (let i = 0; i <= L; i++) {
      const u = i / L, x = Math.round(xa + (xb - xa) * u), y = Math.round(ya + (yb - ya) * u * u);
      put(x, y - 1, col(x)); put(x, y, col(x)); put(x, y + 1, "d");
    }
  };
  seg(x0, TAPE_Y, mid - 3, TAPE_Y + d);
  seg(x1 - 1, TAPE_Y, mid + 3, TAPE_Y + d + wob);
}

// ------------------------------------------------------------------ el limitador: un diálogo de los 90 (RETRY MAX 3)
const PX = 55, PY = 16, PW = 66, PH = 44;
function ringArrow(c, ang, head, mid, tail) {
  const L = TAU * 0.75, steps = 60;
  for (let j = 0; j <= steps; j++) {
    const fr = j / steps, a = ang - L * fr;
    if (fr > 0.55 && bay(j, j >> 1) > 1 - fr * 0.9) continue;
    const col = fr < 0.18 ? head : fr < 0.5 ? mid : tail;
    for (const r of fr < 0.5 ? [9, 8] : [9]) c.px(Math.round(RCX + Math.cos(a) * r), Math.round(RCY + Math.sin(a) * r), col);
  }
  const px = RCX + Math.cos(ang) * 8.5, py = RCY + Math.sin(ang) * 8.5, tx = -Math.sin(ang), ty = Math.cos(ang), nx = Math.cos(ang), ny = Math.sin(ang);
  c.poly([px + tx * 4.5, py + ty * 4.5, px + nx * 4, py + ny * 4, px - nx * 4, py - ny * 4].map(Math.round), head);
}
// Reloj de arena de 9 x 17: p = cuánta arena ya cayó (0 arriba, 1 abajo); flip = de canto, mientras se da la vuelta.
const HG_TOP = [3, 3, 3, 2, 2, 1, 0], HG_BOT = [0, 1, 2, 2, 3, 3, 3];
function hourglass(c, x0, y0, p, flip, glass, sandCol = "O") {
  const cx = x0 + 4;
  if (flip) {
    c.rect(cx - 2, y0, 5, 1, "e"); c.rect(cx - 2, y0 + 16, 5, 1, "e");
    c.vline(cx, y0 + 1, 15, glass); return;
  }
  c.rect(x0, y0, 9, 1, "&"); c.rect(x0, y0 + 1, 9, 1, "e");
  c.rect(x0, y0 + 15, 9, 1, "e"); c.rect(x0, y0 + 16, 9, 1, "L");
  const lt = Math.round((1 - p) * 7), lb = Math.round(p * 7);
  for (let i = 0; i < 7; i++) {
    const yt = y0 + 2 + i, yb = y0 + 9 + i, ht = HG_TOP[i], hb = HG_BOT[i];
    for (const [yy, hw, filled] of [[yt, ht, i >= 7 - lt], [yb, hb, i >= 7 - lb]]) {
      c.hline(cx - hw, yy, hw * 2 + 1, filled ? sandCol : "c");
      c.px(cx - hw - 1, yy, glass); c.px(cx + hw + 1, yy, glass);
    }
  }
  c.px(cx, y0 + 8, p > 0 && p < 1 ? sandCol : "c");
  if (p > 0 && p < 1) {                                      // el hilo de arena que cae por el cuello
    const surf = y0 + 15 - lb;
    for (let y = y0 + 9; y < surf; y++) if ((y + (c.frame ?? 0)) % 2 === 0) c.px(cx, y, sandCol);
  }
}
// Hueco hundido (como los de las ventanas de los 90): sombra arriba y a la izquierda, luz abajo y a la derecha.
function sunk(c, x, y, w, h, fill = "c") {
  c.rect(x, y, w, h, fill);
  c.hline(x - 1, y - 1, w + 2, "E"); c.vline(x - 1, y - 1, h + 2, "E");
  c.hline(x - 1, y + h, w + 2, "y"); c.vline(x + w, y - 1, h + 2, "y");
}
function retry(c, v, real) {
  const active = v >= RT0 - 8 && v < LIMIT, closed = v >= LIMIT && v < GATE_UP + 8;
  const n = Math.min(3, Math.floor((v - RT0) / IT) + 1), k = (v - RT0) % IT;
  const failing = active && v >= RT0 && k >= 20;
  const slabDown = closed && v < GATE_UP;
  c.rect(PX + 2, PY + 2, PW, PH, "z");                      // sombra de la ventana
  c.rect(PX, PY, PW, PH, "g");
  c.hline(PX, PY, PW, "y"); c.vline(PX, PY, PH, "y"); c.hline(PX, PY + PH - 1, PW, "E"); c.vline(PX + PW - 1, PY, PH, "E");
  // barra de título con su texto y las tres cajitas
  const bar = closed && v < GATE_UP + 4 ? "d" : active && v >= RT0 ? "L" : "2";
  c.rect(PX + 1, PY + 1, PW - 2, 8, bar);
  c.text(PX + 3, PY + 3, "RETRY MAX 3", "W");
  for (let b = 0; b < 3; b++) {
    const bx = PX + PW - 16 + b * 5, by = PY + 3;
    c.rect(bx, by, 4, 4, "g"); c.hline(bx, by, 4, "y"); c.vline(bx, by, 4, "y"); c.hline(bx, by + 3, 4, "E"); c.vline(bx + 3, by, 4, "E");
    if (b === 0) c.px(bx + 1, by + 2, "c"); else if (b === 1) c.px(bx + 1, by + 1, "c"); else { c.px(bx + 1, by + 1, "c"); c.px(bx + 2, by + 2, "c"); }
  }
  // el pozo donde gira la flecha y el pozo del reloj de arena
  sunk(c, WELL.x, WELL.y, WELL.w, WELL.h);
  sunk(c, 101, WELL.y, 17, WELL.h);
  // reloj de arena: la arena cae durante la vuelta; al empezar otra, se da la vuelta
  let p = 0, flip = false, glass = "e";
  if (active && v >= RT0) { p = clamp01(k / 20); flip = n > 1 && k < 2; if (failing) glass = n === 3 ? "u" : "O"; }
  else if (closed && v < GATE_UP + 2) { p = 1; glass = "u"; }
  hourglass(c, 105, WELL.y + 4, p, flip, glass);
  // la barra de estado: ITER n/3 y tres puntos
  sunk(c, 59, 51, 58, 7);
  const lit = closed && v < GATE_UP + 4 ? 3 : active && v >= RT0 ? n : 0;
  const itCol = closed && v < GATE_UP + 4 ? (two(v) % 6 < 4 ? "u" : "X") : failing ? (n === 3 ? "u" : "O") : active && v >= RT0 ? "x" : "X";
  c.text(62, 52, `ITER ${lit}/3`, v >= RT0 - 8 && v < RT0 && two(v) % 2 ? "x" : itCol);
  for (let i = 0; i < 3; i++) c.rect(100 + i * 5, 53, 4, 3, i < lit ? ["t", "O", "u"][i] : "+");
  // el interior del pozo
  if (!slabDown) {
    if (v >= RT0 && active) {
      const ang = -Math.PI / 2 + (TAU * k) / IT;
      if (failing) ringArrow(c, ang, n === 3 ? "u" : "O", n === 3 ? "u" : "O", "q");
      else ringArrow(c, ang, "T", "t", "4");
      flop(c, RCX - 6, RCY - 4, 12, 8, failing ? "u" : "t");
      if (failing && two(v) % 2) c.box(RCX - 7, RCY - 5, 14, 10, n === 3 ? "u" : "O");
      if (k < 3 && n > 1) spark(c, RCX, RCY, k, 6, 0.9, 6, ["T", "y"], 40 + n);
    } else {
      ringArrow(c, -0.6, "+", "+", "1");
      if (active) c.hline(RCX - 6, RCY + 12, 12, two(v) % 2 ? "x" : "X");   // se despierta: llega el disquete
    }
  }
  // la losa de piedra con sello de cera roja
  if (closed) {
    const tt = v - LIMIT, tr = v - GATE_UP;
    let off = tt < 6 ? [-30, -18, -6, 2, -1, 0][tt] : 0;
    if (tr >= 0) off = -Math.round(ease(tr / 8) * 30);
    const gx = PX + 2, gy = 26 + off, gw = PW - 4, gh = 26;
    c.clip([PX + 1, 26, PW - 2, 25], () => {
      c.rect(gx, gy, gw, gh, "*");
      c.hline(gx, gy, gw, "^"); c.vline(gx, gy, gh, "^"); c.hline(gx, gy + gh - 1, gw, "+"); c.vline(gx + gw - 1, gy, gh, "+");
      for (let r = 0; r < 3; r++)                            // frisos de greca, arriba y abajo
        for (let x = gx + 2; x < gx + gw - 2; x++)
          if (GREC[r][(x - gx) & 7] === "a") { c.px(x, gy + 2 + r, "+"); c.px(x, gy + gh - 5 + r, "+"); }
      const lx = gx + 7, ly = gy + 8;                        // letras grabadas: hueco oscuro y borde claro
      c.text(lx + 1, ly + 1, "STOP", "^", { scale: 2 });
      c.text(lx, ly, "STOP", "z", { scale: 2 });
      const sxx = gx + 47, syy = gy + 13, press = tt >= 3 ? (tt < 5 ? 7 : 6) : 0;
      if (press) {                                           // el sello de cera: se estampa y respira
        c.circ(sxx + 1, syy + 1, press, "z");
        c.circ(sxx, syy, press, "d");
        c.circ(sxx, syy, press - 1, tt >= 5 && two(v) % 12 < 6 ? "u" : "d");
        c.ring(sxx, syy, 3, "d"); c.px(sxx, syy, "d"); c.px(sxx - 3, syy - 3, "V"); c.px(sxx - 2, syy - 4, "V");
        if (tt >= 5) { c.px(sxx + 2, syy + 6, "d"); c.px(sxx + 2, syy + 7, "u"); }   // gota de cera
      }
    });
    if (tt >= 3 && tt < 12) spark(c, 88, 52, tt - 3, 8, 0.8, 9, ["e", "y", "u"], 91);
  }
}

// ------------------------------------------------------------------ confeti
const CONF = (() => {
  const r = seeded(9001), out = [];
  for (let k = 0; k < 36; k++)
    out.push({ vx: (r() - 0.5) * 1.8, vy: -(1.5 + r() * 2.1), col: ["t", "b", "h", "y", "a", "O"][k % 6], d: Math.floor(r() * 5), life: 44 + Math.floor(r() * 8) });
  return out;
})();
function confetti(c, v) {
  for (const p of CONF) {
    const t = v - HIT - p.d;
    if (t < 1 || t > p.life) continue;
    let x = Math.round(132 + p.vx * t * 0.75 + Math.sin((t + p.d * 3) / 5)), y = Math.round(68 + p.vy * t + 0.06 * t * t);
    if (y > FLOOR - 2) y = FLOOR - 2;
    if (t > p.life - 10 && bay(x, y) > (p.life - t) / 10) continue;
    if (!inside(x, y) || !inside(x + 1, y + 1)) continue;
    if (two(t + p.d) % 2) c.rect(x, y, 2, 1, p.col); else c.rect(x, y, 1, 2, p.col);
  }
  const t = v - HIT;
  if (t >= 0 && t < 9) {                                   // anillo del golpe
    const r = 2 + t * 1.1;
    c.ring(132, 68, Math.round(r), t < 2 ? "y" : t < 6 ? "T" : "t");
    if (t < 6) sparkle(c, 124, 64, [3, 3, 2, 2, 1, 1][t], "y", "l");
    if (t < 6) sparkle(c, 140, 62, [3, 3, 2, 2, 1, 1][t], "y", "l");
  }
}

// ------------------------------------------------------------------ barra de arriba y subtítulo
function hud(c, v, real) {
  const flash = real >= HIT && real < HIT + 4;
  const n = done(v);
  c.rect(4, 3, 152, 11, flash ? "l" : "c");
  c.box(4, 3, 152, 11, "F");
  c.text(7, 6, "> FAST", n === 5 && v < RESET ? "j" : "w");
  const right = `${n} DONE`, bump = OK_LANDS.some((l) => v >= l && v < l + 6) && v < HIT;
  c.text(153 - right.length * 4, 6, right, n === 5 && v < RESET ? "j" : bump ? "y" : "X");
}
function caption(c, v) {
  const n = Math.min(3, Math.floor((v - RT0) / IT) + 1);
  const CAPS = [
    [0, "> 6 TASKS WAITING", "x", "QUEUE", "X"],
    [12, "> LIGHT CRAB TAKES THE BULK", "x", "CHEAP", "t"],
    [62, "> HEAVY CRAB: HARD JOBS ONLY", "x", "$$$", "O"],
    [100, "> FAST AND CHEAP", "x", "CHEAP", "t"],
    [152, "> TASK REJECTED", "u", "", ""],
    [166, `> RETRY ITER ${n}/3`, "x", "LIMIT 3", "O"],
    [LIMIT, "> NO ENDLESS LOOPS", two(v) % 8 < 5 ? "O" : "u", "STOP", "u"],
    [284, "> LAST CARD", "w", "CHEAP", "t"],
    [HIT, "> ALL DONE, FAST", "j", "5 DONE", "j"],
    [322, "> NEW QUEUE", "x", "", ""],
    [340, "> 6 TASKS WAITING", "x", "QUEUE", "X"],
  ];
  let cap = CAPS[0];
  for (const q of CAPS) if (v >= q[0]) cap = q;
  c.rect(4, 91, 152, 11, "c"); c.box(4, 91, 152, 11, "F");
  c.text(7, 94, cap[1], cap[2]);
  if (cap[3]) c.text(153 - cap[3].length * 4, 94, cap[3], cap[4]);
}

// ------------------------------------------------------------------ la animación
anim("goal_fast", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame, v = vOf(real);
  const st = crabState(v);
  c.rect(0, 0, W, H, "z");
  backdrop(c, real);
  strong(c, real, v, st.x > 70 ? 1 : 0);
  retry(c, v, real);
  finish(c, v, real);
  tape(c, v);
  pile(c, v);
  runFx(c, v, real);
  movingCards(c, v);
  drawCrab(c, st, real);
  confetti(c, v);
  caption(c, v);
  hud(c, v, real);
  if (real >= HIT && real < HIT + NEG)                    // cuadro de impacto en negativo
    c.recolor({ z: "W", Z: "e", 1: "l", n: "3", N: "3", c: "S", "&": "z", "%": "1", "^": "2", "*": "e", "+": "W", t: "A", 4: "L", F: "L", 2: "e", g: "z", E: "W", K: "W" });
  const sh = real - HIT - HOLD;
  if (sh >= 0 && sh < 10) shake(c, [2, -2, 1, -1, 0][sh >> 1], [1, -1, 0, 1, 0][sh >> 1]);   // el temblor va "en dos": cada postura dura 2 cuadros
})

sheet("goal_fast_sheet", ["goal_fast"], { pad: 0 })
