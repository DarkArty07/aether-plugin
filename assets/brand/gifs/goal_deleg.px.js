// goal_deleg.px.js: meta D, «Delegación». 160 x 105 px de arte, 360 cuadros a 30 fps (12 s), bucle sin corte.
// El trabajo va a otros harness de código (AGY, CODEX, GROK, CURSOR, MUSE) mientras dure su cuota. Clawd, el Lead,
// lanza disquetes por unos cables finos que se abren en cinco ramas; cada estación recibe el suyo, escribe o gira,
// gasta una muesca de su batería y devuelve un disquete con una palomita que Clawd atrapa y apila.
// El cangrejo nativo de Claude duerme en un diván de mármol: mientras haya cuota nadie tiene que despertarlo.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): cinco computadoras beige de los 90 (CRT) sobre
// pedestales de mármol con el nombre tallado en la base; las tarjetas y los resultados son disquetes de 3,5 pulgadas;
// los cables son hilos finos y líneas de constelación; el diván de mármol está bajo una nebulosa; Clawd está de pie
// sobre un estilóbato con greca; el informe es un papiro enrollado; un diálogo de los 90 espera. Sin tuberías ni estantes.
// Leyenda de la historia (cuadros, se calculan en SIM):
//    12 a 64    primera tanda: cinco tarjetas, una por una, la más lejana primero
//    ~100 a 165 los resultados vuelven de uno en uno, Clawd los atrapa y los apila en la columna izquierda
//    ~168 a 180 segunda tanda: una ráfaga de cinco tarjetas
//    A2 (~245)  los cinco resultados llegan en el mismo cuadro: hit-stop, negativo, sacudida y Clawd salta
//    luego      los diez resultados se archivan en un solo papiro, las baterías vuelven a llenarse y el ciclo reinicia
include("kit.px.js")

const W = 160, H = 105, N = 360;
pal({ $: "#8a6a1c", "!": "#ffe29a", "(": "#f2cdcd", "%": "#f5e0dc", "<": "#9399b2" });   // oro para CURSOR; beige de los 90 (flamenco, rosa té, gris)

// ------------------------------------------------------------------ plano
// Cinco computadoras arriba (28 px de ancho). Un cable vertical sale de las manos de Clawd (x = TX) y se abre en ramas
// horizontales a niveles distintos, para que ninguna se cruce con otra.
const ST = [
  { name: "AGY",    k: "t", kl: "T", kd: "4" },
  { name: "CODEX",  k: "h", kl: "H", kd: "6" },
  { name: "GROK",   k: "b", kl: "B", kd: "5" },
  { name: "CURSOR", k: "O", kl: "!", kd: "$" },
  { name: "MUSE",   k: "w", kl: "l", kd: "A" },
];
ST.forEach((s, i) => { s.x0 = 3 + 32 * i; s.cx = s.x0 + 14; });
const SY0 = 14;                                        // la CRT ocupa y 14 a 31; el pedestal, y 32 a 42
const PORT_Y = 43;                                     // desde aquí el cable se ve (bajo el pedestal)
const TX = 49, HY = 59;                                // cable y manos de Clawd (donde nace el camino)
const LEVEL = [46, 0, 46, 49, 52];                     // nivel de cada rama
const FEET = 99;                                       // los pies de Clawd: sobre el estilóbato

function mkPath(i) {
  const cx = ST[i].cx, pts = [];
  const add = (x, y) => { const l = pts[pts.length - 1]; if (!l || l[0] !== x || l[1] !== y) pts.push([x, y]); };
  const seg = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) add(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n));
  };
  if (i === 1) { seg(TX, HY, TX, 29); return pts; }
  const yb = LEVEL[i], d = cx > TX ? 1 : -1;
  seg(TX, HY, TX, yb + 2); seg(TX, yb + 2, TX + d * 2, yb); seg(TX + d * 2, yb, cx - d * 2, yb);
  seg(cx - d * 2, yb, cx, yb - 2); seg(cx, yb - 2, cx, 29);
  return pts;
}
const PATHS = ST.map((s, i) => mkPath(i));
const SPEED = 5.2;
const DUR = PATHS.map((p) => Math.round((p.length - 1) / SPEED));          // cuadros que tarda un viaje de ida (o de vuelta)
const idxOut = (i, x) => Math.round((PATHS[i].length - 1) * (1 - (1 - clamp01(x)) ** 1.5));   // sale rápido, entra despacio
const idxBack = (i, x) => Math.round((PATHS[i].length - 1) * (1 - clamp01(x) ** 1.4));         // sale despacio, llega con prisa
const pathAt = (i, idx) => PATHS[i][Math.max(0, Math.min(PATHS[i].length - 1, idx))];

// ------------------------------------------------------------------ guion (se calcula una vez)
// Por trabajo: L = suelta Clawd, a = llega a la estación, d = el resultado sale, A = llega a las manos de Clawd.
const JOBS = ST.map(() => []);
const TIERS = ["t", "b", "h"];
const T1 = [0, 1, 2, 3, 4].map((s) => TIERS[s % 3]), T2 = [0, 1, 2, 3, 4].map((s) => TIERS[(s + 1) % 3]);   // la cola de tareas, de abajo arriba
const ORDER = [0, 1, 2, 3, 4].sort((p, q) => DUR[q] - DUR[p] || p - q);     // la rama más larga sale primero
const MINWORK = 22, RECV = 4, DONEHOLD = 8;
let prevA = 0;
ORDER.forEach((i, k) => {
  const L = 12 + 12 * k, a = L + DUR[i];
  const A = Math.max(100 + 12 * k, prevA + 12, a + RECV + MINWORK + DONEHOLD + DUR[i]);
  prevA = A;
  JOBS[i].push({ round: 1, i, k, L, a, A, d: A - DUR[i], slot: 4 - k, tier: T1[4 - k] });
});
const LAST1 = prevA;
const V0 = LAST1 + 18;                                   // la ráfaga: una tarjeta cada 3 cuadros
let A2 = 0;
ORDER.forEach((i, k) => {
  const L = V0 + 3 * k, a = L + DUR[i];
  A2 = Math.max(A2, a + RECV + MINWORK + DONEHOLD + DUR[i]);
  JOBS[i].push({ round: 2, i, k, L, a, A: 0, d: 0, slot: 4 - k, tier: T2[4 - k] });
});
JOBS.forEach((js, i) => { const j = js[1]; j.A = A2; j.d = A2 - DUR[i]; });
const ALL = JOBS.flat();
const HIT = A2, HOLD = 4, NEG = 2;                       // el golpe: los cinco resultados llegan juntos
const HOLD1 = 8, HOLD2 = 4;                              // cuántos cuadros se sostiene la tarjeta antes de lanzarla

