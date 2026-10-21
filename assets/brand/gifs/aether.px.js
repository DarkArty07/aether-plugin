// ------------------------------------------------------------------ poses (datos compartidos)
// Cada pose es una cuadrícula a media celda: 1 carácter = 2 px en Clawd y 1 px en los subagentes.
// La pose base es exactamente la cuadrícula oficial de 12 x 8 celdas, dibujada al doble.
const rep = (s, n) => Array(n).fill(s);
const mirror = (g) => g.map((r) => [...r].reverse().join(""));
const LEGS = rep("....oo..oo....oo..oo....", 4);

const POSES = {
  idle: { cx: 12, eyes: [[6, 2], [16, 2]], g: [
    ...rep("....oooooooooooooooo....", 4),
    ...rep("oooooooooooooooooooooooo", 4),
    ...rep("....oooooooooooooooo....", 4),
    ...LEGS] },
  type_l: { cx: 12, eyes: [[6, 2], [16, 2]], g: [
    ...rep("....oooooooooooooooo....", 4),
    ...rep("....oooooooooooooooooooo", 2),
    ...rep("oooooooooooooooooooooooo", 2),
    ...rep("oooooooooooooooooooo....", 2),
    ...rep("....oooooooooooooooo....", 2),
    ...LEGS] },
  think: { cx: 12, eyes: [[6, 2], [16, 2]], g: [
    ...rep("....oooooooooooooooooooo", 4),
    ...rep("oooooooooooooooooooo....", 4),
    ...rep("....oooooooooooooooo....", 4),
    ...LEGS] },
  slump: { cx: 12, eyes: [[6, 3], [16, 3]], g: [
    "........................",
    ...rep("....oooooooooooooooo....", 6),
    ...rep("oooooooooooooooooooooooo", 4),
    "....oooooooooooooooo....",
    ...LEGS] },
  armsup: { cx: 12, eyes: [[6, 4], [16, 4]], g: [
    ...rep("oooo................oooo", 2),
    ...rep("oooooooooooooooooooooooo", 2),
    ...rep("....oooooooooooooooo....", 10),
    ...LEGS] },
  surprise: { cx: 12, eyes: [[6, 4], [16, 4]], g: [
    ...rep("oooo................oooo", 2),
    ...rep("oooooooooooooooooooooooo", 2),
    ...rep("....oooooooooooooooo....", 12),
    ...LEGS] },
  squash: { cx: 14, eyes: [[7, 1], [19, 1]], g: [
    ...rep("....oooooooooooooooooooo....", 2),
    ...rep("oooooooooooooooooooooooooooo", 4),
    ...rep("....oooooooooooooooooooo....", 3),
    ...rep(".....oo..oo......oo..oo.....", 3)] },
  smear: { cx: 12, eyes: [[6, 8], [16, 8]], g: [
    ".......o....oo.....o....",
    ".......o....oo..o..o....",
    ".....o.oo...oo..o..oo...",
    ".....o.oo..ooo..oo.oo...",
    "....oooooo.ooooooooo....",
    "....oooooooooooooooo....",
    ...rep("....oooooooooooooooo....", 4),
    ...rep("oooooooooooooooooooooooo", 4),
    ...rep("....oooooooooooooooo....", 4),
    ...LEGS] },
  smear2: { cx: 12, eyes: [[6, 8], [16, 8]], g: [
    "........................",
    "............oo..........",
    ".......o....oo.....o....",
    ".....o.oo..ooo..oo.oo...",
    "....oooooo.ooooooooo....",
    "....oooooooooooooooo....",
    ...rep("....oooooooooooooooo....", 4),
    ...rep("oooooooooooooooooooooooo", 4),
    ...rep("....oooooooooooooooo....", 4),
    ...LEGS] },
  point_l: { cx: 16, eyes: [[10, 2], [20, 2]], g: [
    ...rep("oooo....oooooooooooooooo....", 2),
    ...rep("oooooooooooooooooooooooo....", 2),
    ...rep("....oooooooooooooooooooooooo", 2),
    ...rep("........oooooooooooooooooooo", 2),
    ...rep("........oooooooooooooooo....", 4),
    ...rep("........oo..oo....oo..oo....", 4)] },
  // Solo subagentes: caminar de lado, hecho bolita y desplegándose.
  walk_a: { cx: 12, eyes: [[6, 2], [16, 2]], g: [
    ...rep("....oooooooooooooooo....", 4),
    ...rep("oooooooooooooooooooooooo", 4),
    ...rep("....oooooooooooooooo....", 4),
    ...rep("....oo..oo....oo..oo....", 2),
    ...rep("........oo........oo....", 2)] },
  walk_b: { cx: 12, eyes: [[6, 2], [16, 2]], g: [
    ...rep("....oooooooooooooooo....", 4),
    ...rep("oooooooooooooooooooooooo", 4),
    ...rep("....oooooooooooooooo....", 4),
    ...rep("....oo..oo....oo..oo....", 2),
    ...rep("....oo........oo........", 2)] },
  ball: { cx: 12, eyes: [[8, 9], [14, 9]], g: [
    ...rep("........................", 6),
    "......oooooooooooo......",
    ...rep(".....oooooooooooooo.....", 8),
    "......oooooooooooo......"] },
  unfold: { cx: 12, eyes: [[6, 6], [16, 6]], g: [
    ...rep("........................", 4),
    ...rep("....oooooooooooooooo....", 2),
    ...rep("..oooooooooooooooooooo..", 4),
    ...rep("....oooooooooooooooo....", 4),
    ...rep("....oo..oo....oo..oo....", 2)] },
};
POSES.type_r = { ...POSES.type_l, g: mirror(POSES.type_l.g) };

