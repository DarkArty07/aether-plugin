// flujo.px.js: "Del encargo al resultado". 240 x 54 px de arte (GIF a x5 = 1200 x 270), 450 cuadros a 30 fps (15 s), bucle sin corte.
// El camino de un encargo, con los siete pasos de la sección de la página: intención, spec, plan, tareas, examen oculto, swarm y brief.
// Un cometa (el encargo) recorre una viga de mármol; en cada estación despierta una animación propia, y al irse la estación queda
// "hecha" (más tenue, con su palomita). Clawd (la pose del kit a media escala, 12 x 8) lo sigue y reacciona.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): un friso de templo en una noche de nebulosa violeta. Las siete
// estaciones son nichos con marco de mármol entre columnas dóricas; las fichas numeradas van sobre una greca; el riel es una viga de
// mármol y el token un cometa; los iconos son un pergamino, una tablilla de piedra, un plano en rollo, un disquete, un pergamino con
// sello de cera y los tres cangrejos; el brief es un monitor CRT beige de los 90 con una ventana y un botón al estilo OK.
// Leyenda de la historia (cuadros):
//   4 a 24     Clawd nace (bolita, se despliega) en la primera estación y nace el cometa; la barra de arriba es la de la v11
//   24 a 320   01 un pergamino se levanta y se voltea / 02 una tablilla se escribe / 03 un plano se dibuja / 04 una lista se marca en un disquete /
//              05 el pergamino del examen se enrolla y se sella con cera (el examen que los obreros no alcanzan) /
//              06 tres cangrejos de los tres niveles corren en paralelo / el cometa salta de estación en estación (12 cuadros)
//   320 a 408  07 el brief se abre (el CRT crece), se escribe, se llena el RADAR de cinco cuadros y llega el ratón al SÍ: pulsación con
//              hit-stop de 4 cuadros, el SÍ se marca, confeti, Clawd salta con los brazos arriba
//   408 a 440  la ventana se cierra, las estaciones vuelven a "pendiente" de izquierda a derecha, Clawd se hace bolita y se va
//   440 a 449  escena limpia = escena del cuadro 0: el último cuadro lleva al primero sin salto
// Mismo lenguaje que aether.px.js: los personajes van "en dos"; el cometa, los rastros, los haces, las chispas y los medidores
// se mueven en cada cuadro; el fondo está quieto (solo titilan unas estrellas, con un periodo que divide 450) y el movimiento se
// gasta en las estaciones (el GIF pesa poco).
include("kit.px.js")

const W = 240, H = 54, N = 450;

// Paleta propia: plástico beige de los 90 (flamenco y rosa té de Mocha). Redefine letras del kit que este archivo usa con otro sentido.
pal({ R: "#f2cdcd", r: "#f5e0dc", q: "#9399b2" });

// ------------------------------------------------------------------ plano (todo en px de arte)
//   y 0 a 8     barra de arriba            y 9 a 17    friso: greca y fichas numeradas
//   y 18 a 35   nichos (28 x 18)           y 36 a 43   paso de Clawd (pies en 43), entre columnas
//   y 44 a 46   viga de mármol (el riel)   y 48 a 52   etiquetas
const PITCH = 34, NS = 7;
const CXS = (i) => 18 + PITCH * i;                       // centro de cada estación
const CHIP_Y = 10, SY = 18, SH = 18, FEET = 43, RAIL = 45, LABEL_Y = 48;
const COLX = (k) => 32 + PITCH * (k - 1);                // x de la ranura (6 px) de la columna k, entre las estaciones k-1 y k (k = 0 y 7 son los bordes)

// ------------------------------------------------------------------ guion (se calcula una vez)
// A = el cometa llega y la estación despierta, D = el cometa se va y la estación queda hecha, R = vuelve a pendiente.
const HOP = 12;                                          // cuadros que dura el salto entre estaciones
const STN = [
  { name: "INTENT", dur: 28 }, { name: "SPEC", dur: 34 }, { name: "PLAN", dur: 34 }, { name: "TASKS", dur: 34 },
  { name: "EXAM", dur: 42 }, { name: "SWARM", dur: 52 }, { name: "BRIEF", dur: 94 },
];
{
  let a = 24;
  STN.forEach((s, i) => { s.A = a; s.D = a + s.dur; s.R = 416 + 3 * i; a = s.D + HOP; });
}
const B0 = STN[6].A;                                     // 320: llega el cometa al brief
const PRESS = B0 + 66, HOLD = 4;                         // la pulsación del SÍ y su hit-stop
const SHRINK = STN[6].D;                                 // 408: la ventana se cierra
const TOK0 = 10, TOKEND = 420;                           // nace el cometa / se disuelve

// ------------------------------------------------------------------ utilidades propias
const dith = (x, y, a) => bay(x, y) < a;
const mod = (a, n) => ((a % n) + n) % n;
// Chispa en cruz; p es el lienzo o una pluma de estación (los dos tienen px).
function spark(p, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  p.px(x, y, col);
  for (let k = 1; k < size; k++) for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) p.px(x + dx, y + dy, arm);
}
const SP = [1, 2, 3, 3, 2, 1];                            // tamaños de una chispa que nace y se apaga
// Halo punteado (Bayer) que se apaga hacia el borde.
function halo(c, cx, cy, rx, ry, col, k) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (!inside(x, y)) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d < 1 && bay(x, y) < (1 - d) * k) c.px(x, y, col);
    }
}