// Aterrizajes en las columnas de la izquierda: ronda 1 columna A (una por una), ronda 2 columna B (todas juntas).
const FLY1 = 11;
const LAND = [];
JOBS.forEach((js, i) => js.forEach((j) => {
  if (j.round === 1) LAND.push({ i, col: 0, slot: j.k, t: j.A + 3 + FLY1, from: j.A + 3 });
  else LAND.push({ i, col: 1, slot: i, t: HIT + 12 + i * 2, from: HIT + 1 });
}));
LAND.sort((p, q) => p.t - q.t);

// Archivo final: cada disquete vuela al papiro y deja una línea.
const FILE0 = HIT + 28;                                  // arranca el archivado
const FILEORD = [[1, 4], [0, 4], [1, 3], [0, 3], [1, 2], [0, 2], [1, 1], [0, 1], [1, 0], [0, 0]];   // [columna, hueco]
const FILEFLY = 9;
const fileT = (col, slot) => FILE0 + 3 * FILEORD.findIndex(([c0, s0]) => c0 === col && s0 === slot);
const FILE_END = FILE0 + 3 * 9 + FILEFLY;
const REF0 = FILE_END + 4;                               // las baterías se renuevan, de izquierda a derecha
const refT = (i) => REF0 + 5 * i;

// ------------------------------------------------------------------ utilidades propias
const dith = (x, y, a) => bay(x, y) < a;
function paintFn(c, grid, x, y, fn) {
  for (let r = 0; r < grid.length; r++)
    for (let q = 0; q < grid[r].length; q++) {
      const ch = grid[r][q];
      if (ch === "." || !inside(x + q, y + r)) continue;
      const k = fn(ch, x + q, y + r);
      if (k) c.px(x + q, y + r, k);
    }
}
function sparkle(c, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  if (inside(x, y)) c.px(x, y, col);
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, arm);
}
const SPK = [1, 2, 3, 2, 1];                             // tamaño de la chispa a lo largo de 5 cuadros
// Contorno de 1 px alrededor de una máscara (el halo de Clawd en el golpe).
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
// Sacude el lienzo (todo menos la barra de arriba).
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 13; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 13; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(13, y - dy));
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}

// ------------------------------------------------------------------ fondo: nebulosa, columnas, estilóbato
// La nebulosa se calcula una vez (Bayer sobre ruido): quieta, como el resto del fondo.
const NEB = (() => {
  const a = new Array(W * H).fill(null);
  for (let y = 11; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = 0.6 * vnoise(x, y, 26) + 0.4 * vnoise(x + 71, y + 13, 10);
      const t = clamp01((v - 0.52) / 0.28);
      if (t <= 0) continue;
      let k = null;
      if (dith(x, y, t * 0.6)) k = "n";
      if (t > 0.8 && dith(x, y, (t - 0.8) * 2)) k = "N";
      a[y * W + x] = k;
    }
  return a;
})();
const STARS = (() => { const r = seeded(21), out = []; for (let i = 0; i < 22; i++) out.push([3 + Math.floor(r() * 154), 42 + Math.floor(r() * 54), Math.floor(r() * 48)]); return out; })();
const COLS_BG = [94, 112];                               // dos columnas tenues al fondo, tras los cables
// Greca del estilóbato: tres filas de meandro (a = línea, . = mármol).
const GREC = ["aaaaaaa.", "a.....a.", "a.aaa.a."];
function backdrop(c, f) {
  c.rect(0, 0, W, H, "z");
  for (let i = 0; i < W * H; i++) if (NEB[i]) c.px(i % W, (i / W) | 0, NEB[i]);
  for (const [x, y] of STARS) c.px(x, y, "S");           // estrellas fijas: el fondo no se mueve
  for (const x of COLS_BG) {                             // columna: fuste con luz a la izquierda y sombra a la derecha
    c.rect(x, 56, 5, 40, "N");
    c.vline(x + 1, 56, 40, "m"); c.vline(x + 3, 56, 40, "1");
    c.rect(x - 1, 53, 7, 3, "m"); c.hline(x - 1, 53, 7, "M");
    c.rect(x - 1, 96, 7, 2, "m");
  }
  // estilóbato de mármol: escalón, greca y base; Clawd se apoya en su canto (y 99)
  c.rect(0, 99, W, 6, "e");
  c.hline(0, 99, W, "W");
  c.hline(0, 104, W, "2");
  for (let x0 = 0; x0 < W; x0 += 8)
    for (let r = 0; r < 3; r++)
      for (let q = 0; q < 8; q++) if (GREC[r][q] === "a" && x0 + q < W) c.px(x0 + q, 101 + r, "L");
}

