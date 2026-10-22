// lost.px.js: "404, Clawd se perdió en el espacio". La página no existe: Clawd flota en la noche con una linterna
// cuyo haz tramado (Bayer) barre la oscuridad. Un enorme 404 de bloques pasa como un asteroide, con piedras
// alrededor. Clawd lo alumbra, le sale un sudor y un "?", se encoge de hombros y un cangrejo diminuto asoma
// detrás de los dígitos y saluda. Aparece un planeta HOME con halo; Clawd lo nota, salta hacia él con un arco
// flotante y vuelve a su sitio mientras el planeta se apaga: el último cuadro lleva al primero, sin corte.
// Tema panteón: los dígitos son bloques de mármol tallado (grietas y banda de greca), las piedras son
// fragmentos de columnas dóricas y un busto roto, el planeta HOME lleva un templo dórico con la puerta
// encendida, el haz sigue tramado en violeta, y al fondo hay un planeta con anillos y una nebulosa estrellada.
// Mismo mundo que aether.px.js (kit.px.js trae la paleta, las poses y los ayudantes).
// Lienzo de 160 x 90 px (GIF a x6 = 960 x 540), 300 cuadros a 30 fps (10 s).
// Los personajes van "en dos" (cada dibujo dura 2 cuadros); haz, dígitos, rocas, chispas y halos, a 30 fps.
include("kit.px.js")

const W = 160, H = 90, N = 300;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;
const sm = (a, b, f) => ease((f - a) / (b - a));                 // 0 antes de a, 1 después de b
const win = (a, b, c2, d, f) => sm(a, b, f) * (1 - sm(c2, d, f)); // sube de a a b, baja de c2 a d
const CAPY = 76;                                                  // barra de abajo (y, alto 11)

// ------------------------------------------------------------------ guion (cuadros)
const SX = 34, SFEET = 66;                                       // el sitio de Clawd: centro del cuerpo y pies
const AX = 92, AFEET = 56;                                       // dónde aterriza junto al planeta
const HOME = { x: 139, y: 33, r: 10 };                           // el planeta
const T = {
  enter: 20,        // el 404 entra por la derecha
  lock: 56,         // el haz encuentra los dígitos
  crabPeek: 132, crabPop: 146, crabDuck: 214,
  planet: 170,      // el planeta se enciende
  notice: 190,      // Clawd lo ve
  hop0: 212, hop1: 248, back0: 266, back1: 298,
};

// ------------------------------------------------------------------ poses propias
// El cangrejo saluda con el brazo derecho: arriba del todo o a la altura del hombro.
POSES.wave_a = { cx: 12, eyes: [[6, 3], [16, 3]], g: [
  ...rep("....................oooo", 2),
  ...rep("....oooooooooooooooooooo", 2),
  ...rep("oooooooooooooooooooo....", 4),
  ...rep("....oooooooooooooooo....", 4),
  ...LEGS] };
POSES.wave_b = { cx: 12, eyes: [[6, 3], [16, 3]], g: [
  ...rep("........................", 2),
  ...rep("....oooooooooooooooooooo", 2),
  ...rep("oooooooooooooooooooo....", 4),
  ...rep("....oooooooooooooooo....", 4),
  ...LEGS] };
// Dónde está la mano derecha (la de la linterna) en cada pose, respecto a su esquina, con Clawd a 2 px por carácter.
const HAND = { idle: [44, 12], type_l: [44, 12], type_r: [44, 16], think: [44, 4], surprise: [44, 3], armsup: [44, 3], squash: [52, 8] };

