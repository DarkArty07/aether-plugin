// lanes.px.js: "Superdelegation: la cuota de otros planes". 160 x 65 px de arte, 450 cuadros a 30 fps (15 s), en bucle sin corte.
// Con la superdelegación encendida, cada tarea que no es del Lead va primero a otro plan de código que el dueño ya paga,
// mientras le quede cuota. Si falta el arnés, se acabó la cuota o no arranca, la misma llamada pasa al siguiente candidato,
// y al agente nativo de Claude si no queda ninguno.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): cuatro computadoras beige de los 90 (CRT con el nombre
// del carril) sobre una columnata de mármol; las tarjetas son disquetes de 3.5"; la tolva es un ánfora; el pozo, un canal
// de mármol entre columnas; el candado de OUT, un sello de piedra; el carril nativo, una computadora violeta con Clawd al lado.
// Fondo: nebulosa violeta con estrellas, y la greca como línea de suelo. Sin tubos, cintas ni madera.
// Leyenda de la historia (cuadros):
//   14 a 330   los disquetes caen de la ánfora por el canal de la izquierda, entran al primer carril con cuota, se procesan y gastan una muesca
//   ~100/190/270   cada carril se queda en cero: su pantalla parpadea en rojo, sale un sello OUT y el siguiente disquete se desvía por el canal
//   el tercero (CODEX) congela el mundo 3 cuadros y lo sacude; desde ahí todo cae en CLAUDE, el nativo, que no se acaba
//   luego una onda recorre los carriles, las cuotas se renuevan de arriba hacia abajo con chispa y el ciclo vuelve a empezar
include("kit.px.js")

const W = 160, H = 65, N = 450;

// Paleta propia (Catppuccin Mocha y los violetas del landing). Redefine letras del kit que este archivo usa con otro sentido.
pal({
  // espacio y nebulosa violeta
  z: "#0b0a16", 1: "#1e1b3a", 2: "#4a3a8a", n: "#241b52", N: "#35286f", m: "#4a3a8a", M: "#8466d6", v: "#cba6f7",
  // estrellas
  s: "#ffffff", S: "#b4befe",
  // mármol: luz lavanda a sombra violeta
  W: "#f3eaff", e: "#e6dcff", a: "#cba6f7", A: "#8466d6",
  // computadoras beige (flamenco y rosa té) y contorno
  R: "#f2cdcd", r: "#f5e0dc", q: "#9399b2", K: "#141225",
  // pantallas y texto
  c: "#0d0b1c", f: "#b4befe", F: "#7a78b8", 9: "#4a3a8a",
  // Clawd, éxito, alerta, rayo
  o: "#da7756", k: "#0a0a0a", y: "#ffffff", l: "#cba6f7", L: "#8466d6",
  j: "#a6e3a1", O: "#f9e2af", u: "#f38ba8", x: "#cdd6f4", X: "#9399b2",
});

// ------------------------------------------------------------------ plano
// Barra de arriba (y 1 a 10) y cuatro carriles de 12 px. El canal (x 0 a 15) baja pegado a la izquierda; la ánfora es su cabeza.
const LY = [13, 26, 39, 52], LH = 12;
const SX = 97, LX = 124, CX = 110;   // SX: computadora del final del carril; CX: Clawd, junto a la violeta; LX: nombres
const LANES = [
  { name: "AGY", k: "t", kl: "T", kd: "4", n: 4 },
  { name: "GROK", k: "b", kl: "B", kd: "5", n: 3 },
  { name: "CODEX", k: "h", kl: "H", kd: "6", n: 2 },
  { name: "CLAUDE", k: "L", kl: "l", kd: "m", n: Infinity },   // el nativo: violeta y nunca se acaba
];

