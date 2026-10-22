// goal_robust.px.js: meta 5 de «Cinco metas», R · ROBUSTO. 160 x 105 px, 360 cuadros a 30 fps (12 s), bucle sin corte.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): un camino de mármol con tres arcos, uno por
// estación, y la greca como friso; el bloque de código es una ventana de los 90; el recibo es un pergamino con sello
// de cera; el flash de cámara es el destello de un escáner, un CRT beige; el escudo es un sello de laurel; los
// cangrejos y Clawd se paran en pequeños plintos. Fondo: nebulosa violeta con estrellas y las columnas de la arcada.
// La ventana (el bloque de código) cruza el camino por tres estaciones: TESTS, EVIDENCE y REVIEW.
//  - TESTS: una lista de pruebas se marca línea por línea; la cuarta falla (rojo), de la ventana salta un bicho,
//    el cangrejo verde (el que escribió el código) lanza un parche (un disquete), las pruebas corren otra vez y quedan en verde.
//  - EVIDENCE: Clawd dispara el escáner; sale un pergamino con un hash y una palomita, con su sello de cera, que
//    se prende a la ventana.
//  - REVIEW: un cangrejo azul, otro personaje, revisa con una lupa, encuentra un segundo bicho escondido en la
//    esquina y lo aplasta. Entonces cae el sello de laurel VERIFIED sobre la ventana: el golpe grande (hit-stop,
//    negativo, sacudida) una sola vez.
// La ventana verificada sale por la derecha mientras la siguiente entra por la izquierda: en el cuadro 0 la
// ventana nueva ya está en TESTS, así que el bucle no tiene corte. El contador n/4 TESTS conserva el 4/4 de la
// ventana anterior hasta que la nueva empieza a probarse.
// Mismo lenguaje que aether.px.js: los personajes van "en dos"; el vuelo del parche, las chispas y los efectos se
// mueven en cada cuadro; paleta del kit; resplandor con dither Bayer; texto solo con c.text. El fondo está
// quieto (se calcula una vez): el movimiento se gasta en la acción.
include("kit.px.js")

const W = 160, H = 105;
pal({ q: "#4a1d33", $: "#4a3a1c", "%": "#1f2c6b", d: "#8a2740" });   // fondos oscuros: rojo, oro, azul; lacre oscuro
pal({ "(": "#f5e0dc", ")": "#f2cdcd" });                            // plástico beige y pergamino (rosewater y flamingo de Mocha)

// ------------------------------------------------------------------ tiempos y geometría
const N = 360, HIT = 306, HOLD = 4, NEG = 2;           // el golpe del sello, su hit-stop y su negativo
const SX = [26, 80, 134];                              // centro de cada estación
const BY = 80;                                         // la superficie del camino
const FLOOR = 100;                                     // donde pisan los personajes (el plinto empieza aquí)
const TOP = 64;                                        // arriba de la ventana (mide 22 x 16)
const ACC = [{ k: "j", dk: "Q", lt: "T" }, { k: "O", dk: "$", lt: "y" }, { k: "b", dk: "%", lt: "B" }];
const LABELS = ["TESTS", "EVIDENCE", "REVIEW"];
// Tiempos de la estación TESTS (cuadros de la ventana).
const PT1 = [14, 24, 34], FAIL = 52, RERUN = 84, PT2 = [92, 98, 104, 110], PATCH0 = 74, PATCH = 82;

const gw = (ch) => ({ ".": 1, ":": 1, "!": 1, "'": 1 }[ch] ?? 3);
const tw = (s) => [...s].reduce((a, ch) => a + gw(ch) + 1, -1);
const mod = (a, n) => ((a % n) + n) % n;
const seg = (t, a, b) => ease((t - a) / (b - a));
const P = (c, x, y, col) => { if (inside(x, y)) c.px(x, y, col); };
function R(c, x, y, w, h, col) {                       // rect recortado al lienzo
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  if (x1 > x0 && y1 > y0) c.rect(x0, y0, x1 - x0, y1 - y0, col);
}
function grid(c, g, x, y, map = {}) {                  // cuadrícula de caracteres con mapa de colores
  for (let r = 0; r < g.length; r++)
    for (let q = 0; q < g[r].length; q++) {
      const ch = g[r][q];
      if (ch !== ".") P(c, x + q, y + r, map[ch] ?? ch);
    }
}

// La ventana avanza por el camino: tres tramos de avance (150 px en total).
const MOVES = [[118, 148, 54], [215, 245, 54], [330, 360, 42]];
const beltS = (f) => MOVES.reduce((s, [a, b, d]) => s + d * seg(f, a, b), 0);
const blockX = (t) => (t < 0 ? 26 - 42 + 42 * seg(t, -30, 0) : 26 + beltS(t));
const passes = (f) => (f < 4 ? 4 : f < PT1[0] ? 0 : f < PT1[1] ? 1 : f < PT1[2] ? 2 : f < PT2[3] ? 3 : 4);

// ------------------------------------------------------------------ utilidades de dibujo
function ditherDisc(c, cx, cy, r, col, dens, ox = 0) {
  for (let y = Math.ceil(cy - r); y <= cy + r; y++)
    for (let x = Math.ceil(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r || !inside(x, y)) continue;
      if (bay(x + ox, y) < dens * (1 - d / (r + 1))) c.px(x, y, col);
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
    P(c, px, py, col);
    if (t < life * 0.4) P(c, px + 1, py, col);
  }
}
const sparkle = (c, x, y, size, col = "y", arm = "l") => {
  if (size <= 0) return;
  P(c, x, y, col);
  for (let k = 1; k < size; k++) for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) P(c, x + dx, y + dy, arm);
};
// Recorre el lienzo para sacudirlo (todo menos las dos filas de la barra y el subtítulo).
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 22; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 22; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(22, y - dy));
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}

