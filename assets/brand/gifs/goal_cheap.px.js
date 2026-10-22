// goal_cheap.px.js: meta A, «Asequible» (AFFORDABLE). 160 x 105 px, 360 cuadros a 30 fps (12 s), bucle sin corte.
// Cada rol corre con el modelo y el esfuerzo más baratos que lo hacen bien. Una cornisa de mármol con tres gemas
// (HAIKU verde, SONNET azul, OPUS rosa) sobre pedestales con su placa de precio, un dial de esfuerzo (LOW, MED, HIGH)
// y cinco roles pequeños en fila, cada uno sobre su plinto (LEAD, WRITER, JUDGE, EXAMINER, SWARM). Cada rol salta a
// la cornisa en su turno y toma SIEMPRE la gema más barata; la compuerta QUALITY, un arco de piedra con clave, la
// barre: un visto bueno la deja (las monedas vuelan al ánfora), una cruz lo manda un nivel más arriba (un saltito,
// un «HMM») y vuelve a probar. Casi todos se quedan con una barata; solo el Judge necesita OPUS y se lo ha ganado.
// El ánfora de la derecha se llena de monedas con cada compra y termina muy por debajo de la barra fantasma
// «ALL OPUS». El golpe grande (hit-stop, negativo, sacudida, una vez) es el sello de cera con corona de laurel que
// fija el ahorro. Luego las gemas se reponen y todo vuelve al estado del cuadro 0.
// Mismo lenguaje que aether.px.js: los personajes van "en dos" (un dibujo cada 2 cuadros), las trayectorias,
// monedas, chispas y medidores se mueven en cada cuadro; paleta del kit; dither Bayer; texto solo con c.text.
// Cielo: nebulosa violeta con estrellas, quieto (solo titilan cuatro estrellas, con periodo 60 que divide 360):
// el movimiento se gasta en la acción.
include("kit.px.js")

const W = 160, H = 105, N = 360;
pal({ q: "#4a1d33", d: "#fab387" });             // q: rojo oscuro (fallo, cera); d: durazno (borde de las monedas)
// Mármol (del violeta claro al oscuro), las mismas letras que equipo.px.js.
pal({ "&": "#f3eaff", "%": "#e6dcff", "^": "#cba6f7", "*": "#8466d6", "+": "#4a3a8a" });

// ------------------------------------------------------------------ datos
const FLOOR = 82, CNT = 58;                      // pies de los roles sobre su plinto y sobre la cornisa
// Niveles: gema, precio (unidades de costo), monedas que vuelan, esfuerzo del dial y posición en la cornisa.
const LV = [
  { name: "HAIKU", price: 1, coins: 1, col: "t", lt: "T", dk: "4", eff: "LOW", cx: 19, tag: "$" },
  { name: "SONNET", price: 3, coins: 2, col: "b", lt: "B", dk: "5", eff: "MED", cx: 50, tag: "$$" },
  { name: "OPUS", price: 9, coins: 4, col: "h", lt: "H", dk: "6", eff: "HIGH", cx: 81, tag: "$$$" },
];
const ALL_OPUS = 45;                             // lo que costarían cinco roles en OPUS
// Roles: casa, color, accesorio y recorrido (nivel, ¿pasa la compuerta?). Las etiquetas van en una sola fila, sin tocarse.
const ROLES = [
  { id: "lead", label: "LEAD", hx: 10, col: "o", acc: null, path: [[0, true]] },
  { id: "writer", label: "WRITER", hx: 32, col: "7", acc: "glasses", path: [[0, false], [1, true]] },
  { id: "judge", label: "JUDGE", hx: 56, col: "v", acc: "wig", path: [[0, false], [1, false], [2, true]] },
  { id: "exam", label: "EXAMINER", hx: 84, col: "p", acc: "visor", path: [[0, true]] },
  { id: "swarm", label: "SWARM", hx: 112, col: "t", acc: null, path: [[0, true]] },
];
const MIX = [["t", "T"], ["b", "B"], ["h", "H"]];  // el enjambre sin asignar: un cangrejo de cada nivel

// Duraciones (cuadros) de cada fase.
const D = { START: 10, LEAP: 14, TAKE: 5, SW: 7, SWO: 10, RES: 4, FAILB: 8, HOP: 9, COIN: 11, BACK: 13, GAP: 3 };
const HOVY = 45;                                 // altura de la gema en manos del rol (centro)
const GEMY = 24;                                 // altura de la gema sobre su pedestal (centro)

// ------------------------------------------------------------------ guion: se calcula de una vez
const chipPos = (l) => [LV[l].cx, CNT];
const TL = (() => {
  const roles = ROLES.map(() => []), tokens = [], buys = [], gates = [], keys = [[0, 0]], marks = [];
  let t = D.START, cum = 0;
  ROLES.forEach((R, ri) => {
    const B = roles[ri], home = [R.hx, FLOOR];
    B.push({ a: t, b: t + D.LEAP, k: "leap", from: home, to: chipPos(R.path[0][0]), lvl: R.path[0][0] });
    keys.push([t + 7, R.path[0][0]]);
    t += D.LEAP;
    R.path.forEach(([lvl, ok], i) => {
      const sw = lvl === 2 ? D.SWO : D.SW;
      const take = t, scanA = take + D.TAKE, resA = scanA + sw, resB = resA + D.RES;
      B.push({ a: take, b: scanA, k: "take", lvl });
      B.push({ a: scanA, b: resA, k: "scan", lvl });
      B.push({ a: resA, b: resB, k: ok ? "pass" : "fail", lvl });
      marks.push({ ri, lvl, ok, take, scanA, resA, resB });
      if (ok) {
        const n = LV[lvl].coins;
        buys.push({ ri, lvl, a: resB, n, price: LV[lvl].price, land: resB + D.COIN + 2 * (n - 1), cum0: cum });
        cum += LV[lvl].price;
        gates.push({ lvl, ri, a: scanA, b: resA, r: resB + 3, ok: true });
        tokens.push({ ri, lvl, a: take, b: null, end: resB });
        B.push({ a: resB, b: resB + D.BACK, k: "back", from: chipPos(lvl), to: home, lvl });
        keys.push([resB + 5, 0]);
        t = resB + D.GAP;
      } else {
        const nxt = R.path[i + 1][0];
        gates.push({ lvl, ri, a: scanA, b: resA, r: resB + D.FAILB, ok: false });
        tokens.push({ ri, lvl, a: take, b: resB + 5, end: resB + 5 });
        B.push({ a: resB, b: resB + D.FAILB, k: "failbeat", lvl, nxt });
        B.push({ a: resB + D.FAILB, b: resB + D.FAILB + D.HOP, k: "hop", from: chipPos(lvl), to: chipPos(nxt), lvl: nxt });
        keys.push([resB + D.FAILB + 3, nxt]);
        t = resB + D.FAILB + D.HOP;
      }
    });
  });
  return { roles, tokens, buys, gates, keys, marks };
})();
const lastBuy = TL.buys[TL.buys.length - 1];
const SWARM_END = TL.roles[4][TL.roles[4].length - 1].b + 4;
const HIT = Math.max(lastBuy.land + 2, SWARM_END), HOLD = 4, NEG = 2;
const RS = HIT + 34;                             // empieza la reposición
//console.log("HIT", HIT, "RS", RS, "buys", JSON.stringify(TL.buys.map(b=>[b.ri,b.a,b.land])), "marks", JSON.stringify(TL.marks.map(m=>[m.ri,m.take,m.resA,m.resB])));
const TOTAL = TL.buys.reduce((a, b) => a + b.price, 0);
const SAVED = Math.round((1 - TOTAL / ALL_OPUS) * 100);
const DONE = TL.buys.map((b) => b.a);            // por rol: cuando su elección queda aprobada (índice = rol, un solo cierre)
const doneAt = (ri) => TL.buys.find((b) => b.ri === ri).a;

