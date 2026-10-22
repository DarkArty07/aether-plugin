// path_direct.px.js: camino #1, "Directo / DIRECT", de "Tres caminos, una decisión". 225 x 25 px de arte (GIF a x4 = 900 x 100),
// 300 cuadros a 30 fps (10 s), bucle sin corte. Ocupa el lugar del diagrama animado de 900 x 100 de la página.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): la vía es una greca de mármol de tres filas que se enciende
// a medida que salen las llamadas; las fichas son pestañas de ventana de los 90 en lavanda y malva; la bandera RESULT cuelga de
// una columna dórica con una corona de laurel; el polvo y las chispas son estrellas violetas. El verde, el azul y el rosa quedan
// para los niveles de los subagentes: ninguna ficha ni estrella los usa.
// La historia: un cambio muy acotado. Clawd (el Lead) está a la izquierda de una vía recta que termina en la bandera RESULT.
// Cinco llamadas a herramientas (READ, GREP, EDIT, EDIT, RUN) salen de sus manos una tras otra, caen en su ficha, la encienden y
// suben el contador N/5 CALLS. No hay ciclo de editar-probar-corregir: la vía es una línea recta que se va encendiendo.
// Tras la quinta, un pulso recorre la vía, la bandera sube, golpea (hit-stop + negativo + temblor, una sola vez), Clawd salta
// con los brazos arriba y aparece la palomita.
// Leyenda (cuadros):
//   0 a 18      escena en reposo = escena del último cuadro (Clawd quieto, fichas apagadas, bandera abajo)
//   18 a 174    llamadas 1 a 5: Clawd teclea, sale una estrella en arco, cae en la ficha (28, 64, 101, 137, 174), polvo y estrella
//   176 a 192   el pulso recorre la greca hasta la columna / 190 a 206 sube la bandera / 198 a 209 Clawd se agacha
//   206 a 209   HIT en la bandera: el mundo se congela 4 cuadros; 206 y 207 en negativo; 210 a 219 temblor
//   210 a 236   Clawd salta con los brazos arriba (214 aparece la palomita), confeti de la bandera
//   236 a 262   celebra / 262 a 292 todo vuelve a "pendiente" de izquierda a derecha y la bandera baja / 292 a 299 reposo
// Mismo lenguaje que aether.px.js: Clawd va "en dos"; paquetes, rastros, estrellas, polvo y la greca se mueven en cada cuadro;
// el fondo está casi quieto y el movimiento se gasta en la acción (el GIF pesa poco).
include("kit.px.js")

const W = 225, H = 25, N = 300;

// ------------------------------------------------------------------ plano (px de arte)
//   y 0 a 6    barra de arriba            y 7 a 14   aire (arcos, estrellas, capitel y bandera arriba)
//   y 15 a 21  fichas y Clawd (pies en 21)   y 22 a 24  la greca de mármol: la vía
const FEET = 21, KEY0 = 22, CH_Y = 15, CH_W = 19, CH_H = 7;
const CLAWD_X = 9;                                       // centro del cuerpo de Clawd
const COL = 194;                                         // eje de la columna dórica: x 192 a 196
const FLAG_X = 199, FLAG_W = 26, FLAG_TOP = 9, FLAG_LOW = 15;
const CALLS = [                                          // cada ficha: su nombre y su tono (lavanda o malva)
  { name: "READ", m: "3" }, { name: "GREP", m: "a" }, { name: "EDIT", m: "3" },
  { name: "EDIT", m: "a" }, { name: "RUN", m: "3" },
];
const chipX = (i) => 32 + 33 * i;                        // borde izquierdo de cada ficha
const chipC = (i) => chipX(i) + 9;                       // su centro
const LAUNCH = [18, 52, 86, 120, 154];                   // sale la estrella de las manos
const FLIGHT = [10, 12, 15, 17, 20];                     // cuadros de vuelo (más lejos, más largo)
const LAND = LAUNCH.map((l, i) => l + FLIGHT[i]);        // 28, 64, 101, 137, 174
const PULSE0 = 176, PULSE1 = 192;                        // el pulso recorre la greca hasta la columna
const RISE0 = 190, HIT = 206, HOLD = 4;                  // sube la bandera / el golpe y su hit-stop
const HOP0 = HIT + HOLD;                                 // 210: Clawd salta
const RESET0 = 262;                                      // todo vuelve a pendiente
const OFF = (i) => RESET0 + 4 * i;                       // se apaga la ficha i
const sn = (f) => f >= HIT + HOLD;                       // el golpe ya pasó

