// walk.px.js: Clawd Aether pasea de izquierda a derecha sobre la línea del hero de la página, y no solo camina: da saltitos,
// se detiene a mirar una nube, le cae un rayo (el rayo cósmico de la mascota: lo deja un instante en negativo, lo sacude y lo
// vuelve violeta Aether), festeja, saluda con la mano al que mira y sigue su camino dejando polvo de estrellas.
// 340 x 56 px de arte (GIF a x4 = 1360 x 224: el ancho del contenido de la página; el alto de más es el cielo del rayo),
// unos 730 cuadros a 30 fps (24 s), bucle sin corte: entra por la izquierda, cruza y sale por la derecha, y el cuadro 0 lo
// vuelve a tener naranja y fuera de la vista.
// FONDO TRANSPARENTE: solo Clawd, la nube, el rayo y los adornos; la línea la dibuja la página. Se construye con
// `build.js --transparent` (cada cuadro se escribe solo, con la caja de sus píxeles).
// Los pies están en la última fila: la línea de la página queda justo debajo y Clawd camina encima.
// El guion es una lista de actos (ACTS); cada uno dura unos cuadros y se camina o no según su tipo. La posición, la marcha y el
// color se calculan UNA vez para todos los cuadros (REC), así que los adornos que se quedan atrás (notas, polvo de estrellas)
// saben dónde estaba Clawd cuando salieron.
//   walk    camina: cuatro posturas de 6 cuadros, el par A de patas en el suelo, un saltito con las cuatro, el par B, otro saltito
//   skip    camina a saltitos con los brazos arriba
//   notice  se para, mira hacia arriba con un "?" y se forma una nube sobre él
//   shock   "!", ojos grandes y un respingo; la nube centellea
//   strike  EL RAYO: cuatro cuadros de negativo con la nube blanca, luego parpadea y salen chispas
//   shake   tiembla y alterna naranja y violeta
//   morph   ya es violeta Aether: anillo de estrellas y los brazos arriba
//   joy     dos saltos de alegría
//   wave    mira al frente, saluda con la mano y le sale un corazón
// Clawd no va "en dos" aquí: la marcha es el movimiento y la postura cambia cada 6 cuadros, que a 30 fps se lee suave.
include("kit.px.js")

const W = 340, H = 56;
const SW = 24, SH = 16;                      // Clawd: 24 x 16 px de arte, el cuerpo de la pose idle del kit a 1 px por carácter
const TOP = H - SH;                          // fila de arriba de Clawd cuando está en el suelo
const X0 = -SW;                              // sale de la vista por la izquierda
const SPEED = 2 / 3;                         // px de arte por cuadro: 20 px/s, a x4 son 80 px de la página por segundo
const STEP = 6;                              // cuadros por postura al caminar
const LEG_X = [4, 8, 14, 18];                // las cuatro patas, de 2 px de ancho
const GAIT = [                               // patas en el suelo, brazos (dy de cada uno) y salto
  { down: [1, 3], hop: 0, armL: -1, armR: 0 },
  { down: [0, 1, 2, 3], hop: -1, armL: -1, armR: -1 },
  { down: [0, 2], hop: 0, armL: 0, armR: -1 },
  { down: [0, 1, 2, 3], hop: -1, armL: -1, armR: -1 },
];
const COLORS = {
  orange: { body: "o", low: "o", eye: "k", cheek: "p" },
  neg: { body: "7", low: "7", eye: "y", cheek: "y" },        // el negativo del golpe: el naranja se vuelve cian
  violet: { body: "l", low: "L", eye: "k", cheek: "W" },      // Aether
};

// ------------------------------------------------------------------ guion
const ACTS = [
  ["walk", 70], ["skip", 48], ["walk", 212],                 // 330 cuadros: Clawd llega a x = 196, ya pasado el texto del hero
  ["notice", 30], ["shock", 12], ["strike", 16], ["shake", 14], ["morph", 22], ["joy", 26],
  ["walk", 100], ["wave", 66], ["walk", 99999],
];
const MOVING = { walk: true, skip: true };
const REC = [];                                // un registro por cuadro: acto, cuadro del acto, x, marcha
let violetFrom = -1;
build: {
  let dist = 0, g = 0;
  for (const [kind, len] of ACTS) {
    for (let t = 0; t < len; t++) {
      if (MOVING[kind]) { dist += SPEED; g++; }
      if (kind === "morph" && t === 0) violetFrom = REC.length;
      const x = X0 + Math.floor(dist);
      REC.push({ kind, t, len, x, g });
      if (x >= W && len > 5000) break build;   // el último tramo termina cuando Clawd ya salió por la derecha
    }
  }
}
const N = REC.length;
const first = (kind) => REC.findIndex((r) => r.kind === kind);
const STRIKE0 = first("strike"), NOTICE0 = first("notice"), SHAKE0 = first("shake"), WAVE0 = first("wave");
const LAST_WALK0 = REC.findIndex((r, i) => r.kind === "walk" && i > WAVE0);