// Utilería (1 carácter = 1 px). "S" es la franja del nivel de la tarea.
const PROPS = {
  card: [
    ".CCCCCCCCCC.",
    "CSCCCCCCCCCC",
    "CSCXXXXXCCCC",
    "CSCCCCCCCCCC",
    "CSCXXXXXXXCC",
    "CSCCCCCCCCCC",
    "CSCXXXCCCCCC",
    ".CCCCCCCCCC."],
  card_tilt: [
    "...CCCCCCCCC",
    "..SCXXXXXCC.",
    ".SCCCCCCCC..",
    ".SCXXXXXCC..",
    "SCCCCCCCC...",
    "CCCCCCCCC..."],
  card_edge: [
    "CCCCCCCCCCCC",
    "FFFFFFFFFFFF"],
  card_squash: [
    ".CCCCCCCCCCCC.",
    "CSCCCCCCCCCCCC",
    "CSCXXXXXXXCCCC",
    "CSCCCCCCCCCCCC",
    "CSCXXXXCCCCCCC",
    ".CCCCCCCCCCCC."],
  cursor: [
    "k.......",
    "kk......",
    "kyk.....",
    "kyyk....",
    "kyyyk...",
    "kyyyyk..",
    "kyyyyyk.",
    "kyyyyyyk",
    "kyyyykkk",
    "kyykyk..",
    "kyk.kyk.",
    "kk..kyk.",
    "k....kk."],
  sweat: [
    "..7..",
    ".777.",
    "77y77",
    "77777",
    ".777."],
  check: [
    "......y",
    ".....y.",
    "y...y..",
    ".y.y...",
    "..y...."],
};
// ------------------------------------------------------------------ Aether: la historia
// Clawd trabaja solo y se satura; alguien escribe /aether; le cae un rayo cósmico; se vuelve galaxia;
// reparte las tareas por nivel entre tres subagentes; trabajan en paralelo; arma un brief; espera tu sí;
// hace el merge y vuelve a su escritorio con una chispa. Termina como empieza: el bucle no tiene corte.
// Lienzo de 120 x 120 px (GIF a 600 x 600), 816 cuadros a 30 fps (27.2 s).
// Las poses de los personajes van "en dos" (cada dibujo dura 2 cuadros); efectos y trayectorias a 30 fps.
pal({
  z: "#090d1f", 1: "#28305e", 2: "#5a66a6", 3: "#d2d9ff", Z: "#1c1240", W: "#f7eeff",    // espacio
  K: "#151b2f", J: "#1c2745", D: "#7a4b31", E: "#653c26", U: "#94603f", Y: "#4a2c1c",    // cuarto
  g: "#b9c0cd", G: "#8a92a3", i: "#e3e7ee", I: "#454c5c",                               // laptop
  o: "#da7756", k: "#0a0a0a", p: "#ee6fb0", P: "#ffd6ec",                               // Clawd
  y: "#ffffff", l: "#c9a8ff", L: "#8b5cf6",                                             // rayo
  n: "#2b1466", N: "#3b1b8a", m: "#5427b8", M: "#7b3fe0", v: "#b06cf5", V: "#f08bd6",   // galaxia
  s: "#ffffff", S: "#c7b5ff", e: "#f1e8ff", a: "#c4b5fd", A: "#7c3aed",                 // estrellas, ojos, contorno
  r: "#4d4689", R: "#a59be0",                                                           // órbita
  t: "#2fd3a0", T: "#a8f5dc", 4: "#147a5c",                                             // subagente ligero
  b: "#6d8cff", B: "#c9d3ff", 5: "#3149b8",                                             // subagente medio
  h: "#ec4fc4", H: "#ffc2f0", 6: "#9a2a86",                                             // subagente fuerte
  f: "#b9c2ff", F: "#6f78b8", c: "#130c2c", x: "#e4dcff", X: "#8d84c9", w: "#c04cff",   // pantallas y texto
  j: "#3ee08a", Q: "#123a2a", O: "#f2c14e", u: "#ff5a5a",                               // éxito, alerta
  C: "#e9e6f5", 7: "#8fd3ff", 8: "#2c3152", 9: "#474e7c", 0: "#767db0",                 // tarjetas, sudor, nube
})

const W = 120, H = 120, N = 816, TAU = Math.PI * 2;
const X0 = 36, Y0 = 66, CXP = 60, FEET = 98;     // Clawd: esquina en reposo, centro y línea de los pies
const T = {
  rush: 60, slump: 110, cmd: 150, enter: 176, omen: 182, charge: 205, hit: 214, wipe: 241,
  morph: 272, power: 318, spawn: 340, route: 384, work: 456, brief: 586, cursor: 654, press: 683,
  party: 690, ret: 724, calm: 768, retype: 792,
};

// ------------------------------------------------------------------ utilidades
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, u) => a + (b - a) * u;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const gx = Math.floor(x / s), gy = Math.floor(y / s);
  let fx = x / s - gx, fy = y / s - gy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, 3), b = hash(gx + 1, gy, 3), c = hash(gx, gy + 1, 3), d = hash(gx + 1, gy + 1, 3);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const bez = (p0, p1, p2, u) => {
  const a = (1 - u) ** 2, b = 2 * (1 - u) * u, d = u * u;
  return [Math.round(a * p0[0] + b * p1[0] + d * p2[0]), Math.round(a * p0[1] + b * p1[1] + d * p2[1])];
};
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

function paintGrid(c, grid, x, y, map = {}) {
  for (let r = 0; r < grid.length; r++)
    for (let q = 0; q < grid[r].length; q++) {
      const ch = grid[r][q];
      if (ch === "." || !inside(x + q, y + r)) continue;
      c.px(x + q, y + r, map[ch] ?? ch);
    }
}

