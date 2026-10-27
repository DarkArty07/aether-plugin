include("kit.px.js")

// ------------------------------------------------------------------ brake: "El freno de cuota"
// Una corrida autónoma de tres unidades (cangrejos verde, azul y rosa) construye en paralelo mientras el medidor de la
// ventana de 5 horas de tu cuenta de Claude sube. Cuando toca el 95 % (el umbral de la opción quotabrake) el plugin avisa y el
// Lead frena EN ORDEN: 1) no empieza nada nuevo, 2) lo que corre se detiene, 3) el trabajo de cada unidad se guarda en su rama
// (un disquete vuela a su casilla). La corrida queda en PAUSA, no termina: el Lead y los cangrejos duermen mientras un reloj
// cuenta, la ventana se reinicia (el medidor se vacía) y el plugin despierta al Lead, que relanza la corrida desde las ramas
// guardadas SIN repetir la unidad ya fundida (la verde terminó antes del freno y su casilla es una palomita, no un disquete).
// Las unidades terminan, se deshacen en chispas y el bucle vuelve a empezar con unidades nuevas: no tiene corte.
// Lienzo de 160 x 90 px (GIF a x4 = 640 x 360), 420 cuadros a 30 fps (14 s).
// Las poses van "en dos" o "en cuatro" (cada dibujo dura 2 o 4 cuadros); el medidor, los disquetes y los efectos a 30 fps.
// Leyenda (cuadros):
//   0 a 24      las tres unidades se despliegan (bolita) / 26 a 114 construyen; el medidor sube de 18 a 95 %
//   114 a 130   la unidad 1 termina, su disquete vuela a la casilla (fundida) y festeja
//   152 a 168   el medidor toca 95 %: el medidor parpadea, la pantalla tiembla, el Lead se sorprende, el aviso sale en la barra
//   168 a 200   PASO 1 nada nuevo empieza (168) y PASO 2 lo que corre se detiene (184 y 188): lámparas rojas, barras quietas
//   200 a 240   PASO 3 el trabajo se guarda: un disquete por unidad vuela a su casilla (200 y 212)
//   240 a 290   PAUSA: duermen, el reloj corre, el medidor sigue lleno / 290 a 322 la ventana se reinicia: el medidor se vacía
//   326 a 360   el plugin despierta al Lead; los disquetes vuelven a sus cangrejos (338 y 350) y siguen desde donde iban
//   360 a 420   terminan (388, 398 y 408), se deshacen en chispas; el medidor vuelve a 18 % y todo empieza de nuevo
const W = 160, H = 90, N = 420;
pal({ q: "#3d1230", d: "#8a2740" });

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const seg = (f, a, b) => clamp01((f - a) / (b - a));
const TIERK = { t: ["t", "T", "4"], b: ["b", "B", "5"], h: ["h", "H", "6"] };
const ROW_Y = [11, 28, 45];                               // arriba de la fila de cada unidad (17 px de paso)
const TIER = ["t", "b", "h"];

// ------------------------------------------------------------------ guion (cuadros)
const IN0 = [2, 8, 14];                                   // se despliega cada unidad
const BUILD0 = 26;                                        // empiezan a construir
const D1 = 114;                                           // la unidad 1 termina y se funde
const CROSS = 152;                                        // el medidor toca 95 %
const S1 = 168, S2 = 184;                                 // paso 1 (nada nuevo) y paso 2 (se detiene lo que corre)
const STOP = [null, 184, 188];                            // cuándo se detiene cada unidad (la 1 ya había terminado)
const SAVE0 = [null, 200, 212];                           // cuándo sale su disquete hacia la rama
const FLY = 18;                                           // cuadros de vuelo de un disquete
const PAUSE0 = 240;                                       // pausa: duermen
const RESET0 = 290, RESET1 = 322;                         // la ventana se reinicia
const WAKE = 326;                                         // el plugin despierta al Lead
const RES0 = [null, 338, 350];                            // el disquete vuelve a su cangrejo
const FIN = [388, 398, 408];                              // cada unidad termina y se deshace en chispas
const PEAK = [1, 0.62, 0.4];                              // cuánto llevaba cada una al frenar (la 1 ya iba al 100 %)

