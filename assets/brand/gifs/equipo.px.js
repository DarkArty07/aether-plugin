// equipo.px.js: «Quién hace qué». 160 x 105 px, 360 cuadros a 30 fps (12 s), bucle sin corte.
// Escenografía: un templo bajo una nebulosa violeta con columnas al fondo; el Writer en una computadora beige de los
// 90 (CRT y teclado) con una ventana de documento; el Judge ante un pedestal de mármol, junto a un busto con los ojos
// vendados, y el sello cae sobre un bloque de mármol; el Examiner enrolla el examen en un pergamino con sello de
// cera y lo guarda en un nicho de piedra con puerta tallada; el enjambre vive en una cornisa; el informe del Lead
// llega a un CRT. Las tarjetas son disquetes de 3,5 pulgadas.
// Aether es un equipo de roles, cada uno con su contexto, y quien escribe un documento nunca lo juzga.
// Cuatro estaciones en un escenario (LEAD, WRITER, JUDGE, EXAMINER) y un enjambre de tres cangrejos arriba a la
// derecha: el Lead pasa la tarjeta de intención al Writer; éste teclea y el documento crece línea a línea; el
// documento pasa al Judge por una línea punteada y el Writer, que se estira hacia el sello, choca con la regla
// (el autor no juzga); el Judge sella REVISE, el Writer corrige, el Judge sella APPROVE (el golpe grande, con
// hit-stop y sacudida); el Examiner guarda un examen oculto en la bóveda y la cierra; el enjambre llega, prueba
// la puerta, rebota (BLOCKED) y se va a construir; el Lead recibe un informe con la tira RADAR y todo se
// reinicia limpio (la tarjeta vuelve a su mano, los cangrejos a su estante, la bóveda queda lista).
// Mismo lenguaje que aether.px.js: los personajes van "en dos", los caminos, los sellos, las chispas, los
// medidores y los puntos de la línea se mueven en cada cuadro; paleta del kit; destello con dither Bayer;
// texto solo con c.text. El fondo está quieto: el movimiento se gasta en la acción.
include("kit.px.js")

const W = 160, H = 105, N = 360;
pal({ q: "#4a1d33", $: "#4a3a1c" });             // fondos oscuros: rojo y ámbar
// Mármol (del violeta claro al oscuro) y plástico beige de los 90 (rosewater / flamingo de Mocha).
pal({ "&": "#f3eaff", "%": "#e6dcff", "^": "#cba6f7", "*": "#8466d6", "+": "#4a3a8a", "(": "#f5e0dc", ")": "#f2cdcd" });

// ------------------------------------------------------------------ guion (cuadros)
const T = {
  wind: 2, go: 6, land: 18, grow: 26,            // el Lead se agacha, suelta la tarjeta; llega; se abre el documento
  type: [26, 58],                                // el Writer teclea
  fly1: [58, 68], scan1: [68, 80],               // el documento pasa al Judge; éste lo revisa
  lean: 64, touch: 74, recoil: 88,               // el Writer se estira hacia el sello, choca, se recoge
  palm: [76, 82],                                // el Judge se sorprende ante el choque
  rev: 92,                                       // sello REVISE
  ret: [97, 106], erase: [108, 113], retype: [113, 127], fade: [104, 112],
  fly2: [130, 139], scan2: [139, 146],
  appr: 158,                                     // sello APPROVE: el golpe grande
  fly3: [170, 180], examW: [180, 192],
  door: [190, 195], page: [195, 204], close: [205, 210], spin: [210, 216], lock: 216,
  wake: 208, poke: 240, leave: 272,              // el enjambre despierta, prueba la puerta, se va
  packet: [276, 294], mon: [292, 300], strip: 302, party: 318, monOff: [338, 346], cardIn: 348,
  back: 298, drain: 348,
};
const K = 7;                                     // separación entre golpes de cangrejo
const HIT = T.appr, HOLD = 4, NEG = 2;

const win = (f, a, b) => f >= a && f < b;
const prog = (f, a, b) => clamp01((f - a) / (b - a));
const gw = (ch) => ({ ".": 1, ":": 1, "!": 1, "'": 1, ",": 2, ";": 2, "(": 2, ")": 2 }[ch] ?? 3);
const adv = (s) => [...s].reduce((a, ch) => a + gw(ch) + 1, 0);
const tw = (s) => adv(s) - 1;

// ------------------------------------------------------------------ geometría
const FLOOR = 82;                                // los pies de los roles
const ROLE = {
  lead: { ax: 14, col: "o", dark: "Y", label: "LEAD", lx: 14 },
  writer: { ax: 44, col: "7", dark: "1", label: "WRITER", lx: 44 },
  judge: { ax: 82, col: "v", dark: "n", label: "JUDGE", lx: 82 },
  exam: { ax: 112, col: "p", dark: "q", label: "EXAMINER", lx: 118 },
};
const SLOT = { writer: 44, judge: 82, exam: 112 };   // centro de cada hueco de documento
const DOCW = 29, DOCH = 23, DOCY = 34;
const BARX = 62;                                 // la regla entre el Writer y el sello
const REST = [87, 61], BACK = [92, 30], DOWN = [77, 41];   // el sello: reposo, vuelo atrás, golpe
const VX = 127, VY = 52;                         // la bóveda
const DOOR = { x: VX + 3, y: VY + 15, w: 27, h: 13 };
const WHEEL = [DOOR.x + 13, DOOR.y + 6];          // el sello de cera, al centro de la puerta
const SHELF = 40;
const SWARM = [{ k: ["t", "T", "4"], sx: 131 }, { k: ["b", "B", "5"], sx: 143 }, { k: ["h", "H", "6"], sx: 154 }];
const arc = (a, b, u, lift = 22) => bez([a - 14, DOCY], [(a + b) / 2 - 14, DOCY - lift], [b - 14, DOCY], ease(u));

// Disquete de 3,5 pulgadas (la tarjeta): 10 x 10, redimensionado por vecino más cercano; S es la franja del nivel.
const FLOP = ["GGGgggGGG.", "GGGgEEgGGG", "GGGgEEgGGG", "GGGgggGGGG", "GGGGGGGGGG", "GyyyyyyyyG", "GSyXXXXXyG", "GSyyyyyyyG", "GSyXXXyyyG", "GGGGGGGGGG"];
function floppy(c, x, y, w, h, stripe) {
  for (let r = 0; r < h; r++)
    for (let q = 0; q < w; q++) {
      const ch = FLOP[Math.min(9, Math.floor(((r + 0.5) * 10) / h))][Math.min(9, Math.floor(((q + 0.5) * 10) / w))];
      if (ch !== "." && inside(x + q, y + r)) c.px(x + q, y + r, ch === "S" ? stripe : ch);
    }
}
// Cuatro vistas del disquete al girar: de frente, ladeado, de canto, ladeado.
const SPINS = [[10, 10, 0, 0], [7, 10, 1, 0], [2, 10, 4, 0], [7, 10, 1, 0]];
function spinFloppy(c, f, x, y, stripe) { const [w, h, ox, oy] = SPINS[two(f) % 4]; floppy(c, x + ox, y + oy, w, h, stripe); }

// ------------------------------------------------------------------ utilidades de dibujo
// Disco con dither Bayer: densidad máxima dens en el centro, cae hacia el borde.
function ditherDisc(c, cx, cy, r, col, dens, ox = 0, hole = 0) {
  for (let y = Math.ceil(cy - r); y <= cy + r; y++)
    for (let x = Math.ceil(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.3);
      if (d > r || d < hole || !inside(x, y)) continue;
      if (bay(x + ox, y) < dens * (1 - d / (r + 1))) c.px(x, y, col);
    }
}
// Marco de dither alrededor de una caja (resplandor del documento).
function ditherFrame(c, x, y, w, h, m, col, dens) {
  for (let yy = y - m; yy < y + h + m; yy++)
    for (let xx = x - m; xx < x + w + m; xx++) {
      if (!inside(xx, yy) || (xx >= x && xx < x + w && yy >= y && yy < y + h)) continue;
      const d = Math.max(x - xx, xx - (x + w - 1), y - yy, yy - (y + h - 1));
      if (bay(xx, yy) < dens * (1 - (d - 1) / m)) c.px(xx, yy, col);
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
// Anillo elíptico que se abre desde un punto (onda de impacto).
function wave(c, x, y, t, life, r1, cols, flat = 0.5) {
  if (t < 0 || t > life) return;
  const r = Math.round(2 + (r1 - 2) * ease(t / life) ** 0.7);
  c.ellipse(x, y, r, Math.max(1, Math.round(r * flat)), t < life * 0.25 ? cols[0] : t < life * 0.6 ? cols[1] : cols[2], true);
}
// Recorre el lienzo para sacudirlo (todo menos la barra de arriba).
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 20; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 20; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(20, y - dy));
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}
// Brazo estirado de un rol (línea gruesa con la mano más clara en la punta).
function armTo(c, x0, y0, x1, y1, col) {
  c.line(x0, y0, x1, y1, col, 2);
  c.rect(x1 - 1, y1 - 1, 3, 3, col);
  c.px(x1, y1 - 1, "x");
}