// ------------------------------------------------------------------ cables y constelación
function cables(c, f) {
  // hilo fino de un píxel bajo cada pedestal; las ramas son líneas de constelación
  ST.forEach((S, i) => PATHS[i].forEach(([x, y]) => { if (y >= PORT_Y && y < 99) c.px(x, y, "M"); }));
  // los nodos del tronco son estrellas
  for (const y of [46, 49, 52]) {
    c.px(TX, y, "W"); c.px(TX - 1, y, "l"); c.px(TX + 1, y, "l");
  }
  // la estela de cada viaje: el hilo se enciende detrás de lo que viaja
  for (const j of ALL) {
    const i = j.i, S = ST[i];
    let head = -1, dir = 1;
    if (f >= j.L && f < j.a) head = idxOut(i, (f - j.L) / DUR[i]);
    else if (f >= j.d && f < j.A) { head = idxBack(i, (f - j.d) / DUR[i]); dir = -1; }
    if (head < 0) continue;
    for (let q = 1; q <= 9; q++) {
      const [x, y] = pathAt(i, head - dir * q);
      if (y < PORT_Y || y >= 99) continue;
      c.px(x, y, q < 3 ? S.kl : q < 6 ? S.k : S.kd);
    }
  }
}

// ------------------------------------------------------------------ disquetes
// Disquete de 3,5 pulgadas: '@' es el cuerpo (lavanda en las tarjetas, del color de la estación en los resultados),
// 'g' el obturador de metal, 'W' la etiqueta, 'S' la franja del nivel de la tarea, 'K' el contorno.
const FLOP = [
  "KKKKKKKKKKK",
  "K@ggggggg@K",
  "K@gggKKKg@K",
  "K@gggKKKg@K",
  "KWWWWWWWWWK",
  "KWWWWWWWWWK",
  "KWWWWWWWWWK",
  "KWWWWWWWWWK",
  "KWWWWWWWWWK",
  "KSSSSSSSSSK",
  "KKKKKKKKKKK",
];
const FLOP_SQ = FLOP.filter((_, r) => r !== 2 && r !== 3);   // la tarjeta aplastada al salir de la mano
PROPS.card = FLOP;
PROPS.card_squash = FLOP_SQ;
function drawCard(c, x, y, tier, kind = "card", prog = 1) {
  const g = PROPS[kind], w = g[0].length, h = g.length;
  paintFn(c, g, Math.round(x - w / 2), Math.round(y - h / 2), (ch, px, py) => {
    if (!(prog >= 1 || dith(px, py, prog))) return null;
    return ch === "S" ? tier : ch === "@" ? "f" : ch;
  });
}
// Disquete de resultado: cuerpo oscuro de la estación, franja del mismo color y una palomita oscura en la etiqueta.
function drawPkt(c, x, y, S) {
  const x0 = Math.round(x) - 5, y0 = Math.round(y) - 5;
  paintFn(c, FLOP, x0, y0, (ch) => (ch === "@" ? S.kd : ch === "S" ? S.k : ch));
  paintGrid(c, PROPS.check, x0 + 2, y0 + 4, { y: "K" });
}
// El disquete apilado: 11 x 4, con su franja de color y el obturador visto de canto.
function drawSlip(c, x, y, S, flash) {
  c.rect(x, y, 11, 4, S.kd);
  c.hline(x, y, 11, flash ? "y" : S.k);
  c.rect(x + 1, y + 1, 4, 1, "g");
  c.hline(x, y + 3, 11, "K");
  c.px(x + 8, y + 2, "W");
}
const slotTop = (slot) => 95 - 4 * slot;
const COLX = [3, 14];

// Tarjeta o resultado en vuelo por los cables (se dibujan antes que las estaciones: entran por debajo y salen por detrás).
function flights(c, f, cs) {
  const held = HY + cs.dy + (cs.pose === "squash" ? 10 : 0);
  for (const i of [0, 1, 2, 3, 4]) for (const j of JOBS[i]) {
    const S = ST[i], tier = j.tier;
    // 1) la tarjeta sale de la cola, vuela hasta las manos de Clawd y espera un instante a que la suelte
    const hold = j.round === 1 ? HOLD1 : HOLD2, fd = hold === HOLD1 ? 6 : hold;
    if (f >= j.L - hold && f < j.L) {
      const u = (f - (j.L - hold) + 1) / fd;
      if (u >= 1) drawCard(c, TX, held, tier, "card");
      else {
        const p0 = [QX + 6, qTop(j.slot) + 1], p2 = [TX, held];
        const [x, y] = bez(p0, [(p0[0] + p2[0]) / 2 + 6, Math.min(p0[1], p2[1]) - 12], p2, ease(u));
        drawCard(c, x, y, tier, u < 0.25 ? "card_squash" : "card");
      }
    }
    // 2) de ida por el cable: la tarjeta aplastada del primer cuadro, y luego la estación la tapa
    if (f >= j.L && f < j.a) {
      const [x, y] = pathAt(i, idxOut(i, (f - j.L) / DUR[i]));
      const t = f - j.L, edge = t === 0 ? "card_squash" : "card";
      drawCard(c, x, y, tier, edge);
    }
    // 3) de vuelta: el resultado sale de la estación con la palomita
    if (f >= j.d && f < j.A) {
      let [x, y] = pathAt(i, idxBack(i, (f - j.d) / DUR[i]));
      if (j.round === 2) x += Math.round((i - 2) * 3 * ease((f - (j.A - 6)) / 6));    // los cinco se abren en abanico al llegar
      drawPkt(c, x, y, S);
    }
    // 4) atrapado: unos cuadros en las manos, y luego sale volando a su columna
    const lnd = LAND.find((q) => q.i === i && (j.round === 1 ? q.col === 0 && q.slot === j.k : q.col === 1));
    if (!lnd) continue;
    const off = j.round === 2 ? (i - 2) * 3 : 0;
    if (j.round === 1 && f >= j.A && f < lnd.from) drawPkt(c, TX, held, S);
    if (j.round === 2 && f >= j.A && f < lnd.from) drawPkt(c, TX + off, HY - 1, S);
    if (f >= lnd.from && f < lnd.t) {
      const u = (f - lnd.from) / (lnd.t - lnd.from);
      const p0 = [TX + off, j.round === 1 ? held : HY - 2], p2 = [COLX[lnd.col] + 5, slotTop(lnd.slot) + 2];
      const p1 = [(p0[0] + p2[0]) / 2 - 8, Math.min(p0[1], p2[1]) - (j.round === 1 ? 12 : 22)];
      const [x, y] = bez(p0, p1, p2, ease(u));
      if (u < 0.78) drawPkt(c, x, y, S);
      else drawSlip(c, x - 5, y - 2, S, false);
    }
  }
}

