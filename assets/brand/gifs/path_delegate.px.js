// path_delegate.px.js: camino #2 de "Tres caminos, una decisión": TAREA DELEGADA. 225 x 40 px de arte (GIF a x4 = 900 x 160),
// 360 cuadros a 30 fps (12 s), bucle sin corte. Es la tira que ocupa el lugar del diagrama SVG del camino #2.
// Clawd (el Lead, a media escala 12 x 8) está en la vía principal, a la izquierda. Escribe un encargo autocontenido (un disquete TASK
// con la ficha de modelo y esfuerzo SONNET · HIGH) y lo suelta en la vía: el encargo sube por la rama de SEGUNDO PLANO hasta
// un subagente (un cangrejo azul, nivel medio). El cangrejo corre un ciclo EDIT, TEST, FIX (una flecha circular y tres lámparas de
// prueba: una falla en rojo, luego pasan) mientras Clawd sigue tecleando: el Lead no está bloqueado. El resultado vuelve por la rama
// como un disquete verde, se funde con la vía principal y llega a la bandera FINAL RESULT, que sube con su palomita.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): la vía principal es un friso de greca (meandro) de mármol y la
// rama, el arco de una línea de constelación con estrellas por nodos; las tarjetas son disquetes de 3.5"; el monitor de Clawd es un
// CRT beige de los 90; el cangrejo trabaja sobre una losa de mármol flotante; la bandera se alza sobre una columna dórica pequeña;
// fondo de estrellitas. Sin barras, cintas ni madera.
// Leyenda de la historia (cuadros del mundo; el hit-stop congela el mundo 4 cuadros y los demás se corren):
//   8 a 54     el disquete TASK aparece sobre Clawd, se escribe "TASK" y se enciende la ficha SONNET · HIGH
//   54 a 66    Clawd se agacha, lo lanza con los brazos arriba; el disquete se encoge y la ficha se disuelve
//   66 a 112   el disquete cae a la vía (aro), sube por la constelación, nace el cangrejo (bolita, se despliega) y lo recoge; "LEAD FREE"
//   114 a 226  EDIT, TEST (150: falla en rojo, gota de sudor, sacudida del cangrejo), FIX, EDIT, TEST (214: pasa en verde)
//   226 a 296  salto del cangrejo, nace el disquete del resultado, recorre el arco, se funde en la vía (aro en el nodo) y llega a la columna
//   296        EL GOLPE: hit-stop de 4 cuadros, 2 cuadros en negativo, sacudida corta; luego sube la bandera con su palomita, Clawd celebra
//   330 a 350  la bandera baja, el cangrejo se hace bolita y se va, las lámparas y las pestañas vuelven a pendiente
//   350 a 359  escena limpia = escena del cuadro 0
// Bucle: el hit-stop se come 3 cuadros del reloj del mundo (en el cuadro 359 el mundo marca 356, y el siguiente sería el 357), así que
// lo ambiental (teclado del monitor 119, guiones de la constelación 21, parpadeos 119, estrellas 51 y 119) usa periodos que DIVIDEN 357.
include("kit.px.js")

const W = 225, H = 40, N = 360;
pal({ R: "#f2cdcd", r: "#f5e0dc", q: "#9399b2", K: "#141225" });   // CRT beige (flamenco y rosa té); el mármol usa W e a A 2 del kit

// ------------------------------------------------------------------ plano (todo en px de arte)
//   y 0 a 7     barra de arriba (rellena 0 a 6, línea en 7)
//   y 8 a 15    ficha de modelo, anillo (centro 111,12) y pestañas EDIT/TEST/FIX; etiqueta FINAL RESULT (y 9)
//   y 16 a 20   el cangrejo, de pie sobre su losa (y 21 y 22)   y 23 y 24  etiquetas LEAD / SUBAGENT, BACKGROUND
//   y 26 a 36   el CRT y Clawd (pies en 36)                     y 37 a 39   la vía principal: friso de greca (RAIL = 37)
const RAIL = 37, FEET = 36, LANE = 21;
const FORK = 46, JOIN = 176, POLE = 200;                  // dónde sale la rama, dónde vuelve y el mástil de la bandera (sobre su columna)
const TEND = 192;                                         // la vía del resultado termina junto a la columna
const CX = 79;                                            // centro del cangrejo
const RC = [111, 12];                                     // centro del anillo

// ------------------------------------------------------------------ guion
const HIT = 296, HOLD = 4, NEG = 2;                       // el golpe, su hit-stop y los cuadros en negativo
const T = {
  card: 8, text: 16, chip: 32, squat: 54, throw: 58, shrink: 60, fly: 66, land: 86, ride: 88, arrive: 108, absorbed: 112,
  born: 94, ball: 96, unfold: 100, ready: 106,
  out: 237,                                               // sale el paquete del resultado
  reset: 330,
};
const STG = [[114, 138], [138, 162], [162, 186], [186, 202], [202, 226]];        // EDIT, TEST, FIX, EDIT, TEST
const TABIDX = [0, 1, 2, 0, 1];
const FAIL = 150, PASS = 214;
const stageOf = (f) => STG.findIndex(([a, b]) => f >= a && f < b);

// ------------------------------------------------------------------ utilidades propias
const tw = (s) => s.length * 4 - 1;
const dith = (x, y, a) => bay(x, y) < a;
const win = (f, a, b) => f >= a && f < b;
const prog = (f, a, b) => clamp01((f - a) / (b - a));
function spark(p, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  p.px(x, y, col);
  for (let k = 1; k < size; k++) for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) p.px(x + dx, y + dy, arm);
}
const SP = [1, 2, 3, 3, 2, 1];
// Disuelve (Bayer) lo que dibuja fn: a = 1 normal, 0 nada.
function fade(c, a, fn) {
  if (a >= 1) fn();
  else if (a > 0) c.clip((x, y) => bay(x, y) < a, fn);
}
// Aro elíptico que se abre en un punto (aterrizaje, golpe).
function ripple(c, x, y, t, life, r1, cols) {
  if (t < 0 || t >= life) return;
  const r = Math.round(2 + (r1 - 2) * ease(t / life) ** 0.7);
  c.ellipse(x, y, r, Math.max(1, Math.round(r * 0.4)), t < life * 0.25 ? cols[0] : t < life * 0.6 ? cols[1] : cols[2], true);
}

