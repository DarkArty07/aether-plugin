include("kit.px.js")

// ------------------------------------------------------------------ goal_auto: «A · Autónomo»
// "No se te pregunta por lo trivial, y cada paso irreversible te llega en una sola lista."
// Tres cangrejos subagentes (verde t, azul b, rosa h) trabajan en computadoras beige de los 90 (CRT y teclado) sobre
// una repisa de mármol. De vez en cuando uno levanta un cuadro de diálogo diminuto con su "?" (TABS?, NAME?, ORDER?...)
// que flota hacia el dueño, arriba a la derecha, cuya ventana de los 90 muestra un busto de mármol dormido (con su z).
// Clawd, el Lead, hace de portero entre dos columnas dóricas, como un pórtico: salta, atrapa cada diálogo trivial en
// el filtro, chispa, lo vuelve una palomita (DECIDED FOR YOU) y esta cae de vuelta al cangrejo, que sigue trabajando.
// Cuando llega algo irreversible (disquetes con borde rojo, PUSH y DEPLOY) Clawd no pregunta: los lanza a UNA lista,
// un rollo de papiro que se desenrolla renglón por renglón. Lista lista, suena una campanita, el rollo se enrolla,
// el papiro vuela a la ventana del dueño y un cursor de ratón pulsa YES, un botón al estilo OK (el único hit-stop,
// con cuadro en negativo); la lista se vacía. La barra cuenta 0 ASKED durante el filtrado y 1 LIST al final.
// Cielo: nebulosa violeta con estrellas y un planeta con anillos, sin ciudad ni oficina. Luego todo vuelve al inicio.
// Lienzo de 160 x 105 px (GIF a 640 x 420), 360 cuadros a 30 fps (12 s), bucle sin corte: los movimientos de
// ambiente (teclas, parpadeo, zzz) tienen periodos que dividen 360 y el estado final iguala al inicial.
// Las poses van "en dos" (cada dibujo dura 2 cuadros); trayectorias, chispas y efectos a 30 fps.
const W = 160, H = 105, N = 360;
pal({
  q: "#3d1230", d: "#8a2740",                                // rojos oscuros: marcas sobre el papiro
  "(": "#f5e0dc", ")": "#f2cdcd", "$": "#fab387",            // plástico beige (rosewater, flamingo) y sombra del papiro (peach)
});