// ------------------------------------------------------------------ la cola de tareas (a la derecha de Clawd)
// Cinco disquetes de canto sobre el estilóbato, de abajo arriba. Clawd toma el de arriba cada vez; la cola se rellena antes de la ráfaga y al final del ciclo.
const QX = 77, qTop = (slot) => 96 - 3 * slot;
const spawnT = (round, slot) => ALL.find((j) => j.round === round && j.slot === slot);
const qFill = (round, slot) => (round === 2 ? LAST1 + 4 + 3 * slot : REF0 + 14 + 3 * slot);   // cuando reaparece la tarjeta de esa ronda
function queue(c, f) {
  for (let s0 = 0; s0 < 5; s0++) {
    const j1 = spawnT(1, s0), j2 = spawnT(2, s0);
    const r1 = j1.L - HOLD1, r2 = j2.L - HOLD2, fl2 = qFill(2, s0), fl3 = qFill(3, s0);
    let tier = null, born = 3;
    if (f < r1) { tier = T1[s0]; born = 99; }
    else if (f >= fl2 && f < r2) { tier = T2[s0]; born = f - fl2; }
    else if (f >= fl3) { tier = T1[s0]; born = f - fl3; }
    if (!tier) continue;
    const y = qTop(s0), p = Math.min(1, (born + 1) / 3);
    paintFn(c, ["ffffffffffff", "ffffffffffff", "FFFFFFFFFFFF"], QX, y, (ch, px, py) => {
      if (!(p >= 1 || dith(px, py, p))) return null;
      return ch === "f" && px < QX + 2 && py < y + 2 ? tier : ch;
    });
  }
  c.text(QX, 78, "TASKS", "X");
}

// ------------------------------------------------------------------ las pilas de resultados
function pile(c, f) {
  for (const l of LAND) {
    const S = ST[l.i], x = COLX[l.col], y = slotTop(l.slot);
    if (f < l.t) continue;
    const ft = fileT(l.col, l.slot);
    if (f >= ft) continue;                               // ya voló al papiro
    const u = f - l.t;
    drawSlip(c, x, y + (u === 0 ? 1 : 0), S, u < 2);
    if (u >= 1 && u < 6) sparkle(c, x + 12, y, SPK[u - 1], "y", S.kl);
  }
  for (const [col, slot] of FILEORD) {
    const ft = fileT(col, slot);
    const l = LAND.find((q) => q.col === col && q.slot === slot), S = ST[l.i];
    if (f >= ft - 3 && f < ft && f >= l.t) {             // parpadea antes de salir
      if (two(f) % 2) drawSlip(c, COLX[col], slotTop(slot), S, true);
    }
  }
}

// ------------------------------------------------------------------ el papiro
const DOC = { x: 3, y: 48, w: 20, h: 29 };
const docLines = (f) => FILEORD.filter(([col, slot]) => f >= fileT(col, slot) + FILEFLY).length;
function brief(c, f) {
  const t0 = FILE0 - 8, tEnd = REF0 + 22;
  if (f < t0 || f >= tEnd) return;
  const born = clamp01((f - t0) / 8), gone = f < REF0 + 6 ? 1 : 1 - clamp01((f - (REF0 + 6)) / 14);
  const a = born * gone;
  const { x, y, w, h } = DOC;
  const n = docLines(f);
  const px = (xx, yy, k) => { if (dith(xx, yy, a)) c.px(xx, yy, k); };
  // rodillo de arriba y de abajo: cilindros de papiro con su sombra
  for (let xx = x - 2; xx < x + w + 2; xx++) { px(xx, y - 3, "%"); px(xx, y - 2, "("); px(xx, y - 1, "<"); }
  for (let yy = y - 3; yy < y; yy++) { px(x - 3, yy, "<"); px(x + w + 2, yy, "<"); }
  for (let xx = x - 2; xx < x + w + 2; xx++) { px(xx, y + h, "("); px(xx, y + h + 1, "<"); }
  // hoja de papiro: luz a la izquierda, sombra a la derecha
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(xx, yy, xx === x + w - 1 ? "(" : "%");
  for (let xx = x + 2; xx < x + w - 2; xx++) { px(xx, y + 3, "2"); px(xx, y + 4, "2"); }              // título
  for (let k = 0; k < 10; k++) {
    const yy = y + 7 + k * 2, on = k < n;
    if (!on) { for (let xx = x + 3; xx < x + w - 3; xx++) px(xx, yy, "<"); continue; }
    const li = FILEORD[k] ? LAND.find((q) => q.col === FILEORD[k][0] && q.slot === FILEORD[k][1]) : null;
    px(x + 2, yy, li ? ST[li.i].k : "2");                 // marca de la estación que escribió esta línea
    const end = x + w - 3 - ((k * 3) % 4);
    for (let xx = x + 4; xx < end; xx++) px(xx, yy, "2");
  }
  if (n === 10) {                                         // el sello de cera: todo está en el papiro
    const u = f - (FILE0 + 3 * 9 + FILEFLY);
    if (u >= 0 && u < 14) {
      c.circ(x + 10, y + 23, 3, "u");
      paintGrid(c, PROPS.check.map((r) => r.slice(0, Math.min(7, u * 2 + 1))), x + 7, y + 21, { y: "W" });
      if (u < 6) sparkle(c, x + w + 1, y + 6, SPK[Math.min(4, u)], "y", "l");
    }
  }
}
// El disquete que vuela de la pila al papiro.
function fileFx(c, f) {
  FILEORD.forEach(([col, slot], k) => {
    const t = f - fileT(col, slot);
    if (t < 0 || t >= FILEFLY) return;
    const l = LAND.find((q) => q.col === col && q.slot === slot), S = ST[l.i];
    const p0 = [COLX[col] + 5, slotTop(slot) + 2], p2 = [DOC.x + 10, DOC.y + 7 + k * 2];
    const p1 = [(p0[0] + p2[0]) / 2 + (col ? 8 : 4), Math.min(p0[1], p2[1]) - 6];
    const [x, y] = bez(p0, p1, p2, ease(t / (FILEFLY - 1)));
    c.rect(x - 3, y - 2, 7, 4, S.kd); c.hline(x - 3, y - 2, 7, S.k); c.px(x + 1, y, "W");
    if (t < 3) sparkle(c, p0[0], p0[1], SPK[t], "y", S.kl);
  });
}