// ------------------------------------------------------------------ fondo
// Nebulosa violeta con dither Bayer, estrellas y una constelación: se calcula una vez, el fondo no se mueve.
const COLS = [30, 64, 98];                       // centros de las columnas del templo
const NEB = (() => {
  const out = new Array(W * H).fill(null);
  for (let y = 31; y < FLOOR; y++)
    for (let x = 0; x < W; x++) {
      const v = 0.55 * vnoise(x + 13, y + 7, 26) + 0.3 * vnoise(x + 40, y + 90, 12) + 0.15 * vnoise(x, y, 5);
      const b = bay(x, y);
      if (v > 0.42 && b < (v - 0.42) * 5) out[y * W + x] = "n";
      if (v > 0.52 && b < (v - 0.52) * 5) out[y * W + x] = "N";
      if (v > 0.62 && b < (v - 0.62) * 4.5) out[y * W + x] = "m";
      if (v > 0.74 && b < (v - 0.74) * 4) out[y * W + x] = "M";
    }
  return out;
})();
const STARS = (() => {
  const r = seeded(2024), out = [];
  for (let k = 0; k < 46; k++) out.push([Math.floor(r() * W), 32 + Math.floor(r() * 46), r() < 0.2 ? 2 : 1]);
  return out;
})();
const BIGSTARS = [[8, 36], [50, 31], [119, 33], [151, 35]];
const CONST = [[70, 34], [76, 31], [84, 33], [91, 35]];     // la constelación sobre el hueco del Judge
function column(c, cx) {
  const x0 = cx - 3, top = 31, bot = FLOOR;
  c.rect(x0, top + 3, 7, bot - top - 6, "+");
  [[0, "*"], [2, "1"], [4, "1"], [6, "1"]].forEach(([o, k]) => c.vline(x0 + o, top + 3, bot - top - 6, k));
  c.rect(x0 - 1, top, 9, 2, "+"); c.hline(x0 - 1, top, 9, "*");    // ábaco
  c.rect(x0, top + 2, 7, 1, "1");                                  // equino
  c.rect(x0 - 1, bot - 3, 9, 3, "+"); c.hline(x0 - 1, bot - 3, 9, "*");   // base
}
const KEY = ["*******.", "*.....*.", "*.***.*.", "*.*.*.*.", "*.*.***."];   // greca (meandro)
function stage(c) {
  c.rect(0, 0, W, H, "z");
  c.rect(0, 21, W, 61, "Z");
  for (let y = 31; y < FLOOR; y++) for (let x = 0; x < W; x++) { const k = NEB[y * W + x]; if (k) c.px(x, y, k); }
  for (const [x, y, lv] of STARS) if (!NEB[y * W + x] || NEB[y * W + x] === "n") c.px(x, y, lv === 2 ? "3" : "2");
  for (const [x, y] of BIGSTARS) { c.px(x, y, "s"); c.px(x - 1, y, "a"); c.px(x + 1, y, "a"); c.px(x, y - 1, "a"); c.px(x, y + 1, "a"); }
  CONST.forEach(([x, y], k) => {
    if (k) { const [x0, y0] = CONST[k - 1]; for (let t = 2; t < 7; t += 2) c.px(Math.round(x0 + (x - x0) * t / 7), Math.round(y0 + (y - y0) * t / 7), "L"); }
    c.px(x, y, "e"); c.px(x - 1, y, "L"); c.px(x + 1, y, "L");
  });
  for (const cx of COLS) column(c, cx);
  // entablamento: cornisa, arquitrabe y friso con greca
  c.hline(0, 22, W, "*"); c.hline(0, 23, W, "+"); c.hline(0, 24, W, "1");
  c.rect(0, 25, W, 5, "1");
  for (let y = 0; y < 5; y++) for (let x = 0; x < W; x++) if (KEY[y][x % 8] === "*") c.px(x, 25 + y, "+");
  c.hline(0, 30, W, "+"); c.hline(0, 31, W, "1");
  // estilóbato: el escalón de mármol del suelo
  c.rect(0, FLOOR, W, H - FLOOR, "+");
  c.hline(0, FLOOR, W, "%"); c.hline(0, FLOOR + 1, W, "^"); c.hline(0, FLOOR + 2, W, "*");
  for (let x = 16; x < W; x += 32) c.vline(x, FLOOR + 3, 10, "1");
  c.hline(0, FLOOR + 13, W, "1");
}

// Qué estación está activa, con su transición suave de 6 cuadros.
const ACT = [[0, "lead"], [T.land + 2, "writer"], [T.fly1[1], "judge"], [T.ret[0] + 4, "writer"], [T.fly2[1], "judge"], [T.fly3[0] + 2, "exam"], [T.lock + 8, "swarm"], [T.packet[0] + 14, "lead"]];
function actAmt(f, who) {
  let cur = ACT[0][1], t0 = 0, prev = null;
  for (const [t, name] of ACT) { if (f >= t) { prev = cur; cur = name; t0 = t; } }
  const e = t0 === 0 ? 1 : ease((f - t0) / 6);          // la primera estación ya está activa en el cuadro 0 (bucle)
  return (cur === who ? e : 0) + (prev === who && cur !== who ? 1 - e : 0);
}
function plates(c, f) {
  for (const [key, R] of Object.entries(ROLE)) {
    const a = actAmt(f, key), w = tw(R.label) + 7, x = Math.round(R.lx - w / 2);
    // resplandor de la estación sobre la pared, detrás de los personajes
    ditherDisc(c, R.ax, 66, 22, R.dark, 0.1 + 0.4 * a, 0);
    c.rect(x, 85, w, 9, "c");
    c.box(x, 85, w, 9, a > 0.5 ? R.col : "F");
    c.text(x + 3, 87, R.label, a > 0.5 ? R.col : "X");
    if (a > 0.5) c.rect(x + 2, 84, w - 4, 1, R.col);
  }
}

// ------------------------------------------------------------------ roles
function eyes1(c, list, style, key) {
  list.forEach(([x, y]) => {
    switch (style) {
      case "blink": c.rect(x, y + 1, 2, 1, key); break;
      case "happy": c.rect(x, y, 2, 1, key); break;
      case "up": c.rect(x, y - 1, 2, 2, key); break;
      case "down": c.rect(x, y + 1, 2, 2, key); break;
      case "left": c.rect(x - 1, y, 2, 2, key); break;
      case "right": c.rect(x + 1, y, 2, 2, key); break;
      case "wide": c.rect(x, y - 1, 2, 3, key); break;
      default: c.rect(x, y, 2, 2, key);
    }
  });
}
// Un rol: el cuerpo de la pose en su color, un accesorio que cambia la silueta y los ojos.
function actor(c, role, st) {
  const R = ROLE[role], ay = st.ay ?? FLOOR;
  const [x, y] = place(st.pose, st.flip, R.ax + st.dx, ay + st.dy, 1);
  drawPose(c, st.pose, x, y, 1, R.col, st.flip);
  const list = eyesOf(st.pose, x, y, 1, st.flip), [e0, e1] = list;
  let key = "k";
  if (role === "judge") {                        // corona de laurel
    const l = e0[0] - 2, r = e1[0] + 3, top = Math.max(y, e0[1] - 2);
    for (let xx = l; xx <= r; xx++) c.px(xx, top, xx % 2 ? "t" : "4");
    for (let xx = l + 1; xx < r; xx += 3) c.px(xx, top + 1, "4");
    for (const [sx, dir] of [[l, 1], [r, -1]]) { c.px(sx, top + 1, "t"); c.px(sx, e0[1], "4"); c.px(sx, e0[1] + 1, "t"); c.px(sx + dir, e0[1] + 1, "4"); }
  } else if (role === "writer") {                // gafas redondas
    for (const e of list) c.box(e[0] - 1, e[1] - 1, 4, 4, "y");
    c.hline(e0[0] + 3, e0[1], e1[0] - e0[0] - 4, "y");
  } else if (role === "exam") {                  // visera oscura con ojos de escáner
    const l = e0[0] - 2, r = e1[0] + 3;
    c.rect(l, e0[1] - 1, r - l + 1, 4, "c");
    c.hline(l, e0[1] - 1, r - l + 1, "F");
    key = "T";
  }
  eyes1(c, list, st.eyes, key);
  return [x, y];
}
const blinkAt = (f, o) => (f + o) % 96 < 3;
// Saltito de reposo: un rol que espera se alza un píxel cada 80 cuadros, "en dos".
const bobAt = (f, o) => { const ph = (f + o) % 80; return ph < 8 ? [0, 0, -1, -1, -1, -1, 0, 0][ph] : 0; };