const GY = 93;                                              // línea de los pies (el estilóbato)
const CL = 96;                                              // centro de Clawd
const CLAW = 76;                                            // columna de su pinza izquierda (donde atrapa)
const TIERK = { t: ["t", "T", "4"], b: ["b", "B", "5"], h: ["h", "H", "6"] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;
const win = (f, a, b) => f >= a && f < b;
const prog = (f, a, b) => clamp01((f - a) / (b - a));
const rows = (pose) => POSES[pose].g.length;

// Pose propia de Clawd: la pinza izquierda en alto para atrapar (el resto como armsup).
POSES.catch_l = { cx: 12, eyes: POSES.armsup.eyes, g: [
  ...rep("oooo....................", 2), ...rep("oooooooooooooooooooooooo", 2),
  ...rep("....oooooooooooooooo....", 10), ...LEGS] };

// ------------------------------------------------------------------ guion (todo en cuadros)
const CRABS = [{ x: 12, tier: "t", off: 0, blink: 10 }, { x: 35, tier: "b", off: 3, blink: 40 }, { x: 58, tier: "h", off: 6, blink: 70 }];

// Diálogos triviales: quién pregunta, qué, cuándo sube (s) y cuándo lo atrapa Clawd (c).
const BUB = [
  { crab: 0, label: "TABS?", s: 4, c: 36 },
  { crab: 1, label: "NAME?", s: 22, c: 54 },
  { crab: 2, label: "SEMI?", s: 44, c: 72 },
  { crab: 0, label: "ORDER?", s: 74, c: 104 },
  { crab: 1, label: "LINT?", s: 88, c: 116 },
];
const FALL0 = 6, FALL1 = 20;                                 // la palomita espera 6 cuadros y cae hasta c + 20
const RESET = 336;                                          // contadores y subtítulo vuelven al inicio

// Disquetes irreversibles: de un cangrejo a Clawd, de Clawd a la lista (renglón row del papiro).
const CRATES = [
  { label: "PUSH", w: 19, crab: 2, row: 69, sq: 128, hoist: 132, fly0: 138, fly1: 150, toss0: 156, toss1: 170 },
  { label: "DEPLOY", w: 27, crab: 1, row: 76, sq: 150, hoist: 154, fly0: 162, fly1: 176, toss0: 182, toss1: 196 },
];
const FH = 12;                                              // alto de un disquete
for (const cr of CRATES) {
  cr.col0 = cr.toss1 + 2; cr.col1 = cr.col0 + 6;            // cae, se aplasta y se vuelve la marca roja del renglón
  cr.type0 = cr.col1; cr.type1 = cr.type0 + cr.label.length * 2;
}
const READY = CRATES[1].type1 + 2;                           // la lista está completa
const BELL0 = READY + 6, TK0 = BELL0 + 16, TK1 = TK0 + 16;  // la campana suena, el rollo vuela, llega al dueño
const WAKE = TK1;                                           // el dueño despierta; aparece YES
const BTN0 = WAKE + 6;
const CUR_S = BTN0 + 2, CUR_A = CUR_S + 22;                 // el cursor entra y llega al botón
const HIT = CUR_A + 14;                                     // el sí: hit-stop, negativo y sacudida
const HOLD = 4, NEG = 2;

const decidedN = (f) => (f >= RESET ? 0 : BUB.filter((b) => f >= b.c).length);
const listShown = (f) => f >= WAKE && f < RESET;                 // contador 1 LIST
const panelList = (f) => f >= WAKE && f < HIT + 22;              // la lista dentro de la ventana

// ------------------------------------------------------------------ fondo: nebulosa, planeta, pórtico, repisa
const HZ = GY;                                              // el cielo llega hasta el estilóbato
const SKYK = ["z", "n", "N", "m", "M", "v"];                // niveles de la nebulosa, de oscuro a claro
const COLS = [67, 120];                                     // las dos columnas dóricas que flanquean a Clawd
const BG = (() => {
  const bg = new Array(W * H).fill("z"), open = new Array(W * H).fill(false);
  const set = (x, y, k) => { if (x >= 0 && x < W && y >= 14 && y < H) { bg[y * W + x] = k; open[y * W + x] = false; } };
  const R = (x, y, w, h, k) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, k); };
  // nebulosa: una banda diagonal de ruido tramada con Bayer, más oscura abajo para que la acción se lea
  for (let y = 14; y < HZ; y++)
    for (let x = 0; x < W; x++) {
      const band = Math.exp(-(((y - (36 + 0.12 * (x - 80))) / 17) ** 2));
      const n = 0.6 * vnoise(x, y, 26) + 0.4 * vnoise(x + 50, y + 20, 9);
      let L = clamp01((n * 1.3 - 0.2) * band * 1.3) * 4.4;
      if (y > 46) L = Math.min(L, 1.7);
      let idx = Math.floor(L);
      if (bay(x, y) < L - idx) idx++;
      let k = SKYK[Math.min(idx, 5)];
      if (idx === 0 && bay(x, y) < clamp01((y - 50) / 40) * 0.7) k = "n";           // bruma violeta cerca del suelo
      bg[y * W + x] = k; open[y * W + x] = true;
    }
  // un planeta con anillos arriba a la izquierda: la mitad de atrás del anillo, la esfera y la de delante
  const PCX = 17, PCY = 28, PR = 6;
  const ring = (front) => {
    for (const [sc, col] of [[1, "V"], [0.8, "v"]])
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * TAU, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        set(Math.round(PCX + Math.cos(a) * 11.5 * sc + s * 0.5 * 2 * sc), Math.round(PCY + s * 2.9 * sc), col);
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
      set(x, y, PL[Math.min(i, 4)]);
    }
  ring(true);
  // estrellas grandes fijas, en cruz
  for (const [x, y] of [[40, 21], [6, 52], [90, 41]]) { set(x, y, "s"); set(x - 1, y, "a"); set(x + 1, y, "a"); set(x, y - 1, "a"); set(x, y + 1, "a"); }
  // el pórtico: dintel con cornisa y friso de triglifos sobre dos columnas dóricas acanaladas
  R(63, 49, 67, 1, "W"); R(63, 50, 67, 1, "e");
  R(65, 51, 63, 3, "3");
  for (let tx = 67; tx < 126; tx += 8) { R(tx, 51, 3, 3, "e"); R(tx + 1, 52, 1, 2, "L"); }   // triglifo: tres cuerpos y dos ranuras
  R(65, 54, 63, 1, "l");
  for (const cx of COLS) {
    R(cx - 1, 55, 8, 1, "W"); R(cx - 1, 56, 8, 1, "e");       // ábaco
    R(cx, 57, 6, 1, "3");                                      // equino
    for (let i = 0; i < 6; i++) R(cx + i, 58, 1, GY - 58 - 2, i === 0 ? "W" : i === 5 ? "L" : i % 2 ? "3" : "e");
    R(cx, 58, 6, 2, "3");                                      // el capitel proyecta su sombra sobre el fuste
    R(cx - 1, GY - 2, 8, 1, "W"); R(cx - 1, GY - 1, 8, 1, "3");   // basa
  }
  // el soporte del rollo: dos varillas de mármol y el rollo de arriba (el de abajo se desliza)
  for (const rx of [127, 159]) { R(rx, 57, 1, GY - 57, "e"); set(rx, 56, "W"); }
  R(128, 58, 31, 1, "("); R(128, 59, 31, 2, "O"); R(128, 61, 31, 1, "$");
  R(128, 58, 1, 4, "$"); R(158, 58, 1, 4, "$"); set(129, 60, "$"); set(157, 60, "$");
  // el suelo: estilóbato con su friso de greca
  R(0, GY, W, 1, "W");
  for (let x = 0; x < W; x++)
    for (let r = 0; r < 3; r++) {
      const line = ["XXXXXXX.", "X.....X.", "X.XXX.XX"][r][x & 7] === "X";
      set(x, GY + 1 + r, line ? "l" : "1");
    }
  return { bg, open };
})();
const STARS = (() => {
  const r = seeded(1717), out = [];
  while (out.length < 14) {
    const x = Math.floor(r() * W), y = 15 + Math.floor(r() * 40);
    if (!BG.open[y * W + x] || (x > 95 && y < 47) || (x > 125 && y > 54)) continue;
    out.push([x, y, 1 + Math.floor(r() * 2), Math.floor(r() * 90), [60, 90][out.length % 2]]);
  }
  return out;
})();
const STARC = [null, "2", "3", "W"];
function stage(c, f) {
  c.rect(0, 0, W, H, "z");
  for (let y = 14; y < GY + 4; y++) for (let x = 0; x < W; x++) c.px(x, y, BG.bg[y * W + x]);
  for (const [x, y, lv, ph, per] of STARS) c.px(x, y, STARC[Math.min(3, lv + (mod(f + ph, per) < 3 ? 1 : 0))]);
}
// La raya de puntos por donde sube cada pregunta: ahí está el filtro de Clawd. Cada captura la recorre con un destello.
function filterLine(c, f) {
  for (let y = 20; y < 48; y += 3) c.px(CLAW, y, "F");
  c.text(CLAW - 24, 17, "FILTER", "F");
  for (const b of BUB) {
    const t = f - b.c;
    if (t < 0 || t > 7) continue;
    const yf = 44 - t * 4;
    for (let y = yf; y < yf + 6; y++) if (y >= 20 && y < 48) c.px(CLAW, y, t < 3 ? "y" : "j");
  }
}