// ------------------------------------------------------------------ fondo (se calcula una vez; el fondo no se mueve)
// Un friso de templo bajo una franja de nebulosa: greca entre dos cornisas (y 9 a 17), columnas dóricas entre los nichos (y 17 a 43),
// la viga de mármol (y 44 a 46) y la nebulosa violeta con estrellas (y 36 a 53) a la vista entre las columnas.
const KEYP = ["*******.", "*.....*.", "*.***.*.", "*.*.*.*.", "*.*.***."];     // greca (meandro), 5 filas
const SHAFT = ["A", "a", "A", "A", "2", "1"];                                    // fuste de 6 columnas, luz por la izquierda
const BG = (() => {
  const bg = new Array(W * H).fill("z");
  const set = (x, y, k) => { if (x >= 0 && x < W && y >= 0 && y < H) bg[y * W + x] = k; };
  // nebulosa de Bayer en la franja de abajo: más densa junto a las columnas, casi apagada bajo las etiquetas para que se lean
  for (let y = 36; y < H; y++)
    for (let x = 0; x < W; x++) {
      const prof = y < 44 ? 1 : y < 47 ? 0.6 : 0.4;
      const v = 0.6 * vnoise(x + 17, y + 5, 30) + 0.4 * vnoise(x + 71, y + 13, 11);
      const t = clamp01((v - 0.45) / 0.3) * prof;
      if (t <= 0) continue;
      if (bay(x, y) < t * 0.8) set(x, y, "n");
      if (t > 0.45 && bay(x, y) < (t - 0.45) * 1.3) set(x, y, "N");
      if (t > 0.85 && y < 44 && bay(x, y) < 0.45) set(x, y, "m");
    }
  // friso: cornisa, fondo oscuro, greca y arquitrabe
  for (let x = 0; x < W; x++) {
    set(x, 9, "M"); set(x, 10, "m"); set(x, 16, "m"); set(x, 17, "M");
    for (let y = 11; y < 16; y++) set(x, y, "Z");
    for (let r = 0; r < 5; r++) if (KEYP[r][x & 7] === "*") set(x, 11 + r, "m");
  }
  // columnas dóricas: capitel (y 17 a 19), fuste acanalado (y 20 a 41), basa (y 42 y 43)
  for (let k = 0; k <= NS; k++) {
    const x0 = COLX(k);
    for (let q = 0; q < 6; q++) { set(x0 + q, 17, "a"); set(x0 + q, 18, "a"); set(x0 + q, 19, "A"); }
    for (let q = 1; q < 5; q++) for (let y = 20; y < 42; y++) set(x0 + q, y, SHAFT[q]);
    for (let q = 0; q < 6; q++) { set(x0 + q, 42, "a"); set(x0 + q, 43, "A"); }
  }
  // viga de mármol: cara iluminada, cara y sombra, con juntas entre bloques en medio de cada hueco
  for (let x = 0; x < W; x++) { set(x, 44, "A"); set(x, 45, "2"); set(x, 46, "1"); }
  for (let k = 0; k <= NS; k++) { const x = COLX(k) + 2; for (let y = 44; y < 47; y++) set(x, y, "z"); }
  return bg;
})();
// Estrellas fijas (solo se reparten donde se ve el cielo); la constelación va sobre el paso de Clawd.
const STARS = (() => {
  const r = seeded(11), out = [];
  const free = (x, y) => y < 44 || (y > 46 && [0, 1, 2, 3, 4, 5, 6].every((i) => Math.abs(x - CXS(i)) > 14));
  while (out.length < 20) {
    const x = 1 + Math.floor(r() * 238), y = 36 + Math.floor(r() * 18), ph = (out.length % 3) * 15;   // tres grupos que titilan a la vez: el GIF solo escribe la caja de lo que cambia
    const k = bg0(x, y);
    if (free(x, y) && (k === "z" || k === "n") && (y < 44 || y > 46)) out.push([x, y, r() < 0.25 ? 2 : 1, ph]);
  }
  return out;
})();
function bg0(x, y) { return BG[y * W + x]; }
const CONST = [[19, 38], [49, 41], [83, 38], [119, 40], [152, 37], [186, 41], [220, 38]];   // una constelación, con su línea punteada
const STARC = [null, "G", "3", "W"];
function sky(c, f) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = BG[y * W + x]; if (k !== "z") c.px(x, y, k); }
  for (let i = 1; i < CONST.length; i++) {
    const [x0, y0] = CONST[i - 1], [x1, y1] = CONST[i], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 2; k < n; k += 3) { const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n); if (bg0(x, y) !== "A" && y < 43 && !(bg0(x, y) === "e")) c.px(x, y, "2"); }
  }
  for (const [x, y] of CONST) { c.px(x, y, "3"); c.px(x - 1, y, "2"); c.px(x + 1, y, "2"); }
  for (const [x, y, lv, ph] of STARS) c.px(x, y, STARC[Math.min(3, lv + (mod(f + ph, 45) < 3 ? 1 : 0))]);
}

// ------------------------------------------------------------------ tonos de una estación
// Pendiente: todo se apaga a siluetas azul noche. Hecha: los colores vivos bajan un escalón.
const TONES = [
  { "*": "1", c: "c", z: "z", Z: "c", J: "J", K: "c", r: "J", R: "J", e: "J", 5: "J", M: "J", 8: "8", 1: "1", j: "1" },
  null,
  { y: "x", x: "X", X: "9", W: "3", e: "G", a: "U", A: "E", 2: "Y", M: "2", r: "G", R: "U", q: "E", l: "a", L: "A", f: "2", F: "9",
    3: "2", 5: "N", t: "4", T: "t", b: "5", B: "b", h: "6", H: "h", u: "6", V: "u", O: "D", D: "E", g: "G", i: "G", m: "1", I: "J" },
];
// Pluma: dibuja en coordenadas locales de la estación (0 a 25 x 0 a 15), con el tono pedido.
function pen(c, ox, oy, m) {
  const k = (col) => (m ? (m[col] ?? m["*"] ?? col) : col);
  return {
    px: (x, y, col) => c.px(ox + x, oy + y, k(col)),
    rect: (x, y, w, h, col) => c.rect(ox + x, oy + y, w, h, k(col)),
    box: (x, y, w, h, col) => c.box(ox + x, oy + y, w, h, k(col)),
    hline: (x, y, n, col) => c.hline(ox + x, oy + y, n, k(col)),
    vline: (x, y, n, col) => c.vline(ox + x, oy + y, n, k(col)),
    line: (x0, y0, x1, y1, col) => c.line(ox + x0, oy + y0, ox + x1, oy + y1, k(col)),
    circ: (x, y, r, col) => c.circ(ox + x, oy + y, r, k(col)),
    ring: (x, y, r, col) => c.ring(ox + x, oy + y, r, k(col)),
    ellipse: (x, y, rx, ry, col, ring) => c.ellipse(ox + x, oy + y, rx, ry, k(col), ring),
    text: (x, y, s, col) => c.text(ox + x, oy + y, s, k(col)),
    poly: (pts, col) => c.poly(pts.map((v, i) => v + (i % 2 ? oy : ox)), k(col)),
    grid: (g, x, y, map = {}) => g.forEach((row, r) => [...row].forEach((ch, q) => ch !== "." && c.px(ox + x + q, oy + y + r, k(map[ch] ?? ch)))),
  };
}

// ------------------------------------------------------------------ fase de cada estación
// [de, a, u]: 0 pendiente, 1 activa, 2 hecha; con u (0 a 1) cuando pasa de una a otra (se mezcla con puntos Bayer).
function phase(i, f) {
  const S = STN[i];
  if (f < S.A) return [0, 0, 0];
  if (f < S.D) return [1, 1, 0];
  if (f < S.D + 6) return [1, 2, (f - S.D) / 6];
  if (f < S.R) return [2, 2, 0];
  if (f < S.R + 5) return [2, 0, (f - S.R) / 5];
  return [0, 0, 0];
}
const modeOf = (i, f) => { const [a, b, u] = phase(i, f); return u < 0.5 ? a : b; };