const win = (f, a, b) => f >= a && f < b;
const prog = (f, a, b) => clamp01((f - a) / (b - a));
const gw = (ch) => ({ ".": 1, ":": 1, "!": 1, "'": 1, ",": 2, ";": 2, "(": 2, ")": 2 }[ch] ?? 3);
const adv = (s) => [...s].reduce((a, ch) => a + gw(ch) + 1, 0);
const tw = (s) => adv(s) - 1;

// ------------------------------------------------------------------ utilidades de dibujo
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
function wave(c, x, y, t, life, r1, cols, flat = 0.5) {
  if (t < 0 || t > life) return;
  const r = Math.round(2 + (r1 - 2) * ease(t / life) ** 0.7);
  c.ellipse(x, y, r, Math.max(1, Math.round(r * flat)), t < life * 0.25 ? cols[0] : t < life * 0.6 ? cols[1] : cols[2], true);
}
// La sacudida mueve todo menos el cielo: la nebulosa tramada se queda quieta (el GIF no engorda) y lo demás tiembla.
let SKY = null;
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 14; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 14; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - dx, sy = y - dy;
      let col = SKY[y * W + x];
      if (sx >= 0 && sx < W && sy >= 14 && sy < H && buf[sy * W + sx] !== SKY[sy * W + sx]) col = buf[sy * W + sx];
      c.px(x, y, "#" + (col >>> 0).toString(16).padStart(8, "0"));
    }
}
const COIN = [".O.", "OyO", ".O."];
const CROSS = ["u...u", ".u.u.", "..u..", ".u.u.", "u...u"];   // la cruz del RETRY

// ------------------------------------------------------------------ personajes pequeños (media celda, 12 x 8)
// Un rol: el cuerpo de la pose a un píxel por carácter doble, su accesorio y los ojos.
function mini(c, pose, ax, ay, k, eyes, acc) {
  const P = POSES[pose], cols = Math.ceil(P.g[0].length / 2), rows = Math.ceil(P.g.length / 2);
  const x = Math.round(ax - P.cx / 2), y = ay - rows;
  const has = (q, r) => { const ch = P.g[r * 2]?.[q * 2]; return !!ch && ch !== "."; };
  for (let r = 0; r < rows; r++)
    for (let q = 0; q < cols; q++) if (has(q, r) && inside(x + q, y + r)) c.px(x + q, y + r, r === 0 && k[1] ? k[1] : k[0]);
  const el = P.eyes.map(([ex, ey]) => [x + (ex >> 1), y + (ey >> 1)]);
  let key = "k";
  if (acc === "glasses") {
    for (const [ex, ey] of el) { c.px(ex - 1, ey, "1"); c.px(ex + 1, ey, "1"); c.px(ex - 1, ey + 1, "1"); c.px(ex + 1, ey + 1, "1"); }
    c.hline(el[0][0] + 2, el[0][1], el[1][0] - el[0][0] - 3, "1");
  } else if (acc === "wig") {
    for (let q = 2; q <= 9; q++) if (has(q, 0)) c.px(x + q, y, "y");
    if (has(2, 1)) c.px(x + 2, y + 1, "y");
    if (has(9, 1)) c.px(x + 9, y + 1, "y");
  } else if (acc === "visor") {
    for (let q = 2; q <= 9; q++) if (has(q, 1)) c.px(x + q, el[0][1], "c");
    key = "T";
  }
  if (eyes === "blink") return;
  for (const [ex, ey] of el) {
    switch (eyes) {
      case "happy": c.px(ex, ey, key); c.px(ex + 1, ey, key); break;
      case "wide": c.px(ex, ey - 1, key); c.px(ex, ey, key); c.px(ex, ey + 1, key); break;
      case "up": c.px(ex, ey - 1, key); c.px(ex, ey, key); break;
      case "down": c.px(ex, ey + 1, key); c.px(ex, ey + 2, key); break;
      case "left": c.px(ex - 1, ey, key); c.px(ex - 1, ey + 1, key); break;
      case "right": c.px(ex + 1, ey, key); c.px(ex + 1, ey + 1, key); break;
      default: c.px(ex, ey, key); c.px(ex, ey + 1, key);
    }
  }
}

