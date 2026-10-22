// path_swarm.px.js: "Camino 3: Swarm". 225 x 80 px de arte (GIF a x4 = 900 x 320), 480 cuadros a 30 fps (16 s), bucle sin corte.
// El diagrama del camino #3 de la sección "Tres caminos": Clawd (el Lead) parte un plan aprobado en cuatro unidades; cuatro
// cangrejos de los tres Tiers (verde, azul, rosa) y el violeta del nativo corren EN PARALELO, cada uno en su carril con su
// worktree, su barra de progreso y un supervisor que revisa tras cada intento (la unidad 3 falla una vez y reintenta). Las
// unidades aprobadas bajan por un canal y se funden DE UNA EN UNA por una sola compuerta en la rama principal; el contador
// MERGE n/4 sube a cada fusión y la compuerta frena a las demás con un golpecito. Al cuarto merge: hit-stop, destello en
// negativo y sacudida (una sola vez). Luego la REVISIÓN FINAL: una lupa recorre todo lo fundido, marca cada disquete y el
// CRT del BRIEF se enciende con la tira RADAR. Después todo vuelve a pendiente.
// Retematizado (2026-10-22, brief de assets/brand/retheme-brief.md): los cuatro carriles son cuatro vanos de una columnata
// de mármol (dos columnas, cornisa y un friso de greca bajo cada uno); la compuerta es un pequeño arco triunfal con la
// clave-lámpara, el contador MERGE n/4 en su ático y una hoja a rayas que sube y baja; las unidades son disquetes de 3,5"
// con la etiqueta del Tier; el BRIEF es un CRT beige de los 90 con su ventana BRIEF.EXE; la rama principal es un
// estilóbato de mármol con una greca; el plan es una ventanita de los 90; el divisor de ramas es una línea de constelación.
// Fondo: tira de nebulosa violeta con estrellas y un planeta con anillos. Sin tubos, cintas, cajas ni madera.
// Leyenda de la historia (cuadros, se calcula en SIM; los números exactos se imprimen al construir):
//    6 a 30    aparece el plan sobre Clawd y se aprueba (palomita)
//   30 a 60    el plan se parte en cuatro fichas que vuelan a los carriles; nacen los cangrejos (bolita, se despliegan)
//   60 a ~160  EN PARALELO: corren con su barra; tras cada intento aparece el disquete y el supervisor (? -> palomita / X)
//   ~150       la unidad 3 falla: sudor, "?" de Clawd, la barra se vacía parcialmente y reintenta
//   ~160 a HIT DE UNA EN UNA: cada disquete sale por el canal, espera su turno, la compuerta se abre para uno solo y los otros chocan
//   HIT        el cuarto merge: hit-stop de 4 cuadros, negativo de 2 y sacudida
//   HIT+ a ~+100  REVISIÓN FINAL (lupa), el BRIEF se enciende, RADAR, palomita y Clawd celebra
//   final      todo vuelve a pendiente: el cuadro 479 lleva al 0 sin salto
// Mismo lenguaje que aether.px.js: los personajes van "en dos"; disquetes, haces, chispas y barras se mueven en cada cuadro;
// el fondo está quieto y el movimiento se gasta en la acción (el GIF pesa poco).
include("kit.px.js")

const W = 225, H = 80, N = 480;
// Paleta propia: rojo oscuro de la hoja de la compuerta y el plástico beige de los 90 (rosewater / flamingo de Mocha).
// El mármol usa W e 3 l L 2 del kit (del blanco lavanda a la sombra violeta).
pal({ q: "#4a1d33", d: "#8a2740", "(": "#f5e0dc", ")": "#f2cdcd" })

// ------------------------------------------------------------------ plano (px de arte)
//   y 0 a 8    barra de arriba                  y 10 a 65  cuatro vanos de 14 px (11 de vano y 3 de friso de greca)
//   y 64 a 72  disquetes sobre el estilóbato    y 73 a 79  estilóbato (MAIN) con su greca     Clawd de pie en y 72
//   x 1 a 26   Clawd y el plan                  x 31  línea de constelación (spine)           x 38 a 137  carriles (columnas en 38 y 135)
//   x 138 a 148 canal de bajada                 x 149 a 171 arco de la compuerta (MERGE n/4)   x 174 a 223 cuatro huecos y el CRT del BRIEF
const LANE_Y = (i) => 10 + 14 * i;
const LX0 = 38, LW = 100;
const CHIP_X = 42, WT_X = 55;
const TRK0 = 74, TRKW = 39, CX0 = 80, CTR = 26;        // barra x 74..112; centro del cangrejo 80 + 26 p
const SUP_X = 130, BLK_X0 = 114;
const BUS_X = 138, HEAD_Y = 64, MAIN_Y = 73;
const FW = 11, FH = 9;                                 // disquete de 11 x 9
const SLOT_X = (k) => 174 + 13 * k;
const SPINE_X = 31, ARM = 14;                          // Clawd: ax = 14
const AX0 = 149, AX1 = 171;                            // arco: pilares 149..151 y 169..171; paso 152..168
const MON = { x: 174, y: 10, w: 50, h: 43 };           // el CRT
const SCR = { x: 177, y: 13, w: 44, h: 32 };           // su pantalla

// ------------------------------------------------------------------ utilidades propias
const win = (f, a, b) => f >= a && f < b;
const prog01 = (f, a, b) => clamp01((f - a) / (b - a));
const gw = (ch) => ({ ".": 1, ":": 1, "!": 1, "'": 1, ",": 2, ";": 2, "(": 2, ")": 2 }[ch] ?? 3);
const adv = (s) => [...s].reduce((a, ch) => a + gw(ch) + 1, 0);
const tw = (s) => adv(s) - 1;
const dith = (x, y, a) => bay(x, y) < a;
function spark(p, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  p.px(x, y, col);
  for (let k = 1; k < size; k++) for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) p.px(x + dx, y + dy, arm);
}
const SP = [1, 2, 3, 3, 2, 1];                          // tamaños de una chispa que nace y se apaga
const sp = (c, x, y, t, col = "y", arm = "l") => { if (t >= 0 && t < 6) spark(c, x, y, SP[t], col, arm); };

// Sacudida: el fondo (nebulosa, planeta, estilóbato) se queda quieto y todo lo demás se dibuja corrido; así la sacudida
// no vuelve a escribir la trama del fondo y el GIF no engorda. Devuelve un lienzo que corre cada trazo dx, dy.
function shifted(c, dx, dy) {
  if (!dx && !dy) return c;
  return {
    px: (x, y, k) => c.px(x + dx, y + dy, k),
    rect: (x, y, w, h, k) => c.rect(x + dx, y + dy, w, h, k),
    box: (x, y, w, h, k) => c.box(x + dx, y + dy, w, h, k),
    hline: (x, y, n, k) => c.hline(x + dx, y + dy, n, k),
    vline: (x, y, n, k) => c.vline(x + dx, y + dy, n, k),
    circ: (x, y, r, k) => c.circ(x + dx, y + dy, r, k),
    ring: (x, y, r, k) => c.ring(x + dx, y + dy, r, k),
    line: (x0, y0, x1, y1, k, w) => c.line(x0 + dx, y0 + dy, x1 + dx, y1 + dy, k, w),
    text: (x, y, str, k, o) => c.text(x + dx, y + dy, str, k, o),
  };
}