// ------------------------------------------------------------------ utilidades propias
const SP = [1, 2, 3, 3, 2, 1];                            // tamaños de una estrella que nace y se apaga
// Estrella violeta: centro blanco, brazos malva, puntas lavanda oscuras. Con tamaño 1 es solo un punto.
function star(c, x, y, size) {
  if (size <= 0) return;
  c.px(x, y, "W");
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, k === 1 ? "l" : "L");
}
const outBack = (u) => { u = clamp01(u); const s = 1.4; return 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2; };   // sube y se pasa un poco
const dith = (x, y, a) => bay(x, y) < a;

// ------------------------------------------------------------------ guion derivado
// Cuántas llamadas van y cuánto avanza la greca encendida.
const callsDone = (f) => LAND.filter((t, i) => f >= t && f < OFF(i)).length;
function front(f) {
  let x = 2;
  for (let i = 0; i < 5; i++) {
    const u = clamp01((f - LAND[i]) / 8);
    if (u > 0) x = lerp(i === 0 ? 2 : chipC(i - 1) + 2, chipC(i), ease(u));
  }
  if (f >= PULSE0) x = lerp(chipC(4), COL, clamp01((f - PULSE0) / (PULSE1 - PULSE0)));
  if (f >= RESET0 + 6) x = lerp(COL, 2, ease((f - RESET0 - 6) / 24));
  return Math.round(x);
}

// ------------------------------------------------------------------ la vía: greca de mármol (tres filas, periodo 8)
const GREC = ["aaaaaaa.", "a.....a.", "a.aaa.a."];
function track(c, f) {
  const fx = front(f), lit = fx > 2;
  for (let x = 0; x < W; x++)
    for (let r = 0; r < 3; r++) {
      if (GREC[r][x % 8] !== "a") continue;
      let col = r === 2 ? "1" : "2";                      // apagada: violeta oscuro
      if (lit && x <= fx) col = r === 0 ? "e" : r === 1 ? "3" : "a";   // encendida: marfil lavanda y malva
      c.px(x, KEY0 + r, col);
    }
  // brillo que corre por lo ya encendido, a paso de 18
  if (fx > 6 && f >= LAND[0] && f < OFF(0) + 20) {
    const k = (f * 2) % 18;
    for (let x = 2 + k; x < fx; x += 18) c.px(x, KEY0, "W");
  }
  // el frente del pulso
  if (f >= LAND[0] - 2 && f < RESET0 && fx > 2 && fx < COL) {
    c.px(fx, KEY0, "W");
    if (fx > 3) c.px(fx - 1, KEY0, "e");
  }
}

// ------------------------------------------------------------------ fichas: pestañas de ventana de los 90
// Cuerpo lavanda o malva, bisel claro arriba y a la izquierda, sombra abajo y a la derecha, esquinas redondeadas.
function chip(c, i, f) {
  const K = CALLS[i], x0 = chipX(i), d = f - LAND[i];
  const lit = f >= LAND[i] && f < OFF(i);
  const off = f - OFF(i);
  const sq = lit && d < 2 ? 1 : 0;                       // aterriza aplastada
  const y0 = CH_Y + sq, h = CH_H - sq;
  let body = "1", hi = "2", sh = "1", ink = "F";
  if (lit) {
    body = d < 2 ? "W" : K.m; hi = "e"; sh = "2"; ink = "c";
  } else if (off >= 0 && off < 2) {
    body = "2"; hi = "W"; sh = "1"; ink = "e";           // se apaga: un destello blanco
  } else if (f < LAND[i] && f >= LAUNCH[i] + FLIGHT[i] - 9 && f >= LAUNCH[i]) {
    // la pestaña "marca" el blanco mientras la estrella vuela
    hi = (f >> 1) % 2 ? "W" : "3"; ink = "a";
  }
  c.rect(x0, y0, CH_W, h, body);
  c.hline(x0 + 1, y0, CH_W - 2, hi);                     // bisel claro arriba
  c.vline(x0, y0, h, hi);                                // y a la izquierda
  c.vline(x0 + CH_W - 1, y0, h, sh);                     // sombra a la derecha
  c.hline(x0, y0 + h - 1, CH_W, sh);                     // y abajo
  c.px(x0, y0, "z"); c.px(x0 + CH_W - 1, y0, "z");       // esquinas redondeadas
  const len = K.name.length * 4 - 1;
  c.text(x0 + Math.floor((CH_W - len) / 2), y0 + 1, K.name, ink);
}