// ------------------------------------------------------------------ 01 INTENT: un pergamino se levanta, se voltea y aterriza
// Un pergamino con dos varas en los extremos (r, R, q: plástico beige y sombra) y renglones de tinta violeta (A). 12 x 8 cuadros.
function scrollGrid(w, h, inkRows) {
  const rows = [];
  for (let r = 0; r < h; r++) {
    if (r === 0 || r === h - 1) { rows.push("qq" + ".".repeat(w - 4) + "qq"); continue; }
    const cells = [..."rR" + "r".repeat(w - 4) + "Rq"];
    for (const [rr, x0, x1] of inkRows) if (rr === r) for (let x = x0; x <= x1; x++) cells[x] = "A";
    rows.push(cells.join(""));
  }
  return rows;
}
const FRONT = scrollGrid(12, 8, [[2, 3, 8], [4, 3, 6]]);
const SQUASH = scrollGrid(14, 6, [[2, 3, 10]]);
// El reverso: el pergamino enrollado y atado con una cinta violeta (el encargo todavía cerrado).
const BACK = [
  "............",
  "..qqqqqqqq..",
  "qrrrrlLrrrrq",
  "qrrrrlLrrrrq",
  "qRRRlllLRRRq",
  "qRRRRlLRRRRq",
  "..qqqqqqqq..",
  "............",
];
function intentFn(p, t) {
  const lift = ease(t / 6) * (1 - ease((t - 20) / 3) ** 1.0);          // anticipación: sube antes de voltearse
  const th = Math.PI * ease((t - 7) / 14);
  const y = 6 - Math.round(3 * lift + 1.2 * Math.sin(th));
  // aterriza aplastado (dos cuadros) y suelta polvo
  if (t >= 21 && t < 23) p.grid(SQUASH, 6, 6 + 1);
  else {
    const w = Math.round(12 * Math.abs(Math.cos(th))), face = th < Math.PI / 2 ? BACK : FRONT;
    if (w <= 1) { p.vline(12, y, 8, "q"); p.vline(13, y, 8, "r"); }
    else {
      const x0 = 13 - Math.floor(w / 2), sweep = t >= 24 && t < 29 ? 3 + (t - 24) * 2.2 : -9;   // destello que recorre los renglones
      for (let j = 0; j < w; j++) {
        const sx = Math.min(11, Math.floor(((j + 0.5) * 12) / w));
        for (let r = 0; r < 8; r++) {
          const ch = face[r][sx];
          if (ch !== ".") p.px(x0 + j, y + r, ch === "A" && Math.abs(sx - sweep) < 1.6 ? "y" : ch);
        }
      }
    }
  }
  const d = t - 21;                                          // polvo del aterrizaje
  if (d >= 0 && d < 6)
    [[-1, -0.4], [1, -0.4], [2, -0.1], [-2, -0.1]].forEach(([vx, vy], k) => {
      const x = Math.round(13 + vx * (6 + d * 1.2)), yy = Math.round(14 + vy * d * 0.8);
      p.px(x, Math.min(15, yy), d < 3 ? "3" : d < 5 ? "2" : "1");
    });
}

// ------------------------------------------------------------------ 02 SPEC: una tablilla de piedra que se graba renglón por renglón
const SPEC = [[7, "2", 4], [10, "A", 6], [8, "A", 8], [10, "A", 10], [5, "A", 12]];   // largo, surco, y
function specFn(p, t) {
  p.rect(8, 1, 10, 1, "W");                                           // la tablilla, con la cabeza redondeada
  p.rect(6, 2, 14, 1, "e"); p.px(6, 2, "W"); p.px(19, 2, "a");
  p.rect(5, 3, 16, 12, "e");
  p.vline(5, 3, 12, "W"); p.vline(6, 3, 12, "W");                     // luz por la izquierda
  p.vline(20, 3, 12, "A"); p.vline(19, 3, 12, "a");                   // sombra por la derecha
  p.hline(5, 14, 16, "A"); p.hline(7, 13, 12, "e");
  p.px(17, 1, "a"); p.px(18, 2, "A");
  let n = Math.max(0, Math.floor((t - 3) * 1.6)), tip = null;
  for (const [len, ink, y] of SPEC) {
    const w = Math.min(len, n);
    if (w > 0) p.hline(8, y, w, ink);
    if (w > 0 && w < len) tip = [8 + w, y];
    n -= len;
    if (n <= 0) break;
  }
  if (tip) {                                                           // el cincel: punta ámbar y mango, y una chispa de piedra
    p.px(tip[0], tip[1], "O"); p.px(tip[0] + 1, tip[1] - 1, "D"); p.px(tip[0] + 2, tip[1] - 2, "D");
    if (t % 3 === 0) p.px(tip[0] - 1, tip[1] - 1, "y");
  }
}

// ------------------------------------------------------------------ 03 PLAN: un plano en rollo que se dibuja trazo a trazo
const BP = (() => {
  const pts = [];
  const seg = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    for (let k = 0; k <= n; k++) pts.push([x0 + sx * k, y0 + sy * k]);
  };
  seg(5, 5, 20, 5); seg(20, 6, 20, 13); seg(19, 13, 5, 13); seg(5, 12, 5, 6);      // muros
  seg(12, 6, 12, 9); seg(13, 9, 19, 9);                                              // muro interior
  seg(8, 13, 8, 11); seg(9, 11, 10, 11);                                             // puerta
  seg(5, 3, 20, 3); seg(5, 2, 5, 4); seg(20, 2, 20, 4);                              // cota
  return pts;
})();
function planFn(p, t) {
  p.rect(2, 1, 22, 14, "5");
  p.box(2, 1, 22, 14, "3");
  for (let x = 4; x < 22; x += 4) for (let y = 3; y < 14; y += 4) p.px(x, y, "m");     // cuadrícula del papel
  p.vline(0, 1, 14, "r"); p.vline(1, 0, 16, "R"); p.px(0, 0, "q"); p.px(0, 15, "q");  // las varas del rollo, a los lados
  p.vline(24, 0, 16, "R"); p.vline(25, 1, 14, "q"); p.px(25, 0, "q"); p.px(25, 15, "q");
  p.px(1, 0, "q"); p.px(1, 15, "q"); p.px(24, 0, "q"); p.px(24, 15, "q");
  const n = Math.max(0, Math.min(BP.length, Math.floor((t - 3) * 2.9)));
  for (let k = 0; k < n; k++) p.px(BP[k][0], BP[k][1], n - k <= 2 && n < BP.length ? "y" : "B");
  if (n > 0 && n < BP.length) { const [x, y] = BP[n - 1]; p.px(x + 1, y - 1, "l"); }
}