// ------------------------------------------------------------------ la rama (se calcula una vez)
// Un solo camino: sube de la vía en FORK, corre por la rama a y = LANE y vuelve a bajar a la vía en JOIN; luego el tramo de vía hasta la bandera.
const TRACK = (() => {
  const pts = [];
  const add = (x, y) => { const q = pts[pts.length - 1]; if (!q || q[0] !== x || q[1] !== y) pts.push([x, y]); };
  for (let i = 0; i <= 120; i++) { const p = bez([FORK, RAIL], [FORK, LANE], [62, LANE], i / 120); add(p[0], p[1]); }
  for (let x = 63; x < 150; x++) add(x, LANE);
  for (let i = 0; i <= 160; i++) { const p = bez([150, LANE], [JOIN, LANE], [JOIN, RAIL], i / 160); add(p[0], p[1]); }
  return pts;
})();
const NBR = TRACK.length;                                  // la rama termina aquí (nodo de unión)
for (let x = JOIN + 1; x <= TEND; x++) TRACK.push([x, RAIL]);
const NT = TRACK.length;
const idxLane = (x) => TRACK.findIndex((p) => p[0] === x && p[1] === LANE);
const D_IN = idxLane(71), D_OUT = idxLane(87), D_END = NT - 1;
const D_JOIN = NBR - 1;
const tp = (d) => TRACK[Math.max(0, Math.min(NT - 1, Math.round(d)))];

// ------------------------------------------------------------------ disquetes y ficha
const FP = {
  out: { body: "3", hl: "e", sh: "L" },                  // disquete lavanda: el encargo
  res: { body: "j", hl: "T", sh: "4" },                  // disquete verde con palomita: el resultado
};
const CHECK5 = ["....j", "...j.", "j.j..", ".j..."];
// Disquete de 3.5" de frente a cualquier tamaño: postigo metálico arriba, etiqueta blanca abajo con la franja del nivel (azul = medio).
// letters >= 0 (solo en el grande): escribe "TASK" en la etiqueta.
function floppy(c, x, y, w, h, kind = "out", letters = -1) {
  const P = FP[kind];
  c.rect(x, y, w, h, P.body);
  c.hline(x, y, w, P.hl);
  if (w < 5 || h < 4) return;
  c.vline(x, y, h, P.hl); c.hline(x, y + h - 1, w, P.sh); c.vline(x + w - 1, y, h, P.sh);
  c.px(x + w - 1, y, "z");                                              // esquina cortada
  const sh = kind === "res" ? 1 : h >= 12 ? 3 : 2;
  const sw = Math.min(w - 4, Math.max(3, Math.round(w * 0.45))), sx = x + Math.max(1, Math.round(w * 0.27));
  c.rect(sx, y + 1, sw, sh, "G"); c.hline(sx, y + 1, sw, "g");
  if (sh >= 2) c.rect(sx + sw - 3, y + 2, 2, sh - 1, "c");               // la ranura del postigo
  const ly = y + 2 + sh, lh = h - 3 - sh;
  if (lh < 1) return;
  c.rect(x + 1, ly, w - 2, lh, "y");
  if (kind === "out") c.rect(x + 1, ly, w >= 14 ? 2 : 1, lh, "b");        // franja del nivel
  else if (lh >= 3 && w >= 9) [[2, 1], [3, 2], [4, 1], [5, 0]].forEach(([q, r]) => c.px(x + 1 + q, ly + r, "4"));
  if (letters >= 0 && w >= 21) {
    const s = "TASK".slice(0, letters);
    if (s) c.text(x + 4, ly + 1, s, "c");
    if (letters < 4) c.px(x + 4 + s.length * 4, ly + 5, "b");             // cursor: se va escribiendo
  }
}
// Disquete de 9 x 7 por defecto; (x, y) es el punto del camino y el disquete queda encima. kind: "out" o "res". h < 7 lo aplasta.
function packet(c, x, y, kind, h = 7, w = 9) {
  floppy(c, x - Math.floor(w / 2), y - h, w, h, kind);
}
// El disquete TASK sobre Clawd (22 x 13) y la ficha de modelo (47 x 7).
const CARD = { x: 4, y: 9, w: 22, h: 13 };
function chip(c, x0, y0, tail) {
  c.rect(x0, y0, 47, 7, "5");
  c.box(x0, y0, 47, 7, "b");
  c.text(x0 + 2, y0 + 1, "SONNET", "B");
  c.px(x0 + 2 + 23 + 2, y0 + 3, "y");
  c.text(x0 + 2 + 23 + 2 + 1 + 2, y0 + 1, "HIGH", "B");
  if (tail) { c.px(x0 + 23, y0 + 7, "b"); }
}

// ------------------------------------------------------------------ guiones de vuelo del paquete
// Salida: del aire sobre Clawd a la vía, en arco.
const FLY = [[14, 22], [36, 6], [FORK, RAIL - 1]];
const flyPos = (f) => { const g = prog(f, T.fly, T.land), u = 0.55 * g + 0.45 * ease(g); return bez(FLY[0], FLY[1], FLY[2], u); };
// Subida por la rama hasta el cangrejo.
const rideD = (f) => { const g = prog(f, T.ride, T.arrive); return D_IN * (0.5 * g + 0.5 * ease(g)); };
// Regreso del resultado: de la rama junto al cangrejo a la bandera.
const retD = (f) => { const g = prog(f, T.out, HIT); return D_OUT + (D_END - D_OUT) * (0.25 * ease(g) + 0.75 * g); };
const T_JOIN = (() => { for (let f = T.out; f <= HIT; f++) if (retD(f) >= D_JOIN) return f; return HIT; })();

