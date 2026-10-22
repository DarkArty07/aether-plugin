// install.px.js: "Instala y empieza". Se instala el plugin, se arranca el modo Aether y Clawd pasa de naranja
// Claude a violeta Aether. Mismo mundo, paleta y movimiento que aether.px.js (kit.px.js trae la paleta, las poses
// y las utilerías). Lienzo de 160 x 90 px (GIF a x4 = 640 x 360), 360 cuadros a 30 fps (12 s), sin corte:
// el último cuadro lleva al primero (la terminal se borra con un barrido y el violeta se retira desde el centro).
// Clawd va "en dos" (cada dibujo dura 2 cuadros); texto, barra, chispas y anillos se mueven a 30 fps.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): la laptop es una computadora beige de los 90
// (CRT en rosa té y flamenco con la ficha THEME en su cristal, y un teclado delante de Clawd, unidos por un cable);
// la mesa de madera es un plinto de mármol con greca; INSTALL.EXE, la barra de estado y la lista son ventanas de los
// 90 con biselado y tres cajitas; el fondo, una nebulosa violeta con estrellas y dos columnas dóricas tenues; la
// transformación violeta suma un halo de nebulosa tramada. Clawd sigue siendo el protagonista.
include("kit.px.js")

const W = 160, H = 90, N = 360;
const CX = 132, FEET = 76, X0 = 108, Y0 = 44, CY = 60;   // Clawd: centro, pies, esquina de la pose, centro del cuerpo
const DESK = 83;                                          // y del plinto
const TERM = { x: 1, y: 2, w: 126, h: 41 };             // ventana INSTALL.EXE
const CHIP = { x: 131, y: 4, w: 26, h: 27 };            // ficha "THEME", en el cristal del CRT
const HUDB = { x: 1, y: 47, w: 97, h: 12 };             // barra de estado
const PANEL = { x: 1, y: 61, w: 97, h: 20 };            // lista de pasos / rótulo AETHER ON
const CRTB = { x: 128, y: 0, w: 32, h: 40 };            // caja del CRT (cuerpo y pie; la repisa va debajo)

// Mármol (del violeta claro al oscuro), plástico beige (rosa té y flamenco de Mocha) y el gris de las ventanas de los 90.
pal({ "&": "#f3eaff", "%": "#e6dcff", "^": "#cba6f7", "*": "#8466d6", "+": "#4a3a8a",
  "(": "#f5e0dc", ")": "#f2cdcd", "$": "#eba0ac", I: "#9399b2", d: "#a6adc8", q: "#7f849c" });

// ------------------------------------------------------------------ texto de la terminal
// Ancho de cada glifo de la fuente 3x5 (casi todos 3; los signos finos, menos).
const gw = (ch) => ({ ".": 1, ":": 1, "!": 1, "'": 1, ",": 2, ";": 2, "(": 2, ")": 2 }[ch] ?? 3);
const adv = (s) => [...s].reduce((a, ch) => a + gw(ch) + 1, 0);

// Cuándo aparece cada letra de lo que se teclea: ritmo humano, pausa corta tras cada espacio.
function sched(str, t0) {
  const rnd = seeded(7 + t0), times = [];
  let t = t0;
  for (const ch of str) { times.push(Math.round(t)); t += 1.0 + rnd() * 1.1 + (ch === " " ? 1.6 : 0); }
  return { str, times, end: times[times.length - 1] };
}
const nTyped = (S, f) => { let n = 0; while (n < S.times.length && S.times[n] <= f) n++; return n; };

// ------------------------------------------------------------------ guion (cuadros)
const S1 = sched("CLAUDE PLUGIN INSTALL AETHER", 14);
const T = {};
T.enter1 = S1.end + 5;          // Enter del primer comando
T.bar0 = T.enter1 + 3;          // la barra empieza a llenarse
T.bar1 = T.bar0 + 68;           // barra llena
T.ok = T.bar1 + 3;              // aparece OK INSTALLED
const S2 = sched("CLAUDE --AGENT AETHER:LEAD", T.ok + 26);
T.enter2 = S2.end + 5;          // Enter del segundo comando
T.charge = T.enter2 + 3;        // la ventana se carga, la ficha se enciende
T.bolt = T.charge + 11;         // sale el rayo
T.hit = T.bolt + 5;             // impacto
T.morph = T.hit + 12;           // la piel se vuelve galaxia
T.power = T.morph + 24;         // anillo, contorno, AETHER ON
T.up = T.power + 24;            // Clawd levanta los brazos
T.reset = T.up + 30;            // empieza el regreso al principio