// ------------------------------------------------------------------ piezas dibujadas a mano
// El bicho: 7 x 5. body = su color; dos cuadros de patas.
const BUG = [".u...u.", "..uuu..", "uuyuyuu", "..uuu..", ".u.u.u."];
const BUG_B = [".u...u.", "..uuu..", "uuyuyuu", "..uuu..", "u.u.u.u"];
function bug(c, cx, bottom, body, f, flat = false) {
  const g = two(f) % 2 ? BUG_B : BUG, map = { u: body };
  if (flat) {                                           // aplastado: ancho y bajito
    for (let q = 0; q < 11; q++) P(c, cx - 5 + q, bottom, q % 3 === 1 ? "y" : body);
    for (let q = 1; q < 10; q++) P(c, cx - 5 + q, bottom - 1, body);
    return;
  }
  grid(c, g, cx - 3, bottom - 4, map);
}
// El parche: un disquete de 7 x 7 en vuelo (casquillo violeta, ventana plateada, etiqueta blanca con franja)...
const FLOP7 = ["LLLLLLL", "LggggkL", "LggggkL", "LLLLLLL", "LWWWWWL", "LWlllWL", "LLLLLLL"];
// ...y, ya pegado, una tira de 9 x 3 con el mismo lenguaje.
const PATCH_G = ["lllllllll", "LlWWWWWlL", "lllllllll"];
// La etiqueta del pergamino, ya prendida a la ventana (7 x 10): rollo arriba, hash, palomita y lacre.
const TAG = [")((((()", "(I0I0I(", "(0I00I(", "((((((4", "(((((4(", "(4(4(((", "((4((((", "(((u(((", "((uVuu(", ")qquqq)"];
// El lacre del pergamino (5 x 5).
const WAX = [".uuu.", "uVuuu", "uuuuq", "uuuqq", ".qqq."];
// El sello VERIFIED: 35 x 26. Corona de laurel (hojas en dos verdes) alrededor de un medallón violeta con una
// palomita, y la cinta con el texto debajo.
const BW = 35, BH = 26;
const BADGE = (() => {
  const g = Array.from({ length: BH }, () => Array(BW).fill("."));
  const cx = 17, cy = 9.5, Rl = 8.2;
  const put = (x, y, ch) => { if (y >= 0 && y < 20 && x >= 0 && x < BW) g[y][x] = ch; };
  for (const s of [-1, 1])                                            // el laurel: siete hojas por lado, de abajo hacia arriba
    for (let k = 0; k < 7; k++) {
      const a = (14 + k * 25) * (Math.PI / 180), Rc = 9.2;
      const lx = cx + s * Rc * Math.sin(a), ly = cy + Rc * Math.cos(a);          // el centro de la hoja, sobre el círculo
      const tx = s * Math.cos(a), ty = -Math.sin(a), qx = s * Math.sin(a), qy = Math.cos(a);   // tangente (hacia arriba) y radio
      const dx = tx * Math.cos(0.5) + qx * Math.sin(0.5), dy = ty * Math.cos(0.5) + qy * Math.sin(0.5);   // la punta se abre hacia afuera
      for (let yy = Math.floor(ly - 3); yy <= ly + 3; yy++)
        for (let xx = Math.floor(lx - 3); xx <= lx + 3; xx++) {
          const rx = xx + 0.5 - lx - 0.5, ry = yy + 0.5 - ly - 0.5;
          const u = rx * dx + ry * dy, v = -rx * dy + ry * dx;                   // a lo largo y a lo ancho de la hoja
          if ((u / 2.7) ** 2 + (v / 1.45) ** 2 > 1) continue;
          const outer = (xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 > Rc * Rc;
          put(xx, yy, u > 1.6 ? "T" : outer ? "j" : "4");
        }
    }
  for (let r = 0; r < 20; r++)
    for (let q = 0; q < BW; q++) {
      const d = Math.hypot(q - cx, r - cy);
      if (d <= 7.2) g[r][q] = d >= 6.2 ? "W" : bay(q, r) < 0.35 && q + r < 22 ? "l" : "L";   // el medallón con su canto
    }
  put(cx, 18, "O"); put(cx - 1, 18, "O"); put(cx + 1, 18, "O");     // el moño dorado del laurel
  const CHECK = ["......yy", ".....yy.", "y...yy..", "yy.yy...", ".yyy....", "..y....."];
  for (let r = 0; r < CHECK.length; r++) for (let q = 0; q < CHECK[r].length; q++)
    if (CHECK[r][q] === "y") g[7 + r][13 + q] = "y";
  for (let r = 17; r < 26; r++) for (let q = 0; q < BW; q++)          // la cinta
    g[r][q] = r === 17 || r === 25 || q === 0 || q === BW - 1 ? "O" : "c";
  return g;
})();
// Dibuja el sello con el centro en ax y la base en by. sy/sx lo aplastan al golpear (conservan el área).
function badge(c, ax, by, sy = 1, sx = 1, clipY = 22) {
  const hh = Math.round(BH * sy), ww = Math.round(BW * sx);
  for (let dy = 0; dy < hh; dy++) {
    const r = Math.min(BH - 1, Math.floor((dy * BH) / hh)), y = by - hh + dy;
    if (y < clipY) continue;
    for (let dx = 0; dx < ww; dx++) {
      const ch = BADGE[r][Math.min(BW - 1, Math.floor((dx * BW) / ww))];
      if (ch !== ".") P(c, ax - (ww >> 1) + dx, y, ch);
    }
  }
  const ty = by - hh + Math.round((19 * hh) / BH);
  if (ty >= clipY) c.text(ax - 15, ty, "VERIFIED", "j");
}

// ------------------------------------------------------------------ escenario (se calcula una vez)
// Un templo visto de frente: friso con la greca y los carteles de las estaciones, una arcada de tres arcos sobre
// columnas dóricas, la nebulosa violeta con estrellas detrás, el camino de mármol con su friso de greca y, abajo,
// el estilóbato con un plinto para cada personaje.
const AC = [25.5, 79.5, 133.5];                        // centro de cada arco
const PIERS = [-1.5, 52.5, 106.5, 160.5];              // centro de cada columna de la arcada (8 px de ancho)
const YS = 45, RXI = 23, RYI = 10, RING = 3;           // arranque del arco, semiejes del hueco y grosor del anillo
const BUF = new Array(W * H).fill("z"), OPEN = new Uint8Array(W * H);   // OPEN: píxel de cielo (se ve la nebulosa)
const bp = (x, y, k) => { if (x >= 0 && y >= 0 && x < W && y < H) BUF[y * W + x] = k; };
const bh = (x, y, n, k) => { for (let i = 0; i < n; i++) bp(x + i, y, k); };
const bv = (x, y, n, k) => { for (let i = 0; i < n; i++) bp(x, y + i, k); };
const br = (x, y, w, h, k) => { for (let j = 0; j < h; j++) bh(x, y + j, w, k); };
const GREC = ["LLLLLLL.", "L.....L.", "L.LLL.L.", "L.L.L.L.", "L.L.LLL."];   // la greca (meandro)
const inEll = (x, y, i, k) => {                        // dentro de la elipse del arco i, ensanchada k px
  const u = (x + 0.5 - AC[i]) / (RXI + k), v = (y + 0.5 - YS) / (RYI + k);
  return u * u + v * v <= 1 && y + 0.5 <= YS;
};
const SEGS = 11;
const segOf = (x, y, i) => Math.floor((Math.atan2(YS - (y + 0.5), x + 0.5 - AC[i]) / Math.PI) * SEGS);
const STARS = (() => {
  const r = seeded(2024), out = [];
  for (let k = 0; k < 40; k++) out.push([Math.floor(r() * W), 33 + Math.floor(r() * 46), r() < 0.2 ? 2 : 1]);
  return out;
})();
const TWINKLE = [[9, 52, 60, 3], [71, 41, 90, 20], [118, 63, 72, 41], [150, 46, 120, 7], [30, 70, 45, 11], [92, 70, 180, 60]];   // x, y, periodo, fase
(() => {
  // pared de la arcada: sillares con juntas alternadas, en sombra
  br(0, 32, W, 48, "L");
  for (let y = 32; y < 80; y++) {
    const course = Math.floor((y - 32) / 6);
    if ((y - 32) % 6 === 5) bh(0, y, W, "2");
    else for (let x = 0; x < W; x++) if (mod(x + (course % 2) * 6, 12) === 0) bp(x, y, "2");
    if (y < 38) for (let x = 0; x < W; x++) if (bay(x, y) < 0.55 - (y - 32) * 0.09) bp(x, y, "2");   // la sombra de la cornisa
  }
  // cielo tras cada arco: nebulosa violeta con Bayer
  for (let i = 0; i < 3; i++)
    for (let y = 30; y < BY; y++)
      for (let x = 0; x < W; x++) {
        const dx = Math.abs(x + 0.5 - AC[i]);
        const ok = y + 0.5 <= YS ? inEll(x, y, i, 0) : dx <= RXI;
        if (!ok) continue;
        OPEN[y * W + x] = 1;
        bp(x, y, "z");
        const v = 0.55 * vnoise(x + 13, y + 7, 26) + 0.3 * vnoise(x + 40, y + 90, 12) + 0.15 * vnoise(x, y, 5), b = bay(x, y);
        if (v > 0.42 && b < (v - 0.42) * 5) bp(x, y, "n");
        if (v > 0.52 && b < (v - 0.52) * 4.5) bp(x, y, "N");
        if (v > 0.64 && b < (v - 0.64) * 3.5) bp(x, y, "m");
      }
  const sky = (x, y) => x >= 0 && y >= 0 && x < W && y < H && OPEN[y * W + x];
  for (const [x, y, lv] of STARS) if (sky(x, y) && BUF[y * W + x] !== "m") bp(x, y, lv === 2 ? "3" : "2");
  // una constelación con su línea punteada y un planeta con anillos, en el arco de REVIEW
  const CON = [[116, 54], [121, 48], [127, 51], [128, 43]];
  CON.forEach(([x, y], k) => {
    if (k) { const [x0, y0] = CON[k - 1]; for (let t = 2; t < 7; t += 2) bp(Math.round(x0 + (x - x0) * t / 7), Math.round(y0 + (y - y0) * t / 7), "L"); }
    bp(x, y, "e"); bp(x - 1, y, "L"); bp(x + 1, y, "L");
  });
  const PCX = 141, PCY = 49, PR = 7, PL = ["N", "2", "L", "l", "e"];
  const ring = (front) => {
    for (const [sc, col] of [[1, "V"], [0.8, "v"]])
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * TAU, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        const x = Math.round(PCX + Math.cos(a) * 12 * sc), y = Math.round(PCY + s * 2.6 * sc - Math.cos(a) * 0.1);
        if (sky(x, y)) bp(x, y, col);
      }
  };
  ring(false);
  for (let y = PCY - PR; y <= PCY + PR; y++)
    for (let x = PCX - PR; x <= PCX + PR; x++) {
      const nx = (x - PCX) / PR, ny = (y - PCY) / PR, d = nx * nx + ny * ny;
      if (d > 1 || !sky(x, y)) continue;
      const nz = Math.sqrt(1 - d);
      let Lm = clamp01(Math.max(0, -0.6 * nx - 0.55 * ny + 0.65 * nz) * 1.05) * 4, i = Math.floor(Lm);
      if (bay(x, y) < Lm - i) i++;
      bp(x, y, PL[Math.min(i, 4)]);
    }
  ring(true);

  // anillo de cada arco: dovelas con juntas, clave de mármol claro y el intradós en sombra
  for (let i = 0; i < 3; i++)
    for (let y = 28; y < YS; y++)
      for (let x = 0; x < W; x++) {
        let depth = 0;
        for (let k = 1; k <= RING; k++) if (inEll(x, y, i, k)) { depth = k; break; }
        if (inEll(x, y, i, 0) || !depth) continue;
        const sg = segOf(x, y, i), key = sg === (SEGS - 1) / 2;
        let col = depth === 1 ? "l" : depth === 2 ? "3" : "e";
        if (key) col = depth === 1 ? "e" : "W";
        const nx = x + 1 < W && segOf(x + 1, y, i) !== sg && !inEll(x + 1, y, i, 0) && inEll(x + 1, y, i, RING);
        const ny = y + 1 < YS && segOf(x, y + 1, i) !== sg && !inEll(x, y + 1, i, 0) && inEll(x, y + 1, i, RING);
        if (nx || ny) col = "L";
        bp(x, y, col);
      }
  // columnas dóricas acanaladas: capitel, fuste y basa
  const FL = ["W", "e", "3", "e", "3", "l", "L", "2"];
  for (const p of PIERS) {
    const x0 = Math.round(p - 3.5);
    br(x0 - 1, 41, 10, 2, "e"); bh(x0 - 1, 41, 10, "W"); bh(x0 - 1, 42, 10, "3");      // ábaco
    br(x0, 43, 8, 2, "3"); bh(x0, 43, 8, "e"); bh(x0 + 3, 44, 5, "l");                  // equino
    bh(x0, 45, 8, "L");                                                                  // collarino en sombra
    for (let y = 46; y < 78; y++) for (let q = 0; q < 8; q++) bp(x0 + q, y, FL[q]);
    for (let y = 46; y < 50; y++) for (let q = 0; q < 8; q++) if (bay(x0 + q, y) < 0.55 - (y - 46) * 0.14) bp(x0 + q, y, "L");   // sombra del capitel
    br(x0 - 1, 78, 10, 1, "e"); bh(x0 - 1, 79, 10, "3"); bp(x0 - 1, 78, "W");           // basa
  }
  // friso de la cornisa: greca entre los carteles; luego cornisa
  br(0, 24, W, 7, "1"); bh(0, 24, W, "L"); bh(0, 30, W, "L");
  for (let y = 0; y < 5; y++) for (let x = 0; x < W; x++) if (GREC[y][x % 8] === "L") bp(x, 25 + y, "2");
  bh(0, 22, W, "W"); bh(0, 23, W, "e"); bh(0, 31, W, "e");
  // el camino de mármol: losas con juntas, canto y friso de greca
  br(0, BY, W, 10, "1");
  bh(0, BY, W, "e"); bh(0, BY + 1, W, "e"); bh(0, BY + 2, W, "3");
  for (let x = 0; x < W; x++) if (bay(x, BY + 2) < 0.5) bp(x, BY + 2, "e");
  for (let x = 7; x < W; x += 27) { bp(x, BY + 1, "l"); bp(x, BY + 2, "l"); }                       // las juntas de las losas
  bh(0, BY + 3, W, "L");
  br(0, BY + 4, W, 5, "1");
  for (let y = 0; y < 5; y++) for (let x = 0; x < W; x++) if (GREC[y][x % 8] === "L") bp(x, BY + 4 + y, "l");
  bh(0, BY + 9, W, "2");
  // estilóbato: dos peldaños oscuros y el suelo, con un plinto de mármol bajo cada personaje
  br(0, 90, W, 15, "Z");
  bh(0, 90, W, "2"); bh(0, 91, W, "1");
  for (let x = 0; x < W; x++) if (bay(x, 92) < 0.5) bp(x, 92, "1");
  bh(0, 95, W, "1");
  for (let x = 16; x < W; x += 32) bv(x, 96, 4, "1");
  for (const ax of SX) {
    bh(ax - 11, FLOOR, 22, "W"); bh(ax - 11, FLOOR + 1, 22, "e");
    bh(ax - 9, FLOOR + 2, 18, "L"); br(ax - 9, FLOOR + 3, 18, 1, "3");
    for (let q = -6; q <= 6; q += 4) { bp(ax + q, FLOOR + 3, "l"); bp(ax + q, FLOOR + 2, "2"); }
    bh(ax - 11, FLOOR + 4, 22, "l");
  }
})();
function backdrop(c, f) {
  for (let i = 0; i < W * H; i++) c.px(i % W, (i / W) | 0, BUF[i]);
  for (const [x, y, per, ph] of TWINKLE) if (OPEN[y * W + x] && mod(f + ph, per) < 5) { c.px(x, y, "s"); if (mod(f + ph, per) < 3) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (OPEN[(y + dy) * W + x + dx]) c.px(x + dx, y + dy, "S"); }
  // un haz de luz bajo cada cartel; más claro cuando la ventana está en la estación
  for (let i = 0; i < 3; i++) {
    const a = stationAct(i, f), dens = 0.18 + 0.4 * a;
    for (let y = 40; y < BY; y++) {
      const hw = 11 + ((y - 31) / 48) * 15;
      for (let x = Math.ceil(SX[i] - hw); x <= SX[i] + hw; x++) {
        if (x < 0 || x >= W || !OPEN[y * W + x]) continue;
        const d = Math.abs(x - SX[i]) / hw;
        const k = dens * (1 - d) * (0.3 + 0.7 * ((y - 31) / 48));
        if (bay(x, y) < k) c.px(x, y, k > 0.28 ? "m" : "N");
      }
    }
    // el intradós del arco se enciende con el color de la estación cuando la ventana está en ella
    if (a > 0.35)
      for (let y = 33; y < YS; y++)
        for (let x = 0; x < W; x++)
          if (!inEll(x, y, i, 0) && inEll(x, y, i, 1) && bay(x, y) < a) c.px(x, y, ACC[i].k);
  }
}
// Cuánto está la ventana dentro de la estación i (0..1): la que sale y la que entra.
function stationAct(i, f) {
  const a = (t) => clamp01(1 - Math.abs(blockX(t) - SX[i]) / 10);
  return Math.max(a(f), f >= 330 ? a(f - 360) : 0);
}
// Los carteles de las estaciones, tallados en el friso.
function tablets(c, f) {
  for (let i = 0; i < 3; i++) {
    const a = stationAct(i, f), on = a > 0.5, x0 = SX[i] - 19;
    const arrived = i === 0 ? f < 4 : f >= [0, 148, 245][i] && f < [0, 152, 249][i];
    c.rect(x0, 23, 38, 9, on ? ACC[i].dk : "c");
    c.box(x0, 23, 38, 9, arrived ? "y" : on ? ACC[i].k : "F");
    c.text(SX[i] - Math.floor(tw(LABELS[i]) / 2), 25, LABELS[i], on ? ACC[i].lt : "X");
  }
}