// ------------------------------------------------------------------ cangrejos
function crabState(i, f) {
  const K = CRABS[i], s = { pose: "idle", dy: 0, eyes: "sq", look: [0, 1], typing: true };
  const k = f + K.off;
  s.pose = (k >> 2) & 1 ? "type_r" : "type_l";                // teclea: cambia de mano cada 4 cuadros (periodo 8)
  s.eyes = mod(f + K.blink, 90) < 3 ? "blink" : "sq";
  for (const b of BUB.filter((q) => q.crab === i)) {
    const r = b.c + FALL1;
    s.look = [1, -1];
    if (win(f, b.s - 4, b.s)) { s.pose = "squash"; s.eyes = "sq"; s.look = [0, 0]; s.typing = false; }
    else if (win(f, b.s, b.s + 6)) { s.pose = "armsup"; s.eyes = "wide"; s.look = [0, 0]; s.typing = false; }
    else if (win(f, b.s + 6, r)) { s.pose = "idle"; s.eyes = "sq"; s.typing = false; }
    else if (win(f, r, r + 14)) {                             // llega la palomita: salta contento
      const u = (f - r) / 12;
      s.typing = false; s.look = [0, 0];
      if (f < r + 12) { s.pose = "armsup"; s.eyes = "happy"; s.dy = -Math.round(7 * 4 * u * (1 - u)); }
      else { s.pose = "squash"; s.eyes = "happy"; }
    } else s.look = [0, 1];
  }
  for (const cr of CRATES.filter((q) => q.crab === i)) {
    if (win(f, cr.sq, cr.hoist)) { s.pose = "squash"; s.eyes = "sq"; s.look = [0, 0]; s.typing = false; }
    else if (win(f, cr.hoist, cr.fly0 + 4)) { s.pose = "armsup"; s.eyes = "wide"; s.look = [0, 0]; s.typing = false; }
    else if (win(f, cr.fly0 + 4, cr.fly1 + 8)) { s.pose = "idle"; s.eyes = f < cr.fly1 ? "sq" : "happy"; s.look = [1, -1]; s.typing = false; }
  }
  return s;
}
function eyesAt(c, pose, x, y, style, look, body) {
  const [dx, dy] = look || [0, 0];
  for (const [ex, ey] of eyesOf(pose, x, y, 1, false)) {
    if (style === "blink") c.rect(ex + dx, ey + 1, 2, 1, "c");
    else if (style === "happy") { c.rect(ex, ey, 2, 1, "c"); c.px(ex, ey + 1, "c"); c.px(ex + 1, ey + 1, body); }
    else if (style === "wide") c.rect(ex + dx, ey - 1 + dy, 2, 3, "c");
    else c.rect(ex + dx, ey + dy, 2, 2, "c");
  }
}
function drawCrab(c, i, S) {
  const k = TIERK[CRABS[i].tier], cx = CRABS[i].x;
  const [x, y] = place(S.pose, false, cx, GY + S.dy, 1);
  drawPose(c, S.pose, x, y, 1, (px, py, r) => (r < 2 ? k[1] : r >= rows(S.pose) - 4 ? k[2] : k[0]));
  eyesAt(c, S.pose, x, y, S.eyes, S.look, k[0]);
  return [x, y];
}
// Computadora beige de los 90: monitor CRT (pantalla oscura con las líneas del cangrejo) y teclado, sobre la repisa.
function crt(c, i, f, S) {
  const cx = CRABS[i].x, k = TIERK[CRABS[i].tier], x0 = cx - 7, t = f >> 2;
  c.rect(x0, 81, 14, 7, ")"); c.hline(x0, 81, 14, "("); c.vline(x0, 81, 7, "("); c.hline(x0, 87, 14, "X"); c.vline(x0 + 13, 81, 7, "X");
  c.hline(x0 + 1, 82, 12, ")");
  c.rect(x0 + 2, 83, 10, 3, "c"); c.hline(x0 + 2, 83, 10, "X");                  // cristal hundido
  if (S.typing) {                                             // el cangrejo teclea: las líneas crecen y se reinician (periodo 24)
    const a = 1 + mod(t + CRABS[i].off, 6), b = 1 + mod(t + CRABS[i].off + 3, 6);
    c.hline(x0 + 3, 84, a, k[1]); c.hline(x0 + 3, 85, b, k[0]);
    if (mod(f >> 2, 2) === 0) c.px(x0 + 3 + b, 85, "w");     // cursor de texto
  } else { c.hline(x0 + 3, 84, 6, "F"); c.hline(x0 + 3, 85, 4, "F"); }
  c.px(x0 + 3, 86, "j"); c.hline(x0 + 8, 86, 3, "X");         // luz de encendido y botones
  c.hline(cx - 2, 88, 4, "X");                                // cuello
  c.rect(cx - 8, 89, 16, 1, "(");                             // teclado
  for (let xx = cx - 7; xx < cx + 8; xx += 2) c.px(xx, 89, ")");
  if (S.typing) c.px(cx - 7 + 2 * [0, 5, 2, 6][mod(f >> 1, 4)], 89, "y");   // la tecla que se pulsa
}
// La repisa de mármol bajo las computadoras: cubre las patas de los cangrejos; cornisa con dentículos.
function ledge(c) {
  c.rect(0, 90, 66, 1, "W");
  for (let x = 0; x < 66; x++) c.px(x, 91, x % 4 < 3 ? "e" : "L");
  c.rect(0, 92, 66, 1, "3");
  c.px(65, 91, "L"); c.px(65, 90, "e");
}

// ------------------------------------------------------------------ diálogos y palomitas
function bubbleAt(b, f) {                                    // ancla: centro bajo el diálogo
  const cx = CRABS[b.crab].x, u = clamp01((f - b.s) / (b.c - b.s));
  const [x, y] = bez([cx, 73], [lerp(cx, CLAW, 0.55), 46], [CLAW, 49], Math.pow(u, 1.2));
  return [x, y + (u < 0.9 ? Math.round(Math.sin(f / 4)) : 0), u];
}
// Un diálogo de los 90 en miniatura: marco con relieve, barra de título del color del nivel, la pregunta y su "?".
function drawBubble(c, b, f) {
  const [ax, ay, u] = bubbleAt(b, f), k = TIERK[CRABS[b.crab].tier];
  const grow = ease((f - b.s) / 5), full = b.label.length * 4 - 1 + 6;
  const bw = Math.max(9, Math.round(full * grow)), bh = 11, bx = ax - (bw >> 1), by = ay - 14;
  const flash = f === b.c;
  for (const back of [0.07, 0.14, 0.21]) {                   // estela de puntos
    if (u < 0.25 || f >= b.c) break;
    const [tx, ty] = bubbleAt(b, f - Math.round(back * (b.c - b.s)));
    c.px(tx, ty - 6, back < 0.1 ? "0" : "9");
  }
  c.rect(bx - 1, by - 1, bw + 2, bh + 2, "K");
  c.rect(bx, by, bw, bh, flash ? "y" : "g");
  if (!flash) {
    c.hline(bx, by, bw, "y"); c.vline(bx, by, bh, "y"); c.hline(bx, by + bh - 1, bw, "E"); c.vline(bx + bw - 1, by, bh, "E");
    c.rect(bx + 1, by + 1, bw - 2, 3, k[0]); c.hline(bx + 1, by + 1, bw - 2, k[1]);
    if (bw >= 12) c.rect(bx + bw - 4, by + 1, 2, 2, "g");     // la cajita de cerrar
    if (grow >= 1) c.text(bx + 3, by + 5, b.label, "c");
    else c.text(bx + (bw >> 1) - 1, by + 5, "?", "c");
  }
}
const CHECK = [
  "........j", ".......jj", "j.....jj.", "jj...jj..", ".jj.jj...", "..jjj....", "...j....."];