// ------------------------------------------------------------------ Clawd
const BLINKS = [4, 70, 150, 196, 276, 346];
const blinking = (f) => BLINKS.some((b) => f >= b && f < b + 3);
// Tecleo con causa: el brazo baja en el cuadro en que sale una letra.
const press = (S, f) => {
  const g = two(f) * 2, n = nTyped(S, g);
  return n > nTyped(S, g - 3) ? (n % 2 ? "type_l" : "type_r") : "idle";
};
function clawd(f) {
  const s = { pose: "idle", dx: 0, dy: 0, eyes: "sq" };
  const g = two(f) * 2, h = f - T.hit;
  if (f < S1.times[0]) s.eyes = f >= 3 ? "down" : "sq";
  else if (f < T.enter1) { s.pose = press(S1, f); s.eyes = "down"; }
  else if (f < T.enter1 + 3) { s.pose = "type_r"; s.eyes = "down"; }
  else if (f < T.bar0 + 10) s.eyes = "up";
  else if (f < T.bar1 - 6) {
    const k = f - (T.bar0 + 10);
    if (k % 30 < 20) { s.pose = ["type_l", "idle", "type_r", "idle"][two(f) % 4]; s.eyes = "down"; }
    else s.eyes = "up";
  } else if (f < T.ok + 3) s.eyes = "up";
  else if (f < T.ok + 12) { s.eyes = "happy"; s.dy = f < T.ok + 7 && two(f) % 2 === 0 ? -1 : 0; }
  else if (f < S2.times[0] - 4) s.eyes = "sq";
  else if (f < T.enter2) { s.pose = press(S2, f); s.eyes = "down"; }
  else if (f < T.enter2 + 3) { s.pose = "type_r"; s.eyes = "down"; }
  else if (f < T.charge + 3) s.eyes = "up";
  else if (f < T.charge + 6) { s.pose = "surprise"; s.eyes = "wide"; }
  else if (f < T.hit) { s.pose = "surprise"; s.eyes = "wide"; s.dx = two(f) % 2 ? 1 : -1; }   // los brazos buscan el rayo y tiembla
  else if (h < 6) { s.pose = "smear"; s.eyes = "wide"; }
  else if (h < 8) { s.pose = "smear2"; s.eyes = "wide"; }
  else if (h < 18) { s.pose = "squash"; s.eyes = "x"; }
  else if (h < 24) { s.pose = "surprise"; s.eyes = "wide"; }
  else if (f < T.up - 4) s.eyes = "sq";
  else if (f < T.up) { s.pose = "squash"; s.eyes = "happy"; }                       // se agacha antes del salto
  else if (f < T.reset) {
    const t = f - T.up;
    if (t < 2) s.pose = "surprise";
    else { s.pose = "armsup"; if (t < 16) { const u = (t - 1) / 15; s.dy = -Math.round(12 * u * (1 - u)); } }
    s.eyes = "happy";
  } else if (f < T.reset + 5) { s.pose = f < T.reset + 3 ? "squash" : "idle"; s.eyes = "happy"; }   // aterriza
  else if (f < T.reset + 14) s.eyes = "sq";
  if (s.eyes === "sq" && blinking(f)) s.eyes = "blink";
  if (s.eyes === "down" && blinking(f)) s.eyes = "blink";
  return s;
}

function nebula(x, y, f, dy) {
  const u = x - X0, v = y - (Y0 + dy), drift = f / 10;
  const st = hash(u + Math.floor(drift * 0.6), v, 7);
  if (st < 0.03) return (Math.floor(f / 6) + Math.floor(st * 1000)) % 7 === 0 ? "S" : "s";
  const vc = 3 + 0.55 * u + 3 * Math.sin((u + drift) * 0.15);
  const I = 1 - Math.abs(v - vc) / 11 + 0.45 * (vnoise(u + drift, v, 5) - 0.5) + 0.2 * (vnoise(u - drift * 0.5 + 40, v + 17, 3) - 0.5);
  const L = clamp01(I) * 5, i = Math.floor(L);
  return "nNmMvV"[Math.min(5, i + (bay(x, y) < L - i ? 1 : 0))];
}

// Radio de la onda de piel: sale del centro del cuerpo hacia fuera (a violeta) y, al final, otra regresa a naranja.
const r1At = (f) => ease((f - T.morph) / 24) * 34;
const r2At = (f) => ease((f - (T.reset + 4)) / 22) * 34;
function skin(f, dy) {
  const h = f - T.hit;
  if (f < T.hit) return "o";
  if (h < 2) return "c";
  if (h < 5) return "y";                                               // la descarga lo blanquea
  if (f < T.morph) return Math.floor(f / 2) % 2 ? "l" : "o";           // parpadea entre lavanda y naranja
  if (f >= T.reset + 4 + 22) return "o";
  const R1 = r1At(f), R2 = r2At(f);
  return (x, y) => {
    const d = Math.hypot(x - CX, (y - CY - dy) * 1.25);
    const tone = (r, inner, outer, edge) => {
      if (d < r - 2) return inner;
      if (d >= r + 2) return outer;
      if (r > 1 && Math.abs(d - r) < 0.8) return edge;
      return bay(x, y) < (r + 2 - d) / 4 ? inner : outer;
    };
    const k = f < T.power ? tone(R1, "*", "o", "v") : f < T.reset + 4 ? "*" : tone(R2, "o", "*", "y");
    return k === "*" ? nebula(x, y, f, dy) : k;
  };
}
// Los ojos se aclaran cuando la onda de piel los alcanza.
function eyeKey(f, ex, ey, dy) {
  const d = Math.hypot(ex - CX, (ey - CY - dy) * 1.25);
  if (f < T.morph || f >= T.reset + 4 + 22) return "k";
  if (f < T.power) return d < r1At(f) ? "e" : "k";
  if (f < T.reset + 4) return "e";
  return d < r2At(f) ? "k" : "e";
}

function outline(c, list, f) {
  const mask = new Uint8Array(W * H);
  for (const i of list) mask[i] = 1;
  const dil = (m) => {
    const o = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (!m[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) o[yy * W + xx] = 1;
    }
    return o;
  };
  const d1 = dil(mask), d2 = dil(d1), d3 = dil(d2);
  const flash = f < T.power + 3 || f >= T.reset;
  const inner = flash ? "y" : "a", outer = Math.floor(f / 20) % 3 === 0 ? "L" : "A";
  for (let i = 0; i < W * H; i++) {
    if (mask[i]) continue;
    if (d1[i]) c.px(i % W, (i / W) | 0, inner);
    else if (d3[i] && !d2[i] && f >= T.power + 6 && f < T.reset) c.px(i % W, (i / W) | 0, outer);
  }
}