// ------------------------------------------------------------------ guion de las unidades
// k = [cuerpo, luz, sombra]. att = intentos {r0, r1, p0, res}; el supervisor resuelve a r1 + 20; un disquete aprobado sale 26 después.
const UN = [
  { name: "U1", wt: "WT1", k: ["t", "T", "4"], att: [{ r0: 62, r1: 100, p0: 0, res: "ok" }] },
  { name: "U2", wt: "WT2", k: ["b", "B", "5"], att: [{ r0: 66, r1: 118, p0: 0, res: "ok" }] },
  { name: "U3", wt: "WT3", k: ["h", "H", "6"], att: [{ r0: 70, r1: 128, p0: 0, res: "bad" }, { r0: 162, r1: 206, p0: 0.25, res: "ok" }] },
  { name: "U4", wt: "WT4", k: ["L", "l", "m"], att: [{ r0: 74, r1: 134, p0: 0, res: "ok" }] },
];
const LAUNCH = [32, 36, 40, 44], FLY = 14;               // las fichas del plan salen escalonadas y vuelan 14 cuadros
UN.forEach((u, i) => {
  u.S = LAUNCH[i] + FLY;                                  // llega la ficha: el carril despierta y nace el cangrejo
  const last = u.att[u.att.length - 1];
  u.fail = u.att.length > 1 ? u.att[0].r1 + 20 : -1;      // cuando falla el primer intento
  u.made = last.r1 + 4;                                   // aparece el disquete del intento bueno
  u.resolve = last.r1 + 20;                               // el supervisor aprueba
  u.leave = last.r1 + 26;                                 // el disquete sale hacia el canal
  u.drain = u.att.length > 1 ? [u.fail + 4, u.fail + 14] : null;   // la barra se vacía hasta p0 del segundo intento
  u.supOn = u.att.map((a) => a.r1 + 8);
});

// Progreso 0..1 de la unidad i en el cuadro f (barra y posición del cangrejo).
function prog(i, f) {
  const u = UN[i];
  let p = 0;
  const a0 = u.att[0];
  if (f >= a0.r0) p = a0.p0 + (1 - a0.p0) * (0.85 * prog01(f, a0.r0, a0.r1) + 0.15 * ease(prog01(f, a0.r0, a0.r1)));
  if (u.drain && f >= u.drain[0]) p = lerp(1, u.att[1].p0, ease(prog01(f, u.drain[0], u.drain[1])));
  if (u.att[1] && f >= u.att[1].r0) {
    const a = u.att[1], q = prog01(f, a.r0, a.r1);
    p = a.p0 + (1 - a.p0) * (0.85 * q + 0.15 * ease(q));
  }
  return p;
}

// ------------------------------------------------------------------ simulación del canal y la compuerta (se calcula una vez)
// Cada disquete: carril -> desliza a la derecha -> baja por el canal -> hace cola -> la compuerta se abre para UNO -> se desliza al hueco.
// La compuerta no se abre para otro hasta 8 cuadros después de que el anterior aterriza: los demás chocan contra ella.
const BUMP = [0, 1, 3, 3, 2, 1, 0, -1, 0, 0];
const SIM = (() => {
  const P = UN.map((u, i) => ({ i, st: "none", x: BLK_X0, y: LANE_Y(i) + 1, arr: -1, rest: false, slot: -1 }));
  const out = [], queue = [], lands = [], opens = [];
  let gate = { st: "idle", t0: 0, who: -1, landF: -99, closeF: -1 }, count = 0;
  for (let f = 0; f < N; f++) {
    P.forEach((p, i) => {
      const u = UN[i];
      if (f === u.made) p.st = "lane";
      if (f === u.leave) p.st = "h";
      if (p.st === "h") { p.x += 3.4; if (p.x >= BUS_X) { p.x = BUS_X; p.st = "bus"; queue.push(i); } }
    });
    queue.forEach((i, j) => {
      const p = P[i], ty = HEAD_Y - (FH + 1) * j, was = p.rest;
      if (p.y < ty) p.y = Math.min(ty, p.y + 2.2); else if (p.y > ty) p.y = Math.max(ty, p.y - 2.2);
      p.rest = Math.abs(p.y - ty) < 0.01;
      if (p.rest && !was) p.arr = f;
      if (!p.rest) p.arr = -1;
    });
    if (gate.st === "idle" && queue.length && P[queue[0]].rest) {
      gate = { st: "opening", t0: f, who: queue[0], landF: -99, closeF: -1 }; opens.push(f);
    } else if (gate.st === "opening" && f - gate.t0 >= 6) {
      const p = P[gate.who]; queue.shift(); p.st = "pass"; p.arr = -1; p.rest = false; gate.st = "pass";
    }
    if (gate.st === "pass") {
      const p = P[gate.who];
      p.x += 2.4;
      if (p.x >= 172 && gate.closeF < 0) gate.closeF = f;
      const dest = SLOT_X(count);
      if (p.x >= dest) { p.x = dest; p.st = "merged"; p.slot = count; count++; lands.push(f); gate.st = "settle"; gate.landF = f; }
    } else if (gate.st === "settle" && f - gate.landF >= 8) gate = { st: "idle", t0: 0, who: -1, landF: -99, closeF: -1 };
    let open = 0;
    if (gate.st === "opening") open = (f - gate.t0) / 6;
    else if (gate.st === "pass") open = gate.closeF < 0 ? 1 : 1 - (f - gate.closeF) / 4;
    else if (gate.st === "settle") open = gate.closeF >= 0 ? clamp01(1 - (f - gate.closeF) / 4) : 0;
    out.push({
      pk: P.map((p) => ({ st: p.st, x: p.x, y: p.y, arr: p.arr, rest: p.rest, slot: p.slot, j: queue.indexOf(p.i) })),
      busy: gate.st === "pass" || gate.st === "settle", gst: gate.st, open: clamp01(open), count, qlen: queue.length,
      who: gate.who, landF: gate.landF,
    });
  }
  return { out, lands, opens };
})();
const HIT = SIM.lands[3], HOLD = 4, NEG = 2;
const LAND = SIM.lands;
const T = {                                              // la historia después del cuarto merge
  lens: HIT + 8, sweep: [HIT + 14, HIT + 42], ok: HIT + 46, stream: [HIT + 50, HIT + 64], wake: HIT + 54,
  write: HIT + 66, radar: HIT + 90, check: HIT + 102, cheer: HIT + 102, reset: HIT + 132,
};
// Al final todo vuelve a pendiente: los disquetes se deshacen de derecha a izquierda (el contador baja con ellos), los
// cangrejos se hacen bolita y se van, los carriles se apagan.
const DIS = (k) => T.reset + 4 + 5 * (3 - k);              // empieza a deshacerse el disquete del hueco k (6 cuadros)
const shownCount = (f) => SIM.out[f].count - [0, 1, 2, 3].filter((k) => f >= DIS(k) + 6).length;
const BALL = (i) => T.reset + 4 * i;                       // el cangrejo i se pliega; desaparece 8 cuadros después
console.log("path_swarm schedule: leaves", UN.map((u) => u.leave).join(","), "opens", SIM.opens.join(","), "lands", LAND.join(","), "HIT", HIT, "reset", T.reset);