// ------------------------------------------------------------------ poses en escena
// Coloca una pose con el centro del cuerpo en ax y los pies en ay. s = px por carácter.
function place(name, flip, ax, ay, s) {
  const P = POSES[name], w = P.g[0].length, h = P.g.length;
  return [Math.round(ax - (flip ? w - P.cx : P.cx) * s), Math.round(ay - h * s)];
}
function drawPose(c, name, x, y, s, color, flip = false) {
  const g = POSES[name].g, w = g[0].length, mask = [];
  const fn = typeof color === "function";
  for (let r = 0; r < g.length; r++)
    for (let q = 0; q < w; q++) {
      if (g[r][flip ? w - 1 - q : q] === ".") continue;
      for (let dy = 0; dy < s; dy++)
        for (let dx = 0; dx < s; dx++) {
          const px = x + q * s + dx, py = y + r * s + dy;
          if (!inside(px, py)) continue;
          c.px(px, py, fn ? color(px, py, r) : color);
          mask.push(py * W + px);
        }
    }
  return mask;
}
function eyesOf(name, x, y, s, flip) {
  const P = POSES[name], w = P.g[0].length;
  return P.eyes.map(([col, row]) => [x + (flip ? w - col - 2 : col) * s, y + row * s]).sort((a, b) => a[0] - b[0]);
}
function drawEyes(c, list, s, style, key) {
  list.forEach(([x, y], i) => {
    if (s === 1) {
      if (style === "blink") c.rect(x, y + 1, 2, 1, key);
      else if (style === "happy") c.rect(x, y, 2, 1, key);
      else c.rect(x, y, 2, 2, key);
      return;
    }
    switch (style) {
      case "blink": c.rect(x, y + 3, 4, 1, key); break;
      case "happy": c.rect(x + 1, y + 1, 2, 1, key); c.vline(x, y + 2, 2, key); c.vline(x + 3, y + 2, 2, key); break;
      case "down": c.rect(x, y + 1, 4, 4, key); break;
      case "up": c.rect(x, y - 1, 4, 4, key); break;
      case "left": c.rect(x - 1, y, 4, 4, key); break;
      case "right": c.rect(x + 1, y, 4, 4, key); break;
      case "half": c.rect(x, y + 2, 4, 2, key); break;
      case "wide": c.rect(x, y - 1, 4, 5, key); if (key === "k") c.px(x + 1, y, "y"); break;
      case "stress": (i === 0 ? ["xx..", "..xx", "xx.."] : ["..xx", "xx..", "..xx"]).forEach((row, r) =>
        [...row].forEach((ch, q) => ch === "x" && c.px(x + q, y + 1 + r, key))); break;
      case "x": for (let d = 0; d < 4; d++) { c.px(x + d, y + d, key); c.px(x + 3 - d, y + d, key); } break;
      default: c.rect(x, y, 4, 4, key); if (key === "e") c.px(x + 2, y + 1, "y");
    }
  });
}

// ------------------------------------------------------------------ guion de Clawd
const two = (f) => Math.floor(f / 2);
const CARD_ORDER = [5, 4, 3, 2, 1, 0];                 // se reparten de arriba hacia abajo
function clawd(f) {
  const s = { pose: "idle", flip: false, dy: 0, dx: 0, eyes: "sq" };
  const calmType = () => { s.pose = ["type_l", "idle", "type_r", "idle"][two(f) % 4]; s.eyes = f % 90 >= 30 && f % 90 < 34 ? "blink" : "down"; };
  if (f < T.rush || f >= T.retype) calmType();
  else if (f < T.slump) { s.pose = ["type_l", "type_r"][two(f) % 2]; s.eyes = f < 85 ? "half" : "stress"; }
  else if (f < T.cmd) { s.pose = "slump"; s.eyes = f >= 126 && f < 130 ? "blink" : "stress"; if (f >= 132 && f < 140) s.dy = 1; }
  else if (f < T.enter) s.eyes = "up";
  else if (f < T.omen) { s.pose = "surprise"; s.eyes = "wide"; }
  else if (f < T.charge) s.eyes = "up";
  else if (f < T.hit) { s.pose = "squash"; s.eyes = "wide"; s.dx = two(f) % 2 ? 1 : -1; }
  else if (f < 220) { s.pose = "smear"; s.eyes = "wide"; }
  else if (f < 222) { s.pose = "smear2"; s.eyes = "wide"; }
  else if (f < 232) { s.pose = "squash"; s.eyes = "x"; }
  else if (f < 238) { s.pose = "surprise"; s.eyes = "wide"; }
  else if (f < T.power) { s.eyes = f >= 252 && f < 256 ? "blink" : "sq"; }
  else if (f < 332) { s.pose = "armsup"; s.eyes = "happy"; }
  else if (f < T.route) { s.eyes = f >= 360 && f < 364 ? "blink" : "sq"; }
  else if (f < T.work) {
    const k = Math.floor((f - T.route) / 12), t = (f - T.route) % 12;
    const tier = CARDS[CARD_ORDER[Math.min(5, k)]].tier;
    if (k < 6 && t < 8) {
      if (tier === "t") { s.pose = "point_l"; s.eyes = "left"; }
      else if (tier === "h") { s.pose = "point_l"; s.flip = true; s.eyes = "right"; }
      else { s.pose = "think"; s.eyes = "up"; }
    }
  } else if (f < T.brief) s.eyes = ["left", "up", "right", "sq"][Math.floor((f - T.work) / 20) % 4];
  else if (f < T.cursor) s.eyes = "happy";
  else if (f < T.press) s.eyes = "right";
  else if (f < T.party) s.eyes = "wide";
  else if (f < T.ret) {
    const t = f - T.party;
    if (t < 4) s.pose = "squash";
    else if (t < 6) s.pose = "surprise";
    else if (t < 20) { s.pose = "armsup"; const u = (t - 5) / 15; s.dy = -Math.round(8 * u * (1 - u)); }
    else if (t < 24) s.pose = "squash";
    else s.pose = "armsup";
    s.eyes = "happy";
  } else if (f < 744) s.eyes = "happy";
  else s.eyes = f >= 780 && f < 784 ? "blink" : "sq";
  // flota en el espacio
  if (f >= 273 && f < 760) {
    const amp = Math.min(ease((f - 273) / 17), 1 - ease((f - 740) / 20));
    s.dy += Math.round(Math.sin(((f - 273) / 90) * TAU) * 1.5 * amp);
  }
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

function skin(f, dy) {
  if (f < T.hit) return "o";
  if (f < T.hit + 2) return "c";
  if (f < 228) return "p";
  if (f < 240) return Math.floor(f / 3) % 2 ? "p" : "o";
  if (f < T.morph || f >= T.calm) return "o";
  const r1 = ease((f - T.morph) / 40) * 34, r2 = ease((f - 744) / 24) * 34;
  return (x, y) => {
    const d = Math.hypot(x - CXP, (y - 82 - dy) * 1.25);
    const tone = (r, inner, outer, edge) => {
      if (d < r - 2) return inner;
      if (d >= r + 2) return outer;
      if (r > 1 && Math.abs(d - r) < 0.8) return edge;
      return bay(x, y) < (r + 2 - d) / 4 ? inner : outer;
    };
    const k = f < T.power ? tone(r1, "*", "o", "v") : f < 744 ? "*" : tone(r2, "o", "*", "y");
    return k === "*" ? nebula(x, y, f, dy) : k;
  };
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
  const flash = f < T.power + 3 || f >= 740;
  const inner = flash ? "y" : "a", outer = Math.floor(f / 20) % 3 === 0 ? "L" : "A";
  for (let i = 0; i < W * H; i++) {
    if (mask[i]) continue;
    if (d1[i]) c.px(i % W, (i / W) | 0, inner);
    else if (d3[i] && !d2[i] && f >= T.power + 6) c.px(i % W, (i / W) | 0, outer);
  }
}

// ------------------------------------------------------------------ cuarto y espacio
function wipeR(f) {
  if (f < T.wipe || f >= 792) return -1;
  if (f < T.wipe + 32) return ease((f - T.wipe) / 32) * 175;
  if (f < 760) return 999;
  return (1 - ease((f - 760) / 32)) * 175;
}
const inR = (x, y, R) => R > 0 && Math.hypot(x - CXP, y - 82) < R;

function room(c) {
  c.rect(0, 0, W, 100, "K");
  for (let y = 44; y < 100; y++)                       // la luz de la pantalla sobre la pared
    for (let x = 22; x < 98; x++) {
      const d = Math.hypot(x - 60, (y - 80) * 1.2);
      if (d < 20 || (d < 34 && bay(x, y) < (34 - d) / 14)) c.px(x, y, "J");
    }
  c.rect(0, 100, W, 13, "D");
  c.hline(0, 100, W, "E");
  c.hline(0, 104, 46, "E"); c.hline(52, 104, 68, "E");
  c.hline(0, 108, 28, "E"); c.hline(34, 108, 86, "E");
  c.hline(0, 113, W, "U");
  c.rect(0, 114, W, 6, "Y");
}

const STARS = (() => {
  const r = seeded(77), out = [];
  for (let i = 0; i < 70; i++) out.push([Math.floor(r() * W), Math.floor(r() * H), r() < 0.12 ? 3 : r() < 0.45 ? 2 : 1, Math.floor(r() * 90)]);
  return out;
})();
function space(c, f, R) {
  for (let y = 0; y < H; y++) {
    const dy = y - 82;
    if (Math.abs(dy) >= R) continue;
    const half = Math.sqrt(R * R - dy * dy), x0 = Math.max(0, Math.ceil(CXP - half)), x1 = Math.min(W - 1, Math.floor(CXP + half));
    if (x1 >= x0) c.rect(x0, y, x1 - x0 + 1, 1, "z");
  }
  for (const [x, y, lv, ph] of STARS)
    if (inR(x, y, R)) c.px(x, y, String(Math.min(3, lv + ((f + ph) % 90 < 6 ? 1 : 0))));
  if (R < 200)                                          // frente de la onda
    for (let k = 0, n = Math.ceil(R * 7) + 8; k < n; k++) {
      const a = (k / n) * TAU, x = Math.round(CXP + Math.cos(a) * R), y = Math.round(82 + Math.sin(a) * R);
      if (inside(x, y)) c.px(x, y, "l");
    }
}

// Rectángulo que solo pinta fuera de la onda (la laptop desaparece y reaparece con ella).
function rectOut(c, x, y, w, h, col, R) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) if (!inR(xx, yy, R)) c.px(xx, yy, col);
}
function laptop(c, R) {
  rectOut(c, 32, 90, 56, 1, "i", R);
  rectOut(c, 31, 91, 58, 16, "g", R);
  rectOut(c, 31, 91, 1, 16, "G", R);
  rectOut(c, 88, 91, 1, 16, "G", R);
  for (let yy = 102; yy < 106; yy++)
    for (let xx = 32; xx < 88; xx++) if (bay(xx, yy) < 0.3 && !inR(xx, yy, R)) c.px(xx, yy, "G");
  rectOut(c, 32, 106, 56, 1, "G", R);
  rectOut(c, 59, 97, 3, 3, "i", R);
  rectOut(c, 29, 107, 62, 2, "I", R);
  for (let xx = 28; xx < 92; xx++) if (bay(xx, 109) < 0.5 && !inR(xx, 109, R)) c.px(xx, 109, "E");
}