// ------------------------------------------------------------------ guion (se calcula una vez)
// Cada tarjeta cae por el canal (con gravedad), se pega contra la compuerta de los carriles agotados, aterriza, se desliza y
// entra a la computadora. La cuota se gasta cuando la estación la procesa; la siguiente tarjeta sale cuando el sello ya está
// en cero, así el desvío se ve causado por el OUT.
const CAD = 22, SLIDE = 18, DRAIN = 8, GRAV = 0.45;
const TIERS = ["t", "b", "h", "b", "t", "h", "b", "t", "h", "t", "b"];
// Cuadros que tarda una tarjeta recién soltada en llegar a la compuerta de un carril (con el golpe en cada compuerta anterior).
const gateDelay = (j) => { let y = 3, v = 0, t = 0; while (y < LY[j] + 2) { v = Math.min(v + GRAV, 5.5); y += v; t++; } return t + 5 * j; };
const SIM = (() => {
  const used = [0, 0, 0, 0], cards = [], drains = [[], [], []], outAt = [0, 0, 0], proc = [[], [], [], []], hits = [];
  let s = 14;
  for (let k = 0; k < TIERS.length; k++) {
    const lane = used.findIndex((u, i) => u < LANES[i].n), target = LY[lane] + 2, path = [[2, 3]];
    let y = 3, v = 0;
    for (;;) {
      v = Math.min(v + GRAV, 5.5);
      const ny = y + v, j = [0, 1, 2].find((q) => q < lane && y < LY[q] + 2 && ny >= LY[q] + 2);
      if (j !== undefined) {                              // carril agotado: la tarjeta choca con su compuerta y sigue bajando
        y = LY[j] + 2;
        path.push([2, y]);
        hits.push({ lane: j, t: s + path.length - 1 });
        for (const dx of [1, 2, 2, 1]) path.push([2 + dx, y]);
        v = 0;
        continue;
      }
      if (ny >= target) { path.push([2, target]); break; }
      y = ny;
      path.push([2, Math.round(y)]);
    }
    const L = s + path.length - 1, p = L + 2 + SLIDE;
    used[lane]++;
    proc[lane].push(p);
    let next = s + CAD;
    if (lane < 3) {
      drains[lane].push(p + 3);
      if (used[lane] === LANES[lane].n) { outAt[lane] = p + 3 + DRAIN; next = Math.max(next, outAt[lane] + 2 - gateDelay(lane)); }
    }
    cards.push({ s, lane, tier: TIERS[k], path, L, p, target });
    s = next;
  }
  return { cards, drains, outAt, proc, hits };
})();
const R0 = Math.max(...SIM.cards.map((cd) => cd.p)) + 14;      // la ventana de cuota se renueva
const REFILL = [R0 + 24, R0 + 34, R0 + 44];                       // de arriba hacia abajo
const HS = SIM.outAt[2];                                          // el momento grande: el tercer OUT

// ------------------------------------------------------------------ utilidades propias
const dith = (x, y, a) => bay(x, y) < a;
const prof = (u) => 0.5 * ease(u) + 0.5 * clamp01(u) * clamp01(u);   // el deslizamiento arranca manso y entra con prisa
function paintFn(c, grid, x, y, fn) {
  for (let r = 0; r < grid.length; r++)
    for (let q = 0; q < grid[r].length; q++) {
      const ch = grid[r][q];
      if (ch === "." || !inside(x + q, y + r)) continue;
      const k = fn(ch, x + q, y + r);
      if (k) c.px(x + q, y + r, k);
    }
}
function sparkle(c, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  if (inside(x, y)) c.px(x, y, col);
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, arm);
}
// Halo punteado (Bayer) que se apaga hacia el borde.
function halo(c, cx, cy, rx, ry, col, k) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (!inside(x, y)) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d < 1 && bay(x, y) < (1 - d) * k) c.px(x, y, col);
    }
}
// Sacude el lienzo (todo menos la barra de arriba).
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 11; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 11; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(11, y - dy));
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}

// ------------------------------------------------------------------ estado de cada carril
// Cuota (0 a 1): baja una muesca cuando la estación procesa una tarjeta y se llena otra vez tras la onda.
function quota(i, f) {
  if (i === 3) return 1;
  if (f >= REFILL[i]) { const u = clamp01((f - REFILL[i]) / 18); return 1 - (1 - u) ** 3; }
  let used = 0;
  for (const d of SIM.drains[i]) used += ease((f - d) / DRAIN);
  return 1 - used / LANES[i].n;
}
const isOut = (i, f) => i < 3 && f >= SIM.outAt[i] && f < REFILL[i];
// Vida del carril (1 normal, 0 apagado): la pantalla se apaga con puntos Bayer al quedarse sin cuota y vuelve con la renovación.
function alive(i, f) {
  if (i === 3) return 1;
  const o = SIM.outAt[i], r = REFILL[i];
  if (f < o) return 1;
  if (f < r - 4) return 1 - ease((f - o) / 10);
  return ease((f - (r - 4)) / 8);
}
const quotaKey = (q) => (q > 0.6 ? "j" : q > 0.3 ? "O" : "u");