function drawDecided(c, b, f) {
  const t = f - b.c, cx = CRABS[b.crab].x;
  if (t < 2 || t >= FALL1) return;
  let x = 72, y = 37;
  if (t < FALL0) y -= [0, 1, 2, 1][t - 2] ;
  else {
    const u = ((t - FALL0) / (FALL1 - FALL0)) ** 2;
    [x, y] = bez([72, 37], [Math.round((72 + cx) / 2), 40], [cx - 4, 67], u);
  }
  paintGrid(c, CHECK, x + 1, y + 1, { j: "4" });
  paintGrid(c, CHECK, x, y);
  if (t >= FALL1 - 3) sparkle(c, x + 4, y + 3, 1);
  if (t < 17) {                                              // la etiqueta: DECIDED FOR YOU
    const txt = "DECIDED FOR YOU", n = Math.min(txt.length, (t - 1) * 5);
    c.rect(28, 25, 64, 9, "c"); c.box(28, 25, 64, 9, "4");
    c.text(30, 27, txt.slice(0, n), t > 14 ? "4" : "j");
  }
}
function sparkle(c, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  if (inside(x, y)) c.px(x, y, col);
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, arm);
}

// ------------------------------------------------------------------ disquetes irreversibles, lista de papiro, campana
const SLOTX = 143;                              // el centro del papiro, donde cae cada disquete
function crateRect(cr, f) {
  const w = cr.w, h = FH, cx = CRABS[cr.crab].x;
  const hc = [cx - (w >> 1), 66], hl = [CL - (w >> 1), 50], slot = [SLOTX - (w >> 1), cr.row - 3];
  if (f < cr.hoist) return null;
  if (f < cr.fly0) {                                         // sube de detrás de la computadora
    const u = ease(prog(f, cr.hoist, cr.hoist + 4));
    return { x: hc[0], y: Math.round(lerp(88, 66, u)), w, h, early: u < 1 };
  }
  if (f < cr.fly1) {
    const [x, y] = bez(hc, [Math.round((hc[0] + hl[0]) / 2), 32], hl, ease(prog(f, cr.fly0, cr.fly1)));
    return { x, y, w, h };
  }
  if (f < cr.toss0) return { x: hl[0], y: hl[1] + (f < cr.fly1 + 2 ? 2 : 0), w, h };
  if (f < cr.toss1) {
    const [x, y] = bez(hl, [Math.round((hl[0] + slot[0]) / 2) + 4, 40], slot, ease(prog(f, cr.toss0, cr.toss1)));
    return { x, y, w, h };
  }
  if (f < cr.col0) return { x: slot[0] - 1, y: slot[1] + 1, w: w + 2, h: h - 1 };
  if (f < cr.col1) {                                         // se encoge hasta la marca roja del renglón
    const u = ease(prog(f, cr.col0, cr.col1));
    return { x: Math.round(lerp(slot[0], 131, u)), y: Math.round(lerp(slot[1], cr.row, u)), w: Math.round(lerp(w, 2, u)), h: Math.round(lerp(h, 5, u)), tiny: true };
  }
  return null;
}
// Un disquete de 3,5": cuerpo lavanda con contorno, postigo metálico arriba, lengüeta roja de "protegido", franja de
// aviso y etiqueta blanca con su palabra.
function drawCrate(c, r, label) {
  const { x, y, w, h } = r;
  if (r.tiny && (w < 10 || h < 7)) { c.rect(x, y, w, h, "u"); if (w > 2) c.hline(x, y, w, "V"); return; }   // al final es la marca roja del renglón
  c.box(x, y, w, h, "K");
  c.rect(x + 1, y + 1, w - 2, h - 2, "3");
  c.hline(x + 1, y + 1, w - 2, "e"); c.vline(x + 1, y + 1, h - 2, "e");
  c.vline(x + w - 2, y + 2, h - 3, "L"); c.hline(x + 2, y + h - 2, w - 3, "L");
  if (h < 10) return;
  const ty = y + h - 6;                                      // la etiqueta ocupa las cinco filas de abajo
  c.rect(x + 2, ty, w - 4, 5, "y");
  for (let xx = 2; xx < w - 2; xx++) c.px(x + xx, ty - 1, (xx >> 1) & 1 ? "u" : "y");   // franja de aviso
  if (w >= label.length * 4 + 2) c.text(x + ((w - (label.length * 4 - 1)) >> 1), ty, label, "c");
  c.rect(x + 2, y + 2, 2, 3, "u");                           // lengüeta roja
  const sx = x + ((w - 7) >> 1) + 1;                         // postigo metálico
  c.rect(sx, y + 1, 7, 3, "G"); c.hline(sx, y + 1, 7, "g"); c.hline(sx, y + 3, 7, "U"); c.rect(sx + 4, y + 2, 2, 1, "c");
}
// El rollo de papiro: dos rodillos, el de arriba fijo; el de abajo baja al desenrollar. rt = fila del rodillo de abajo.
const RT0 = 63, RT1 = 75, RT2 = 82, RT3 = 89;
function rollTop(f) {
  let v = lerp(RT0, RT1, ease(prog(f, CRATES[0].toss0, CRATES[0].toss0 + 10)));
  if (f >= CRATES[1].toss0) v = lerp(RT1, RT2, ease(prog(f, CRATES[1].toss0, CRATES[1].toss0 + 10)));
  if (f >= READY - 4) v = lerp(RT2, RT3, ease(prog(f, READY - 4, READY + 3)));
  if (f >= TK0) v = lerp(RT3, RT0, ease(prog(f, TK0, TK0 + 14)));    // al salir la lista, el rollo se enrolla otra vez
  return Math.round(v);
}
function scroll(c, f) {
  const rt = rollTop(f);
  if (rt > 62) {
    c.rect(129, 62, 29, rt - 62, "O");                       // el papiro: fibras horizontales en tiras de caña
    c.vline(129, 62, rt - 62, "("); c.vline(157, 62, rt - 62, "$");
    for (let y = 64; y < rt; y += 4) for (let x = 131; x < 157; x++) if (((x + y * 3) % 8) < 3) c.px(x, y, "(");
    for (let x = 129; x < 158; x++) if (bay(x, 62) < 0.6) c.px(x, 62, "$");           // sombra bajo el rodillo de arriba
    for (let x = 129; x < 158; x++) if (rt > 63 && bay(x, rt - 1) < 0.5) c.px(x, rt - 1, "$");   // y sobre el de abajo
  }
  c.rect(128, rt, 31, 4, "O"); c.hline(128, rt, 31, "("); c.hline(128, rt + 3, 31, "$");   // el rodillo de abajo
  c.vline(128, rt, 4, "$"); c.vline(158, rt, 4, "$"); c.px(129, rt + 2, "$"); c.px(157, rt + 2, "$");
  if (rt <= RT0 + 1) {                                       // enrollado, va atado con una cinta roja
    c.rect(142, 58, 3, rt + 4 - 58, "u"); c.hline(142, 58, 3, "V"); c.vline(144, 59, rt + 3 - 58, "d");
  }
  c.clip((x, y) => y < rt, () => {
    if (rt >= 69) c.text(131, 63, "LIST", "2");
    for (const cr of CRATES) {
      if (f < cr.col1) continue;
      c.rect(131, cr.row, 2, 5, "d");
      const n = Math.min(cr.label.length, Math.floor((f - cr.type0 + 1) / 2));
      if (n > 0) c.text(134, cr.row, cr.label.slice(0, n), "c");
      if (f >= cr.type0 && f < cr.type1 && (f - cr.type0) % 2 === 0) c.rect(134 + n * 4, cr.row, 2, 5, "2");   // cursor de escritura
    }
    if (f >= READY && f < RESET) {
      const n = Math.min(5, Math.floor((f - READY + 1) * 1.5));
      c.text(134, 83, "READY".slice(0, n), "Q");
    }
  });
}
function bellGrid(sw) {
  const body = [".. O ..".replace(/ /g, ""), "..OOO..", ".OOOOO.", ".OOOOO.", "OOOOOOO", "OOOOOOO"];
  return body.map((r, i) => (sw === 0 ? r : i < 3 ? (sw > 0 ? "." + r.slice(0, 6) : r.slice(1) + ".") : r));
}
function drawBell(c, x, y, f, ringing) {
  const sw = ringing ? [0, 1, 0, -1][two(f) % 4] : 0;
  paintGrid(c, bellGrid(sw), x, y);
  paintGrid(c, [".y.", "yyy"], x + 2 - sw, y + 1 + 0, {});
  c.hline(x + 2, y + 6, 3, "O"); c.px(x + 3 + sw, y + 7, "y");
  if (ringing && f % 4 < 2) for (const d of [-1, 1]) { c.px(x + 3 + d * 6, y + 2, "y"); c.px(x + 3 + d * 5, y + 4, "y"); c.px(x + 3 + d * 5, y, "y"); }
}
// El papiro que vuela: un rollito atado con una cinta roja.
function drawTicket(c, x, y) {
  c.rect(x, y + 1, 13, 5, "O"); c.hline(x + 1, y, 11, "("); c.hline(x + 1, y + 6, 11, "$"); c.hline(x, y + 5, 13, "$");
  c.vline(x, y + 1, 5, "$"); c.vline(x + 12, y + 1, 5, "$"); c.px(x + 1, y + 3, "d"); c.px(x + 11, y + 3, "d");
  c.rect(x + 5, y, 3, 7, "u"); c.hline(x + 5, y, 3, "V"); c.px(x + 6, y + 7, "u"); c.px(x + 5, y + 8, "d");   // la cinta y su cola
}
const TKP = (f) => {                                          // el rollito sale del rollo y vuela a la ventana del dueño
  const u = ease(prog(f, TK0, TK1));
  return bez([137, 55], [154, 42], [124, 28], u);
};