// ------------------------------------------------------------------ Clawd (el Lead, a escala 1: 24 x 16) y el plan
function clawd(c, f) {
  let pose = "idle", eyes = "sq", dy = 0, look = 0;
  const blink = (f + 23) % 80 < 3;
  if (win(f, 24, 30)) { pose = "squash"; }
  else if (win(f, 30, 48)) { pose = "armsup"; eyes = "happy"; dy = -Math.round(4 * Math.sin((Math.PI * (f - 30)) / 18)); }
  else if (win(f, 48, 52)) { pose = "squash"; eyes = "happy"; }
  else if (win(f, UN[2].fail + 2, UN[2].fail + 22)) { pose = "surprise"; look = 1; }
  else if (win(f, HIT - 2, HIT + HOLD + 8)) { pose = "surprise"; }
  else if (win(f, T.cheer, T.cheer + 16)) { pose = "armsup"; eyes = "happy"; dy = -Math.round(4 * Math.sin((Math.PI * (f - T.cheer)) / 16)); }
  else if (win(f, T.cheer + 16, T.cheer + 20)) { pose = "squash"; eyes = "happy"; }
  else if (win(f, T.cheer + 20, T.reset)) { pose = "armsup"; eyes = (f - T.cheer) % 50 > 44 ? "blink" : "happy"; }
  else if (win(f, 58, T.cheer)) look = 1;                // vigila los carriles
  if (blink && eyes === "sq") eyes = "blink";
  const [x, y] = place(pose, false, ARM, 72 + dy, 1);
  drawPose(c, pose, x, y, 1, "o", false);
  const list = eyesOf(pose, x, y, 1, false).map(([ex, ey]) => [ex + look, ey]);
  drawEyes(c, list, 1, eyes, "k");
  if (win(f, UN[2].fail + 2, UN[2].fail + 22)) {         // "?" de Clawd y gota de sudor
    if (two(f) % 2 === 0 || f - UN[2].fail > 6) c.text(ARM + 9, y - 6, "?", "O");
    const t = f - UN[2].fail - 2;
    c.px(x + 23, y + 3 + Math.floor(t / 4), "7"); c.px(x + 23, y + 4 + Math.floor(t / 4), "7");
  }
  if (win(f, 52, 56)) sp(c, x + 20, y - 2, f - 52 > 3 ? 5 : f - 52, "y", "l");
}
// Una ventanita de los 90 (13 x 9): marco beige, barra de título violeta con dos cajitas y un par de líneas de texto.
function miniWindow(c, x, y) {
  c.rect(x, y, 13, 9, "(");
  c.hline(x, y, 13, "W"); c.vline(x, y, 9, "W");
  c.hline(x, y + 8, 13, ")"); c.vline(x + 12, y, 9, ")");
  c.rect(x + 1, y + 1, 11, 2, "L");
  c.px(x + 9, y + 1, "e"); c.px(x + 11, y + 1, "e");
  c.rect(x + 1, y + 3, 11, 5, "c");
  c.hline(x + 2, y + 4, 6, "x"); c.hline(x + 2, y + 6, 8, "X");
}
// El plan aprobado sobre Clawd: la ventanita PLAN; se parte en cuatro fichas.
function plan(c, f) {
  const x = 8, y = 38;
  if (f < 6 || f >= 30) return;
  const t = f - 6;
  const pop = t < 3 ? [4, 6, 12][t] : 12;
  const w = pop, h = t < 3 ? [3, 5, 8][t] : 8;
  const cx = x + 6, cy = y + 4;
  const yy = y - (t < 5 ? 0 : t < 8 ? 1 : 0);                // un saltito al nacer
  if (t < 3) c.rect(cx - (w >> 1), cy - (h >> 1), w, h, "(");
  else miniWindow(c, x, yy);
  c.text(x + 6 - Math.floor(tw("PLAN") / 2), y - 7, "PLAN", t > 14 ? "j" : "x");
  sp(c, x + 13, y - 2, t, "y", "l");
  if (t >= 14) {                                          // aprobado: palomita
    const k = t - 14;
    const g = PROPS.check.map((r) => r.slice(0, Math.min(7, k * 2 + 1)));
    paintGrid(c, g, x + 13, y - 3, { y: "j" });
  }
}
// Las fichas: cuatro disquetitos que salen de la ventana y vuelan por un arco hasta la etiqueta de su carril.
const CHIP0 = [[8, 38], [14, 38], [8, 42], [14, 42]];
function chipPath(i, u) {
  const [sx, sy] = [CHIP0[i][0] + 3, CHIP0[i][1] + 2], tx = CHIP_X + 5, ty = LANE_Y(i) + 5;
  return bez([sx, sy], [lerp(sx, tx, 0.3), Math.min(sy, ty) - 12], [tx, ty], u);
}
function miniFloppy(c, x, y, k) {                          // 6 x 5, centrado en (x, y)
  c.rect(x - 3, y - 3, 6, 5, k[0]); c.hline(x - 3, y - 3, 6, k[1]);
  c.rect(x - 1, y - 3, 3, 2, "g"); c.px(x + 1, y - 3, "c");
  c.hline(x - 2, y + 1, 4, k[1]);
}
function chips(c, f) {
  UN.forEach((U, i) => {
    if (f < 30 || f >= U.S) return;
    const t = f - LAUNCH[i];
    if (t < 0) {                                           // esperan en la ventana rota (se separan y titilan)
      const sep = Math.min(2, Math.floor((f - 30) / 2));
      const x = CHIP0[i][0] + (i % 2 ? sep : -sep), y = CHIP0[i][1] + (i < 2 ? -sep : sep);
      miniFloppy(c, x + 3, y + 3, U.k);
      return;
    }
    const u = prog01(f, LAUNCH[i], U.S), e = ease(u);
    for (let k = 5; k >= 1; k--) {                          // estela
      const q = chipPath(i, ease(prog01(f - k, LAUNCH[i], U.S)));
      if (prog01(f - k, LAUNCH[i], U.S) <= 0) continue;
      if (k <= 2) c.rect(q[0] - 1, q[1] - 1, 3, 2, U.k[2]); else c.px(q[0], q[1], k <= 4 ? U.k[1] : U.k[2]);
    }
    const [x, y] = chipPath(i, e);
    miniFloppy(c, x, y, U.k);
  });
}