// ------------------------------------------------------------------ fondo: nebulosa, estrellas y dos columnas dóricas
// Todo el fondo se calcula una vez: queda quieto y no pesa en el GIF (solo titilan unas pocas estrellas).
const COLS = [{ x: 100, top: 43 }, { x: 150, top: 43 }];     // dos columnas dóricas tenues, a los lados de Clawd
const BG = (() => {
  const bg = new Array(W * H).fill("z");
  const set = (x, y, k) => { if (x >= 0 && x < W && y >= 0 && y < DESK) bg[y * W + x] = k; };
  for (let y = 0; y < DESK; y++)
    for (let x = 0; x < W; x++) {
      // la nebulosa se concentra donde el fondo se ve: la franja bajo la terminal y el costado de Clawd
      const open = Math.max(x >= 98 ? 0.3 : 0, y >= 42 && y < 47 ? 0.25 : 0) * (1 - clamp01((y - 70) / 13));
      const v = 0.6 * vnoise(x, y, 28) + 0.4 * vnoise(x + 71, y + 13, 11) + open;
      const t = clamp01((v - 0.5) / 0.3);
      if (t <= 0) continue;
      let k = "z";
      if (bay(x, y) < t * 0.8) k = "n";
      if (t > 0.5 && bay(x, y) < (t - 0.5) * 1.2) k = "N";
      if (t > 0.85 && bay(x, y) < 0.5) k = "m";
      bg[y * W + x] = k;
    }
  // columnas: capitel (ábaco y equino), fuste acanalado y basa; tenues, en violeta de nebulosa
  for (const { x, top } of COLS) {
    for (let i = 0; i < 12; i++) { set(x - 2 + i, top, "m"); set(x - 2 + i, top + 1, "N"); }
    for (let i = 1; i < 11; i++) set(x - 2 + i, top + 2, i % 2 ? "n" : "N");
    for (let i = 0; i < 8; i++) set(x + i, top + 3, "m");
    for (let y = top + 4; y < DESK - 3; y++)
      for (let i = 0; i < 8; i++) set(x + i, y, i === 0 ? "m" : i === 7 ? "1" : i % 2 ? "N" : "n");
    for (let i = 0; i < 12; i++) { set(x - 2 + i, DESK - 3, "N"); set(x - 2 + i, DESK - 2, "m"); set(x - 2 + i, DESK - 1, "n"); }
  }
  return bg;
})();
const STARS = (() => {
  const r = seeded(11), out = [];
  const hidden = (x, y) => [TERM, HUDB, PANEL, CRTB].some((b) => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h + 4);
  while (out.length < 22) {
    const x = 1 + Math.floor(r() * 158), y = Math.floor(r() * 80), ph = Math.floor(r() * 60);
    if (!hidden(x, y) && (BG[y * W + x] === "z" || BG[y * W + x] === "n")) out.push([x, y, ph]);
  }
  return out;
})();

// Halo de la transformación: nebulosa tramada con Bayer alrededor de Clawd, que crece con la onda violeta y se retira con ella.
function halo(c, f) {
  const g = f < T.morph ? 0 : f < T.power ? ease((f - T.morph) / 24) : f < T.reset ? 1 : 1 - ease((f - T.reset) / 24);
  if (g <= 0) return;
  const RX = 40 * g, RY = 34 * g, p = Math.floor(f / 2);
  for (let y = Math.max(0, Math.floor(CY - RY)); y < Math.min(DESK, CY + RY); y++)
    for (let x = Math.max(0, Math.floor(CX - RX)); x < W; x++) {
      const d = Math.hypot((x - CX) / RX, (y - CY) / RY);
      if (d >= 1) continue;
      const q = 0.6 + 0.8 * (vnoise(x, y, 7) - 0.4);
      const L = clamp01((1 - d) * 1.5 * q) * 3, i = Math.floor(L);      // solo los tonos oscuros: el cuerpo de Clawd se sigue leyendo
      const k = "znNm"[Math.min(3, i + (bay(x, y) < L - i ? 1 : 0))];
      if (k !== "z") c.px(x, y, k);
    }
  for (const [sx, sy, ph] of [[104, 42, 0], [112, 70, 11], [154, 56, 6], [146, 36, 15], [138, 80, 3]])   // chispas de polvo estelar
    if (g > 0.5 && (p + ph) % 8 < 3) sparkle(c, sx, sy, (p + ph) % 8 === 1 ? 2 : 1, "S", "v");
}

// ------------------------------------------------------------------ cuarto: fondo, cable, CRT y plinto
function room(c, f) {
  for (let y = 0; y < DESK; y++) for (let x = 0; x < W; x++) c.px(x, y, BG[y * W + x]);
  for (const [x, y, ph] of STARS) c.px(x, y, (f + ph) % 60 < 4 ? "s" : "S");
  halo(c, f);
  cableAndCrt(c, f);
  plinth(c);
}

// Plinto de mármol (estilóbato): labio de luz, friso de greca y base en sombra.
const GREC = ["*******.", "*.....*.", "*.***.*."];
function plinth(c) {
  c.hline(0, DESK, W, "&");
  c.rect(0, DESK + 1, W, 6, "%");
  for (let x = 0; x < W; x++)
    for (let r = 0; r < 3; r++) if (GREC[r][x & 7] === "*") c.px(x, DESK + 2 + r, r === 2 ? "+" : "*");
  c.hline(0, DESK + 5, W, "^");
  c.hline(0, DESK + 6, W, "*");
  for (const sx of [26, 70, 118]) c.vline(sx, DESK + 1, 4, "^");        // juntas entre bloques
}