// ------------------------------------------------------------------ utilidades
function R(c, x, y, w, h, k) {               // rectángulo recortado a la imagen: Clawd entra y sale por los bordes
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  if (x1 > x0 && y1 > y0) c.rect(x0, y0, x1 - x0, y1 - y0, k);
}
function P(c, x, y, k) { if (x >= 0 && y >= 0 && x < W && y < H) c.px(x, y, k); }
function star(c, x, y, r, core, arm) {       // una chispa en cruz
  if (r <= 0) return;
  P(c, x, y, core);
  for (let k = 1; k < r; k++) { P(c, x - k, y, arm); P(c, x + k, y, arm); P(c, x, y - k, arm); P(c, x, y + k, arm); }
}
const seg = (f, a, b) => clamp01((f - a) / (b - a));

// ------------------------------------------------------------------ cómo está Clawd en cada cuadro
function look(f) {
  const r = REC[f], { kind, t } = r;
  const p = { hop: 0, armL: 0, armR: 0, down: [0, 1, 2, 3], eye: "sq", ex: 1, ey: 0, jx: 0, jy: 0, color: f >= violetFrom && violetFrom >= 0 ? "violet" : "orange", mark: null };
  const jitter = [1, -1, 1, 0, -1, 1, -1, 0];
  if (kind === "walk") {
    const s = GAIT[Math.floor(r.g / STEP) % GAIT.length];
    Object.assign(p, { hop: s.hop, armL: s.armL, armR: s.armR, down: s.down });
  } else if (kind === "skip") {                // dos saltitos por el camino, con los brazos arriba en el aire
    const hop = -Math.round(Math.abs(Math.sin(t * Math.PI / 24)) * 5);
    Object.assign(p, { hop, armL: hop <= -2 ? -3 : -1, armR: hop <= -2 ? -3 : -1, down: hop <= -2 ? [] : [0, 1, 2, 3] });
  } else if (kind === "notice") {              // se para y mira hacia arriba
    if (t >= 5) p.ey = -1;
    if (t >= 8) p.ex = 0;
    if (t >= 10) p.mark = "?";
  } else if (kind === "shock") {               // respingo
    p.eye = "wide"; p.ex = 0; p.mark = "!";
    p.hop = t < 2 ? -2 : t < 4 ? -1 : 0; p.armL = p.armR = t < 8 ? -2 : -1;
  } else if (kind === "strike") {              // el golpe: negativo quieto cuatro cuadros, luego parpadea
    p.eye = "wide"; p.ex = 0; p.armL = p.armR = -3; p.hop = -1;
    p.color = t < 4 ? "neg" : (t < 10 && Math.floor(t / 2) % 2 === 0) ? "neg" : "orange";
    if (t >= 4) { p.jx = jitter[t % 8]; p.jy = jitter[(t + 3) % 8] > 0 ? -1 : 0; }
  } else if (kind === "shake") {               // tiembla y alterna naranja y violeta
    p.armL = p.armR = -3; p.hop = -1; p.ex = 0;
    p.jx = jitter[t % 8]; p.jy = jitter[(t + 5) % 8] > 0 ? -1 : 0;
    p.color = t < 6 ? "orange" : (Math.floor(t / 2) % 2 === 0 ? "violet" : "orange");
  } else if (kind === "morph") {               // violeta Aether: los brazos arriba y un saltito
    p.armL = p.armR = -3; p.hop = t < 8 ? -1 - Math.round(Math.sin(t * Math.PI / 8) * 2) : 0; p.ex = 0;
    p.down = p.hop < -1 ? [] : [0, 1, 2, 3];
  } else if (kind === "joy") {                 // dos saltos de alegría
    const hop = -Math.round(Math.abs(Math.sin(t * Math.PI / 13)) * 6);
    Object.assign(p, { hop, armL: -3, armR: -3, down: hop <= -2 ? [] : [0, 1, 2, 3], ex: 0 });
    if (t >= 22) { p.armL = p.armR = -1; }
  } else if (kind === "wave") {                // mira al frente y saluda con la mano derecha
    p.ex = 0;
    if (t >= 6 && t < r.len - 6) p.armR = Math.floor((t - 6) / 5) % 2 === 0 ? -4 : -3;
    if (t >= 6 && t < r.len - 6) p.eye = "happy";
  }
  if (p.eye === "sq" && blinkAt(f)) p.eye = "blink";
  return p;
}
const blinkAt = (f) => f % 97 < 4;