// ------------------------------------------------------------------ el medidor de la cuota de 5 horas
const GX = 118, GY0 = 21, GW = 15, GH = 60;               // la probeta: caja exterior
const GIN_TOP = GY0 + 1, GIN_H = GH - 2;                  // interior: 58 px
function level(f) {                                       // % usado de la ventana de 5 horas
  if (f < 20) return 18;
  if (f < CROSS) return 18 + 77 * ease(seg(f, 20, CROSS)) * 0.35 + 77 * 0.65 * seg(f, 20, CROSS);
  if (f < RESET0) return 95 + (f > CROSS + 10 ? 0.6 * Math.sin((f - CROSS) * 0.3) : 0);
  if (f < RESET1) return 95 * (1 - ease(seg(f, RESET0, RESET1))) + 3 * ease(seg(f, RESET0, RESET1));
  return 3 + 15 * seg(f, RESET1, N - 1);                  // 18 % en el último cuadro: igual que el primero
}
const zoneKey = (pct) => (pct >= 85 ? "u" : pct >= 60 ? "O" : "j");
function gauge(c, f) {
  const L = level(f), hpx = Math.round(L / 100 * GIN_H);
  c.rect(GX, GY0, GW, GH, "c");
  for (let yy = 0; yy < hpx; yy++) {                       // el líquido: verde, ámbar y rojo según la zona
    const y = GY0 + GH - 2 - yy, key = zoneKey(yy / GIN_H * 100);
    c.hline(GX + 1, y, GW - 2, key);
    if (yy % 4 === 0) c.hline(GX + 1, y, GW - 2, key === "j" ? "t" : key === "O" ? "y" : "p");   // bandas de brillo
  }
  if (hpx > 0) c.hline(GX + 1, GY0 + GH - 1 - hpx, GW - 2, "y");                                // la superficie
  for (const v of [25, 50, 75]) c.hline(GX + GW - 4, GY0 + GH - 2 - Math.round(v / 100 * GIN_H), 3, "X");   // marcas
  const flash = f >= CROSS && f < CROSS + 16 && two(f) % 2 === 0;
  c.box(GX, GY0, GW, GH, flash ? "y" : f >= CROSS + 16 && f < RESET0 ? "u" : "F");
  const ty = GY0 + GH - 2 - Math.round(0.95 * GIN_H);       // el umbral de 95 %
  c.hline(GX - 4, ty, 5, "u");
  c.text(GX - 12, ty - 2, "95", "u");
  c.text(GX + 3, GY0 - 8, "5H", f >= CROSS && f < RESET1 ? "u" : "x");
  const shown = Math.round(L);
  c.text(GX + GW + 3, clamp(GY0 + GH - 4 - hpx, GY0 + 7, GY0 + GH - 8), `${shown}%`, zoneKey(L));
  if (f >= RESET0 && f < RESET1) {                         // chispas en la superficie al vaciarse
    for (let k = 0; k < 3; k++) {
      const sx = GX + 2 + ((f * 5 + k * 5) % (GW - 4)), sy = GY0 + GH - 2 - hpx - 1 - ((f + k * 2) % 4);
      if (inside(sx, sy)) c.px(sx, sy, k === 0 ? "y" : "W");
    }
  }
}
function clock(c, f) {                                    // el reloj de la pausa
  if (f < PAUSE0 - 4 || f >= RESET1 + 4) return;
  const cx = 149, cy = 17, a = (f - PAUSE0) * 0.22;
  c.circ(cx, cy, 7, "c"); c.ring(cx, cy, 7, "F");
  for (let k = 0; k < 4; k++) c.px(Math.round(cx + Math.sin(k * TAU / 4) * 6), Math.round(cy - Math.cos(k * TAU / 4) * 6), "3");
  c.line(cx, cy, Math.round(cx + Math.sin(a) * 5), Math.round(cy - Math.cos(a) * 5), "y");
  c.line(cx, cy, Math.round(cx + Math.sin(a / 12) * 3), Math.round(cy - Math.cos(a / 12) * 3), "w");
  c.px(cx, cy, "u");
}