function leadState(f) {
  const s = { pose: "idle", flip: false, dx: 0, dy: 0, eyes: "sq", card: f < T.go || f >= T.cardIn };
  if (blinkAt(f, 30)) s.eyes = "blink";
  if (win(f, T.wind, T.wind + 4)) { s.pose = "squash"; s.eyes = "wide"; }                // se agacha
  else if (win(f, T.wind + 4, T.go + 3)) { s.pose = "surprise"; s.eyes = "wide"; }       // estira y suelta
  else if (win(f, T.go + 3, T.land)) s.eyes = "right";
  else if (win(f, T.land, T.land + 14)) s.eyes = "happy";
  else if (win(f, 40, T.packet[0])) s.eyes = f < 150 ? "right" : "right";
  else if (win(f, T.packet[0], T.mon[0])) s.eyes = f < 276 ? "right" : "up";
  else if (win(f, T.mon[0], T.party)) s.eyes = "up";
  else if (win(f, T.party, T.party + 4)) { s.pose = "squash"; s.eyes = "happy"; }
  else if (win(f, T.party + 4, T.party + 6)) { s.pose = "surprise"; s.eyes = "happy"; }
  else if (win(f, T.party + 6, T.party + 20)) {
    const u = (f - T.party - 6) / 14;
    s.pose = "armsup"; s.eyes = "happy"; s.dy = -Math.round(8 * u * (1 - u) * 4 / 1);
  } else if (win(f, T.party + 20, T.party + 24)) { s.pose = "squash"; s.eyes = "happy"; }
  else if (win(f, T.party + 24, T.cardIn - 4)) { s.pose = "armsup"; s.eyes = "happy"; }
  else if (win(f, T.cardIn - 4, T.cardIn)) s.eyes = "happy";
  else if (win(f, T.cardIn, T.cardIn + 4)) { s.pose = "squash"; s.eyes = "wide"; }       // atrapa la tarjeta nueva
  if (s.pose === "idle" && !s.dy) s.dy = bobAt(f, 30);
  return s;
}
const CARDPOS = [9, 69];
function leadCard(c, f, st) {
  if (!st.card) return;
  const ph = f >= T.cardIn ? f - T.cardIn : f;
  const bob = Math.floor((ph + 8) / 16) % 2;
  const [x, y] = place(st.pose, false, ROLE.lead.ax + st.dx, FLOOR + st.dy, 1);
  const cx = CARDPOS[0] + (st.pose === "squash" ? 1 : 0), cy = (st.pose === "idle" ? CARDPOS[1] : CARDPOS[1] + 2) + bob + st.dy;
  if (f >= T.cardIn && f < T.cardIn + 3) floppy(c, cx - 1, cy + 2, 12, 8, "o"); else floppy(c, cx, cy, 10, 10, "o");
}

function writerState(f) {
  const s = { pose: "idle", flip: false, dx: 0, dy: 0, eyes: "sq", sweat: false };
  if (blinkAt(f, 10)) s.eyes = "blink";
  if (f < T.go) s.eyes = "left";
  else if (win(f, T.go, T.land)) s.eyes = "left";
  else if (win(f, T.land, T.land + 2)) { s.pose = "surprise"; s.eyes = "wide"; }
  else if (win(f, T.land + 2, T.type[0])) s.eyes = "happy";
  else if (win(f, T.type[0], T.type[1])) { s.pose = ["type_l", "type_r"][two(f) % 2]; s.eyes = "down"; }
  else if (win(f, T.type[1], T.fly1[1] - 4)) s.eyes = "up";
  else if (win(f, T.lean - 2, T.touch)) {          // se estira hacia el sello
    s.eyes = "right"; s.dx = Math.round(4 * ease((f - T.lean) / (T.touch - T.lean)));
  } else if (win(f, T.touch, T.touch + 6)) {       // choca y rebota
    s.pose = "surprise"; s.eyes = "wide"; s.dx = -Math.round(3 * Math.sin(Math.PI * clamp01((f - T.touch) / 6) * 0.5) + 0);
  } else if (win(f, T.touch + 6, T.recoil)) { s.eyes = "right"; s.dx = -Math.round(3 * (1 - ease((f - T.touch - 6) / 8))); s.sweat = true; }
  else if (win(f, T.recoil, T.ret[1] - 2)) { s.eyes = "right"; s.sweat = f < T.recoil + 8; }
  else if (win(f, T.ret[1] - 2, T.ret[1])) { s.pose = "squash"; s.eyes = "wide"; }
  else if (win(f, T.ret[1], T.retype[0])) { s.pose = "think"; s.eyes = "down"; }
  else if (win(f, T.retype[0], T.retype[1])) { s.pose = ["type_l", "type_r"][two(f) % 2]; s.eyes = "down"; }
  else if (win(f, T.retype[1], T.fly2[0])) s.eyes = "right";
  else if (win(f, T.fly2[0], T.fly2[1])) s.eyes = "up";
  else if (win(f, T.fly2[1], HIT - 4)) s.eyes = "right";
  else if (win(f, HIT - 4, HIT + 4)) s.eyes = "right";
  else if (win(f, HIT + 4, HIT + 22)) {            // celebra el visto bueno
    const u = (f - HIT - 4) / 18;
    s.pose = u < 0.75 ? "armsup" : "idle"; s.eyes = "happy"; s.dy = u < 0.75 ? -Math.round(4 * Math.sin(Math.PI * u / 0.75)) : 0;
  } else if (win(f, HIT + 22, T.fly3[0])) s.eyes = "happy";
  else if (win(f, T.fly3[0], T.fly3[1])) s.eyes = "right";
  return s;
}

// Estado del Judge y del sello en un golpe: t = cuadros desde el golpe.
function stampAt(t) {
  if (t < -14 || t > 12) return null;
  if (t < -6) { const u = ease((t + 14) / 8); return { p: bez(REST, [REST[0] + 8, 36], BACK, u), mode: "up" }; }
  if (t < -3) return { p: [BACK[0] + (two(t) % 2 ? 1 : -1), BACK[1]], mode: "hold" };
  if (t < 0) { const u = ((t + 3) / 3) ** 2; return { p: [Math.round(lerp(BACK[0], DOWN[0], u)), Math.round(lerp(BACK[1], DOWN[1], u))], mode: "slam" }; }
  if (t < 3) return { p: [DOWN[0], DOWN[1] + (t < 2 ? 1 : 0)], mode: "press" };
  const u = ease((t - 3) / 9);
  return { p: bez(DOWN, [DOWN[0] + 16, 26], REST, u), mode: "back" };
}
const STAMPS = [{ hit: T.rev, ink: "O", text: "REVISE" }, { hit: T.appr, ink: "j", text: "APPROVE" }];
function stampNow(f) {
  for (const S of STAMPS) {
    const st = stampAt(f - S.hit);
    if (st) return { ...st, S, t: f - S.hit };
  }
  return null;
}
function judgeState(f) {
  const s = { pose: "idle", flip: false, dx: 0, dy: 0, eyes: "sq", ay: 76 };
  if (blinkAt(f, 55)) s.eyes = "blink";
  if (win(f, T.go + 6, T.fly1[0])) s.eyes = "left";
  if (win(f, T.fly1[0], T.fly1[1])) s.eyes = "up";
  if (win(f, T.scan1[0], T.scan1[1])) s.eyes = Math.floor((f - T.scan1[0]) / 4) % 2 ? "right" : "left";
  if (win(f, T.palm[0], T.palm[1])) { s.pose = "surprise"; s.eyes = "wide"; }
  if (win(f, T.ret[0], T.ret[0] + 12)) s.eyes = "left";
  if (win(f, T.fly2[1], T.scan2[0])) s.eyes = "up";
  if (win(f, T.scan2[0], T.scan2[1])) s.eyes = Math.floor((f - T.scan2[0]) / 3) % 2 ? "right" : "left";
  const k = stampNow(f);
  if (k) {
    if (k.mode === "up") s.eyes = "up";
    else if (k.mode === "hold") { s.pose = "squash"; s.eyes = "wide"; }
    else if (k.mode === "slam") { s.pose = "surprise"; s.eyes = "wide"; }
    else if (k.mode === "press") { s.pose = "squash"; s.eyes = k.S.text === "APPROVE" ? "happy" : "sq"; }
    else if (k.S.text === "APPROVE") s.eyes = "happy";
  }
  if (win(f, HIT + 12, T.fly3[1])) s.eyes = "happy";
  return s;
}
function examState(f) {
  const s = { pose: "idle", flip: false, dx: 0, dy: 0, eyes: "sq" };
  if (blinkAt(f, 70)) s.eyes = "blink";
  if (win(f, 100, T.fly3[0])) s.eyes = "left";
  if (win(f, T.fly3[0], T.examW[0])) s.eyes = "up";
  if (win(f, T.examW[0], T.examW[1])) { s.pose = ["type_l", "type_r"][two(f) % 2]; s.eyes = "down"; }
  else if (win(f, T.examW[1], T.page[1])) { s.pose = "point_l"; s.flip = true; s.eyes = "right"; }
  else if (win(f, T.page[1], T.spin[0])) s.eyes = "right";
  else if (win(f, T.spin[0], T.lock)) { s.pose = "squash"; s.eyes = "wide"; }
  else if (win(f, T.lock, T.lock + 10)) {           // el candado cierra: salto corto
    const u = (f - T.lock) / 10;
    s.pose = "armsup"; s.eyes = "happy"; s.dy = -Math.round(4 * Math.sin(Math.PI * u));
  } else if (win(f, T.lock + 10, T.poke + 4)) s.eyes = "happy";
  else if (win(f, T.poke + 4, T.poke + 10)) { s.pose = "surprise"; s.eyes = "wide"; }
  else if (win(f, T.poke + 10, T.leave + 10)) s.eyes = "happy";
  if (s.pose === "idle" && !s.dy) s.dy = bobAt(f, 55);
  return s;
}