// ------------------------------------------------------------------ escenario (casi quieto)
// Nebulosa violeta con Bayer: fija en todo el cuadro, así no pesa en el GIF.
function nebula(c) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = 0.6 * vnoise(x, y, 26) + 0.4 * vnoise(x + 71, y + 13, 10);
      const t = clamp01((v - 0.52) / 0.28);
      if (t <= 0) continue;
      if (dith(x, y, t * 0.8)) c.px(x, y, "n");
      if (t > 0.5 && dith(x, y, (t - 0.5) * 1.2)) c.px(x, y, "N");
      if (t > 0.85 && dith(x, y, 0.5)) c.px(x, y, "m");
    }
}
// Estrellas fijas que titilan de a una (pocas, cada una cambia 4 cuadros de cada 48).
const STARS = (() => { const r = seeded(11), out = []; for (let i = 0; i < 18; i++) out.push([3 + Math.floor(r() * 154), 11 + Math.floor(r() * 50), Math.floor(r() * 48)]); return out; })();
function stars(c, f) { for (const [x, y, ph] of STARS) c.px(x, y, (f + ph) % 48 < 4 ? "s" : "S"); }
// Columnata de fondo: tres columnas dóricas tenues tras los carriles, con la línea de puntos de cada carril.
function colonnade(c) {
  for (const x of [36, 64, 88]) {
    c.rect(x - 1, 12, 5, 2, "A");
    c.rect(x, 14, 3, 46, "N");
    c.vline(x, 14, 46, "m");
    c.vline(x + 2, 14, 46, "1");
    c.rect(x - 1, 60, 5, 2, "A");
  }
  for (let i = 0; i < 3; i++) for (let x = 16; x < 158; x += 3) c.px(x, LY[i] + 11, "m");
}
// Canal de mármol entre dos columnas (x 0 a 1 y 14 a 15): por aquí caen los disquetes.
function channel(c) {
  c.rect(0, 11, 2, 51, "a"); c.vline(0, 12, 49, "e"); c.vline(1, 12, 49, "A");
  c.hline(0, 11, 2, "W"); c.hline(0, 61, 2, "A");
  c.rect(14, 11, 2, 51, "A"); c.vline(14, 12, 49, "a"); c.vline(15, 12, 49, "2");
  c.hline(14, 11, 2, "W"); c.hline(14, 61, 2, "2");
}
// Ánfora de mármol arriba a la izquierda (x 0 a 13, y 1 a 10): de su boca salen los disquetes.
function amphora(c) {
  c.hline(4, 1, 6, "W");
  c.hline(4, 2, 6, "e");
  c.rect(5, 3, 4, 2, "a");
  c.rect(2, 5, 10, 1, "a"); c.rect(1, 6, 12, 1, "a"); c.rect(2, 7, 10, 1, "a"); c.rect(4, 8, 6, 1, "a");
  c.rect(4, 9, 6, 1, "A"); c.rect(3, 10, 8, 1, "2");
  for (const [y, xr] of [[5, 11], [6, 12], [7, 11], [8, 9]]) c.rect(8, y, xr - 7, 1, "A");   // sombra a la derecha
  c.vline(3, 5, 3, "W");                                                                       // luz a la izquierda
  for (const [x, y] of [[1, 4], [0, 5], [0, 6], [1, 7], [12, 4], [13, 5], [13, 6], [12, 7]]) c.px(x, y, "A");   // asas
}
// Greca de suelo: tres filas de meandro bajo todos los carriles (filas 62 a 64).
const GREC = ["aaaaaaa.", "a.....a.", "a.aaa.a."];
function greca(c) {
  for (let x0 = 0; x0 < W; x0 += 8)
    for (let r = 0; r < 3; r++)
      for (let q = 0; q < 8; q++) {
        const x = x0 + q;
        if (GREC[r][q] === "a" && x < W) c.px(x, 62 + r, r === 2 ? "A" : "a");
      }
}

