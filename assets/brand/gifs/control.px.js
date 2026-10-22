include("kit.px.js")

// ------------------------------------------------------------------ control: "Tú decides lo irreversible"
// Todo fluye solo salvo lo irreversible, que espera tu sí. Un camino de mármol cruza un pórtico (dos columnas
// dóricas y un dintel) cuya clave es la lámpara; los cangrejos subagentes (verde t, azul b, rosa h) traen
// disquetes. Los normales pasan; los marcados PUSH o DEPLOY ponen la lámpara en rojo, cierran la compuerta y
// esperan en una lista. El cursor del dueño pulsa YES en un diálogo de los 90: sube la compuerta para ese
// disquete solo, pasa con una palomita, el cangrejo festeja y la compuerta vuelve a cerrarse para el que
// sigue. Un busto sobre su pedestal vigila a la izquierda (sus ojos se ponen rojos con la lámpara).
// Cielo: nebulosa violeta, planeta con anillos, ruinas lejanas y fragmentos de columna flotando.
// Termina como empieza: el bucle no tiene corte.
// Lienzo de 160 x 90 px (GIF a 960 x 540), 420 cuadros a 30 fps (14 s).
// Las poses van "en dos" (cada dibujo dura 2 cuadros); trayectorias y efectos a 30 fps.
const W = 160, H = 90, N = 420;
pal({ q: "#3d1230", d: "#8a2740" });                      // rojo oscuro para el resplandor de la lámpara (el mármol usa W e 3 l L 2 del kit)