// ------------------------------------------------------------------ utilería de cada estación
// Computadora beige de los 90: monitor CRT con una ventana de documento y teclado.
function laptop(c, f, lines, typing) {
  const x = 34, y = 70;
  c.rect(x, y + 1, 22, 8, "(");                    // caja de plástico beige
  c.hline(x + 1, y, 20, "(");
  c.hline(x + 1, y, 20, "&");
  c.vline(x + 21, y + 1, 8, ")"); c.hline(x + 1, y + 8, 21, ")");
  c.rect(x + 2, y + 1, 18, 6, "c");                // cristal oscuro
  c.vline(x + 2, y + 1, 6, "G"); c.hline(x + 2, y + 7, 18, "G");
  c.hline(x + 3, y + 1, 17, "L");                  // barra de título de la ventana
  c.px(x + 17, y + 1, "%"); c.px(x + 19, y + 1, "%"); c.px(x + 3, y + 1, "y");
  [lines[1], lines[2]].forEach((L, i) => {
    const n = Math.round((L ? L.len : 0) * 0.55);
    if (n > 0) c.hline(x + 4, y + 3 + i * 2, Math.min(14, n), L.col === "O" ? "O" : L.col === "j" ? "j" : i ? "7" : "T");
  });
  if (typing && two(f) % 2 === 0) c.rect(x + 4 + (f % 10), y + 6, 2, 1, "w");   // cursor de texto
  c.px(x + 4, y + 8, "j"); c.hline(x + 16, y + 8, 3, "G");   // luz y botón del monitor
  c.rect(x - 3, y + 9, 28, 3, "(");                // teclado
  c.hline(x - 3, y + 9, 28, "&");
  for (let k = x - 2; k < x + 24; k += 2) c.px(k, y + 10, ")");
  c.hline(x - 3, y + 11, 28, ")");
  if (typing) for (let k = 0; k < 3; k++) c.px(x - 2 + ((two(f) * 5 + k * 7) % 24), y + 10, "G");   // teclas pulsadas
}
// El pedestal de mármol del Judge, con el bloque donde reposa el sello.
function desk(c) {
  c.rect(68, 72, 33, 3, "%"); c.hline(68, 72, 33, "&"); c.hline(68, 74, 33, "^");
  c.rect(71, 75, 27, 5, "%"); c.vline(71, 75, 5, "&"); c.vline(97, 75, 5, "*");
  for (let x = 75; x <= 93; x += 6) { c.vline(x, 75, 5, "^"); c.vline(x + 1, 75, 5, "&"); }
  c.rect(68, 80, 33, 2, "^"); c.hline(68, 80, 33, "%"); c.hline(68, 81, 33, "*");
  c.rect(85, 69, 14, 3, "%"); c.hline(85, 69, 14, "&"); c.hline(85, 71, 14, "^"); c.vline(98, 69, 3, "*");
}
// El busto de mármol con los ojos vendados, a la izquierda del Judge.
const BUST = [
  "...^^^^^^...", "..^&^&&^&^..", "..&%%%%%%^..", "..++++++++..", "..++++++++++", "..&%%%^%%^.+", "..&%%^^%%^..",
  "...&%^^%%^..", "...&%%%%%^..", "....%%%%^...", ".....%%%^...", "..&&%%%%%^^.", ".&%%%%%%%%^^", "&%%%%%%%%%%^", "^^^^^^^^^^^^",
  ".&&&&&&&&&&.", "..&%%%%%%^*.", "..&%%^%%%^*.", "..&%%^%%%^*.", "..&%%^%%%^*.", "..&%%%%%%^*.", ".&&%%%%%%^^*", "&&&&&&&&&&&&", "^^^^^^^^^^^^",
];
function bust(c, f) {
  paintGrid(c, BUST, 59, 58);
  const t = f - HIT;
  if (t >= 0 && t < 10) {                          // la cinta de la venda ondea con el visto bueno
    c.px(70, 61 + (two(t) % 2), "+"); c.px(71, 62 + (two(t) % 2), "+");
  }
}
function stampProp(c, x, y, ink) {
  c.rect(x + 3, y, 5, 3, "x"); c.hline(x + 3, y, 5, "y");
  c.rect(x + 4, y + 3, 3, 2, "f");
  c.rect(x, y + 5, 11, 3, "F"); c.hline(x, y + 5, 11, "f");
  c.hline(x + 1, y + 8, 9, ink);
}

function door(f) {                               // 0 cerrada, 1 abierta
  if (f < T.door[0]) return 0;
  if (f < T.door[1]) return ease((f - T.door[0]) / (T.door[1] - T.door[0]));
  if (f < T.close[0]) return 1;
  if (f < T.close[1]) return 1 - ease((f - T.close[0]) / (T.close[1] - T.close[0]));
  return 0;
}
const UNLOCK = 328;                              // el nicho se libera para el bucle
// Nicho de piedra con puerta tallada, tablilla de mármol y sello de cera.
function vault(c, f, ox, blocked, flash) {
  const x = VX + ox, y = VY, o = door(f);
  c.rect(x - 1, y, 35, 3, "%"); c.hline(x - 1, y, 35, "&"); c.hline(x - 1, y + 2, 35, "^");   // losa superior
  c.rect(x, y + 3, 33, 27, "+");
  c.vline(x + 1, y + 3, 27, "*"); c.vline(x + 31, y + 3, 27, "1");
  c.hline(x, y + 28, 33, "1");
  // tablilla grabada
  c.rect(x + 2, y + 4, 29, 9, blocked ? "q" : "%");
  c.box(x + 2, y + 4, 29, 9, blocked ? "u" : "^");
  const label = blocked ? "BLOCKED" : "HIDDEN";
  c.text(x + 16 - Math.floor(tw(label) / 2), y + 6, label, blocked ? "u" : "+");
  // puerta: hueco oscuro y losa tallada que se desliza
  const dx = DOOR.x + ox, dy = DOOR.y;
  c.rect(dx, dy, DOOR.w, DOOR.h, "Z");
  c.box(dx, dy, DOOR.w, DOOR.h, "c");
  if (o > 0.3) for (let yy = 1; yy < DOOR.h - 1; yy++) for (let xx = 1; xx < DOOR.w - 1; xx++) if (bay(dx + xx, dy + yy) < 0.18 * o) c.px(dx + xx, dy + yy, "N");
  const ws = Math.round(lerp(DOOR.w, 5, o));
  c.rect(dx, dy, ws, DOOR.h, "^");
  c.hline(dx, dy, ws, "&"); c.vline(dx, dy, DOOR.h, "&"); c.hline(dx, dy + DOOR.h - 1, ws, "*"); c.vline(dx + ws - 1, dy, DOOR.h, "*");
  if (ws > 10) {                                 // panel hundido
    c.hline(dx + 3, dy + 3, ws - 6, "*"); c.vline(dx + 3, dy + 3, DOOR.h - 6, "*");
    c.hline(dx + 3, dy + DOOR.h - 4, ws - 6, "%"); c.vline(dx + ws - 4, dy + 3, DOOR.h - 6, "%");
  }
  if (flash > 0) for (let yy = 0; yy < DOOR.h; yy++) for (let xx = 0; xx < ws; xx++) if (bay(dx + xx, dy + yy) < flash * 0.7) c.px(dx + xx, dy + yy, "u");
  // cordón y sello de cera
  const locked = f >= T.lock && f < UNLOCK;
  if (locked && ws > 16) {
    const wx = dx + 13, wy = dy + 6, age = f - T.lock;
    const hl = Math.round(12 * ease(age / 3));
    const pad = f >= UNLOCK - 8 ? clamp01((UNLOCK - f) / 8) : 1;
    c.clip((px2, py2) => bay(px2, py2) < pad, () => {
      c.hline(wx - hl, wy, hl * 2 + 1, "e");
      const r = age < 2 ? 5 : 4;
      c.circ(wx + 1, wy + 1, r, "q");
      c.circ(wx, wy, r, "u");
      c.ring(wx, wy, 2, "q"); c.px(wx, wy, "q");
      c.px(wx - 2, wy - 2, age < 6 ? "y" : "V"); c.px(wx - 3, wy - 1, "V");
      c.px(wx + 1, wy + r, "u"); c.px(wx + 1, wy + r + 1, "q");    // gota de cera
    });
  }
}
// La cornisa de mármol donde duerme el enjambre, con dentículos y una placa.
function shelf(c, f, lit) {
  c.rect(126, SHELF, 33, 2, "%"); c.hline(126, SHELF, 33, "&"); c.hline(126, SHELF + 1, 33, "^");
  for (let x = 126; x < 159; x++) if (x % 4 < 3) { c.px(x, SHELF + 2, "%"); c.px(x, SHELF + 3, "^"); } else { c.px(x, SHELF + 2, "+"); c.px(x, SHELF + 3, "+"); }
  c.rect(131, SHELF + 4, 23, 7, "1");
  c.box(131, SHELF + 4, 23, 7, lit ? "y" : "^");
  c.text(133, SHELF + 5, "SWARM", lit ? "y" : "%");
}