// ------------------------------------------------------------------ carriles (solo el nativo respira)
function lanes(c, f) {
  const y0 = LY[3], act = f >= SIM.outAt[2] && f < REFILL[0] - 4;
  if (!act) return;
  const k = 0.08 + 0.1 * (0.5 + 0.5 * Math.sin((f - HS) / 5)), fade = ease((f - HS) / 10) * (1 - ease((f - R0 - 10) / 12));
  for (let y = y0 + 1; y < y0 + LH; y++) for (let x = 16; x < 159; x++) if (dith(x, y, k * fade) && c.is(x, y, "z1nNm")) c.px(x, y, "M");
}

// ------------------------------------------------------------------ disquetes (3.5")
// Disquete de frente: carcasa violeta, obturador plateado, etiqueta blanca con la franja del nivel de la tarea ("%").
const FLOP = [
  "KKKKKKKKKKKK",
  "K2qqqqqqqq2K",
  "K2qqqqqqqq2K",
  "K2222222222K",
  "K2WWWWWWWW2K",
  "K2%WWWWWWW2K",
  "K2%WWWWWWW2K",
  "KKKKKKKKKKKK",
];
// Disquete aplastado al aterrizar.
const FLOP_SQ = [
  "KKKKKKKKKKKKKK",
  "K2qqqqqqqqqq2K",
  "K2WWWWWWWWWW2K",
  "K2%WWWWWWWWW2K",
  "KKKKKKKKKKKKKK",
];
const dust = (c, cd, f) => {                             // polvo al aterrizar: solo lo que dejan sus pies
  const t = f - cd.L;
  if (t < 0 || t > 6) return;
  [[-0.7, -0.5], [0.8, -0.7], [1.6, -0.3], [-1.3, -0.2]].forEach(([vx, vy], k) => {
    const x = Math.round(8 + vx * t * 1.3), y = Math.round(cd.target + 8 + vy * t + 0.18 * t * t);
    if (inside(x, y)) c.px(x, y, t < 3 ? "W" : t < 5 ? "e" : "a");
  });
};
function cards(c, f) {
  SIM.cards.forEach((cd, k) => {
    const map = { "%": cd.tier };
    // 1) esperando en la ánfora: aparece punteado, tiembla y se hunde un píxel antes de soltarse
    let hop = false, prog = 1, hy = 2;
    if (k === 0) { if (f < cd.s) hop = true; else if (f >= 432) { hop = true; prog = (f - 432) / 8; } }
    else if (f >= cd.s - 12 && f < cd.s) { hop = true; prog = (f - (cd.s - 12)) / 8; }
    if (hop) {
      if (f >= cd.s - 8 && f < cd.s - 1) hy = 2 - (two(f) % 2);
      else if (f === cd.s - 1) hy = 3;
      paintFn(c, FLOP, 2, hy, (ch, x, y) => (dith(x, y, Math.min(1, prog)) ? (map[ch] ?? ch) : null));
    }
    const t = f - cd.s, len = cd.path.length;
    // 2) cae por el canal
    if (t >= 0 && t < len - 1) {
      const [x, y] = cd.path[t], v = t > 0 ? y - cd.path[t - 1][1] : 0;
      if (v >= 3 && x === 2) { c.vline(x + 3, Math.round(y) - v, v, "1"); c.vline(x + 8, Math.round(y) - v + 1, v - 1, "1"); }   // líneas de caída
      paintGrid(c, FLOP, x, Math.round(y), map);
    }
    dust(c, cd, f);
    // 3) aterriza aplastado y se desliza por el carril
    if (f >= cd.L && f < cd.L + 2) paintGrid(c, FLOP_SQ, 1, cd.target + 2, map);
    const t2 = f - (cd.L + 2);
    if (t2 >= 0 && t2 <= SLIDE) {
      const u = t2 / SLIDE, x = 2 + Math.round(95 * prof(u)), v = (prof(u + 0.04) - prof(u - 0.04)) * 95 / (0.08 * SLIDE);
      const sl = Math.round(v * 1.4);
      if (t2 > 2 && sl >= 2) { c.hline(x - sl, cd.target + 2, sl, "9"); c.hline(x - sl, cd.target + 5, sl, "9"); }
      paintGrid(c, FLOP, x, cd.target, map);
    }
  });
}