function clouds(c, f) {
  if (f < T.omen - 2 || f >= 242) return;
  const k = ease((f - (T.omen - 2)) / 22);
  let lx = Math.round(-48 + k * 64), rx = Math.round(120 - k * 62), y = 21;
  if (f >= 226) { const u = ease((f - 226) / 14); lx -= Math.round(u * 56); rx += Math.round(u * 56); y -= Math.round(u * 6); }
  c.stamp("_cloud", lx, y);
  c.stamp("_cloud", rx, y + 2, { flip: "x" });
  const charge = f >= T.charge && f < T.hit, rnd = seeded(500 + two(f));
  for (let i = 0, n = charge ? 12 : 3; i < n; i++) {
    const left = rnd() < 0.5, bx = (left ? lx : rx) + 8 + Math.floor(rnd() * 30), by = y + 7 + Math.floor(rnd() * 6);
    if (inside(bx, by)) c.px(bx, by, charge ? "y" : "l");
  }
}

const BOLTS = [0, 1, 2, 3].map((v) => {
  const rnd = seeded(1000 + v), pts = [[60, 36]];
  for (let y = 40; y < 58; y += 6) pts.push([Math.round(60 + (rnd() - 0.5) * 14), y]);
  pts.push([60, 58]);
  return pts;
});
function bolt(c, f, dark) {
  if (f < T.hit || f >= 232 || (f >= 226 && f % 3 === 0)) return;
  const pts = BOLTS[two(f) % BOLTS.length], strong = f < 226;
  const seg = (col, w) => { for (let i = 0; i < pts.length - 1; i++) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col, w); };
  if (dark) { seg("c", 3); return; }
  if (strong) seg("L", 3);
  seg(strong ? "y" : "l", 1);
  if (strong) { const [bx, by] = pts[2]; c.line(bx, by, bx + 7, by + 5, "l"); c.line(bx + 7, by + 5, bx + 9, by + 10, "l"); }
}
function sparks(c, f) {
  if (f < 222 || f >= 240) return;
  const rnd = seeded(2000 + two(f));
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU, r = 30 + rnd() * 12, col = rnd() < 0.5 ? "l" : "y";
    const x = Math.round(CXP + Math.cos(a) * r), y = Math.round(80 + Math.sin(a) * r * 0.6);
    for (const [dx, dy] of [[0, 0], [1, -1], [2, 0], [3, -1]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, col);
  }
}
function shock(c, f) {
  const t = f - 222;
  if (t < 0 || t > 22) return;
  const rx = Math.round(14 + t * 2.6);
  c.ellipse(CXP, 104, rx, Math.max(2, Math.round(rx / 6)), t < 6 ? "y" : t < 12 ? "l" : "L", true);
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

// ------------------------------------------------------------------ tareas
const CARDS = [
  { tier: "t", land: 24, x: 9, y: 101 }, { tier: "b", land: 40, x: 11, y: 95 }, { tier: "h", land: 56, x: 8, y: 89 },
  { tier: "t", land: 72, x: 10, y: 83 }, { tier: "h", land: 90, x: 12, y: 77 }, { tier: "b", land: 108, x: 9, y: 71 },
];
const TIER = { t: 0, b: 1, h: 2 };
const dispatchAt = (i) => T.route + CARD_ORDER.indexOf(i) * 12;
function pileCount(f) { return CARDS.filter((cd, i) => f >= cd.land && f < dispatchAt(i)).length; }

function cards(c, f, flying) {
  CARDS.forEach((cd, i) => {
    const map = { S: cd.tier }, start = dispatchAt(i);
    if (!flying) {
      if (f < cd.land - 14 || f >= start) return;
      if (f < cd.land) {                                 // cae con aceleración
        const u = (f - (cd.land - 14)) / 14;
        paintGrid(c, PROPS.card, cd.x, Math.round(lerp(22, cd.y, u * u)), map);
      } else if (f < cd.land + 2) paintGrid(c, PROPS.card_squash, cd.x - 1, cd.y + 2, map);
      else {
        const bob = f >= 262 ? Math.round(Math.sin(((f + i * 17) / 45) * TAU)) : 0;
        paintGrid(c, PROPS.card, cd.x, cd.y + bob, map);
      }
      return;
    }
    const t = f - start;
    if (t < 0 || t >= 18) return;
    const S = SLOTS[TIER[cd.tier]], to = [S.x + 6, S.y + 10], from = [cd.x, cd.y];
    const [x, y] = bez(from, [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 26], to, ease(t / 18));
    const spin = ["card", "card_tilt", "card_edge", "card_tilt"][two(t) % 4];
    paintGrid(c, PROPS[spin], x, y + (spin === "card_edge" ? 3 : spin === "card_tilt" ? 1 : 0), map);
  });
}

// ------------------------------------------------------------------ subagentes
const SLOTS = [
  { x: 4, y: 32, k: ["t", "T", "4"], born: 340, done: 500 },   // ligero
  { x: 48, y: 8, k: ["b", "B", "5"], born: 348, done: 520 },   // medio
  { x: 92, y: 32, k: ["h", "H", "6"], born: 356, done: 540 },  // fuerte
];
const LINKS = SLOTS.map((S) => {
  const a = [60, 61], b = [S.x + 12, S.y + 20], m = [(a[0] + b[0]) / 2, S.y === 8 ? 45 : 58];
  const pts = [];
  for (let k = 0; k <= 60; k++) pts.push(bez(a, m, b, k / 60));
  return pts.filter((p, k) => k % 3 === 0);
});
const ARCS = [[[50, 27], [30, 28], [29, 39]], [[70, 27], [90, 28], [91, 39]]].map(([a, m, b]) => {
  const pts = [];
  for (let k = 0; k <= 45; k++) pts.push(bez(a, m, b, k / 45));
  return pts.filter((p, k) => k % 3 === 0);
});
const along = (path, u) => path[Math.round(clamp01(u) * (path.length - 1))];
const WALK = ["walk_a", "walk_a", "idle", "idle", "walk_b", "walk_b", "idle", "idle"];
const TYPE = ["type_l", "type_l", "idle", "idle", "type_r", "type_r", "idle", "idle"];

function crabState(i, f) {
  const S = SLOTS[i], t = f - S.born, D = S.done;
  const st = { show: t >= 6, pose: "idle", x: S.x, y: S.y, dy: 0, eyes: "sq", laptop: true };
  if (t < 10) { st.pose = "ball"; st.laptop = false; }
  else if (t < 14) { st.pose = "unfold"; st.laptop = false; st.dy = -2; }
  else if (f < T.work) st.eyes = (f + i * 7) % 50 < 3 ? "blink" : "sq";
  else if (f < D) st.pose = TYPE[(f + i * 3) % 8];
  else if (f < D + 8) { st.pose = "armsup"; st.eyes = "happy"; st.dy = f - D >= 2 && f - D < 6 ? -2 : 0; }
  else if (f < D + 16) st.eyes = "happy";
  else {
    st.laptop = false;
    const e = f - (D + 16);
    if (i === 1) {                                       // el azul sale de un salto
      if (e < 4) st.pose = "squash";
      else if (e < 6) st.pose = "surprise";
      else { st.pose = "armsup"; st.dy = -(e - 5) * 4; }
      if (S.y + st.dy < -24) st.show = false;
    } else {                                             // los otros caminan de lado
      st.pose = WALK[e % 8];
      st.x += (i === 0 ? -1 : 1) * e;
      st.dy = st.pose === "idle" ? 0 : -1;
      if (st.x < -28 || st.x > W + 4) st.show = false;
    }
  }
  return st;
}

function sparkle(c, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  if (inside(x, y)) c.px(x, y, col);
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, arm);
}