// ------------------------------------------------------------------ estación 1: la lista de pruebas
const TESTNAMES = ["LINT", "UNIT", "API", "EDGE"];
function rowState(i, f) {
  if (f < 4) return "pass";
  if (f >= RERUN) return f >= PT2[i] ? "pass" : "run";
  if (i < 3) return f < 4 + 10 * i ? "blank" : f < PT1[i] ? "run" : "pass";
  return f < 34 ? "blank" : f < FAIL ? "run" : "fail";
}
const RING_PX = [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]];
function checklist(c, f) {
  const x = 11, y = 37, w = 31, h = 26;
  const border = f < 4 || f >= PT2[3] ? (f >= PT2[3] && f < PT2[3] + 4 ? "y" : "j")
    : f >= FAIL && f < RERUN ? (f < FAIL + 6 && two(f) % 2 ? "y" : "u") : "F";
  c.rect(x, y, w, h, f >= FAIL && f < RERUN ? "q" : "c");
  c.box(x, y, w, h, border);
  for (let i = 0; i < 4; i++) {
    const st = rowState(i, f), ry = y + 1 + i * 6, bx = x + 2;
    const t0 = st === "pass" ? (f >= RERUN ? PT2[i] : f < 4 ? -99 : PT1[i]) : st === "fail" ? FAIL : -99;
    const pop = f - t0;                                  // cuadros desde que se resolvió
    let fill = "c", edge = "F", ink = "X";
    if (st === "run") { edge = "O"; ink = "x"; }
    if (st === "pass") { fill = "j"; edge = "j"; ink = "j"; if (pop >= 0 && pop < 3) { fill = "y"; edge = "y"; } }
    if (st === "fail") { fill = "u"; edge = "u"; ink = "u"; }
    c.rect(bx, ry, 5, 5, fill);
    c.box(bx, ry, 5, 5, edge);
    if (st === "run") {
      const k = two(f + i * 3) % 8;
      c.px(bx + RING_PX[k][0], ry + RING_PX[k][1], "O");
      c.px(bx + RING_PX[(k + 7) % 8][0], ry + RING_PX[(k + 7) % 8][1], "$");
    }
    if (st === "pass") for (const [dx, dy] of [[1, 2], [2, 3], [3, 1]]) c.px(bx + dx, ry + dy, pop >= 0 && pop < 3 ? "j" : "y");
    if (st === "fail") for (const [dx, dy] of [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]]) c.px(bx + dx, ry + dy, "y");
    c.text(bx + 8, ry, TESTNAMES[i], ink);
    if (st === "pass" && pop >= 3 && pop < 9 && f < RERUN + 40 && f >= 4) sparkle(c, x + w - 4, ry + 2, [1, 2, 2, 1, 1, 1][pop - 3], "y", "T");
  }
}