// ------------------------------------------------------------------ las unidades
function prog(i, f) {                                     // cuánto lleva construido cada una (0 a 1)
  if (f < IN0[i] + 20 || f >= FIN[i]) return 0;
  if (i === 0) return ease(seg(f, BUILD0, D1));
  const resume = RES0[i] + FLY;
  if (f < STOP[i]) return PEAK[i] * seg(f, BUILD0 + 4 * i, STOP[i]);
  if (f < resume) return PEAK[i];
  return lerp(PEAK[i], 1, seg(f, resume, FIN[i] - 8));
}
function status(i, f) {                                   // el texto bajo la barra y el color de la lámpara
  if (f < IN0[i] + 20 || f >= FIN[i]) return ["", "j"];
  if (i === 0) return f < D1 ? ["BUILD", "j"] : ["MERGED", "j"];
  if (f >= FIN[i] - 8) return ["DONE", "j"];
  if (f < STOP[i]) return ["BUILD", "j"];
  if (f < SAVE0[i]) return ["HELD", "u"];
  if (f < SAVE0[i] + FLY) return ["SAVING", "O"];
  if (f < RES0[i]) return ["SAVED", "O"];
  if (f < RES0[i] + FLY) return ["RESUME", "j"];
  return ["BUILD", "j"];
}
function stationRows(c, f) {
  for (let i = 0; i < 3; i++) {
    const y0 = ROW_Y[i], k = TIERK[TIER[i]];
    c.rect(2, y0 - 1, 102, 17, "Z");
    if (f < IN0[i] + 20 || f >= FIN[i]) { slotBox(c, i, f); continue; }
    c.text(30, y0 + 3, `U${i + 1}`, "X");
    const [word, lamp] = status(i, f);
    c.rect(39, y0 + 4, 3, 3, lamp === "u" ? "q" : lamp === "O" ? "9" : "Q");              // el estuche de la lámpara
    c.rect(39, y0 + 4, 3, 3, lamp === "u" && two(f) % 4 < 2 ? "d" : lamp);
    const bx = 44, by = y0 + 3, bw = 48, p = prog(i, f), fill = Math.round(p * (bw - 2));
    c.rect(bx, by, bw, 7, "c");
    const running = lamp === "j" && !(i === 0 && f >= D1);
    if (fill > 0) {
      c.rect(bx + 1, by + 1, fill, 5, k[0]);
      c.hline(bx + 1, by + 1, fill, k[1]);
      c.hline(bx + 1, by + 5, fill, k[2]);
      if (running) for (let x = bx + 1; x < bx + 1 + fill; x++) if ((x - Math.floor(f * 0.6)) % 7 === 0) c.px(x, by + 3, "W");
    }
    c.box(bx, by, bw, 7, "F");
    c.text(bx, y0 + 11, word, word === "HELD" ? "u" : word === "SAVING" || word === "SAVED" ? "O" : word === "BUILD" ? "x" : "j");
    slotBox(c, i, f);
  }
}
// la casilla de la rama de cada unidad: vacía, con el disquete guardado o con la palomita de fundida
function slotBox(c, i, f) {
  const x = 94, y = ROW_Y[i] + 3;
  const merged = i === 0 && f >= D1 + FLY && f < FIN[0];
  const saved = i > 0 && f >= SAVE0[i] + FLY && f < RES0[i] && f < FIN[i];
  c.rect(x, y, 10, 10, merged ? "Q" : saved ? "2" : "c");
  c.box(x, y, 10, 10, merged ? "j" : saved ? "w" : "F");
  if (!merged && !saved) { for (let k = 2; k < 8; k += 2) { c.px(x + k, y, "c"); c.px(x + k, y + 9, "c"); } }   // casilla vacía, punteada
  if (merged) paintGrid(c, PROPS.check, x + 1, y + 2, { y: "j" });
  if (saved) mini(c, x + 2, y + 2, "C", TIERK[TIER[i]][0]);
}
function mini(c, x, y, body, label) {                     // un disquete de 5 x 5
  c.rect(x, y, 5, 5, body); c.rect(x + 1, y, 3, 2, "g"); c.px(x + 3, y, "c"); c.rect(x + 1, y + 3, 3, 2, label);
}
function flight(c, f, t0, from, to, tier, arc) {          // un disquete en vuelo, con su estela
  if (f < t0 || f >= t0 + FLY) return;
  const at = (g) => {
    const u = seg(g, t0, t0 + FLY), e = ease(u);
    return [Math.round(lerp(from[0], to[0], e)), Math.round(lerp(from[1], to[1], e) - Math.sin(u * Math.PI) * arc)];
  };
  for (let k = 3; k >= 1; k--) { const [tx, ty] = at(f - k * 2); if (f - k * 2 >= t0 && inside(tx + 2, ty + 2)) c.px(tx + 2, ty + 2, k === 1 ? "w" : "2"); }
  const [x, y] = at(f);
  mini(c, x, y, "C", TIERK[tier][0]);
}