// El teclado se une al CRT con un cable que sube por la derecha; el CRT descansa en una repisa de mármol.
const CABLE = (() => {
  const pts = [];
  for (let k = 0; k <= 60; k++) {
    const u = k / 60, [x, y] = bez([157, 75], [161, 60], [152, 44], u);
    if (!pts.length || pts[pts.length - 1][0] !== x || pts[pts.length - 1][1] !== y) pts.push([x, y]);
  }
  return pts;
})();
function cableAndCrt(c, f) {
  const lit = f >= T.power && f < T.reset + 14;
  // repisa de mármol bajo el CRT, con su sombra tramada
  c.rect(126, 40, 34, 3, "%"); c.hline(126, 40, 34, "&"); c.hline(126, 42, 34, "^");
  c.hline(126, 43, 34, "+");
  for (let x = 126; x < 160; x++) if (bay(x, 44) < 0.5) c.px(x, 44, "1");
  // cable
  CABLE.forEach(([x, y], i) => { if (inside(x, y)) c.px(x, y, i % 6 < 3 ? "I" : "q"); });
  // CRT: caja, biseles, cristal, pie y mentón
  const { x, y, w } = CRTB;
  c.rect(x, y, w, 37, ")");
  c.hline(x + 1, y, w - 2, "(");
  c.vline(x, y + 1, 36, "("); c.vline(x + 1, y + 1, 30, "(");
  c.vline(x + w - 1, y + 1, 36, "$"); c.hline(x + 1, y + 36, w - 2, "$");
  c.hline(x + 2, y + 35, w - 4, "$");
  c.px(x, y, "z"); c.px(x + w - 1, y, "z");                                 // esquinas redondeadas
  c.px(x, y + 36, "z"); c.px(x + w - 1, y + 36, "z");
  c.rect(x + 2, y + 3, 28, 29, "K");                                         // el cristal: aro oscuro; la ficha va dentro
  c.hline(x + 2, y + 31, 28, "$");
  c.vline(x + 2, y + 31, 1, "$");
  // mentón: botones, ranuras, placa y luz de encendido
  c.rect(x + 4, y + 34, 3, 1, "$"); c.rect(x + 9, y + 34, 3, 1, "$");
  c.hline(x + 15, y + 33, 7, "$"); c.hline(x + 15, y + 35, 7, "$");
  c.rect(x + 24, y + 33, 4, 3, lit ? "v" : "(");
  if (lit) c.px(x + 25, y + 34, "y");
  c.px(x + 30, y + 34, lit ? (f % 30 < 18 ? "l" : "L") : (f % 30 < 18 ? "j" : "I"));
  // pie
  c.rect(x + 8, y + 37, 16, 2, "$"); c.hline(x + 8, y + 37, 16, ")");
  c.rect(x + 3, y + 39, 26, 1, "I"); c.hline(x + 3, y + 39, 26, "$");
}

// Teclado beige delante de Clawd: tres filas de teclas, barra espaciadora y la tecla que se pulsa en cada letra.
const KEYS = (() => {
  const out = [];
  [S1, S2].forEach((S, s) => S.times.forEach((t, i) => {
    const row = Math.floor(hash(t, i, s) * 3), left = i % 2 === 0;
    out.push({ t, row, x: left ? 109 + Math.floor(hash(i, t, 3) * 5) * 4 : 138 + Math.floor(hash(i, t, 4) * 5) * 4 });
  }));
  out.push({ t: T.enter1, row: 1, x: 150 }, { t: T.enter2, row: 1, x: 150 });
  return out;
})();
function keyboard(c, f) {
  const lit = f >= T.power && f < T.reset + 14;
  for (let r = 0; r < 9; r++) {
    const e = Math.round((r * 3) / 8), xl = 108 - e, xr = 156 + e, y = 74 + r;
    c.hline(xl, y, xr - xl + 1, r === 0 ? "(" : ")");
    c.px(xl, y, "K"); c.px(xr, y, "K");
  }
  c.hline(109, 73, 47, "K");                                                 // borde de atrás
  c.hline(107, 82, 51, "K");                                                 // borde de delante
  for (let k = 0; k < 3; k++) {
    const y = 76 + k * 2, e = Math.round(((y - 74) * 3) / 8), xl = 108 - e, xr = 156 + e;
    const space = k === 2;
    for (let kx = xl + 2 + (k % 2) * 2; kx + 3 <= xr - 1; kx += 4) {
      if (space && kx >= 120 && kx < 144) continue;
      c.hline(kx, y, 3, "(");
      c.hline(kx, y + 1, 3, "$");
    }
    if (space) { c.hline(120, y, 24, "("); c.hline(120, y + 1, 24, "$"); }
  }
  // tecla pulsada: se ilumina dos cuadros
  for (const kx of KEYS) {
    const t = f - kx.t;
    if (t < 0 || t > 2) continue;
    const y = 76 + kx.row * 2;
    c.hline(kx.x, y, 3, t < 2 ? "y" : "l");
    c.hline(kx.x, y + 1, 3, t < 2 ? "l" : "L");
  }
  if (lit) { c.rect(150, 74, 3, 1, "v"); c.px(151, 74, "y"); }               // la placa del teclado se enciende de violeta
}

// ------------------------------------------------------------------ interfaz (terminal, ficha, estado, pasos)
const caretOn = (fb, last) => fb - last < 6 || Math.floor(fb / 15) % 2 === 0;
// Progreso de la instalación: avanza por tirones y se detiene un momento, como un instalador de verdad.
const PROG = [[0, 0], [0.1, 0.14], [0.18, 0.14], [0.4, 0.5], [0.48, 0.5], [0.62, 0.74], [0.7, 0.74], [0.92, 0.97], [1, 1]];
function prog(fs) {
  const u = clamp01((fs - T.bar0) / (T.bar1 - T.bar0));
  for (let i = 1; i < PROG.length; i++)
    if (u <= PROG[i][0]) return lerp(PROG[i - 1][1], PROG[i][1], (u - PROG[i - 1][0]) / (PROG[i][0] - PROG[i - 1][0]));
  return 1;
}