// ------------------------------------------------------------------ Clawd
function clawd(f) {
  const s = { pose: "idle", dy: 0, eyes: "sq", flip: false, halo: null, bang: false, catchAt: null };
  const m = mod(f, 120);                                      // mira alrededor mientras espera (periodo 120)
  s.eyes = m >= 30 && m < 48 ? "left" : m >= 78 && m < 92 ? "up" : "sq";
  if (mod(f, 90) >= 40 && mod(f, 90) < 44) s.eyes = "blink";
  for (const b of BUB) if (win(f, b.s + 6, b.c - 7)) s.eyes = (f - b.s) / (b.c - b.s) < 0.6 ? "left" : "up";
  // salta a atrapar cada diálogo trivial (la ventana más cercana manda)
  let best = null;
  for (const b of BUB) {
    const t = f - (b.c - 7);
    if (t < 0 || t >= 14) continue;
    if (!best || Math.abs(f - b.c) < Math.abs(f - best.b.c)) best = { b, t };
  }
  if (best) {
    const { t } = best;
    if (t < 2) { s.pose = "squash"; s.eyes = "up"; }
    else if (t < 12) {
      const v = (t - 2) / 10;
      s.pose = "catch_l"; s.dy = -Math.round(10 * 4 * v * (1 - v)); s.eyes = t < 7 ? "up" : "happy"; s.catchAt = best.b;
    } else { s.pose = "squash"; s.eyes = "happy"; }
  }
  // disquetes irreversibles
  for (const cr of CRATES) {
    if (win(f, cr.hoist, cr.fly1)) { s.eyes = "left"; s.bang = f < cr.hoist + 14; }
    if (win(f, cr.fly1 - 3, cr.fly1)) { s.pose = "armsup"; s.eyes = "wide"; }
    if (win(f, cr.fly1, cr.fly1 + 2)) { s.pose = "squash"; s.eyes = "wide"; }
    if (win(f, cr.fly1 + 2, cr.toss0 - 3)) { s.pose = "armsup"; s.eyes = "right"; }
    if (win(f, cr.toss0 - 3, cr.toss0)) { s.pose = "squash"; s.eyes = "right"; }
    if (win(f, cr.toss0, cr.toss0 + 4)) { s.pose = "armsup"; s.eyes = "right"; }
    if (win(f, cr.toss0 + 4, cr.type1 + 2)) s.eyes = "right";
  }
  if (win(f, READY, READY + 12)) { s.eyes = "right"; s.dy = [0, -1, -1, 0, 0, -1][two(f - READY) % 6] ; if (two(f) % 3 === 0) s.eyes = "happy"; }
  if (win(f, TK0, WAKE + 14)) s.eyes = "up";
  if (win(f, CUR_S, HIT - 6)) s.eyes = "up";
  // el sí
  const t = f - HIT;
  if (t >= -6 && t < 0) { s.pose = "squash"; s.eyes = "wide"; }
  else if (t >= 0 && t < 4) { s.pose = "surprise"; s.eyes = "wide"; s.halo = "y"; }
  else if (t >= 4 && t < 18) {
    const u = (t - 4) / 14;
    s.pose = "armsup"; s.eyes = "happy"; s.dy = -Math.round(15 * u * (1 - u)); s.halo = t < 10 ? "y" : "a";
  } else if (t >= 18 && t < 22) { s.pose = "squash"; s.eyes = "happy"; }
  else if (t >= 22 && t < 40) { s.pose = "armsup"; s.eyes = "happy"; if (t < 34) s.halo = "a"; }
  else if (t >= 40 && t < 46) s.eyes = "happy";
  return s;
}
function halo(c, mask, col) {                                // contorno de 1 px alrededor de una máscara
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

// ------------------------------------------------------------------ la ventana del dueño (de los 90)
const WX = 98, WY = 16, WW = 57, WH = 30;
const BX = 123, BY = 37, BW = 27, BH = 7;                    // botón YES, al estilo OK
// Busto de mármol dormido en su plinto: el rostro cambia de dormido a sorprendido, contento y otra vez dormido.
function ownerFace(f) {
  if (win(f, WAKE, WAKE + 8)) return "wide";
  if (win(f, WAKE + 8, HIT)) return "open";
  if (win(f, HIT, HIT + 34)) return "happy";
  if (win(f, HIT + 34, HIT + 40)) return "settle";
  return "sleep";
}
function bust(c, f, face) {
  const asleep = face === "sleep" || face === "settle";
  const nod = asleep && mod(f, 60) >= 30 ? 1 : 0;              // cabecea dormido (periodo 60)
  const up = win(f, WAKE, WAKE + 4) ? -1 : 0;
  const dy = nod + up, hx = 109, hy = 29 + dy;
  // plinto, pecho con la toga y cuello
  c.rect(101, 40, 16, 4, "e"); c.hline(101, 40, 16, "W"); c.hline(101, 43, 16, "3"); c.vline(116, 41, 3, "3");
  c.poly([102, 40, 104, 36, 106, 35, 112, 35, 114, 36, 116, 40], "e");
  c.poly([102, 40, 104, 36, 105, 36, 105, 40], "W");
  c.poly([112, 35, 114, 36, 116, 40, 113, 40], "3");
  c.line(105, 39, 109, 36, "l", 1); c.line(108, 39, 111, 37, "l", 1);
  c.rect(107, 33 + dy, 4, 3 - dy, "e"); c.vline(110, 33 + dy, 3 - dy, "3");
  // cabeza: melena rizada, rostro con el lado en sombra
  c.ellipse(hx, hy, 4, 4, "e");
  c.vline(105, hy - 1, 3, "W"); c.vline(112, hy - 2, 4, "3"); c.vline(113, hy - 1, 2, "l");
  c.hline(106, hy - 4, 6, "l"); c.px(105, hy - 3, "l"); c.px(113, hy - 3, "L");
  for (let i = 0; i < 7; i++) c.px(106 + i, hy - 3, i % 2 ? "L" : "l");
  c.vline(109, hy, 3, "3");                                    // nariz
  if (face === "sleep" || face === "settle") {
    c.hline(106, hy, 2, "2"); c.hline(110, hy, 2, "2");        // ojos cerrados
    c.hline(108, hy + 3, 3, "l");
  } else if (face === "wide") {
    c.rect(106, hy - 1, 2, 2, "2"); c.rect(110, hy - 1, 2, 2, "2");
    c.hline(106, hy - 3, 2, "L"); c.hline(110, hy - 3, 2, "L");       // cejas alzadas
    c.rect(109, hy + 3, 2, 2, "2");
  } else if (face === "open") {
    c.rect(106, hy - 1, 2, 2, "2"); c.rect(110, hy - 1, 2, 2, "2");
    c.hline(108, hy + 3, 3, "l");
  } else {
    for (const ex of [106, 110]) { c.px(ex, hy, "2"); c.px(ex + 1, hy - 1, "2"); c.px(ex + 2, hy, "2"); }
    c.px(107, hy + 3, "2"); c.hline(108, hy + 4, 3, "2"); c.px(111, hy + 3, "2");
  }
  if (asleep) {                                                // zzz, periodo 120: una z pequeña que crece al subir
    for (let j = 0; j < 2; j++) {
      const u = mod(f + 60 * j, 120) / 120, zx = 114 + Math.round(u), zy = 30 - Math.round(u * 5);
      const col = u < 0.3 ? "3" : u < 0.6 ? "l" : "L";
      c.clip((x, y) => u < 0.75 || bay(x, y) < 1 - (u - 0.75) * 3, () => {
        if (u < 0.45) { c.hline(zx, zy + 1, 3, col); c.px(zx + 2, zy + 2, col); c.px(zx + 1, zy + 3, col); c.hline(zx, zy + 4, 3, col); }
        else c.text(zx, zy, "Z", col);
      });
    }
  }
}
function winBox(c, bx, by, kind) {                             // los tres botoncitos de la barra de título
  c.rect(bx, by, 4, 4, "g"); c.hline(bx, by, 4, "y"); c.vline(bx, by, 4, "y"); c.hline(bx, by + 3, 4, "E"); c.vline(bx + 3, by, 4, "E");
  if (kind === 0) c.hline(bx + 1, by + 2, 2, "c");
  else if (kind === 1) c.hline(bx + 1, by + 1, 2, "c");
  else { c.px(bx + 1, by + 1, "c"); c.px(bx + 2, by + 2, "c"); }
}
function sunk(c, x, y, w, h, fill) {                          // panel hundido
  c.rect(x, y, w, h, fill);
  c.hline(x, y, w, "E"); c.vline(x, y, h, "E"); c.hline(x, y + h - 1, w, "y"); c.vline(x + w - 1, y, h, "y");
}
function mini(c, x, y, body, label) {                          // un disquete de 5 x 5
  c.rect(x, y, 5, 5, body); c.rect(x + 1, y, 3, 2, "g"); c.px(x + 3, y, "c"); c.rect(x + 1, y + 3, 3, 2, label);
}
function ownerWin(c, f, hit) {
  const face = ownerFace(f);
  c.rect(WX, WY, WW, WH, "g");                                 // marco de ventana con relieve
  c.hline(WX, WY, WW, "y"); c.vline(WX, WY, WH, "y"); c.hline(WX, WY + WH - 1, WW, "E"); c.vline(WX + WW - 1, WY, WH, "E");
  const awake = win(f, WAKE, HIT + 30);
  c.rect(WX + 1, WY + 1, WW - 2, 7, hit ? "y" : awake ? "L" : "2");
  c.text(WX + 3, WY + 2, "OWNER", hit ? "c" : "y");
  let badge = "DND", bc = "3";
  if (win(f, WAKE, HIT)) { badge = "NEW"; bc = two(f) % 6 < 4 ? "O" : "3"; }
  else if (win(f, HIT, HIT + 30)) { badge = "OK"; bc = hit ? "c" : "j"; }
  c.text(WX + 25, WY + 2, badge, bc);
  [0, 1, 2].forEach((k) => winBox(c, 139 + k * 5, WY + 2, k));
  // el busto, en un panel hundido de fondo oscuro con un halo violeta
  sunk(c, 99, 24, 20, 21, "c");
  for (let y = 25; y < 44; y++) for (let x = 100; x < 118; x++) if (bay(x, y) < 0.5 * (1 - Math.hypot((x - 109) / 1.2, y - 32) / 11)) c.px(x, y, "1");
  bust(c, f, face);
  if (face === "wide") c.text(115, 25, "!", "O");
  // la bandeja de entrada
  sunk(c, 120, 24, 33, 21, "J");
  if (!panelList(f)) {
    c.text(124, 27, "INBOX", "L"); c.text(124, 34, "EMPTY", "D");
  } else {
    const keep = f < HIT + 12 ? 1 : 1 - prog(f, HIT + 12, HIT + 24);
    c.clip((x, y) => keep >= 1 || bay(x, y) < keep, () => {
      CRATES.forEach((cr, i) => {
        const t0 = WAKE + 1 + i * 4, n = clamp(Math.floor((f - t0) / 1.5), 0, cr.label.length);
        const y = 25 + i * 6, done = f >= HIT + 4 + i * 3;
        if (f >= t0) {
          mini(c, 122, y, done ? "4" : "3", done ? "T" : "u");
          c.text(128, y, cr.label.slice(0, n), done ? "j" : "x");
          if (done && f >= HIT + 4 + i * 3 + 2) c.hline(128, y + 2, cr.label.length * 4 - 1, "j");     // tachado: hecho
        }
      });
    });
  }
}
function yesButton(c, f) {
  if (f < BTN0 || f >= HIT + 26) return;
  const t = f - HIT, pulse = two(f) % 8 < 5, hover = f >= CUR_A && f < HIT - 6;
  const grow = ease(prog(f, BTN0, BTN0 + 4));
  let bx = BX, by = BY, bw = BW, bh = Math.max(1, Math.round(BH * grow));
  let face = "g", tl = "y", br = "E", txt = "c", label = "YES", off = 0;
  if (hover) face = "e";
  if (win(f, HIT - 6, HIT)) { bx += 1; bw -= 2; by += 1; bh = BH - 1; face = "G"; tl = "E"; br = "y"; off = 1; }
  else if (win(f, HIT, HIT + 4)) { bx -= 1; bw += 2; by += 1; bh = BH - 1; face = "y"; tl = "y"; br = "y"; off = 1; }
  else if (win(f, HIT + 4, HIT + 8)) { bx += 1; bw -= 2; by -= 1; bh = BH + 1; face = "e"; }
  else if (f >= HIT + 8) { face = "Q"; tl = "j"; br = "4"; txt = "j"; label = "OK"; }
  const draw = () => {
    c.rect(bx, by, bw, bh, face);
    if (bh > 2) { c.hline(bx, by, bw, tl); c.vline(bx, by, bh, tl); c.hline(bx, by + bh - 1, bw, br); c.vline(bx + bw - 1, by, bh, br); }
    if (bh >= BH - 1) c.text(BX + (label === "OK" ? 10 : 8) + off, by + 1 + (bh > BH ? 1 : 0), label, txt);
  };
  if (t >= 18) {                                                                    // se desvanece con dither
    const keep = 1 - prog(f, HIT + 18, HIT + 26);
    c.clip((x, y) => bay(x, y) < keep, draw);
    return;
  }
  if (f < HIT - 6 && !hover && f >= BTN0 + 4)                                       // brilla para llamar al dueño
    for (let y = by - 2; y < by + bh + 2; y++) for (let x = bx - 2; x < bx + bw + 2; x++) {
      if (x >= bx && x < bx + bw && y >= by && y < by + bh) continue;
      if (x < 121 || x > 151 || y < 25 || y > 43) continue;
      if (bay(x, y) < (pulse ? 0.4 : 0.15)) c.px(x, y, "L");
    }
  draw();
}

// ------------------------------------------------------------------ cursor y golpe
const TIP = [136, 39];
function cursorAt(f) {
  if (f < CUR_S || f >= HIT + 34) return null;
  if (f < CUR_A) { const u = ease((f - CUR_S) / (CUR_A - CUR_S)); const [x, y] = bez([170, 70], [160, 46], TIP, u); return { x, y, glide: u < 0.95 }; }
  if (f < HIT - 6) { const w = Math.round(Math.sin((f - CUR_A) / 2.5)); return { x: TIP[0] + w, y: TIP[1] }; }
  if (f < HIT) return { x: TIP[0] + 1, y: TIP[1] + 1, down: true };
  if (f < HIT + 10) return { x: TIP[0], y: TIP[1] };
  const u = ease((f - HIT - 10) / 24);
  const [x, y] = bez(TIP, [152, 62], [172, 74], u);
  return { x, y, glide: u > 0.05 && u < 0.95 };
}
function cursor(c, f) {
  const cp = cursorAt(f);
  if (!cp) return;
  if (cp.glide) for (const back of [2, 4, 6]) { const p = cursorAt(f - back); if (p && p.glide) c.px(p.x + 1, p.y + 1, back === 2 ? "3" : "2"); }
  paintGrid(c, PROPS.cursor, cp.x, cp.y, cp.down ? { y: "x" } : {});
}
function impact(c, f) {
  const t = f - HIT;
  if (t < 0 || t > 14) return;
  const cx = BX + BW / 2, cy = BY + 3;
  const inPane = (x, y) => x >= 121 && x <= 151 && y >= 25 && y <= 43;
  const onBtn = (x, y) => x >= BX - 1 && x < BX + BW + 1 && y >= BY - 1 && y < BY + BH + 1;
  if (t < 4)                                                 // destello seco durante el hit-stop
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 16; x <= cx + 16; x++)
      if (inPane(x, y) && !onBtn(x, y) && bay(x, y) < 1 - Math.hypot((x - cx) / 2, y - cy) / 8) c.px(x, y, "y");
  if (t < 13) {
    const rx = 15 + Math.min(t, 12) * 1.1, ry = 5 + t * 0.5;
    for (let k = 0, n = Math.ceil(rx * 6); k < n; k++) {
      const a = (k / n) * TAU, x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
      if (!inPane(x, y) || onBtn(x, y)) continue;
      c.px(x, y, t < 4 ? "y" : t < 8 ? "l" : "L");
    }
  }
  if (t >= 1 && t < 8) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5, r0 = 5 + t * 2;
    const x = Math.round(cx + Math.cos(a) * r0 * 1.4), y = Math.round(cy + Math.sin(a) * r0 * 0.7);
    if (inside(x, y) && y >= 17 && !onBtn(x, y)) c.px(x, y, t < 4 ? "y" : "l");
  }
}
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 16; y < 97; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 16; y < 97; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(96, Math.max(16, y - dy));
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}