// ------------------------------------------------------------------ estado de los roles
const arcP = (from, to, u, lift) => bez(from, [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - lift], to, ease(u));
const beatAt = (ri, f) => { for (const b of TL.roles[ri]) if (f >= b.a && f < b.b) return b; return null; };
// Estado solo por el guion (sin comportamientos de reposo).
function roleRaw(ri, f) {
  const R = ROLES[ri], b = beatAt(ri, f);
  const st = { x: R.hx, y: FLOOR, pose: "idle", eyes: "sq", out: false, kind: "home", lvl: -1, sweat: false, t: 0 };
  if (!b) return st;
  const t = f - b.a, L = b.b - b.a;
  st.out = true; st.kind = b.k; st.lvl = b.lvl; st.t = t;
  switch (b.k) {
    case "leap": case "back": case "hop": {
      const sq = b.k === "hop" ? 2 : 3, lift = b.k === "hop" ? 11 : 17;
      st.eyes = "wide";
      if (t < sq) { st.pose = "squash"; [st.x, st.y] = b.from; }
      else if (t >= L - sq) { st.pose = "squash"; [st.x, st.y] = b.to; st.eyes = "sq"; }
      else {
        const u = (t - sq) / (L - 2 * sq - 1);
        [st.x, st.y] = arcP(b.from, b.to, Math.min(1, u), lift);
        st.pose = u < 0.55 ? "armsup" : "surprise";
      }
      break;
    }
    case "take": [st.x, st.y] = chipPos(b.lvl); st.pose = t < 2 ? "armsup" : "idle"; st.eyes = "up"; break;
    case "scan": [st.x, st.y] = chipPos(b.lvl); st.eyes = Math.floor(t / 3) % 2 ? "up" : "sq"; break;
    case "pass": [st.x, st.y] = chipPos(b.lvl); st.pose = "armsup"; st.eyes = "happy"; st.y -= [1, 2, 2, 1][t] ?? 0; break;
    case "fail": [st.x, st.y] = chipPos(b.lvl); st.pose = "surprise"; st.eyes = "wide"; st.x += t < 3 ? (t % 2 ? 1 : -1) : 0; break;
    case "failbeat":
      [st.x, st.y] = chipPos(b.lvl); st.pose = t < L - 2 ? "slump" : "idle"; st.eyes = t < L - 3 ? "down" : "right";
      st.sweat = t < L - 2; break;
  }
  return st;
}
const blinkAt = (f, o) => (f + o) % 120 < 3;
const bobAt = (f, o) => { const ph = (f + o) % 90; return ph >= 2 && ph < 8 ? -1 : 0; };
// Estado completo: añade el reposo (parpadeo, saltito, mirada al que está en el estante) y la fiesta final.
function roleFull(ri, f, sub = 0) {
  const R = ROLES[ri], ff = f - 2 * sub, st = roleRaw(ri, ff);
  st.dy = 0;
  if (st.out) return st;
  // fiesta tras el sello: un salto por rol, escalonado
  const ct = ff - (HIT + 6 + 3 * ri + sub);
  if (ct >= 0 && ct < 14) { st.pose = "armsup"; st.eyes = "happy"; st.dy = -Math.round(5 * Math.sin(Math.PI * ct / 14)); return st; }
  if (ct >= 14 && ff < RS + 6) { st.eyes = "happy"; return st; }
  // mira al rol que está en el estante
  for (let j = 0; j < ROLES.length; j++) {
    if (j === ri) continue;
    const o = roleRaw(j, ff);
    if (o.out && o.kind !== "back") { st.eyes = o.x < st.x - 4 ? "left" : o.x > st.x + 4 ? "right" : "up"; break; }
  }
  if (blinkAt(f, R.hx * 3 + sub * 5)) st.eyes = "blink";
  st.dy = bobAt(f, R.hx * 2);
  return st;
}
// Colores del cuerpo de un rol (el enjambre se tiñe del nivel que eligió).
function roleColors(ri, sub, f) {
  if (ri !== 4) return [ROLES[ri].col, null];
  const tint = f >= doneAt(4) && f < RS + 8;
  return tint ? [LV[0].col, LV[0].lt] : MIX[sub];
}
function drawRole(c, ri, f) {
  const R = ROLES[ri], n = ri === 4 ? 3 : 1;
  for (let sub = 0; sub < n; sub++) {
    const st = roleFull(ri, f, sub);
    const off = ri === 4 ? (sub - 1) * 10 : 0;
    const k = roleColors(ri, sub, f);
    mini(c, st.pose, st.x + off, st.y + st.dy, k, st.eyes, R.acc);
    if (st.sweat) paintGrid(c, PROPS.sweat, st.x + off - 13, st.y - 14);
  }
}

// ------------------------------------------------------------------ fondo: nebulosa, cornisa de mármol, arcada, plintos
// Nebulosa violeta con dither Bayer y estrellas: se calcula una vez. Es más oscura donde hay texto y monedas.
const NEB = (() => {
  const out = new Array(W * H).fill(null), keys = ["n", "N", "m", "M"];
  for (let y = 0; y < 89; y++)
    for (let x = 0; x < W; x++) {
      const v = 0.55 * vnoise(x + 13, y + 7, 26) + 0.3 * vnoise(x + 40, y + 90, 12) + 0.15 * vnoise(x, y, 5), b = bay(x, y);
      let lv = 0;
      if (v > 0.42 && b < (v - 0.42) * 5) lv = 1;
      if (v > 0.52 && b < (v - 0.52) * 5) lv = 2;
      if (v > 0.62 && b < (v - 0.62) * 4.5) lv = 3;
      if (v > 0.74 && b < (v - 0.74) * 4) lv = 4;
      const cap = (y < 46 && x < 100) || (x >= 124 && y >= 22) ? 2 : 3;
      lv = Math.min(lv, cap);
      if (lv) out[y * W + x] = keys[lv - 1];
    }
  return out;
})();
const STARS = (() => {
  const r = seeded(2024), out = [];
  for (let k = 0; k < 44; k++) out.push([Math.floor(r() * W), 1 + Math.floor(r() * 87), r() < 0.2 ? 2 : 1]);
  return out;
})();
const BIGSTARS = [[101, 24, 0], [123, 62, 20], [9, 51, 40], [97, 70, 10]];   // titilan cada 60 cuadros
const KEYG = ["aaaaaaa.", "a.....a.", "a.aaa.a."];   // greca (meandro), tres filas
const LDG = { x: 1, w: 97 };                          // la cornisa de las gemas

function stage(c, f, snap) {
  c.rect(0, 0, W, H, "z");
  for (let y = 0; y < 89; y++) for (let x = 0; x < W; x++) { const k = NEB[y * W + x]; if (k) c.px(x, y, k); }
  for (const [x, y, lv] of STARS) if (!NEB[y * W + x] || NEB[y * W + x] === "n") c.px(x, y, lv === 2 ? "3" : "2");
  for (const [x, y, ph] of BIGSTARS) {
    const on = (f + ph) % 60 < 5;
    c.px(x, y, "s");
    if (on) { c.px(x - 1, y, "a"); c.px(x + 1, y, "a"); c.px(x, y - 1, "a"); c.px(x, y + 1, "a"); if ((f + ph) % 60 < 3) { c.px(x - 2, y, "L"); c.px(x + 2, y, "L"); } }
    else { c.px(x - 1, y, "A"); c.px(x + 1, y, "A"); }
  }
  if (snap) { SKY = new Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) SKY[y * W + x] = c.get(x, y); }
  // el suelo del templo, oscuro, donde van las etiquetas
  c.rect(0, 89, W, 7, "1");
  c.hline(0, 89, W, "*");
  // la cornisa de las gemas: losa con greca
  c.hline(LDG.x, 37, LDG.w, "&");
  c.rect(LDG.x, 38, LDG.w, 3, "%");
  for (let x = LDG.x; x < LDG.x + LDG.w; x++) for (let r = 0; r < 3; r++) if (KEYG[r][(x - LDG.x) % 8] === "a") c.px(x, 38 + r, "*");
  c.hline(LDG.x, 41, LDG.w, "^");
  for (let x = LDG.x; x < LDG.x + LDG.w; x++) if (bay(x, 42) < 0.5) c.px(x, 42, "1");
  // pilastras de mármol que la sostienen
  for (const px0 of [1, 91]) {
    c.rect(px0, 42, 5, 2, "^"); c.hline(px0, 42, 5, "%");
    c.rect(px0 + 1, 44, 3, 12, "%"); c.vline(px0 + 1, 44, 12, "&"); c.vline(px0 + 3, 44, 12, "*");
    c.rect(px0, 56, 5, 2, "^"); c.hline(px0, 56, 5, "%");
  }
  // la cornisa donde se paran los roles: filo, y dentículos
  c.hline(1, CNT, 97, "&");
  c.hline(1, CNT + 1, 97, "^");
  for (let x = 1; x < 98; x += 4) c.px(x, CNT + 1, "*");
}