// ------------------------------------------------------------------ 04 TASKS: una lista en un disquete que se va marcando
const TASKY = [6, 9, 12], TASKW = [8, 6, 7], TICK = [6, 16, 26];
function tasksFn(p, t) {
  p.rect(5, 0, 16, 16, "M");                                          // el disquete de 3.5": carcasa, postigo metálico y etiqueta
  p.hline(5, 0, 16, "a"); p.vline(5, 0, 16, "a"); p.hline(5, 15, 16, "2"); p.vline(20, 0, 16, "2");
  p.rect(9, 0, 8, 4, "q"); p.hline(9, 0, 8, "g"); p.rect(14, 1, 2, 2, "c");
  p.rect(6, 5, 14, 10, "r");
  TASKY.forEach((y, k) => {
    const d = t - TICK[k], done = d >= 0;
    p.rect(8, y, 2, 2, done ? (d < 2 ? "O" : "4") : t >= TICK[k] - 6 && t < TICK[k] && (t >> 1) % 2 ? "O" : "A");
    p.hline(11, y, TASKW[k], done ? "q" : "0");
    p.hline(11, y + 1, Math.max(2, TASKW[k] - 3), "q");
    if (done) p.hline(10, y, TASKW[k] + 2, "4");                      // tachado
    if (d >= 0 && d < 6) spark(p, 3, y + 1, SP[d], "y", "l");
  });
}

// ------------------------------------------------------------------ 05 EXAM: el pergamino se enrolla y se sella con cera
// Dos varas se acercan hasta cerrar el rollo; baja un sello (el anillo del Lead), deja un sello de cera, y dos cintas lo atan.
const SEAL_PATH = [[22, -4], [21, 3], [14, 6]];
function examFn(p, t) {
  const close = ease((t - 3) / 13), h = Math.round(8 * (1 - close)), ty = Math.round(2 + 3 * close);
  const by = ty + 3 + h;
  if (h > 0) {                                                         // la hoja del examen, entre las varas
    p.rect(4, ty + 3, 18, h, "r");
    [[2, 12], [4, 9], [6, 11]].forEach(([dy, len]) => { if (dy < h - 0) p.hline(6, ty + 3 + dy, len, "A"); });
    p.px(19, ty + 3 + 1 + Math.min(h - 2, 5), "u");
  }
  if (close >= 1) {                                                    // cerrado: un solo rollo de seis filas
    p.rect(3, 5, 20, 6, "r"); p.hline(3, 7, 20, "R"); p.hline(3, 8, 20, "R"); p.rect(3, 9, 20, 2, "q");
    p.px(2, 6, "q"); p.px(2, 9, "q"); p.px(23, 6, "q"); p.px(23, 9, "q");
  } else {
    for (const y of [ty, by]) { p.rect(3, y, 20, 3, "r"); p.hline(3, y + 1, 20, "R"); p.hline(3, y + 2, 20, "q"); p.px(2, y + 1, "q"); p.px(23, y + 1, "q"); }
  }
  // el sello baja, se hunde un cuadro y la cera se extiende bajo él
  let sx = 14, sy = 6;
  if (t >= 17 && t < 26) { [sx, sy] = bez(SEAL_PATH[0], SEAL_PATH[1], SEAL_PATH[2], ease((t - 17) / 8)); }
  else if (t >= 26 && t < 34) { const u = ease((t - 29) / 5); sx = Math.round(lerp(14, 21, u)); sy = Math.round(lerp(6, -4, u)); if (t < 29) { sx = 14; sy = 6; } }
  const wax = t >= 26 ? Math.min(4, 1 + Math.floor((t - 26) / 1.5)) : 0;
  if (wax > 0 && t < 56) {
    p.circ(14, 9, wax, "6"); p.circ(13, 8, wax, "u");
    if (wax >= 3) { p.ring(13, 8, wax - 2, "6"); p.px(11, 6, t < 32 ? "y" : "V"); p.px(10, 7, "V"); }
    if (wax >= 4) { p.px(14, 13, "u"); p.px(14, 14, "6"); }          // una gota de cera
  }
  if (t >= 17 && t < 34 && !(t >= 31)) {
    p.rect(sx - 2, sy, 5, 2, "i"); p.hline(sx - 2, sy, 5, "W");       // la base del sello
    p.rect(sx - 1, sy - 4, 3, 4, "D"); p.px(sx - 1, sy - 4, "g");
  }
  if (t >= 26 && t < 29) { p.hline(8, 4, 12, "y"); }                  // el golpe del sello
  if (t >= 32) {                                                       // dos cintas atan el rollo
    const hb = Math.round(6 * ease((t - 32) / 3));
    p.rect(6, 8 - Math.floor(hb / 2) - (hb % 2 ? 0 : 0), 2, hb, "l"); p.rect(18, 8 - Math.floor(hb / 2), 2, hb, "l");
    p.vline(7, 8 - Math.floor(hb / 2), hb, "L"); p.vline(19, 8 - Math.floor(hb / 2), hb, "L");
    if (t >= 35 && t < 37) { p.vline(6, 4, 8, "y"); p.vline(19, 4, 8, "y"); }       // clanc
  }
  if (t >= 39 && t < 45) spark(p, 20, 3, SP[t - 39], "y", "l");
}

// ------------------------------------------------------------------ 06 SWARM: tres cangrejos de nivel distinto, en paralelo
const CRAB = [["l.....l", "lmmmmml", ".mkmkm.", ".mmmmm.", "m.m.m.m"], ["l.....l", "lmmmmml", ".mkmkm.", ".mmmmm.", ".m.m.m."]];
const LANEK = [{ m: "t", l: "T", d: "4" }, { m: "b", l: "B", d: "5" }, { m: "h", l: "H", d: "6" }];
const SW0 = [3, 5, 7], SWF = [28, 38, 49];
function swarmFn(p, t) {
  LANEK.forEach((K, i) => {
    const y0 = i * 5, u = clamp01((t - SW0[i]) / (SWF[i] - SW0[i])), x = Math.round(14 * (0.85 * u + 0.15 * ease(u)));
    const fin = t - SWF[i], running = t >= SW0[i] && fin < 0;
    for (let q = 0; q < 21; q += 2) p.px(q, y0 + 4, "m");             // la pista: una línea de constelación punteada
    p.hline(0, y0 + 4, Math.min(21, x + 4), K.d);                     // lo recorrido
    if (fin < 0) p.px(21, y0 + 3, t % 14 < 3 ? "W" : "3");            // la estrella de la meta
    const leg = running ? (t >> 1) % 2 : 0;
    let dy = 0;
    if (fin >= 0 && fin < 4) dy = fin < 2 ? -1 : 0;                   // saltito al llegar
    const map = { m: K.m, l: K.l };
    CRAB[leg].forEach((row, r) => [...row].forEach((ch, q) => ch !== "." && p.px(x + q, y0 + r + dy, map[ch] ?? ch)));
    if (t >= SW0[i] - 3 && t < SW0[i]) spark(p, 3, y0 + 2, [1, 2, 1][t - SW0[i] + 3], "y", "l");   // nacen con una chispa
    if (fin >= 0) {
      p.hline(0, y0 + 4, 22, fin < 2 ? "y" : K.m);
      PROPS.check.slice(1).forEach((row, r) => [...row.slice(3)].forEach((ch, q) => ch !== "." && p.px(22 + q, y0 + 1 + r, fin < 2 ? "y" : "j")));
    }
  });
}