// Marco de ventana de los 90: gris lavanda biselado (luz arriba y a la izquierda, sombra abajo y a la derecha).
function frame(c, x, y, w, h, face) {
  c.rect(x, y, w, h, face);
  c.hline(x, y, w - 1, "&"); c.vline(x, y, h - 1, "&");
  c.hline(x, y + h - 1, w, "Y"); c.vline(x + w - 1, y, h, "Y");
  c.hline(x + 1, y + h - 2, w - 2, "q"); c.vline(x + w - 2, y + 1, h - 2, "q");
}
// Hueco hundido para el contenido: sombra arriba y a la izquierda, luz abajo y a la derecha.
function well(c, x, y, w, h, body, edge) {
  c.rect(x, y, w, h, body);
  c.hline(x, y, w, edge ?? "Y"); c.vline(x, y, h, edge ?? "Y");
  c.hline(x, y + h - 1, w, edge ? edge : "&"); c.vline(x + w - 1, y, h, edge ? edge : "&");
}
// Botoncito de la barra de título (5 x 5): minimizar, maximizar, cerrar.
function tbox(c, bx, by, kind, face, ink) {
  c.rect(bx, by, 5, 5, face);
  c.hline(bx, by, 5, "&"); c.vline(bx, by, 5, "&"); c.hline(bx, by + 4, 5, "Y"); c.vline(bx + 4, by, 5, "Y");
  if (kind === 0) c.hline(bx + 1, by + 3, 3, ink);
  else if (kind === 1) c.box(bx + 1, by + 1, 3, 3, ink);
  else [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]].forEach(([qx, qy]) => c.px(bx + qx, by + qy, "u"));
}

function terminal(c, fs, fb) {
  const flash = (fs >= T.enter1 && fs < T.enter1 + 2) || (fs >= T.enter2 && fs < T.enter2 + 3);
  const charging = fs >= T.charge && fs < T.hit;
  const body = flash ? "l" : charging && two(fs) % 3 === 0 ? "Z" : "c";
  const face = flash ? "f" : charging ? (two(fs) % 2 ? "L" : "l") : "d";
  const ink = flash ? "c" : "x", dim = flash ? "c" : "X";
  const { x, y, w, h } = TERM;
  frame(c, x, y, w, h, face);
  // barra de título: degradado tramado de violeta oscuro a violeta, con el nombre y tres cajitas
  const tb = flash ? null : { x: x + 2, y: y + 2, w: w - 4, h: 7 };
  for (let yy = 0; yy < 7; yy++)
    for (let xx = 0; xx < w - 4; xx++) c.px(x + 2 + xx, y + 2 + yy, flash ? "l" : bay(x + xx, y + yy) < xx / (w - 4) * 1.05 ? "A" : "+");
  c.text(x + 5, y + 3, "INSTALL.EXE", flash ? "c" : "&");
  [0, 1, 2].forEach((k) => tbox(c, x + w - 20 + k * 6, y + 3, k, face, "c"));
  well(c, x + 2, y + 10, w - 4, h - 12, body);   // hueco hundido del contenido
  const L = [y + 11, y + 18, y + 25, y + 32];                 // cuatro renglones
  // 1. $ claude plugin install aether
  const t1 = nTyped(S1, fs);
  c.text(x + 4, L[0], "$", dim);
  c.text(x + 9, L[0], S1.str.slice(0, t1), ink);
  if (fs < T.enter1 && caretOn(fb, t1 ? S1.times[t1 - 1] : -99)) c.rect(x + 9 + adv(S1.str.slice(0, t1)), L[0], t1 === 28 ? 2 : 3, 5, ink);
  // 2. barra de progreso con pasos tramados
  if (fs >= T.enter1 + 2) {
    const p = fs >= T.bar1 ? 1 : prog(fs), done = fs >= T.bar1;
    const bf = fs >= T.bar1 && fs < T.bar1 + 3;
    c.box(x + 4, L[1], 93, 5, bf ? "y" : "F");
    c.rect(x + 5, L[1] + 1, 91, 3, "c");
    const wpx = p * 91;
    for (let i = 0; i < 91; i++) {
      if (i % 4 === 3) continue;                              // cada tres columnas, una ranura: se lee como pasos
      const cov = clamp01((wpx - i) / 5);
      if (cov <= 0) continue;
      for (let r = 0; r < 3; r++)
        if (cov >= 1 || bay(x + 5 + i, L[1] + 1 + r) < cov) c.px(x + 5 + i, L[1] + 1 + r, ["T", "j", "4"][r]);
    }
    c.text(x + 99, L[1], `${Math.floor(p * 100)}%`, done ? "j" : ink);
  }
  // 3. OK INSTALLED, en verde
  const t3 = Math.max(0, Math.min(12, fs - T.ok + 1));
  if (t3 > 0) c.text(x + 4, L[2], "OK INSTALLED".slice(0, t3), "j");
  // 4. $ claude --agent aether:lead
  if (fs >= T.ok + 12) {
    const t2 = nTyped(S2, fs);
    c.text(x + 4, L[3], "$", dim);
    c.text(x + 9, L[3], S2.str.slice(0, t2), ink);
    if (fs < T.enter2 && caretOn(fb, t2 ? S2.times[t2 - 1] : T.ok + 12)) c.rect(x + 9 + adv(S2.str.slice(0, t2)), L[3], 3, 5, ink);
  }
}

function sparkle(c, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  if (inside(x, y)) c.px(x, y, col);
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, arm);
}