// Un plinto (el pedestal de un rol): losa, fuste con estrías y base. x0 a x0 + w - 1; arriba en FLOOR, 7 filas.
function plinthRaw(c, x0, w) {
  c.hline(x0, FLOOR, w, "&"); c.hline(x0, FLOOR + 1, w, "^");
  c.rect(x0 + 2, FLOOR + 2, w - 4, 4, "%");
  c.vline(x0 + 2, FLOOR + 2, 4, "&"); c.vline(x0 + w - 3, FLOOR + 2, 4, "*");
  for (let x = x0 + 5; x < x0 + w - 4; x += 4) c.vline(x, FLOOR + 2, 4, "^");
  c.hline(x0, FLOOR + 6, w, "*");
}
// Gema pequeña incrustada en el fuste del plinto (la que el rol se quedó), 5 x 4.
const MGEM = [".aaa.", "abbbd", ".abd.", "..d.."];
function plinths(c, f) {
  ROLES.forEach((R, ri) => {
    const w = ri === 4 ? 30 : 17;
    plinthRaw(c, R.hx - (w >> 1), w);
    const d = doneAt(ri);
    if (f < d + 2) return;
    const keep = f >= RS ? 1 - prog(f, RS, RS + 8) : 1;
    if (keep <= 0) return;
    const lv = LV[R.path[R.path.length - 1][0]];
    c.clip((px2, py2) => bay(px2, py2) < keep, () => paintGrid(c, MGEM, R.hx - 2, FLOOR + 2, { a: lv.lt, b: lv.col, d: lv.dk }));
    const t = f - (d + 2);
    if (t < 8) sparkle(c, R.hx, FLOOR + 3, [1, 2, 3, 3, 2, 2, 1, 0][t], "y", lv.lt);
  });
  plinthRaw(c, 127, 30);                         // el del ánfora
}

// ------------------------------------------------------------------ las gemas sobre sus pedestales
// Gema de 9 x 7: a = cara clara, b = cuerpo, d = sombra, y = destello.
const GEMG = ["..aaaaa..", ".aaybbbd.", "aabbbbbdd", ".abbbbbd.", "..abbbd..", "...abd...", "....d...."];
function gemAt(c, x, y, map) { paintGrid(c, GEMG, x, y, map); }
const gemMap = (L) => ({ a: L.lt, b: L.col, d: L.dk, y: "y" });
// Ficha que está en uso en la cornisa (rol parado en ella o gema en vuelo).
function litLevel(f) {
  for (let i = 0; i < 5; i++) {
    const s = roleRaw(i, f);
    if (s.out && s.kind !== "leap" && s.kind !== "back" && s.kind !== "hop") return s.lvl;
  }
  return -1;
}
const used = (lvl, f) => TL.tokens.filter((t) => t.lvl === lvl && f >= t.a && (t.b === null || f < t.b)).length;
const pipLit = (lvl, j, f) => j < 3 - used(lvl, f) || f >= RS + 3 * lvl + 3 * j;
// ¿Está la gema grande en su pedestal? Falta mientras un rol la tiene (un cuadro más tarde, la siguiente de la reserva).
function onPedestal(lvl, f) {
  for (const t of TL.tokens) if (t.lvl === lvl && f >= t.a && f < (t.b === null ? t.a + 9 : t.b)) return false;
  return true;
}
function haloDisc(c, cx, cy, r, col, dens) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.2);
      if (d > r || !inside(x, y)) continue;
      if (bay(x, y) < dens * (1 - d / (r + 1))) c.px(x, y, col);
    }
}
const PIP = [".a.", "abd", ".d."];
function cards(c, f) {
  const lit = litLevel(f);
  LV.forEach((L, i) => {
    const cx = L.cx, on = lit === i;
    if (on) haloDisc(c, cx, GEMY, 7, L.dk, 0.6);
    // el pedestal: capitel, fuste con la placa del precio y la cornisa debajo
    c.rect(cx - 8, 28, 17, 2, "%"); c.hline(cx - 8, 28, 17, "&"); c.hline(cx - 8, 29, 17, "^");
    c.rect(cx - 6, 30, 13, 7, "%"); c.vline(cx - 6, 30, 7, "&"); c.vline(cx + 6, 30, 7, "*");
    c.rect(cx - 5, 30, 11, 7, "c");                            // placa grabada: el precio
    c.box(cx - 5, 30, 11, 7, on ? L.lt : "*");
    c.text(cx - Math.floor(tw(L.tag) / 2), 31, L.tag, "O");
    c.hline(cx - 8, 36, 17, "^"); c.hline(cx - 8, 35, 1, "^");
    c.rect(cx - 8, 36, 17, 1, "^");
    // el nombre y la gema
    c.text(cx - Math.floor(tw(L.name) / 2), 15, L.name, on ? "y" : L.lt);
    if (onPedestal(i, f)) {
      const popT = TL.tokens.filter((t) => t.lvl === i && t.b === null).map((t) => f - (t.a + 9)).find((q) => q >= 0 && q < 8);
      if (popT !== undefined) sparkle(c, cx + 5, GEMY - 3, [3, 2, 2, 1, 1, 0, 0, 0][popT], "y", L.lt);
      gemAt(c, cx - 4, GEMY - 3, gemMap(L));
      if (blinkAt(f, i * 40 + 20)) c.px(cx - 2, GEMY - 2, "y");
    }
    for (let j = 0; j < 3; j++) {                              // reserva: tres gemitas a la derecha
      const lit2 = pipLit(i, j, f), px0 = cx + 9, py0 = 21 + j * 4;
      paintGrid(c, PIP, px0, py0, lit2 ? { a: L.lt, b: L.col, d: L.dk } : { a: "9", b: "9", d: "8" });
      const rp = RS + 3 * i + 3 * j, t = f - rp;               // chispa al reponer
      if (t >= 0 && t < 6) sparkle(c, px0 + 1, py0 + 1, [1, 2, 2, 1, 1, 0][t], "y", L.lt);
    }
  });
}