const GY = 66, DX = 112, V = 1.3;                         // línea de los pies, centro de la compuerta, paso
const E1 = 184, E2 = 334;                                  // los dos sí del dueño
const TIERK = { t: ["t", "T", "4"], b: ["b", "B", "5"], h: ["h", "H", "6"] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;
const rows = (pose) => POSES[pose].g.length;

// Poses propias: el cangrejo con la caja en alto (brazos arriba + patas de caminar) y el golpeteo de pie.
POSES.carry_i = { ...POSES.armsup };
POSES.carry_a = { cx: 12, eyes: POSES.armsup.eyes, g: [...POSES.armsup.g.slice(0, 12), ...POSES.walk_a.g.slice(12)] };
POSES.carry_b = { cx: 12, eyes: POSES.armsup.eyes, g: [...POSES.armsup.g.slice(0, 12), ...POSES.walk_b.g.slice(12)] };
POSES.tap = { cx: 12, eyes: POSES.idle.eyes, g: [...POSES.idle.g.slice(0, 12),
  "....oo..oo....oo..oo....", "....oo..oo....oo..oo....", "....oo..oo..............", "....oo..oo.............."] };
const WALKP = ["carry_a", "carry_a", "carry_i", "carry_i", "carry_b", "carry_b", "carry_i", "carry_i"];

// ------------------------------------------------------------------ guion
// Camina de x0 a x1 a paso v y frena en los últimos td cuadros (parada suave).
function walkPath(f, f0, x0, x1, v = V, td = 10) {
  const T = f0 + (x1 - x0 - v * td / 2) / v + td;
  if (f <= f0) return { x: x0, T, speed: 0 };
  if (f >= T) return { x: x1, T, speed: 0 };
  const left = T - f;
  const rem = left > td ? v * left - v * td / 2 : (v * td / 2) * (left / td) ** 2;
  return { x: x1 - rem, T, speed: left > td ? v : v * left / td };
}
const TP = walkPath(0, 36, -16, 75).T;                    // PUSH llega a su sitio, junto a la compuerta
const TD1 = walkPath(0, 96, -16, 20).T;                   // DEPLOY llega atrás
const LD = 232;                                           // DEPLOY recoge su caja y avanza
const TD2 = walkPath(0, LD + 18, 20, 67).T;               // y la deja en primer lugar
const LANDP = TP + 19, LANDD1 = TD1 + 19, LANDD2 = TD2 + 19;
const HOPLAG = 15;                                        // la caja aprobada echa a andar tras el sí

const waitingN = (f) => (f >= LANDP) + (f >= LANDD1) - (f >= E1) - (f >= E2);

// Compuerta: 1 = arriba (abierta), 0 = abajo (cerrada).
function doorOpen(f) {
  const down = (s) => 1 - ((f - s) / 14) ** 2;
  if (f < 50) return 1;
  if (f < 64) return clamp(down(50), 0, 1);
  if (f < E1 + 4) return 0;
  if (f < E1 + 8) return 0.06 * ease((f - (E1 + 4)) / 4);       // suelta el cerrojo
  if (f < E1 + 22) return 0.06 + 0.94 * ease((f - (E1 + 8)) / 14);
  if (f < E1 + 33) return 1;
  if (f < E1 + 47) return clamp(down(E1 + 33), 0, 1);
  if (f < E2 + 4) return 0;
  if (f < E2 + 8) return 0.06 * ease((f - (E2 + 4)) / 4);
  if (f < E2 + 22) return 0.06 + 0.94 * ease((f - (E2 + 8)) / 14);
  return 1;
}
const lampRed = (f) => (f >= 50 && f < E1) || (f >= E1 + 30 && f < E2);
const SHUT = [64, E1 + 47];                                 // cuándo toca el suelo la compuerta

// ------------------------------------------------------------------ cangrejos
function settle(f, T) {                                    // llega, se agacha y deja la caja delante
  const t = f - T;
  return { pose: t < 3 ? "carry_i" : t < 7 ? "squash" : "idle", u: clamp01((t - 5) / 14), t };
}
function waiting(t, off, f) {                              // espera: parpadeo, golpeteo, sudor, "?"
  const k = t + off, s = {};
  s.pose = mod(k, 64) >= 8 && mod(k, 64) < 26 && ((k >> 1) & 1) ? "tap" : "idle";
  s.blink = mod(k, 56) < 3;
  const ph = mod(k, 52);
  s.sweat = ph >= 20 && ph < 34 ? (ph - 20) >> 1 : -1;
  const q = mod(k, 96);
  s.q = q >= 36 && q < 68 ? Math.round(Math.sin(k / 4)) : null;
  s.tapMark = s.pose === "tap";
  return s;
}
function celebrate(e) {                                    // el sí: sorpresa, salto, festejo y bolita
  if (e < 6) return { pose: "idle", dy: 0, eyes: "wide" };
  if (e < 10) return { pose: "squash", dy: 0, eyes: "sq" };
  if (e < 12) return { pose: "surprise", dy: 0, eyes: "wide" };
  if (e < 26) { const u = (e - 12) / 14; return { pose: "armsup", dy: -Math.round(24 * u * (1 - u)), eyes: "happy" }; }
  if (e < 30) return { pose: "squash", dy: 0, eyes: "happy" };
  if (e < 46) return { pose: "armsup", dy: ((e >> 2) & 1) ? -1 : 0, eyes: "happy" };
  if (e < 50) return { pose: "squash", dy: 0, eyes: "happy" };
  if (e < 56) return { pose: "ball", dy: 0, eyes: "sq" };
  return { pose: "ball", dy: 0, eyes: "sq", gone: true };
}
const isCursorNear = (f) => (f >= 150 && f <= E1 + 8) || (f >= 300 && f <= E2 + 8);

function stateA(f) {                                       // el normal: cruza la compuerta abierta
  const fp = f >= 300 ? f - 420 : f;
  const cx = 112 + (fp - 36) * V;
  const pose = WALKP[mod(fp, 8)];
  return { show: cx > -16 && cx < 176, cx, pose, walk: fp, dy: pose === "carry_i" ? 0 : -1, eyes: mod(fp + 20, 60) < 3 ? "blink" : "sq", look: [1, 0] };
}

function stateP(f) {
  const S = { show: f >= 36, cx: 75, pose: "idle", dy: 0, eyes: "sq", look: [0, 0], tier: "b" };
  if (!S.show) return S;
  if (f < TP + 7) {
    const wk = walkPath(f, 36, -16, 75);
    S.cx = wk.x;
    if (f < TP - 10) { S.pose = WALKP[mod(f, 8)]; S.dy = S.pose === "carry_i" ? 0 : -1; S.walk = f; }
    else S.pose = f < TP + 3 ? "carry_i" : "squash";
    if (f >= TP - 4 && f < TP + 4) S.bang = true;           // ve la compuerta cerrada
    S.eyes = f >= TP - 4 && f < TP + 3 ? "wide" : "sq";
    return S;
  }
  S.cx = 75;
  if (f < E1) {
    const w = waiting(f - LANDP, 0, f);
    if (f < LANDP + 2) S.pose = "idle"; else S.pose = w.pose;
    S.eyes = w.blink ? "blink" : "sq";
    if (isCursorNear(f)) S.look = [1, 1];
    if (f >= LANDP + 6) { S.sweat = w.sweat; S.q = w.q; S.tapMark = w.tapMark; }
    return S;
  }
  const ce = celebrate(f - E1);
  S.pose = ce.pose; S.dy = ce.dy; S.eyes = ce.eyes; S.gone = ce.gone;
  S.poof = f - E1 - 56;
  if (f - E1 >= 62) S.show = false;
  return S;
}

function stateD(f) {
  const S = { show: f >= 96, cx: 20, pose: "idle", dy: 0, eyes: "sq", look: [0, 0], tier: "h" };
  if (!S.show) return S;
  if (f < TD1 + 7) {                                       // llega atrás con su caja y la deja
    const wk = walkPath(f, 96, -16, 20);
    S.cx = wk.x;
    if (f < TD1 - 10) { S.pose = WALKP[mod(f, 8)]; S.dy = S.pose === "carry_i" ? 0 : -1; S.walk = f; }
    else S.pose = f < TD1 + 3 ? "carry_i" : "squash";
    return S;
  }
  if (f < LD) {                                            // espera su turno, mirando al cursor
    const w = waiting(f - LANDD1, 23, f);
    S.cx = 20;
    S.pose = f < LANDD1 + 2 ? "idle" : w.pose;
    S.eyes = w.blink ? "blink" : "sq";
    if (isCursorNear(f)) S.look = [1, 1]; else if (f >= E1 && f < E1 + 40) S.look = [1, 0];
    if (f >= LANDD1 + 6) { S.sweat = w.sweat; S.q = w.q; S.tapMark = w.tapMark; }
    return S;
  }
  if (f < LD + 18) {                                       // se agacha y levanta la caja
    S.cx = 20;
    S.pose = f < LD + 4 ? "squash" : "carry_i";
    S.eyes = "sq";
    return S;
  }
  if (f < TD2 + 7) {                                       // avanza con la caja al primer lugar
    const wk = walkPath(f, LD + 18, 20, 67);
    S.cx = wk.x;
    if (f < TD2 - 10) { S.pose = WALKP[mod(f, 8)]; S.dy = S.pose === "carry_i" ? 0 : -1; S.walk = f; }
    else S.pose = f < TD2 + 3 ? "carry_i" : "squash";
    return S;
  }
  S.cx = 67;
  if (f < E2) {
    const w = waiting(f - LANDD2, 11, f);
    S.pose = f < LANDD2 + 2 ? "idle" : w.pose;
    S.eyes = w.blink ? "blink" : "sq";
    if (isCursorNear(f)) S.look = [1, 1];
    if (f >= LANDD2 + 6) { S.sweat = w.sweat; S.q = w.q; S.tapMark = w.tapMark; }
    return S;
  }
  const ce = celebrate(f - E2);
  S.pose = ce.pose; S.dy = ce.dy; S.eyes = ce.eyes; S.gone = ce.gone;
  S.poof = f - E2 - 56;
  if (f - E2 >= 62) S.show = false;
  return S;
}

// ------------------------------------------------------------------ disquetes (antes cajas)
const CRATE_P = { w: 19, h: 13, label: "PUSH", kind: "irr" };
const CRATE_D = { w: 27, h: 13, label: "DEPLOY", kind: "irr" };
const crateTop = (h, pose, dy) => GY - rows(pose) + dy + 2 - h;      // apoyado entre las pinzas

// u = 0 en alto sobre el cangrejo, u = 1 en el suelo, delante de él.
function cratePath(cx, def, u) {
  const p0 = [Math.round(cx - def.w / 2), GY - 16 + 2 - def.h], p2 = [Math.round(cx + 14), GY - def.h];
  return bez(p0, [(p0[0] + p2[0]) / 2, p0[1] - 8], p2, ease(u));
}
// El disquete aprobado: se agacha un instante, salta de a poco hacia la derecha y cruza la compuerta.
function crateHop(f, E, left0, def) {
  const t = f - (E + HOPLAG);
  if (t < -3) return null;
  const r = { sq: 0, dust: -1 };
  if (t < 0) { r.x = left0; r.y = GY - def.h; r.sq = 1; return r; }
  const d = t < 6 ? t * t / 12 : t - 3;
  r.x = Math.round(left0 + 1.8 * d);
  const ph = mod(t, 12) / 12;
  r.y = GY - def.h - Math.round(16 * ph * (1 - ph));
  if (t >= 12 && ph < 0.17) { r.sq = 1; r.y = GY - def.h; }
  if (t >= 12 && ph < 0.34) r.dust = Math.round(ph * 12);
  r.t = t;
  return r;
}

function cratesAt(f, A, P, D) {
  const out = [];
  if (A.show) out.push({ x: Math.round(A.cx - 6.5), y: crateTop(13, A.pose, A.dy), w: 13, h: 13, kind: "ok", tier: "t" });
  // PUSH
  if (P.show || f >= E1) {
    const def = CRATE_P;
    if (f < TP + 5) out.push({ ...def, x: Math.round(P.cx - def.w / 2), y: crateTop(def.h, P.pose, P.dy) });
    else if (f < LANDP) { const [x, y] = cratePath(75, def, (f - TP - 5) / 14); out.push({ ...def, x, y }); }
    else if (f < E1 + HOPLAG - 3) {
      const sq = f < LANDP + 2 ? 1 : 0;
      out.push({ ...def, x: 89 - sq, y: GY - def.h + sq, w: def.w + 2 * sq, h: def.h - sq });
    } else {
      const h = crateHop(f, E1, 89, def);
      if (h && h.x < W) out.push({ ...def, x: h.x - h.sq, y: h.y + h.sq, w: def.w + 2 * h.sq, h: def.h - h.sq, hop: h });
    }
  }
  // DEPLOY
  if (f >= 96) {
    const def = CRATE_D;
    if (f < TD1 + 5) out.push({ ...def, x: Math.round(D.cx - def.w / 2), y: crateTop(def.h, D.pose, D.dy) });
    else if (f < LANDD1) { const [x, y] = cratePath(20, def, (f - TD1 - 5) / 14); out.push({ ...def, x, y }); }
    else if (f < LD + 4) {
      const sq = f < LANDD1 + 2 ? 1 : 0;
      out.push({ ...def, x: 34 - sq, y: GY - def.h + sq, w: def.w + 2 * sq, h: def.h - sq });
    } else if (f < LD + 18) { const [x, y] = cratePath(20, def, 1 - (f - LD - 4) / 14); out.push({ ...def, x, y }); }
    else if (f < TD2 + 5) out.push({ ...def, x: Math.round(D.cx - def.w / 2), y: crateTop(def.h, D.pose, D.dy) });
    else if (f < LANDD2) { const [x, y] = cratePath(67, def, (f - TD2 - 5) / 14); out.push({ ...def, x, y }); }
    else if (f < E2 + HOPLAG - 3) {
      const sq = f < LANDD2 + 2 ? 1 : 0;
      out.push({ ...def, x: 81 - sq, y: GY - def.h + sq, w: def.w + 2 * sq, h: def.h - sq });
    } else {
      const h = crateHop(f, E2, 81, def);
      if (h && h.x < W) out.push({ ...def, x: h.x - h.sq, y: h.y + h.sq, w: def.w + 2 * h.sq, h: def.h - h.sq, hop: h });
    }
  }
  return out;
}

// Un disquete de 3,5": cuerpo lavanda, postigo metálico arriba, etiqueta blanca abajo. El normal lleva la marca
// del nivel; el irreversible, la lengüeta roja de "protegido", una franja de aviso y su palabra.
function drawCrate(c, cr) {
  const { x, y, w, h } = cr;
  c.rect(x, y, w, h, "3");
  c.hline(x, y, w, "e"); c.vline(x, y, h, "e");
  c.vline(x + w - 1, y, h, "L"); c.hline(x, y + h - 1, w, "L");
  c.px(x + w - 1, y, "2");                                 // la esquina cortada
  const ty = y + h - 6;                                    // etiqueta: de ty - 2 a la penúltima fila
  c.rect(x + 1, ty - 2, w - 2, h - 4 - (ty - 2 - y) + 1, "y");
  if (cr.kind === "ok") {
    c.rect(x + 2, ty - 1, 3, 3, TIERK[cr.tier][0]); c.px(x + 2, ty - 1, TIERK[cr.tier][1]);
    c.hline(x + 6, ty - 1, w - 9, "G"); c.hline(x + 6, ty + 1, w - 11, "G");
    c.hline(x + 2, ty + 4, w - 5, "G");
  } else {
    for (let xx = 1; xx < w - 1; xx++) c.px(x + xx, ty - 2, (xx >> 1) & 1 ? "u" : "y");     // franja de aviso
    c.text(x + 2, ty, cr.label, "c");
    c.rect(x + 2, y + 1, 2, 2, "u");                       // lengüeta roja
  }
  const sx = x + ((w - 7) >> 1) + 1;                       // postigo metálico
  c.rect(sx, y + 1, 7, 4, "G"); c.hline(sx, y + 1, 7, "g"); c.hline(sx, y + 4, 7, "U"); c.rect(sx + 4, y + 1, 2, 3, "c"); c.px(sx + 1, y + 2, "g");
}

// ------------------------------------------------------------------ dibujo de personajes y efectos
function eyesAt(c, pose, x, y, flip, style, look, body) {
  const [dx, dy] = look || [0, 0];
  for (const [ex, ey] of eyesOf(pose, x, y, 1, flip)) {
    if (style === "blink") c.rect(ex + dx, ey + 1, 2, 1, "c");
    else if (style === "happy") { c.rect(ex, ey, 2, 1, "c"); c.px(ex, ey + 1, "c"); c.px(ex + 1, ey + 1, body); }   // el rincón vuelve al color del cuerpo: "_" dejaría un agujero transparente
    else if (style === "wide") c.rect(ex + dx, ey - 1 + dy, 2, 3, "c");
    else c.rect(ex + dx, ey + dy, 2, 2, "c");
  }
}
function drawCrab(c, S) {
  const k = TIERK[S.tier || "t"];
  const [x, y] = place(S.pose, false, S.cx, GY + S.dy, 1);
  c.ellipse(Math.round(S.cx), GY, clamp(10 + Math.round(S.dy / 2), 5, 10), 1, "K");          // sombra
  drawPose(c, S.pose, x, y, 1, (px, py, r) => (r < 2 ? k[1] : r >= rows(S.pose) - 4 ? k[2] : k[0]));
  eyesAt(c, S.pose, x, y, false, S.eyes, S.look, k[0]);
  return [x, y];
}
function sparkle(c, x, y, size, col = "y", arm = "l") {
  if (size <= 0) return;
  if (inside(x, y)) c.px(x, y, col);
  for (let k = 1; k < size; k++)
    for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) if (inside(x + dx, y + dy)) c.px(x + dx, y + dy, arm);
}
function poof(c, cx, cy, t, k) {                           // el cangrejo termina y se deshace en chispas
  if (t < 0 || t > 10) return;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.4, r = 3 + t * 1.8;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.8);
    if (inside(x, y)) { c.px(x, y, t < 5 ? k[1] : k[0]); if (t < 6) { c.px(x + 1, y, t < 3 ? "y" : k[1]); c.px(x, y + 1, k[0]); } }
  }
  sparkle(c, Math.round(cx), Math.round(cy), t < 6 ? [4, 4, 3, 3, 2, 1][t] : 0);
}
function dust(c, x, y, t, dir) {                           // polvo al aterrizar o al cerrarse la compuerta
  if (t < 0 || t > 6) return;
  for (let i = 0; i < 3; i++) {
    const px = Math.round(x + dir * (1 + t * 0.9 + i)), py = Math.round(y - t * 0.5 - i * 0.6 + 0.12 * t * t);
    if (inside(px, py)) c.px(px, py, t < 3 ? "0" : "9");
  }
}
const DROP = [".7.", "777", "7y7", "777", ".7."];
function overlays(c, f, S, x, y) {
  const top = y;
  if (S.bang) c.text(Math.round(S.cx) + 13, top - 8 + (two(f) % 2), "!", "u");
  if (S.q !== undefined && S.q !== null) c.text(Math.round(S.cx) - 1, top - 8 + S.q, "?", "O");
  if (S.sweat !== undefined && S.sweat >= 0) paintGrid(c, DROP, Math.round(S.cx) + 10, top - 1 + S.sweat);
  if (S.tapMark) { const fx = Math.round(S.cx) + 9; c.px(fx + 3, GY - 3, "9"); c.px(fx + 4, GY - 1, "9"); c.px(fx + 5, GY - 3, "9"); }
}