// ------------------------------------------------------------------ 07 BRIEF: el icono de la estación, un CRT beige (el monitor grande se abre encima)
const RADC = ["u", "O", "b", "O", "h"];
function briefFn(p, t) {
  p.rect(3, 0, 20, 12, "R");                                          // el monitor: caja, cristal, cuello y pie
  p.hline(3, 0, 20, "r"); p.vline(3, 0, 12, "r"); p.hline(3, 11, 20, "q"); p.vline(22, 0, 12, "q");
  p.rect(5, 2, 16, 8, "c");
  p.hline(7, 4, 8, "x"); p.hline(7, 6, 6, "X");
  RADC.forEach((k, q) => p.rect(7 + q * 3, 8, 2, 2, k));
  p.px(20, 11, "j");
  p.rect(10, 12, 6, 2, "R"); p.hline(10, 13, 6, "q");
  p.rect(7, 14, 12, 2, "R"); p.hline(7, 14, 12, "r"); p.hline(7, 15, 12, "q");
}

STN[0].fn = intentFn; STN[1].fn = specFn; STN[2].fn = planFn; STN[3].fn = tasksFn;
STN[4].fn = examFn; STN[5].fn = swarmFn; STN[6].fn = briefFn;

// ------------------------------------------------------------------ estaciones (nichos), fichas, etiquetas, viga
function badge(p) {                                                    // la palomita de "hecha"
  p.rect(19, 0, 7, 6, "Q");
  p.grid(PROPS.check.slice(0, 5), 19, 1, { y: "j" });
}
// El marco del nicho: mármol con luz arriba y a la izquierda, y una clave en el dintel. Se dibuja antes del contenido.
function nicheFrame(c, x, m, t) {
  const hi = m === 0 ? "m" : m === 1 ? (t < 3 ? "y" : "W") : "A", lo = m === 0 ? "J" : m === 1 ? "a" : "m";
  c.box(x, SY, 28, SH, lo);
  c.hline(x, SY, 28, hi); c.vline(x, SY, SH, hi);
  c.hline(x + 11, SY, 6, hi); c.hline(x + 12, SY + 1, 4, hi);        // la clave del arco
  c.px(x + 27, SY, lo);
}
function stage(c, i, f) {
  const S = STN[i], cx = CXS(i), x = cx - 14, ox = cx - 13, oy = SY + 1;
  const [from, to, u] = phase(i, f), t = f - S.A;
  const tt = (m) => (m === 0 ? -1 : m === 1 ? t : 9999);
  const bg = (m) => (m === 1 ? "Z" : "c");
  const m = u < 0.5 ? from : to;
  c.rect(x, SY, 28, SH, bg(m));
  // la estación activa respira: un resplandor punteado de 2 px dentro del nicho, que se enciende al despertar y late después
  if (m === 1 || (from === 1 && u > 0)) {
    const k = (m === 1 ? 0.55 + 0.25 * Math.sin(Math.floor(t / 4) * 0.8) : 0.5 * (1 - u)) * (t < 6 ? 1.2 : 0.75);
    for (let yy = oy; yy < oy + 16; yy++)
      for (let xx = ox; xx < ox + 26; xx++) {
        const d = Math.min(xx - ox, ox + 25 - xx, yy - oy, oy + 15 - yy);
        if (d <= 1 && dith(xx, yy, d === 0 ? k * 0.8 : k * 0.35)) c.px(xx, yy, "N");
      }
  }
  nicheFrame(c, x, m, t);
  const region = (px, py) => px >= ox && px < ox + 26 && py >= oy && py < oy + 16;
  const draw = (md) => c.clip(region, () => { const p = pen(c, ox, oy, TONES[md]); S.fn(p, tt(md)); if (md === 2) badge(p); });
  if (from === to) draw(from);
  else {
    c.clip((px, py) => region(px, py) && bay(px, py) >= u, () => { const p = pen(c, ox, oy, TONES[from]); S.fn(p, tt(from)); });
    c.clip((px, py) => region(px, py) && bay(px, py) < u, () => { const p = pen(c, ox, oy, TONES[to]); S.fn(p, tt(to)); badge(p); });
  }
  // al despertar, un barrido sube desde la viga: la energía del cometa entra por abajo
  if (m === 1 && t >= 0 && t < 7) {
    const y = oy + 15 - Math.round(15 * ease(t / 7));
    for (let q = 0; q < 26; q++) if (dith(ox + q, y, 0.7)) c.px(ox + q, y, "l");
  }
}
function chip(c, i, f) {                                               // una ficha de mármol numerada sobre la greca
  const m = modeOf(i, f), cx = CXS(i), t = f - STN[i].A;
  const y = CHIP_Y - (m === 1 && t >= 0 && t < 3 ? 1 : 0);
  const fill = m === 0 ? "J" : m === 1 ? "A" : "Q", ink = m === 0 ? "D" : m === 1 ? "y" : "j";
  c.rect(cx - 5, CHIP_Y, 11, 7, "c");                                  // el fondo oscuro, para que la ficha no se mezcle con la greca
  c.rect(cx - 4, y, 9, 7, fill);
  c.hline(cx - 4, y, 9, m === 0 ? "m" : m === 1 ? "a" : "4");
  c.text(cx - 3, y + 1, String(i + 1).padStart(2, "0"), ink);
}
function label(c, i, f) {
  const m = modeOf(i, f), n = STN[i].name.length;
  c.text(CXS(i) - Math.floor((4 * n - 1) / 2), LABEL_Y, STN[i].name, m === 0 ? "0" : m === 1 ? "y" : "X");
}
// La viga: lo recorrido por el cometa se enciende (mármol lavanda), y en cada estación hay un remache con forma de rosetón.
function rail(c, f) {
  const p = tokPos(f);
  const xs = f < 416 ? 0 : Math.min(239, Math.round(4 + (f - 416) * 11.5));
  if (p && p.x > xs) {
    c.hline(xs, 44, p.x - xs + 1, "a"); c.hline(xs, 45, p.x - xs + 1, "A"); c.hline(xs, 46, p.x - xs + 1, "2");
    for (let k = 0; k <= NS; k++) { const jx = COLX(k) + 2; if (jx >= xs && jx <= p.x) for (let y = 44; y < 47; y++) c.px(jx, y, "m"); }
  }
  STN.forEach((S, i) => {
    const m = modeOf(i, f), cx = CXS(i), a = m === 0 ? "A" : m === 1 ? "y" : "a", b = m === 0 ? "2" : m === 1 ? "l" : "A";
    c.rect(cx - 1, 44, 3, 3, a); c.px(cx - 2, 45, b); c.px(cx + 2, 45, b);
  });
}