function crabs(c, f) {
  if (f < T.spawn || f >= 600) return;
  // enlaces de la constelación
  SLOTS.forEach((S, i) => {
    if (f < 360 || f >= S.done + 16) return;
    LINKS[i].slice(0, Math.round(LINKS[i].length * ease((f - 360) / 20))).forEach(([x, y]) => c.px(x, y, "r"));
  });
  if (f >= 366 && f < SLOTS[0].done)
    ARCS.forEach((arc) => arc.slice(0, Math.round(arc.length * ease((f - 366) / 20))).forEach(([x, y]) => c.px(x, y, "r")));
  SLOTS.forEach((S, i) => {
    const t = f - S.born;
    if (t >= 0 && t < 8) sparkle(c, S.x + 12, S.y + 8, [1, 2, 3, 3][Math.min(3, two(t))] - (t >= 6 ? 2 : 0));
    const st = crabState(i, f);
    if (!st.show) return;
    const [x, y] = place(st.pose, false, st.x + 12, st.y + 16 + st.dy, 1);
    drawPose(c, st.pose, x, y, 1, (px, py, r) => (r < 2 ? S.k[1] : S.k[0]));
    drawEyes(c, eyesOf(st.pose, x, y, 1, false), 1, st.eyes, "c");
    if (st.laptop) {
      const lx = S.x, ly = S.y;
      const hit = CARDS.some((cd, ci) => TIER[cd.tier] === i && f - dispatchAt(ci) >= 18 && f - dispatchAt(ci) < 21);
      c.rect(lx + 4, ly + 9, 16, 9, "F");
      c.rect(lx + 5, ly + 10, 14, 7, hit ? "x" : "c");
      c.rect(lx + 2, ly + 18, 20, 2, "F");
      const prog = clamp01((f - T.work) / (S.done - T.work));
      [10, 7, 12].forEach((len, k) => {
        const w = Math.round(clamp01(prog * 3.2 - k) * len);
        if (w > 0) c.hline(lx + 6, ly + 11 + k * 2, w, S.k[1]);
      });
    }
    if (f === S.done + 16 || f === S.done + 17) sparkle(c, S.x + 12, S.y + 13, 2);
    // barra de progreso y palomita
    if (t >= 14 && f < S.done + 16) {
      const prog = ease((f - T.work) / (S.done - T.work));
      c.rect(S.x + 4, S.y - 6, 16, 4, "F");
      c.rect(S.x + 5, S.y - 5, 14, 2, "c");
      const w = Math.round(14 * prog);
      if (w > 0) c.rect(S.x + 5, S.y - 5, w, 2, f >= S.done ? "y" : S.k[1]);
      if (f >= S.done) paintGrid(c, PROPS.check.map((row) => row.slice(0, Math.min(7, (f - S.done) * 2 + 1))), S.x + 21, S.y - 7);
    }
  });
}