// ------------------------------------------------------------------ compuertas QUALITY: un arco de piedra bajo cada gema
const AR = { y: 60 };
function inArch(qx, qy) {
  if (qy < 2 || qy > 10) return false;
  if (qy === 2) return qx >= 10 && qx <= 20;
  if (qy === 3) return qx >= 6 && qx <= 24;
  if (qy === 4) return qx >= 3 && qx <= 27;
  return qx >= 1 && qx <= 29;
}
// Dovelas: hasta 3 px por fuera del hueco, solo por encima del arranque.
function vous(qx, qy) {
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && inArch(qx + dx, qy + dy)) return qy + 0 <= 6 - (qx > 3 && qx < 27 ? 0 : 1);
  return false;
}
function archBlock(c, x, y, rim, fill) {
  c.rect(x, y, 31, 12, "%");
  c.hline(x, y, 31, "&"); c.vline(x, y, 12, "&"); c.vline(x + 30, y, 12, "^"); c.hline(x, y + 11, 31, "^");
  for (let qy = 1; qy < 11; qy++)
    for (let qx = 1; qx < 30; qx++) {
      if (inArch(qx, qy)) { c.px(x + qx, y + qy, fill); continue; }
      const near = inArch(qx - 1, qy) || inArch(qx + 1, qy) || inArch(qx, qy - 1) || inArch(qx, qy + 1);
      if (near) c.px(x + qx, y + qy, rim);
      else if (qy < 6 && vous(qx, qy)) c.px(x + qx, y + qy, ((Math.floor(Math.atan2(qy - 9, qx - 15) / (Math.PI / 11)) & 1) ? "&" : "^"));   // dovelas
      else if (qy < 5 && bay(x + qx, y + qy) < 0.35) c.px(x + qx, y + qy, "^");   // sombra de las enjutas
    }
}
function gateZones(c, f) {
  LV.forEach((L, i) => {
    const x = L.cx - 15, y = AR.y;
    let g = null;
    for (const e of TL.gates) if (e.lvl === i && f >= e.a - 1 && f < e.r) g = e;
    if (!g || f < g.a) {
      archBlock(c, x, y, "*", "c");
      c.rect(x + 14, y, 3, 3, "^");
      c.text(x + 2, y + 5, "QUALITY", "F");
      return;
    }
    if (f < g.b) {                                // barrido
      const u = (f - g.a) / (g.b - g.a), sx = x + 1 + Math.round(u * 27);
      archBlock(c, x, y, "x", "c");
      for (let k = 1; k <= 4; k++) for (let yy = y + 2; yy < y + 11; yy++) if (inArch(sx - k - x, yy - y) && bay(sx - k, yy) < 0.75 - k * 0.17) c.px(sx - k, yy, "N");
      c.text(x + 2, y + 5, "QUALITY", "X");
      c.clip((px2) => px2 <= sx, () => c.text(x + 2, y + 5, "QUALITY", "y"));
      if (inArch(sx - x, 6)) c.vline(sx, y + 4, 6, "l");
      c.rect(x + 14, y, 3, 3, f % 4 < 2 ? "y" : "x");
      return;
    }
    const t = f - g.b, jit = !g.ok && t < 4 ? (t % 2 ? 1 : -1) : 0;
    const col = g.ok ? "j" : "u", bgc = g.ok ? "Q" : "q";
    archBlock(c, x, y, t < 2 ? "y" : col, bgc);
    c.rect(x + 14, y, 3, 3, t < 2 ? "y" : col);
    if (g.ok) {
      c.text(x + 3 + jit, y + 5, "PASS", col);
      paintGrid(c, PROPS.check, x + 21, y + 4, { y: "j" });
    } else {
      c.text(x + 2 + jit, y + 5, "RETRY", col);
      CROSS.forEach((row, r) => [...row].forEach((ch, q) => ch === "u" && c.px(x + 23 + q + jit, y + 5 + r, "u")));
    }
  });
}

// ------------------------------------------------------------------ dial de esfuerzo: un medallón de mármol
const DL = { cx: 109, cy: 42, r: 11 };
const needleAng = (l) => Math.PI * (1.1 + 0.4 * l);
const DK = (() => {                              // valor al comenzar cada clave (para el rebote del resorte)
  const out = [];
  let prev = 0;
  TL.keys.forEach(([t, l], i) => {
    if (i === 0) { out.push(0); prev = l; return; }
    const dt = t - TL.keys[i - 1][0];
    const start = prev + (out[i - 1] - prev) * Math.exp(-dt / 3.2) * Math.cos(dt * 0.8);
    out.push(start); prev = l;
  });
  return out;
})();
function needle(f) {
  let v = 0, tgt = 0;
  TL.keys.forEach(([t, l], i) => {
    if (f < t) return;
    const dt = f - t, from = DK[i];
    v = l + (from - l) * Math.exp(-dt / 3.2) * Math.cos(dt * 0.8); tgt = l;
  });
  return { v, tgt };
}
function dial(c, f) {
  const { cx, cy, r } = DL, { v, tgt } = needle(f);
  c.text(cx - Math.floor(tw("EFFORT") / 2), 17, "EFFORT", "x");
  for (let y = cy - r - 1; y <= cy; y++)
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 1) continue;
      if (d > r - 1) c.px(x, y, x < cx - 4 ? "&" : x > cx + 4 ? "^" : "%");     // el aro de mármol
      else c.px(x, y, "c");
    }
  c.hline(cx - r - 2, cy + 1, 2 * r + 5, "&"); c.hline(cx - r - 2, cy + 2, 2 * r + 5, "%"); c.hline(cx - r - 2, cy + 3, 2 * r + 5, "*");
  for (let a = needleAng(0); a <= needleAng(2) + 0.01; a += 0.045) {
    const k = Math.min(2, Math.floor((a - needleAng(0)) / (0.4 * Math.PI) + 0.5));
    c.px(Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 8), LV[k].col);
  }
  for (let k = 0; k < 3; k++) {                  // marcas
    const a = needleAng(k);
    c.px(Math.round(cx + Math.cos(a) * 10), Math.round(cy + Math.sin(a) * 10), LV[k].lt);
  }
  const ang = needleAng(v);
  c.line(cx, cy, Math.round(cx + Math.cos(ang) * 7), Math.round(cy + Math.sin(ang) * 7), "y");
  c.rect(cx - 1, cy - 1, 3, 3, "x");
  const busy = TL.marks.some((m) => f >= m.take - 2 && f < m.resB + 8);
  const lab = LV[Math.round(tgt)].eff;
  c.text(cx - Math.floor(tw(lab) / 2), cy + 6, lab, busy ? LV[Math.round(tgt)].lt : "X");
}