// ------------------------------------------------------------------ escenario: cielo de nebulosa, ruinas, mármol
const HZ = GY - 5;                                         // el horizonte: donde empieza la losa del suelo
const LAMP = [112, 29];                                    // la lámpara es la clave del dintel
const SKYK = ["z", "n", "N", "m", "M", "v"];               // niveles de la nebulosa, de oscuro a claro
const BG = (() => {
  const bg = new Array(W * H).fill("z"), open = new Array(W * H).fill(false);
  const set = (x, y, k, solid) => { if (x >= 0 && x < W && y >= 14 && y < H) { bg[y * W + x] = k; if (solid) open[y * W + x] = false; } };
  // nebulosa: una banda diagonal de ruido, tramada con Bayer; más oscura abajo para que la acción se lea
  for (let y = 14; y < HZ; y++)
    for (let x = 0; x < W; x++) {
      const band = Math.exp(-(((y - (33 + 0.1 * (x - 80))) / 15) ** 2));
      const n = 0.6 * vnoise(x, y, 26) + 0.4 * vnoise(x + 50, y + 20, 9);
      let L = clamp01((n * 1.3 - 0.2) * band * 1.3) * 5.4;
      if (y > 42) L = Math.min(L, 2.2);
      let idx = Math.floor(L);
      if (bay(x, y) < L - idx) idx++;
      let k = SKYK[Math.min(idx, 5)];
      if (idx === 0 && bay(x, y) < clamp01((y - 40) / 20) * 0.75) k = "n";             // bruma violeta en el horizonte
      bg[y * W + x] = k; open[y * W + x] = true;
    }
  // planeta con anillos: la mitad de atrás del anillo, la esfera y la mitad de delante
  const PCX = 60, PCY = 31, PR = 9;
  const ring = (front) => {
    for (const [sc, col] of [[1, "V"], [0.8, "v"]])
      for (let i = 0; i < 360; i++) {
        const a = (i / 360) * TAU, s = Math.sin(a);
        if ((s > 0) !== front) continue;
        const x = Math.round(PCX + Math.cos(a) * 17 * sc + s * 0.5 * 4 * sc), y = Math.round(PCY + s * 4.2 * sc - Math.cos(a) * 0.1);
        set(x, y, col, true);
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
      set(x, y, PL[Math.min(i, 4)], true);
    }
  ring(true);
  // ruinas lejanas: siluetas oscuras con el borde iluminado por la nebulosa
  const dark = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, "J", true); };
  const rim = (x0, y0, w) => { for (let x = x0; x < x0 + w; x++) set(x, y0, "2", true); };
  const rnd = seeded(31);
  dark(20, 58, 82, 3); rim(20, 58, 82);                    // escalones
  dark(24, 44, 22, 2); rim(24, 44, 22);                    // arquitrabe de la parte entera
  for (const [x, top] of [[25, 46], [32, 46], [39, 46], [47, 50], [55, 53], [78, 55], [85, 51], [92, 54]]) {
    dark(x, top, 3, 58 - top);
    for (let y = top; y < 58; y++) set(x, y, "1", true);   // luz por la izquierda
    set(x, top, "2", true); set(x + 1, top, "2", true);
    if (top > 47) { set(x + 2, top, "z", true); if (rnd() < 0.7) set(x + 1, top + 1, "J", true); }
  }
  // un templo al otro lado, con frontón, medio hundido en la bruma
  dark(128, 56, 32, 5); rim(128, 56, 32);
  dark(130, 52, 30, 4); rim(130, 52, 30);
  for (let y = 31; y < 38; y++) { const half = (y - 31) * 3 + 2; dark(145 - half, y, half * 2, 1); set(145 - half, y, "2", true); set(144 + half, y, "2", true); }
  dark(129, 38, 31, 3); rim(129, 38, 31);
  for (const x of [131, 139, 147, 155]) { dark(x, 41, 3, 15); for (let y = 41; y < 56; y++) set(x, y, "1", true); }
  return { bg, open };
})();
const STARS = (() => {
  const r = seeded(77), out = [];
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * W), y = 15 + Math.floor(r() * 38);
    if (BG.open[y * W + x]) out.push([x, y, r() < 0.12 ? 3 : r() < 0.5 ? 2 : 1, [60, 84, 105][i % 3], Math.floor(r() * 105)]);
  }
  return out;
})();
const STARC = [null, "G", "3", "W"];
const CONST = [[119, 18], [127, 23], [136, 19], [144, 27], [153, 22]];            // una constelación, con su línea punteada