// ------------------------------------------------------------------ barra y subtítulo
function hudBar(c, f) {
  const flash = f >= HIT && f < HIT + 4;
  c.rect(4, 3, 152, 11, flash ? "l" : "c"); c.box(4, 3, 152, 11, "F");
  c.text(7, 6, "> AUTONOMOUS", flash ? "c" : "w");
  const n = decidedN(f), bump = BUB.some((b) => win(f, b.c, b.c + 4)) && f < RESET;
  c.text(62, 6, `DECIDED ${n}`, flash ? "c" : bump ? "y" : "j");
  const listed = listShown(f), right = listed ? "1 LIST" : "0 ASKED";
  const rb = win(f, WAKE, WAKE + 4) || win(f, RESET, RESET + 4);
  c.text(153 - (right.length * 4 - 1), 6, right, flash ? "c" : rb ? "y" : listed ? "O" : "j");
}
const CAPS = [
  [0, "TRIVIAL? CLAWD DECIDES IT FOR YOU", "x"],
  [CRATES[0].sq, "IRREVERSIBLE? IT GOES ON ONE LIST", "O"],
  [READY, "THE LIST IS READY", "x"],
  [BELL0, "ONE BELL: IT REACHES THE OWNER", "x"],
  [CUR_S, "ONE YES FOR EVERYTHING", "w"],
  [HIT + 2, "0 QUESTIONS. 1 LIST. DONE", "j"],
  [RESET, "TRIVIAL? CLAWD DECIDES IT FOR YOU", "x"],
];
function caption(c, f) {
  let i = 0;
  CAPS.forEach((e, k) => { if (f >= e[0]) i = k; });
  const [t0, text, col0] = CAPS[i];
  const col = col0 === "w" && two(f) % 8 >= 5 ? "X" : col0;
  c.rect(4, 97, 152, 8, "c"); c.box(4, 97, 152, 8, "F");
  const n = i === 0 && f < 40 ? text.length : Math.min(text.length, Math.floor((f - t0 + 1) * 3));
  c.text(8, 99, text.slice(0, Math.max(0, n)), col);
}