// ------------------------------------------------------------------ escenario: nebulosa, planeta, canal, estilóbato (casi quieto)
const SKYK = ["z", "n", "N", "m", "M", "v"];               // niveles de la nebulosa, de oscuro a claro
const GREC = ["XXXXXXX.", "X.....X.", "X.XXX.X."];          // greca: tres filas de meandro
const inBay = (x, y) => x >= 41 && x <= 134 && [0, 1, 2, 3].some((i) => y >= LANE_Y(i) + 1 && y <= LANE_Y(i) + 10);
const BG = (() => {
  const bg = new Array(W * H).fill("z"), open = new Array(W * H).fill(false);
  const set = (x, y, k) => { if (x >= 0 && x < W && y >= 9 && y < H) { bg[y * W + x] = k; open[y * W + x] = false; } };
  // nebulosa: una banda diagonal de ruido tramada con Bayer; más baja dentro de los vanos y abajo, para que se lea el texto
  for (let y = 9; y < MAIN_Y; y++)
    for (let x = 0; x < W; x++) {
      const band = Math.exp(-(((y - (36 + 0.1 * (x - 110))) / 17) ** 2));
      const n = 0.6 * vnoise(x, y, 26) + 0.4 * vnoise(x + 50, y + 20, 9);
      let L = clamp01((n * 1.3 - 0.2) * band * 1.3) * 4.5;
      if (inBay(x, y)) L = Math.min(L, 2.0);
      else if (y > 56) L = Math.min(L, 2.4);
      let idx = Math.floor(L);
      if (bay(x, y) < L - idx) idx++;
      let k = SKYK[Math.min(idx, 5)];
      if (idx === 0 && !inBay(x, y) && bay(x, y) < clamp01((y - 44) / 22) * 0.6) k = "n";   // bruma violeta cerca del suelo
      bg[y * W + x] = k; open[y * W + x] = !inBay(x, y);
    }
  // planeta con anillos sobre el arco: la mitad de atrás del anillo, la esfera y la mitad de delante
  const PCX = 162, PCY = 26, PR = 8;
  const ring = (front) => {
    for (const [sc, col] of [[1, "V"], [0.8, "v"]])
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * TAU, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        const x = Math.round(PCX + Math.cos(a) * 12 * sc + s * 0.5 * 3 * sc), y = Math.round(PCY + s * 3.6 * sc - Math.cos(a) * 0.1);
        set(x, y, col);
      }
  };
  ring(false);
  const PL = ["N", "2", "L", "l", "e"];
  for (let y = PCY - PR; y <= PCY + PR; y++)
    for (let x = PCX - PR; x <= PCX + PR; x++) {
      const nx = (x - PCX) / PR, ny = (y - PCY) / PR, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      let Lm = Math.max(0, -0.6 * nx - 0.55 * ny + 0.65 * nz) * 1.05 + 0.1 * Math.sin(ny * 7 + nx * 2);
      Lm = clamp01(Lm) * 4;
      let i = Math.floor(Lm); if (bay(x, y) < Lm - i) i++;
      set(x, y, PL[Math.min(i, 4)]);
    }
  ring(true);
  // el canal de mármol por donde bajan los disquetes: fondo oscuro con un riel a cada lado (x 138 a 148)
  for (let y = 10; y < MAIN_Y; y++)
    for (let x = BUS_X; x < BUS_X + FW; x++) { bg[y * W + x] = bay(x, y) < 0.18 ? "1" : "c"; open[y * W + x] = false; }
  for (let y = 11; y < 42; y++) bg[y * W + AX0] = "3";       // riel derecho, sobre el arco
  for (let x = BUS_X; x <= AX0; x++) bg[10 * W + x] = x === AX0 ? "W" : "e";   // la tapa del canal
  // estilóbato: escalón de mármol con su greca (la rama principal)
  for (let x = 0; x < W; x++) {
    bg[MAIN_Y * W + x] = "W";
    bg[(MAIN_Y + 1) * W + x] = "e"; bg[(MAIN_Y + 2) * W + x] = "e";
    bg[(MAIN_Y + 3) * W + x] = "l";
    for (let r = 0; r < 3; r++) bg[(MAIN_Y + 4 + r) * W + x] = GREC[r][x & 7] === "X" ? (r === 2 ? "A" : "a") : "1";
    for (let r = 0; r < 7; r++) open[(MAIN_Y + r) * W + x] = false;
  }
  return { bg, open };
})();
const STARS = (() => {
  const r = seeded(77), out = [];
  for (let i = 0; i < 52; i++) {
    const x = Math.floor(r() * W), y = 10 + Math.floor(r() * 62);
    if (BG.open[y * W + x]) out.push([x, y, r() < 0.15 ? 3 : r() < 0.5 ? 2 : 1, i % 6 === 0 ? [120, 160, 240][(i / 6) % 3] : 0, Math.floor(r() * 240)]);
  }
  return out;
})();
const STARC = [null, "G", "3", "W"];
function sky(c, f) {
  for (let y = 9; y < H; y++) for (let x = 0; x < W; x++) c.px(x, y, BG.bg[y * W + x]);
  for (const [x, y, lv, per, ph] of STARS) c.px(x, y, STARC[Math.min(3, lv + (per && (f + ph) % per < 5 ? 1 : 0))]);
}

// La línea de constelación que reparte el plan (x 31) y su ramita a cada carril; el tramo encendido del estilóbato.
function track(c, cs, f) {
  const lit = shownCount(f);
  // inlay de la rama principal: una ranura tenue y, encendida en violeta, la parte de Clawd y lo ya fundido
  c.hline(0, MAIN_Y + 1, W, "l");
  c.hline(0, MAIN_Y + 1, 30, "L"); c.hline(0, MAIN_Y + 2, 30, "L");
  if (lit > 0) { const to = SLOT_X(lit - 1) + FW; c.hline(AX1 + 1, MAIN_Y + 1, to - AX1 - 1, "L"); c.hline(AX1 + 1, MAIN_Y + 2, to - AX1 - 1, "L"); }
  // línea de constelación: puntos y una estrella en cada nudo
  for (let y = LANE_Y(0) + 5; y < MAIN_Y; y += 2) cs.px(SPINE_X, y, "m");
  UN.forEach((U, i) => {
    const lit2 = win(f, LAUNCH[i], U.S + 8), y = LANE_Y(i) + 5;
    for (let x = SPINE_X + 2; x < LX0 - 1; x += 2) cs.px(x, y, lit2 ? "a" : "m");
    cs.px(SPINE_X, y, lit2 ? "y" : "S");
    if (lit2) { cs.px(SPINE_X - 1, y, "l"); cs.px(SPINE_X + 1, y, "l"); cs.px(SPINE_X, y - 1, "l"); cs.px(SPINE_X, y + 1, "l"); }
  });
  cs.px(SPINE_X, MAIN_Y - 1, "S");
  cs.text(76, 66, "MAIN", "X");
}

