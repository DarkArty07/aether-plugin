// walk.px.js: Clawd Aether camina tranquilo de izquierda a derecha sobre la línea del hero de la página.
// 340 x 30 px de arte (GIF a x4 = 1360 x 120: el ancho del contenido de la página), 547 cuadros a 30 fps (18,2 s), bucle sin
// corte: Clawd entra por la izquierda, cruza y sale por la derecha, y el cuadro 0 lo vuelve a tener fuera de la vista.
// FONDO TRANSPARENTE: no hay escena, solo Clawd, un par de notas musicales y la línea que la página ya dibuja. Se construye con
// `build.js --transparent` (cada cuadro se escribe solo, con la caja de sus píxeles; pesa poco porque la caja es de Clawd).
// Los pies están en la última fila: la línea de la página queda justo debajo y Clawd camina encima.
// Cómo camina (tranquilo, de lado como los subagentes del kit): cuatro posturas de 6 cuadros, un ciclo de 0,8 s. Con el
// par A de patas en el suelo y el B levantado, un saltito con las cuatro patas, el par B en el suelo, otro saltito. Los brazos
// suben y bajan un píxel, mira hacia donde va (los ojos un píxel a la derecha), parpadea cada tres segundos y tiene
// mejillas. De vez en cuando suelta una nota musical que sube un poco y se desvanece mientras él sigue.
// Clawd no va "en dos" aquí: la marcha es el movimiento y la postura cambia cada 6 cuadros, que a 30 fps se lee suave.
include("kit.px.js")

const W = 340, H = 30;
const SW = 24, SH = 16;                      // Clawd: 24 x 16 px de arte, el cuerpo de la pose idle del kit a 1 px por carácter
const TOP = H - SH;                          // fila de arriba de Clawd cuando está en el suelo
const X0 = -SW;                              // sale de la vista por la izquierda
const SPEED = 2 / 3;                         // px de arte por cuadro: 20 px/s, a x4 son 80 px de la página por segundo
const N = Math.ceil((W - X0) / SPEED) + 1;   // el último cuadro lo deja ya fuera por la derecha
const STEP = 6;                              // cuadros por postura

const LEG_X = [4, 8, 14, 18];                // las cuatro patas, de 2 px de ancho
// par de patas en el suelo, brazos (dy de cada uno) y salto
const STEPS = [
  { down: [1, 3], hop: 0, armL: -1, armR: 0 },
  { down: [0, 1, 2, 3], hop: -1, armL: -1, armR: -1 },
  { down: [0, 2], hop: 0, armL: 0, armR: -1 },
  { down: [0, 1, 2, 3], hop: -1, armL: -1, armR: -1 },
];

const NOTE = [
  "..ppp",
  "..p.p",
  "..p..",
  "..p..",
  ".pp..",
  "ppp..",
];
const NOTES = [{ f0: 110, dx: 7 }, { f0: 290, dx: 11 }, { f0: 455, dx: 5 }];   // cuadro en que sale cada nota y dónde, desde la cabeza
const NOTE_LIFE = 44, NOTE_RISE = 8;

// rectángulo recortado a la imagen: Clawd entra y sale por los bordes
function R(c, x, y, w, h, k) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  if (x1 > x0 && y1 > y0) c.rect(x0, y0, x1 - x0, y1 - y0, k);
}

function clawd(c, f, x) {
  const p = STEPS[Math.floor(f / STEP) % STEPS.length];
  const y = TOP + p.hop;
  R(c, x + 4, y, 16, 12, "o");                        // cabeza, pecho y vientre
  R(c, x, y + 4 + p.armL, 4, 4, "o");                 // brazo izquierdo
  R(c, x + 20, y + 4 + p.armR, 4, 4, "o");            // brazo derecho
  LEG_X.forEach((lx, i) => R(c, x + lx, y + 12, 2, p.down.includes(i) ? 4 : 2, "o"));
  R(c, x + 5, y + 4, 2, 1, "p");                      // mejillas
  R(c, x + 17, y + 4, 2, 1, "p");
  if (f % 97 < 4) {                                   // parpadeo
    R(c, x + 7, y + 3, 2, 1, "k"); R(c, x + 17, y + 3, 2, 1, "k");
  } else {
    R(c, x + 7, y + 2, 2, 2, "k"); R(c, x + 17, y + 2, 2, 2, "k");
  }
}

function notes(c, f) {
  for (const n of NOTES) {
    const t = f - n.f0;
    if (t < 0 || t >= NOTE_LIFE) continue;
    const nx = X0 + Math.floor(n.f0 * SPEED) + n.dx;  // se queda donde salió: Clawd sigue caminando
    const ny = TOP - 7 - Math.floor(t * NOTE_RISE / NOTE_LIFE);
    const sway = [0, 1, 1, 0, -1, -1][Math.floor(t / 5) % 6];
    const fade = t > NOTE_LIFE - 10 ? (t - (NOTE_LIFE - 10)) / 10 : 0;
    NOTE.forEach((row, r) => [...row].forEach((ch, q) => {
      if (ch === ".") return;
      const px = nx + q + sway, py = ny + r;
      if (px < 0 || py < 0 || px >= W || py >= H || bay(px, py) < fade) return;
      c.px(px, py, "p");
    }));
  }
}

anim("walk", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const f = c.frame;
  notes(c, f);
  clawd(c, f, X0 + Math.floor(f * SPEED));
})

sheet("walk_sheet", ["walk"], { pad: 0 })