function clawd(c, f) {
  const r = REC[f], p = look(f), col = COLORS[p.color];
  const x = r.x + p.jx, y = TOP + p.hop + p.jy;
  R(c, x + 4, y, 16, 12, col.body);                                // cabeza, pecho y vientre
  R(c, x + 4, y + 8, 16, 4, col.low);                              // el vientre, un tono más oscuro en Aether
  R(c, x, y + 4 + p.armL, 4, 4, col.body);                         // brazo izquierdo
  R(c, x + 20, y + 4 + p.armR, 4, 4, col.body);                    // brazo derecho
  LEG_X.forEach((lx, i) => R(c, x + lx, y + 12, 2, p.down.includes(i) ? 4 : 2, col.low));
  R(c, x + 5 + p.ex, y + 4, 2, 1, col.cheek);                      // mejillas
  R(c, x + 17, y + 4, 2, 1, col.cheek);
  const e = col.eye, ex0 = x + 6 + p.ex, ex1 = x + 16 + p.ex, ey = y + 2 + p.ey;
  if (p.eye === "blink") { R(c, ex0, ey + 1, 2, 1, e); R(c, ex1, ey + 1, 2, 1, e); }
  else if (p.eye === "wide") { R(c, ex0, ey - 1, 2, 3, e); R(c, ex1, ey - 1, 2, 3, e); }
  else if (p.eye === "happy") { R(c, ex0, ey, 2, 1, e); P(c, ex0, ey + 1, e); R(c, ex1, ey, 2, 1, e); P(c, ex1 + 1, ey + 1, e); }   // ojos de gusto: ^ ^
  else { R(c, ex0, ey, 2, 2, e); R(c, ex1, ey, 2, 2, e); }
  if (p.mark === "?") c.text(x + 22, y - 6 + (Math.floor(f / 6) % 2), "?", "O");
  if (p.mark === "!") c.text(x + 22, y - 6, "!", "u");
}

// ------------------------------------------------------------------ la nube y el rayo
const CLOUD_W = 22, CLOUD_H = 10;
const cloudX = () => REC[NOTICE0].x + 12 - 11, cloudY = 4;
function cloud(c, f) {
  const a = f - NOTICE0, fadeOutAt = SHAKE0 + 4;
  if (a < 0 || f > fadeOutAt + 14) return;
  const fade = f < NOTICE0 + 16 ? seg(f, NOTICE0, NOTICE0 + 16) : f > fadeOutAt ? 1 - seg(f, fadeOutAt, fadeOutAt + 14) : 1;
  const flash = (f >= STRIKE0 && f < STRIKE0 + 6) || (f >= REC.findIndex((r) => r.kind === "shock") && f < STRIKE0 && Math.floor(f / 2) % 2 === 0);
  const base = flash ? "W" : "0", dark = flash ? "3" : "9", light = flash ? "y" : "x";
  const cx = cloudX(), cy = cloudY + (f < NOTICE0 + 16 ? Math.round((1 - fade) * 4) : 0);
  const inside = (dx, dy) => Math.hypot(dx - 6, dy - 6) <= 4.6 || Math.hypot(dx - 11, dy - 4) <= 5.2 || Math.hypot(dx - 16, dy - 6) <= 4.6 || (dx >= 3 && dx <= 19 && dy >= 6 && dy <= 8);
  for (let dy = 0; dy < CLOUD_H; dy++) for (let dx = 0; dx < CLOUD_W; dx++) {
    if (!inside(dx, dy)) continue;
    const px = cx + dx, py = cy + dy;
    if (bay(px, py) >= fade) continue;
    P(c, px, py, dy >= 8 ? dark : (dx + dy < 9 && dy <= 5) ? light : base);
  }
}
function bolt(c, f) {
  const t = f - STRIKE0;
  if (t < 0 || t >= 12) return;
  const cx = REC[STRIKE0].x + 12, y0 = cloudY + 8, y1 = TOP - 1;
  const rnd = seeded(7 + t * 131);
  const pts = [[cx + (t >= 4 ? Math.round((rnd() - 0.5) * 2) : 0), y0]];
  const n = 6;
  for (let i = 1; i < n; i++) pts.push([cx + Math.round((rnd() - 0.5) * (t < 4 ? 8 : 6)), Math.round(y0 + (y1 - y0) * i / n)]);
  pts.push([cx, y1]);
  const glow = t < 6 || t % 2 === 0;                                // el brillo parpadea al apagarse
  for (let i = 0; i < pts.length - 1; i++) {
    if (glow) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], "l", 3);
    c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], "y", 1);
  }
  if (t < 8) star(c, cx, y1, [5, 5, 4, 4, 3, 3, 2, 2][t], "y", "l");  // el golpe en la cabeza
}