// ------------------------------------------------------------------ el fondo (fijo: no pesa en el GIF)
const NEB = [];                                                  // nebulosa violeta, tramada (fija)
const FAR = { x: 66, y: 15, r: 7 };                              // el planeta con anillos del fondo
const BGSTARS = (() => {
  for (let y = 0; y < CAPY - 1; y++)
    for (let x = 0; x < W; x++) {
      const d = vnoise(x + 37, y + 11, 26) * 0.65 + vnoise(x, y, 9) * 0.35;
      const band = 1 - Math.min(1, Math.abs(x * 0.5 + y - 70) / 40);
      const v = (d * band - 0.2) * 3.4;
      if (v <= 0) continue;
      const b = bay(x, y);
      if (b < v - 1.3) NEB.push([x, y, "m"]);
      else if (b < v - 0.75) NEB.push([x, y, "N"]);
      else if (b < v - 0.3) NEB.push([x, y, "n"]);
      else if (b < v) NEB.push([x, y, "Z"]);
    }
  const r = seeded(33), out = [];
  for (let i = 0; i < 54; i++) {
    const s = { x: Math.floor(r() * W), y: Math.floor(r() * (CAPY - 3)), lv: r() < 0.1 ? 3 : r() < 0.45 ? 2 : 1,
      per: [60, 100, 150][i % 3], ph: Math.floor(r() * 150), tw: i % 7 === 0 };
    if (Math.abs(s.x - FAR.x) < 20 && Math.abs(s.y - FAR.y) < 11) continue;      // no sobre el planeta del fondo
    out.push(s);
  }
  return out;
})();
function drawFar(c) {                                            // anillo de atrás, esfera, anillo de delante
  const { x: PX, y: PY, r: PR } = FAR;
  const ring = (front) => {
    for (const [sc, col] of [[1, "L"], [0.82, "2"]])
      for (let i = 0; i < 400; i++) {
        const a = (i / 400) * TAU, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        const x = Math.round(PX + Math.cos(a) * 17 * sc + s * 2 * sc), y = Math.round(PY + s * 3.6 * sc - Math.cos(a) * 0.2);
        if (inside(x, y)) c.px(x, y, col);
      }
  };
  ring(false);
  const RAMP = ["z", "1", "N", "2", "L"];
  for (let y = PY - PR; y <= PY + PR; y++)
    for (let x = PX - PR; x <= PX + PR; x++) {
      const nx = (x - PX) / PR, ny = (y - PY) / PR, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      const l = clamp(clamp(-0.6 * nx - 0.55 * ny + 0.65 * nz, 0, 1) * 3.4 + 0.15 * Math.sin(ny * 6), 0, 3.99);
      const i = Math.floor(l);
      c.px(x, y, RAMP[Math.min(4, i + (l - i > bay(x, y) ? 1 : 0))]);
    }
  ring(true);
}

// ------------------------------------------------------------------ Clawd
const script = (tbl, g) => { let v = tbl[0][1]; for (const [t, val] of tbl) if (g >= t) v = val; return v; };
const POSE_T = [[0, "idle"], [18, "type_r"], [30, "type_l"], [56, "idle"], [78, "type_r"], [98, "idle"], [112, "think"], [124, "squash"],
  [130, "surprise"], [140, "idle"], [146, "surprise"], [158, "idle"], [162, "type_l"], [166, "type_r"], [170, "type_l"],
  [174, "type_r"], [178, "type_l"], [182, "type_r"], [186, "idle"], [190, "armsup"], [204, "squash"], [212, "surprise"],
  [214, "armsup"], [248, "squash"], [254, "armsup"], [266, "type_l"], [286, "idle"]];
const EYE_T = [[0, "right"], [10, "blink"], [12, "right"], [16, "left"], [28, "sq"], [34, "up"], [48, "right"], [58, "up"],
  [66, "right"], [78, "left"], [88, "sq"], [98, "right"], [108, "down"], [112, "up"], [124, "blink"], [130, "half"],
  [140, "wide"], [158, "happy"], [190, "wide"], [204, "blink"], [212, "happy"], [262, "right"], [272, "sq"],
  [280, "blink"], [283, "right"]];
const BLINKS = [52, 102, 172, 236];

const bobY = (g) => 1.5 * Math.sin(TAU * g / 100) + 0.8 * Math.sin(TAU * g / 150 + 1);
const bobX = (g) => 1.5 * Math.sin(TAU * g / 150 + 2);

// Recorrido del cuerpo (sin la flotación): quieto en su sitio, salto flotante hacia el planeta y regreso lento.
function track(g) {
  let cx = SX, fy = SFEET;
  if (g >= T.hop0 && g < T.hop1) {
    const u = (g - T.hop0) / (T.hop1 - T.hop0), e = ease(u);
    cx = lerp(SX, AX, e); fy = lerp(SFEET, AFEET, e) - 22 * 4 * u * (1 - u);
  } else if (g >= T.hop1 && g < T.back0) { cx = AX; fy = AFEET; }
  else if (g >= T.back0) {
    const u = clamp01((g - T.back0) / (T.back1 - T.back0)), e = ease(u);
    cx = lerp(AX, SX, e); fy = lerp(AFEET, SFEET, e) - 7 * 4 * u * (1 - u);
  }
  return [cx, fy];
}
function clawd(f) {
  const g = two(f) * 2;
  const [tx, ty] = track(g);
  let dy = 0;
  if (g >= 130 && g < 132) dy = -2; else if (g >= 132 && g < 140) dy = -1;
  if (g >= T.crabPop && g < T.crabPop + 10) { const u = (g - T.crabPop) / 10; dy += -Math.round(7 * 4 * u * (1 - u)); }   // salta al ver al cangrejo
  if (g >= T.notice && g < 204) dy -= 2;
  const pose = script(POSE_T, g);
  let eyes = script(EYE_T, g);
  if (BLINKS.some((b) => g >= b && g < b + 4) && ["sq", "right", "left", "up", "happy", "wide"].includes(eyes)) eyes = "blink";
  const cx = Math.round(tx + bobX(g)), feet = Math.round(ty + bobY(g)) + dy;
  const [x, y] = place(pose, false, cx, feet, 2);
  const [hx, hy] = HAND[pose];
  return { g, pose, eyes, x, y, cx, feet, hand: [x + hx, y + hy] };
}