// ------------------------------------------------------------------ fondo: estrellitas (casi quietas)
// Pocas, lejos del texto y de la línea de la constelación; unas cuantas titilan 3 cuadros de cada 51 o 119 (ambos dividen 357).
const STARS = (() => {
  const r = seeded(404), out = [];
  const boxes = [[0, 0, 224, 8], [2, 22, 22, 29], [62, 22, 96, 29], [107, 22, 153, 29], [174, 8, 224, 15], [103, 5, 120, 19],
    [116, 8, 182, 15], [53, 7, 105, 16], [194, 13, 216, 40], [2, 26, 37, 40], [59, 15, 93, 23], [0, 35, 224, 40]];
  for (let i = 0; i < 400 && out.length < 52; i++) {
    const x = 1 + Math.floor(r() * 222), y = 9 + Math.floor(r() * 26), k = r();
    if (boxes.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) continue;
    if (TRACK.some(([tx, ty]) => Math.abs(tx - x) <= 1 && Math.abs(ty - y) <= 1)) continue;
    if (out.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 5)) continue;
    const tw2 = out.filter((q) => q[3] > 0).length < 8 && k < 0.2;
    out.push([x, y, k < 0.55 ? "N" : k < 0.88 ? "2" : "A", tw2 ? (out.length % 2 ? 51 : 119) : 0, Math.floor(r() * 119)]);
  }
  return out;
})();
function stars(c, f) {
  for (const [x, y, col, per, ph] of STARS) c.px(x, y, per && (f + ph) % per < 3 ? "S" : col);
}

// ------------------------------------------------------------------ vía principal: friso de greca (meandro) de mármol
// Tres filas (RAIL a RAIL + 2) sobre un fondo violeta: la línea de arriba es la vía. 8 px por vuelta.
const KEYROW = ["aaaaaaaA", "a.....a.", "a.aaa.a."];
const TRK0 = 5, TRK1 = 218;
function frieze(c, f) {
  c.rect(TRK0, RAIL, TRK1 - TRK0 + 1, 3, "2");
  // el tramo que ya recorrió el resultado queda verde tras el disquete
  let xEnd = -1, tint = "j";
  if (f >= T_JOIN && f < 338) { const d = f < HIT ? retD(f) : D_END; xEnd = tp(d)[0]; tint = f >= HIT ? "4" : "j"; }
  for (let x = TRK0; x <= TRK1; x++)
    for (let r = 0; r < 3; r++) {
      if (KEYROW[r][(x - TRK0) & 7] === ".") continue;
      const on = x >= JOIN && x <= xEnd;
      c.px(x, RAIL + r, on ? (r === 0 ? tint : "4") : r === 0 ? "a" : r === 1 ? "a" : "A");
    }
  for (const x of [2, 219]) {                                          // remates de piedra en las puntas
    c.rect(x, RAIL - 1, 3, 4, "e"); c.hline(x, RAIL - 1, 3, "W"); c.vline(x + 2, RAIL, 3, "a"); c.hline(x, RAIL + 2, 3, "A");
  }
}

// ------------------------------------------------------------------ la constelación (la rama) y sus nodos
// Hasta dónde está encendida la rama (índice en TRACK).
function litTo(f) {
  if (f < T.land) return 0;
  if (f < T.arrive) return Math.max(2, Math.round(rideD(f)));
  if (f < T.out) return D_IN + 8;
  if (f < HIT) return Math.max(D_IN + 8, Math.round(retD(f)));
  if (f < 336) return NBR;
  if (f < 346) return Math.round(NBR * (1 - prog(f, 336, 346)));
  return 0;
}
// Estrellas de la constelación sobre el arco: una en la subida, tres en la rama y una en la bajada (ninguna bajo la losa).
const lastAbove = (() => { for (let i = NBR - 1; i > 0; i--) if (TRACK[i][1] <= 28) return i; return NBR - 1; })();
const NODES = [TRACK.findIndex((p) => p[1] <= 28), idxLane(104), idxLane(124), idxLane(146), lastAbove];
// Una estrella en cruz de 3 x 3: cuerpo c, brazos a.
function star3(c, x, y, cen, arm) {
  c.px(x - 1, y, arm); c.px(x + 1, y, arm); c.px(x, y - 1, arm); c.px(x, y + 1, arm); c.px(x, y, cen);
}
function track(c, f) {
  frieze(c, f);
  const lit = litTo(f), sh = Math.floor(f / 3);
  for (let i = 0; i < NBR; i++) {
    if (((i - sh) % 7 + 7) % 7 >= 3) continue;                 // guiones de 3 px cada 7: recorren el arco (21 cuadros por vuelta)
    const [x, y] = TRACK[i];
    c.px(x, y, i <= lit ? "l" : "A");
  }
  // estrellas de la constelación: se encienden cuando la luz pasa
  NODES.forEach((i) => {
    const [x, y] = TRACK[i], on = i <= lit && lit > 0;
    star3(c, x, y, on ? "y" : "a", on ? "l" : "A");
  });
  // nodos de la bifurcación y de la unión: dos estrellas más grandes pegadas al friso
  const forkOn = f >= T.land && f < 340, joinOn = f >= T_JOIN && f < 340;
  star3(c, FORK, RAIL - 1, forkOn ? (win(f, T.land, T.land + 4) ? "y" : "a") : "A", forkOn ? "l" : "2");
  star3(c, JOIN, RAIL - 1, joinOn ? (win(f, T_JOIN, T_JOIN + 4) ? "y" : "j") : "A", joinOn ? "j" : "2");
  // una pulsación apagada recorre la vía del Lead mientras trabaja libre: el Lead sigue en lo suyo
  if (f >= 120 && f < 276) {
    const p = (f - 120) % 40;
    if (p < 32) { const x = Math.round(FORK + 2 + (JOIN - FORK - 4) * p / 32); c.hline(x, RAIL, 2, "y"); }
  }
}
// La losa de mármol flotante del cangrejo (x 62 a 89, y 21 y 22), con las lámparas de prueba encima.
function slab(c) {
  c.hline(62, 21, 28, "e"); c.hline(62, 21, 14, "W"); c.px(62, 21, "W");
  c.hline(64, 22, 24, "a");
  for (let x = 65; x < 88; x += 3) c.px(x, 22, "A");              // dentículos
  c.px(63, 22, "A"); c.px(88, 22, "A"); c.px(89, 21, "a");
}