// ------------------------------------------------------------------ el documento
const WORDS = [[5, 3, 6, 4], [4, 6, 3, 5], [6, 4, 5, 3], [3, 5, 4, 6]];       // palabras por línea (px)
const WORDS2 = { 1: [5, 5, 4, 6], 2: [7, 3, 6, 4] };
const lineLen = (ws) => ws.reduce((a, b) => a + b + 1, -1);
const TOTAL = WORDS.reduce((a, w) => a + lineLen(w) + 2, 0);
const FLAG = [1, 2];

// Líneas del documento en el cuadro f: palabras, longitud visible y color.
function docLines(f) {
  const out = [];
  let p = (f - T.type[0]) * (TOTAL / (T.type[1] - T.type[0])), cum = 0;
  for (let k = 0; k < 4; k++) {
    let ws = WORDS[k], full = lineLen(ws), len = clamp01((p - cum) / full) * full, col = "x", bg = null;
    cum += full + 2;
    if (FLAG.includes(k)) {
      const seen = T.scan1[0] + 3 + FLAG.indexOf(k) * 4;
      if (f >= seen && f < T.erase[0]) { col = "O"; bg = "$"; }
      else if (f >= T.erase[0]) {
        const e = prog(f, T.erase[0], T.erase[1]);
        if (e < 1) len = full * (1 - e);
        else {
          ws = WORDS2[k];
          const full2 = lineLen(ws), q = (f - T.retype[0]) * ((lineLen(WORDS2[1]) + lineLen(WORDS2[2]) + 2) / (T.retype[1] - T.retype[0]));
          const off = FLAG.indexOf(k) * (lineLen(WORDS2[1]) + 2);
          len = clamp01((q - off) / full2) * full2;
          if (f < T.retype[1] + 12) col = "j";
        }
      }
    }
    out.push({ ws, len: Math.round(len), col, bg });
  }
  return out;
}
function drawLines(c, x, y, lines, scanY, scanCol) {
  lines.forEach((L, k) => {
    const ly = y + 10 + k * 3;
    if (L.bg) c.rect(x + 2, ly - 1, DOCW - 4, 3, L.bg);
    let pos = 0;
    for (const w of L.ws) {
      const n = Math.min(w, L.len - pos);
      if (n > 0) c.hline(x + 2 + pos, ly, n, scanY !== null && ly <= scanY ? scanCol : L.col);
      pos += w + 1;
      if (pos >= L.len) break;
    }
  });
}
// Cuerpo del documento: sombra, papel oscuro, cabecera con la tarjeta de intención y las líneas.
function paper(c, x, y, w, h, title, tcol, icon) {
  c.rect(x + 1, y + 1, w, h, "z");
  c.rect(x, y, w, h, "c");
  c.box(x, y, w, h, "F");
  c.rect(x + 1, y + 1, w - 2, 7, "J");
  c.text(x + 3, y + 2, title, tcol);
  if (icon) for (let k = 0; k < 3; k++) { c.rect(x + w - 10 + 3 * k, y + 3, 2, 3, "%"); c.hline(x + w - 10 + 3 * k, y + 3, 2, "&"); }   // los tres botones
}
// La marca del sello: dos barras y la palabra, con el color de la tinta.
function imprint(c, x, y, text, ink, keep, hot) {
  const w = tw(text) + 4, ox = x + 1 + Math.floor((DOCW - 2 - w) / 2);
  c.clip((px2, py2) => bay(px2, py2) < keep, () => {
    c.rect(ox, y + 11, w, 9, "c");
    c.hline(ox, y + 11, w, hot ? "y" : ink); c.hline(ox, y + 19, w, hot ? "y" : ink);
    c.vline(ox, y + 11, 9, hot ? "y" : ink); c.vline(ox + w - 1, y + 11, 9, hot ? "y" : ink);
    c.text(ox + 2, y + 13, text, hot ? "y" : ink);
  });
}

// Dónde está el documento (en su hueco o en vuelo).
const MOVES = [[T.fly1, "writer", "judge"], [T.ret, "judge", "writer"], [T.fly2, "writer", "judge"], [T.fly3, "judge", "exam"]];
function docWhere(f) {
  let at = "writer", fl = null;
  for (const [[a, b], from, to] of MOVES) {
    if (f >= b) at = to;
    else { if (f >= a) fl = { u: (f - a) / (b - a), from, to, a, b }; break; }
  }
  if (fl) { const [x, y] = arc(SLOT[fl.from], SLOT[fl.to], fl.u); return { x, y, fl, at }; }
  return { x: SLOT[at] - 14, y: DOCY, fl: null, at };
}
// La línea punteada del traspaso: puntos que marchan del emisor al receptor.
const TRAILS = MOVES.map(([[a, b], from, to]) => {
  const pts = [];
  for (let k = 0; k <= 48; k++) { const [x, y] = arc(SLOT[from], SLOT[to], k / 48); pts.push([x + 14, y - 3]); }
  return { a, b, pts, col: from === "writer" ? "7" : from === "judge" ? (to === "writer" ? "O" : "j") : "v" };
});
function trails(c, f) {
  TRAILS.forEach((Tr, i) => {
    const t = f - Tr.a, life = Tr.b - Tr.a;
    if (t < -3 || t > life + 8) return;
    const head = Math.round(clamp01((t + 3) / (life + 3)) * 48);
    const fade = t > life ? 1 - (t - life) / 8 : 1;
    Tr.pts.forEach(([x, y], k) => {
      if (k > head || ((k - f) % 3 + 3) % 3 !== 0) return;
      if (fade < 1 && bay(x, y) > fade) return;
      c.px(x, y, head - k < 5 ? "y" : Tr.col);
    });
  });
}
function docs(c, f) {
  const here = docWhere(f);
  const showSpec = f >= T.grow && f < T.examW[0] + 12;
  if (f >= T.land - 2 && f < T.grow + 8) {
    // el documento se abre a partir de la tarjeta que acaba de aterrizar
    const e = ease((f - T.grow) / 8);
    if (f >= T.grow) {
      const w = Math.round(lerp(10, DOCW, e)), h = Math.round(lerp(10, DOCH, e));
      const cx = SLOT.writer, cy = DOCY + Math.round(DOCH / 2);
      const x = cx - Math.floor(w / 2), y = cy - Math.floor(h / 2);
      c.rect(x, y, w, h, "c"); c.box(x, y, w, h, "F");
      if (e < 1) { c.hline(x + 1, y + 1, w - 2, "J"); return; }
    } else {
      const sq = f < T.land + 2;
      if (sq) floppy(c, SLOT.writer - 6, DOCY + 10, 12, 8, "o"); else floppy(c, SLOT.writer - 5, DOCY + 7, 10, 10, "o");
      return;
    }
  }
  if (!showSpec) return;
  let { x, y } = here;
  const lines = docLines(f);
  const land = f >= T.ret[1] - 1 && f < T.ret[1] + 1 || (f >= T.fly1[1] && f < T.fly1[1] + 2) || (f >= T.fly2[1] && f < T.fly2[1] + 2);
  if (land) y += 1;
  // resplandor al recibir el visto bueno
  if (f >= HIT && f < HIT + 16) ditherFrame(c, x, y, DOCW, DOCH, 5, "j", 0.7 * (1 - (f - HIT) / 16));
  if (f >= T.rev && f < T.rev + 10) ditherFrame(c, x, y, DOCW, DOCH, 4, "O", 0.6 * (1 - (f - T.rev) / 10));
  // bloque de disolución hacia el examen
  const keepDoc = f >= T.examW[0] ? 1 - prog(f, T.examW[0] + 2, T.examW[0] + 12) : 1;
  c.clip((px2, py2) => bay(px2, py2) < keepDoc || keepDoc >= 1, () => {
    paper(c, x, y, DOCW, DOCH, "SPEC", "x", true);
    // barrido del Judge
    let scanY = null, scanCol = "x";
    const s1 = win(f, T.scan1[0], T.scan1[1]), s2 = win(f, T.scan2[0], T.scan2[1]);
    if (s1 || s2) {
      const u = s1 ? prog(f, T.scan1[0], T.scan1[1]) : prog(f, T.scan2[0], T.scan2[1]);
      scanY = y + 8 + Math.round(u * 14);
      scanCol = "x";
    }
    drawLines(c, x, y, lines, null, "x");
    if (scanY !== null) {
      for (let k = 1; k <= 4; k++) for (let xx = x + 1; xx < x + DOCW - 1; xx++) if (bay(xx, scanY - k) < 0.7 - k * 0.15) c.px(xx, scanY - k, s1 ? "N" : "Q");
      c.hline(x + 1, scanY, DOCW - 2, s1 ? "l" : "T");
    }
    // cursor mientras se teclea
    const typing = win(f, T.type[0], T.type[1]) || win(f, T.retype[0], T.retype[1]);
    if (typing && two(f) % 2 === 0) {
      const live = lines.findIndex((L, k) => L.len < lineLen(L.ws) && (k === 0 || lines[k - 1].len >= lineLen(lines[k - 1].ws) - 0 || FLAG.includes(k)) && L.len > 0) ;
      const idx = live >= 0 ? live : 0, L = lines[idx];
      c.rect(x + 3 + L.len, y + 9 + idx * 3, 2, 3, "w");
    }
    // sellos
    if (f >= T.rev && f < T.fade[1]) {
      const keep = f < T.fade[0] ? 1 : 1 - prog(f, T.fade[0], T.fade[1]);
      imprint(c, x, y, "REVISE", "O", keep, f < T.rev + 2);
    }
    if (f >= HIT) imprint(c, x, y, "APPROVE", "j", 1, f < HIT + 2);
  });
  // el examen oculto, que nace del documento aprobado
}