// ------------------------------------------------------------------ el haz de la linterna
const TANB = 0.3;
const aimAt = (o, t) => Math.atan2(t[1] - o[1], t[0] - o[0]) * 180 / Math.PI;
function beamState(f, cl, D, crab) {
  const [hx, hy] = cl.hand;
  const free = -10 + 24 * Math.sin(TAU * f / 150 + 0.6) + 0.8 * Math.sin(TAU * f / 30);
  const scan = -17 + 34 * sm(80, 112, f);                              // recorre el 404 de izquierda a derecha
  const dig = [D.gx + scan, D.gy];
  const cr = [crab ? crab.cx : D.gx, D.gy - 22];
  const pl = [HOME.x, HOME.y + 2];
  const w1 = win(T.lock, T.lock + 14, 118, 128, f), w2 = win(126, 138, 200, 210, f), w3 = win(T.notice, T.notice + 8, 268, 282, f);
  let th = free;
  th = lerp(th, aimAt([hx, hy], dig), w1);
  th = lerp(th, aimAt([hx, hy], cr), w2);
  th = lerp(th, aimAt([hx, hy], pl), w3);
  const a = th * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
  let L = 58;
  L = lerp(L, Math.hypot(dig[0] - hx, dig[1] - hy) + 12, w1);
  L = lerp(L, Math.hypot(cr[0] - hx, cr[1] - hy) + 20, w2);
  L = lerp(L, Math.hypot(pl[0] - hx, pl[1] - hy) + 6, w3);
  return { th, ux, uy, hx, hy, ox: hx + ux * 9, oy: hy + uy * 9, L };
}
// Intensidad del haz en un punto: 1 en el eje y cerca de la lámpara, 0 fuera del cono.
function beamI(B, x, y, L) {
  const rx = x - B.ox, ry = y - B.oy, d = rx * B.ux + ry * B.uy;
  if (d < 0) return 0;
  const half = d * TANB + 1.2, n = Math.abs(rx * B.uy - ry * B.ux);
  if (n > half) return 0;
  const fall = 1 - d / L;
  return fall <= 0 ? 0 : fall * (0.3 + 0.7 * (1 - n / half));
}
function drawBeam(c, B) {
  const px = -B.uy, py = B.ux, e = B.L * TANB + 2;
  const xs = [B.ox, B.ox + B.ux * B.L + px * e, B.ox + B.ux * B.L - px * e];
  const ys = [B.oy, B.oy + B.uy * B.L + py * e, B.oy + B.uy * B.L - py * e];
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(CAPY - 2, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const I = beamI(B, x, y, B.L);
      if (I <= 0) continue;
      const b = bay(x, y);
      if (b < I - 0.78) c.px(x, y, "L");                       // el corazón del haz, violeta claro
      else if (b < I - 0.4) c.px(x, y, "r");
      else if (b < I * 1.1) c.px(x, y, "1");
    }
}
function drawFlash(c, cl, B) {                                   // la linterna en la mano: mango, cabeza y lente
  const { hx, hy, ux, uy } = B;
  const at = (k) => [Math.round(hx + ux * k), Math.round(hy + uy * k)];
  const [a0, a1] = [at(-2), at(5)], [b0, b1] = [at(5), at(8)];
  c.line(a0[0], a0[1], a1[0], a1[1], "I", 2);
  c.line(b0[0], b0[1], b1[0], b1[1], "g", 3);
  const [lx, ly] = at(9);
  c.px(lx, ly, "y"); c.px(Math.round(hx + ux * 8), Math.round(hy + uy * 8), "y");
}