// ------------------------------------------------------------------ estaciones: CRT beige sobre pedestal de mármol
const RING3 = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
const RING5 = [[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [4, 3], [3, 4], [2, 4], [1, 4], [0, 3], [0, 2], [0, 1]];
function jobState(i, f) {
  for (const j of JOBS[i]) {
    if (f >= j.a && f < j.a + RECV) return { m: "recv", t: f - j.a, j };
    if (f >= j.a + RECV && f < j.d - DONEHOLD) return { m: "work", t: f - j.a - RECV, j };
    if (f >= j.d - DONEHOLD && f < j.d + 12) return { m: "done", t: f - (j.d - DONEHOLD), j };
  }
  return { m: "idle", t: 0, j: null };
}
// Muescas que quedan: cada tarea gasta una al llegar; luego la ventana de cuota se renueva.
function notches(i, f) {
  let used = JOBS[i].filter((j) => f >= j.a).length;
  let n = 4 - used;
  const r = f - refT(i);
  if (r >= 0) n = Math.min(4, 2 + Math.floor(r / 3) + 1);
  return n;
}
const noteKey = (n) => (n >= 3 ? "j" : n === 2 ? "O" : "u");

function work(c, i, sx, sy, t, S) {
  switch (i) {
    case 0: {                                                    // AGY: tres líneas que se escriben y un anillo que gira
      const lens = [10, 6, 12], tot = 28, cnt = Math.floor(t * 0.7) % (tot + 6);
      let prev = 0;
      lens.forEach((len, r) => {
        const w = Math.max(0, Math.min(len, cnt - prev));
        if (w > 0) c.hline(sx + 1, sy + r * 2, w, S.kl);
        if (cnt > prev && cnt <= prev + len && two(t) % 2) c.px(sx + 1 + w, sy + r * 2, "y");
        prev += len;
      });
      const head = two(t) % 8;
      RING3.forEach(([dx, dy], k) => c.px(sx + 18 + dx, sy + 1 + dy, k === head ? "y" : k === (head + 7) % 8 ? S.k : S.kd));
      break;
    }
    case 1: {                                                    // CODEX: código que sube de línea con sangrías
      const sc = Math.floor(t / 3);
      for (let r = 0; r < 4; r++) {
        const m = Math.floor(sc / 2) + r, yy = sy + r * 2 - (sc % 2);
        if (yy < sy || yy > sy + 4) continue;
        const ind = Math.floor(hash(m, 3, 5) * 3) * 2, len = 3 + Math.floor(hash(m, 7, 5) * 10);
        c.hline(sx + 1 + ind, yy, Math.min(len, 20 - ind), r === 3 ? "y" : S.kl);
      }
      break;
    }
    case 2: {                                                    // GROK: un anillo grande que gira y tres puntos
      const head = two(t) % 12;
      RING5.forEach(([dx, dy], k) => c.px(sx + 4 + dx, sy + dy, k === head ? "y" : k === (head + 11) % 12 ? S.kl : k === (head + 10) % 12 ? S.k : S.kd));
      for (let k = 0; k < 3; k++) c.px(sx + 12 + k * 3, sy + 2, Math.floor(t / 5) % 4 > k ? S.kl : S.kd);
      break;
    }
    case 3: {                                                    // CURSOR: un puntero que arrastra una selección
      const cyc = t % 30, w = Math.round(16 * ease(cyc / 22));
      c.hline(sx + 1, sy + 1, 16, "9"); c.hline(sx + 1, sy + 3, 11, "9");
      if (w > 0) c.rect(sx + 1, sy, w, 3, S.kd);
      c.hline(sx + 1, sy + 1, 16, "9");
      if (w > 0) c.hline(sx + 1, sy + 1, w, S.kl);
      const ax = sx + 1 + w, ay = sy + 1;
      c.px(ax, ay + 1, "y"); c.px(ax, ay + 2, "y"); c.px(ax + 1, ay + 2, "y"); c.px(ax, ay + 3, "y");
      break;
    }
    default: {                                                   // MUSE: un ecualizador
      for (let k = 0; k < 7; k++) {
        const hh = 1 + Math.floor(4 * Math.abs(Math.sin(t * 0.34 + k * 1.3) * Math.cos(t * 0.17 + k * 0.7)));
        c.rect(sx + 2 + k * 3, sy + 5 - hh, 2, hh, hh >= 4 ? "y" : S.kl);
      }
    }
  }
}

function station(c, i, f) {
  const S = ST[i], x0 = S.x0, y0 = SY0, st = jobState(i, f);
  let border = "K";
  if (st.m === "recv") border = st.t < 2 ? "y" : S.k;
  else if (st.m === "work") border = S.k;
  else if (st.m === "done") border = st.t < 2 || (f >= st.j.d - 1 && f < st.j.d + 2) ? "y" : "j";
  // carcasa beige del CRT: luz arriba a la izquierda, sombra abajo a la derecha; el contorno enciende el estado
  c.rect(x0, y0, 28, 18, "(");
  c.hline(x0 + 1, y0 + 1, 26, "%");
  c.vline(x0 + 1, y0 + 1, 16, "%");
  c.hline(x0, y0 + 17, 28, "<");
  c.vline(x0 + 27, y0 + 1, 16, "<");
  for (let k = 0; k < 4; k++) c.px(x0 + 8 + 3 * k, y0 + 2, "<");   // rejilla de ventilación
  c.box(x0, y0, 28, 18, border);
  // tubo: bisel gris y pantalla oscura con un reflejo
  c.rect(x0 + 2, y0 + 3, 24, 11, "9");
  c.rect(x0 + 3, y0 + 4, 22, 10, "c");
  c.px(x0 + 4, y0 + 4, "0");
  const sx = x0 + 3, sy = y0 + 6;
  if (st.m === "idle") {
    c.hline(sx + 1, sy + 2, 5, "9");
    if (f % 30 < 15) c.px(sx + 7, sy + 2, "x");
  } else if (st.m === "recv") {
    for (const r of [0, 2, 4]) c.hline(sx, sy + r, st.t < 2 ? 22 : 11 + st.t * 2, st.t < 2 ? "x" : S.kl);
  } else if (st.m === "work") {
    work(c, i, sx, sy, st.t, S);
  } else {
    const u = st.t;
    paintGrid(c, PROPS.check.map((r) => r.slice(0, Math.min(7, u * 2 + 1))), sx + 7, sy, { y: u < 3 ? "y" : "j" });
    c.hline(sx + 1, sy + 4, 3, "9"); c.hline(sx + 18, sy + 4, 3, "9");
  }
  // batería de cuota: cuatro muescas en la franja de abajo del bisel
  const BY = y0 + 15;
  const n = notches(i, f);
  c.rect(x0 + 3, y0 + 14, 22, 3, "9");
  for (let q = 0; q < 4; q++) {
    const x = x0 + 4 + 5 * q;
    if (q < n) {
      const r = f - refT(i), fresh = r >= 0 && q >= 2 && r - (q - 2) * 3 >= 0 && r - (q - 2) * 3 < 3;
      c.rect(x, BY, 4, 2, fresh ? "y" : noteKey(n));
    }
  }
  // la muesca que se gasta se apaga en blanco
  for (const j of JOBS[i]) {
    const t = f - j.a, q = 4 - JOBS[i].filter((jj) => jj.a <= j.a).length;
    if (t >= 0 && t < 10 && refT(i) > f) {
      const x = x0 + 4 + 5 * q;
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 4; xx++) if (dith(x + xx, BY + yy, 1 - t / 10)) c.px(x + xx, BY + yy, t < 3 ? "y" : "O");
    }
  }
  // luz de estado, a la derecha de la batería
  const lamp = st.m === "work" ? (f % 8 < 4 ? S.kl : S.k) : st.m === "done" ? "j" : st.m === "recv" ? "y" : "9";
  c.rect(x0 + 25, BY, 2, 2, lamp);
  // pedestal de mármol: friso, nombre tallado y franja del color de la estación
  c.hline(x0 - 1, y0 + 18, 30, "W");                     // labio del pedestal
  c.rect(x0, y0 + 19, 28, 8, "e");
  c.vline(x0 + 2, y0 + 19, 8, "W"); c.vline(x0 + 25, y0 + 19, 8, "3");
  c.hline(x0 + 1, y0 + 26, 26, S.k);                     // franja de color al pie del nombre
  c.hline(x0 - 1, y0 + 27, 30, "3");
  c.hline(x0 - 1, y0 + 28, 30, "2");
  const nameW = S.name.length * 4 - 1, tx = x0 + Math.floor((28 - nameW) / 2);
  c.text(tx + 1, y0 + 21, S.name, "W");                  // la talla: luz abajo a la derecha, letra oscura
  c.text(tx, y0 + 20, S.name, "2");
  // lo que se estrella en la base del pedestal: la línea que sale del cable
  if (st.m === "recv") c.hline(S.cx - 2, PORT_Y, 5, st.t < 2 ? "y" : S.kl);
}
function stationFx(c, f) {
  for (const i of [0, 1, 2, 3, 4]) for (const j of JOBS[i]) {
    const S = ST[i], x0 = S.x0;
    const td = f - (j.d - DONEHOLD);
    if (td >= 0 && td < 10) sparkle(c, x0 + 25, SY0 + 2, [1, 2, 3, 3, 2, 2, 1, 1, 1, 1][td], "y", S.kl);
    const te = f - j.d;                                           // el disquete sale por el puerto
    if (te >= 0 && te < 6) c.hline(S.cx - 4 + te, PORT_Y, Math.max(1, 8 - 2 * te), te < 2 ? "y" : S.kl);
    const ta = f - j.a;                                           // el disquete entra: un destello en el puerto
    if (ta >= -1 && ta < 4) c.hline(S.cx - 5 + ta, PORT_Y, 10 - 2 * ta, ta < 2 ? "y" : S.k);
  }
}