// ------------------------------------------------------------------ computadoras (CRT beige, o violeta el nativo)
// Monitor de 12 x 9 con pantalla de 8 x 5 en (x+2, y+2) y cuello de 4 px. El cuerpo sale de la fila y.
function monitor(c, x, y, body, hi, sh) {
  c.rect(x, y, 12, 9, body);
  c.box(x, y, 12, 9, "K");
  c.hline(x + 1, y + 1, 10, hi);
  c.hline(x + 1, y + 7, 10, sh);
  c.rect(x + 4, y + 9, 4, 1, sh);
  c.rect(x + 2, y + 2, 8, 5, "c");
}
function station(c, i, f) {
  const L = LANES[i], x = SX, y = LY[i], a = alive(i, f), bx = x + 3, by = y + 3, BW = 6, n = L.n, violet = i === 3;
  const pt = SIM.proc[i].find((p) => f >= p - 8 && f < p + 16), t = pt === undefined ? -99 : f - pt;
  const boot = f - (REFILL[i] + 4), flash = (t >= 0 && t < 3) || (boot >= 0 && boot < 3);
  if (t >= 0 && t < 5) halo(c, x + 6, y + 4, 8 + t * 2, 5 + t, L.k, 0.95 - 0.16 * t);
  if (boot >= 0 && boot < 6) halo(c, x + 6, y + 4, 8 + boot * 2, 5 + boot, L.kl, 0.9 - 0.14 * boot);
  const hi = flash ? L.kl : violet ? "v" : "r";
  if (violet) monitor(c, x, y, "M", hi, "2");
  else monitor(c, x, y, "R", hi, "q");
  // la pantalla muestra la cuota: 6 px de barra, con una muesca por tarjeta
  if (violet) {                                          // el nativo: barra llena que nunca se vacía, con un brillo que pasa
    c.rect(bx, by, BW, 3, "M");
    const gx = bx + Math.round(((f % 45) / 45) * (BW + 4)) - 2;
    if (gx >= bx && gx < bx + BW) c.vline(gx, by, 3, "v");
  } else if (a < 0.5) {                                  // apagado: la pantalla parpadea en rojo
    if (two(f) % 2 === 0) c.rect(bx, by, BW, 3, "u");
  } else {
    const q = quota(i, f), w = Math.round(BW * q);
    if (w > 0) c.rect(bx, by, w, 3, quotaKey(q));
    for (let k = 1; k < n; k++) c.vline(bx + Math.round((BW * k) / n), by, 3, "c");
    // la muesca que se va se consume en amarillo
    SIM.drains[i].forEach((d, k) => {
      const t2 = f - d;
      if (t2 < 0 || t2 > DRAIN + 3) return;
      const xOld = Math.round((BW * (n - k)) / n), xNew = xOld - Math.round((BW / n) * ease(t2 / DRAIN));
      for (let px = xNew; px < xOld; px++)
        for (let py = by; py < by + 3; py++) if (dith(bx + px, py, 1 - t2 / (DRAIN + 4))) c.px(bx + px, py, "y");
    });
    // renovación: chispa en la punta de lo que se llena
    const r = f - REFILL[i];
    if (r >= 0 && r < 18) c.vline(bx + Math.max(0, w - 1), by, 3, "y");
  }
  c.px(x + 9, y + 9, violet ? (f % 30 < 18 ? "l" : "L") : (f % 30 < 18 ? "j" : "q"));   // luz de encendido
  if (t >= 1 && t < 6) sparkle(c, x + 11, y, [1, 2, 3, 2, 1][t - 1]);
}