// ------------------------------------------------------------------ el ánfora de monedas y la barra fantasma
const AX = 135, AY = 30, AROWS = 52;             // eje, borde de la boca y filas del ánfora
// Semiancho por fila: boca, cuello, hombro, panza, cuerpo que se afina, tallo y pie.
const AHW = (() => {
  const kp = [[0, 5], [1, 5], [2, 4], [3, 3], [7, 3], [13, 9], [15, 10], [26, 10], [32, 8], [38, 5], [42, 4], [44, 3], [46, 3], [47, 4], [49, 5], [51, 6]];
  const out = [];
  for (let r = 0; r < AROWS; r++) {
    let k = 0;
    while (k < kp.length - 2 && r > kp[k + 1][0]) k++;
    const [r0, h0] = kp[k], [r1, h1] = kp[k + 1];
    out.push(Math.round(h0 + (h1 - h0) * (r - r0) / (r1 - r0)));
  }
  return out;
})();
const IT = 8, IB = (() => { let b = IT; for (let r = IT; r < AROWS && AHW[r] - 3 >= 1; r++) b = r; return b; })();   // el hueco: del hombro a donde el cuerpo se afina
const BOT = AY + IB, CAP = IB - IT, SC = CAP / ALL_OPUS;   // fila de abajo del hueco, filas de capacidad, filas por unidad
const GB = { x: 150, w: 7 };                    // la barra fantasma
const drain = (f) => (f >= RS + 4 ? ease((f - RS - 4) / 18) : 0);
// Capas apiladas: una por compra, de abajo hacia arriba, cada una con el color de su gema.
function stack(f) {
  let cum = 0;
  const segs = [];
  for (const b of TL.buys) {
    const v = b.price * ease((f - b.land) / 6) * (1 - drain(f));
    segs.push({ lvl: b.lvl, a: cum, b: cum + v }); cum += v;
  }
  return { segs, total: cum };
}
function amphoraBody(c) {
  for (let r = 0; r < AROWS; r++) {
    const y = AY + r, hw = AHW[r], inner = r >= IT && r <= IB ? hw - 3 : -1;
    for (let dx = -hw; dx <= hw; dx++) {
      if (Math.abs(dx) <= inner) { c.px(AX + dx, y, "c"); continue; }
      const u = (dx + hw) / (2 * hw);
      let k = u < 0.2 ? "&" : u < 0.5 ? "%" : u < 0.78 ? "^" : "*";
      if (dx === hw && hw > 3) k = "+";
      c.px(AX + dx, y, k);
    }
  }
  c.hline(AX - 3, AY, 7, "1");                                    // la boca, oscura
  for (const r of [2, 14, 28, 45]) {                              // aros del cuerpo: solo sobre la piedra
    const hw = AHW[r], inner = r >= IT && r <= IB ? hw - 3 : -1;
    for (let dx = -hw; dx <= hw; dx++) if (Math.abs(dx) > inner) c.px(AX + dx, AY + r, dx === hw ? "+" : "*");
  }
  for (const s of [-1, 1]) {                                      // las dos asas: del cuello al hombro
    const xs = (a) => AX + s * a;
    for (let a = 4; a <= 8; a++) for (const r of [4, 5]) c.px(xs(a), AY + r, s < 0 ? "%" : "^");
    for (let r = 6; r <= 11; r++) for (const a of [7, 8]) c.px(xs(a), AY + r, s < 0 ? (a === 7 ? "&" : "%") : (a === 7 ? "^" : "*"));
    c.px(xs(4), AY + 4, s < 0 ? "&" : "%");
  }
  // brillo de vidrio dentro, a la izquierda
  for (let r = IT + 3; r < IB - 2; r++) { const hw = AHW[r] - 3; if (hw >= 3 && bay(AX, r) < 0.7) c.px(AX - hw + 1, AY + r, "1"); }
}
function meter(c, f) {
  // la barra fantasma: todo en OPUS
  const top = BOT - CAP;
  for (let yy = top; yy <= BOT; yy++)
    for (let xx = GB.x; xx < GB.x + GB.w; xx++) {
      const edge = xx === GB.x || xx === GB.x + GB.w - 1 || yy === top;
      if (edge) { if ((xx + yy) % 3 !== 0) c.px(xx, yy, "6"); }
      else if (bay(xx, yy) < 0.2) c.px(xx, yy, "6");
    }
  for (let k = 1; k <= 5; k++) { const yy = BOT - Math.round(9 * k * SC); c.hline(GB.x - 2, yy, 2, "h"); }
  // el pilar de piedra bajo la barra
  c.rect(GB.x, BOT + 1, GB.w, FLOOR - BOT - 1, "%"); c.hline(GB.x, BOT + 1, GB.w, "&"); c.vline(GB.x + GB.w - 1, BOT + 1, FLOOR - BOT - 1, "*"); c.hline(GB.x, FLOOR - 1, GB.w, "^");
  amphoraBody(c);
  const { segs, total } = stack(f);
  const rows = Math.round(total * SC);
  for (let k = 0; k < rows; k++) {
    const r = IB - k, hw = AHW[r] - 3;
    if (hw < 0) continue;
    const yv = (k + 0.5) / SC;
    const s = segs.find((q) => yv >= q.a && yv < q.b) ?? segs[segs.length - 1];
    const L = LV[s.lvl];
    for (let dx = -hw; dx <= hw; dx++) {
      const p = (dx + 40 + (k & 1) * 2) % 4;
      c.px(AX + dx, BOT - k, k === rows - 1 ? (p % 2 ? "y" : L.lt) : p === 1 ? "y" : p === 3 ? "d" : "O");
    }
  }
  if (rows > 0) { const yl = BOT - rows; c.hline(GB.x + 1, yl, GB.w - 2, "O"); c.px(GB.x - 1, yl, "O"); }   // el nivel, contra la barra
  for (const b of TL.buys) {
    const t = f - b.land;
    if (t >= 0 && t < 7) sparkle(c, AX, BOT - Math.round((b.cum0 + b.price) * SC) - 1, [2, 3, 2, 2, 1, 1, 0][t], "y", LV[b.lvl].lt);
  }
}
function meterLabels(c) {
  c.text(158 - tw("ALL OPUS"), 17, "ALL OPUS", "h");
  for (let y = 24; y < GB.x - 100 + BOT - CAP - 1; y += 2) c.px(GB.x + 3, y, "6");       // del rótulo a la barra
  c.text(AX - Math.floor(tw("COST") / 2), 90, "COST", "x");
}
const spentInt = (f) => Math.ceil(TL.buys.reduce((a, b) => a + (f >= b.land ? b.price : 0), 0) * (1 - drain(f)));