// ------------------------------------------------------------------ el cometa (el token)
function tokPos(f) {
  if (f < TOK0) return null;
  let x = CXS(0), y = RAIL, moving = false;
  for (let i = 0; i < 6; i++) {
    const s = STN[i];
    if (f >= s.D - 3 && f < s.D) x = CXS(i) - Math.round(2 * ease((f - (s.D - 3)) / 3));          // anticipación: se echa atrás
    else if (f >= s.D && f < s.D + HOP) {
      const u = (f - s.D) / HOP, dash = 0.35 * ease(u) + 0.65 * (1 - (1 - u) ** 3);                // sale con prisa y frena
      x = Math.round(lerp(CXS(i) - 2, CXS(i + 1), dash));
      y = RAIL - Math.round(3 * Math.sin(Math.PI * u));
      moving = true;
    } else if (f >= s.D + HOP) x = CXS(i + 1);
  }
  return { x, y, moving };
}
const TRAIL = ["l", "l", "a", "a", "A", "A", "m"];
function token(c, f) {
  const p = tokPos(f);
  if (!p) return;
  // radio del cuerpo: nace en 3 cuadros y se disuelve al final
  let r = f < TOK0 + 2 ? 0 : f < TOK0 + 4 ? 1 : 2;
  if (f >= TOKEND) r = f < TOKEND + 3 ? 1 : 0;
  if (r === 0) return;
  for (let k = 1; k <= 7; k++) {                                                                  // cola del cometa
    const q = tokPos(f - k), q0 = tokPos(f - k + 1);
    if (!q || (q.x === q0.x && q.y === q0.y)) continue;
    c.line(q0.x, q0.y, q.x, q.y, TRAIL[k - 1], k <= 3 ? 2 : 1);
    // polvo de la cola: motas sueltas que se quedan atrás
    if (k % 2 === 0) { const dy = Math.round((hash(q.x, f, k) - 0.5) * 6); if (inside(q.x, q.y + dy)) c.px(q.x, q.y + dy, k < 5 ? "S" : "a"); }
  }
  const pulse = Math.round(1.5 * Math.sin(f / 4));
  halo(c, p.x, p.y, 8 + pulse + (p.moving ? 2 : 0), 5 + (pulse > 0 ? 1 : 0), p.moving ? "a" : "A", p.moving ? 0.75 : 0.55);
  // aterrizaje: se aplasta dos cuadros y suelta un anillo
  const land = STN.findIndex((s, i) => i > 0 && f - s.A >= 0 && f - s.A < 7), lt = land < 0 ? -1 : f - STN[land].A;
  if (lt >= 0 && lt < 7) c.ellipse(p.x, RAIL, 3 + lt * 2, 1 + Math.round(lt * 0.5), lt < 2 ? "y" : lt < 4 ? "l" : "a", true);
  if (lt === 0 || lt === 1) {
    c.ellipse(p.x, p.y + 1, 3, lt === 0 ? 1 : 2, "l");
    c.hline(p.x - 1, p.y + 1, 3, "y");
    return;
  }
  c.circ(p.x, p.y, r, "l");
  if (r === 2) { c.px(p.x, p.y, "y"); c.px(p.x - 1, p.y, "y"); c.px(p.x + 1, p.y, "y"); c.px(p.x, p.y - 1, "y"); c.px(p.x, p.y + 1, "y"); }
  else c.px(p.x, p.y, "y");
  if (f >= TOK0 && f < TOK0 + 6) spark(c, p.x, p.y, SP[f - TOK0], "y", "l");
  if (f >= TOKEND && f < TOKEND + 6) spark(c, p.x, p.y, SP[f - TOKEND], "y", "l");
}
// El haz que sube del cometa a la estación mientras la alimenta.
function beam(c, f) {
  STN.forEach((S, i) => {
    const t = f - S.A;
    if (t < 0 || f >= S.D) return;
    const cx = CXS(i);
    if (t < 9) {
      for (let y = SY + SH; y < RAIL - 2; y++)
        for (let dx = -1; dx <= 1; dx++)
          if (dith(cx + dx, y, (1 - t / 9) * (0.4 + 0.6 * ((y - 36) / 7)))) c.px(cx + dx, y, dx === 0 ? "l" : "a");
    } else {
      const ph = (t - 9) % 9, y = RAIL - 3 - ph;                    // un paquete de energía que sube cada 9 cuadros
      if (y >= SY + SH) { c.rect(cx, y, 1, 2, "l"); if (y + 2 < RAIL - 2) c.px(cx, y + 2, "a"); }
    }
  });
}