// El Clawd diminuto (12 x 8): recibe lo que nadie más pudo recibir, al lado de la computadora violeta.
const CL = {
  idle: ["..oooooooo..", "..oooooooo..", "oooooooooooo", "oooooooooooo", "..oooooooo..", "..oooooooo..", "..o.o..o.o..", "..o.o..o.o.."],
  up: ["oo.oooooo.oo", "oo.oooooo.oo", "..oooooooooo".slice(0, 12), "..oooooooo..", "..oooooooo..", "..oooooooo..", "..o.o..o.o..", "..o.o..o.o.."],
};
CL.up[2] = "..oooooooo..";
function clawd(c, f) {
  const y = LY[3] + 2, p = SIM.proc[3].find((q) => f >= q - 6 && f < q + 16), t = p === undefined ? -99 : f - p;
  let g = CL.idle, dy = 0, happy = false;
  if (t >= 0 && t < 14) {
    g = t < 2 ? CL.idle : CL.up;
    happy = true;
    dy = t >= 2 && t < 6 ? -1 : 0;                        // salto corto de alegría
    if (t < 2) dy = 0;
  }
  const blink = !happy && f % 90 < 4, look = t >= -6 && t < 0;
  const yy = y + dy;
  paintFn(c, g, CX, yy, () => "o");
  const ex = look ? 1 : 0;
  if (happy) { c.px(CX + 3, yy + 2, "k"); c.px(CX + 8, yy + 2, "k"); c.px(CX + 3, yy + 1, "o"); c.px(CX + 8, yy + 1, "o"); }
  else if (blink) { c.px(CX + 3 + ex, yy + 2, "k"); c.px(CX + 8 + ex, yy + 2, "k"); }
  else { c.rect(CX + 3 + ex, yy + 1, 1, 2, "k"); c.rect(CX + 8 + ex, yy + 1, 1, 2, "k"); }
  if (t >= 1 && t < 6) sparkle(c, CX + 12, yy - 1, [1, 2, 3, 2, 1][t - 1], "y", "l");
}

// Compuerta de cada carril: bloque de mármol con luz de disponible; roja cuando se cierra.
function gates(c, f) {
  LANES.forEach((L, i) => {
    const y = LY[i] + 1, out = isOut(i, f) || (f >= SIM.outAt[i] && f < SIM.outAt[i] + 2);
    const hit = SIM.hits.some((h) => h.lane === i && f - h.t >= 0 && f - h.t < 5);
    const key = hit ? (two(f) % 2 ? "y" : "u") : out || alive(i, f) < 0.5 ? "u" : "e";
    c.rect(14, y, 2, 9, key);
    if (key === "e" && f % 30 < 18) c.px(15, y + 3, i === 3 ? "l" : "j");
  });
}

// Sello de piedra OUT: aparece en la tabla del carril cuando se queda sin cuota (el de la derecha, sobre el nombre).
function seal(c, i, f) {
  const o = f - SIM.outAt[i], gone = f - REFILL[i], out = isOut(i, f), born = o - 3;
  if (!(out || (gone >= 0 && gone < 5))) return;
  if (!(born >= 0 || gone >= 0)) return;
  const x0 = 146, y0 = LY[i] + 2, keep = (x, y) => (gone < 0 ? true : dith(x, y, 1 - gone / 5));
  const on = out && o < 14 && two(o) % 2 === 0;
  for (let y = y0; y < y0 + 7; y++)
    for (let x = x0; x < x0 + 12; x++) {
      if (!keep(x, y)) continue;
      const edge = x === x0 || x === x0 + 11 || y === y0 || y === y0 + 6;
      c.px(x, y, edge ? (on ? "y" : "a") : "2");
    }
  const shown = gone >= 0 ? 3 : Math.min(3, Math.floor((born - 1) / 2) + 1);
  if (shown > 0) c.text(x0 + 1, y0 + 1, "OUT".slice(0, shown), on ? "y" : "u");
}

// ------------------------------------------------------------------ onda de renovación
function pulse(c, f) {
  const t = f - R0;
  if (t < 0 || t > 32) return;
  const u = clamp01(t / 26), front = 16 + Math.round(143 * ease(u));
  if (t > 28) return;
  for (let x = Math.max(16, front - 16); x <= front; x++) {
    const d = front - x, k = (1 - d / 16) * 0.95;
    for (let y = 12; y < 62; y++) {
      if (d === 0) { c.px(x, y, "y"); continue; }
      if (d === 1) { c.px(x, y, "l"); continue; }
      if (dith(x, y, k) && c.is(x, y, "z1nNm")) c.px(x, y, d < 6 ? "a" : "A");
    }
  }
}