// Ficha del tema, en el cristal del CRT: naranja Claude; al instalar asoma el violeta; al cargar se enciende y al final queda violeta.
function chip(c, fs, fb) {
  const { x, y, w, h } = CHIP;
  const ch = fs >= T.charge && fs < T.hit ? ease((fs - T.charge) / (T.hit - T.charge)) : 0;
  const lit = fs >= T.charge && fs < T.hit;
  c.rect(x, y, w, h, lit && two(fs) % 2 ? "Z" : "c");
  c.box(x, y, w, h, lit ? (two(fs) % 2 ? "y" : "l") : "F");
  c.text(x + 4, y + 3, "THEME", "X");
  // muestra de color
  const sx = x + 3, sy = y + 11, sw = 20, sh = 6;
  const sweep = fs < T.morph ? 0 : fs < T.power ? ease((fs - T.morph) / 24) * sw : sw;
  for (let i = 0; i < sw; i++)
    for (let r = 0; r < sh; r++) {
      const px = sx + i, py = sy + r;
      let k = "o";
      if (fs >= T.ok && fs < T.morph && i >= 14) k = bay(px, py) < 0.5 + 0.4 * Math.sin(fs / 5) ? "M" : "o";     // el violeta asoma
      if (lit && i >= 14) k = bay(px, py) < 0.4 + 0.6 * ch ? "v" : "M";
      if (i < sweep) { const Lr = (i / (sw - 1)) * 5, q = Math.floor(Lr); k = "nNmMvV"[Math.min(5, q + (bay(px, py) < Lr - q ? 1 : 0))]; }
      c.px(px, py, k);
    }
  c.box(sx - 1, sy - 1, sw + 2, sh + 2, "F");
  const aether = fs >= T.power;
  c.text(x + 2, y + 19, aether ? "AETHER" : "CLAUDE", aether ? (fs < T.power + 3 ? "y" : "w") : "o");
}
// El cristal se enciende al cargar: halo tramado alrededor del CRT, en el fondo.
function crtGlow(c, fs) {
  if (fs < T.charge || fs >= T.hit) return;
  const ch = ease((fs - T.charge) / (T.hit - T.charge));
  for (let yy = 0; yy < 50; yy++)
    for (let xx = 118; xx < W; xx++) {
      if (xx >= CRTB.x && yy < 40) continue;
      const dx = Math.max(CRTB.x - xx, 0, xx - (CRTB.x + CRTB.w - 1)), dy = Math.max(yy - 43, 0);
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < 8 && bay(xx, yy) < ((8 - d) / 8) * ch * 0.9 && c.is(xx, yy, "znNm")) c.px(xx, yy, ch > 0.6 ? "M" : "N");
    }
}

// Barra de estado, como el hud de aether.px.js, con marco de ventana de los 90.
function hud(c, fs, fb) {
  const { x, y, w, h } = HUDB;
  const flash = (fs >= T.ok && fs < T.ok + 3) || (fs >= T.power && fs < T.power + 4) || (fs >= T.enter2 && fs < T.enter2 + 3);
  frame(c, x, y, w, h, flash ? "f" : "d");
  well(c, x + 2, y + 2, w - 4, h - 4, flash ? "l" : "c");
  let left = "> READY", lc = "x", right = "0/2", rc = "X";
  if (fs >= T.enter1 && fs < T.ok) { left = "> INSTALLING" + ".".repeat(Math.floor(fs / 8) % 4); }
  else if (fs >= T.ok && fs < T.enter2) { left = "> INSTALLED"; lc = "j"; right = "1/2"; rc = "j"; }
  else if (fs >= T.enter2 && fs < T.power) { left = "> STARTING AETHER"; right = "1/2"; rc = "j"; }
  else if (fs >= T.power) { left = "> AETHER ON"; lc = "w"; right = "2/2"; rc = "w"; }
  c.text(x + 5, y + 4, left, flash ? "c" : lc);
  c.text(x + w - 6, y + 4, right, flash ? "c" : rc, { align: "r" });
  if (fs < T.enter1 && caretOn(fb, -99)) c.rect(x + 5 + adv(left), y + 4, 3, 5, "x");
}

// Lista de dos pasos; al arrancar Aether se cambia por el rótulo AETHER ON.
function panel(c, fs, fb) {
  const { x, y, w, h } = PANEL;
  if (fs < T.power) {
    frame(c, x, y, w, h, "d");
    well(c, x + 2, y + 2, w - 4, h - 4, "c");
    [["INSTALL PLUGIN", T.ok + 2], ["START AETHER", T.morph + 6]].forEach(([label, tick], i) => {
      const ry = y + 4 + i * 7, done = fs >= tick;
      c.box(x + 5, ry, 5, 5, done ? "j" : "F");
      if (done) { c.rect(x + 6, ry + 1, 3, 3, "Q"); paintGrid(c, PROPS.check, x + 4, ry, { y: fs < tick + 3 ? "y" : "j" }); }
      c.text(x + 14, ry, label, done ? "x" : "X");
    });
    return;
  }
  const t = fs - T.power;
  frame(c, x, y, w, h, t < 3 ? "f" : "d");
  well(c, x + 2, y + 2, w - 4, h - 4, "c", t < 3 ? "y" : t < 8 ? "l" : "A");
  const rw = Math.max(2, Math.round((w - 6) * ease(t / 9)));
  c.clip([x + 3 + Math.floor((w - 6 - rw) / 2), y + 3, rw, h - 6], () => {
    c.text(x + Math.floor(w / 2), y + 5, "AETHER ON", t < 3 ? "y" : "w", { scale: 2, align: "c", shadow: t < 3 ? "l" : "N" });
  });
  if (t >= 8) {                                                // dos destellos a los lados
    const s = [1, 2, 3, 2][two(t) % 4];
    sparkle(c, x + 8, y + 7, s, "y", "v");
    sparkle(c, x + w - 9, y + h - 8, [3, 2, 1, 2][two(t) % 4], "y", "v");
  }
}