// ------------------------------------------------------------------ el 404 de bloques y las piedras
const GLY = { 4: ["x.x", "x.x", "xxx", "..x", "..x"], 0: ["xxx", "x.x", "x.x", "x.x", "xxx"] };
const DSC = 5, DGAP = 3, DWID = 9 * DSC + 2 * DGAP, DHEI = 5 * DSC;     // 51 x 25
const DCU = DWID >> 1, DCV = DHEI >> 1;
const DM = (() => {
  const raw = [];
  for (let v = 0; v < DHEI; v++) {
    raw.push([]);
    for (let u = 0; u < DWID; u++) {
      const i = Math.floor(u / (3 * DSC + DGAP)), w = u - i * (3 * DSC + DGAP);
      raw[v].push(w < 3 * DSC && GLY["404"[i]][Math.floor(v / DSC)][Math.floor(w / DSC)] === "x");
    }
  }
  const at = (m, u, v) => v >= 0 && v < DHEI && u >= 0 && u < DWID && m[v][u];
  const m = raw.map((row, v) => row.map((on, u) => on && !(
    (!at(raw, u, v - 1) || !at(raw, u, v + 1)) && (!at(raw, u - 1, v) || !at(raw, u + 1, v))))); // esquinas convexas redondeadas
  // clase de cada punto: 1 cara, 2 borde iluminado (arriba/izquierda), 3 borde en sombra, 4 grieta, 5 greca tallada
  const cls = m.map((row, v) => row.map((on, u) => !on ? 0 : (!at(m, u, v + 1) || !at(m, u + 1, v)) ? 3 : (!at(m, u, v - 1) || !at(m, u - 1, v)) ? 2 : 1));
  // la banda de greca (meandro) corre por el centro de cada trazo: horizontal en los trazos horizontales, vertical en los otros
  const KEY = ["XXXXXXX.", "X.....X.", "X.XXX.XX"];
  for (let v = 0; v < DHEI; v++)
    for (let u = 0; u < DWID; u++) {
      if (cls[v][u] !== 1) continue;
      const i = Math.floor(u / (3 * DSC + DGAP)), w = u - i * (3 * DSC + DGAP);
      if (w >= 3 * DSC) continue;
      const gi = Math.floor(w / DSC), gj = Math.floor(v / DSC), g = GLY["404"[i]];
      const hz = g[gj][gi - 1] === "x" || g[gj][gi + 1] === "x";
      const lu = w % DSC, lv = v % DSC;
      if (hz && lv >= 1 && lv <= 3 && KEY[lv - 1][(u + 3) % 8] === "X") cls[v][u] = 5;       // la greca, solo en los trazos horizontales
      else if (!hz && lv === 0 && gj > 0 && lu >= 1 && lu <= 3) cls[v][u] = 5;               // y una junta entre bloques en los verticales
    }
  // grietas en zigzag que cruzan la talla (solo donde hay piedra)
  const CRK = [[11, 3, 1, 1], [1, 5, 1, 1], [19, 8, -1, 1], [29, 13, 1, 1], [24, 0, 1, 1], [37, 4, -1, 1], [47, 16, -1, 1], [42, 10, 1, 1]];
  for (const [u0, v0, dir, dv] of CRK) {
    let u = u0, v = v0;
    for (let k = 0; k < 7; k++) {
      if (v >= 0 && v < DHEI && u >= 0 && u < DWID && cls[v][u] && cls[v][u] !== 3) cls[v][u] = 4;
      if (k % 3 === 2) u += dir; else if (k % 2) v += dv; else u += dir;
      if (k % 3 === 1) v += dv;
    }
  }
  return cls;
})();
// niveles por clase: [oscuro, media luz, alumbrado]; mármol = el extremo claro del violeta, sombras violetas
const SHADE = { 1: ["2", "L", "e"], 2: ["L", "l", "W"], 3: ["1", "N", "2"], 4: ["z", "1", "N"], 5: ["1", "2", "L"] };
function litLevel(I, x, y) {                                     // 0 oscuro, 1 media luz, 2 alumbrado (tramado)
  const t = I * 1.7, fl = Math.floor(t);
  return Math.min(2, fl + (t - fl > bay(x, y) ? 1 : 0));
}