// ------------------------------------------------------------------ etiquetas
function labels(c, f) {
  const lead = win(f, T.card, T.land + 6) ? "X" : "2";
  c.text(12 - Math.floor(tw("LEAD") / 2), 23, "LEAD", lead);
  const born = f >= T.born && f < 338;
  c.text(CX - Math.floor(tw("SUBAGENT") / 2), 24, "SUBAGENT", born ? "B" : "2");
  const bgOn = f >= T.land && f < 340;
  c.text(130 - Math.floor(tw("BACKGROUND") / 2), 24, "BACKGROUND", bgOn ? "l" : "2");
  const done = f >= HIT + 2 && f < 336;
  c.text(POLE - Math.floor(tw("FINAL RESULT") / 2), 9, "FINAL RESULT", done ? "j" : "2");
}

// ------------------------------------------------------------------ la bandera FINAL RESULT, sobre una columna dórica pequeña
function flag(c, f) {
  const lit = f >= HIT + 2 && f < 338;
  const rise = f < 330 ? ease(prog(f, HIT + 2, HIT + 16)) : 1 - ease(prog(f, 330, 342));
  const yTop = Math.round(lerp(21, 16, rise));
  c.vline(POLE, 15, 12, "F");
  c.px(POLE, 14, f >= HIT + 2 && f < 336 ? "y" : "X");
  c.rect(POLE + 1, yTop, 10, 6, lit ? "j" : "2");
  if (lit) c.hline(POLE + 1, yTop, 10, rise >= 1 && f < HIT + 19 ? "y" : "j");
  if (rise >= 1 && f >= HIT + 16 && f < 332) paintGrid(c, CHECK5, POLE + 3, yTop + 1, { j: f < HIT + 18 ? "y" : "Q" });
  if (f >= HIT + 16 && f < HIT + 22) spark(c, POLE + 13, yTop, SP[f - HIT - 16], "y", "l");
  // la columna: ábaco, equino, fuste acanalado y basa (se tiñe de verde con el resultado)
  const g = lit;
  c.rect(POLE - 3, 27, 7, 1, g ? "T" : "W");                          // ábaco
  c.rect(POLE - 2, 28, 5, 1, g ? "j" : "e");                          // equino
  for (let y = 29; y < RAIL - 2; y++) {
    c.px(POLE - 2, y, g ? "T" : "W"); c.px(POLE - 1, y, g ? "j" : "e"); c.px(POLE, y, g ? "4" : "a");
    c.px(POLE + 1, y, g ? "j" : "e"); c.px(POLE + 2, y, g ? "4" : "A");
  }
  c.rect(POLE - 3, RAIL - 2, 7, 1, g ? "j" : "e");
  c.rect(POLE - 4, RAIL - 1, 9, 1, g ? "4" : "a");
}