function ui(c, fs, fb) {
  // Las cajas se dibujan siempre completas; el barrido de borrado reparte dos estados en una misma imagen.
  terminal(c, fs, fb);
  hud(c, fs, fb);
  panel(c, fs, fb);
  chip(c, fs, fb);
  if (fs >= T.ok + 10 && fs < T.ok + 26) sparkle(c, TERM.x + 4 + adv("OK INSTALLED") + 2, TERM.y + 28, [1, 2, 3, 2, 1, 1, 1, 1][fs - T.ok - 10], "y", "T");
}
function uiLayer(c, f) {
  const R0 = T.reset, line = f < R0 + 6 ? -1 : Math.round(ease((f - (R0 + 6)) / 22) * (DESK + 2));
  if (line < 0) { ui(c, f, f); return; }
  if (line < DESK + 2) c.clip((x, y) => y >= line, () => ui(c, R0, f));    // abajo, el estado viejo todavía
  c.clip((x, y) => y < line, () => ui(c, 0, f));                       // arriba, ya limpio
  if (line < DESK + 2) { c.hline(0, line, W, "y"); if (line > 0) c.hline(0, line - 1, W, "l"); }
}

// ------------------------------------------------------------------ rayo, carga y ondas
const A_ = [144, 34], B_ = [137, 47];
const BOLTS = [0, 1, 2, 3].map((v) => {
  const rnd = seeded(900 + v), pts = [A_];
  for (let k = 1; k < 5; k++) pts.push([Math.round(lerp(A_[0], B_[0], k / 5) + (rnd() - 0.5) * 9), Math.round(lerp(A_[1], B_[1], k / 5))]);
  pts.push(B_);
  return pts;
});
function boltSeg(c, pts, u, col, wd) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const su = clamp01(u * n - i);
    if (su <= 0) break;
    c.line(pts[i][0], pts[i][1], Math.round(lerp(pts[i][0], pts[i + 1][0], su)), Math.round(lerp(pts[i][1], pts[i + 1][1], su)), col, wd);
  }
}
function bolt(c, f, dark) {
  const pts = BOLTS[two(f) % BOLTS.length];
  if (dark) { boltSeg(c, pts, 1, "c", 3); return; }
  const h = f - T.hit;
  if (f >= T.bolt && f < T.hit) {                                     // baja del CRT a la cabeza de Clawd
    const u = (f - T.bolt + 1) / (T.hit - T.bolt);
    boltSeg(c, pts, u, "L", 3); boltSeg(c, pts, u, "y", 1);
    return;
  }
  if (h < 0 || h >= 14 || (h >= 8 && f % 3 === 0)) return;
  const strong = h < 8;
  if (strong) boltSeg(c, pts, 1, "L", 3);
  boltSeg(c, pts, 1, strong ? "y" : "l", 1);
  if (strong) { const [bx, by] = pts[3]; c.line(bx, by, bx - 7, by + 3, "l"); c.line(bx - 7, by + 3, bx - 9, by + 7, "l"); }
}
// Chispas que salen del punto de impacto.
function sparks(c, f) {
  const h = f - T.hit;
  if (h < 2 || h >= 16) return;
  if (h < 8) sparkle(c, B_[0], B_[1], [3, 3, 3, 2, 2, 1][h - 2], "y", "l");        // destello en el punto de impacto
  const rnd = seeded(31);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9 + (rnd() - 0.5) * 0.2, v = 1.1 + rnd() * 0.9;
    const r = 3 + (h - 2) * v, x = Math.round(B_[0] + Math.cos(a) * r), y = Math.round(B_[1] + Math.sin(a) * r * 0.8 + (h - 2) * (h - 2) * 0.02);
    const col = h < 6 ? "y" : h < 11 ? "l" : "L";
    if (inside(x, y)) c.px(x, y, col);
    if (h < 12 && inside(x - 1, y)) c.px(x - 1, y, col);
  }
}
// Carga: motas que convergen en el CRT y una bola que crece bajo él.
function charge(c, f) {
  if (f < T.charge || f >= T.bolt) return;
  const cxp = CHIP.x + CHIP.w / 2, cyp = CHIP.y + CHIP.h / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.35, ph = ((f - T.charge + i * 3) % 12) / 12, r = lerp(14, 3, ph * ph);
    const x = Math.round(cxp + Math.cos(a) * r), y = Math.round(cyp + Math.sin(a) * r * 0.9);
    if (inside(x, y)) c.px(x, y, ph < 0.6 ? "l" : "y");
    const x2 = Math.round(cxp + Math.cos(a) * (r + 2)), y2 = Math.round(cyp + Math.sin(a) * (r + 2) * 0.9);
    if (ph < 0.8 && inside(x2, y2)) c.px(x2, y2, "L");
  }
  const rr = 1 + 3 * ease((f - (T.charge + 3)) / (T.bolt - T.charge - 3));
  if (f >= T.charge + 3)
    for (let dy = -5; dy <= 5; dy++)
      for (let dx = -5; dx <= 5; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= rr) c.px(A_[0] + dx, A_[1] + dy, d < rr * 0.5 ? "y" : "l");
        else if (d <= rr + 1.3 && bay(A_[0] + dx, A_[1] + dy) < 0.5) c.px(A_[0] + dx, A_[1] + dy, "L");
      }
}
// Órbita: un anillo que se traza alrededor de Clawd con dos cuerpecitos que lo recorren (la mitad de atrás va
// detrás de Clawd, la de adelante delante del teclado).
const OR = { cx: CX, cy: 63, rx: 27, ry: 8 };
const ORBIT_PTS = (() => {
  const seen = new Set(), pts = [];
  for (let k = 0; k < 900; k++) {
    const a = (k / 900) * TAU, x = Math.round(OR.cx + Math.cos(a) * OR.rx), y = Math.round(OR.cy + Math.sin(a) * OR.ry);
    if (!seen.has(x + "," + y)) { seen.add(x + "," + y); pts.push([x, y, a]); }
  }
  return pts;
})();
function orbit(c, f, front) {
  const t0 = T.power + 6;
  if (f < t0 || f >= T.reset + 14) return;
  const sweep = (f < T.reset ? ease((f - t0) / 24) : 1 - ease((f - T.reset) / 14)) * TAU;
  for (const [x, y, a] of ORBIT_PTS) if (a < sweep && (Math.sin(a) > 0) === front && inside(x, y)) c.px(x, y, "r");
  if (f < t0 + 14 || f >= T.reset) return;
  for (const [speed, rad, col, off] of [[1 / 120, 2, "A", 0], [1 / 75, 1, "R", 0.5]]) {
    const a = ((f - t0 - 14) * speed + off) * TAU;
    if ((Math.sin(a) > 0) !== front) continue;
    const x = Math.round(OR.cx + Math.cos(a) * OR.rx), y = Math.round(OR.cy + Math.sin(a) * OR.ry);
    c.circ(x, y, rad, col);
    if (rad > 1) c.px(x - 1, y - 1, "a");
  }
}
function shock(c, f) {
  const t = f - (T.hit + 6);
  if (t < 0 || t > 20) return;
  const rx = Math.round(12 + t * 2.8);
  c.ellipse(CX, DESK + 3, rx, Math.min(7, Math.max(2, Math.round(rx / 6))), t < 6 ? "y" : t < 12 ? "l" : "L", true);
}
function burst(c, f) {
  let t = f - T.power, rx, col;
  if (t >= 0 && t <= 18) { rx = 24 + t * 2.4; col = t < 5 ? "y" : t < 11 ? "a" : "A"; }
  t = f - T.reset;
  if (t >= 0 && t <= 12) { rx = 52 - t * 2.6; col = t < 5 ? "A" : t < 9 ? "a" : "y"; }
  if (rx) c.ellipse(CX, CY, Math.round(rx), Math.round(rx * 0.62), col, true);
}