// Velocidad del 404 por tramos (px por cuadro): rápido al entrar, casi quieto en el centro, rápido al irse.
const SPEED = [[T.enter, 1.9], [70, 0.8], [110, 0.25], [150, 0.2], [200, 0.55], [260, 1.35], [299, 1.9]];
const GX0 = 200;
const GXS = (() => {
  const xs = [GX0];
  for (let f = 1; f <= N; f++) {
    let v = 0;
    if (f - 1 >= SPEED[0][0])
      for (let i = 1; i < SPEED.length; i++)
        if (f - 1 <= SPEED[i][0]) { v = lerp(SPEED[i - 1][1], SPEED[i][1], ease((f - 1 - SPEED[i - 1][0]) / (SPEED[i][0] - SPEED[i - 1][0]))); break; }
    xs.push(xs[f - 1] - v);
  }
  return xs;
})();
function digits(f0) {
  const f = two(f0) * 2;                                          // el 404 y las rocas van "en dos": pesan la mitad en el GIF
  const gx = Math.round(GXS[f]);
  const gy = Math.round(37 + 3 * Math.sin(TAU * f / 150 + 0.4) - 5 * sm(170, 290, f));
  const tilt = 0.05 * Math.sin(TAU * f / 150 + 1) + lerp(-0.07, 0.09, f / (N - 1));
  const bob = [0, 1, 2].map((i) => Math.round(1.6 * Math.sin(TAU * f / 100 + i * 2.1)));
  return { gx, gy, tilt, bob };
}
const topEdge = (D, x) => D.gy - DCV + Math.round(D.tilt * (x - D.gx)) + D.bob[1];
function drawDigits(c, D, B) {
  const bw = (DWID >> 1) + 5, bh = (DHEI >> 1) + 6;
  for (let y = Math.max(0, D.gy - bh); y <= Math.min(CAPY - 2, D.gy + bh); y++)
    for (let x = Math.max(0, D.gx - bw); x <= Math.min(W - 1, D.gx + bw); x++) {
      const i = clamp(Math.floor((x - D.gx + DCU) / (3 * DSC + DGAP)), 0, 2);
      const v = y - D.gy - Math.round(D.tilt * (x - D.gx)) - D.bob[i] + DCV;
      if (v < 0 || v >= DHEI) continue;
      const u = x - D.gx + Math.round(D.tilt * (v - DCV)) + DCU;
      if (u < 0 || u >= DWID) continue;
      const k = DM[v][u];
      if (!k) continue;
      c.px(x, y, SHADE[k][litLevel(beamI(B, x, y, B.L + 26), x, y)]);
    }
}