// Fragmentos de columna que flotan: un tambor, un capitel y un trozo de fuste torcido (suben y bajan un píxel).
const FRAGS = [
  { x: 27, y: 21, per: 140, ph: 0.0, draw: (c, x, y) => { c.rect(x, y, 9, 6, "e"); for (let i = 1; i < 9; i += 2) c.vline(x + i, y + 1, 5, "l"); c.hline(x, y, 9, "W"); c.hline(x, y + 5, 9, "L"); c.px(x, y, "z"); c.px(x + 8, y + 5, "z"); c.vline(x + 8, y, 5, "3"); } },
  { x: 83, y: 19, per: 210, ph: 1.9, draw: (c, x, y) => { c.rect(x, y, 11, 2, "W"); c.hline(x, y + 1, 11, "3"); c.rect(x + 2, y + 2, 7, 2, "e"); c.rect(x + 3, y + 4, 5, 1, "l"); c.hline(x + 3, y + 2, 5, "3"); c.px(x + 10, y, "z"); } },
  { x: 141, y: 21, per: 105, ph: 3.6, draw: (c, x, y) => { c.line(x, y + 8, x + 9, y, "e", 3); c.line(x - 1, y + 8, x + 8, y, "W", 1); c.line(x + 2, y + 8, x + 11, y, "L", 1); c.px(x + 5, y + 4, "z"); } },
];