// ------------------------------------------------------------------ estación 2: el escáner (un CRT beige) y el pergamino
const CRX = 60, CRY = 40;                               // el CRT: 15 x 12, sobre una repisa de mármol
const PAPX = 79, PAPY = 42, PAPH = 19, PAPW = 22;                  // el pergamino cuelga de una varilla
function crt(c, f) {
  const u = f - 164, x = CRX, y = CRY;
  // la repisa de mármol con su ménsula, que sale de la columna
  c.rect(x - 3, y + 12, 21, 2, "e"); c.hline(x - 3, y + 12, 21, "W"); c.hline(x - 3, y + 14, 21, "L");
  c.rect(x - 3, y + 15, 6, 1, "3"); c.rect(x - 3, y + 16, 4, 1, "l"); c.rect(x - 3, y + 17, 2, 1, "L");
  // la carcasa beige, con luz arriba a la izquierda y sombra abajo a la derecha
  c.rect(x, y, 15, 10, ")");
  c.hline(x, y, 15, "("); c.vline(x, y, 10, "("); c.hline(x + 1, y + 9, 14, "G"); c.vline(x + 14, y + 1, 9, "G");
  c.rect(x + 3, y + 10, 9, 1, ")"); c.rect(x + 2, y + 11, 11, 1, "G");
  // la pantalla, hundida
  c.rect(x + 2, y + 2, 11, 6, "c");
  c.hline(x + 2, y + 1, 11, "G"); c.vline(x + 1, y + 2, 6, "G"); c.hline(x + 2, y + 8, 11, "("); c.vline(x + 13, y + 2, 6, "(");
  const flash = u >= 0 && u < 3, scan = f >= 150 && f < 164;
  if (flash) c.rect(x + 2, y + 2, 11, 6, u === 0 ? "y" : u === 1 ? "W" : "e");
  else {
    for (let r = 0; r < 3; r++) c.hline(x + 3, y + 3 + r * 2, r === 1 ? 6 : 8 - r, f >= 167 && f < 200 ? "j" : "F");
    if (scan) {                                          // una línea de escaneo recorre la pantalla
      const sy = y + 2 + Math.floor(((f - 150) / 14) * 6);
      c.hline(x + 2, sy, 11, two(f) % 2 ? "W" : "3");
    }
  }
  c.px(x + 11, y + 9, scan && two(f) % (f < 158 ? 4 : 2) === 0 ? "u" : "j");   // el LED: rojo mientras carga
}
function scanBeam(c, f) {
  const u = f - 164;
  if (u < 0 || u > 2) return;
  const ax = CRX + 15, ay = CRY + 5, dens = [1, 0.75, 0.4][u];
  for (let y = ay; y < BY; y++) {
    const d = (y - ay) / (BY - ay), xr = ax + 1 + d * 22;
    for (let x = ax - 3 + Math.round(d * 6); x <= xr; x++) {
      if (!inside(x, y)) continue;
      if (u > 0 && (y & 1)) continue;                    // líneas de barrido: se salta una fila de cada dos
      if (bay(x, y) < dens * (0.4 + 0.6 * d)) c.px(x, y, u === 0 ? "y" : "W");
    }
  }
}
function rod(c) {                                        // la varilla de mármol de donde cuelga el pergamino
  c.vline(PAPX + 2, 35, 5, "X"); c.vline(PAPX + 19, 38, 2, "X");
  c.rect(PAPX, 40, PAPW, 2, "e"); c.hline(PAPX, 40, PAPW, "W"); c.hline(PAPX, 41, PAPW, "3");
  c.rect(PAPX - 2, 39, 2, 4, "l"); c.px(PAPX - 2, 39, "e");
  c.rect(PAPX + PAPW, 39, 2, 4, "L"); c.px(PAPX + PAPW, 39, "l");
}
function receipt(c, f) {
  const ph = f < 170 ? 0 : Math.min(PAPH, Math.ceil((f - 170) * 1));
  if (ph <= 0 || f >= 200) return;
  c.clip([PAPX, PAPY, PAPW, ph], () => {
    c.rect(PAPX, PAPY, PAPW, PAPH, "(");
    c.vline(PAPX, PAPY, PAPH, ")"); c.vline(PAPX + PAPW - 1, PAPY, PAPH, ")");
    c.text(PAPX + 2, PAPY + 2, "LOG", "I");
    c.hline(PAPX + 15, PAPY + 4, 5, "0");
    c.text(PAPX + 1, PAPY + 8, "9F3A7", "c");
    if (f >= 192) grid(c, PROPS.check.map((row) => row.slice(0, Math.min(7, (f - 192) * 2 + 1))), PAPX + 13, PAPY + 13, { y: "4" });
    if (f >= 196) {                                      // el lacre cae en tres cuadros
      const keep = (f - 196 + 1) / 3;
      c.clip((x, y) => bay(x, y) < keep, () => grid(c, WAX, PAPX + 3, PAPY + 13));
      if (f < 199) sparkle(c, PAPX + 5, PAPY + 15, 2, "y", "V");
    }
  });
  c.hline(PAPX, PAPY + ph - 1, PAPW, "G"); c.hline(PAPX - 1, PAPY + ph, PAPW + 2, "("); c.hline(PAPX - 1, PAPY + ph + 1, PAPW + 2, ")");
  if (ph < PAPH) c.hline(PAPX, PAPY + ph + 2, PAPW, "G");
}
// La etiqueta en vuelo, del pergamino al borde de la ventana (a partir del cuadro 200).
function tagFlight(c, f) {
  const u = (f - 200) / 12;
  if (u < 0 || u >= 1) return;
  const [x, y] = bez([PAPX + 8, PAPY + 6], [PAPX + 2, 40], [SX[1] + 4, 56], ease(u));
  grid(c, TAG, x, y, {});
  sparkle(c, x + 3, y - 1, [1, 2, 2, 1][Math.min(3, Math.floor(u * 4))], "y", "T");
}