// El examen: un pergamino que el Examiner escribe y enrolla, sellado con cera, hasta el nicho.
function examPage(c, f) {
  const nat = SLOT.exam - 11, e = prog(f, T.examW[0] + 2, T.examW[0] + 12);
  let x = nat, y = DOCY, w = 22, h = DOCH, roll = 0;
  if (f >= T.page[0]) {
    const u = prog(f, T.page[0], T.page[1]);
    const [px2, py2] = bez([nat, DOCY], [nat + 16, DOCY + 38], [WHEEL[0] - 4, WHEEL[1] - 4], ease(u));
    roll = ease(clamp01(u / 0.45));
    const sc = lerp(1, 0.3, ease(u));
    w = Math.max(5, Math.round(lerp(22, 18, roll) * sc)); h = Math.max(3, Math.round(lerp(DOCH, 5, roll) * sc));
    x = px2 + Math.round((22 - w) / 2); y = py2 + Math.round((DOCH - h) / 2);
  }
  c.clip((px2, py2) => bay(px2, py2) < e || e >= 1, () => {
    if (h <= 6 || w < 10) {                      // ya enrollado: cilindro con el sello de cera
      c.rect(x, y, w, h, "%"); c.hline(x, y, w, "&"); c.hline(x, y + h - 1, w, "^");
      c.rect(x - 1, y, 1, h, "*"); c.rect(x + w, y, 1, h, "*");
      if (w >= 8) c.rect(x + Math.floor(w / 2) - 1, y, 3, h, "u");
      else c.px(x + Math.floor(w / 2), y + Math.floor(h / 2), "u");
      return;
    }
    c.rect(x + 1, y + 1, w, h, "z");
    c.rect(x, y, w, h, "%");
    c.rect(x - 1, y, w + 2, 2, "^"); c.hline(x - 1, y, w + 2, "&"); c.px(x - 1, y + 1, "*"); c.px(x + w, y + 1, "*");      // varillas
    c.rect(x - 1, y + h - 2, w + 2, 2, "^"); c.hline(x - 1, y + h - 2, w + 2, "&"); c.px(x - 1, y + h - 1, "*"); c.px(x + w, y + h - 1, "*");
    if (h > 14) {
      c.text(x + 3, y + 4, "EXAM", "+");
      const typed = clamp01((f - T.examW[0] - 4) / (T.examW[1] - T.examW[0] - 4)) * 3;
      for (let k = 0; k < 3; k++) {
        const n = Math.round(clamp01(typed - k) * [16, 12, 8][k] * w / 22);
        if (n > 0) c.hline(x + 3, y + Math.round((11 + k * 3) * h / DOCH), n, "*");
      }
      // ojo tachado: es secreto
      const ex = x + w - 10, ey = y + 15;
      c.rect(ex, ey, 5, 3, "%"); c.box(ex, ey, 5, 3, "+"); c.px(ex + 2, ey + 1, "q");
      c.line(ex - 1, ey + 4, ex + 6, ey - 1, "q");
    }
    if (roll > 0.7) c.rect(x + Math.floor(w / 2) - 1, y, 3, h, "u");
  });
}

// ------------------------------------------------------------------ el enjambre
function drawMini(c, pose, ax, ay, k, eyes) {
  const P = POSES[pose], rows = Math.ceil(P.g.length / 2), x = Math.round(ax - P.cx / 2), y = ay - rows;
  for (let r = 0; r < rows; r++)
    for (let q = 0; q < 12; q++) {
      const ch = P.g[r * 2][q * 2];
      if (ch === "." || ch === undefined || !inside(x + q, y + r)) continue;
      c.px(x + q, y + r, r === 0 ? k[1] : k[0]);
    }
  if (eyes === "blink") return;
  for (const [ex, ey] of P.eyes) {
    const px2 = x + (ex >> 1), py2 = y + (ey >> 1);
    if (!inside(px2, py2)) continue;
    c.px(px2, py2, "c");
    if (eyes === "wide" && inside(px2, py2 + 1)) c.px(px2, py2 + 1, "c");
  }
}
// Estado de un cangrejo: x, y (pies), pose, ojos. Dormido en el estante, baja, prueba la puerta, se va y vuelve.
function crabState(i, f) {
  const S = SWARM[i], wk = T.wake + 3 * i, p = T.poke + K * i, L = T.leave + 3 * i, B = T.back + 5 * i;
  const st = { x: S.sx, y: SHELF - 1, pose: "ball", eyes: "sq", show: true, dust: false };
  const walkIn = Math.ceil((172 - S.sx) / 3);
  if (f < wk) { st.y += (Math.floor((f + i * 9) / 12) % 2); return st; }
  if (f < wk + 3) { st.pose = "unfold"; st.y -= 1; st.eyes = "wide"; return st; }
  if (f < wk + 8) { st.pose = "idle"; st.eyes = "wide"; st.y -= (f - wk - 3 < 3 ? 2 : 0); return st; }
  if (f < wk + 22) {                                 // salta del estante al suelo
    const u = (f - wk - 8) / 14;
    const [x, y] = bez([S.sx, SHELF - 1], [S.sx, 14], [S.sx, FLOOR], u);
    st.x = x; st.y = y; st.pose = u < 0.55 ? "armsup" : "surprise"; st.eyes = "wide"; return st;
  }
  st.y = FLOOR;
  if (f < wk + 25) { st.pose = "squash"; st.dust = true; return st; }
  if (f < p - 6) { st.pose = "idle"; st.eyes = blinkAt(f, i * 20) ? "blink" : "sq"; return st; }
  if (f < p - 2) { st.pose = "squash"; st.eyes = "wide"; return st; }       // se agacha
  if (f < p + 3) {                                                          // salta contra la puerta
    const u = ease((f - p + 2) / 5);
    st.pose = "armsup"; st.eyes = "wide"; st.y = FLOOR - Math.round(11 * u); return st;
  }
  const side = [-1, 0, 1][i];
  if (f < p + 15) {                                                         // rebota
    const u = (f - p - 3) / 12;
    const [x, y] = bez([S.sx, FLOOR - 11], [S.sx + side * 3, FLOOR - 19], [S.sx + side * 5, FLOOR], u);
    st.x = x; st.y = y; st.pose = u < 0.7 ? "surprise" : "armsup"; st.eyes = "wide"; return st;
  }
  st.x = S.sx + side * 5; st.y = FLOOR;
  if (f < p + 18) { st.pose = "squash"; st.dust = true; st.eyes = "blink"; return st; }
  if (f < L) { st.pose = "idle"; st.eyes = f < p + 26 ? "wide" : "sq"; st.x += f < p + 26 ? (two(f) % 2 ? 1 : -1) : 0; return st; }
  const x0 = S.sx + side * 5;
  if (f < B) {                                                               // camina hacia la derecha a construir
    const e = f - L;
    st.x = x0 + 3 * two(e); st.pose = ["walk_a", "walk_a", "idle", "idle", "walk_b", "walk_b", "idle", "idle"][e % 8]; st.y = FLOOR - (st.pose === "idle" ? 0 : 1);
    if (st.x > 176) st.show = false; return st;
  }
  if (f < B + walkIn) {                                                      // vuelve caminando
    const e = f - B;
    st.x = 172 - Math.round(3 * e); st.pose = ["walk_b", "walk_b", "idle", "idle", "walk_a", "walk_a", "idle", "idle"][e % 8]; st.y = FLOOR - (st.pose === "idle" ? 0 : 1); return st;
  }
  if (f < B + walkIn + 3) { st.pose = "idle"; st.eyes = "sq"; return st; }
  if (f < B + walkIn + 15) {                                                 // salta al estante
    const u = (f - B - walkIn - 3) / 12;
    const [x, y] = bez([S.sx, FLOOR], [S.sx, 22], [S.sx, SHELF - 1], u);
    st.x = x; st.y = y; st.pose = "armsup"; st.eyes = "wide"; return st;
  }
  if (f < B + walkIn + 18) { st.pose = "unfold"; st.y = SHELF - 1; return st; }
  st.y = SHELF - 1 + (Math.floor((f + i * 9) / 12) % 2); return st;
}
function crabs(c, f) {
  SWARM.forEach((S, i) => {
    const st = crabState(i, f);
    if (!st.show) return;
    drawMini(c, st.pose, st.x, st.y, S.k, st.eyes);
    const wk = T.wake + 3 * i;
    if (f >= wk && f < wk + 8) sparkle(c, S.sx, SHELF - 9, [1, 2, 3, 3, 2, 1, 1, 0][f - wk], "y", S.k[1]);
    if (st.dust && f % 2 === 0) { c.px(st.x - 7, FLOOR - 1, "0"); c.px(st.x + 7, FLOOR - 1, "0"); }
  });
}
// Cuánto tiembla la bóveda y cuánto se enrojece su puerta con cada golpe de cangrejo.
function pokeFx(f) {
  let ox = 0, flash = 0, hit = null;
  for (let i = 0; i < 3; i++) {
    const t = f - (T.poke + K * i + 3);
    if (t >= 0 && t < 7) { ox = [2, -2, 1, -1, 1, 0, 0][t]; flash = Math.max(flash, 1 - t / 7); hit = hit ?? i; }
  }
  return { ox, flash, hit };
}