function sky(c, f) {
  for (let y = 14; y < GY + 4; y++) for (let x = 0; x < W; x++) c.px(x, y, BG.bg[y * W + x]);
  for (const [x, y, lv, per, ph] of STARS) c.px(x, y, STARC[Math.min(3, lv + (mod(f + ph, per) < 5 ? 1 : 0))]);
  for (let i = 0; i < CONST.length; i++) {                 // la línea de la constelación y sus estrellas
    const [x, y] = CONST[i];
    if (i > 0) {
      const [px, py] = CONST[i - 1], n = Math.max(Math.abs(x - px), Math.abs(y - py));
      for (let k = 1; k < n; k += 2) c.px(Math.round(px + ((x - px) * k) / n), Math.round(py + ((y - py) * k) / n), "m");
    }
    c.px(x, y, i === 3 && mod(f, 70) < 6 ? "W" : "3");
    if (i === 3 && mod(f, 70) < 6) sparkle(c, x, y, 2, "W", "3");
  }
  for (const fr of FRAGS) {
    const a = (f / fr.per) * TAU + fr.ph;
    fr.draw(c, fr.x + Math.round(0.9 * Math.sin(a * 0.5 + 1)), fr.y + Math.round(1.4 * Math.sin(a)));
  }
}
function glow(c, f, red) {                                 // la lámpara tiñe el cielo y el suelo
  const [cx, cy] = LAMP, R = 15;
  const base = red ? 0.5 + 0.2 * (mod(f, 12) < 6 ? 1 : 0) : 0.4;
  for (let y = cy - R; y <= cy + R; y++)
    for (let x = cx - R; x <= cx + R; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.1);
      if (d >= R || !inside(x, y) || y < 14 || y >= HZ) continue;
      const k = (1 - d / R) * base * 1.6;
      if (bay(x, y) < k) c.px(x, y, red ? (k > 0.45 ? "d" : "q") : (k > 0.45 ? "4" : "Q"));
    }
  for (let y = HZ; y < GY; y++)                            // charco de luz en la losa, junto a la compuerta
    for (let x = DX - 18; x < DX + 18; x++) if (bay(x, y) < (1 - Math.abs(x - DX) / 18) * 0.6) c.px(x, y, red ? "q" : "Q");
}