// Fragmentos que flotan: un tambor de columna, un capitel dórico, un trozo de fuste roto y un busto sin brazos.
// Cada uno es una silueta (1 piedra, 4 acanaladura u ojo) que gira despacio en su sitio; la luz la calcula el borde.
const box = (w, h, f) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => f(x, y)));
function rotGrid(g, a) {
  const w = g[0].length, h = g.length, S = Math.ceil(Math.hypot(w, h)) + 1, cx = (w - 1) / 2, cy = (h - 1) / 2, o = (S - 1) / 2;
  const co = Math.cos(a), si = Math.sin(a);
  return box(S, S, (x, y) => {
    const dx = x - o, dy = y - o, sx = Math.round(cx + dx * co + dy * si), sy = Math.round(cy - dx * si + dy * co);
    return sx >= 0 && sy >= 0 && sx < w && sy < h ? g[sy][sx] : 0;
  });
}
function lightGrid(g) {                                          // 1 cara, 2 borde de arriba/izquierda, 3 de abajo/derecha, 4 detalle
  const at = (x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length && g[y][x];
  return g.map((row, y) => row.map((k, x) => !k ? 0 : k === 4 ? 4 : (!at(x, y + 1) || !at(x + 1, y)) ? 3 : (!at(x, y - 1) || !at(x - 1, y)) ? 2 : 1));
}
const FRAG = {
  drum: box(12, 8, (x, y) => (x === 0 && y === 0) || (x === 11 && y === 7) || (x === 10 && y === 7) ? 0 : x % 2 === 1 && x < 11 && y > 0 && y < 7 ? 4 : 1),
  capital: box(13, 8, (x, y) => y < 2 ? 1 : y < 4 ? (x >= 1 + (y - 2) * 1 && x <= 11 - (y - 2) ? 1 : 0) : (x >= 4 && x <= 8 ? (x === 6 ? 4 : 1) : 0)),
  shaft: box(7, 15, (x, y) => y < [3, 1, 4, 0, 2, 4, 1][x] ? 0 : (x === 2 || x === 4) && y > 6 && y < 14 ? 4 : 1),
  bust: box(11, 13, (x, y) => {
    if (y < 9) { const dx = (x - 5) / 3.9, dy = (y - 4) / 4.7; if (dx * dx + dy * dy > 1) return 0; }
    else if (y < 10) { if (x < 4 || x > 6) return 0; }
    else { const half = 2.6 + (y - 10) * 1.2; if (Math.abs(x - 5) > half) return 0; if (y === 12 && (x === 4 || x === 5)) return 0; }
    if ((x === 3 || x === 7) && y === 4) return 4;               // las cuencas
    if (x === 5 && (y === 5 || y === 6)) return 4;               // la nariz
    if (x === 8 && y <= 2) return 0;                              // un trozo de la cabeza saltó
    return 1;
  }),
};
const ping = [0, 1, 2, 3, 2, 1];
const ROCKS = [
  { dx: -31, dy: 22, p: 0.95, ph: 0.0, kind: "drum", base: 0.2, amp: 0.55 },
  { dx: 34, dy: -19, p: 1.2, ph: 1.7, kind: "bust", base: 0.0, amp: 0.3 },
  { dx: 46, dy: 18, p: 1.25, ph: 3.1, kind: "capital", base: -0.25, amp: 0.4 },
  { dx: 6, dy: 29, p: 0.9, ph: 4.4, kind: "shaft", base: 1.2, amp: 0.25 },
].map((r) => ({ ...r, shapes: [-1, -0.34, 0.34, 1].map((k) => lightGrid(rotGrid(FRAG[r.kind], r.base + k * r.amp))) }));
function drawRocks(c, f0, D, B) {
  const f = two(f0) * 2;
  ROCKS.forEach((r, i) => {
    const x = Math.round(D.gx + r.dx + (r.p - 1) * (D.gx - GX0)), y = Math.round(D.gy + r.dy + 2 * Math.sin(TAU * f / 150 + r.ph));
    const sh = r.shapes[ping[(Math.floor(f / 14) + i) % 6]], h = sh.length, w = sh[0].length;
    if (x + w < 0 || x - w > W) return;
    for (let q = 0; q < h; q++)
      for (let p = 0; p < w; p++) {
        const k = sh[q][p], px = x - (w >> 1) + p, py = y - (h >> 1) + q;
        if (!k || !inside(px, py) || py >= CAPY - 1) continue;
        c.px(px, py, SHADE[k][litLevel(beamI(B, px, py, B.L + 26), px, py)]);
      }
  });
}

// ------------------------------------------------------------------ el cangrejo
// Asoma detrás de los dígitos (se recorta contra su borde de arriba), salta, aterriza y saluda; al final se esconde.
function crabState(f, D) {
  if (f < T.crabPeek || f >= T.crabDuck + 16) return null;
  const cx = D.gx + 1, off0 = 20;
  let off, pose = "idle", eyes = "sq";
  if (f < T.crabPeek + 6) off = lerp(off0, 11, ease((f - T.crabPeek) / 6));
  else if (f < T.crabPop) {
    off = 11;
    const t = f - T.crabPeek - 6;
    eyes = t < 3 ? "left" : t < 6 ? "right" : "sq";                        // asoma y mira a los lados
  } else if (f < T.crabPop + 7) { off = lerp(11, -9, ease((f - T.crabPop) / 7)); pose = "armsup"; eyes = "wide"; }
  else if (f < T.crabPop + 13) { off = lerp(-9, 0, ((f - T.crabPop - 7) / 6) ** 2); pose = "armsup"; eyes = "happy"; }
  else if (f < T.crabPop + 17) { off = 0; pose = "squash"; eyes = "happy"; }
  else if (f < T.crabDuck) {
    off = 0; eyes = "happy";
    pose = mod(Math.floor((f - 166) / 4), 2) ? "wave_a" : "wave_b";
    if ((f - 166) % 40 >= 36) eyes = "blink";
    if (f < 166) pose = "idle";
    off = pose === "idle" ? 0 : mod(Math.floor((f - 166) / 8), 2) ? 0 : -1;
  } else { off = lerp(0, off0, ease((f - T.crabDuck) / 14)); pose = "wave_a"; eyes = "happy"; }
  return { cx, off, pose, eyes };
}
function drawCrab(c, S, D) {
  const P = POSES[S.pose], rows = P.g.length;
  const feet = topEdge(D, S.cx) + Math.round(S.off);
  const [x, y] = place(S.pose, false, S.cx, feet, 1);
  for (let r = 0; r < rows; r++)
    for (let q = 0; q < P.g[r].length; q++) {
      if (P.g[r][q] === ".") continue;
      const px = x + q, py = y + r;
      if (!inside(px, py) || py >= topEdge(D, px)) continue;                 // lo que queda detrás de los dígitos no se ve
      c.px(px, py, r < 2 ? "T" : r >= rows - 4 ? "4" : "t");
    }
  for (const [ex, ey] of eyesOf(S.pose, x, y, 1, false)) {
    const col = (px, py, k) => { if (inside(px, py) && py < topEdge(D, px)) c.px(px, py, k); };
    if (S.eyes === "blink") { col(ex, ey + 1, "c"); col(ex + 1, ey + 1, "c"); }
    else if (S.eyes === "happy") { col(ex, ey, "c"); col(ex + 1, ey, "c"); col(ex, ey + 1, "c"); col(ex + 1, ey + 1, "t"); }
    else {
      const dx = S.eyes === "left" ? -1 : S.eyes === "right" ? 1 : 0;
      for (let a = 0; a < 2; a++) for (let b = 0; b < (S.eyes === "wide" ? 3 : 2); b++) col(ex + dx + a, ey - (S.eyes === "wide" ? 1 : 0) + b, "c");
    }
  }
}

// ------------------------------------------------------------------ el planeta HOME
const PRAMP = ["N", "2", "L", "l", "e", "W"];
function planetAlpha(f) { return sm(T.planet, T.planet + 24, f) * (1 - sm(262, 288, f)); }
function drawHalo(c, f, a) {
  if (a <= 0) return;
  const R = HOME.r, Rh = 17 + 1.5 * Math.sin(TAU * Math.floor(f / 3) * 3 / 30), cx = HOME.x, cy = HOME.y;
  for (let y = cy - R - 19; y <= cy + R + 19; y++)
    for (let x = cx - R - 19; x <= cx + R + 19; x++) {
      if (!inside(x, y) || y >= CAPY - 1) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= R || d >= R + Rh) continue;
      const v = (1 - (d - R) / Rh) * a * 1.15;
      if (bay(x, y) < v) c.px(x, y, v > 0.62 ? "M" : v > 0.3 ? "m" : "N");
    }
}
function drawPlanet(c, f, a) {
  if (a <= 0) return;
  const { x: cx, y: cy, r: R } = HOME;
  for (let y = cy - R; y <= cy + R; y++)
    for (let x = cx - R; x <= cx + R; x++) {
      const nx = (x - cx) / R, ny = (y - cy) / R, d2 = nx * nx + ny * ny;
      if (d2 > 1 || bay(x, y) >= a) continue;
      const nz = Math.sqrt(1 - d2), l = clamp(nx * -0.5 + ny * -0.55 + nz * 0.65, 0, 1);
      const t = Math.max(0, l * 4.6 + 0.2 - (1 - a) * 3), i = Math.floor(t);   // al encenderse o apagarse, también baja el tono
      c.px(x, y, PRAMP[Math.min(5, i + (t - i > bay(x, y) ? 1 : 0))]);
    }
  if (a >= 0.8) {                                                // un templo dórico con la puerta encendida
    const lamp = mod(Math.floor(f / 8), 2) ? "O" : "y";
    c.rect(cx - 8, cy + 5, 17, 1, "e"); c.rect(cx - 7, cy + 4, 15, 1, "W"); c.hline(cx - 8, cy + 6, 17, "3");   // escalones
    c.poly([cx - 7, cy - 1, cx + 7, cy - 1, cx, cy - 5], "e"); c.poly([cx - 3, cy - 1, cx + 3, cy - 1, cx, cy - 3], "l");   // frontón
    c.hline(cx - 7, cy - 1, 15, "W"); c.hline(cx - 7, cy, 15, "3");                                            // arquitrabe
    for (const dx of [-6, -4, 4, 6]) { c.vline(cx + dx, cy + 1, 3, "W"); }                                    // columnas
    c.vline(cx - 6, cy + 1, 3, "e"); c.vline(cx + 4, cy + 1, 3, "e");
    c.rect(cx - 2, cy + 1, 5, 3, "c"); c.rect(cx - 1, cy + 1, 3, 3, lamp); c.px(cx, cy + 2, "y");              // la puerta encendida
    c.vline(cx - 2, cy + 1, 3, "3"); c.vline(cx + 2, cy + 1, 3, "3");
    for (const dx of [-1, 0, 1]) c.px(cx + dx, cy + 4, "O");                                                    // la luz sobre el escalón
    c.text(cx - 7, cy + R + 4, "HOME", "O");
  }
}