// ------------------------------------------------------------------ Clawd
function lookAt(f) {
  let best = null, bt = -1;
  for (const i of [0, 1, 2, 3, 4]) for (const j of JOBS[i]) {
    if (f >= j.L && f < j.a && j.L > bt) { bt = j.L; best = [i, 1]; }
    if (f >= j.d && f < j.A && j.d > bt) { bt = j.d; best = [i, 0]; }
  }
  if (!best) return null;
  const i = best[0];
  return i === 1 ? "up" : ST[i].cx < TX ? "left" : "right";
}
function clawd(f) {
  const s = { pose: "idle", dy: 0, eyes: "sq", flip: false, halo: null };
  s.eyes = lookAt(f) ?? "sq";
  if (f % 90 >= 40 && f % 90 < 44) s.eyes = "blink";
  // lanzar la primera tanda: se agacha, sube con los brazos, suelta
  for (const j of ALL) {
    if (j.round !== 1) continue;
    const t = f - j.L;
    if (t >= -HOLD1 - 1 && t < -HOLD1 + 4) { s.pose = "squash"; s.eyes = "up"; }
    else if (t >= -HOLD1 + 4 && t < 5) {
      s.pose = "armsup"; s.eyes = "up";
      s.dy = -Math.round(3 * Math.sin((Math.PI * (t + HOLD1 - 4)) / (HOLD1 + 1)));
    }
  }
  // la ráfaga: brazos arriba, saltitos, una tarjeta cada 3 cuadros
  if (f >= V0 - 8 && f < V0 - 3) { s.pose = "squash"; s.eyes = "up"; }
  else if (f >= V0 - 3 && f < V0 + 3 * 4 + 5) {
    s.pose = "armsup"; s.eyes = "up";
    s.dy = -[2, 1, 0][(f - V0 + 3) % 3];
  }
  // atrapar los resultados de la primera tanda
  for (const j of ALL) {
    if (j.round !== 1) continue;
    const t = f - j.A;
    if (t >= -4 && t < 0) { s.pose = "armsup"; s.eyes = lookAt(f) ?? "up"; s.dy = -1; }
    else if (t >= 0 && t < 3) { s.pose = "squash"; s.eyes = "down"; }
    else if (t >= 3 && t < 9) { s.pose = "point_l"; s.eyes = "left"; }
    else if (t >= 9 && t < 17) { s.eyes = "happy"; if (s.pose === "idle") s.dy = 0; }
  }
  // espera de la segunda tanda: mira de estación en estación y se impacienta
  if (f >= V0 + 3 * 4 + 5 && f < HIT - 7) {
    const t = f - (V0 + 17), w = Math.floor(t / 16) % 6;
    s.eyes = ["left", "up", "right", "up", "left", "up"][w];
    if (f % 90 >= 40 && f % 90 < 44) s.eyes = "blink";
  }
  // el golpe
  const t = f - HIT;
  if (t >= -7 && t < 0) { s.pose = "squash"; s.eyes = "wide"; }
  else if (t >= 0 && t < 4) { s.pose = "surprise"; s.eyes = "wide"; s.halo = "y"; s.dy = 0; }
  else if (t >= 4 && t < 18) {
    const u = (t - 4) / 14;
    s.pose = "armsup"; s.eyes = "happy"; s.dy = -Math.round(36 * u * (1 - u)); s.halo = t < 10 ? "y" : "a";
  } else if (t >= 18 && t < 22) { s.pose = "squash"; s.eyes = "happy"; s.dy = 0; }
  else if (t >= 22 && t < 40) { s.pose = "armsup"; s.eyes = "happy"; s.dy = 0; if (t < 34) s.halo = "a"; }
  else if (t >= 40 && t < 56) { s.eyes = "happy"; s.dy = 0; }
  return s;
}