// El pórtico: dos columnas dóricas acanaladas, dintel con triglifos, frontón y, de clave, la lámpara.
const COLS = [100, 118];
function portico(c, f, red) {
  // frontón y cornisa
  for (let y = 18; y < 24; y++) {
    const half = 3 + (y - 18) * 3;
    c.hline(112 - half, y, half * 2, "e"); c.px(112 - half, y, "W"); c.px(111 + half, y, "3");
  }
  for (let y = 21; y < 23; y++) c.hline(112 - 6 - (y - 21) * 3, y, 12 + (y - 21) * 6, "3");        // el tímpano, en sombra
  c.rect(94, 23, 36, 2, "W"); c.hline(94, 24, 36, "e"); c.hline(94, 25, 36, "L");
  c.rect(94, 26, 36, 8, "e"); c.hline(94, 26, 36, "3");
  for (const tx of [97, 103, 119, 125]) { c.rect(tx, 27, 3, 4, "l"); c.vline(tx + 1, 27, 4, "L"); }
  c.hline(94, 31, 36, "W"); c.hline(94, 33, 36, "l");
  c.vline(94, 26, 8, "W"); c.vline(129, 26, 8, "3");
  // la clave: un trapecio con la lámpara adentro
  const wo = [12, 12, 10, 10, 8, 8, 8, 8], wi = [0, 10, 8, 8, 6, 6, 6, 0];
  const on = red ? (mod(f, 12) < 8 ? "u" : "d") : "j", edge = red ? "d" : "4";
  for (let r = 0; r < 8; r++) {
    c.hline(112 - wo[r] / 2, 26 + r, wo[r], r === 0 ? "W" : "3");
    if (wi[r]) c.hline(112 - wi[r] / 2, 26 + r, wi[r], r === 6 ? edge : on);
  }
  c.hline(106, 33, 12, "L");
  c.px(108, 27, "y"); if (!red || mod(f, 12) < 8) c.px(109, 27, "y");
  for (const sx of COLS) {
    c.rect(sx - 1, 34, 8, 2, "W"); c.hline(sx - 1, 35, 8, "e"); c.hline(sx, 36, 6, "3");       // ábaco y equino
    for (let i = 0; i < 6; i++) c.vline(sx + i, 37, 24, i === 0 ? "W" : i === 5 ? "L" : i % 2 ? "l" : "e");
    for (let i = 0; i < 6; i++) { c.px(sx + i, 37, "3"); c.px(sx + i, 38, "3"); }
    c.rect(sx - 1, 61, 8, 2, "e"); c.hline(sx - 1, 62, 8, "3"); c.px(sx - 1, 61, "W");        // basa
    c.hline(sx, 60, 6, "L");
  }
  c.rect(109, 34, 6, 2, "z");                              // la ranura por donde baja la hoja
  // el resplandor de la lámpara tiñe el mármol cercano
  const [lx, ly] = LAMP, tint = red ? { W: "P", e: "V", 3: "V", l: "6", L: "6" } : { W: "T", e: "T", 3: "j", l: "4", L: "4" };
  for (let y = ly - 14; y <= ly + 14; y++)
    for (let x = lx - 18; x <= lx + 18; x++) {
      if (!inside(x, y) || y >= 61) continue;
      const d = Math.hypot((x - lx) / 1.3, y - ly);
      if (d >= 13 || (x >= 106 && x < 118 && y >= 26 && y < 34)) continue;
      if (bay(x, y) < (1 - d / 13) * (red ? 0.8 : 0.22))
        for (const k of "WeL3l") if (c.is(x, y, k)) { c.px(x, y, tint[k]); break; }
    }
}
function alarm(c, f) {                                     // pulso de la lámpara al ponerse roja o verde
  for (const [t0, hot, cool] of [[50, "u", "d"], [E1, "j", "4"], [E1 + 30, "u", "d"], [E2, "j", "4"]]) {
    const t = f - t0;
    if (t < 0 || t > 9) continue;
    const rx = 5 + t * 1.6;
    for (let k = 0, n = Math.ceil(rx * 5); k < n; k++) {
      const a = (k / n) * TAU, x = Math.round(LAMP[0] + Math.cos(a) * rx), y = Math.round(LAMP[1] + Math.sin(a) * rx * 0.55);
      if (inside(x, y) && y >= 14 && !(x >= 94 && x < 130 && y >= 18 && y < 34) && bay(x, y) < 0.8 - t * 0.06) c.px(x, y, t < 4 ? hot : cool);
    }
  }
}
function gateDoor(c, f) {                                  // la hoja a rayas rojas, entre las columnas
  const o = doorOpen(f);
  let bot = 34 + Math.round((GY - 34) * (1 - o));
  if (f >= SHUT[0] && f < SHUT[0] + 2 || f >= SHUT[1] && f < SHUT[1] + 2) bot -= 1;              // rebote al tocar
  for (let y = 34; y < bot; y++)
    for (let x = DX - 2; x < DX + 2; x++) c.px(x, y, ((x + y) >> 1) & 1 ? "u" : "c");
  if (bot > 34) { c.hline(DX - 2, bot - 1, 4, "y"); c.vline(DX - 2, 34, bot - 34, "d"); }
}
// El busto sobre su pedestal vigila; sus ojos se ponen rojos con la lámpara y verdes con el sí.
const BUST = { x: 1, y: 26 };
function bust(c, f, red) {
  const { x, y } = BUST;
  // pedestal: losa, fuste acanalado y basa
  c.rect(x, y + 19, 14, 2, "W"); c.hline(x, y + 20, 14, "e"); c.vline(x + 13, y + 19, 2, "3");
  c.rect(x + 2, y + 21, 10, 16, "e");
  for (const i of [3, 6, 9]) c.vline(x + i, y + 21, 16, "l");
  c.vline(x + 2, y + 21, 16, "W"); c.vline(x + 11, y + 21, 16, "3");
  c.hline(x + 2, y + 21, 10, "L");
  c.rect(x, y + 37, 14, 2, "e"); c.hline(x, y + 37, 14, "W"); c.hline(x, y + 38, 14, "3");
  // pecho con la toga, cuello y cabeza
  c.poly([x, y + 19, x + 2, y + 14, x + 5, y + 12, x + 9, y + 12, x + 12, y + 14, x + 14, y + 19], "e");
  c.poly([x, y + 19, x + 2, y + 14, x + 4, y + 13, x + 5, y + 19], "W");
  c.poly([x + 10, y + 13, x + 12, y + 14, x + 14, y + 19, x + 11, y + 19], "3");
  c.line(x + 3, y + 18, x + 8, y + 14, "l", 1); c.line(x + 6, y + 18, x + 10, y + 15, "l", 1);
  c.rect(x + 5, y + 10, 4, 3, "e"); c.vline(x + 8, y + 10, 3, "3"); c.hline(x + 5, y + 12, 4, "l");
  c.ellipse(x + 7, y + 5, 4, 5, "W");
  c.vline(x + 10, y + 3, 5, "e"); c.vline(x + 11, y + 4, 3, "3");                  // el lado en sombra
  for (let i = 0; i < 8; i++) c.px(x + 3 + i, y + (i % 2 ? 0 : 1), i % 2 ? "L" : "l");               // rizos
  c.rect(x + 3, y + 1, 9, 2, "l"); c.hline(x + 4, y, 7, "L"); c.px(x + 3, y + 3, "l"); c.px(x + 11, y + 3, "L");
  c.hline(x + 4, y + 4, 2, "L"); c.hline(x + 8, y + 4, 2, "L");                    // cejas
  c.vline(x + 7, y + 5, 3, "3"); c.px(x + 7, y + 8, "l");                          // nariz
  c.hline(x + 6, y + 9, 3, "l");                                                  // boca
  const approved = (f >= E1 && f < E1 + 26) || (f >= E2 && f < E2 + 26);
  const eye = approved ? "j" : red ? (mod(f, 12) < 8 ? "u" : "d") : "2";
  c.rect(x + 4, y + 5, 2, 1, eye); c.rect(x + 8, y + 5, 2, 1, eye);
}
// La losa de mármol del suelo y su friso de grecas; las gemas incrustadas en la greca marcan el flujo.
(() => {
  const bg = BG.bg;
  for (let y = HZ; y < GY; y++)
    for (let x = 0; x < W; x++) {
      let k = "N";
      if (bay(x, y) < ((y - HZ) / 5) * 0.55) k = "2";
      if (y === HZ) k = "m";
      else if (y === HZ + 2 && x % 2 === 0) k = "2";
      else if (mod(x - (y < HZ + 3 ? 0 : 12), 24) === 0) k = "m";
      bg[y * W + x] = k;
    }
  for (let x = 0; x < W; x++) {
    bg[GY * W + x] = "W";                                  // el canto del estilóbato
    for (let r = 0; r < 3; r++) {
      const u = x & 7, line = ["XXXXXXX.", "X.....X.", "X.XXX.XX"][r][u] === "X";
      bg[(GY + 1 + r) * W + x] = line ? "l" : "1";
    }
  }
})();
function gems(c, f, red) {                                 // gemas en la greca: corren cuando todo fluye
  const cf = Math.floor(f / 3);
  for (let k = 0, x = 3; x < W; k++, x += 8) {
    const lit = mod(k - cf, 4);
    let col = "9";
    if (x < DX - 4) col = red ? (mod(f, 12) < 6 ? "d" : "q") : lit === 0 ? "j" : lit === 1 ? "4" : "9";
    else if (x > DX + 4) col = red ? "9" : lit === 0 ? "j" : lit === 1 ? "4" : "9";
    else col = red ? "u" : "j";
    c.rect(x, GY + 2, 2, 1, col);
  }
}