// Paquetes que suben de Clawd a los subagentes, resultados que regresan y anillos al absorberlos.
function flows(c, f, dy) {
  SLOTS.forEach((S, i) => {
    if (f >= T.work && f < S.done)
      for (let s0 = T.work + 2 + i * 5; s0 < S.done; s0 += 14) {
        const age = f - s0;
        if (age >= 0 && age < 18) { const [x, y] = along(LINKS[i], 1 - age / 17); c.rect(x, y, 2, 2, S.k[1]); }
      }
    const t = f - S.done;
    if (t >= 0 && t < 16) {
      const [x, y] = along(LINKS[i], 1 - ease(t / 16));
      c.rect(x - 1, y, 4, 2, S.k[0]); c.rect(x, y - 1, 2, 4, S.k[0]); c.rect(x, y, 2, 2, "y");
    }
    if (t >= 16 && t < 30) {
      const q = (t - 16) / 14;
      c.ellipse(CXP, 84 + dy, Math.round(28 + q * 28), Math.round(6 + q * 6), q < 0.4 ? S.k[1] : q < 0.75 ? S.k[0] : S.k[2], true);
    }
  });
}

// ------------------------------------------------------------------ órbita y destellos cósmicos
const ORBIT_PTS = (() => {
  const seen = new Set(), pts = [];
  for (let k = 0; k < 900; k++) {
    const a = (k / 900) * TAU, x = Math.round(60 + Math.cos(a) * 54), y = Math.round(86 + Math.sin(a) * 10);
    if (!seen.has(x + "," + y)) { seen.add(x + "," + y); pts.push([x, y, a]); }
  }
  return pts;
})();
function orbit(c, f, front) {
  if (f < 325 || f >= 744) return;
  const sweep = (f < T.ret ? ease((f - 325) / 30) : 1 - ease((f - T.ret) / 20)) * TAU;
  for (const [x, y, a] of ORBIT_PTS) if (a < sweep && Math.sin(a) > 0 === front) c.px(x, y, "r");
  if (f < 345 || f >= T.ret) return;
  for (const [speed, rad, col, off] of [[1 / 210, 2, "A", 0], [1 / 130, 1, "R", 0.5]]) {
    const a = ((f - 345) * speed + off) * TAU;
    if (Math.sin(a) > 0 !== front) continue;
    const x = Math.round(60 + Math.cos(a) * 54), y = Math.round(86 + Math.sin(a) * 10);
    c.circ(x, y, rad, col);
    if (rad > 1) c.px(x - 1, y - 1, "a");
  }
}
function burst(c, f) {
  let t = f - T.power, rx, col;
  if (t >= 0 && t <= 18) { rx = 28 + t * 2.4; col = t < 5 ? "y" : t < 11 ? "a" : "A"; }
  t = f - 732;
  if (t >= 0 && t <= 12) { rx = 60 - t * 2.6; col = t < 5 ? "A" : t < 9 ? "a" : "y"; }
  if (rx) c.ellipse(CXP, 82, Math.round(rx), Math.round(rx * 0.62), col, true);
}