// ------------------------------------------------------------------ Clawd (la pose del kit a media escala: 12 x 8)
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
  POSES[name].eyes.forEach(([col, row], k) => {
    let ex = x0 + (col >> 1), ey = y0 + (row >> 1);
    if (style === "left") ex -= 1;
    if (style === "right") ex += 1;
    if (style === "up") ey -= 1;
    if (style === "blink") c.px(ex, ey + 1, "k");
    else if (style === "happy") c.px(ex, ey, "k");
    else c.rect(ex, ey, 1, 2, "k");
  });
}
const WALK = ["walk_a", "idle", "walk_b", "idle"];
// Dónde está Clawd: espera junto al nodo, camina cuando el cometa se va y llega unos cuadros después.
function clawdX(f) {
  let x = CXS(0) - 9;
  for (let i = 0; i < 6; i++) {
    const u = (f - (STN[i].D + 3)) / 18;
    if (u >= 1) x = CXS(i + 1) - 9;
    else if (u > 0) { x = Math.round(lerp(CXS(i) - 9, CXS(i + 1) - 9, ease(u))); break; }
  }
  return x;
}
function clawd(c, f) {
  if (f < 4 || f >= 432) return;
  const x = clawdX(f), walking = clawdX(f) !== clawdX(f - 1) || clawdX(f + 1) !== clawdX(f);
  let pose = "idle", eyes = "sq", dy = 0;
  const live = STN.findIndex((s) => f >= s.A && f < s.D), t6 = f - B0;
  if (f < 10) { pose = "ball"; eyes = "sq"; }
  else if (f < 14) { pose = "unfold"; eyes = "sq"; }
  else if (walking) { pose = WALK[two(f) % 4]; dy = pose === "idle" ? 0 : -1; eyes = "sq"; }
  else if (live >= 0) {
    eyes = live === 5 ? ["left", "up", "right", "up"][Math.floor((f - STN[5].A) / 9) % 4] : "up";
    if (live === 6 && t6 >= 62) eyes = "sq";
    const left = STN[live].D - f;                                      // antes de irse el cometa, sonríe y da un saltito
    if (live < 6 && left <= 5 && left > 0) { eyes = "happy"; dy = left <= 3 && left >= 2 ? -1 : 0; }
  }
  const blink = (f + 23) % 80 < 3;
  if (blink && eyes !== "happy") eyes = "blink";
  // el gran momento: se agacha con el hit-stop, salta con los brazos arriba y se queda celebrando
  if (f >= PRESS - 3 && f < PRESS + HOLD) { pose = "squash"; eyes = "sq"; }
  else if (f >= PRESS + HOLD && f < PRESS + HOLD + 2) { pose = "squash"; eyes = "happy"; }
  else if (f >= PRESS + HOLD + 2 && f < PRESS + HOLD + 14) { pose = "armsup"; eyes = "happy"; dy = -Math.round(5 * Math.sin((Math.PI * (f - PRESS - HOLD - 2)) / 12)); }
  else if (f >= PRESS + HOLD + 14 && f < PRESS + HOLD + 16) { pose = "squash"; eyes = "happy"; }
  else if (f >= PRESS + HOLD + 16 && f < 424) { pose = "armsup"; eyes = (f - PRESS) % 40 > 34 ? "blink" : "happy"; }
  else if (f >= 424 && f < 428) { pose = "unfold"; eyes = "happy"; }          // se encoge para irse
  else if (f >= 428) { pose = "ball"; eyes = "sq"; }
  const [x0, y0] = halfPose(c, pose, x, FEET + dy, "o");
  halfEyes(c, pose, x0, y0, eyes);
  if (f >= 4 && f < 10) spark(c, x + 5, FEET - 7, SP[f - 4], "y", "l");  // nace con una chispa
  if (f >= 428 && f < 434) spark(c, x + 5, FEET - 4, SP[f - 428], "y", "l");
}