// ------------------------------------------------------------------ el cangrejo nativo, dormido en un diván de mármol
function crab(c, f) {
  // diván de mármol: tablero, cojín con su costura y dos patas bajo la nebulosa
  c.rect(120, 74, 38, 2, "W");
  c.rect(121, 76, 36, 4, "e"); c.hline(121, 79, 36, "3");
  for (let x = 124; x < 156; x += 6) c.px(x, 77, "L");
  c.rect(122, 80, 3, 6, "2"); c.rect(151, 80, 3, 6, "2");
  const cx = 138, fy = 74, breath = f % 60 < 30 ? 0 : 1;
  const [x, y] = place("idle", false, cx, fy - breath, 1);
  drawPose(c, "idle", x, y, 1, (px, py, r) => (r < 2 ? "V" : r >= 8 && r < 12 ? (((px >> 1) + (py >> 1)) % 2 ? "M" : "N") : r < 12 ? "L" : "m"));
  c.rect(x + 8, y - 1, 8, 1, "V"); c.rect(x + 10, y - 2, 4, 1, "V");   // gorro de dormir con su borla, y una manta a cuadros
  c.rect(x + 15, y - 1, 2, 1, "V"); c.rect(x + 16, y, 2, 2, "y");
  const t = f - (HIT + 5);                                           // el estruendo casi lo despierta
  let eyes = "blink";
  if (t >= 0 && t < 22) eyes = t < 14 ? "open" : "half";
  const ex = eyesOf("idle", x, y, 1, false);
  if (eyes === "open") ex.forEach(([ex0, ey0]) => { c.rect(ex0, ey0, 2, 2, "c"); c.px(ex0, ey0, "y"); });
  else if (eyes === "half") ex.forEach(([ex0, ey0]) => c.rect(ex0, ey0 + 1, 2, 1, "c"));
  else drawEyes(c, ex, 1, "blink", "c");
  if (t >= 2 && t < 18) { c.text(cx + 11, fy - 22, "?", "O"); }
  // las z suben y se hacen más grandes (periodo 90 cuadros: divide el ciclo)
  [0, 45].forEach((off) => {                             // en dos: la Z sube un paso cada dos cuadros (menos peso)
    const p = ((two(f) * 2 + off) % 90) / 90;
    const x0 = 146 + Math.round(p * 8) + Math.round(Math.sin(p * TAU * 1.5) * 1.5), y0 = 56 - Math.round(p * 14);
    const col = p > 0.8 ? "1" : p > 0.6 ? "F" : "R";
    if (p < 0.45) { c.hline(x0, y0, 3, col); c.px(x0 + 1, y0 + 1, col); c.hline(x0, y0 + 2, 3, col); }
    else c.text(x0, y0 - 2, "Z", col);
  });
  const cap = "NOT NEEDED", cap2 = "WHILE QUOTA LASTS";
  c.text(156 - (cap.length * 4 - 1), 88, cap, "X");
  c.text(156 - (cap2.length * 4 - 1), 94, cap2, "X");
}