// ------------------------------------------------------------------ el anillo (flecha circular), las pestañas y las lámparas
const RING = (() => {
  const pts = [];
  for (let a = 0; a < 360; a += 3) {
    const x = Math.round(RC[0] + 4 * Math.sin((a * Math.PI) / 180)), y = Math.round(RC[1] - 4 * Math.cos((a * Math.PI) / 180));
    if (!pts.some((p) => p[0] === x && p[1] === y)) pts.push([x, y, a]);
  }
  return pts;
})();
const angDiff = (a, b) => (((a - b) % 360) + 540) % 360 - 180;
// Estado de lo que muestra el trabajo en cada cuadro: fase de fallo/paso, cabeza de la flecha y pestañas.
function bench(f) {
  const s = stageOf(f);
  const failed = f >= FAIL && f < 186, passed = f >= PASS && f < T.reset + 6;
  let head = null;
  if (s >= 0) { const [a, b] = STG[s]; head = 120 * (s + ease((f - a) / (b - a))); }
  else if (f >= STG[4][1] && f < T.reset + 6) head = 600;
  return { s, failed, passed, head };
}
function ringDraw(c, f) {
  const B = bench(f), done = B.passed;
  const col = done ? "j" : B.failed && f < 186 ? "u" : null;
  for (const [x, y, a] of RING) {
    let k = "8";
    if (col && !(B.head !== null && !done && angDiff(B.head, a) > 0 && angDiff(B.head, a) < 125 && false)) k = col === "u" ? "u" : "j";
    if (!done && !B.failed && B.head !== null) {
      const d = angDiff(B.head, a);                      // d > 0: el punto va detrás de la cabeza
      const dd = ((B.head - a) % 360 + 360) % 360;
      k = dd < 6 ? "y" : dd < 40 ? "l" : dd < 110 ? "a" : "9";
      void d;
    } else if (B.failed && !done) {
      const dd = ((B.head - a) % 360 + 360) % 360;
      k = dd < 6 ? "y" : dd < 110 ? "u" : "9";
    }
    c.px(x, y, k);
  }
  // tres marcas de etapa (EDIT, TEST, FIX) sobre el anillo, a 0, 120 y 240 grados
  [0, 120, 240].forEach((a, i) => {
    const q = RING.reduce((m, p) => (Math.abs(angDiff(p[2], a)) < Math.abs(angDiff(m[2], a)) ? p : m));
    const on = B.s >= 0 && TABIDX[B.s] === i;
    c.px(q[0], q[1], on ? "y" : done ? "j" : "9");
  });
  // centro: punto que late, X roja al fallar, palomita al pasar
  if (done) paintGrid(c, CHECK5, RC[0] - 2, RC[1] - 2);
  else if (B.failed && f < 186) {
    const on = f < FAIL + 14 ? true : (f >> 1) % 2 === 0;
    if (on) [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([dx, dy]) => c.px(RC[0] + dx, RC[1] + dy, "u"));
  } else if (B.s >= 0) c.px(RC[0], RC[1], (f >> 2) % 2 ? "y" : "l");
  // la flecha: una punta que gira (un pixel afuera de la cabeza)
  if (B.head !== null && !done) {
    const a = ((B.head % 360) + 360) % 360, r = 5;
    const hx = Math.round(RC[0] + r * Math.sin((a * Math.PI) / 180)), hy = Math.round(RC[1] - r * Math.cos((a * Math.PI) / 180));
    if (hy >= 9) c.px(hx, hy, B.failed ? "u" : "y");
  }
}
const TABS = [["EDIT", 119, 19], ["TEST", 139, 19], ["FIX", 159, 15]];
function tabsDraw(c, f) {
  const B = bench(f), s = B.s;
  TABS.forEach(([name, x, w], i) => {
    // estado: 0 pendiente, 1 activa, 2 hecha, 3 falló
    let m = 0;
    if (f >= 114 && f < T.reset + 6) {
      if (s >= 0) {
        const cyc = s <= 2 ? 0 : 1, here = TABIDX[s];
        if (i === here) m = 1;
        else if (i < here) m = 2;
        if (i === 1 && cyc === 0 && B.failed && s >= 1) m = 3;            // TEST se queda en rojo mientras se corrige
        if (cyc === 0 && i === 1 && s === 1 && f < FAIL) m = 1;
        if (cyc === 0 && i === 1 && s === 2) m = 3;
        if (cyc === 0 && i === 2 && s < 2) m = 0;
        if (cyc === 1 && i > here) m = 0;
      } else if (f >= STG[4][1]) m = i <= 1 ? 2 : 0;
    }
    const hot = m === 3 && win(f, FAIL, FAIL + 4), cool = m === 2 && ((i === 1 && win(f, PASS, PASS + 4)));
    const fill = hot ? "u" : m === 0 ? "8" : m === 1 ? (two(f) % 4 < 2 ? "A" : "m") : m === 2 ? "Q" : "6";
    const ink = hot || m === 1 ? "y" : m === 0 ? "9" : m === 2 ? (cool ? "y" : "j") : "H";
    c.rect(x, 8, w, 7, fill);
    c.text(x + 2, 9, name, ink);
  });
}
// Tres lámparas de prueba a la izquierda del cangrejo: verdes al pasar, roja al fallar.
const LAMP_X = [63, 66, 69];
function lamps(c, f) {
  if (f < T.ready || f >= 337) return;
  LAMP_X.forEach((x, k) => {
    let st = 0, t0 = 0;
    if (f >= 142 && f < 186) { if (k < 2) { st = f >= 142 + 4 * k ? 1 : 0; t0 = 142 + 4 * k; } else if (f >= FAIL) { st = 2; t0 = FAIL; } }
    else if (f >= 186 && f < 206) st = 0;
    else if (f >= 206 && f < T.reset + 6) { st = f >= 206 + 4 * k ? 1 : 0; t0 = 206 + 4 * k; }
    const flash = st > 0 && f - t0 < 2;
    c.rect(x, 18, 2, 3, flash ? "y" : st === 1 ? "j" : st === 2 ? "u" : "8");
  });
}