// ------------------------------------------------------------------ detalles
function sparkle(c, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  if (inside(x, y)) c.px(x, y, col);
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, arm);
}
function puff(c, x, y, t, dir) {                                 // el soplido de gas al despegar
  if (t < 0 || t > 8) return;
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * 2.2 - 1.1 + (dir < 0 ? Math.PI : 0), r = 3 + t * 1.6 + (i % 2);
    const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + 2 + Math.sin(a) * r * 0.55);
    if (inside(px, py)) c.px(px, py, t < 3 ? "e" : t < 6 ? "L" : "2");
  }
}
const DROP = PROPS.sweat;

function caption(c, f) {
  c.rect(4, CAPY, 152, 11, "c");
  c.box(4, CAPY, 152, 11, f >= 176 && f < 180 ? "y" : "F");
  const A = "> PAGE NOT FOUND", B2 = "> GOING HOME";
  let txt = "", col = "x", right = "", rcol = "u";
  if (f >= 6 && f < 178) txt = A.slice(0, clamp(Math.floor((f - 6) / 2), 0, A.length));
  else if (f >= 178) {
    const k = f < 274 ? clamp(Math.floor((f - 178) / 2), 0, B2.length) : clamp(B2.length - (f - 274), 0, B2.length);
    txt = B2.slice(0, k); col = "j"; rcol = "j";
  }
  if (f >= 44 && f < 176) right = "ERR 404";
  else if (f >= 180 && f < 270) right = "200 OK";
  if (f >= 44 && f < 48) rcol = "y";
  if (f >= 180 && f < 184) rcol = "y";
  c.text(7, CAPY + 3, txt, col);
  const typing = (f >= 6 && f < 40) || (f >= 178 && f < 204);
  if (typing && f % 4 < 3) c.rect(7 + txt.length * 4, CAPY + 3, 3, 5, "x");   // el cursor, mientras escribe
  if (right) c.text(153 - (right.length * 4 - 1), CAPY + 3, right, rcol);
}