// ------------------------------------------------------------------ personajes
function eyesAt(c, pose, x, y, style, body) {
  for (const [ex, ey] of eyesOf(pose, x, y, 1, false)) {
    if (style === "blink") c.rect(ex, ey + 1, 2, 1, "c");
    else if (style === "happy") { c.rect(ex, ey, 2, 1, "c"); c.px(ex, ey + 1, "c"); c.px(ex + 1, ey + 1, body); }
    else if (style === "wide") c.rect(ex, ey - 1, 2, 3, "c");
    else if (style !== "none") c.rect(ex, ey, 2, 2, "c");
  }
}
const blinkAt = (f, i) => (f + i * 23) % 71 < 4;
function zzz(c, x, y, f, key = "w") {                     // las Z suben en diagonal desde (x, y)
  for (let k = 0; k < 2; k++) {
    const t = (f * 0.6 + k * 14) % 28;
    if (t > 22) continue;
    c.text(x + Math.round(t * 0.3) + k * 2, y - Math.round(t * 0.28), "Z", t > 16 ? "X" : key);
  }
}
function crab(c, i, f) {
  const IN = IN0[i];
  if (f < IN || f >= FIN[i] + 10) return;
  const k = TIERK[TIER[i]], y0 = ROW_Y[i];
  if (f >= FIN[i]) {                                      // termina y se deshace en chispas
    const t = f - FIN[i];
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * TAU + 0.4, r = 3 + t * 1.6, x = Math.round(16 + Math.cos(ang) * r), y = Math.round(y0 + 9 + Math.sin(ang) * r * 0.8);
      if (inside(x, y)) { c.px(x, y, t < 5 ? k[1] : k[0]); if (t < 6) c.px(x + 1, y, t < 3 ? "y" : k[1]); }
    }
    return;
  }
  let pose = "idle", eyes = "sq", hop = 0;
  const typing = ["type_l", "type_r"][Math.floor(f / 4) % 2];
  if (f < IN + 10) { pose = "ball"; eyes = "none"; hop = 0; }
  else if (f < IN + 20) { pose = "unfold"; }
  else if (i === 0) {
    if (f < D1 - 2) pose = typing;
    else if (f < D1 + 16) { pose = "idle"; eyes = "happy"; hop = f < D1 + 12 ? -(Math.floor((f - D1 + 2) / 3) % 2) : 0; }
    else eyes = blinkAt(f, i) ? "blink" : "sq";
  } else {
    const stop = STOP[i], wake = RES0[i] - 8;
    if (f < stop) pose = typing;
    else if (f < stop + 8) { pose = "idle"; eyes = "wide"; }
    else if (f < PAUSE0) { pose = "think"; eyes = "sq"; }
    else if (f < wake) { pose = "slump"; eyes = "blink"; }
    else if (f < wake + 8) { pose = "idle"; eyes = "wide"; }
    else if (f < RES0[i] + FLY) { pose = "idle"; eyes = blinkAt(f, i) ? "blink" : "sq"; }
    else pose = typing;
  }
  if (f >= FIN[i] - 8) { pose = "idle"; eyes = "happy"; hop = -(Math.floor(f / 3) % 2); }   // terminó: saltitos de gusto
  const rows = POSES[pose].g.length, w = POSES[pose].g[0].length;
  const x = 4 + ((24 - w) >> 1), y = y0 + 16 - rows + hop;
  drawPose(c, pose, x, y, 1, (px, py, r) => (r < 2 ? k[1] : r >= rows - 4 ? k[2] : k[0]));
  eyesAt(c, pose, x, y, eyes, k[0]);
  if (f >= PAUSE0 && f < RES0[i] - 8 && i > 0) zzz(c, 31, y0 - 3, f);
  if (i > 0 && f >= STOP[i] && f < STOP[i] + 8) c.text(29, y0 - 3 - (two(f) % 2), "!", "u");
}
function lead(c, f) {                                     // Clawd, el Lead
  let pose = "idle", eyes = "sq", hop = 0;
  const type = ["type_l", "type_r"][Math.floor(f / 3) % 2];
  if (f >= CROSS && f < S1) { pose = "surprise"; eyes = "wide"; }
  else if (f >= S1 && f < SAVE0[2] + FLY) { pose = type; }
  else if (f >= PAUSE0 && f < WAKE) { pose = "slump"; eyes = "blink"; }
  else if (f >= WAKE && f < WAKE + 14) { pose = "armsup"; eyes = "happy"; hop = f < WAKE + 8 ? -1 : 0; }
  else if (f >= RES0[1] - 10 && f < RES0[2] + FLY) { pose = type; }
  else if (blinkAt(f, 9)) eyes = "blink";
  const rows = POSES[pose].g.length, w = POSES[pose].g[0].length;
  const x = 4 + ((24 - w) >> 1), y = 82 - rows + hop;
  drawPose(c, pose, x, y, 1, "o");
  eyesAt(c, pose, x, y, eyes, "o");
  if (f >= PAUSE0 && f < WAKE) zzz(c, 28, 64, f);
  if (f >= CROSS && f < S1) c.text(27, y - 4 + (two(f) % 2), "!", "u");
}