// ------------------------------------------------------------------ ventana de diálogo de los 90: título, lista y botón
const CHIPS = [
  { label: "PUSH", add: LANDP, rem: E1 },
  { label: "DEPLOY", add: LANDD1, rem: E2 },
];
const BTN = { x: 120, y: 79, w: 32, h: 9 };
function mini(c, x, y, body, label) {                      // un disquete de 5 x 5
  c.rect(x, y, 5, 5, body); c.rect(x + 1, y, 3, 2, "g"); c.px(x + 3, y, "c"); c.rect(x + 1, y + 3, 3, 2, label);
}
function bar(c, f) {
  const n = waitingN(f), flashAt = (E) => f >= E && f < E + 4;
  const pulse = two(f) % 8 < 5;
  // marco y barra de título con sus tres cajitas
  c.rect(4, 70, 152, 20, "g");
  c.hline(4, 70, 152, "y"); c.vline(4, 70, 20, "y"); c.hline(4, 89, 152, "E"); c.vline(155, 70, 20, "E");
  const fl = flashAt(E1) || flashAt(E2);
  c.rect(5, 71, 150, 7, fl ? "y" : n > 0 ? (pulse ? "L" : "2") : "D");
  mini(c, 7, 72, "3", "y");
  c.text(15, 72, "WAITING FOR YOUR YES", fl ? "c" : n > 0 ? "y" : "g");
  for (const [bx, kind] of [[136, 0], [142, 1], [148, 2]]) {
    c.rect(bx, 72, 5, 5, "g"); c.hline(bx, 72, 5, "y"); c.vline(bx, 72, 5, "y"); c.hline(bx, 76, 5, "E"); c.vline(bx + 4, 72, 5, "E");
    if (kind === 0) c.hline(bx + 1, 75, 3, "c");
    else if (kind === 1) c.box(bx + 1, 73, 3, 3, "c");
    else for (const [dx, dy] of [[1, 73], [3, 73], [2, 74], [1, 75], [3, 75]]) c.px(bx + dx, dy, "c");
  }
  // la lista, hundida y blanca
  c.rect(6, 79, 112, 9, "W"); c.hline(6, 79, 112, "G"); c.vline(6, 79, 9, "G"); c.hline(6, 87, 112, "y"); c.vline(117, 79, 9, "y");
  c.hline(7, 80, 110, "E"); c.vline(7, 80, 7, "E");
  let x = 10;
  for (const ch of CHIPS) {
    const pres = clamp01((f - ch.add) / 4) * (1 - ease((f - (ch.rem + 10)) / 8));
    if (pres <= 0) continue;
    const approved = f >= ch.rem, newly = f - ch.add < 4;
    const keep = f < ch.add + 4 ? Math.round(ch.label.length * clamp01((f - ch.add + 1) / 4)) : Math.round(ch.label.length * pres);
    mini(c, x, 81, approved ? "4" : "L", approved ? "T" : "y");
    if (keep > 0) c.text(x + 7, 81, ch.label.slice(0, keep), approved ? "4" : newly ? "u" : "c");
    x += 13 + keep * 4;
  }
  // el botón YES, al estilo OK
  let { x: bx, y: by, w: bw, h: bh } = BTN;
  const down = (E) => f >= E - 4 && f < E, hit = (E) => f >= E && f < E + 4, str = (E) => f >= E + 4 && f < E + 8;
  const E = f < 250 ? E1 : E2;
  const hover = f >= E - 12 && f < E && (E === E1 ? f >= 172 : f >= 322);
  const enabled = n > 0 || hit(E) || str(E);
  if (n > 0 && !hover && !down(E)) {                       // aura violeta para llamar al dueño
    for (let y = by - 2; y < by + bh + 2; y++)
      for (let xx = bx - 2; xx < bx + bw + 2; xx++) {
        if (xx >= bx && xx < bx + bw && y >= by && y < by + bh) continue;
        if (y < 78 || y > 88) continue;
        if (bay(xx, y) < (pulse ? 0.5 : 0.22)) c.px(xx, y, "L");
      }
  }
  const pressed = down(E) || hit(E);
  const face = hit(E) ? "y" : pressed ? "G" : hover ? "e" : "g";
  c.rect(bx, by, bw, bh, face);
  const [tl, br, itl, ibr] = pressed ? ["E", "y", "G", "g"] : ["y", "E", "W", "G"];
  c.hline(bx, by, bw, tl); c.vline(bx, by, bh, tl); c.hline(bx, by + bh - 1, bw, br); c.vline(bx + bw - 1, by, bh, br);
  c.hline(bx + 1, by + 1, bw - 2, itl); c.vline(bx + 1, by + 1, bh - 2, itl); c.hline(bx + 1, by + bh - 2, bw - 2, ibr); c.vline(bx + bw - 2, by + 1, bh - 2, ibr);
  const o = pressed ? 1 : 0;
  c.text(bx + 10 + o, by + 2 + o, "YES", !enabled ? "D" : hit(E) ? "L" : "c");
  if (!enabled) c.text(bx + 11, by + 3, "YES", "y");        // texto inactivo: relieve blanco
  if (!enabled) c.text(bx + 10, by + 2, "YES", "D");
}

function hudBar(c, f) {
  const n = waitingN(f), pulse = two(f) % 8 < 5;
  c.rect(4, 3, 152, 11, "c"); c.box(4, 3, 152, 11, "F");
  const approved = (f >= E1 && f < E1 + 26) || (f >= E2 && f < E2 + 26);
  c.text(7, 6, "> GUARD", approved ? "j" : n > 0 ? (pulse ? "w" : "x") : "x");
  const right = `${n} WAITING`;
  const bump = [LANDP, LANDD1, E1, E2].some((t) => f >= t && f < t + 4);
  c.text(155 - right.length * 4, 6, right, bump ? "y" : n > 0 ? (pulse ? "w" : "x") : "X");
}