// ------------------------------------------------------------------ gemas en vuelo, monedas, avisos
const hover = (cx, f) => [cx, HOVY - (Math.floor(f / 4) % 2)];
function tokenPos(tk, f) {
  const cx = LV[tk.lvl].cx, card = [cx, GEMY];
  if (f < tk.a) return null;
  if (f < tk.a + D.TAKE) return bez(card, [cx + 12, 30], hover(cx, tk.a + D.TAKE), ease((f - tk.a) / D.TAKE));
  if (tk.b !== null && f >= tk.b - 5 && f < tk.b) return bez(hover(cx, tk.b - 5), [cx - 12, 32], card, ease((f - tk.b + 5) / 5));
  if (f < tk.end) return hover(cx, f);
  return null;
}
function token(c, f) {
  for (const tk of TL.tokens) {
    const p = tokenPos(tk, f);
    if (!p) continue;
    const L = LV[tk.lvl], m = TL.marks.find((q) => q.take === tk.a);
    const res = f >= m.resA && f < m.resB;
    let map = gemMap(L);
    if (res) {
      const flash = (f - m.resA) % 2 === 0;
      if (m.ok) map = flash ? { a: "y", b: "y", d: L.lt, y: "y" } : { a: "y", b: L.lt, d: L.col, y: "y" };
      else map = flash ? { a: "u", b: "u", d: "q", y: "y" } : gemMap(L);
    }
    gemAt(c, p[0] - 4, p[1] - 3, map);
  }
}
function marksFx(c, f) {
  for (const m of TL.marks) {
    const cx = LV[m.lvl].cx, t = f - m.resA;
    if (m.ok) {
      if (t >= 0 && t < 14) {
        paintGrid(c, PROPS.check, cx + 7, 43 - Math.min(3, t >> 1), { y: "j" });
        sparkle(c, cx - 9, 46, [1, 2, 3, 2, 2, 1, 1, 0][Math.min(7, t >> 1)] ?? 0, "y", LV[m.lvl].lt);
        if (m.lvl === 2) {                       // OPUS, bien ganado: más destellos
          sparkle(c, cx - 13, 36, [0, 1, 2, 3, 2, 1, 1, 0][Math.min(7, t >> 1)], "y", "H");
          sparkle(c, cx + 14, 34, [0, 0, 1, 2, 3, 2, 1, 0][Math.min(7, t >> 1)], "y", "O");
        }
      }
    } else {
      const u = f - m.resB;
      if (t >= 0 && t < D.RES) {                 // la cruz, con onda roja
        CROSS.forEach((row, r) => [...row].forEach((ch, q) => ch === "u" && c.px(cx + 7 + q, 43 + r, "u")));
        wave(c, cx, HOVY, t, 8, 11, ["y", "u", "q"], 0.6);
      }
      if (u >= 0 && u < D.FAILB + 2) {          // «HMM»
        const bx = cx + 7, by = 39;
        c.rect(bx, by, 15, 9, "c"); c.box(bx, by, 15, 9, "x");
        c.px(bx + 2, by + 9, "x"); c.px(bx + 1, by + 10, "x");
        c.text(bx + 2, by + 2, "HMM", u < D.FAILB - 1 ? "x" : "X");
      }
    }
  }
}
function coins(c, f) {
  for (const b of TL.buys) {
    for (let k = 0; k < b.n; k++) {
      const a = b.a + 2 * k, t = f - a;
      if (t < 0 || t >= D.COIN) continue;
      const cx = LV[b.lvl].cx, u = t / D.COIN;
      let x, y;
      if (u < 0.7) [x, y] = bez([cx, HOVY], [(cx + AX) / 2, 12], [AX, AY - 4], ease(u / 0.7));
      else { x = AX; y = Math.round(lerp(AY - 4, AY + 3, ((u - 0.7) / 0.3) ** 1.5)); }
      if (u >= 0.7 && y > AY - 2) continue;      // ya cayó por la boca
      paintGrid(c, COIN, x - 1, y - 1, { y: t % 4 < 2 ? "y" : "O" });
      if (t > 1 && t % 2 === 0 && u < 0.7 && inside(x - 3, y)) c.px(x - 3, y + 1, "O");
    }
    if (f >= b.a && f < b.a + 8) sparkle(c, LV[b.lvl].cx, HOVY, [1, 2, 3, 2, 2, 1, 1, 0][f - b.a], "y", "O");
  }
}

// ------------------------------------------------------------------ etiquetas de los roles
function labels(c, f) {
  ROLES.forEach((R, ri) => {
    const s = roleRaw(ri, f), x = R.hx - Math.floor(tw(R.label) / 2), y = 90;
    const d = doneAt(ri), tinted = f >= d + 3 && f < RS + 4;
    const lv = LV[R.path[R.path.length - 1][0]];
    c.text(x, y, R.label, tinted ? lv.lt : s.out ? "y" : "X");
  });
}

// ------------------------------------------------------------------ el sello de cera con corona de laurel
const SEAL = [137, 48], SR = 12;
const ST = { x: AX, rest: 2, hold: 18, down: 39 };
function stampAt(t) {
  if (t < -10 || t > 14) return null;
  if (t < -6) return { y: Math.round(lerp(ST.rest, ST.hold, ease((t + 10) / 4))), mode: "up" };
  if (t < -3) return { y: ST.hold + (t % 2 ? 1 : 0), mode: "hold" };
  if (t < 0) return { y: Math.round(lerp(ST.hold, ST.down, ((t + 3) / 3) ** 2)), mode: "slam" };
  if (t < 4) return { y: ST.down + (t < 2 ? 1 : 0), mode: "press" };
  return { y: Math.round(lerp(ST.down, ST.rest, ease((t - 4) / 10))), mode: "back" };
}
// La corona: dos ramas de hojas desde abajo, abiertas arriba. Cada hoja son tres pixeles sobre una rama oscura.
function laurel(c, cx, cy, rl, hot, count) {
  for (const s of [1, -1]) {
    for (let a = 0.3; a < 0.45 + (count - 1) * 0.34; a += 0.07) {      // la rama
      const phi = Math.PI / 2 + s * a;
      c.px(Math.round(cx + Math.cos(phi) * rl), Math.round(cy + Math.sin(phi) * rl), hot ? "y" : "4");
    }
    for (let i = 0; i < count; i++) {
      const phi = Math.PI / 2 + s * (0.45 + i * 0.34);
      const nx = Math.cos(phi), ny = Math.sin(phi), tx = -s * ny, ty = s * nx;     // normal hacia fuera y sentido de la rama
      const at = (o, p) => [Math.round(cx + nx * (rl + o) + tx * p), Math.round(cy + ny * (rl + o) + ty * p)];
      const out = i % 2 === 0;
      const pts = out ? [at(1, 0.4), at(1.8, 1.5), at(0.6, 1.4)] : [at(-1, 0.4), at(-1.8, 1.5), at(-0.6, 1.4)];
      c.px(pts[0][0], pts[0][1], hot ? "y" : "j");
      c.px(pts[1][0], pts[1][1], hot ? "y" : "T");
      c.px(pts[2][0], pts[2][1], hot ? "y" : "j");
    }
  }
  c.rect(cx - 2, cy + rl + 1, 5, 2, hot ? "y" : "u"); c.px(cx, cy + rl + 1, hot ? "y" : "q");   // el moño
  c.px(cx - 3, cy + rl + 3, hot ? "y" : "u"); c.px(cx + 3, cy + rl + 3, hot ? "y" : "u");
}
function imprint(c, f, t) {
  const keep = f >= RS ? 1 - prog(f, RS, RS + 10) : 1;
  if (keep <= 0) return;
  const hot = t < 2, [cx, cy] = SEAL, r = SR + (t < 1 ? 3 : t < 2 ? 2 : t < 4 ? 1 : 0);
  c.clip((px2, py2) => bay(px2, py2) < keep, () => {
    c.circ(cx + 1, cy + 1, r, "q");
    c.circ(cx, cy, r, hot ? "y" : "u");
    if (!hot) { c.px(cx - r + 2, cy - 3, "V"); c.px(cx - r + 3, cy - 5, "V"); c.px(cx - r + 1, cy - 1, "V"); }
    if (t >= 1) laurel(c, cx, cy, SR + 3, hot, 9);
    const col = hot ? "u" : "q", pct = "-" + SAVED + "%";
    c.text(cx - Math.floor(tw("SAVED") / 2), cy - 6, "SAVED", col);
    c.text(cx - Math.floor(tw(pct) / 2), cy + 1, pct, hot ? "u" : "q");
  });
}
// El sello (la matriz) cuelga de la barra: pomo de mármol, cuello y cara; baja, golpea y vuelve.
function stampMachine(c, f) {
  const s = stampAt(f - HIT);
  if (!s) return;
  const x = ST.x, y = s.y;
  c.rect(x - 1, 13, 3, Math.max(0, y - 13), "F"); c.vline(x - 1, 13, Math.max(0, y - 13), "f");
  c.rect(x - 2, y, 5, 1, "&");
  c.rect(x - 3, y + 1, 7, 1, "%"); c.rect(x - 4, y + 2, 9, 3, "%"); c.vline(x - 4, y + 2, 3, "&"); c.vline(x + 4, y + 2, 3, "^");
  c.rect(x - 3, y + 5, 7, 1, "^"); c.rect(x - 2, y + 6, 5, 1, "*");
  c.rect(x - 1, y + 7, 3, 3, "^"); c.vline(x + 1, y + 7, 3, "*");
  c.rect(x - 7, y + 10, 15, 3, "%"); c.hline(x - 7, y + 10, 15, "&"); c.hline(x - 7, y + 11, 15, "^"); c.hline(x - 7, y + 12, 15, "*");
}