// ------------------------------------------------------------------ efectos del golpe
// Chispas en las cinco estaciones tras el golpe: el trabajo de todas llegó junto.
function stationStars(c, f) {
  ST.forEach((S, i) => {
    const t = f - (HIT + 5 + 2 * i);
    if (t >= 0 && t < 10) sparkle(c, S.x0 + 26, SY0 + 2, [1, 2, 3, 3, 2, 2, 1, 1, 1, 1][t], "y", S.kl);
  });
}
function beatFx(c, f) {
  const t = f - HIT;
  if (t >= 0 && t < 18) {                                            // anillos desde las manos de Clawd
    c.ring(TX, HY, 3 + Math.round(t * 1.6), t < 3 ? "y" : t < 9 ? "l" : "A");
    if (t > 3 && t < 12) c.ring(TX, HY, Math.max(1, Math.round(t * 1.6) - 4), t < 7 ? "T" : "F");
  }
  if (t >= 4 && t < 16) {
    sparkle(c, TX - 20, HY - 6, SPK[Math.min(4, Math.floor((t - 4) / 2.4))], "y", "l");
    sparkle(c, TX + 20, HY - 8, SPK[Math.min(4, Math.floor((t - 6) / 2.4) | 0) < 0 ? 0 : Math.min(4, Math.floor((t - 6) / 2.4))], "y", "l");
  }
}

// Diálogo de los 90 de espera: Clawd aguanta mientras las estaciones trabajan en paralelo.
function bubble(c, f) {
  const a0 = V0 + 24, a1 = HIT - 10;
  if (f < a0 || f >= a1) return;
  const x = 66, y = 53, p = Math.min(clamp01((f - a0) / 4), clamp01((a1 - f) / 4));
  if (p < 1 && !dith(x + 3, y + 3, p)) return;
  c.rect(x, y, 16, 10, "C");
  c.rect(x, y, 16, 2, "L");                              // barra de título violeta
  c.box(x, y, 16, 10, "x");
  c.px(x + 2, y + 10, "x"); c.px(x + 3, y + 11, "x");
  for (let k = 0; k < 3; k++) c.rect(x + 3 + k * 4, y + 5, 2, 2, Math.floor((f - a0) / 6) % 4 > k ? "8" : "x");
}

// ------------------------------------------------------------------ barra
function doneCount(f) { return LAND.filter((l) => f >= l.t).length; }
function hudPhase(f) {
  if (f >= FILE0 - 8 && f < REF0 + 22) return ["> ONE BRIEF", "j", FILE0 - 8];
  if (f >= HIT && f < FILE0 - 8) return ["> 5 OF 5 BACK AT ONCE", "j", HIT];
  if (f >= V0 - 8 && f < HIT) return ["> ALL AT ONCE", "w", V0 - 8];
  if (f >= LAST1 - 20 && f < V0 - 8) return ["> RESULTS IN", "x", LAST1 - 20];
  if (f >= 100 && f < LAST1 - 20) return ["> RESULTS COMING BACK", "x", 100];
  if (f >= 10 && f < 100) return ["> HANDING OFF TASKS", "x", 10];
  return ["> DELEGATION", "x", -999];
}
function hud(c, f) {
  const flash = f >= HIT && f < HIT + HOLD;
  c.rect(4, 2, 152, 10, flash ? "l" : "c");
  c.box(4, 2, 152, 10, "F");
  const [text, col, start] = hudPhase(f), shown = Math.min(text.length, Math.floor((f - start) * 1.5) + 1);
  c.text(7, 5, text.slice(0, shown), flash ? "c" : col);
  if (shown < text.length && two(f) % 2) c.rect(7 + shown * 4, 5, 3, 5, "x");
  const n = doneCount(f);
  const reset = f >= REF0;
  const right = n === 0 || reset ? "5 HARNESSES" : `DONE ${n}`;
  const bump = LAND.some((l) => f >= l.t && f < l.t + 6);
  c.text(153 - (right.length * 4 - 1), 5, right, flash ? "c" : bump ? "y" : n === 10 ? "j" : n === 0 || reset ? "X" : "x");
}

// ------------------------------------------------------------------ la animación
anim("goal_deleg", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HIT && f < HIT + HOLD) f = HIT;                // hit-stop: el mundo se congela cuando llegan los cinco resultados
  const cs = clawd(f);
  const [x, y] = place(cs.pose, cs.flip, TX, FEET + cs.dy, 2);

  backdrop(c, f);
  cables(c, f);
  queue(c, f);
  pile(c, f);
  brief(c, f);
  flights(c, f, cs);
  ST.forEach((S, i) => station(c, i, f));
  stationFx(c, f);
  fileFx(c, f);
  crab(c, f);
  const mask = drawPose(c, cs.pose, x, y, 2, "o", cs.flip);
  drawEyes(c, eyesOf(cs.pose, x, y, 2, cs.flip), 2, cs.eyes, "k");
  if (cs.halo) haloOf(c, mask, cs.halo);
  beatFx(c, f);
  stationStars(c, f);
  bubble(c, f);
  hud(c, f);
  const sh = real - (HIT + HOLD);
  if (sh >= 0 && sh < 10) shake(c, [2, -2, 2, -1, 1, -1, 1, 0, -1, 0][sh], [1, -1, 0, 1, -1, 0, 1, 0, 0, 0][sh]);
  if (real >= HIT && real < HIT + NEG)                   // cuadro de impacto en negativo
    c.recolor({ z: "W", c: "S", 1: "2", 8: "a", 9: "A", Z: "l", F: "L", r: "A", o: "7", k: "y", 2: "1", x: "n", X: "N" });
})

sheet("goal_deleg_sheet", ["goal_deleg"], { pad: 0 })