// El golpe sacude lo que está junto a Clawd (él, el teclado, la columna, el CRT y su repisa) sobre un plinto y una
// nebulosa que no se mueven; las ventanas de la izquierda se quedan quietas. Así se siente igual y el GIF no se
// llena de puntos que cambian.
const BGHEX = { z: 0x0b0a16ff, n: 0x241b52ff, N: 0x35286fff, m: 0x4a3a8aff, 1: 0x1e1b3aff };
const shaken = (x, y) => (x >= 98 && y >= 43) || (x >= 128 && y < 43);
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 0; y < DESK; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y) >>> 0;
  for (let y = 0; y < DESK; y++) for (let x = 0; x < W; x++) if (shaken(x, y)) c.px(x, y, BG[y * W + x]);
  for (let y = 0; y < DESK; y++)
    for (let x = 0; x < W; x++) {
      if (!shaken(x, y)) continue;
      const v = buf[y * W + x], tx = x + dx, ty = y + dy;
      if (v === BGHEX[BG[y * W + x]] >>> 0) continue;
      if (tx < 0 || ty < 0 || tx >= W || ty >= DESK) continue;   // el suelo no se mueve: tiembla lo que está sobre él
      c.px(tx, ty, "#" + v.toString(16).padStart(8, "0"));
    }
}

// Cuadro de impacto en negativo: todo se vuelve silueta oscura sobre blanco.
function negative(c, f, st, x, y) {
  c.rect(0, 0, W, H, "W");
  drawPose(c, st.pose, x, y, 2, "c", false);
  drawEyes(c, eyesOf(st.pose, x, y, 2, false), 2, "wide", "W");
  c.rect(TERM.x, TERM.y, TERM.w, TERM.h, "c");
  c.rect(CRTB.x, CRTB.y, CRTB.w, CRTB.h + 4, "c");
  c.rect(HUDB.x, HUDB.y, HUDB.w, HUDB.h, "c");
  c.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, "c");
  c.rect(105, 73, 55, 10, "c");
  c.rect(0, DESK, W, 7, "c");
  bolt(c, f, true);
}

// ------------------------------------------------------------------ la animación
anim("install", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const f0 = c.frame;
  let f = f0;
  if (f >= T.hit + 2 && f < T.hit + 6) f = T.hit + 2;      // hit-stop: el mundo se congela tras el impacto
  const st = clawd(f);
  const [x, y] = place(st.pose, false, CX + st.dx, FEET + st.dy, 2);

  if (f0 === T.hit || f0 === T.hit + 1) { negative(c, f0, st, x, y); return; }

  room(c, f);
  crtGlow(c, f);
  uiLayer(c, f);
  shock(c, f);
  orbit(c, f, false);
  const mask = drawPose(c, st.pose, x, y, 2, skin(f, st.dy), false);
  eyesOf(st.pose, x, y, 2, false).forEach((e) => drawEyes(c, [e], 2, st.eyes, eyeKey(f, e[0] + 2, e[1] + 2, st.dy)));
  if (f >= T.power && f < T.reset + 4) outline(c, mask, f);
  keyboard(c, f);
  orbit(c, f, true);
  burst(c, f);
  charge(c, f);
  bolt(c, f, false);
  sparks(c, f);
  if (f >= T.hit + 8 && f < T.hit + 18) shake(c, [2, -2, 2, -1, 1, -1, 1, 0, -1, 0][f - T.hit - 8], [1, -1, 0, 1, -1, 0, 1, 0, 0, 0][f - T.hit - 8]);
})

sheet("install_sheet", ["install"], { pad: 0 })