// ------------------------------------------------------------------ la animación
anim("lost", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const f = c.frame;
  c.rect(0, 0, W, H, "z");
  for (const [x, y, k] of NEB) c.px(x, y, k);
  drawFar(c);

  const D = digits(f), cl = clawd(f), crab = crabState(f, D);
  const B = beamState(f, cl, D, crab);
  drawBeam(c, B);

  // estrellas: casi todas fijas; unas pocas titilan y las alumbradas por el haz brillan un punto más
  for (const s of BGSTARS) {
    let lv = s.lv + (s.tw && mod(f + s.ph, s.per) < 5 ? 1 : 0);
    if (beamI(B, s.x, s.y, B.L) > 0.3) lv++;
    c.px(s.x, s.y, String(Math.min(3, lv)));
  }

  const pa = planetAlpha(f);
  drawHalo(c, f, pa);
  drawPlanet(c, f, pa);
  if (pa >= 0.8 && f >= T.planet + 24)                           // chispas del planeta
    [[-15, -9, 0], [14, -12, 1], [16, 8, 2]].forEach(([dx, dy, k]) => sparkle(c, HOME.x + dx, HOME.y + dy, [1, 2, 3, 2][mod(Math.floor((f + k * 11) / 5), 4)], "W", "l"));

  drawRocks(c, f, D, B);
  if (crab) drawCrab(c, crab, D);
  drawDigits(c, D, B);

  // Clawd: cuerpo, linterna y ojos
  drawPose(c, cl.pose, cl.x, cl.y, 2, "o");
  drawFlash(c, cl, B);
  drawEyes(c, eyesOf(cl.pose, cl.x, cl.y, 2, false), 2, cl.eyes, "k");

  // sudor, "?" y "!"
  for (const t0 of [88, 102]) {
    const t = f - t0;
    if (t >= 0 && t < 14) paintGrid(c, DROP, cl.x + 40, cl.y - 1 + two(t) * 2);
  }
  if (f >= 96 && f < 132) c.text(cl.x + 30, cl.y - 14 + [0, -1, 0, 1][mod(Math.floor(f / 4), 4)], "?", "O", { scale: 2 });
  if (f >= 194 && f < 208) c.text(cl.x + 30, cl.y - 12 + (two(f) % 2), "!", "O", { scale: 2 });

  // salto: soplido al despegar y chispas que quedan en el camino
  if (f >= T.hop0) puff(c, cl.cx - 6, SFEET, f - T.hop0 - 2, -1);
  if (f >= T.hop0 + 3 && f < T.hop1 + 12)
    for (let k = 1; k <= 4; k++) {
      const g = f - k * 5;
      if (g < T.hop0 || g >= T.hop1 + 4) continue;
      const [tx, ty] = track(Math.min(g, T.hop1 - 1));
      sparkle(c, Math.round(tx - 10 + 2 * k), Math.round(ty - 14 + 2 * k), [3, 2, 2, 1][k - 1], "y", "l");
    }
  // llega: onda tramada del planeta y chispas
  if (f >= T.hop1 && f < T.hop1 + 16) {
    const t = f - T.hop1;
    c.ellipse(HOME.x, HOME.y, 12 + t * 2, 12 + t * 2, t < 4 ? "W" : t < 9 ? "l" : "L", true);
  }
  // el cangrejo asoma: destello
  if (f >= T.crabPop && f < T.crabPop + 7 && crab) {
    const t = f - T.crabPop, bx = crab.cx, by = topEdge(D, bx) - 4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3, r = 7 + t * 1.5;
      const px = Math.round(bx + Math.cos(a) * r * 1.3), py = Math.round(by + Math.sin(a) * r * 0.8);
      if (inside(px, py)) c.px(px, py, t < 3 ? "y" : "T");
    }
  }

  caption(c, f);
})

sheet("lost_sheet", ["lost"], { pad: 0 })