// ------------------------------------------------------------------ cursor (la flecha del ratón)
const CUR = {
  1: { s: 146, e: E1, hit: 4 }, 2: { s: 296, e: E2, hit: 2 },
};
const TIP = [141, 82];
function cursorAt(f) {
  for (const k of [1, 2]) {
    const { s, e } = CUR[k];
    if (f < s || f >= e + 34) continue;
    if (f < s + 26) { const u = ease((f - s) / 26); const [x, y] = bez([178, 30], [166, 72], TIP, u); return { x, y, glide: u > 0 && u < 0.95, u }; }
    if (f < e - 4) { const w = Math.round(Math.sin((f - s) / 3)); return { x: TIP[0] + w, y: TIP[1] + (w > 0 ? 0 : -0), glide: false }; }
    if (f < e) return { x: TIP[0] + 1, y: TIP[1] + 1, down: true };
    if (f < e + 10) return { x: TIP[0], y: TIP[1], glide: false };
    const u = ease((f - (e + 10)) / 24);
    const [x, y] = bez(TIP, [158, 90], [184, 52], u);
    return { x, y, glide: u > 0.05 && u < 0.95, u, leaving: true };
  }
  return null;
}
function cursor(c, f) {
  const cp = cursorAt(f);
  if (!cp) return;
  if (cp.glide)                                            // estela mientras se mueve rápido
    for (const back of [2, 4, 6]) {
      const p = cursorAt(f - back);
      if (p && p.glide) { c.px(p.x + 1, p.y + 1, back === 2 ? "3" : "2"); }
    }
  paintGrid(c, PROPS.cursor, cp.x, cp.y, cp.down ? { y: "g" } : {});
}

// ------------------------------------------------------------------ impacto: anillo, chispas y sacudida
function impact(c, f) {
  for (const [E, scale] of [[E1, 1], [E2, 0.75]]) {
    const t = f - E;
    if (t < 0 || t > 14) continue;
    const cx = 136, cy = 83;
    const onBtn = (x, y) => x >= BTN.x - 1 && x < BTN.x + BTN.w + 1 && y >= BTN.y - 1 && y < BTN.y + BTN.h + 1;
    if (t < 4) {                                           // destello seco durante el hit-stop
      for (let y = cy - 7; y <= cy + 7; y++)
        for (let x = cx - 14; x <= cx + 14; x++)
          if (y >= 71 && y <= 88 && !onBtn(x, y) && bay(x, y) < 1 - Math.hypot((x - cx) / 2, y - cy) / 7) c.px(x, y, "L");
    }
    const rx = (17 + Math.min(t, 12) * 1.3) * scale + (scale < 1 ? 4 : 0), ry = (6 + t * 0.55) * scale + (scale < 1 ? 2 : 0);
    if (t < 13)                                            // la onda recorre la ventana desde el botón
      for (let k = 0, n = Math.ceil(rx * 6); k < n; k++) {
        const a = (k / n) * TAU, x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
        if (x < 6 || x > 153 || y < 71 || y > 88 || onBtn(x, y)) continue;
        c.px(x, y, t < 4 ? "c" : t < 8 ? "L" : "w");
      }
    if (t >= 1 && t < 8) {                                 // chispas que salen del botón
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.5, r0 = 6 + t * 2 * scale;
        const x = Math.round(cx + Math.cos(a) * r0 * 1.4), y = Math.round(cy + Math.sin(a) * r0 * 0.7);
        if (inside(x, y) && y >= 71 && !onBtn(x, y)) c.px(x, y, t < 4 ? "c" : "L");
      }
    }
  }
}
function shake(c, dx, dy) {
  if (!dx && !dy) return;
  const buf = new Array(W * H);
  for (let y = 16; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = c.get(x, y);
  for (let y = 16; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx)), sy = Math.min(H - 1, Math.max(16, y - dy));
      c.px(x, y, "#" + (buf[sy * W + sx] >>> 0).toString(16).padStart(8, "0"));
    }
}

// ------------------------------------------------------------------ la animación
anim("control", { w: W, h: H, frames: N, fps: 30 }, (c) => {
  const real = c.frame;
  let f = real;
  if (f >= E1 && f < E1 + 4) f = E1;                       // hit-stop: el mundo se congela tras el sí
  if (f >= E2 && f < E2 + 2) f = E2;
  const red = lampRed(f);

  c.rect(0, 0, W, H, "z");
  sky(c, f);
  glow(c, f, red);
  bust(c, f, red);
  portico(c, f, red);
  gems(c, f, red);
  alarm(c, f);

  const A = stateA(f), P = stateP(f), D = stateD(f);
  const crates = cratesAt(f, A, P, D);
  for (const cr of crates) drawCrate(c, cr);
  for (const [S, id] of [[A, "A"], [D, "D"], [P, "P"]]) {
    if (!S.show) continue;
    if (id === "A") S.tier = "t";
    if (S.gone) { poof(c, S.cx, GY - 8, S.poof, TIERK[S.tier]); continue; }
    const [x, y] = drawCrab(c, S);
    overlays(c, f, S, x, y);
    if (S.walk !== undefined) dust(c, S.cx - 11, GY - 1, mod(mod(S.walk, 8) - 2, 4) + 1, -1);
    if (S.poof !== undefined && S.poof >= 0) poof(c, S.cx, GY - 8, S.poof, TIERK[S.tier]);
  }
  gateDoor(c, f);
  for (const t of SHUT) dust(c, DX - 2, GY, f - t, -1), dust(c, DX + 2, GY, f - t, 1);

  // polvo al aterrizar los disquetes; palomita en el que cruza la compuerta
  for (const cr of crates) {
    if (!cr.hop) continue;
    if (cr.hop.dust >= 0) dust(c, cr.x + (cr.w >> 1), GY, cr.hop.dust, -1);
    const mid = cr.x + cr.w / 2;
    if (mid >= DX && cr.x < 150) {
      const cols = Math.min(7, Math.round((mid - DX) * 0.7) + 1), lift = cr.hop.t > 24 ? Math.round((cr.hop.t - 24) * 0.5) : 0;
      const ck = PROPS.check.map((r) => r.slice(0, cols));
      paintGrid(c, ck, Math.round(mid) - 3, cr.y - 7 - lift, { y: "4" });
      paintGrid(c, ck, Math.round(mid) - 3, cr.y - 8 - lift, { y: "j" });
    }
  }
  for (const [t, x0, x1] of [[LANDP, 89, 108], [LANDD1, 34, 61], [LANDD2, 81, 108]]) { dust(c, x1, GY, f - t, 1); dust(c, x0, GY, f - t, -1); }

  bar(c, f);
  impact(c, f);
  cursor(c, f);
  hudBar(c, f);
  if (real >= E1 + 4 && real < E1 + 14) shake(c, [2, -2, 2, -1, 1, -1, 1, 0, -1, 0][real - E1 - 4], [1, -1, 0, 1, -1, 0, 1, 0, 0, 0][real - E1 - 4]);
  if (real >= E2 + 2 && real < E2 + 7) shake(c, [1, -1, 1, 0, 0][real - E2 - 2], [0, 1, -1, 0, 0][real - E2 - 2]);
})

sheet("control_sheet", ["control"], { pad: 0 })