// ------------------------------------------------------------------ la ventana de código (de los 90)
const LINES = [
  [[2, 5, "v"], [8, 9, "a"]],
  [[4, 4, "T"], [9, 6, "7"]],
  [[4, 10, "b"]],                                        // la línea del bicho
  [[2, 3, "V"], [6, 10, "a"]],
];
function lineColor(t) {                                  // la línea 3: azul, roja al fallar, verde al repararse
  if (t < FAIL || t >= 136) return "b";
  if (t < PATCH) return two(t) % 2 ? "u" : "q";
  if (t < PATCH + 8) return "y";
  return "j";
}
function codeBlock(c, bx, t, f) {
  let dx = 0;
  if (t >= FAIL && t < FAIL + 6) dx = [2, -2, 2, -1, 1, 0][t - FAIL];   // tiembla al fallar
  const x0 = bx - 11 + dx;
  const green = t >= PT2[3], flash = t >= PT2[3] && t < PT2[3] + 3;
  c.hline(x0 + 2, BY, 20, "L"); c.hline(x0 + 4, BY + 1, 16, "l");        // sombra sobre el camino
  c.rect(x0, TOP, 22, 16, "c");
  c.rect(x0 + 1, TOP + 1, 20, 3, "2");                    // la barra de título
  c.hline(x0 + 2, TOP + 2, 7, "3");
  for (let k = 0; k < 3; k++) { c.rect(x0 + 13 + k * 3, TOP + 2, 2, 2, "g"); c.px(x0 + 13 + k * 3, TOP + 2, "y"); }
  LINES.forEach((segs, k) => {
    for (const [ind, len, col] of segs) c.hline(x0 + 1 + ind, TOP + 6 + 2 * k, len, k === 2 ? lineColor(t) : col);
  });
  if (green) c.box(x0, TOP, 22, 16, flash ? "y" : "j");
  else {                                                 // borde en relieve: luz arriba y a la izquierda
    c.box(x0, TOP, 22, 16, "F");
    c.hline(x0, TOP, 22, "3"); c.vline(x0, TOP, 16, "3");
  }
  return x0;
}
// Lo que se prende a la ventana: el parche y la etiqueta del pergamino.
function blockDeco(c, bx, t) {
  const x0 = bx - 11;
  if (t >= 212) grid(c, TAG, x0 + 15, TOP - 8);          // la etiqueta del pergamino, en la esquina
  if (t >= 212 && t < 216) sparkle(c, x0 + 22, TOP - 8, [2, 3, 2, 1][t - 212], "y", "T");
  if (t >= PATCH && t < 104) {                           // la tira del parche sobre la línea reparada
    const keep = t < 96 ? 1 : 1 - (t - 96) / 8;
    c.clip((x, y) => bay(x, y) < keep, () => grid(c, PATCH_G, x0 + 6, TOP + 9));
  }
}
// El bicho rojo: salta de la línea y se queda enfadado en el camino, junto a la ventana, hasta que llega el parche.
function bugOne(c, bx, f) {
  if (f < FAIL + 2 || f >= PATCH) return;
  const u = (f - FAIL - 2) / 6, ex = bx + 17, ey = BY - 1;
  if (u < 1) {
    const [x, y] = bez([bx + 4, TOP + 8], [bx + 12, 56], [ex, ey], ease(u));
    bug(c, x, y, "u", f);
    return;
  }
  const w = f - FAIL - 8;
  const hop = [0, 2, 3, 2][mod(Math.floor(w / 3), 8) % 4] * (mod(Math.floor(w / 3), 8) < 4 ? 1 : 0);
  bug(c, ex + (two(f) % 2 ? 1 : 0), ey - hop, "u", f);
}
// El bicho morado: escondido tras la esquina de la ventana, sale cuando llega la lupa.
function bugTwo(c, bx, f, front) {
  const rest = bx + 10;
  if (f >= 296 + 8) return;
  const rev = f >= 282;
  if (!front) {                                          // antes de la ventana: solo asoman unos píxeles
    if (!rev) {
      const col = f >= 262 ? "M" : "n";
      grid(c, BUG, rest - 3, BY - 4, { u: col, y: col });
    }
    return;
  }
  if (!rev) return;
  const ex = bx + 15, u = (f - 282) / 5;
  if (f >= 296) {                                        // aplastado y una mancha que se apaga
    if (f < 296 + 8) {
      const keep = 1 - (f - 296) / 8;
      c.clip((x, y) => bay(x, y) < keep, () => bug(c, ex, BY - 1, "w", f, true));
    }
    return;
  }
  if (u < 1) { const [x, y] = bez([rest, BY - 1], [rest + 3, BY - 9], [ex, BY - 1], ease(u)); bug(c, x, y, "w", f); return; }
  const shiver = f >= 287 && f < 296 ? (two(f) % 2 ? 1 : 0) : 0;
  bug(c, ex + shiver, BY - 1, "w", f);
}
// Un hilo de polvo violeta detrás de la ventana mientras se desliza por el camino.
function trail(c, f) {
  for (const t of [f, ...(f >= 330 ? [f - 360] : [])]) {
    const v = blockX(t + 1) - blockX(t);
    if (v < 0.4) continue;
    const bx = Math.round(blockX(t));
    for (let k = 1; k <= 3; k++) {
      const x = bx - 12 - k * 2 - (mod(t + k, 3)), y = BY - 1 - ((k + t) % 2);
      P(c, x, y, k === 1 ? "e" : k === 2 ? "a" : "L");
    }
  }
}