// ------------------------------------------------------------------ un carril: un vano de la columnata
function crabAt(c, pose, ax, bottom, k, eyes) {
  const P = POSES[pose], g = P.g, hw = Math.ceil(g[0].length / 2), hh = Math.ceil(g.length / 2);
  const x0 = Math.round(ax - P.cx / 2), y0 = bottom - hh + 1;
  for (let r = 0; r < hh; r++)
    for (let q = 0; q < hw; q++) {
      let on = false;
      for (const [dr, dq] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const ch = g[2 * r + dr]?.[2 * q + dq]; if (ch && ch !== ".") on = true; }
      if (on) c.px(x0 + q, y0 + r, r === 0 ? k[1] : k[0]);
    }
  P.eyes.forEach(([col, row]) => {
    const ex = x0 + (col >> 1), ey = y0 + (row >> 1);
    if (eyes === "blink") c.px(ex, ey + 1, "k");
    else if (eyes === "happy") c.px(ex, ey, "k");
    else c.rect(ex, ey, 1, 2, "k");
  });
}
const WALKS = ["walk_a", "idle", "walk_b", "idle"];
function laneState(i, f) {                               // 0 pendiente, 1 activo, 2 hecho
  const U = UN[i];
  if (f < U.S) return 0;
  if (f >= BALL(i) + 10) return 0;
  return f >= U.leave + 2 ? 2 : 1;
}
function lane(c, i, f) {
  const U = UN[i], ty = LANE_Y(i), m = laneState(i, f), k = U.k;
  const flash = win(f, U.S, U.S + 3);
  // dos columnas con su ábaco y la cornisa; las dormidas son de un mármol más oscuro y despiertan al llegar la ficha
  const cols = flash ? ["W", "W", "W"] : m === 0 ? ["3", "l", "L"] : ["W", "e", "l"];
  for (const x0 of [LX0, LX0 + LW - 3]) {
    for (let q = 0; q < 3; q++) c.vline(x0 + q, ty + 1, 10, cols[q]);
    c.hline(x0 - 1, ty, 5, cols[0]);
  }
  c.hline(LX0 + 4, ty, LW - 8, flash ? "W" : m === 0 ? "3" : "e");
  const on = m > 0;
  c.rect(CHIP_X, ty + 2, 11, 7, on ? k[0] : "8");
  if (on) c.hline(CHIP_X, ty + 2, 11, k[1]);
  c.text(CHIP_X + 2, ty + 3, U.name, on ? "c" : "9");
  // etiqueta del worktree; RETRY mientras reintenta, DONE al terminar
  const retry = U.fail > 0 && win(f, U.fail, U.att[1].r1 + 8);
  const lbl = m === 2 ? "DONE" : retry ? "RETRY" : U.wt;
  c.text(WT_X, ty + 3, lbl, m === 2 ? "j" : retry ? (two(f) % 2 && f < U.fail + 10 ? "y" : "u") : m === 1 ? "X" : "9");
  // barra de progreso
  c.rect(TRK0, ty + 9, TRKW, 2, "c");
  if (m > 0) {
    const w = Math.round(TRKW * prog(i, f));
    if (w > 0) { c.hline(TRK0, ty + 9, w, k[1]); c.hline(TRK0, ty + 10, w, k[0]); }
    const failing = win(f, U.fail, U.fail + 6);
    if (failing && U.fail > 0) c.rect(TRK0, ty + 9, w, 2, two(f) % 2 ? "u" : k[0]);
  }
  // friso de greca bajo el vano: tenue en reposo, del color del Tier mientras trabaja, lavanda al terminar
  const gk = flash ? "y" : m === 0 ? "2" : m === 1 ? k[0] : "l";
  for (let r = 0; r < 3; r++)
    for (let x = LX0; x < LX0 + LW; x++) c.px(x, ty + 11 + r, GREC[r][(x - LX0) & 7] === "X" ? gk : "1");
}

// El cangrejo de un carril.
function crab(c, i, f) {
  const U = UN[i], ty = LANE_Y(i), t = f - U.S;
  if (t < 0) return;
  if (f >= BALL(i) + 8) return;
  const bottom = ty + 8;
  const p = prog(i, f), moving = Math.abs(p - prog(i, f - 1)) > 0.002 || Math.abs(prog(i, f + 1) - p) > 0.002;
  const ax = Math.round(CX0 + CTR * p);
  const last = U.att[U.att.length - 1], first = U.att[0];
  if (t < 4) { sp(c, CX0, ty + 5, t, "y", "l"); return; }
  let pose = "idle", eyes = "sq", dy = 0;
  const ball = BALL(i) + 4;
  if (t < 10) { pose = "ball"; }
  else if (t < 14) { pose = "unfold"; dy = -1; }
  else if (f >= ball && f < ball + 6) { pose = "ball"; }
  else if (f >= ball - 4 && f < ball) { pose = "unfold"; dy = -1; }
  else if (moving && f < last.r1) {
    pose = WALKS[two(f) % 4]; dy = pose === "idle" ? 0 : -1;
    if (i === 2 && f >= UN[2].drain[0] && f < UN[2].drain[1]) pose = WALKS[two(f) % 4];
  } else {
    for (const a of U.att) {                              // al llegar a la meta de cada intento
      const d = f - a.r1;
      if (d >= 0 && d < 18) {
        if (a.res === "ok") { pose = "armsup"; eyes = "happy"; dy = d >= 2 && d < 6 ? -1 : 0; }
        else if (d < 20) { pose = d < 8 ? "armsup" : "slump"; eyes = d < 8 ? "happy" : "sq"; }
      }
    }
    if (U.fail > 0 && f >= U.fail && f < U.fail + 14) { pose = "slump"; eyes = "sq"; }
    else if (f >= last.r1 + 18 && f < ball - 4) { eyes = f < U.leave + 40 ? "happy" : (f + i * 11) % 80 < 3 ? "blink" : "happy"; }
    else if (f >= U.att[0].r1 + 18 && U.fail > 0 && f < U.fail) eyes = "sq";
    if (f >= last.r1 + 18) pose = "idle";
  }
  if (eyes === "sq" && (f + i * 13) % 70 < 3 && pose === "idle") eyes = "blink";
  crabAt(c, pose, ax, bottom + dy, U.k, eyes);
  // sudor al fallar
  if (U.fail > 0 && win(f, U.fail, U.fail + 16)) {
    const s = f - U.fail;
    c.px(ax + 6, bottom - 6 + Math.floor(s / 4), "7"); c.px(ax + 6, bottom - 5 + Math.floor(s / 4), "7");
  }
}

// Supervisor: un medallón de 9 x 9 que crece mientras revisa: "?" ámbar mientras mira, palomita sobre verde si aprueba, aspa sobre rojo si no.
const TICK = [[-3, 0], [-2, 1], [-1, 2], [0, 1], [1, 0], [2, -1], [3, -2]];
const CROSS = [[-2, -2], [-1, -1], [0, 0], [1, 1], [2, 2], [2, -2], [1, -1], [-1, 1], [-2, 2]];
function supIcon(c, cx, cy, state, t, f) {
  const r = t < 2 ? 1 : t < 4 ? 2 : 4;
  if (r < 4) { c.ring(cx, cy, r, "O"); return; }
  const col = state === "q" ? "O" : state === "ok" ? "j" : "u";
  c.circ(cx, cy, 4, col);
  c.px(cx - 2, cy - 3, "y");                              // brillo del medallón
  if (state === "q") { if (two(f) % 4 < 3) c.text(cx - 1, cy - 2, "?", "c"); }
  else for (const [dx, dy] of state === "ok" ? TICK : CROSS) c.px(cx + dx, cy + dy, "c");
}
function sups(c, f) {
  UN.forEach((U, i) => {
    const cy = LANE_Y(i) + 5;
    U.att.forEach((a, ai) => {
      const t0 = a.r1 + 8, res = a.r1 + 20;
      const end = a.res === "bad" ? U.drain[0] + 6 : U.leave;
      if (f < t0 || f >= end) return;
      const state = f < res ? "q" : a.res;
      supIcon(c, SUP_X, cy, state, f - t0, f);
      if (f >= res && f < res + 6) sp(c, SUP_X + 6, cy - 5, f - res, a.res === "ok" ? "y" : "u", a.res === "ok" ? "j" : "u");
    });
  });
}