// ------------------------------------------------------------------ barra de arriba
function hudLeft(f) {
  for (let i = 0; i < 2; i++) { const o = SIM.outAt[i]; if (f >= o && f < o + 46) return [`> ${LANES[i].name} OUT, NEXT ${LANES[i + 1].name}`, "O", o]; }
  if (f >= SIM.outAt[2] && f < R0) return ["> FALLBACK TO CLAUDE", "l", SIM.outAt[2]];
  if (f >= R0 && f < REFILL[2] + 26) return ["> QUOTA RESET", "j", R0];
  if (f >= REFILL[2] + 26 && f < REFILL[2] + 40) return ["> SUPERDELEGATION", "x", REFILL[2] + 26];
  return ["> SUPERDELEGATION", "x", -999];
}
function hud(c, f) {
  const flash = f >= R0 && f < R0 + 3;
  c.rect(16, 1, 143, 10, flash ? "l" : "c");
  c.box(16, 1, 143, 10, "F");
  const [text, col, start] = hudLeft(f), shown = Math.min(text.length, Math.floor((f - start) * 1.5) + 1);
  c.text(19, 4, text.slice(0, shown), flash ? "c" : col);
  if (shown < text.length && two(f) % 2) c.rect(19 + shown * 4, 4, 3, 5, "x");
  const left = [0, 1, 2].filter((i) => f < SIM.outAt[i] || f >= REFILL[i]).length;
  const changed = [...SIM.outAt, ...REFILL].some((ch) => f >= ch && f < ch + 6);
  const right = `${left} LANE${left === 1 ? "" : "S"}`;
  c.text(155 - right.length * 4, 4, right, changed ? "y" : left === 0 ? "u" : "X");
}

// ------------------------------------------------------------------ la animación
anim("lanes", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HS && f < HS + 4) f = HS;                      // hit-stop: el mundo se congela en el tercer OUT

  c.rect(0, 0, W, H, "z");
  nebula(c);
  stars(c, f);
  colonnade(c);
  channel(c);
  amphora(c);
  gates(c, f);
  lanes(c, f);
  cards(c, f);
  for (let i = 0; i < 4; i++) station(c, i, f);
  LANES.forEach((L, i) => c.text(LX, LY[i] + 4, L.name, alive(i, f) > 0.5 ? L.kl : "0"));   // nombres de los carriles
  clawd(c, f);
  for (let i = 0; i < 3; i++) seal(c, i, f);
  greca(c);
  if (real >= HS && real < HS + 4) {                     // el golpe: el carril se enciende en rojo
    const y0 = LY[2];
    for (let y = y0; y < y0 + LH; y++) for (let x = 16; x < 159; x++) if (dith(x, y, real < HS + 2 ? 0.6 : 0.3) && c.is(x, y, "z1nNm")) c.px(x, y, "u");
  }
  const rt = real - HS;                                  // onda de choque desde la pantalla que se acaba de apagar
  if (rt >= 0 && rt < 12) c.ellipse(SX + 6, LY[2] + 4, 6 + rt * 3, 3 + Math.round(rt * 1.3), rt < 4 ? "y" : rt < 8 ? "u" : "n", true);
  pulse(c, f);
  hud(c, f);
  const sh = real - (HS + 4);
  if (sh >= 0 && sh < 10) shake(c, [2, -2, 2, -1, 1, -1, 1, 0, -1, 0][sh], [1, -1, 0, 1, -1, 0, 1, 0, 0, 0][sh]);
  for (const i of [0, 1]) {                              // los dos primeros OUT solo tiemblan un poco
    const t = real - SIM.outAt[i];
    if (t >= 0 && t < 4) shake(c, [1, -1, 1, 0][t], [0, 1, -1, 0][t]);
  }
})

sheet("lanes_sheet", ["lanes"], { pad: 0 })