// ------------------------------------------------------------------ personajes
const WORKER_K = ["t", "T"], REV_K = ["b", "B"], CLAWD_K = ["o", "o"];
const blink = (f, ph) => (mod(f + ph, 80) < 3 ? "blink" : "sq");
function workerState(f) {
  const s = { pose: "idle", eyes: blink(f, 20), dy: 0, mark: null, sweat: false };
  if (f >= FAIL && f < FAIL + 8) { s.pose = "surprise"; s.mark = "!"; s.sweat = true; }
  else if (f >= FAIL + 8 && f < 68) { s.sweat = true; s.eyes = "sq"; }
  else if (f >= 68 && f < PATCH0) { s.pose = "squash"; }
  else if (f >= PATCH0 && f < PATCH0 + 8) { s.pose = "armsup"; s.dy = -[2, 4, 5, 4, 3, 2, 1, 0][f - PATCH0]; s.eyes = "sq"; }
  else if (f >= PATCH0 + 8 && f < PATCH + 2) { s.pose = "squash"; }
  else if (f >= PATCH + 2 && f < 100) { s.sweat = f < 94; if (f >= 90) s.eyes = "happy"; }
  else if (f >= PT2[3] && f < PT2[3] + 14) { s.pose = "armsup"; s.eyes = "happy"; s.dy = f - PT2[3] >= 2 && f - PT2[3] < 8 ? -[1, 2, 3, 3, 2, 1][f - PT2[3] - 2] : 0; }
  else if (f >= PT2[3] + 14 && f < 140) s.eyes = "happy";
  else if (f >= HIT + 4 && f < HIT + 22) { s.eyes = "happy"; s.dy = f - HIT - 4 < 10 ? -[1, 2, 2, 1, 1, 0, 0, 0, 0, 0][f - HIT - 4] : 0; }
  return s;
}
function clawdState(f) {
  const s = { pose: "idle", eyes: blink(f, 50), dy: 0 };
  if (f >= 150 && f < 158) s.eyes = "sq";
  if (f >= 158 && f < 164) { s.pose = "squash"; }
  else if (f >= 164 && f < 168) { s.pose = "surprise"; s.eyes = "blink"; }
  else if (f >= 192 && f < 214) { s.pose = "armsup"; s.eyes = "happy"; const q = f - 196; if (q >= 0 && q < 10) s.dy = -[1, 2, 2, 1, 1, 0, 0, 0, 0, 0][q]; }
  else if (f >= 214 && f < 226) s.eyes = "happy";
  else if (f >= HIT + 4 && f < HIT + 24) { s.pose = "armsup"; s.eyes = "happy"; const q = f - HIT - 6; if (q >= 0 && q < 8) s.dy = -[1, 2, 2, 1, 1, 0, 0, 0][q]; }
  return s;
}
function reviewerState(f) {
  const s = { pose: "idle", eyes: blink(f, 8), dy: 0, mark: null };
  if (f >= 252 && f < 296) s.pose = "armsup";
  if (f >= 296 && f < 300) { s.pose = "squash"; s.eyes = "sq"; }
  else if (f >= 300 && f < 310) s.pose = "armsup";
  else if (f >= 310 && f < 332) { s.eyes = "happy"; const q = f - 312; if (q >= 0 && q < 14) s.dy = -[1, 2, 3, 3, 2, 1, 0, 1, 2, 2, 1, 0, 0, 0][q]; if (q >= 0 && q < 14 && q < 7) s.pose = "armsup"; }
  if (f >= 280 && f < 286) s.mark = "?";
  else if (f >= 286 && f < 296) s.mark = "!";
  return s;
}
function actor(c, st, ax, k, eyeKey) {
  const [x, y] = place(st.pose, false, ax, FLOOR + st.dy, 1);
  drawPose(c, st.pose, x, y, 1, (px, py, r) => (r < 2 ? k[1] : k[0]));
  drawEyes(c, eyesOf(st.pose, x, y, 1, false), 1, st.eyes, eyeKey);
  return [x, y];
}