// ------------------------------------------------------------------ el brief: un monitor CRT beige con una ventana y un botón al estilo OK
const WIN = { x: 139, y: 9, w: 100, h: 28 };
const BTN = { x: 68, y: 11, w: 27, h: 11 };                           // el botón SÍ, relativo a la ventana
const CURSOR = ["k.....", "kk....", "kyk...", "kyyk..", "kyyyk.", "kyyyyk", "kyykk.", "kk.kyk"];   // la flecha del ratón
function cursorAt(t) {
  if (t < 44 || t >= 88) return null;
  const P0 = [WIN.x + 96, WIN.y + 26], P1 = [WIN.x + 98, WIN.y + 9], P2 = [WIN.x + BTN.x + 13, WIN.y + BTN.y + 4];
  if (t < 62) return bez(P0, P1, P2, ease((t - 44) / 18));
  if (t >= 78) { const u = ease((t - 78) / 10); return [Math.round(lerp(P2[0], WIN.x + 100, u)), Math.round(lerp(P2[1], WIN.y + 22, u))]; }
  return P2;
}
const TXT = ["7 TASKS DONE", "EXAM 12/12 ", "RADAR"];
function crtFrame(c, x, y, w, h) {                                    // caja de plástico beige: luz arriba y a la izquierda, sombra abajo y a la derecha
  c.rect(x, y, w, h, "R");
  c.hline(x, y, w, "r"); c.vline(x, y, h, "r"); c.hline(x, y + h - 1, w, "q"); c.vline(x + w - 1, y, h, "q");
  c.rect(x + 2, y + 1, w - 4, h - 3, "c");                             // el cristal
  if (w > 40) {                                                         // el cristal hundido: lados en sombra y esquinas redondeadas
    c.vline(x + 2, y + 1, h - 3, "q"); c.vline(x + w - 3, y + 1, h - 3, "r");
    c.px(x + 2, y + h - 3, "R"); c.px(x + w - 3, y + h - 3, "R"); c.px(x + 3, y + h - 3, "R"); c.px(x + w - 4, y + h - 3, "R");
  }
}
function briefWin(c, f, real) {
  const t = f - B0;
  if (t < 0 || f >= SHRINK + 10) return;
  const g = f >= SHRINK ? 1 - ease((f - SHRINK) / 10) : ease(t / 10);
  if (g <= 0) return;
  const P6 = { x: CXS(6) - 14, y: SY, w: 28, h: SH };
  const x = Math.round(lerp(P6.x, WIN.x, g)), y = Math.round(lerp(P6.y, WIN.y, g));
  const w = Math.round(lerp(P6.w, WIN.w, g)), h = Math.round(lerp(P6.h, WIN.h, g));
  crtFrame(c, x, y, w, h);
  if (g < 1) return;
  const flash = f >= PRESS + HOLD && f < PRESS + HOLD + 3, ok = real >= PRESS + HOLD;
  // la barra del frente: ranuras de ventilación, el botón y la luz de encendido (ámbar hasta el visto bueno)
  for (let k = 0; k < 3; k++) c.hline(x + 4 + k * 3, y + h - 2, 2, "q");
  c.rect(x + w - 12, y + h - 2, 3, 1, "q");
  c.px(x + w - 6, y + h - 2, ok ? "j" : "O");
  c.rect(x + 2, y + 1, w - 4, 7, "f");                                  // barra de título de la ventana
  c.text(x + 4, y + 2, "BRIEF.EXE", "c");
  for (let k = 0; k < 3; k++) {                                         // tres botoncitos beige: minimizar, maximizar, cerrar
    const bx = x + w - 15 + k * 4;
    c.rect(bx, y + 3, 3, 3, "r"); c.hline(bx, y + 5, 3, "q");
    if (k === 0) c.px(bx + 1, y + 5, "c"); else if (k === 1) c.px(bx + 1, y + 4, "c"); else { c.px(bx, y + 3, "c"); c.px(bx + 2, y + 3, "c"); c.px(bx + 1, y + 4, "c"); c.px(bx, y + 5, "c"); c.px(bx + 2, y + 5, "c"); }
  }
  if (flash) for (let yy = y + 8; yy < y + h - 2; yy++) for (let xx = x + 2; xx < x + w - 2; xx++) if (dith(xx, yy, f < PRESS + HOLD + 1 ? 0.55 : 0.25)) c.px(xx, yy, "Q");
  // renglones que se escriben
  let n = Math.floor((t - 10) * 1.8);
  const rowsY = [y + 9, y + 15, y + 21];
  const pauses = [0, 13, 26];
  let caret = null;
  TXT.forEach((s, r) => {
    const shown = s.slice(0, Math.max(0, Math.min(s.length, n - pauses[r])));
    if (shown.length) c.text(x + 4, rowsY[r], shown, "x");
    if (shown.length && shown.length < s.length) caret = [x + 4 + shown.length * 4, rowsY[r]];
    if (r === 1 && n - pauses[r] >= s.length + 1) { c.text(x + 4 + s.length * 4, rowsY[r], "OK", "j"); }
  });
  if (caret && (two(f) % 2)) c.rect(caret[0], caret[1] + 4, 3, 1, "x");
  // el RADAR: cinco cuadros de color que se encienden uno a uno
  RADC.forEach((k, q) => {
    const tq = 30 + Math.round(q * 2.5), d = t - tq;
    if (d < 0) { c.box(x + 27 + q * 5, rowsY[2], 4, 4, "9"); return; }
    const sz = d < 1 ? 2 : d < 2 ? 3 : 4, o = Math.floor((4 - sz) / 2);
    c.rect(x + 27 + q * 5 + o, rowsY[2] + o, sz, sz, d < 1 ? "y" : k);
    if (d >= 1 && d < 4) c.px(x + 27 + q * 5 + 3, rowsY[2] - 1, "y");
  });
  // el botón SÍ: un botón de los 90 (relieve beige que se hunde al pulsar)
  if (t >= 40) {
    const bx = x + BTN.x, by0 = y + BTN.y, k = clamp01((t - 40) / 6);
    const down = real >= PRESS && real < PRESS + HOLD, hover = t >= 62;
    const by = by0 + (down ? 1 : 0);
    const face = ok ? "j" : hover ? "r" : "R";
    const [tl, br] = ok ? ["T", "4"] : down ? ["q", "r"] : ["r", "q"];
    if (!ok && hover && !down) {                                         // aura violeta de "listo para pulsar"
      for (let yy = by0 - 1; yy <= by0 + BTN.h; yy++)
        for (let xx = bx - 1; xx <= bx + BTN.w; xx++) {
          if (xx >= bx && xx < bx + BTN.w && yy >= by0 && yy < by0 + BTN.h) continue;
          if (dith(xx, yy, two(f) % 4 < 2 ? 0.55 : 0.3)) c.px(xx, yy, "A");
        }
    }
    for (let yy = 0; yy < BTN.h; yy++)
      for (let xx = 0; xx < BTN.w; xx++) {
        if (!dith(bx + xx, by + yy, k)) continue;
        const col = yy === 0 || xx === 0 ? tl : yy === BTN.h - 1 || xx === BTN.w - 1 ? br : face;
        c.px(bx + xx, by + yy, col);
      }
    if (k >= 1) {
      if (ok) paintGrid(c, PROPS.check, bx + 10, by + 3, { y: "c" });
      else c.text(bx + 8, by + 3, "YES", "c");
    }
  }
  // al pulsar: anillo que sale del botón
  const rt = f - (PRESS + HOLD);
  if (rt >= 0 && rt < 12) c.clip([x + 2, y + 8, w - 4, h - 10], () => c.ellipse(x + BTN.x + 13, y + BTN.y + 5, 5 + rt * 3, 3 + rt * 1.5, rt < 3 ? "y" : rt < 7 ? "j" : "Q", true));
  const cp = cursorAt(t);
  if (cp) { const d = real >= PRESS && real < PRESS + HOLD ? 1 : 0; paintGrid(c, CURSOR, cp[0] + d, cp[1] + d, d ? { y: "x" } : {}); }
}
const CONF = (() => {
  const r = seeded(77), out = [];
  for (let k = 0; k < 22; k++) {
    const a = -Math.PI * (0.1 + 0.8 * r()), s = 1.6 + r() * 2.2;
    out.push({ vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.9, col: ["t", "b", "h", "O", "y", "a"][k % 6], d: Math.floor(r() * 4) });
  }
  return out;
})();
function confetti(c, f) {
  const x0 = WIN.x + BTN.x + 13, y0 = WIN.y + BTN.y + 5;
  for (const p of CONF) {
    const t = f - (PRESS + HOLD) - p.d;
    if (t < 0 || t > 30) continue;
    const x = Math.round(x0 + p.vx * t * 0.8), y = Math.round(y0 + p.vy * t + 0.09 * t * t);
    if (x < WIN.x + 3 || x > WIN.x + WIN.w - 4 || y < 11 || y > 33) continue;
    if (two(t + p.d) % 2) c.rect(x, y, 2, 1, p.col); else c.rect(x, y, 1, 2, p.col);
  }
}

// ------------------------------------------------------------------ chispas de "hecha" en cada estación
function doneSparks(c, f) {
  STN.forEach((S, i) => {
    const d = f - (S.D + 2);
    if (d >= 0 && d < 6) spark(c, CXS(i) + 12, SY + 1, SP[d], "y", "l");
  });
}

// ------------------------------------------------------------------ barra de arriba
function hud(c, f) {
  c.rect(1, 0, 238, 9, "c");
  c.box(1, 0, 238, 9, "F");
  const done = f >= PRESS + HOLD && f < 424;
  c.text(5, 2, "> FLOW", done ? "j" : "x");
  // siete segmentos, uno por estación
  STN.forEach((S, i) => {
    const m = modeOf(i, f), x = 79 + i * 12;
    const col = m === 0 ? "1" : m === 1 ? (two(f) % 2 ? "y" : "l") : "a";
    c.rect(x, 3, 10, 3, col);
  });
  const n = f < STN[6].D + 10 ? STN.filter((S) => f >= S.A).length : f < 424 ? 7 : 0;
  const changed = STN.some((S) => f >= S.A && f < S.A + 6);
  c.text(217, 2, String(n).padStart(2, "0") + "/07", done ? "j" : changed ? "y" : n === 0 ? "9" : "X");
}

// ------------------------------------------------------------------ la animación
anim("flujo", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > PRESS && f < PRESS + HOLD) f = PRESS;                          // hit-stop: el mundo se congela en la pulsación

  c.rect(0, 0, W, H, "z");
  sky(c, f);
  rail(c, f);
  for (let i = 0; i < NS; i++) stage(c, i, f);
  for (let i = 0; i < NS; i++) chip(c, i, f);
  for (let i = 0; i < NS; i++) label(c, i, f);
  briefWin(c, f, real);
  beam(c, f);
  token(c, f);
  clawd(c, f);
  doneSparks(c, f);
  confetti(c, f);
  hud(c, f);
})

sheet("flujo_sheet", ["flujo"], { pad: 0 })