// ------------------------------------------------------------------ disquetes de 3,5" (las unidades)
// Cuerpo del color del Tier, postigo metálico arriba con su ventana, etiqueta clara con el nombre de la unidad.
// B luz del cuerpo, b cuerpo, d sombra, s plata, S plata en sombra, c ventana, w etiqueta.
const FLOP = [
  "BBBsssssBB.",
  "bbbsccssbbb",
  "bbbSSSSSbbb",
  "bwwwwwwwwwb",
  "bwwwwwwwwwb",
  "bwwwwwwwwwb",
  "bwwwwwwwwwb",
  "bwwwwwwwwwb",
  "ddddddddddd",
];
function floppyPx(c, x, y, k, label, keep) {
  const map = { B: k[1], b: k[0], d: k[2], s: "g", S: "G", c: "c", w: k[1] };
  for (let r = 0; r < FH; r++)
    for (let q = 0; q < FW; q++) {
      const ch = FLOP[r][q];
      if (ch === "." || (keep && !keep(x + q, y + r))) continue;
      c.px(x + q, y + r, map[ch]);
    }
  c.text(x + 2, y + 3, label, "c");
}
function block(c, x, y, i, keep) {
  x = Math.round(x); y = Math.round(y);
  floppyPx(c, x, y, UN[i].k, UN[i].name, keep);
}
function blockPop(c, cx, cy, i, t) {                     // el disquete nace con un reventón de 3 cuadros
  if (t < 0) return;
  if (t < 3) {
    const w = [3, 7, 9][t], h = [3, 5, 7][t];
    c.rect(cx - (w >> 1), cy - (h >> 1), w, h, t === 0 ? "y" : UN[i].k[0]);
    return;
  }
  block(c, cx - 5, cy - 4, i);
}
function blocks(c, f) {
  const S = SIM.out[f];
  UN.forEach((U, i) => {
    const p = S.pk[i], ty = LANE_Y(i);
    // disquete fallido de la unidad 3: se deshace en puntos tras la X
    if (U.fail > 0 && i === 2) {
      const a = U.att[0];
      const t0 = a.r1 + 4, t1 = U.fail + 2;
      if (f >= t0 && f < t1 + 10) {
        if (f < t0 + 3) blockPop(c, BLK_X0 + 5, ty + 5, i, f - t0);
        else if (f < t1) block(c, BLK_X0, ty + 1, i);
        else { const u = (f - t1) / 10; block(c, BLK_X0, ty + 1, i, (x, y) => bay(x, y) >= u); }
      }
    }
    if (p.st === "none") {
      if (f >= U.made && f < U.made + 3) blockPop(c, BLK_X0 + 5, ty + 5, i, f - U.made);
      return;
    }
    if (p.st === "lane") {
      if (f < U.made + 3) blockPop(c, BLK_X0 + 5, ty + 5, i, f - U.made);
      else block(c, BLK_X0, ty + 1, i);
      return;
    }
    let x = p.x, y = p.y;
    if (p.st === "bus" && p.rest && p.j === 0 && S.busy) {  // choca contra la compuerta cerrada
      const tb = f - p.arr - 2;
      if (tb >= 0) x += BUMP[tb % 10];
    } else if (p.st === "bus" && p.rest && p.j > 0 && p.arr >= 0) {
      const tb = f - p.arr; if (tb >= 0 && tb < 3) y += [1, 1, 0][tb] * -1;
    }
    if (p.st === "merged") {
      const t = f - SIM.lands[p.slot];
      if (t >= 0 && t < 3) y += [1, 0, 0][t];
      const d = f - DIS(p.slot);
      if (d >= 6) return;
      if (d >= 0) { const u = d / 6; block(c, x, Math.round(y), i, (xx, yy) => bay(xx, yy) >= u); return; }
    }
    block(c, x, Math.round(y), i);
    if (p.st === "h" || p.st === "pass") {                // rastro corto
      for (let k = 1; k <= 3; k++) c.px(Math.round(x) - 2 * k, Math.round(y) + 4, k === 1 ? UN[i].k[1] : UN[i].k[2]);
    }
  });
}
function dust(c, f) {                                    // polvo al aterrizar un disquete en su hueco
  SIM.lands.forEach((L, k) => {
    const t = f - L;
    if (t < 0 || t > 7) return;
    const x = SLOT_X(k);
    c.px(x - 1 - (t >> 1), MAIN_Y - 1, t < 4 ? "l" : "a"); c.px(x + 11 + (t >> 1), MAIN_Y - 1, t < 4 ? "l" : "a");
    if (t < 3) c.px(x - 2 - t, MAIN_Y - 2 - t, "y");
    if (t < 3) c.px(x + 12 + t, MAIN_Y - 2 - t, "y");
  });
}

// ------------------------------------------------------------------ la compuerta: un pequeño arco triunfal
// Cornisa, ático con el contador (una placa oscura con el nombre y n/4), anillo de dovelas con la lámpara de clave, dos
// pilares y, en el paso, la hoja a rayas rojas que sube para UN disquete y vuelve a bajar.
function gate(c, f) {
  const S = SIM.out[f];
  const hot = SIM.lands.some((L) => win(f, L, L + 8));
  // cornisa (y 42 a 44) y ático (y 45 a 58)
  c.hline(AX0 - 1, 42, 25, "W"); c.hline(AX0 - 1, 43, 25, "e"); c.hline(AX0, 44, 23, "L");
  c.rect(AX0, 45, 23, 14, "e"); c.hline(AX0, 45, 23, "W"); c.vline(AX0, 45, 14, "W"); c.vline(AX1, 45, 14, "l");
  // la placa: fondo oscuro, marco hundido que se enciende con la fusión
  const fk = hot ? "y" : S.busy || S.gst === "opening" ? "a" : "2";
  c.rect(AX0 + 1, 46, 21, 13, "c");
  c.hline(AX0 + 1, 46, 21, fk); c.vline(AX0 + 1, 46, 13, fk); c.hline(AX0 + 1, 58, 21, "3"); c.vline(AX0 + 21, 46, 13, "3");
  c.text(AX0 + 2, 47, "MERGE", "x");
  const n = shownCount(f), lastL = S.count > 0 ? SIM.lands[S.count - 1] : -99;
  const pop = f < T.reset ? f - lastL : -1;
  const txt = n + "/4", col = n === 4 ? "j" : pop >= 0 && pop < 8 ? "y" : n === 0 ? "X" : "f";
  c.text(160 - Math.floor(tw(txt) / 2), 53 - (pop >= 0 && pop < 2 ? 1 : 0), txt, col);
  // anillo de dovelas (y 59 a 61) sobre el paso
  c.rect(AX0, 59, 23, 3, "e"); c.hline(AX0, 59, 23, "W"); c.hline(AX0, 61, 23, "l");
  for (let x = AX0 + 3; x < AX1; x += 4) c.vline(x, 60, 2, "L");
  // pilares: tres columnas de ancho con el fuste claro a la izquierda
  for (const x0 of [AX0, AX1 - 2]) {
    for (let q = 0; q < 3; q++) c.vline(x0 + q, 62, 11, ["W", "e", "l"][q]);
    c.hline(x0 - 1, 62, 5, "W"); c.hline(x0 - 1, 72, 5, "3");
  }
  // la hoja a rayas, en el paso (x 152 a 168, y 62 a 72), con las esquinas del arco achaflanadas
  const h = Math.round(11 * (1 - S.open));
  for (let yy = 0; yy < h; yy++) {
    const x0 = yy === 0 ? 154 : yy === 1 ? 153 : 152, x1 = yy === 0 ? 166 : yy === 1 ? 167 : 168;
    for (let xx = x0; xx <= x1; xx++) c.px(xx, 62 + yy, ((xx + yy) >> 1) % 2 === 0 ? "u" : "q");
  }
  if (h > 0) c.hline(152, 62 + h - 1, 17, "G");
  // clave del arco: la lámpara (verde abierta, roja si hay cola, apagada si descansa)
  const lampOn = S.open > 0.3 ? "j" : S.qlen > 0 || S.busy ? (two(f) % 2 ? "u" : "d") : "2";
  c.rect(157, 59, 7, 4, "W"); c.hline(158, 62, 5, "e"); c.vline(157, 59, 4, "W"); c.vline(163, 59, 4, "3");
  c.rect(159, 60, 3, 2, lampOn);
  if (lampOn === "j" && f % 30 < 18) c.px(159, 60, "T");
}