// ------------------------------------------------------------------ el cangrejo (subagente de nivel medio)
const KROWS = {
  up: ["l.....l", "lmmmmml", ".mkmkm.", ".mmmmm.", "d.d.d.d"],
  upb: ["l.....l", "lmmmmml", ".mkmkm.", ".mmmmm.", ".d.d.d."],
  down: [".......", ".mmmmm.", "lmkmkml", "lmmmmml", ".d.d.d."],
  downb: [".......", ".mmmmm.", "lmkmkml", "lmmmmml", "d.d.d.d"],
  ball: [".......", "..mmm..", ".mmmmm.", ".mkmkm.", "..mmm.."],
  unf: [".......", ".......", ".mmmmm.", "lmkmkml", ".d.d.d."],
};
const KEYE = { up: 2, upb: 2, down: 2, downb: 2, ball: 3, unf: 3 };
function crabDraw(c, kind, eyes, x0, y0) {
  const rows = KROWS[kind], er = KEYE[kind];
  const cols = eyes === "left" ? [1, 3] : eyes === "right" ? [3, 5] : eyes === "blink" ? [] : [2, 4];
  rows.forEach((row, r) => [...row].forEach((ch, q) => {
    if (ch === ".") return;
    let k = ch === "l" ? "B" : ch === "d" ? "5" : "b";
    if (ch === "k" || (r === er && ch === "m" && cols.includes(q))) k = cols.includes(q) && r === er ? "k" : "b";
    if (r === er && ch === "k" && !cols.includes(q)) k = "b";
    c.px(x0 + q, y0 + r, k);
  }));
}
function crab(c, f) {
  if (f < T.born || f >= 340) return;
  const x0 = CX - 3;
  if (win(f, T.born, T.ball)) { spark(c, CX, 18, SP[f - T.born], "y", "l"); return; }
  if (f >= 337) { spark(c, CX, 18, SP[f - 337], "y", "l"); return; }
  const s = stageOf(f), leg = two(f) % 2;
  let kind = "up", eyes = "sq", dy = 0, dx = 0;
  if (win(f, T.ball, T.unfold)) { kind = "ball"; dy = [-2, -1][f - T.ball] ?? 0; }
  else if (win(f, T.unfold, T.ready)) kind = "unf";
  else if (win(f, T.ready, T.arrive)) { kind = "up"; eyes = "left"; }
  else if (win(f, T.arrive, 114)) { kind = leg ? "upb" : "up"; eyes = "sq"; }
  else if (s === 0 || s === 3) { kind = (f >> 1) % 2 ? "down" : "up"; eyes = "left"; }          // EDIT: golpetea con las pinzas
  else if (s === 2) { kind = (f >> 1) % 2 ? "downb" : "up"; eyes = "left"; }                  // FIX: igual, con prisa
  else if (s === 1 || s === 4) {
    kind = "up"; eyes = ["left", "sq", "right", "sq"][Math.floor((f - STG[s][0]) / 6) % 4];     // TEST: espera y mira las lámparas
    if (s === 1 && f >= FAIL) {
      const t = f - FAIL;
      kind = "down"; eyes = "sq";
      dx = [1, -1, 1, -1, 1, 0][t] ?? 0;
    }
    if (s === 4 && f >= PASS) { const t = f - PASS; kind = "up"; eyes = "sq"; dy = [-1, -1, 0, 0][t] ?? 0; }
  } else if (win(f, 226, 232)) { const t = f - 226; kind = t < 2 ? "unf" : "up"; eyes = "sq"; dy = t < 2 ? 0 : [-1, -1, -1, 0][t - 2] ?? 0; }          // salto de alegría
  else if (win(f, 232, 238)) { kind = "up"; eyes = "right"; }
  else if (f < 324) { kind = Math.floor(f / 8) % 2 ? "down" : "up"; eyes = "right"; }
  else if (f < 332) { kind = Math.floor(f / 4) % 2 ? "down" : "up"; eyes = "sq"; }
  else kind = "ball";
  // salto al ver llegar la bandera
  if (win(f, HIT + 6, HIT + 14)) { kind = "up"; dy = -Math.round(1.2 * Math.sin((Math.PI * (f - HIT - 6)) / 8)); }
  if (f > HIT + 2 && f < HIT + 6) { kind = "up"; eyes = "sq"; }
  if ((f + 70) % 119 < 3 && eyes !== "left" && eyes !== "right") eyes = "blink";
  if (kind === "ball" && f >= 332) dy = 0;
  // la gota de sudor cuando falla la prueba
  if (f >= FAIL + 2 && f < FAIL + 14) {
    const t = f - FAIL - 2;
    paintGrid(c, PROPS.sweat, 85, 15 + Math.min(1, two(t)), {});
  }
  crabDraw(c, kind, eyes, x0 + dx, 16 + dy);
  // chispitas al editar/corregir: salen de la pinza
  if (s === 0 || s === 2 || s === 3) {
    const t = (f - STG[s][0]) % 6, side = Math.floor((f - STG[s][0]) / 6) % 2 ? 1 : -1;
    if (t < 4) c.px(CX + side * 5, 15 - t, ["y", "O", "O", "D"][t]);
  }
}

// ------------------------------------------------------------------ el cuarto del Lead: un CRT beige de los 90
// Carcasa flamenco con luz arriba y a la izquierda, bisel hundido, pantalla oscura (x 22 a 31, y 28 a 34), mentón con botón y pie.
// Teclea tres líneas y las borra de abajo arriba, de modo que la pantalla termina como empieza (vacía, con el cursor del prompt): ciclo de
// 119 cuadros; 119 divide 357, el reloj del mundo, y no hay salto ni en el empalme ni al volver a empezar.
const TYPE = [[4, 8], [34, 5], [64, 7]], TYPE_DUR = 26, ERASE = [111, 105, 99], ERASE_DUR = 5;
function monitor(c, f) {
  c.rect(20, 26, 14, 10, "R");
  c.hline(20, 26, 14, "r"); c.vline(20, 26, 10, "r");
  c.vline(33, 27, 9, "q"); c.hline(21, 35, 13, "q");
  c.hline(21, 27, 12, "q"); c.vline(21, 27, 8, "q");               // bisel hundido
  c.rect(22, 28, 10, 7, "c");
  c.px(31, 35, "j"); c.hline(23, 35, 4, "R");                       // botón y mentón
  for (let k = 0; k < 3; k++) c.px(23 + 2 * k, 35, "q");            // rejilla
  c.rect(23, 36, 8, 1, "q");                                        // pie
  const m = f % 119, COL = ["x", "l", "X"];
  let cur = [23, 29];
  TYPE.forEach(([st, len], k) => {
    const typed = Math.max(0, Math.min(len, Math.floor(((m - st) / TYPE_DUR) * len)));
    const n = Math.ceil(typed * (1 - clamp01((m - ERASE[k]) / ERASE_DUR)));
    const y = 29 + 2 * k;
    if (n > 0) { c.hline(23, y, n, COL[k]); cur = [23 + n, y]; }
  });
  if (two(f) % 2) c.px(cur[0], cur[1], "y");
}

