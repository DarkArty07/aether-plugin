/* Aether Plugin, animations page. Classic script, no modules, no network. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  var DICT = {
    "es": {
      "skip": "Saltar al contenido",
      "lang.label": "Idioma",
      "metas.tag": "// 01 · METAS",
      "metas.title": "Cinco metas.<br><em>Una sigla.</em>",
      "metas.intro": "Aether sirve a cinco metas, <em>RADAR</em>. Cada brief que escribe el Lead informa de las cinco.",
      "metas.acr": "Cada brief informa de las cinco. <code>aether-report</code> pone precio a un run y reúne sus cifras.",
      "radar.alt": "Un radar redondo barre tres vueltas: se encienden cinco puntos y las cinco letras de la sigla RADAR mientras Clawd lo mira",
      "team.tag": "// 02 · EQUIPO",
      "team.title": "Quién hace<br><em>qué</em>",
      "team.intro": "El Lead es la sesión principal y tu mano derecha, no un mensajero. Los demás roles trabajan en un contexto propio, y quien escribe un documento nunca lo juzga. Los modelos de cada tarjeta son los de Claude nativo: con <code>superdelegation</code> activada, cada rol que no es el Lead corre primero en otro plan.",
      "team.alt": "El Lead entrega la tarjeta de intención al Writer, que escribe la spec; el Judge la revisa, pide un cambio y luego la aprueba; el Examiner guarda el examen oculto en una bóveda que el swarm no logra abrir",
      "flow.tag": "// 04 · DEL ENCARGO AL RESULTADO",
      "flow.title": "Del encargo<br><em>al resultado</em>",
      "flow.intro": "Sin permiso para trabajar durante horas, el Lead se detiene en el plan con un brief corto. Con él, sigue solo, dentro de sus topes, hasta el examen y el brief.",
      "flow.alt": "Un encargo recorre los siete pasos, de la intención al brief: spec, plan, tareas, examen oculto, swarm y el brief final, que el dueño aprueba con un sí",
      "inst.title": "Instala y<br><em>empieza</em>",
      "inst.alt": "Se instala el plugin, se arranca el modo Aether y Clawd pasa de naranja Claude a violeta Aether",
      "motion.pause": "Pausar animación",
      "motion.play": "Activar animación",
      "r1.w": "ápido",
      "r1.g": "FAST",
      "r1.m": "Modelos rápidos y baratos hacen el grueso del trabajo, y nada itera sin fin.",
      "r1.alt": "Un cangrejo ligero lleva tarjetas de tarea a la meta a toda velocidad mientras uno grande, con una etiqueta de precio, descansa; un límite corta el bucle de reintentos",
      "r2.w": "utónomo",
      "r2.g": "AUTONOMOUS",
      "r2.m": "No se te pregunta por lo trivial, y cada paso irreversible te llega en una sola lista.",
      "r2.alt": "Clawd atrapa en el aire las preguntas triviales de los cangrejos y las decide solo; lo irreversible va a una sola lista que llega al dueño",
      "r3.w": "elegación",
      "r3.g": "DELEGATION",
      "r3.m": "El trabajo va a otros harness de código (agy, Codex, Grok, Cursor, Muse) mientras dure su cuota.",
      "r3.alt": "Clawd reparte tarjetas por tuberías a cinco estaciones, agy, Codex, Grok, Cursor y Muse, y recoge sus resultados mientras el agente nativo de Claude duerme",
      "r4.w": "sequible",
      "r4.g": "AFFORDABLE",
      "r4.m": "Cada rol corre con el modelo y el esfuerzo más baratos que lo hacen bien.",
      "r4.alt": "Cada rol prueba primero el modelo más barato y sube un nivel solo si falla el control de calidad; al final un sello marca el ahorro frente a usar solo Opus",
      "r5.w": "obusto",
      "r5.g": "ROBUST",
      "r5.m": "Código de calidad, comprobado con tests, evidencia y revisiones independientes.",
      "r5.alt": "Un bloque de código pasa por tests, evidencia y una revisión independiente, que encuentra un segundo bicho, y recibe un sello de verificado",
      "gal.page": "Aether en movimiento · Aether Plugin",
      "gal.desc": "Las animaciones de Aether Plugin en grande: las cinco metas, el equipo, el camino de un encargo y la instalación.",
      "gal.tag": "// ANIMACIONES",
      "gal.title": "Aether<br><em>en movimiento</em>",
      "gal.intro": "Las animaciones que no caben en la portada, en grande: las cinco metas, el equipo, el camino de un encargo y la instalación. Cada una dura entre 12 y 15 segundos y vuelve a empezar sola.",
      "gal.back": "← Volver al sitio",
      "gal.see": "Ver en la portada",
      "gal.s4.tag": "// 07 · INSTALAR"
    },
    "en": {
      "skip": "Skip to content",
      "lang.label": "Language",
      "metas.tag": "// 01 · GOALS",
      "metas.title": "Five goals.<br><em>One acronym.</em>",
      "metas.intro": "Aether serves five goals, <em>RADAR</em>. Every brief the Lead writes reports all five.",
      "metas.acr": "Every brief reports the five. <code>aether-report</code> prices a run and gathers its figures.",
      "radar.alt": "A round radar sweeps three turns: five blips and the five letters of the RADAR acronym light up while Clawd watches",
      "team.tag": "// 02 · TEAM",
      "team.title": "Who does<br><em>what</em>",
      "team.intro": "The Lead is the main session and your right hand, not a messenger. The other roles work in a context of their own, and whoever writes a document never judges it. The models on each card are native Claude's: with <code>superdelegation</code> on, every role that is not the Lead runs first on another plan.",
      "team.alt": "The Lead hands the intent card to the Writer, who writes the spec; the Judge reviews it, asks for a change and then approves it; the Examiner seals the hidden exam in a vault that the swarm cannot open",
      "flow.tag": "// 04 · FROM REQUEST TO RESULT",
      "flow.title": "From request<br><em>to result</em>",
      "flow.intro": "Without permission to work for hours, the Lead stops at the plan with a short brief. With it, it goes on by itself, within its ceilings, to the exam and the brief.",
      "flow.alt": "A request travels the seven steps from intent to brief: spec, plan, tasks, hidden exam, swarm and the final brief, which the owner approves with a yes",
      "inst.title": "Install and<br><em>start</em>",
      "inst.alt": "The plugin is installed, Aether mode starts and Clawd turns from Claude orange to Aether violet",
      "motion.pause": "Pause animation",
      "motion.play": "Enable animation",
      "r1.w": "ápido",
      "r1.g": "FAST",
      "r1.m": "Fast, cheap models do the bulk of the work, and nothing iterates without end.",
      "r1.alt": "A light crab carries task cards to the finish line at full speed while a big one with a price tag rests; a limit cuts the retry loop",
      "r2.w": "utónomo",
      "r2.g": "AUTONOMOUS",
      "r2.m": "You are not asked about trivial things, and every irreversible step reaches you in one list.",
      "r2.alt": "Clawd catches the trivial questions of the crabs in mid-air and decides them alone; the irreversible goes onto a single list that reaches the owner",
      "r3.w": "elegación",
      "r3.g": "DELEGATION",
      "r3.m": "Work goes to other coding harnesses (agy, Codex, Grok, Cursor, Muse) while their quota lasts.",
      "r3.alt": "Clawd sends cards down pipes to five stations, agy, Codex, Grok, Cursor and Muse, and collects their results while the native Claude agent sleeps",
      "r4.w": "sequible",
      "r4.g": "AFFORDABLE",
      "r4.m": "Each role runs on the cheapest model and effort that does it well.",
      "r4.alt": "Each role tries the cheapest model first and steps up one level only if the quality gate fails; at the end a stamp marks the saving against using Opus alone",
      "r5.w": "obusto",
      "r5.g": "ROBUST",
      "r5.m": "Quality code, checked by tests, evidence and independent reviews.",
      "r5.alt": "A block of code goes through tests, evidence and an independent review that finds a second bug, and receives a verified stamp",
      "gal.page": "Aether in motion · Aether Plugin",
      "gal.desc": "The Aether Plugin animations shown large: the five goals, the team, the path of a request and the install.",
      "gal.tag": "// ANIMATIONS",
      "gal.title": "Aether<br><em>in motion</em>",
      "gal.intro": "The animations that do not fit on the front page, shown large: the five goals, the team, the path of a request and the install. Each one lasts 12 to 15 seconds and starts over by itself.",
      "gal.back": "← Back to the site",
      "gal.see": "See it on the front page",
      "gal.s4.tag": "// 07 · INSTALL"
    }
  };

  /* The language is the one the landing page keeps; the same key, so the two pages agree. */
  var S = { lang: 'es', run: true };
  function t(k) { var d = DICT[S.lang][k]; return typeof d === 'string' ? d : DICT.es[k]; }
  function applyLang() {
    html.lang = S.lang;
    doc.title = t('gal.page');
    var meta = $('meta[name="description"]'); if (meta) meta.setAttribute('content', t('gal.desc'));
    $$('[data-i18n]').forEach(function (el) { var v = t(el.getAttribute('data-i18n')); if (typeof v === 'string') el.textContent = v; });
    $$('[data-i18n-html]').forEach(function (el) { var v = t(el.getAttribute('data-i18n-html')); if (typeof v === 'string') el.innerHTML = v; });
    $$('[data-i18n-alt]').forEach(function (el) { el.setAttribute('alt', t(el.getAttribute('data-i18n-alt'))); });
    $$('[data-i18n-label]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label'))); });
    $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === S.lang)); });
    $('#motion-l').textContent = t(S.run ? 'motion.pause' : 'motion.play');
    $$('canvas.px-still').forEach(function (c) { var i = c.previousElementSibling; if (i) c.setAttribute('aria-label', i.alt); });
  }
  $$('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () { S.lang = b.getAttribute('data-lang'); store('aether-landing-lang', S.lang); applyLang(); });
  });

  /* Pixel GIFs (img.px): the same behaviour as the landing page. A GIF starts when it comes into view, so its story
     begins at its first frame, and it freezes (a canvas copy of the frame on screen) when motion is paused.
     Without JavaScript a noscript copy of the image plays it. */
  var pxImgs = $$('img.px');
  function pxSync(img) {
    var still = img._still;
    if (S.run) { if (still) still.hidden = true; img.hidden = false; return; }
    if (!img._live) return;
    if (!still) {
      still = img._still = doc.createElement('canvas');
      still.className = 'px-still'; still.hidden = true; still.setAttribute('role', 'img');
      img.parentNode.insertBefore(still, img.nextSibling);
    }
    try {
      still.width = img.naturalWidth; still.height = img.naturalHeight;
      still.getContext('2d').drawImage(img, 0, 0);
      still.setAttribute('aria-label', img.alt);
      still.hidden = false; img.hidden = true;
    } catch (e) { /* keep the GIF */ }
  }
  var pxIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var img = e.target; pxIO.unobserve(img);
      img.addEventListener('load', function () { img._live = true; pxSync(img); });
      img.src = img._src;
    });
  }, { rootMargin: '160px 0px', threshold: 0.15 });
  pxImgs.forEach(function (img) { img._src = img.getAttribute('data-src'); pxIO.observe(img); });

  /* Motion: on, unless the system asks for less; the button pauses and resumes. */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function setRun(on) {
    S.run = on;
    var b = $('#motion');
    b.setAttribute('aria-pressed', String(!on));
    $('.motion-i', b).textContent = on ? '\u275a\u275a' : '\u25b6';
    $('#motion-l').textContent = t(on ? 'motion.pause' : 'motion.play');
    pxImgs.forEach(pxSync);
  }
  $('#motion').addEventListener('click', function () { setRun(!S.run); });
  if (reduce.addEventListener) reduce.addEventListener('change', function () { setRun(!reduce.matches); });

  var saved = load('aether-landing-lang');
  S.lang = saved === 'en' || saved === 'es' ? saved : 'es';
  applyLang();
  setRun(!reduce.matches);
})();