// ------------------------------------------------------------------ revisión final: la lupa, las palomitas, el haz y el CRT
function lensPos(f) {
  const u = ease(prog01(f, T.sweep[0], T.sweep[1]));
  return [Math.round(lerp(178, 216, u)), 58];
}
function lens(c, f) {
  if (f < T.lens || f >= T.ok + 24) return;
  let [lx, ly] = lensPos(f);
  let happy = f >= T.ok;
  if (happy) ly -= Math.max(0, Math.round(3 * Math.sin((Math.PI * (f - T.ok)) / 10)));
  const t = f - T.lens;
  if (f >= T.ok + 18) { // se va con una chispa
    if (f - (T.ok + 18) < 6) sp(c, lx, ly, f - (T.ok + 18), "y", "l");
    return;
  }
  const r = t < 2 ? 2 : t < 4 ? 4 : 5;
  c.circ(lx, ly, r, r < 5 ? "x" : "f");
  c.ring(lx, ly, r, "y");
  if (r >= 5) {
    c.line(lx + 4, ly - 3, lx + 8, ly - 7, "O");
    c.rect(lx + 8, ly - 8, 2, 2, "D");
    const ey = ly - 1, dx = happy ? 0 : 1;
    if (happy) { c.hline(lx - 3, ey, 2, "c"); c.hline(lx + 1, ey, 2, "c"); }
    else { c.rect(lx - 2 + dx, ey - 1, 1, 2, "c"); c.rect(lx + 2 + dx - 1, ey - 1, 1, 2, "c"); }
    c.px(lx - 3, ly - 3, "y");
  }
}
function checks(c, f) {
  for (let k = 0; k < 4; k++) {
    const cxk = SLOT_X(k) + 5;
    // aparece cuando la lupa ya pasó (su centro 9 px a la derecha) o cuando termina
    let tk = -1;
    for (let ff = T.sweep[0]; ff <= T.ok; ff++) if (lensPos(ff)[0] >= cxk + 9 || ff === T.ok) { tk = ff; break; }
    const t = f - tk;
    if (t < 0 || f >= T.reset) continue;
    const n = Math.min(7, t * 2 + 1);
    paintGrid(c, PROPS.check.map((r) => r.slice(0, n)), SLOT_X(k) + 2, HEAD_Y - 7, { y: t < 2 ? "y" : "j" });
  }
}
function review(c, f) {
  // los disquetes se iluminan al pasar la lupa
  if (f >= T.sweep[0] && f < T.ok + 4) {
    const lx = f < T.ok ? lensPos(f)[0] : -99;
    for (let k = 0; k < 4; k++) {
      const x = SLOT_X(k);
      if (Math.abs(lx - (x + 5)) < 7) for (let yy = 0; yy < FH; yy++) for (let xx = 0; xx < FW; xx++) if (dith(x + xx, HEAD_Y + yy, 0.5) && FLOP[yy][xx] !== ".") c.px(x + xx, HEAD_Y + yy, "y");
    }
  }
}
function stream(c, f) {                                  // un hilo de datos sube del último disquete a la ranura del CRT
  if (f < T.stream[0] || f >= T.stream[1] + 16) return;
  const x = 213;
  const top = 50, bot = HEAD_Y - 1;
  const u = prog01(f, T.stream[0], T.stream[1]);
  const y0 = Math.round(lerp(bot, top, ease(u)));
  for (let yy = y0; yy <= bot; yy++) if (dith(x, yy, 0.8) || dith(x + 1, yy, 0.5)) { c.px(x, yy, "a"); }
  for (let k = 0; k < 3; k++) {
    const ph = (f * 2 + k * 6) % 14, yy = bot - ph;
    if (yy >= y0 && f < T.stream[1] + 8) { c.rect(x - 0, yy, 1, 2, "l"); c.px(x + 1, yy, "a"); }
  }
}
const RADC = ["u", "O", "b", "O", "h"];
// El CRT beige: caja de plástico, pantalla hundida, ranura de disquete y placa BRIEF; al encenderse la pantalla crece
// desde un punto y muestra la ventana BRIEF.EXE.
function monitor(c, f) {
  const wake = T.wake, shr = T.reset;
  const g = f >= shr ? 1 - ease((f - shr) / 10) : ease((f - wake) / 10);
  const m = MON, s = SCR;
  const pend = g <= 0;
  // caja beige con luz arriba a la izquierda y sombra abajo a la derecha
  c.rect(m.x, m.y, m.w, m.h, "(");
  c.hline(m.x, m.y, m.w, "W"); c.vline(m.x, m.y, m.h, "W");
  c.hline(m.x, m.y + m.h - 1, m.w, ")"); c.vline(m.x + m.w - 1, m.y, m.h, ")");
  c.px(m.x + m.w - 1, m.y + m.h - 1, "G");
  // cuello y base
  c.rect(m.x + 18, m.y + m.h, 14, 2, "(");  c.hline(m.x + 18, m.y + m.h + 1, 14, ")");
  c.rect(m.x + 12, m.y + m.h + 2, 26, 2, "("); c.hline(m.x + 12, m.y + m.h + 2, 26, "W"); c.hline(m.x + 12, m.y + m.h + 3, 26, ")");
  // bisel hundido de la pantalla
  c.rect(s.x - 1, s.y - 1, s.w + 2, s.h + 2, "G");
  c.hline(s.x - 1, s.y + s.h, s.w + 2, "W"); c.vline(s.x + s.w, s.y - 1, s.h + 2, "W");
  c.rect(s.x, s.y, s.w, s.h, "c");
  // placa inferior: luz, botones, la placa BRIEF y la ranura del disquete
  c.rect(m.x + 4, m.y + 38, 2, 2, pend ? "G" : "j");
  c.hline(m.x + 8, m.y + 38, 3, "G"); c.hline(m.x + 12, m.y + 38, 3, "G");
  c.text(m.x + 17, m.y + 37, "BRIEF", pend ? "G" : "c");
  c.rect(m.x + 37, m.y + 38, 10, 3, "c"); c.hline(m.x + 37, m.y + 41, 10, "W");
  if (pend) {                                              // pantalla apagada: el esbozo de la ventana y un reflejo diagonal
    c.hline(s.x + 4, s.y + 4, 14, "1"); c.hline(s.x + 4, s.y + 9, 10, "1"); c.hline(s.x + 4, s.y + 15, 12, "1");
    for (let q = 0; q < 5; q++) c.box(s.x + 3 + q * 8, s.y + 27, 7, 4, "1");
    for (let q = 0; q < 6; q++) { c.px(s.x + 30 + q, s.y + 8 - q, "Z"); c.px(s.x + 30 + q, s.y + 10 - q, "Z"); }
    return;
  }
  const x = Math.round(lerp(s.x + s.w / 2 - 2, s.x, g)), y = Math.round(lerp(s.y + s.h / 2 - 2, s.y, g));
  const w = Math.round(lerp(5, s.w, g)), h = Math.round(lerp(5, s.h, g));
  c.rect(x, y, w, h, "f"); c.rect(x + 1, y + 1, w - 2, h - 2, "c");
  if (g < 1) return;
  c.rect(x, y, w, 7, "f");
  c.text(x + 2, y + 1, "BRIEF.EXE", "c");
  for (let q = 0; q < 2; q++) c.rect(x + w - 8 + q * 4, y + 2, 3, 3, "c");
  const wr = Math.floor((f - T.write) * 1.8);
  const lines = ["4/4 MERGED", "REVIEW OK", "RADAR"];
  const pauses = [0, 12, 22];
  const ys = [y + 9, y + 15, y + 21];
  let caret = null;
  lines.forEach((s2, r) => {
    const shown = s2.slice(0, Math.max(0, Math.min(s2.length, wr - pauses[r])));
    if (shown.length) c.text(x + 3, ys[r], shown, "x");
    if (shown.length && shown.length < s2.length) caret = [x + 3 + adv(shown), ys[r]];
  });
  if (wr - pauses[1] >= lines[1].length + 1) c.text(x + 3 + adv("REVIEW "), ys[1], "OK", "j");
  if (caret && two(f) % 2) c.rect(caret[0], caret[1] + 4, 3, 1, "x");
  // RADAR: cinco cuadros que se encienden uno a uno
  RADC.forEach((kc, q) => {
    const d = f - (T.radar + q * 3), qx = x + 3 + q * 8, qy = y + 27;
    if (d < 0) { c.box(qx, qy, 7, 4, "9"); return; }
    const sz = d < 1 ? 3 : d < 2 ? 5 : 7;
    const o = (7 - sz) >> 1;
    c.rect(qx + o, qy, sz, 4, d < 1 ? "y" : kc);
    if (d >= 1 && d < 4) c.px(qx + 6, qy - 1, "y");
  });
  // palomita grande
  if (f >= T.check) {
    const k = f - T.check;
    paintGrid(c, PROPS.check.map((r) => r.slice(0, Math.min(7, k * 2 + 1))), x + 28, y + 20, { y: k < 2 ? "y" : "j" });
    sp(c, x + 37, y + 19, k, "y", "j");
  }
}
const CONF = (() => {
  const r = seeded(51), out = [];
  for (let k = 0; k < 18; k++) {
    const a = -Math.PI * (0.05 + 0.9 * r()), s = 1.2 + r() * 2.0;
    out.push({ vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.9, col: ["t", "b", "h", "O", "y", "L"][k % 6], d: Math.floor(r() * 4) });
  }
  return out;
})();
function confetti(c, f) {
  const x0 = SCR.x + 31, y0 = SCR.y + 22;
  for (const p of CONF) {
    const t = f - T.check - p.d;
    if (t < 0 || t > 26) continue;
    const x = Math.round(x0 + p.vx * t * 0.8), y = Math.round(y0 + p.vy * t + 0.1 * t * t);
    if (x < 1 || x > W - 3 || y < 10 || y > 62) continue;
    if (two(t + p.d) % 2) c.rect(x, y, 2, 1, p.col); else c.rect(x, y, 1, 2, p.col);
  }
}