// Marcas junto a la cabeza: "!" o "?" en un globo y una gota de sudor. side = 1 a la derecha, -1 a la izquierda.
function marks(c, ax, topY, st, f, side = 1) {
  if (st.mark) {
    const col = st.mark === "!" ? "u" : "O", bx = side > 0 ? ax + 13 : ax - 19, by = topY - 17 + (two(f) % 2 ? 0 : 1);
    c.rect(bx, by, 9, 14, "c");
    c.box(bx, by, 9, 14, col);
    c.text(bx + (st.mark === "!" ? 4 : 3), by + 2, st.mark, col, { scale: 2 });
    P(c, side > 0 ? bx + 1 : bx + 7, by + 14, col);        // la colita del globo
  }
  if (st.sweat) grid(c, PROPS.sweat, ax + 10, topY - 4 + (Math.floor(f / 4) % 2), {});
}

// La lupa del revisor: una cuerda de puntos clave (cuadro, x, y, modo).
const LENS = [
  [248, 151, 90, "e"], [258, 141, 71, "e"], [262, 127, 71, "e"], [270, 136, 71, "e"], [272, 136, 75, "e"],
  [280, 127, 75, "e"], [286, 148, 77, "e"], [292, 148, 77, "l"], [294, 148, 67, "l"], [296, 148, 77, "l"],
  [302, 148, 76, "e"], [306, 153, 85, "e"], [316, 151, 90, "e"],
];
function lensAt(f) {
  if (f <= LENS[0][0]) return [LENS[0][1], LENS[0][2]];
  for (let i = 1; i < LENS.length; i++) {
    const [f1, x1, y1, m] = LENS[i], [f0, x0, y0] = LENS[i - 1];
    if (f <= f1) {
      const u = (f - f0) / (f1 - f0), v = m === "e" ? ease(u) : u;
      return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v];
    }
  }
  return [LENS[LENS.length - 1][1], LENS[LENS.length - 1][2]];
}
function lens(c, f, hand) {
  const [lx0, ly0] = lensAt(f), lx = Math.round(lx0), ly = Math.round(ly0);
  const held = f >= 252 && f < 312;
  const hx = held ? hand[0] : lx - 2, hy = held ? hand[1] : FLOOR - 1;
  c.line(lx + 4, ly + 4, hx, hy, "D", 1);
  c.line(lx + 5, ly + 4, hx + 1, hy, "U", 1);
  // el cristal agranda lo que hay debajo: cada píxel se ve doble
  const cells = [];
  for (let dy = -5; dy <= 5; dy++)
    for (let dx = -5; dx <= 5; dx++) {
      if (dx * dx + dy * dy > 29) continue;
      const sx = lx + Math.trunc(dx / 2), sy = ly + Math.trunc(dy / 2);
      if (inside(sx, sy)) cells.push([lx + dx, ly + dy, c.get(sx, sy)]);
    }
  for (const [x, y, v] of cells) P(c, x, y, "#" + (v >>> 0).toString(16).padStart(8, "0"));
  c.ring(lx, ly, 6, "B");
  c.ring(lx, ly, 7, "I");
  P(c, lx - 4, ly - 3, "y"); P(c, lx - 3, ly - 4, "y"); P(c, lx - 4, ly - 4, "y");
}