// ------------------------------------------------------------------ brief, cursor y festejo
const BRIEF = [
  [["BRIEF", "f"]],
  [[">", "X"], [" DONE 3/3", "x"]],
  [[">", "X"], [" ASSUMPTIONS 3", "x"]],
  [[">", "X"], [" RADAR ", "x"], ["", "radar"]],
  [["!", "w"], [" NEEDS YOUR YES", "x"]],
  [["  PUSH MERGE?", "x"], ["", "button"]],
];
const BUTTON = { x: 82, y: 40, w: 10, h: 8 };
function cursorAt(f) {
  if (f < T.cursor || f >= 702) return null;
  if (f < 676) { const u = ease((f - T.cursor) / 22); return [Math.round(lerp(126, 87, u) + Math.sin(u * Math.PI) * 6), Math.round(lerp(126, 44, u))]; }
  if (f < 690) return [87, 44];
  const u = ease((f - 690) / 12);
  return [Math.round(lerp(87, 130, u)), Math.round(lerp(44, 110, u))];
}
function brief(c, f) {
  const t = f - T.brief;
  if (t < 0 || f >= T.ret + 12) return;
  const g = f < T.ret ? ease(t / 12) : 1 - ease((f - T.ret) / 12);
  const w = Math.round(8 + g * 68), h = Math.round(6 + g * 42), x = 60 - Math.floor(w / 2), y = 26 - Math.floor(h / 2);
  if (t >= 8 && f < T.ret + 4) { c.rect(56, y + h, 8, 57 - y - h, "F"); c.rect(48, 57, 24, 2, "f"); }
  c.rect(x, y, w, h, "f");
  const flash = f >= T.press && f < T.press + 4;
  c.rect(x + 2, y + 2, w - 4, h - 4, flash ? "Q" : "c");
  if (t < 14 || f >= T.ret) return;
  const merged = f >= T.press;
  let budget = Math.floor((t - 14) * 1.4), cursor = null;
  for (let li = 0; li < BRIEF.length && budget >= 0; li++) {
    let cx = 27;
    const cy = 6 + li * 7;
    if (merged && li === 4) { paintGrid(c, PROPS.check, 27, cy, { y: "j" }); c.text(37, cy, "MERGED", "j"); continue; }
    if (merged && li === 5) {
      c.text(27, cy, "> OK", "x");
      if (Math.floor(f / 10) % 2 === 0) c.rect(43, cy + 4, 3, 1, "x");
      continue;
    }
    for (const [str, col] of BRIEF[li]) {
      if (col === "radar") {
        ["t", "b", "h"].forEach((k, q) => { if (budget-- > 0) c.rect(cx + q * 5, cy, 4, 4, k); });
        continue;
      }
      if (col === "button") {
        if (budget-- <= 0) break;
        const hover = f >= 676, down = f >= 679 && f < T.press;
        const by = BUTTON.y + (down ? 1 : 0);
        c.rect(BUTTON.x, by, BUTTON.w, BUTTON.h, "f");
        c.rect(BUTTON.x + 1, by + 1, BUTTON.w - 2, BUTTON.h - 2, down ? "w" : hover ? "A" : "c");
        c.text(BUTTON.x + 4, by + 2 - 1 + 1, "Y", hover ? "y" : "f");
        continue;
      }
      const shown = str.slice(0, Math.max(0, budget));
      budget -= str.length;
      if (shown.trim()) c.text(cx, cy, shown, col);
      cx += shown.length * 4;
      if (budget < 0) { cursor = [cx, cy]; break; }
    }
  }
  if (cursor) c.rect(cursor[0], cursor[1] + 4, 3, 1, "x");
  const cp = cursorAt(f);
  if (cp) {
    const down = f >= 679 && f < T.press;
    paintGrid(c, PROPS.cursor, cp[0] + (down ? 1 : 0), cp[1] + (down ? 1 : 0), down ? { y: "x" } : {});
  }
}

const CONFETTI = (() => {
  const r = seeded(4242), out = [];
  for (let k = 0; k < 46; k++) out.push({ x: 4 + r() * 112, y: -4 - r() * 26, vx: (r() - 0.5) * 0.6, vy: 0.6 + r() * 0.7, col: ["t", "b", "h", "y", "a"][k % 5], d: Math.floor(r() * 10) });
  return out;
})();
function confetti(c, f) {
  for (const p of CONFETTI) {
    const t = f - T.press - p.d;
    if (t < 0 || t > 70) continue;
    const x = Math.round(p.x + p.vx * t + Math.sin((t + p.d * 3) / 6) * 1.5), y = Math.round(p.y + p.vy * t + 0.012 * t * t);
    if (!inside(x, y) || !inside(x + 1, y + 1)) continue;
    if (two(t + p.d) % 2) c.rect(x, y, 2, 1, p.col); else c.rect(x, y, 1, 2, p.col);
  }
}

// ------------------------------------------------------------------ barra de Claude Code
function ctxValue(f) {
  if (f < T.cmd) return 0.1 + 0.82 * ease(f / 140);
  if (f < T.route) return 0.92;
  if (f < T.work) return 0.92 - 0.57 * ease((f - T.route) / 72);
  if (f < T.ret) return 0.35;
  return 0.35 - 0.25 * ease((f - T.ret) / 60);
}
function hud(c, f) {
  let o = 0;                                             // la barra sube y sale en la fase cósmica
  if (f >= T.wipe && f < 754) o = -Math.round(ease((f - T.wipe) / 12) * 21);
  else if (f >= 754 && f < 766) o = -Math.round((1 - ease((f - 754) / 12)) * 21);
  if (o <= -21) return;
  const flash = f >= T.enter && f < T.enter + 4;
  c.rect(4, 3 + o, 112, 11, flash ? "l" : "c");
  c.box(4, 3 + o, 112, 11, "F");
  let left = "> WORKING", lc = "x", right = `TASKS ${pileCount(f)}`, rc = "X", caret = false;
  if (f >= T.cmd && f < T.enter) { left = "> " + "/AETHER".slice(0, Math.floor((f - T.cmd) / 3)); right = ""; caret = true; }
  else if (f >= T.enter && f < T.spawn) { left = "> AETHER"; lc = flash ? "c" : "w"; right = "ON"; rc = flash ? "c" : "w"; }
  else if (f >= T.spawn && f < T.route) { left = "> SPAWNING AGENTS"; right = ""; }
  else if (f >= T.route && f < T.work) left = "> ROUTING BY TIER";
  else if (f >= T.work && f < T.brief) { left = "> 3 AGENTS WORKING"; right = ""; }
  else if (f >= T.brief && f < T.cursor) { left = "> WRITING BRIEF"; right = ""; }
  else if (f >= T.cursor && f < T.press) { left = "> WAITING FOR YOU"; lc = two(f) % 8 < 5 ? "w" : "X"; right = ""; }
  else if (f >= T.press && f < T.ret) { left = "> MERGED"; lc = "j"; right = "OK"; rc = "j"; }
  else if (f >= T.ret && f < 800) { left = "> DONE"; lc = "j"; }
  if (f >= T.route && f < T.work) right = `TASKS ${pileCount(f)}`;
  c.text(7, 6 + o, left, lc);
  if (caret && two(f) % 6 < 4) c.rect(7 + left.length * 4, 6 + o, 3, 5, "x");
  if (right) c.text(115 - right.length * 4, 6 + o, right, rc);
  // contexto ocupado
  const v = ctxValue(f);
  const col = f >= T.wipe && f < 760 ? "v" : v < 0.5 ? "j" : v < 0.8 ? "O" : f >= T.enter && two(f) % 4 < 2 ? "O" : "u";
  c.text(4, 15 + o, "CTX", "X");
  c.box(17, 15 + o, 99, 5, "F");
  c.rect(18, 16 + o, 97, 3, "c");
  c.rect(18, 16 + o, Math.round(97 * v), 3, col);
}