// ------------------------------------------------------------------ la animación
anim("goal_auto", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HIT && f < HIT + HOLD) f = HIT;                  // hit-stop: el mundo se congela tras el sí
  const f2 = two(f) * 2;

  stage(c, f);
  filterLine(c, f);
  scroll(c, f);

  // cangrejos con sus computadoras (los disquetes que suben de detrás del monitor se pintan antes de él)
  const crabsS = CRABS.map((_, i) => crabState(i, f2));
  crabsS.forEach((S, i) => drawCrab(c, i, S));
  const early = CRATES.map((cr) => crateRect(cr, f)).map((r, i) => (r && r.early ? [r, CRATES[i]] : null));
  for (const e of early) if (e) c.clip((x, y) => y < 90, () => drawCrate(c, e[0], e[1].label));
  CRABS.forEach((_, i) => crt(c, i, f, crabsS[i]));
  ledge(c);
  crabsS.forEach((S, i) => {
    if (S.pose === "idle" && S.look[1] === -1) {             // sudor de espera: aún sin respuesta
      const ph = mod(f + i * 9, 40);
      if (ph >= 12 && ph < 26) paintGrid(c, ["..7..", ".777.", "77y77", "77777", ".777."].map((r) => r), CRABS[i].x + 8, 72 + ((ph - 12) >> 1) - 2);
    }
  });

  // diálogos que suben
  for (const b of BUB) {
    if (f >= b.s && f <= b.c) drawBubble(c, b, f);
    if (win(f, b.s, b.s + 4)) sparkle(c, CRABS[b.crab].x, 74, [1, 2, 2, 1][f - b.s], "y", "l");
  }
  for (const b of BUB) drawDecided(c, b, f);

  // Clawd
  const st = clawd(f2);
  const [x, y] = place(st.pose, st.flip, CL, GY + st.dy, 2);
  c.ellipse(CL, GY, 22 - Math.min(8, -st.dy), 2, "K");
  // disquetes que ya están en el aire o en sus pinzas
  for (const cr of CRATES) { const r = crateRect(cr, f); if (r && !r.early) drawCrate(c, r, cr.label); }
  const mask = drawPose(c, st.pose, x, y, 2, "o", st.flip);
  drawEyes(c, eyesOf(st.pose, x, y, 2, st.flip), 2, st.eyes, "k");
  if (st.halo) halo(c, mask, st.halo);
  if (st.bang) c.text(CL + 27, 52 + (two(f) % 2), "!", "u");
  for (const b of BUB) if (win(f, b.c, b.c + 6)) sparkle(c, CLAW, 46, [3, 3, 2, 2, 1, 1][f - b.c], "y", "l");
  for (const cr of CRATES) {
    if (win(f, cr.col1, cr.col1 + 4)) sparkle(c, 133, cr.row + 2, [1, 2, 2, 1][f - cr.col1], "2", "L");
    if (win(f, cr.fly1, cr.fly1 + 5)) sparkle(c, CL, 49, [1, 2, 3, 1, 1][f - cr.fly1] ?? 0, "y", "O");
  }

  ownerWin(c, f, f >= HIT && f < HIT + 4);
  yesButton(c, f);
  if (win(f, READY + 6, TK0)) drawBell(c, 146, 47, f, f >= BELL0);
  // campana y papiro que vuelan al dueño (por delante de la ventana)
  if (win(f, TK0, TK1)) {
    const [tx, ty] = TKP(f);
    for (const back of [2, 4, 6]) { const [px2, py2] = TKP(f - back); c.px(px2 + 6, py2 + 4, back === 2 ? "y" : "l"); }
    drawTicket(c, tx, ty);
    drawBell(c, tx + 3, ty - 8, f, true);
  }
  if (win(f, TK1, TK1 + 6)) sparkle(c, 131, 29, [3, 2, 2, 1, 1, 1][f - TK1], "y", "O");

  impact(c, f);
  caption(c, f);
  cursor(c, f);
  hudBar(c, f);
  if (real >= HIT + HOLD && real < HIT + HOLD + 6)
    shake(c, [2, -2, 1, -1, 1, 0][real - HIT - HOLD], [1, -1, 0, 1, 0, 0][real - HIT - HOLD]);
  if (real >= HIT && real < HIT + NEG)                     // cuadro de impacto en negativo
    c.recolor({ z: "W", Z: "e", K: "e", c: "e", 1: "3", J: "3", n: "l", N: "l", 2: "3", 8: "a", 9: "A", F: "2",
      W: "z", e: "1", 3: "2", l: "L", L: "n", y: "z", x: "N", X: "J", g: "1", D: "3", U: "3" });
})

sheet("goal_auto_sheet", ["goal_auto"], { pad: 0 })
