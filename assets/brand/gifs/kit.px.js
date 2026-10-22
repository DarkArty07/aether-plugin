// kit.px.js: the shared look of the Clawd Aether world, taken from aether.px.js so every animation of the
// landing page uses the same palette, characters and helpers. Use it with `include("kit.px.js")` at the top
// of an animation file, then define your own `const W = ..., H = ...` (the canvas size): `inside`, `drawPose`
// and `paintGrid` read W and H when they run. Do not edit the copies here to change one animation; add to
// your own file. The comments below are the owner's, in Spanish.
const TAU = Math.PI * 2;

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

pal({
  // Catppuccin Mocha (the owner's palette) with the landing's violets. The letters are the old ones, so every animation recolours.
  z: "#0b0a16", 1: "#1e1b3a", 2: "#4a3a8a", 3: "#b4befe", Z: "#171434", W: "#f3eaff",    // espacio
  K: "#141225", J: "#1c1a38", D: "#6c7086", E: "#45475a", U: "#7f849c", Y: "#313244",    // piedra (antes madera)
  g: "#bac2de", G: "#9399b2", i: "#cdd6f4", I: "#45475a",                               // carcasa de computadora
  o: "#da7756", k: "#0a0a0a", p: "#f5c2e7", P: "#fce4f3",                               // Clawd
  y: "#ffffff", l: "#cba6f7", L: "#8466d6",                                             // rayo
  n: "#241b52", N: "#35286f", m: "#4a3a8a", M: "#8466d6", v: "#cba6f7", V: "#f5c2e7",   // nebulosa
  s: "#ffffff", S: "#b4befe", e: "#e6dcff", a: "#cba6f7", A: "#8466d6",                 // estrellas, ojos, contorno
  r: "#4a3a8a", R: "#9399b2",                                                           // orbita
  t: "#a6e3a1", T: "#d6f7d1", 4: "#4c9a58",                                             // subagente ligero (verde Mocha)
  b: "#89b4fa", B: "#c9dcff", 5: "#4668b8",                                             // subagente medio (azul Mocha)
  h: "#f5c2e7", H: "#ffe3f6", 6: "#b4609f",                                             // subagente fuerte (rosa Mocha)
  f: "#b4befe", F: "#7a78b8", c: "#0d0b1c", x: "#cdd6f4", X: "#9399b2", w: "#cba6f7",   // pantallas y texto
  j: "#a6e3a1", Q: "#1f3a2c", O: "#f9e2af", u: "#f38ba8",                               // exito, alerta
  C: "#cdd6f4", 7: "#89dceb", 8: "#313244", 9: "#45475a", 0: "#6c7086",                 // tarjetas, sudor, nube
})

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


// "en dos": un dibujo dura 2 cuadros
const two = (f) => Math.floor(f / 2);