// ------------------------------------------------------------------ barra y subtítulo
function hudMid(f) {
  for (let ri = 0; ri < 5; ri++) {
    const b = beatAt(ri, f);
    if (b && f < doneAt(ri) + D.BACK + 1) {
      const lv = LV[b.lvl];
      return [ROLES[ri].label + " > " + lv.name, lv.lt];
    }
  }
  if (f >= doneAt(4) + D.BACK + 1 && f < HIT + 2) return ["ALL SET", "j"];
  if (f >= HIT + 2 && f < RS) return ["SAVED " + SAVED + "%", "j"];
  if (f >= RS && f < RS + 18) return ["RESTOCKED", "x"];
  return ["SHELF READY", "X"];
}
function hud(c, f) {
  const flash = f >= HIT && f < HIT + 4;
  c.rect(4, 3, 152, 11, flash ? "l" : "c");
  c.box(4, 3, 152, 11, "F");
  c.text(7, 6, "> AFFORDABLE", flash ? "c" : "w");
  const [txt, col] = hudMid(f);
  c.text(96 - Math.floor(tw(txt) / 2), 6, txt, flash ? "c" : col);
  const n = spentInt(f), s = "$ " + n;
  const bump = TL.buys.some((b) => f >= b.land && f < b.land + 4);
  c.text(153 - tw(s), 6, s, flash ? "c" : bump ? "y" : "O");
}
const CAPS = (() => {
  const m = TL.marks, e = [[0, "EVERY ROLE TRIES THE CHEAPEST FIRST", "x"]];
  e.push([m[0].take, "LEAD GRABS THE CHEAPEST CHIP", "x"]);
  e.push([m[0].resA, "QUALITY OK: THE COINS STAY", "j"]);
  e.push([m[1].take, "WRITER TRIES HAIKU FIRST", "x"]);
  e.push([m[1].resA, "TOO WEAK: STEP UP ONE LEVEL", "O"]);
  e.push([m[2].take, "ONE LEVEL UP: SONNET", "b"]);
  e.push([m[2].resA, "SONNET IS ENOUGH FOR THE WRITER", "j"]);
  e.push([m[3].take, "THE JUDGE TRIES HAIKU TOO", "x"]);
  e.push([m[3].resA, "NOT ENOUGH: UP ONE LEVEL", "O"]);
  e.push([m[4].resA, "STILL NOT ENOUGH: ONE MORE", "O"]);
  e.push([m[5].take, "THE TOP CHIP, OPUS", "h"]);
  e.push([m[5].resA, "ONLY THE JUDGE NEEDS OPUS", "j"]);
  e.push([m[6].take, "EXAMINER: CHEAPEST FIRST", "x"]);
  e.push([m[6].resA, "HAIKU IS ENOUGH HERE", "j"]);
  e.push([m[7].take, "THE SWARM TAKES HAIKU TOO", "x"]);
  e.push([m[7].resA, "THE WHOLE SWARM RUNS CHEAP", "j"]);
  e.push([HIT + 2, "THE CHEAPEST THAT DOES THE JOB", "j"]);
  e.push([RS, "SHELF RESTOCKED", "x"]);
  e.push([RS + 22, "EVERY ROLE TRIES THE CHEAPEST FIRST", "x"]);
  return e;
})();
function caption(c, f) {
  let i = 0;
  CAPS.forEach((e, k) => { if (f >= e[0]) i = k; });
  const [t0, text, col] = CAPS[i];
  c.rect(4, 96, 152, 8, "c");
  c.box(4, 96, 152, 8, "F");
  const n = Math.min(text.length, Math.floor((f - t0 + 1) * 3));
  c.text(8, 98, (i === 0 && f < 40) || i === CAPS.length - 1 ? text : text.slice(0, Math.max(0, n)), col);
}

// ------------------------------------------------------------------ la animación
anim("goal_cheap", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HIT && f < HIT + HOLD) f = HIT;        // hit-stop: el mundo se congela tras el sello

  stage(c, f, real >= HIT + HOLD && real < HIT + HOLD + 10);
  cards(c, f);
  gateZones(c, f);
  dial(c, f);
  plinths(c, f);
  meter(c, f);
  labels(c, f);

  // roles: primero los que están en casa, al frente los que están en la cornisa
  const order = [0, 1, 2, 3, 4].sort((a, b) => Number(roleRaw(a, f).out) - Number(roleRaw(b, f).out));
  for (const ri of order) drawRole(c, ri, f);

  token(c, f);
  marksFx(c, f);
  coins(c, f);

  // el golpe grande: el sello fija el ahorro
  const t = f - HIT;
  if (t >= 0) imprint(c, f, t);
  stampMachine(c, f);
  meterLabels(c);
  if (t >= 0) {
    const [cx, cy] = SEAL;
    wave(c, cx, cy, t, 18, 30, ["y", "j", "Q"], 0.8);
    if (t >= 3) wave(c, cx, cy, t - 3, 14, 22, ["T", "j", "Q"], 0.8);
    spark(c, cx, cy, t - 1, 12, 1.5, 20, ["j", "y", "O"], 91);
    if (t >= 5 && t < 30 && f < RS) {
      sparkle(c, cx - 20, 30, [1, 2, 3, 2, 1][two(t) % 5], "y", "T");
      sparkle(c, cx + 19, 66, [2, 3, 2, 1, 2][two(t + 3) % 5], "y", "O");
      sparkle(c, cx - 19, 68, [1, 2, 2, 3, 2][two(t + 1) % 5], "y", "j");
    }
  }

  hud(c, f);
  caption(c, f);
  if (real >= HIT + HOLD && real < HIT + HOLD + 10)       // sacudida corta del golpe grande
    shake(c, [2, -2, 2, -1, 1, -1, 1, 0, -1, 0][real - HIT - HOLD], [1, -1, 0, 1, -1, 0, 1, 0, 0, 0][real - HIT - HOLD]);
  if (real >= HIT && real < HIT + NEG)                    // cuadro de impacto en negativo
    c.recolor({ z: "W", Z: "S", c: "S", J: "a", 1: "a", n: "S", N: "a", m: "A", M: "a", 2: "A", 8: "a", 9: "A", F: "L", r: "A", D: "a", "+": "a", "*": "a", "&": "c", "%": "J", "^": "F" });
})

sheet("goal_cheap_sheet", ["goal_cheap"], { pad: 0 })