// ------------------------------------------------------------------ Clawd a media escala (12 x 8)
function halfPose(c, name, ax, feet, col) {
  const P = POSES[name], g = P.g, hw = Math.ceil(g[0].length / 2), hh = Math.ceil(g.length / 2);
  const x0 = Math.round(ax - P.cx / 2), y0 = feet - hh + 1;
  for (let r = 0; r < hh; r++)
    for (let q = 0; q < hw; q++) {
      let on = false;
      for (const [dr, dq] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const ch = g[2 * r + dr]?.[2 * q + dq]; if (ch && ch !== ".") on = true; }
      if (on) c.px(x0 + q, y0 + r, col);
    }
  return [x0, y0];
}
function halfEyes(c, name, x0, y0, style) {
  POSES[name].eyes.forEach(([col, row]) => {
    let ex = x0 + (col >> 1), ey = y0 + (row >> 1);
    if (style === "left") ex -= 1;
    if (style === "right") ex += 1;
    if (style === "up") ey -= 1;
    if (style === "blink") c.px(ex, ey + 1, "k");
    else if (style === "happy") c.px(ex, ey, "k");
    else c.rect(ex, ey, 1, 2, "k");
  });
}
function clawd(c, f) {
  let pose = (f >> 1) % 2 ? "type_l" : "type_r", eyes = "right", dy = 0;
  if (win(f, 16, 24) || win(f, 34, 42)) eyes = "up";                                    // mira la tarjeta y la ficha
  if (win(f, T.squat, T.throw)) { pose = "squash"; eyes = "up"; }
  else if (win(f, T.throw, T.shrink + 4)) { pose = "armsup"; eyes = "up"; dy = f < T.throw + 3 ? -1 : 0; }
  else if (win(f, T.shrink + 4, T.land)) { pose = "idle"; eyes = f < T.fly + 6 ? "up" : "right"; }
  else if (win(f, 150, 160) || win(f, 230, 240) || win(f, 282, HIT)) eyes = "up";        // un vistazo a lo que pasa arriba
  // el gran momento: la bandera sube y Clawd celebra
  if (win(f, HIT, HIT + 3)) { pose = "idle"; eyes = "up"; }
  else if (win(f, HIT + 3, HIT + 5)) { pose = "squash"; eyes = "sq"; }
  else if (win(f, HIT + 5, HIT + 17)) { pose = "armsup"; eyes = "happy"; dy = -Math.round(4 * Math.sin((Math.PI * (f - HIT - 5)) / 12)); }
  else if (win(f, HIT + 17, HIT + 19)) { pose = "squash"; eyes = "happy"; }
  else if (win(f, HIT + 19, 328)) { pose = "armsup"; eyes = "happy"; }
  else if (win(f, 328, 332)) { pose = "idle"; eyes = "sq"; }
  if (!(win(f, HIT + 3, 332)) && (f + 30) % 119 < 3) eyes = "blink";
  const [x0, y0] = halfPose(c, pose, 12, FEET + dy, "o");
  halfEyes(c, pose, x0, y0, eyes);
  if (win(f, T.squat, T.throw) && f === T.squat) spark(c, 12, 29, 1, "y", "l");
}

// ------------------------------------------------------------------ la escena del encargo (tarjeta, ficha, paquete)
function brief(c, f) {
  // la tarjeta TASK aparece sobre Clawd con una chispa, se escribe y se enciende la ficha del modelo
  if (win(f, T.card, T.shrink)) {
    const g = prog(f, T.card, T.card + 6), letters = Math.floor((f - T.text) / 4) + 1;
    fade(c, g, () => floppy(c, CARD.x, CARD.y, CARD.w, CARD.h, "out", Math.max(0, Math.min(4, letters))));
    if (win(f, T.card, T.card + 6)) spark(c, 14, 12, SP[f - T.card], "y", "l");
  }
  if (win(f, T.chip, T.shrink + 6)) {
    const g = f < T.shrink ? prog(f, T.chip, T.chip + 6) : 1 - prog(f, T.shrink, T.shrink + 6);
    fade(c, g, () => chip(c, 27, 12, false));
    if (win(f, T.chip, T.chip + 6)) spark(c, 27 + 47, 15, SP[f - T.chip], "y", "b");
  }
  // el disquete se encoge (21 x 13 a 9 x 7), centrado sobre Clawd
  if (win(f, T.shrink, T.fly)) {
    const k = f - T.shrink, ws = [17, 14, 11, 9, 9, 9][k], hs = [12, 10, 9, 7, 7, 7][k];
    packet(c, 14, 22, "out", hs, ws);
  }
  // vuelo en arco hasta la vía
  if (win(f, T.fly, T.land)) {
    for (let k = 5; k >= 1; k--) {
      const q = flyPos(f - k), u = [3, 3, 2, 2, 1][k - 1];
      c.px(q[0], q[1] - 3, ["a", "a", "A", "A", "m"][k - 1] ?? "A");
      void u;
    }
    const p = flyPos(f);
    packet(c, p[0], p[1], "out");
  }
  // aterriza en la bifurcación: se aplasta dos cuadros y suelta un aro
  if (win(f, T.land, T.land + 2)) packet(c, FORK, RAIL - 1, "out", [4, 5][f - T.land], [11, 10][f - T.land]);
  ripple(c, FORK, RAIL, f - T.land, 8, 12, ["y", "l", "a"]);
  // sube por la rama hasta el cangrejo
  if (win(f, T.ride, T.arrive)) {
    const d = rideD(f);
    for (let k = 6; k >= 1; k--) { const q = tp(d - k * 1.5); c.px(q[0], q[1] - 1, ["l", "l", "a", "a", "A", "A"][k - 1]); }
    const p = tp(d);
    packet(c, p[0], p[1], "out");
  }
  // lo recoge el cangrejo: el paquete se encoge hacia él
  if (win(f, T.arrive, T.absorbed)) {
    const k = f - T.arrive, p = tp(D_IN);
    packet(c, Math.round(lerp(p[0], CX, (k + 1) / 4)), LANE - k, "out", [7, 5, 4, 3][k], [9, 7, 5, 3][k]);
    if (k === 3) spark(c, CX, 18, 2, "y", "l");
  }
  // la ficha vuelve sobre el cangrejo
  if (f >= 112 && f < 338) {
    let g = 1;
    if (f < 118) g = prog(f, 112, 118);
    else if (f >= T.reset + 4) g = 1 - prog(f, T.reset + 4, T.reset + 10);
    fade(c, g, () => chip(c, CX - 23, 8, true));
  }
  // el resultado nace junto al cangrejo, corre por la rama y llega a la bandera
  if (win(f, 230, T.out)) {
    const k = f - 230, sz = [3, 5, 7, 9, 9, 9, 9][k];
    packet(c, 87, LANE, "res", [3, 4, 6, 7, 7, 7, 7][k], sz);
    if (k < 6) spark(c, 87, 16, SP[k], "y", "j");
  }
  if (win(f, T.out, HIT + 1)) {
    const d = retD(f);
    for (let k = 7; k >= 1; k--) { const q = tp(d - k * 1.6); c.px(q[0], q[1] - 3, ["j", "j", "j", "4", "4", "Q", "Q"][k - 1]); }
    const p = tp(d);
    packet(c, p[0], p[1], "res", 7);
  }
  // se funde con la vía principal: aro en el nodo de unión
  ripple(c, JOIN, RAIL, f - T_JOIN, 9, 13, ["y", "j", "4"]);
  // el golpe: el paquete golpea el mástil, aro y chispas; luego se funde con la bandera
  if (f >= HIT && f < HIT + 3) {
    const k = f - HIT;
    const p = tp(D_END);
    if (k === 0) packet(c, p[0], p[1], "res", 7);
    else packet(c, p[0] + 2, p[1], "res", [5, 3][k - 1], [7, 4][k - 1]);
    ripple(c, POLE, RAIL, k, 10, 14, ["y", "j", "4"]);
    if (k <= 2) { spark(c, POLE - 1, RAIL - 9, SP[k + 1], "y", "j"); spark(c, POLE + 6, RAIL - 12, SP[k + 1], "y", "l"); }
  } else ripple(c, POLE, RAIL, f - HIT, 10, 14, ["y", "j", "4"]);
}