// ------------------------------------------------------------------ choque contra la compuerta
function bumps(c, f) {
  const S = SIM.out[f];
  S.pk.forEach((p, i) => {
    if (p.st === "bus" && p.rest && p.j === 0 && S.busy && p.arr >= 0) {
      const tb = f - p.arr - 2;
      if (tb >= 0 && tb % 10 >= 2 && tb % 10 < 5) {
        const t = (tb % 10) - 2;
        sp(c, 150, 68, t, "y", "u");
        c.px(149, 62 - t, "u");
      }
    }
  });
}

// ------------------------------------------------------------------ barra de arriba
const CAPS = () => {
  const out = [];
  out.push([6, 30, "PLAN APPROVED", "x", ""]);
  out.push([30, 50, "SPLIT INTO 4 UNITS", "x", ""]);
  out.push([50, SIM.opens[0], "IN PARALLEL", "w", "EACH UNIT IN ITS WORKTREE"]);
  out.push([SIM.opens[0], HIT + 6, "ONE AT A TIME", "w", "THROUGH A SINGLE GATE"]);
  out.push([HIT + 6, T.check, "FINAL REVIEW", "w", "COVERS ALL MERGED WORK"]);
  out.push([T.check, T.reset + 8, "BRIEF READY", "j", "RADAR 5/5"]);
  return out;
};
const CAP = CAPS();
function hud(c, f) {
  c.rect(1, 0, 223, 9, "c");
  c.box(1, 0, 223, 9, "F");
  const done = f >= T.check && f < T.reset + 8;
  c.text(5, 2, "> SWARM", done ? "j" : "x");
  const cap = CAP.find(([a, b]) => f >= a && f < b);
  if (cap) {
    const [, , s1, col, s2] = cap;
    c.text(38, 2, s1, col);
    if (s2) c.text(38 + adv(s1) + 4, 2, s2, "X");
  }
  // tres segmentos: en paralelo, de una en una, revisión final
  const ph = f < 50 ? -1 : f < SIM.opens[0] ? 0 : f < HIT + 6 ? 1 : f < T.reset + 8 ? 2 : -1;
  for (let q = 0; q < 3; q++) {
    const lit = ph > q ? "a" : ph === q ? (two(f) % 2 ? "y" : "l") : "1";
    c.rect(198 + q * 8, 3, 6, 3, done ? "j" : lit);
  }
}

// ------------------------------------------------------------------ la animación
anim("path_swarm", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f > HIT && f < HIT + HOLD) f = HIT;                // hit-stop: el mundo se congela en el cuarto merge

  // sacudida corta del cuarto merge (6 cuadros): lo que no es fondo se dibuja corrido
  const k = real - HIT - HOLD;
  const cs = k >= 0 && k < 6 ? shifted(c, [2, -2, 1, -1, 1, 0][k], [1, -1, 0, 1, 0, 0][k]) : c;

  c.rect(0, 0, W, H, "z");
  sky(c, f);
  track(c, cs, f);
  for (let i = 0; i < 4; i++) lane(cs, i, f);
  for (let i = 0; i < 4; i++) crab(cs, i, f);
  sups(cs, f);
  monitor(cs, f);
  stream(cs, f);
  gate(cs, f);
  blocks(cs, f);
  dust(cs, f);
  bumps(cs, f);
  plan(cs, f);
  chips(cs, f);
  clawd(cs, f);
  review(cs, f);
  checks(cs, f);
  lens(cs, f);
  confetti(cs, f);
  hud(c, f);
  if (real >= HIT && real < HIT + NEG)                    // cuadro de impacto en negativo: lo oscuro se aclara y el mármol se oscurece
    c.recolor({ z: "W", c: "S", 1: "a", n: "e", N: "3", m: "l", W: "z", e: "Z", 3: "1", l: "n", L: "N", x: "Z", y: "Z", X: "n", f: "N", F: "L" });
})

sheet("path_swarm_sheet", ["path_swarm"], { pad: 0 })