// ------------------------------------------------------------------ barra, texto del Lead y escenario
function phase(f) {
  const merged = f >= D1 && f < FIN[0] ? 1 : 0;
  if (f >= FIN[2]) return { hud: ["RUNNING", "j"], a: ["UNITS DONE", "j"], b: ["NEXT UNITS", "X"] };
  if (f >= RES0[1] - 8 && f < FIN[2] && f >= WAKE + 14) return { hud: ["RESUMED", "j"], a: ["RUN RESUMES", "j"], b: ["MERGED NOT REDONE", "X"] };
  if (f >= WAKE) return { hud: ["RESUMED", "j"], a: ["THE LEAD WAKES", "j"], b: ["NEW WINDOW OPEN", "X"] };
  if (f >= RESET0) return { hud: ["WINDOW RESETS", "w"], a: ["5H WINDOW RESETS", "w"], b: ["PLUGIN WAKES LEAD", "X"] };
  if (f >= PAUSE0) return { hud: ["PAUSED", "O"], a: ["PAUSED NOT ENDED", "O"], b: ["WAITS FOR RESET", "X"] };
  if (f >= SAVE0[1]) return { hud: ["BRAKE", "u"], a: ["3 WORK SAVED", "j"], b: ["ON ITS OWN BRANCH", "X"] };
  if (f >= S2) return { hud: ["BRAKE", "u"], a: ["2 RUNNING STOPPED", "u"], b: ["STEP 3 SAVES WORK", "X"] };
  if (f >= S1) return { hud: ["BRAKE", "u"], a: ["1 NO NEW STARTS", "u"], b: ["STEP 2 STOPS WORK", "X"] };
  if (f >= CROSS) return { hud: ["! 95%", two(f) % 4 < 2 ? "u" : "y"], a: ["! 95% OF 5H", "u"], b: ["OWNER IS WARNED", "X"] };
  return { hud: ["RUNNING", "j"], a: ["> WORKING", "x"], b: [`MERGED ${merged}/3`, "X"] };
}
function hud(c, f) {
  c.rect(2, 1, 156, 9, "c"); c.box(2, 1, 156, 9, "F");
  const P = phase(f);
  c.text(5, 3, "> AUTONOMOUS RUN", "x");
  c.text(155 - P.hud[0].length * 4 + 1, 3, P.hud[0], P.hud[1]);
}
function logWindow(c, f) {
  const P = phase(f);
  c.rect(32, 66, 80, 17, "c"); c.box(32, 66, 80, 17, "F");
  c.text(35, 69, P.a[0], P.a[1]);
  c.text(35, 76, P.b[0], P.b[1]);
}
function stage(c) {
  c.rect(0, 0, W, H, "z");
  c.rect(112, 11, 46, 72, "Z");                           // el panel del medidor
  for (let x = 0; x < W; x += 8) { c.rect(x, 87, 5, 1, "3"); c.rect(x + 5, 86, 3, 2, "2"); }   // greca del suelo
  c.rect(0, 83, W, 1, "3"); c.rect(0, 84, W, 2, "2"); c.rect(0, 88, W, 2, "1");
}
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 11; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 11; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = clamp(x - dx, 0, W - 1), sy = clamp(y - dy, 11, H - 1);
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}

// ------------------------------------------------------------------ la animación
anim("brake", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const f = c.frame;
  stage(c);
  stationRows(c, f);
  gauge(c, f);
  clock(c, f);
  for (let i = 0; i < 3; i++) crab(c, i, f);
  lead(c, f);
  // los disquetes: el de la unidad 1 a su casilla al terminar; los de las unidades 2 y 3 a su rama al frenar y de vuelta al reanudar
  flight(c, f, D1 + 2, [28, ROW_Y[0] + 6], [96, ROW_Y[0] + 5], "t", 7);
  for (const i of [1, 2]) {
    flight(c, f, SAVE0[i], [28, ROW_Y[i] + 6], [96, ROW_Y[i] + 5], TIER[i], 7);
    flight(c, f, RES0[i], [96, ROW_Y[i] + 5], [28, ROW_Y[i] + 6], TIER[i], 7);
  }
  logWindow(c, f);
  hud(c, f);
  if (f >= CROSS && f < CROSS + 10) shake(c, [2, -2, 2, -1, 1, -1, 1, 0, -1, 0][f - CROSS], [1, -1, 0, 1, -1, 0, 1, 0, 0, 0][f - CROSS]);
})

sheet("brake_sheet", ["brake"], { pad: 0 })