// ------------------------------------------------------------------ barra de arriba
function hud(c, f, real) {
  const flash = real >= HIT && real < HIT + HOLD;
  const done = f >= HIT + 2 && f < 336;
  c.rect(0, 0, W, 7, flash ? "l" : "c");
  c.hline(0, 7, W, "F");
  c.text(3, 1, "> DELEGATED", flash ? "c" : done ? "j" : "x");
  // estado del Lead: ocupado mientras escribe el encargo, libre mientras el subagente trabaja
  const free = f >= 92 && f < 340;
  const lead = free ? "LEAD FREE" : "LEAD BUSY";
  if (free) { if (two(f) % 4 < 3) c.rect(58, 2, 3, 3, flash ? "c" : "j"); } else c.rect(58, 2, 3, 3, flash ? "c" : "O");
  c.text(63, 1, lead, flash ? "c" : free ? "j" : "O");
  // cuatro segmentos: encargo, entrega, segundo plano, resultado
  const cuts = [8, 60, 112, 232, HIT + 4];
  for (let i = 0; i < 4; i++) {
    const act = f >= cuts[i] && f < cuts[i + 1] && f < 336, dn = (f >= cuts[i + 1] && f < 336) || (i === 3 && f >= HIT + 4 && f < 336);
    const col = flash ? "c" : dn ? (done ? "j" : "a") : act ? (two(f) % 2 ? "y" : "l") : "1";
    c.rect(106 + i * 14, 2, 12, 3, col);
  }
  const cap = f < 8 ? "STANDBY" : f < 54 ? "WRITING BRIEF" : f < 112 ? "HANDING OFF" : f < 232 ? "IN BACKGROUND" : f < HIT + 2 ? "RETURNING" : f < 336 ? "MERGED" : "STANDBY";
  const capc = flash ? "c" : done ? "j" : f >= 112 && f < 232 ? "B" : "X";
  c.text(221 - tw(cap), 1, cap, capc);
}

// ------------------------------------------------------------------ sacudida corta y negativo del golpe
const SHK = [[2, 1], [-2, -1], [2, 0], [-1, 1], [1, -1], [-1, 0], [1, 1], [0, 0], [-1, 0], [0, 0]];
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 8; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 8; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(8, y - dy));
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}

// ------------------------------------------------------------------ la animación
anim("path_delegate", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  // hit-stop: el mundo se congela en el golpe y, al seguir, no salta
  const f = real < HIT ? real : real < HIT + HOLD ? HIT : real - (HOLD - 1);

  c.rect(0, 0, W, H, "z");
  stars(c, f);
  track(c, f);
  slab(c);
  labels(c, f);
  flag(c, f);
  ringDraw(c, f);
  tabsDraw(c, f);
  lamps(c, f);
  crab(c, f);
  monitor(c, f);
  clawd(c, f);
  brief(c, f);
  if (real >= HIT + HOLD && real < HIT + HOLD + 10) { const s = SHK[real - HIT - HOLD]; shake(c, s[0], s[1]); }
  hud(c, f, real);
  if (real >= HIT && real < HIT + NEG)                     // cuadros de impacto en negativo
    c.recolor({
      z: "W", c: "S", Z: "S", 1: "a", 8: "a", 9: "a", F: "L", X: "n", x: "n", y: "Z", l: "m", a: "M", A: "m", C: "Z", o: "c",
      b: "5", B: "n", 5: "B", j: "4", Q: "4", u: "6", O: "D", 4: "j", k: "k", m: "A", d: "5",
      W: "c", e: "n", 2: "v", 3: "2", L: "l", N: "S", T: "Q", G: "n", g: "2", q: "n", R: "n", r: "2", S: "n",
    });
})

sheet("path_delegate_sheet", ["path_delegate"], { pad: 0 })