// ------------------------------------------------------------------ adornos
function sparks(c, f) {                                             // chispas que se abren desde Clawd tras el golpe y al volverse violeta
  const t = f - (STRIKE0 + 4);
  if (t < 0 || t > 40) return;
  const cx = REC[STRIKE0].x + 12, cy = TOP + 8;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.3, r = 8 + t * 0.55 + (i % 2) * 3;
    const col = t < 20 ? (i % 2 ? "y" : "l") : "w";
    if (t < 30 || i % 2) star(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.7), t < 10 ? 2 : 1, col, "L");
  }
}
const NOTE = ["..ppp", "..p.p", "..p..", "..p..", ".pp..", "ppp.."];
const NOTES = [{ f0: 40, dx: 7 }, { f0: LAST_WALK0 + 16, dx: 5 }];      // una nota al empezar y otra al final
const NOTE_LIFE = 44, NOTE_RISE = 8;
function notes(c, f) {
  for (const n of NOTES) {
    const t = f - n.f0;
    if (t < 0 || t >= NOTE_LIFE) continue;
    const nx = REC[n.f0].x + n.dx;                                  // se queda donde salió: Clawd sigue caminando
    const ny = TOP - 7 - Math.floor(t * NOTE_RISE / NOTE_LIFE);
    const sway = [0, 1, 1, 0, -1, -1][Math.floor(t / 5) % 6];
    const fade = t > NOTE_LIFE - 10 ? (t - (NOTE_LIFE - 10)) / 10 : 0;
    NOTE.forEach((row, rr) => [...row].forEach((ch, q) => {
      if (ch === "." || bay(nx + q + sway, ny + rr) < fade) return;
      P(c, nx + q + sway, ny + rr, "p");
    }));
  }
}
const HEART = [".p.p.", "ppppp", ".ppp.", "..p.."];
function heart(c, f) {                                              // el corazón del saludo
  const t = f - (WAVE0 + 28);
  if (t < 0 || t >= 34) return;
  const x = REC[WAVE0].x + 21, y = TOP - 4 - Math.floor(t * 0.28);
  const fade = t > 24 ? (t - 24) / 10 : 0;
  HEART.forEach((row, rr) => [...row].forEach((ch, q) => { if (ch !== "." && bay(x + q, y + rr) >= fade) P(c, x + q, y + rr, "u"); }));
}
const TRAIL = [];                                                   // polvo de estrellas: sale de la espalda de Clawd cuando ya es Aether
for (let f = violetFrom + 22; f < N; f++) if (MOVING[REC[f].kind] && f % 5 === 0) TRAIL.push({ f0: f, x: REC[f].x + 1 + (f % 3), y: TOP + 3 + ((f * 7) % 9) });
function trail(c, f) {
  for (const s of TRAIL) {
    const t = f - s.f0;
    if (t < 0 || t >= 22) continue;
    const fade = t > 12 ? (t - 12) / 10 : 0;
    const x = s.x, y = s.y - Math.floor(t * 0.12);
    if (bay(x, y) >= fade) star(c, x, y, t < 8 ? 2 : 1, t < 8 ? "y" : "l", "L");
  }
}

anim("walk", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const f = c.frame;
  trail(c, f);
  notes(c, f);
  heart(c, f);
  cloud(c, f);
  bolt(c, f);
  clawd(c, f);
  sparks(c, f);
})

sheet("walk_sheet", ["walk"], { pad: 0 })