// ------------------------------------------------------------------ estrellas que salen de Clawd
function packetPos(i, u) {
  const P0 = [CLAWD_X + 8, 17], P2 = [chipC(i), CH_Y - 2], P1 = [(P0[0] + P2[0]) / 2, 5];
  return bez(P0, P1, P2, u);
}
const ease2 = (u) => 0.25 * u + 0.75 * ease(u);         // casi lineal con salida suave
function packet(c, i, f) {
  const K = CALLS[i], t = f - LAUNCH[i];
  if (t < 0 || t >= FLIGHT[i]) return;
  const u = (k) => clamp01((t - k) / FLIGHT[i]);
  const trail = ["", "e", "3", "3", "a", "a", "l", "l", "L", "2"];   // rastro: del más claro al más oscuro
  for (let k = 9; k >= 1; k--) {                          // rastro: posiciones de medio cuadro atrás
    if (t - k / 2 < 0) continue;
    const [x, y] = packetPos(i, ease2(u(k / 2)));
    c.px(x, y, trail[k]);
  }
  const [x, y] = packetPos(i, ease2(u(0)));
  c.rect(x, y, 2, 2, "W");
  c.px(x + 1, y, K.m);
}
// Estrella al salir de las manos y polvo de estrellitas + estrella al caer.
function callFx(c, i, f) {
  const t = f - LAUNCH[i];
  if (t >= 0 && t < 6) star(c, CLAWD_X + 8, 17, SP[t]);
  const d = f - LAND[i];
  if (d < 0 || d >= 8) return;
  const x0 = chipX(i);
  const col = d < 3 ? "l" : d < 5 ? "L" : "2";
  [[-1, -0.35], [1, -0.35], [-2, -0.05], [2, -0.05]].forEach(([vx, vy]) => {
    const x = Math.round((vx < 0 ? x0 - 1 : x0 + CH_W) + vx * d * 0.9), yy = Math.round(CH_Y + CH_H - 1 + vy * d * 1.6);
    if (yy >= KEY0) { if (d < 6) c.px(x, KEY0 - 1, col); }
    else c.px(x, yy, col);
  });
  if (d < 6) star(c, chipC(i), CH_Y - 2 - (d > 2 ? 1 : 0), SP[d]);
}

// ------------------------------------------------------------------ fondo: pocas estrellas que titilan
const BGSTARS = (() => {
  const r = seeded(19), out = [];
  for (let k = 0; k < 9; k++) out.push([6 + Math.floor(r() * 180), 7 + Math.floor(r() * 7), Math.floor(r() * 60)]);
  return out;
})();
function sky(c, f) {
  for (const [x, y, ph] of BGSTARS) c.px(x, y, (f + ph) % 60 < 3 ? "3" : "2");
}