// ------------------------------------------------------------------ efectos
function patchFlight(c, f) {
  const u = (f - PATCH0) / (PATCH - PATCH0);
  if (u < 0 || u >= 1) return;
  const [x, y] = bez([37, 85], [46, 58], [SX[0] - 3, TOP + 7], Math.min(1, u * 1.05) ** 0.9);
  grid(c, FLOP7, x, y);
}
function patchBurst(c, f) {
  const t = f - PATCH;
  if (t < 0) return;
  const bx = SX[0];
  spark(c, bx + 17, BY - 4, t, 8, 0.9, 16, ["u", "O", "y"], 21);        // el bicho estalla
  spark(c, bx, TOP + 8, t, 6, 0.7, 14, ["j", "T", "y"], 22);            // y la línea se repara
  if (t < 6) c.ring(bx, TOP + 8, 3 + t * 2, t < 2 ? "y" : "j");
}
function squashBurst(c, f) {
  const t = f - 296;
  if (t < 0 || t > 20) return;
  spark(c, 149, BY - 2, t, 8, 0.9, 18, ["w", "V", "y"], 31);
  if (t < 8) c.ellipse(149, BY - 1, 4 + t * 2, 2, t < 3 ? "y" : "l", true);
}
function evidencePoof(c, f) {
  const t = f - 200;
  if (t >= 0 && t < 14) spark(c, PAPX + 10, PAPY + 12, t, 6, 0.6, 12, ["(", "y", "V"], 41);
}
// El sello cae con retícula; luego el golpe.
const SQ = [[0.72, 1.22], [0.72, 1.22], [0.8, 1.14], [0.9, 1.08], [1.1, 0.95], [1.05, 0.98], [1.0, 1.0]];
function badgeDraw(c, bx, t) {
  if (t < 298) return;
  const drop = t < HIT ? -Math.round(60 * (1 - ((t - 298) / 8) ** 2)) : 0;
  const [sy, sx] = t < HIT ? [1, 1] : SQ[Math.min(SQ.length - 1, t - HIT)];
  if (t >= 292 && t < HIT) {                             // las cuatro esquinas de la mira sobre la ventana
    const gap = 10 - Math.round(((t - 292) / 14) * 4), col = two(t) % 2 ? "y" : "O";
    for (const [sx2, sy2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = bx + sx2 * (gap + 2), cy = TOP + 8 + sy2 * (gap - 1);
      c.hline(sx2 < 0 ? cx : cx - 2, cy, 3, col); c.vline(cx, sy2 < 0 ? cy : cy - 2, 3, col);
    }
  }
  badge(c, bx, BY - 1 + drop, sy, sx);
  if (t >= HIT + 4 && t < HIT + 8) {                     // brillo que recorre el camino
    const u = (t - HIT - 4) / 4;
    c.hline(bx - 15, BY - 1 - Math.round(u * 24), 31, "y");
  }
}
function glowBehind(c, f, bx) {                          // destello redondo detrás del sello
  const t = f - HIT - 4;
  if (t >= 0 && t < 9) ditherDisc(c, bx, 64, 14 + t * 2.2, t < 3 ? "y" : "T", 0.55 * (1 - t / 9), t);
}
function shockwave(c, f, bx) {
  const t = f - HIT - 4;
  if (t < 0 || t > 20) return;
  const rx = Math.round(14 + t * 2.4);
  c.ellipse(bx, BY + 1, rx, Math.max(2, Math.round(rx / 7)), t < 5 ? "y" : t < 12 ? "T" : "j", true);
}
const CONF = (() => {
  const r = seeded(777), out = [];
  for (let k = 0; k < 20; k++) out.push({ vx: (r() - 0.5) * 3.4, vy: -(1.6 + r() * 1.7), col: ["t", "b", "h", "y", "O", "j"][k % 6], d: Math.floor(r() * 5) });
  return out;
})();
function confetti(c, f) {
  for (const p of CONF) {
    const t = f - HIT - 4 - p.d;
    if (t < 0 || t > 34) continue;
    const x = Math.round(134 + p.vx * t * 0.9 + Math.sin((t + p.d) / 4)), y = Math.round(62 + p.vy * t + 0.085 * t * t);
    if (y < 33 || y >= FLOOR) continue;
    if (two(t + p.d) % 2) { P(c, x, y, p.col); P(c, x + 1, y, p.col); } else { P(c, x, y, p.col); P(c, x, y + 1, p.col); }
  }
}
function celebrate(c, f) {
  if (f < HIT + 4 || f >= HIT + 40) return;
  const t = f - HIT - 4;
  sparkle(c, 117, 58, [1, 2, 3, 2, 1][two(t) % 5] * (t < 30 ? 1 : 0), "y", "l");
  sparkle(c, 152, 56, [2, 3, 2, 1, 2][two(t + 3) % 5] * (t < 30 ? 1 : 0), "y", "T");
  sparkle(c, 134, 46, [3, 2, 1, 2, 3][two(t + 1) % 5] * (t < 30 ? 1 : 0), "y", "v");
}

// ------------------------------------------------------------------ barra y subtítulo
function hud(c, f) {
  const flash = f >= HIT && f < HIT + 4;
  const n = passes(f), failing = f >= FAIL && f < RERUN;
  c.rect(4, 3, 152, 11, flash ? "l" : "c");
  c.box(4, 3, 152, 11, "F");
  c.text(7, 6, "> ROBUST", f >= HIT && f < 340 ? "w" : "x");
  const right = `${n}/4 TESTS`;
  const col = failing ? (two(f) % 4 < 2 ? "u" : "X") : f >= PT2[3] && f < PT2[3] + 4 ? "y" : n === 4 ? "j" : "X";
  c.text(153 - tw(right), 6, right, col);
}
const CAPS = [
  [0, 6, "NEXT BLOCK", "X"], [6, FAIL, "RUNNING TESTS", "x"], [FAIL, 64, "TEST FAILED", "u"], [64, RERUN, "PATCHING THE BUG", "O"],
  [RERUN, PT2[3], "RUNNING TESTS AGAIN", "x"], [PT2[3], 150, "ALL TESTS PASS", "j"], [150, 170, "CAPTURING PROOF", "x"],
  [170, 200, "LOGGING EVIDENCE", "x"], [200, 245, "PROOF ATTACHED", "O"], [245, 282, "INDEPENDENT REVIEW", "B"],
  [282, 296, "SECOND BUG FOUND", "O"], [296, HIT, "SQUASHED", "V"], [HIT, 340, "VERIFIED", "j"], [340, 360, "NEXT BLOCK", "X"],
];
function caption(c, f) {
  const [, , text, col] = CAPS.find(([a, b]) => f >= a && f < b);
  const acc = [ACC[0].k, ACC[1].k, ACC[2].k];
  const si = f < 150 ? 0 : f < 245 ? 1 : 2;
  c.rect(7, 16, 3, 5, f < 6 || f >= 340 ? "9" : acc[si]);
  c.text(12, 16, text, col);
  // tres casillas: una por estación, llenas cuando la ventana la pasó
  const done = [f < 4 || f >= PT2[3], f < 4 || f >= 212, f < 4 || f >= HIT];
  const now = [f >= 4 && f < PT2[3], f >= 148 && f < 212, f >= 245 && f < HIT];
  for (let i = 0; i < 3; i++) {
    const x = 118 + i * 13;
    c.rect(x, 16, 11, 5, done[i] ? ACC[i].k : "c");
    c.box(x, 16, 11, 5, done[i] ? ACC[i].k : now[i] && two(f) % 8 < 5 ? ACC[i].k : "F");
    if (done[i]) c.hline(x + 1, 17, 9, ACC[i].lt);
  }
}

// ------------------------------------------------------------------ la animación
const NEG_MAP = { z: "W", c: "S", 1: "2", Z: "l", F: "L", r: "A", Q: "l", $: "l", "%": "l", q: "l", 0: "L", J: "a", 2: "A", L: "2", l: "1", e: "Z", 3: "1", n: "e", N: "3", m: "l" };
anim("goal_robust", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HIT && f < HIT + HOLD) f = HIT;                // hit-stop: el mundo se congela tras el golpe

  backdrop(c, f);
  tablets(c, f);
  checklist(c, f);
  crt(c, f);
  rod(c);
  receipt(c, f);
  trail(c, f);

  // ventanas: la actual y, al final del ciclo, la que entra
  const blocks = [f, ...(f >= 330 ? [f - 360] : [])];
  for (const t of blocks) bugTwo(c, blockX(t), t, false);
  for (const t of blocks) {
    const bx = Math.round(blockX(t));
    codeBlock(c, bx, t, f);
    blockDeco(c, bx, t);
  }
  bugTwo(c, 134, f, true);
  bugOne(c, SX[0], f);
  tagFlight(c, f);
  evidencePoof(c, f);
  patchFlight(c, f);
  patchBurst(c, f);
  scanBeam(c, f);
  if (f >= 164 && f < 167) {                              // el destello blanquea la ventana
    const dens = [0.9, 0.55, 0.25][f - 164];
    for (let y = TOP; y < TOP + 16; y++) for (let x = SX[1] - 11; x < SX[1] + 11; x++) if (bay(x, y) < dens) c.px(x, y, "W");
  }
  squashBurst(c, f);
  glowBehind(c, f, 134);
  badgeDraw(c, Math.round(blockX(f)), f);
  shockwave(c, f, 134);

  // personajes, sobre sus plintos
  const ws = workerState(f), cs = clawdState(f), rs = reviewerState(f);
  const [wx, wy] = actor(c, ws, SX[0], WORKER_K, "c");
  marks(c, SX[0], wy, ws, f);
  const [kx, ky] = actor(c, cs, SX[1], CLAWD_K, "k");
  const [rx, ry] = actor(c, rs, SX[2], REV_K, "c");
  lens(c, f, [rx + 22, ry + 1]);
  marks(c, SX[2], ry, { mark: rs.mark }, f, -1);
  confetti(c, f);
  celebrate(c, f);

  // sacudida tras el golpe, solo una vez
  const sk = real - (HIT + HOLD);
  if (sk >= 0 && sk < 10) shake(c, [3, -3, 2, -2, 2, -1, 1, -1, 0, 0][sk], [-1, 1, -1, 1, 0, 0, 0, 0, 0, 0][sk]);

  hud(c, f);
  caption(c, f);
  if (real >= HIT && real < HIT + NEG) c.recolor(NEG_MAP);   // cuadro de impacto en negativo
})

sheet("goal_robust_sheet", ["goal_robust"], { pad: 0 })