// ------------------------------------------------------------------ informe del Lead
const RADAR = ["u", "O", "b", "O", "h"];
const MON = { x: 1, y: 24, w: 31, h: 34 };
function brief(c, f) {
  if (f < T.mon[0] - 4 || f >= T.monOff[1]) return;
  let g = ease((f - T.mon[0]) / (T.mon[1] - T.mon[0]));
  if (f >= T.monOff[0]) g = 1 - ease((f - T.monOff[0]) / (T.monOff[1] - T.monOff[0]));
  const w = Math.round(lerp(12, MON.w, g)), h = Math.round(lerp(8, MON.h, g)), cx = MON.x + MON.w / 2, cy = MON.y + MON.h / 2;
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  if (f < T.mon[0]) return;
  const full = g >= 0.95;
  c.rect(x + 1, y + 1, w, h, "z");
  c.rect(x, y + 1, w, h - 1, "(");                  // caja beige de un CRT de los 90
  c.hline(x + 1, y, w - 2, "&");
  c.vline(x + w - 1, y + 1, h - 1, ")"); c.hline(x, y + h - 1, w, ")");
  const done = f >= T.strip + 3 * 4 + 6;
  const sh = Math.max(1, h - 7);
  c.rect(x + 2, y + 2, Math.max(1, w - 4), sh, done && f < T.strip + 3 * 4 + 10 ? "Q" : "c");
  if (!full) return;
  c.vline(x + 2, y + 2, sh, "G");
  c.rect(x + 4, y + h - 4, 2, 1, "j"); c.hline(x + w - 9, y + h - 4, 5, "G");     // luz y botones
  c.rect(x + 8, y + h, 15, 2, "("); c.hline(x + 8, y + h + 1, 15, ")"); c.rect(x + 5, y + h + 2, 21, 1, ")");   // pie del monitor
  const t = f - T.mon[1];
  c.rect(x + 3, y + 3, w - 6, 7, "L");              // la ventana: barra de título con botones
  c.text(x + 4, y + 5, "BRIEF", "y");
  for (let k = 0; k < 2; k++) { c.rect(x + 23 + 3 * k, y + 5, 2, 2, "%"); }
  [18, 13].forEach((len, k) => { const n = Math.round(clamp01((t - k * 2) / 5) * len); if (n > 0) c.hline(x + 4, y + 12 + k * 3, n, k === 0 ? "T" : "9"); });
  if (t >= 6) c.text(x + 4, y + 18, "RADAR", "X");
  RADAR.forEach((col, k) => {
    const u = f - (T.strip + 3 * k), sx = x + 4 + 5 * k, sy = y + 24;
    if (u < 0) { c.box(sx, sy, 4, 4, "9"); return; }
    const sz = u < 2 ? 5 : 4, o = u < 2 ? 1 : 0;
    c.rect(sx - o, sy - o, sz, sz, u < 3 ? "y" : col);
    if (u < 10) spark(c, sx + 2, sy + 2, u - 1, 4, 0.8, 9, [col, "y"], 300 + k);
  });
}
function packet(c, f) {
  const [a, b] = T.packet;
  if (f < a || f >= b) return;
  const u = (f - a) / (b - a);
  const [x, y] = bez([168, 44], [96, 2], [MON.x + 10, MON.y + 6], ease(u));
  spinFloppy(c, f, x, y, "j");
  if (f % 2 === 0) c.px(x + 11 + (f % 5), y + 3 + (f % 3), "j");
}
// La tarjeta del Lead al Writer.
function cardFlight(c, f) {
  const [a, b] = [T.go, T.land];
  if (f < a || f >= b) return;
  const u = (f - a) / (b - a);
  const [x, y] = bez([CARDPOS[0] + 3, CARDPOS[1] - 1], [24, 26], [SLOT.writer - 5, DOCY + 7], ease(u));
  spinFloppy(c, f, x, y, "o");
  if (f % 2 === 0) c.px(x + 4 - (f % 4), y + 11 + (f % 3), "o");
}
const cardTrail = (() => {
  const pts = [];
  for (let k = 0; k <= 36; k++) { const [x, y] = bez([CARDPOS[0] + 10, CARDPOS[1] - 1], [24, 26], [SLOT.writer, DOCY + 12], ease(k / 36)); pts.push([x, y]); }
  return pts;
})();
function cardDots(c, f) {
  const t = f - T.go, life = T.land - T.go;
  if (t < 0 || t > life + 6) return;
  const head = Math.round(clamp01(t / life) * 36), fade = t > life ? 1 - (t - life) / 6 : 1;
  cardTrail.forEach(([x, y], k) => {
    if (k > head - 3 || ((k - f) % 3 + 3) % 3 !== 0) return;
    if (fade < 1 && bay(x, y) > fade) return;
    c.px(x, y, "o");
  });
}

// ------------------------------------------------------------------ la regla (el autor no juzga)
function barrier(c, f) {
  const a = T.lean + 4, b = T.rev + 4;
  if (f < a || f >= b + 8) return;
  const grow = ease((f - a) / 6), out = f >= b ? 1 - (f - b) / 8 : 1;
  const hit = f - T.touch;
  const top = Math.round(lerp(FLOOR - 4, 56, grow));
  for (let y = top; y < FLOOR; y++) {
    const on = (y + (f >> 1)) % 4 < 3;
    const base = bay(BARX, y) < out * (0.55 + (hit >= 0 && hit < 8 ? 0.4 : 0));
    if (on && base) { c.px(BARX, y, hit >= 0 && hit < 6 ? "y" : "u"); c.px(BARX + 1, y, "q"); }
  }
  if (hit >= 0 && hit < 12) {
    ditherDisc(c, BARX, 71, 10 - hit * 0.3, "u", 0.8 * (1 - hit / 12), hit);
    wave(c, BARX, 71, hit, 12, 7, ["y", "u", "q"], 1.2);
    if (hit < 10) spark(c, BARX, 71, hit, 6, 0.9, 10, ["u", "y"], 51);
  }
  if (hit >= 1 && hit < 22) {                                                // «NO», con un temblor
    const sh = hit < 8 ? (two(hit) % 2 ? 1 : 0) : 0;
    c.clip((px2, py2) => hit < 16 || bay(px2, py2) < 1 - (hit - 16) / 6, () => c.text(BARX - 11 + sh, 56, "NO", "u"));
  }
}