// ------------------------------------------------------------------ la columna dórica con su laurel
// Capitel arriba, fuste acanalado y base sobre la greca. Una corona de laurel le da vueltas al fuste.
function column(c, f) {
  c.rect(191, 8, 7, 1, "W");                              // ábaco
  c.rect(191, 9, 7, 1, "e");                              // equino
  c.rect(192, 10, 5, 10, "3");                            // fuste
  c.vline(192, 10, 10, "e"); c.vline(194, 10, 10, "a"); c.vline(196, 10, 10, "2");   // estrías
  c.rect(191, 20, 7, 1, "e"); c.hline(191, 21, 7, "A");   // base
  // laurel: ramas que suben por el fuste, con hojas de dos píxeles apuntando arriba y hacia fuera
  for (const y of [17, 14, 11]) {                         // a la izquierda
    c.px(191, y, "l"); c.px(190, y - 1, "a"); c.px(190, y - 2, "3");
  }
  for (const y of [15, 12]) {                             // y a la derecha, alternadas
    c.px(197, y, "l"); c.px(198, y - 1, "a"); c.px(198, y - 2, "3");
  }
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
const BLINKS = [8, 46, 112, 244];                        // parpadeos (3 cuadros)
function clawd(c, f) {
  let pose = "idle", eyes = "sq", dy = 0;
  const done = callsDone(f);
  // espera mirando la vía; entre llamadas sigue con la vista la última estrella
  if (f >= 6 && f < LAUNCH[0]) eyes = "right";
  for (let i = 0; i < 5; i++) {
    if (f >= LAUNCH[i] - 6 && f < LAUNCH[i] + 4) { pose = ["type_l", "type_r"][two(f) % 2]; eyes = "sq"; }
    else if (f >= LAUNCH[i] + 4 && f < LAND[i]) eyes = "right";
    else if (f >= LAND[i] && f < LAND[i] + 7) eyes = "happy";
    else if (f >= LAND[i] + 7 && i < 4 && f < LAUNCH[i + 1] - 6) eyes = "right";
  }
  if (f >= LAND[4] + 7 && f < 190) eyes = "right";
  if (f >= 190 && f < 198) eyes = "up";                  // mira cómo sube la bandera
  // el gran momento: se agacha con el golpe, salta con los brazos arriba y celebra
  if (f >= 198 && f < HOP0) { pose = "squash"; eyes = "up"; if (f >= HIT) eyes = "sq"; }
  else if (f >= HOP0 && f < HOP0 + 16) { pose = "armsup"; eyes = "happy"; dy = -Math.round(5 * Math.sin((Math.PI * (f - HOP0)) / 16)); }
  else if (f >= HOP0 + 16 && f < HOP0 + 19) { pose = "squash"; eyes = "happy"; }
  else if (f >= HOP0 + 19 && f < RESET0) { pose = "armsup"; eyes = "happy"; }
  else if (f >= RESET0 && f < RESET0 + 3) { pose = "squash"; eyes = "sq"; }
  else if (f >= RESET0 + 3) eyes = "sq";
  if (BLINKS.some((b) => f >= b && f < b + 3) && eyes !== "happy" && pose === "idle") eyes = "blink";
  const [x0, y0] = halfPose(c, pose, CLAWD_X, FEET + dy, "o");
  halfEyes(c, pose, x0, y0, eyes);
  // sombra del salto sobre la greca
  if (dy < 0) c.hline(CLAWD_X - 3 + (dy < -2 ? 1 : 0), KEY0, 7 - (dy < -2 ? 2 : 0), "c");
}

// ------------------------------------------------------------------ la bandera RESULT, colgada de la columna
function flagY(f) {
  if (f < RISE0) return FLAG_LOW;
  if (f >= HIT) return FLAG_TOP;
  return Math.round(lerp(FLAG_LOW, FLAG_TOP, clamp01(outBack((f - RISE0) / (HIT - RISE0)))));
}
function flag(c, f, real) {
  let y = flagY(f);
  if (f >= RESET0 + 6) y = Math.round(lerp(FLAG_TOP, FLAG_LOW, ease((f - RESET0 - 6) / 20)));
  else if (f >= RESET0) y = FLAG_TOP;
  const lit = f >= HIT && f < RESET0 + 18;
  const rising = f >= RISE0 && f < HIT;
  c.rect(197, y + 2, 2, 1, "e");                         // la barra que sujeta la bandera a la columna
  let fill = "1", border = "2", ink = "F";
  if (rising) { border = "a"; ink = "W"; }
  if (lit) {
    const d = f - HIT;
    fill = d < 5 ? "y" : "W"; border = d < 5 ? "y" : "L"; ink = "c";
  }
  c.rect(FLAG_X, y, FLAG_W, CH_H, fill);
  c.box(FLAG_X, y, FLAG_W, CH_H, border);
  c.text(FLAG_X + 2, y + 1, "RESULT", ink);
  // ondeo: la cola del paño sube y baja un píxel mientras está izada
  if (lit && f >= HIT + 8 && f < RESET0 - 2 && two(f) % 4 < 2) { c.px(FLAG_X + FLAG_W - 1, y + CH_H - 1, "a"); c.px(FLAG_X + FLAG_W - 1, y + CH_H, "l"); }
  // estela de subida
  if (rising) for (let k = 1; k <= 3; k++) if (y + CH_H + k < KEY0) c.px(FLAG_X + 2 + k * 6, y + CH_H + k - 1, "3");
  // estrella de llegada
  const d = real - HIT;
  if (d >= HOLD && d < HOLD + 6) star(c, FLAG_X + FLAG_W - 2, y - 1, SP[d - HOLD]);
}

// ------------------------------------------------------------------ confeti de la bandera (solo malvas, lavandas y blanco)
const CONF = (() => {
  const r = seeded(31), out = [];
  for (let k = 0; k < 16; k++) {
    const a = -Math.PI * (0.15 + 0.7 * r()), s = 1.4 + r() * 1.8;
    out.push({ vx: Math.cos(a) * s * 1.5, vy: Math.sin(a) * s * 0.7, col: ["W", "e", "a", "3", "y", "l"][k % 6], d: Math.floor(r() * 4) });
  }
  return out;
})();
function confetti(c, f) {
  const x0 = FLAG_X + 12, y0 = FLAG_TOP + 3;
  for (const p of CONF) {
    const t = f - HOP0 - p.d;
    if (t < 0 || t > 26) continue;
    const x = Math.round(x0 + p.vx * t * 0.7), y = Math.round(y0 + p.vy * t + 0.07 * t * t);
    if (x < 1 || x > W - 3 || y < 8 || y > KEY0 - 1) continue;
    if (two(t + p.d) % 2) c.rect(x, y, 2, 1, p.col); else c.rect(x, y, 1, 2, p.col);
  }
}

// ------------------------------------------------------------------ la palomita junto a Clawd (violeta, sin verde)
function check(c, f) {
  const t = f - (HOP0 + 4);
  if (t < 0 || f >= RESET0) return;
  const x = 19, y = 10;
  const k = Math.min(1, t / 4, (RESET0 - f) / 5);       // aparece y se desvanece con puntos Bayer
  const col = t < 2 ? "y" : "e";
  PROPS.check.forEach((row, r) => [...row].forEach((ch, q) => { if (ch !== "." && dith(x + q, y + r, k)) c.px(x + q, y + r, col); }));
  if (t < 6) star(c, x + 7, y - 1, SP[t]);
}

// ------------------------------------------------------------------ barra de arriba
function hud(c, f, real) {
  const n = callsDone(f), ok = sn(real) && real < RESET0;
  const justTicked = LAND.some((t) => f >= t && f < t + 6) && n > 0 && f < OFF(0);
  c.rect(0, 0, W, 7, "c");
  c.box(0, 0, W, 7, "F");
  c.text(3, 1, "> DIRECT", ok ? "W" : "x");
  c.text(40, 1, ok ? "DONE" : "INLINE", ok ? "W" : "X");
  for (let i = 0; i < 5; i++) {
    const x = 75 + i * 16;
    let col = "1";
    if (f >= LAND[i] && f < OFF(i)) col = ok ? "W" : f < LAND[i] + 6 ? (two(f) % 2 ? "y" : CALLS[i].m) : CALLS[i].m;
    c.rect(x, 2, 12, 3, col);
  }
  const txt = `${n}/5 CALLS`;
  c.text(W - 3 - (txt.length * 4 - 1), 1, txt, ok ? "W" : justTicked ? "y" : n === 0 ? "9" : "x");
}

// ------------------------------------------------------------------ hit: negativo y temblor
// Negativo a dos tonos, como el de aether.px.js: lo claro pasa a oscuro y lo oscuro a claro.
function negate(c) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = c.get(x, y) >>> 0, r = (v >>> 24) & 255, g = (v >>> 16) & 255, b = (v >>> 8) & 255;
      c.px(x, y, (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.3 ? "c" : "W");
    }
}
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 7; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 7; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(7, y - dy));
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}

// ------------------------------------------------------------------ la animación
anim("path_direct", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HIT && f < HIT + HOLD) f = HIT;                // hit-stop: el mundo se congela en el golpe

  c.rect(0, 0, W, H, "z");
  sky(c, f);
  track(c, f);
  for (let i = 0; i < 5; i++) chip(c, i, f);
  column(c, f);
  flag(c, f, real);
  for (let i = 0; i < 5; i++) callFx(c, i, f);
  for (let i = 0; i < 5; i++) packet(c, i, f);
  clawd(c, f);
  check(c, f);
  confetti(c, f);
  hud(c, f, real);
  if (real === HIT || real === HIT + 1) negate(c);
  if (real >= HIT + HOLD && real < HIT + HOLD + 10)
    shake(c, [1, -1, 1, -1, 1, 0, -1, 0, 0, 0][real - HIT - HOLD], [0, 1, -1, 0, 1, -1, 0, 0, 0, 0][real - HIT - HOLD]);
})

sheet("path_direct_sheet", ["path_direct"], { pad: 0 })