// Subtítulo de la fase cósmica: qué está haciendo Aether y cuánto contexto ocupa.
const CAPTIONS = [
  [T.spawn, "> AETHER ON", "w"], [T.route, "> SPAWNING AGENTS", "x"], [T.work, "> ROUTING BY TIER", "x"],
  [T.brief, "> AGENTS WORKING", "x"], [T.cursor, "> WRITING BRIEF", "x"], [T.press, "> WAITING FOR YOU", "w"],
  [T.ret, "> MERGED", "j"], [760, "> DONE", "j"],
];
function caption(c, f) {
  if (f < 256 || f >= 754) return;
  const o = f < 266 ? Math.round((1 - ease((f - 256) / 10)) * 16) : f >= 742 ? Math.round(ease((f - 742) / 12) * 16) : 0;
  const cap = CAPTIONS.find(([end]) => f < end);
  let [, text, col] = cap;
  if (col === "w" && f >= T.cursor && two(f) % 8 >= 5) col = "X";
  c.rect(4, 105 + o, 112, 12, "c");
  c.box(4, 105 + o, 112, 12, "F");
  c.text(7, 108 + o, text, col);
  c.text(80, 108 + o, "CTX", "X");
  c.box(93, 108 + o, 20, 5, "F");
  c.rect(94, 109 + o, Math.max(1, Math.round(18 * ctxValue(f))), 3, "v");
}

// ------------------------------------------------------------------ piezas
sprite("_cloud", { w: 46, h: 17 },
  rect(5, 9, 36, 7, "8"), circ(11, 9, 6, "8"), circ(22, 7, 7, "8"), circ(34, 9, 6, "8"),
  circ(21, 6, 5, "9"), circ(11, 8, 4, "9"), circ(33, 8, 4, "9"), circ(20, 3, 2, "0"), px(12, 5, "0"), px(32, 5, "0"),
  hline(6, 16, 34, "8"))

// La hoja de poses, para revisarlas sueltas.
const expand2 = (g) => g.flatMap((r) => { const w = [...r].map((ch) => ch + ch).join(""); return [w, w]; });
for (const name of ["idle", "type_l", "type_r", "think", "slump", "surprise", "armsup", "squash", "smear", "smear2", "point_l"]) {
  sprite("clawd_" + name, expand2(POSES[name].g).join("\n"),
    (c) => drawEyes(c, eyesOf(name, 0, 0, 2, false), 2, name === "squash" ? "x" : name === "slump" ? "stress" : name.startsWith("smear") || name === "surprise" ? "wide" : name === "armsup" ? "happy" : name.startsWith("type") ? "down" : name === "think" ? "up" : "sq", "k"));
}
SLOTS.forEach((S, i) => {
  for (const name of ["idle", "ball", "unfold", "type_l", "walk_a", "walk_b", "armsup"])
    sprite(`agent${i}_${name}`, POSES[name].g.join("\n"),
      (c) => {
        c.recolor({ o: S.k[0] });
        for (let x = 0; x < 24; x++) for (let y = 0; y < 2; y++) if (c.is(x, y, S.k[0])) c.px(x, y, S.k[1]);
        drawEyes(c, eyesOf(name, 0, 0, 1, false), 1, name === "armsup" ? "happy" : "sq", "c");
      });
});
for (const [name, grid] of Object.entries(PROPS)) sprite("prop_" + name, grid.join("\n"), (c) => c.recolor({ S: "b" }));

// ------------------------------------------------------------------ la animación
anim("aether", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  let f = c.frame;
  if (f >= 216 && f < 220) f = 216;                     // hit-stop: el mundo se congela tras el impacto
  const st = clawd(f), R = wipeR(f);
  const [x, y] = place(st.pose, st.flip, CXP + st.dx, FEET + st.dy, 2);

  if (f === T.hit || f === T.hit + 1) {                 // cuadro de impacto en negativo
    c.rect(0, 0, W, H, "W");
    bolt(c, f, true);
    drawPose(c, st.pose, x, y, 2, "c", st.flip);
    drawEyes(c, eyesOf(st.pose, x, y, 2, st.flip), 2, "wide", "W");
    c.rect(31, 90, 58, 19, "c");
    CARDS.forEach((cd) => { if (f >= cd.land) c.rect(cd.x, cd.y, 12, 8, "c"); });
    hud(c, f);
    return;
  }

  if (R < 999) room(c);
  if (R > 0) space(c, f, R);
  clouds(c, f);
  cards(c, f, false);
  orbit(c, f, false);
  crabs(c, f);
  shock(c, f);
  const mask = drawPose(c, st.pose, x, y, 2, skin(f, st.dy), st.flip);
  drawEyes(c, eyesOf(st.pose, x, y, 2, st.flip), 2, st.eyes, f >= 300 && f < 760 ? "e" : "k");
  for (const t0 of [80, 104, 124, 140]) {                // gotas de sudor
    const t = f - t0;
    if (t >= 0 && t < 14) paintGrid(c, PROPS.sweat, 78, 62 + two(t) * 2);
  }
  if (f >= T.power && f < 744) outline(c, mask, f);
  laptop(c, R);
  orbit(c, f, true);
  burst(c, f);
  flows(c, f, st.dy);
  cards(c, f, true);
  bolt(c, f, false);
  sparks(c, f);
  if (f >= 770 && f < 806) {                             // se queda con una chispa cósmica
    const t = f - 770;
    sparkle(c, 60, 56, t >= 28 ? 1 : [1, 2, 3, 2][two(t) % 4], "y", "v");
  }
  confetti(c, f);                                        // cae detrás del monitor
  brief(c, f);
  caption(c, f);
  hud(c, f);
  if (f >= 222 && f < 232) shake(c, [2, -2, 2, -1, 1, -1, 1, 0, -1, 0][f - 222], [1, -1, 0, 1, -1, 0, 1, 0, 0, 0][f - 222]);
})

sheet("aether_sheet", ["aether"], { cols: 34, pad: 0 })
sheet("aether_poses", ["clawd_*", "agent*", "prop_*"], { pad: 2 })