// ------------------------------------------------------------------ barra
const SEGS = ACT.map(([a], k) => [a, k + 1 < ACT.length ? ACT[k + 1][0] : T.drain, ["o", "7", "O", "7", "j", "p", "t", "o"][k]]);
const HUDTXT = [[0, "LEAD", "o"], [T.land + 2, "WRITER", "7"], [T.fly1[1], "JUDGE", "v"], [T.rev, "REVISE", "O"], [T.ret[0] + 4, "WRITER", "7"], [T.fly2[1], "JUDGE", "v"], [HIT, "APPROVE", "j"],
  [T.fly3[0], "EXAMINER", "p"], [T.lock, "LOCKED", "u"], [T.wake + 12, "SWARM", "t"], [T.poke + 4, "BLOCKED", "u"], [T.leave + 10, "SWARM", "t"], [T.packet[0] + 14, "LEAD", "o"], [T.party, "BRIEF", "j"], [T.cardIn, "LEAD", "o"]];
function hud(c, f) {
  const flash = f >= HIT && f < HIT + 4;
  c.rect(4, 3, 152, 11, flash ? "l" : "c");
  c.box(4, 3, 152, 11, "F");
  c.text(7, 6, "> TEAM", flash ? "c" : "w");
  let cur = HUDTXT[0];
  for (const e of HUDTXT) if (f >= e[0]) cur = e;
  const [, txt, col] = cur;
  c.text(153 - tw(txt), 6, txt, flash ? "c" : col);
  c.text(4, 15, "RUN", "X");
  c.box(17, 15, 139, 5, "F");
  c.rect(18, 16, 137, 3, "c");
  SEGS.forEach(([a, b, col2], k) => {
    const x = 18 + k * 17;
    let p = ease((f - a) / (b - a));
    if (f >= T.drain) p *= 1 - ease((f - T.drain - (7 - k) * 1.2) / 3);
    const w = Math.round(16 * p);
    if (w > 0) c.rect(x, 16, w, 3, col2);
    if (w > 0 && w < 16) c.px(x + w - 1, 16, "y");
  });
}
const CAPS = [
  [0, "EACH ROLE HAS ITS OWN CONTEXT", "x"], [T.land + 2, "THE WRITER DRAFTS THE SPEC", "x"], [T.fly1[1], "THE JUDGE REVIEWS IT", "x"],
  [T.touch, "RULE: THE AUTHOR NEVER JUDGES", "O"], [T.rev + 2, "REVISE: BACK TO THE WRITER", "O"], [T.ret[1] + 4, "FIXED, SENT BACK TO THE JUDGE", "x"],
  [HIT + 2, "APPROVED BY SOMEONE ELSE", "j"], [T.fly3[0], "THE EXAMINER WRITES A HIDDEN EXAM", "x"], [T.close[0], "SEALED IN THE NICHE: NO ONE PEEKS", "p"],
  [T.poke + 4, "THE SWARM CANNOT OPEN IT: BLOCKED", "u"], [T.leave + 6, "THE SWARM GOES TO BUILD", "x"], [T.packet[0], "THE LEAD GETS ONE BRIEF", "x"],
  [T.cardIn - 6, "EACH ROLE HAS ITS OWN CONTEXT", "x"],
];
function caption(c, f) {
  let i = 0;
  CAPS.forEach((e, k) => { if (f >= e[0]) i = k; });
  const [t0, text, col] = CAPS[i];
  c.rect(4, 96, 152, 8, "c");
  c.box(4, 96, 152, 8, "F");
  const n = Math.min(text.length, Math.floor((f - t0 + 1) * 3));
  c.text(8, 98, text.slice(0, i === 0 && f < 40 ? text.length : Math.max(0, n)), col);
}

// ------------------------------------------------------------------ la animación
anim("equipo", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HIT && f < HIT + HOLD) f = HIT;                // hit-stop: el mundo se congela tras el sello
  const lines = docLines(f).map((L) => ({ ...L, len: Math.round(L.len * (f >= T.examW[0] + 2 ? 1 - prog(f, T.examW[0] + 2, T.examW[0] + 12) : 1)) }));   // el laptop se vacía con el documento
  const typing = win(f, T.type[0], T.type[1]) || win(f, T.retype[0], T.retype[1]);
  const fx = pokeFx(f);
  const blocked = f >= T.poke + 4 && f < T.leave + 10;

  stage(c);
  plates(c, f);
  vault(c, f, fx.ox, blocked, fx.flash);
  shelf(c, f, f >= T.wake - 4 && f < T.wake + 12);

  // Lead
  const ls = leadState(f);
  actor(c, "lead", ls);
  leadCard(c, f, ls);
  if (f >= T.cardIn && f < T.cardIn + 10) sparkle(c, 14, 66, [1, 2, 3, 3, 2, 2, 1, 1, 0, 0][f - T.cardIn], "y", "o");
  if (win(f, T.go - 1, T.go + 4)) sparkle(c, 22, 70, [1, 2, 2, 1, 0][f - T.go + 1], "y", "o");

  // Writer, con su laptop delante
  const ws = writerState(f);
  actor(c, "writer", ws);
  laptop(c, f, lines, typing);
  if (ws.sweat) paintGrid(c, PROPS.sweat, 50 + ws.dx, 61 + two(f) % 3);
  // brazo estirado hacia el sello (se detiene en la regla)
  if (f >= T.lean && f < T.recoil + 4) {
    const reach = f < T.touch ? ease((f - T.lean) / (T.touch - T.lean)) : 1 - ease((f - T.touch - 3) / 10);
    if (reach > 0.02) armTo(c, 55 + ws.dx, 71, 55 + ws.dx + Math.round(lerp(0, BARX - 57 - ws.dx - 1, reach)), 70, ROLE.writer.col);
  }

  // Judge, detrás de su pedestal; el busto vendado, a su lado
  bust(c, f);
  const js = judgeState(f);
  actor(c, "judge", js);
  desk(c);

  // Examiner
  actor(c, "exam", examState(f));

  // impactos de sello: onda, chispas, destello
  for (const S of STAMPS) {
    const t = f - S.hit, big = S.text === "APPROVE";
    if (t < 0) continue;
    const cx = 82, cy = 50;
    wave(c, cx, cy, t, big ? 18 : 12, big ? 34 : 22, ["y", S.ink, big ? "Q" : "$"], 0.5);
    if (big) wave(c, cx, cy, t - 3, 14, 28, ["T", S.ink, "Q"], 0.5);
    spark(c, cx, cy, t - 1, big ? 12 : 7, big ? 1.5 : 1.0, big ? 20 : 14, [S.ink, "y"], 90 + (big ? 1 : 0));
    if (big && t >= 5 && t < 30) {
      sparkle(c, 63, 38, [1, 2, 3, 2, 1][two(t) % 5] * (t < 24 ? 1 : 0), "y", "T");
      sparkle(c, 99, 41, [2, 3, 2, 1, 2][two(t + 3) % 5] * (t < 24 ? 1 : 0), "y", "j");
    }
  }
  trails(c, f);
  cardDots(c, f);
  cardFlight(c, f);
  barrier(c, f);
  docs(c, f);
  if (f >= T.examW[0] && f < T.page[1]) examPage(c, f);
  const sk = stampNow(f);
  const [sx, sy] = sk ? sk.p : REST;
  const ink = sk ? sk.S.ink : "f";
  if (sk && sk.mode !== "press" || (sk && sk.mode === "press")) armTo(c, 93, 66, sx + 5, sy + 2, ROLE.judge.col);
  stampProp(c, sx, sy, ink);
  crabs(c, f);
  packet(c, f);
  brief(c, f);

  // el sello de cera se estampa sobre la puerta del nicho
  if (f >= T.lock && f < T.lock + 16) {
    wave(c, WHEEL[0], WHEEL[1], f - T.lock, 12, 13, ["y", "u", "q"], 0.7);
    spark(c, WHEEL[0] + 4, WHEEL[1], f - T.lock - 1, 6, 0.9, 12, ["u", "y"], 77);
  }
  // choque de cada cangrejo contra la puerta
  for (let i = 0; i < 3; i++) {
    const t = f - (T.poke + K * i + 3);
    if (t < 0 || t > 12) continue;
    const cx = SWARM[i].sx, k = SWARM[i].k;
    wave(c, cx, FLOOR - 13, t, 10, 12, ["y", k[0], k[2]], 0.7);
    spark(c, cx, FLOOR - 13, t - 1, 5, 0.8, 9, [k[0], "y"], 400 + i);
  }

  hud(c, f);
  caption(c, f);
  if (real >= HIT + HOLD && real < HIT + HOLD + 10)       // sacudida corta del golpe grande
    shake(c, [2, -2, 2, -1, 1, -1, 1, 0, -1, 0][real - HIT - HOLD], [1, -1, 0, 1, -1, 0, 1, 0, 0, 0][real - HIT - HOLD]);
  if (real >= HIT && real < HIT + NEG)                    // cuadro de impacto en negativo
    c.recolor({ z: "W", Z: "S", c: "S", J: "a", 1: "a", n: "S", N: "a", m: "A", 8: "a", 9: "A", F: "L", r: "A", D: "a", "+": "a", "&": "c", "%": "J", "^": "F" });
})

sheet("equipo_sheet", ["equipo"], { pad: 0 })
