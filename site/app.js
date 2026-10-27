/* Aether Plugin landing prototype. Classic script, no modules, no network. */
(function () {
  'use strict';

  var doc = document, html = doc.documentElement;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  var CANCEL = { cancelled: true };

  /* ------------------------------------------------------------------ */
  /* Copy. All visible text lives here. Spanish is the default.          */
  /* ------------------------------------------------------------------ */
  var DICT = {
    es: {
      'skip': 'Saltar al contenido',
      'nav.metas': 'Metas', 'nav.team': 'Equipo', 'nav.paths': 'Caminos', 'nav.flow': 'Flujo',
      'nav.control': 'Control', 'nav.lanes': 'Carriles', 'nav.install': 'Instalar', 'nav.menu': 'MENÚ',
      'lang.label': 'Idioma',
      'illus': 'ILUSTRATIVO',

      'hero.tag': '// 00 · ORIGEN',
      'hero.alt': 'Un busto de estatua griega mira hacia arriba ante un planeta con anillos, en tramado violeta',
      'hero.sub': 'PLUGIN PARA CLAUDE CODE',
      'hero.lead': 'Añade un <strong>modo Aether</strong> opcional: un orquestador responsable, el Lead, convierte tu intención en una spec y un plan revisados, los construye con un swarm paralelo de agentes y con los otros planes de código que ya pagas, y te informa en un solo brief.',
      'hero.note': '<code>claude</code> a secas sigue siendo el modo normal.',
      'hero.cta': 'Cómo funciona ↓',
      'hero.walk.alt': 'Clawd camina tranquilo, de izquierda a derecha, sobre la línea y deja una nota musical por el camino',

      'metas.tag': '// 01 · METAS',
      'metas.title': 'Cinco metas.<br><em>Una sigla.</em>',
      'metas.intro': 'Aether sirve a cinco metas, <em>RADAR</em>. Cada brief que escribe el Lead informa de las cinco.',
      'metas.acr': 'Cada brief informa de las cinco. <code>aether-report</code> pone precio a un run y reúne sus cifras.', 'metas.more': 'Ver cada meta en movimiento',
      'ac.1': 'Rápido', 'ac.2': 'Autónomo', 'ac.3': 'Delegación', 'ac.4': 'Asequible', 'ac.5': 'Robusto',
      'radar.alt': 'Un radar redondo barre tres vueltas: se encienden cinco puntos y las cinco letras de la sigla RADAR mientras Clawd lo mira',
      'r1.alt': 'Un cangrejo ligero lleva tarjetas de tarea a la meta a toda velocidad mientras uno grande, con una etiqueta de precio, descansa; un límite corta el bucle de reintentos', 'r1.w': 'ápido', 'r1.g': 'FAST',
      'r1.m': 'Modelos rápidos y baratos hacen el grueso del trabajo, y nada itera sin fin.',
      'r2.alt': 'Clawd atrapa en el aire las preguntas triviales de los cangrejos y las decide solo; lo irreversible va a una sola lista que llega al dueño', 'r2.w': 'utónomo', 'r2.g': 'AUTONOMOUS',
      'r2.m': 'No se te pregunta por lo trivial, y cada paso irreversible te llega en una sola lista.',
      'r3.alt': 'Clawd reparte tarjetas por tuberías a cinco estaciones, agy, Codex, Grok, Cursor y Muse, y recoge sus resultados mientras el agente nativo de Claude duerme', 'r3.w': 'elegación', 'r3.g': 'DELEGATION',
      'r3.m': 'El trabajo va a otros harness de código (agy, Codex, Grok, Cursor, Muse) mientras dure su cuota.',
      'r4.alt': 'Cada rol prueba primero el modelo más barato y sube un nivel solo si falla el control de calidad; al final un sello marca el ahorro frente a usar solo Opus', 'r4.w': 'sequible', 'r4.g': 'AFFORDABLE',
      'r4.m': 'Cada rol corre con el modelo y el esfuerzo más baratos que lo hacen bien.',
      'r5.alt': 'Un bloque de código pasa por tests, evidencia y una revisión independiente, que encuentra un segundo bicho, y recibe un sello de verificado', 'r5.w': 'obusto', 'r5.g': 'ROBUST',
      'r5.m': 'Código de calidad, comprobado con tests, evidencia y revisiones independientes.',

      'team.tag': '// 02 · EQUIPO',
      'team.title': 'Quién hace<br><em>qué</em>',
      'team.intro': 'El Lead es la sesión principal y tu mano derecha, no un mensajero. Los demás roles trabajan en un contexto propio, y quien escribe un documento nunca lo juzga.',
      'team.m.lead': 'Sonnet · xhigh',
      'team.owner': 'Por encima de todos está el dueño: confirma lo que entendió el Lead, puede dar permiso para trabajar durante horas, responde una sola lista y revisa el brief.',
      'lead.alt': 'El Lead: una estatua con corona de laurel que extiende el brazo hacia las estrellas',
      'lead.t': 'Entiende la intención, hace las preguntas que el código no responde y escribe la tarjeta de intención. Lanza /aether:design, elige el camino de cada trabajo y juzga el resultado de cada tarea delegada. Es dueño del resultado.',
      'writer.alt': 'El Writer: una mano de mármol que escribe sobre una tableta que contiene una galaxia',
      'writer.t': 'Escribe la spec desde la tarjeta de intención, y el plan y las tareas desde la spec aprobada. Lo que no está claro y es difícil de revertir lo marca [NEEDS CLARIFICATION].',
      'judge.alt': 'El Judge: una estatua con los ojos vendados que sostiene una espada',
      'judge.t': 'Revisa la spec, el plan y las tareas, y dictamina approve, revise o reject, con a lo sumo diez hallazgos. Solo lectura. Sonnet escribe; Opus decide.',
      'examiner.alt': 'El Examiner: un pergamino sellado flotando en el espacio',
      'examiner.t': 'Escribe el examen oculto desde la spec y las interfaces públicas del plan, nunca desde tasks.md. Se guarda fuera del repositorio: el swarm no lo ve.',
      'swarm.t': 'Implementadores que empiezan en el Tier de su tarea y suben la escalera si fallan, un supervisor en Sonnet que revisa cada intento, merges de uno en uno y una revisión final. Cangrejos: verde, azul y rosa = modelo ligero, medio y fuerte.',

      'paths.tag': '// 03 · CAMINOS',
      'paths.title': 'Tres caminos,<br><em>una decisión</em>',
      'paths.intro': 'El Lead toma uno de tres caminos para cada trabajo, y la escalera de modelos de una tarea delegada la lleva el sistema, no él.',
      'paths.foot': 'ILUSTRATIVO: los diagramas muestran el orden de las etapas, no tiempos reales.',
      'n.lead': 'LEAD', 'n.result': 'RESULTADO', 'n.result.s': 'FINAL',
      'n.sub': 'SUBAGENTE', 'n.sub.s': 'TAREA',
      'n.unit1': 'UNIDAD 1', 'n.unit2': 'UNIDAD 2', 'n.unit3': 'UNIDAD 3', 'n.unit4': 'UNIDAD 4',
      'n.review': 'REVISIÓN', 'n.review.s': 'REV.',
      'p.direct.n': 'Directo',
      'p.direct.w': 'Un cambio muy acotado: unas cinco llamadas a herramientas y ningún ciclo de editar-probar-corregir. El Lead lo hace en línea, con el modelo en que corre.',
      'p.direct.a': 'Clawd hace cinco llamadas a herramientas en línea, de READ a RUN, y la bandera del resultado sube',
      'p.direct.c': 'EN LÍNEA · ~5 LLAMADAS',
      'p.delegate.n': 'Tarea delegada',
      'p.delegate.w': 'Trabajo acotado que ya es una tarea real: un ciclo de editar-probar-corregir, una limpieza, una búsqueda. Un subagente en segundo plano, con un encargo autocontenido, que empieza en Haiku. Una corrección vuelve al mismo modelo, con su propio trabajo y los hallazgos, y la tarea solo sube a Sonnet y luego a Opus cuando agota sus correcciones.',
      'p.delegate.a': 'El Lead escribe un encargo que empieza en Haiku y lo pasa a un subagente en segundo plano; el subagente edita, prueba y corrige mientras el Lead sigue libre, y el resultado vuelve',
      'p.delegate.c': 'SEGUNDO PLANO · EMPIEZA EN HAIKU',
      'p.swarm.n': 'Swarm',
      'p.swarm.w': 'Trabajo largo, costoso o complejo: un plan aprobado de tres o más tareas, o con una tarea de Tier opus. /aether:run, cada tarea en su Tier; las unidades aprobadas se funden de una en una y una revisión final cubre todo.',
      'p.swarm.a': 'El Lead reparte un plan en cuatro unidades paralelas, cada una en su worktree; una falla y reintenta; las unidades aprobadas se funden de una en una, de 0/4 a 4/4, y una revisión final cubre todo antes del brief',
      'p.swarm.c1': 'EN PARALELO · CADA UNIDAD EN SU WORKTREE',
      'p.swarm.c2': 'DE UNA EN UNA',
      'p.swarm.c3': 'REVISIÓN FINAL',

      'flow.tag': '// 04 · DEL ENCARGO AL RESULTADO',
      'flow.title': 'Del encargo<br><em>al resultado</em>',
      'flow.intro': 'Sin permiso para trabajar durante horas, el Lead se detiene en el plan con un brief corto. Con él, sigue solo, dentro de sus topes, hasta el examen y el brief.',
      'flow.foot': 'El examen oculto se escribe con el plan aprobado y se ejecuta cuando termina la construcción.',
      'flow.s0': 'intención', 'flow.s1': 'spec', 'flow.s2': 'plan', 'flow.s3': 'tareas',
      'flow.s4': 'examen oculto', 'flow.s5': 'swarm', 'flow.s6': 'brief',
      'flow.d0': 'Dices lo que quieres. El Lead explora el contexto, hace como máximo cinco preguntas y escribe la tarjeta de intención: tus palabras, lo que entendió y los criterios.',
      'flow.d1': '/aether:design corre solo: el Writer escribe spec.md desde la tarjeta y el Judge la revisa.',
      'flow.d2': 'Con la spec aprobada, el Writer escribe plan.md y el Judge lo revisa. Cada documento admite como máximo dos revisiones.',
      'flow.d3': 'tasks.md lleva los campos Aether de cada tarea: Tier y esfuerzo, área, archivos propios y dependencias. aether-plan lo comprueba.',
      'flow.d4': 'El Examiner escribe el examen desde la spec y el plan, fuera del repositorio. El swarm nunca lo ve.',
      'flow.d5': '/aether:run: unidades en paralelo, cada una en su worktree, con un supervisor; los merges van de uno en uno y una revisión final cubre todo.',
      'flow.d6': 'Un solo brief, que abre con «Espera tu sí» y «Supuestos», y que informa de los cinco RADAR.',
      'brief.bar': 'UN SOLO BRIEF',
      'brief.lines': [
        '## Espera tu sí',
        '- push de la rama a origin · push · se ejecutará: <comando exacto>',
        '## Supuestos',
        '- lo que la intención no cubre · su base · reversible o no',
        '## Hice',
        '- la rama y los commits',
        '## Decidí',
        '- cada decisión, con su razón',
        '## RADAR',
        '- Rápido: tiempo, reintentos y subidas de modelo',
        '- Autónomo: veces que te interrumpí y por qué',
        '- Delegación: llamadas y tokens en otros harness',
        '- Asequible: US$, cuota usada y modelo de cada tarea',
        '- Robusto: tests, examen, hallazgos y veredictos'
      ],

      'control.tag': '// 05 · CONTROL',
      'control.title': 'Tú decides<br><em>lo irreversible</em>',
      'control.intro': 'El Lead decide como tu delegado lo que tu intención cubre. Solo llega a ti lo que la intención no cubre, lo que choca con ella y las acciones irreversibles que ningún permiso cubre.',
      'control.alt': 'Una compuerta con lámpara: las cajas normales pasan solas, y las marcadas PUSH, MERGE o DEPLOY ponen la lámpara en rojo y esperan en una lista hasta que el cursor del dueño pulsa YES',
      'c1.h': 'Una sola lista',
      'c1.t': 'Lo irreversible, y lo que solo tú puedes elegir, espera tu sí en una lista que abre cada brief. Todo lo demás avanza. Puedes autorizar una clase en general: <code>merge-main</code>, <code>push</code>, <code>publish</code>, <code>deploy</code>, <code>delete</code>, <code>credentials</code> o <code>paid-call</code>.',
      'c2.h': 'Examen oculto',
      'c2.t': 'El examen se guarda fuera del repositorio: el swarm nunca lo ve. Un test que falle es un hallazgo bloqueante del brief.',
      'c3.h': 'Supervisor y revisión final',
      'c3.t': 'Un supervisor revisa cada intento y califica cada criterio con evidencia. Al final, una revisión independiente cubre todo lo fusionado.',
      'brake.alt': 'Tres unidades construyen mientras sube el medidor de la ventana de 5 horas. Al llegar al 95 % el Lead frena en orden: no empieza nada nuevo, se detiene lo que corre y cada unidad guarda su trabajo en su rama. La corrida duerme en pausa hasta que la ventana se reinicia, y entonces sigue desde las ramas sin repetir la unidad ya fundida',
      'c4.h': 'Freno de cuota',
      'c4.t': 'Cuando la ventana de 5 horas de tu cuenta de Claude llega al 95 % (<code>quotabrake</code>), el plugin te avisa. En una corrida autónoma el Lead frena en orden: no empieza nada nuevo, detiene lo que corre y guarda el trabajo de cada unidad en su rama. La corrida queda en pausa, no termina: al reiniciarse la ventana sigue sola, sin repetir lo ya fundido. Solo tus palabras apagan el freno.',
      'term.lines': [
        '$ git push origin main',
        '# aether-guard: ningún permiso cubre este push',
        '# anotado en .aether/pending.jsonl, la lista del dueño',
        '# por defecto solo lo registra; con AETHER_IRREVERSIBLE=enforce también lo rechaza'
      ],
      'yes.title': 'ESPERA TU SÍ',
      'yes.empty': '// la lista está vacía',
      'yes.item': 'git push origin main',
      'yes.meta': 'push · ningún permiso lo cubre · se ejecutará: git push origin main',
      'yes.bar': 'NEEDS YOUR YES',

      'lanes.tag': '// 06 · CARRILES',
      'lanes.title': 'Superdelegation:<br><em>la cuota de otros planes</em>',
      'lanes.intro': 'Con <code>superdelegation</code> activada, todo lo que no es el Lead sale primero a otro plan de código que ya pagas, mientras dure su cuota. Si un harness falta, se queda sin cuota o no arranca, la misma llamada pasa al siguiente candidato, y al agente nativo de Claude si no queda ninguno, sin gastar la escalera.',
      'lanes.alt': 'Las tarjetas de tarea caen por un pozo y entran al primer carril con cuota; cuando un carril se queda sin cuota, la siguiente tarjeta pasa al siguiente, hasta caer en el agente nativo de Claude, que no se acaba, y las cuotas se renuevan',
      'lanes.native': 'AGENTE NATIVO',
      'lanes.st.idle': 'libre', 'lanes.st.use': 'en uso', 'lanes.st.low': 'bajo la reserva',
      'lanes.st.noread': 'sin lectura de cuota', 'lanes.st.fail': 'falló por cuota',
      'lanes.st.native': 'llamada nativa',
      'lanes.f1': '<strong>Apagada por defecto</strong>Sin activar <code>superdelegation</code>, toda llamada que no es del Lead corre en Claude nativo, con cualquier cuota. Solo corre en Linux.',
      'lanes.f2': '<strong>Los puntos piden, la cuota ordena</strong>Cada llamada pide los puntos de inteligencia de su par de Claude, modelo y effort, con 1 punto de tolerancia. Va primero la cuota cuya ventana semanal se renueva antes, y dentro de ella el par más barato por tarea; una reserva del 5 % deja fuera al grupo que la toca.',
      'lanes.f3': '<strong>Sin lectura, se prueba</strong>Codex y Cursor no reportan cuota, y Muse solo la reporta después de una llamada: se prueban después, hasta que una llamada falla por cuota. Entonces la llamada sigue con el siguiente. El par de Muse entra por decisión del dueño y va último dentro de su cuota.',
      'lanes.f4': '<strong>Qué está probado</strong>agy fue el primero y Grok se probó con llamadas reales el 2026-10-13. Muse se probó con llamadas reales el 2026-10-19. Los adaptadores de Codex y Cursor aún no han hecho ninguna llamada real.',

      'inst.tag': '// 07 · INSTALAR Y AUTORÍA',
      'inst.title': 'Instala y<br><em>empieza</em>',
      'inst.bar': 'CLAUDE PLUGIN INSTALL',
      'copy': 'COPY', 'copied': 'COPIADO', 'copy.fail': 'No se pudo copiar: selecciona el comando y cópialo a mano.',
      'copy.ok': 'Comando copiado al portapapeles.',
      'st1.h': 'Instala',
      'st1.t': 'Una vez. Con <code>--config superdelegation=true</code> activas la superdelegación.',
      'st2.h': 'Elige el modo Aether',
      'st2.t': 'El modo se elige por sesión: el Lead es el agente <code>aether:lead</code>, que empieza en Sonnet, y <code>--effort xhigh</code> fija su esfuerzo.',
      'st3.h': 'Dile al Lead lo que quieres',
      'st3.t': 'El Lead confirma lo que entendió, escribe la tarjeta de intención y lanza el diseño. Tú revisas el brief.',
      'inst.req': 'REQUISITOS · Claude Code 2.1.294 o posterior · Node.js 22 · git 2.36 o posterior · para la superdelegación, el CLI de cada harness que actives: <code>agy</code>, <code>codex</code>, <code>grok</code>, <code>cursor-agent</code> o <code>muse</code>.',
      'atm.alt': 'Una cabeza de estatua que mira hacia arriba entre polvo estelar y constelaciones',
      'auth.tag': '// AUTORÍA',
      'auth.link': 'DarkArty07 en GitHub',
      'auth.t': 'Aether Plugin es de código abierto bajo la licencia MIT, y sucesor de Aether Agents: el mismo método, reconstruido sobre un harness hecho para software.',
      'links.docs': 'Documentación', 'links.lic': 'Licencia',
      'foot.t': 'Los agentes implementador, supervisor y revisor adaptan plantillas de superpowers; el preset de Aether adapta las de GitHub Spec Kit; varias piezas portan ideas de oh-my-claudecode, todo bajo licencia MIT. El texto dentro de las ventanas es ilustrativo.',
      'foot.indep': 'Aether es un proyecto independiente; no está afiliado ni respaldado por Anthropic.',
      'foot.top': 'Volver al origen ↑', 'foot.gal': 'Más animaciones →',
      'motion.pause': 'Pausar animación', 'motion.play': 'Activar animación',
      'motion.calm': 'Tu sistema pide menos movimiento: animación suave.', 'motion.full': 'Ver completa',
      'motion.fullon': 'Animación completa, aunque tu sistema pide menos movimiento.', 'motion.tocalm': 'Suavizar'
    },

    en: {
      'skip': 'Skip to content',
      'nav.metas': 'Goals', 'nav.team': 'Team', 'nav.paths': 'Paths', 'nav.flow': 'Flow',
      'nav.control': 'Control', 'nav.lanes': 'Lanes', 'nav.install': 'Install', 'nav.menu': 'MENU',
      'lang.label': 'Language',
      'illus': 'ILLUSTRATIVE',

      'hero.tag': '// 00 · ORIGIN',
      'hero.alt': 'A bust of a Greek statue gazes upward in front of a ringed planet, in violet halftone',
      'hero.sub': 'PLUGIN FOR CLAUDE CODE',
      'hero.lead': 'It adds an opt-in <strong>Aether mode</strong>: an accountable orchestrator, the Lead, turns your intent into a reviewed spec and plan, builds it with a parallel swarm of agents and with the other coding plans you already pay for, and reports in one brief.',
      'hero.note': 'Plain <code>claude</code> stays normal mode.',
      'hero.cta': 'How it works ↓',
      'hero.walk.alt': 'Clawd strolls from left to right along the line and leaves a music note on the way',

      'metas.tag': '// 01 · GOALS',
      'metas.title': 'Five goals.<br><em>One acronym.</em>',
      'metas.intro': 'Aether serves five goals, <em>RADAR</em>. Every brief the Lead writes reports all five.',
      'metas.acr': 'Every brief reports the five. <code>aether-report</code> prices a run and gathers its figures.', 'metas.more': 'See each goal in motion',
      'ac.1': 'Rápido', 'ac.2': 'Autónomo', 'ac.3': 'Delegación', 'ac.4': 'Asequible', 'ac.5': 'Robusto',
      'radar.alt': 'A round radar sweeps three turns: five blips and the five letters of the RADAR acronym light up while Clawd watches',
      'r1.alt': 'A light crab carries task cards to the finish line at full speed while a big one with a price tag rests; a limit cuts the retry loop', 'r1.w': 'ápido', 'r1.g': 'FAST',
      'r1.m': 'Fast, cheap models do the bulk of the work, and nothing iterates without end.',
      'r2.alt': 'Clawd catches the trivial questions of the crabs in mid-air and decides them alone; the irreversible goes onto a single list that reaches the owner', 'r2.w': 'utónomo', 'r2.g': 'AUTONOMOUS',
      'r2.m': 'You are not asked about trivial things, and every irreversible step reaches you in one list.',
      'r3.alt': 'Clawd sends cards down pipes to five stations, agy, Codex, Grok, Cursor and Muse, and collects their results while the native Claude agent sleeps', 'r3.w': 'elegación', 'r3.g': 'DELEGATION',
      'r3.m': 'Work goes to other coding harnesses (agy, Codex, Grok, Cursor, Muse) while their quota lasts.',
      'r4.alt': 'Each role tries the cheapest model first and steps up one level only if the quality gate fails; at the end a stamp marks the saving against using Opus alone', 'r4.w': 'sequible', 'r4.g': 'AFFORDABLE',
      'r4.m': 'Each role runs on the cheapest model and effort that does it well.',
      'r5.alt': 'A block of code goes through tests, evidence and an independent review that finds a second bug, and receives a verified stamp', 'r5.w': 'obusto', 'r5.g': 'ROBUST',
      'r5.m': 'Quality code, checked by tests, evidence and independent reviews.',

      'team.tag': '// 02 · TEAM',
      'team.title': 'Who does<br><em>what</em>',
      'team.intro': 'The Lead is the main session and your right hand, not a messenger. The other roles work in a context of their own, and whoever writes a document never judges it.',
      'team.m.lead': 'Sonnet · xhigh',
      'team.owner': 'The owner sits above all of them: they confirm what the Lead understood, may give permission to work for hours, answer one list and review the brief.',
      'lead.alt': 'The Lead: a statue crowned with laurel, reaching an arm toward the stars',
      'lead.t': 'Understands the intent, asks what the code cannot answer and writes the intent card. Launches /aether:design, chooses the path of each piece of work and judges the result of each delegate task. Owns the outcome.',
      'writer.alt': 'The Writer: a marble hand writing on a tablet that holds a galaxy',
      'writer.t': 'Writes the spec from the intent card, and the plan and the tasks from the approved spec. A choice that is unclear and hard to reverse is marked [NEEDS CLARIFICATION].',
      'judge.alt': 'The Judge: a blindfolded statue holding a sword',
      'judge.t': 'Reviews the spec, the plan and the tasks, and rules approve, revise or reject, with at most ten findings. Read-only. Sonnet writes; Opus decides.',
      'examiner.alt': 'The Examiner: a sealed scroll floating in space',
      'examiner.t': 'Writes the hidden exam from the spec and the plan\'s public interfaces, never from tasks.md. It is kept outside the repository: the swarm never sees it.',
      'swarm.t': 'Implementers that start on their task\'s Tier and climb the ladder when they fail, a supervisor on Sonnet that reviews every attempt, merges one at a time and a final review. Crabs: green, blue and pink = light, middle and strong model.',

      'paths.tag': '// 03 · PATHS',
      'paths.title': 'Three paths,<br><em>one decision</em>',
      'paths.intro': 'The Lead takes one of three paths for each piece of work, and the system, not the Lead, holds the ladder of models of a delegate task.',
      'paths.foot': 'ILLUSTRATIVE: the diagrams show the order of the stages, not real timings.',
      'n.lead': 'LEAD', 'n.result': 'RESULT', 'n.result.s': 'DONE',
      'n.sub': 'SUBAGENT', 'n.sub.s': 'TASK',
      'n.unit1': 'UNIT 1', 'n.unit2': 'UNIT 2', 'n.unit3': 'UNIT 3', 'n.unit4': 'UNIT 4',
      'n.review': 'REVIEW', 'n.review.s': 'REV.',
      'p.direct.n': 'Direct',
      'p.direct.w': 'A very bounded change: about five tool calls and no edit-test-fix loop. The Lead does it inline, on the model it runs on.',
      'p.direct.a': 'Clawd makes five inline tool calls, from READ to RUN, and the result flag goes up',
      'p.direct.c': 'INLINE · ~5 CALLS',
      'p.delegate.n': 'Delegate task',
      'p.delegate.w': 'Bounded work that is still a real task: an edit-test-fix loop, a cleanup, a research sweep. One subagent in the background, with a self-contained brief, that starts on Haiku. A correction goes back to the same model with its own work and the findings, and the task climbs to Sonnet and then Opus only when its corrections are spent.',
      'p.delegate.a': 'The Lead writes a brief that starts on Haiku and hands it to a background subagent; the subagent edits, tests and fixes while the Lead stays free, and the result comes back',
      'p.delegate.c': 'BACKGROUND · STARTS ON HAIKU',
      'p.swarm.n': 'Swarm',
      'p.swarm.w': 'Long, costly or complex work: an approved plan of three or more tasks, or with a task of Tier opus. /aether:run, each task on its Tier; approved units merge one at a time and a final review covers the whole run.',
      'p.swarm.a': 'The Lead splits a plan into four parallel units, each in its own worktree; one fails and retries; the approved units merge one at a time, from 0/4 to 4/4, and a final review covers everything before the brief',
      'p.swarm.c1': 'IN PARALLEL · EACH UNIT IN ITS WORKTREE',
      'p.swarm.c2': 'ONE AT A TIME',
      'p.swarm.c3': 'FINAL REVIEW',

      'flow.tag': '// 04 · FROM REQUEST TO RESULT',
      'flow.title': 'From request<br><em>to result</em>',
      'flow.intro': 'Without permission to work for hours, the Lead stops at the plan with a short brief. With it, it goes on by itself, within its ceilings, to the exam and the brief.',
      'flow.foot': 'The hidden exam is written once the plan is approved and runs when the build ends.',
      'flow.s0': 'intent', 'flow.s1': 'spec', 'flow.s2': 'plan', 'flow.s3': 'tasks',
      'flow.s4': 'hidden exam', 'flow.s5': 'swarm', 'flow.s6': 'brief',
      'flow.d0': 'You say what you want. The Lead explores the context, asks at most five questions and writes the intent card: your words, what it understood and the criteria.',
      'flow.d1': '/aether:design runs on its own: the Writer writes spec.md from the card and the Judge reviews it.',
      'flow.d2': 'With the spec approved, the Writer writes plan.md and the Judge reviews it. Each document gets at most two revisions.',
      'flow.d3': 'tasks.md carries each task\'s Aether fields: tier and effort, area, owned files and dependencies. aether-plan checks it.',
      'flow.d4': 'The Examiner writes the exam from the spec and the plan, outside the repository. The swarm never sees it.',
      'flow.d5': '/aether:run: units in parallel, each in its own worktree, with a supervisor; merges go one at a time and a final review covers everything.',
      'flow.d6': 'One brief, opening with "Espera tu sí" and "Supuestos", that reports the five RADAR goals.',
      'brief.bar': 'ONE BRIEF',
      'brief.lines': [
        '## Espera tu sí',
        '- push of the branch to origin · push · will run: <exact command>',
        '## Supuestos',
        '- what the intent does not cover · its basis · reversible or not',
        '## Hice',
        '- the branch and the commits',
        '## Decidí',
        '- each decision, with its grounds',
        '## RADAR',
        '- Rápido: time, retries and model climbs',
        '- Autónomo: times I interrupted you and why',
        '- Delegación: calls and tokens on other harnesses',
        '- Asequible: US$, quota used and each task\'s model',
        '- Robusto: tests, exam, findings and verdicts'
      ],

      'control.tag': '// 05 · CONTROL',
      'control.title': 'You decide<br><em>what can\'t be undone</em>',
      'control.intro': 'The Lead decides, as your delegate, what your intent covers. Only what the intent does not cover, what conflicts with it, and irreversible actions that no grant covers reach you.',
      'control.alt': 'A gate with a lamp: ordinary crates pass alone, and those marked PUSH, MERGE or DEPLOY turn the lamp red and wait on a list until the owner cursor presses YES',
      'c1.h': 'One list',
      'c1.t': 'What is irreversible, and what only you can choose, waits for your yes in one list that opens every brief. Everything else proceeds. You may authorize a class in general: <code>merge-main</code>, <code>push</code>, <code>publish</code>, <code>deploy</code>, <code>delete</code>, <code>credentials</code> or <code>paid-call</code>.',
      'c2.h': 'Hidden exam',
      'c2.t': 'The exam is kept outside the repository: the swarm never sees it. A failing test is a blocking finding of the brief.',
      'c3.h': 'Supervisor and final review',
      'c3.t': 'A supervisor reviews every attempt and grades each criterion from evidence. At the end, an independent review covers everything that merged.',
      'brake.alt': 'Three units build while the five-hour window gauge rises. At 95 % the Lead brakes in order: nothing new starts, what is running stops and each unit saves its work on its own branch. The run sleeps, paused, until the window resets, then carries on from the branches without redoing the merged unit',
      'c4.h': 'Quota brake',
      'c4.t': 'When the five-hour window of your Claude account reaches 95 % (<code>quotabrake</code>), the plugin warns you. In an autonomous run the Lead brakes in order: nothing new starts, what is running stops and the work of each unit is saved on its own branch. The run pauses, it does not end: when the window resets it carries on by itself, without redoing what is already merged. Only your own words turn the brake off.',
      'term.lines': [
        '$ git push origin main',
        '# aether-guard: no grant covers this push',
        '# appended to .aether/pending.jsonl, the owner\'s list',
        '# by default it only records; with AETHER_IRREVERSIBLE=enforce it also refuses'
      ],
      'yes.title': 'NEEDS YOUR YES',
      'yes.empty': '// the list is empty',
      'yes.item': 'git push origin main',
      'yes.meta': 'push · no grant covers it · will run: git push origin main',
      'yes.bar': 'NEEDS YOUR YES',

      'lanes.tag': '// 06 · LANES',
      'lanes.title': 'Superdelegation:<br><em>other plans\' quota</em>',
      'lanes.intro': 'With <code>superdelegation</code> on, everything that is not the Lead runs first on another coding plan you already pay for, while that plan\'s quota lasts. When a harness is missing, out of quota or fails to start, the same call goes to the next candidate, and to Claude\'s native agent when none is left, without spending the ladder.',
      'lanes.alt': 'Task cards fall down a shaft into the first lane with quota left; when a lane runs dry the next card moves to the next one, down to the native Claude agent, which never runs out, and the quotas renew',
      'lanes.native': 'NATIVE AGENT',
      'lanes.st.idle': 'free', 'lanes.st.use': 'in use', 'lanes.st.low': 'under the reserve',
      'lanes.st.noread': 'no quota reading', 'lanes.st.fail': 'failed for quota',
      'lanes.st.native': 'native call',
      'lanes.f1': '<strong>Off by default</strong>With <code>superdelegation</code> off, every call that is not the Lead\'s runs on native Claude, whatever the quota. It runs only on Linux.',
      'lanes.f2': '<strong>Points ask, quota orders</strong>Each call asks for the intelligence points of its Claude pair, model and effort, with 1 point of tolerance. The quota whose weekly window renews first goes first, and within it the cheapest pair per task; a 5% reserve leaves out any group that touches it.',
      'lanes.f3': '<strong>No reading, try it</strong>Codex and Cursor report no quota, and Muse reports it only after a call: they are tried after, until a call fails for quota. The call then goes on to the next. Muse\'s pair enters by the owner\'s decision and goes last within its quota.',
      'lanes.f4': '<strong>What is proven</strong>agy was first and Grok was checked with real calls on 2026-10-13. Muse was checked with real calls on 2026-10-19. The Codex and Cursor adapters have run no real call yet.',

      'inst.tag': '// 07 · INSTALL AND AUTHORSHIP',
      'inst.title': 'Install and<br><em>start</em>',
      'inst.bar': 'CLAUDE PLUGIN INSTALL',
      'copy': 'COPY', 'copied': 'COPIED', 'copy.fail': 'Could not copy: select the command and copy it by hand.',
      'copy.ok': 'Command copied to the clipboard.',
      'st1.h': 'Install',
      'st1.t': 'Once. Add <code>--config superdelegation=true</code> to turn superdelegation on.',
      'st2.h': 'Choose Aether mode',
      'st2.t': 'The mode is chosen per session: the Lead is the agent <code>aether:lead</code>, which starts on Sonnet, and <code>--effort xhigh</code> sets its effort.',
      'st3.h': 'Tell the Lead what you want',
      'st3.t': 'The Lead confirms what it understood, writes the intent card and launches the design. You review the brief.',
      'inst.req': 'REQUIREMENTS · Claude Code 2.1.294 or later · Node.js 22 · git 2.36 or later · for superdelegation, the CLI of each harness you turn on: <code>agy</code>, <code>codex</code>, <code>grok</code>, <code>cursor-agent</code> or <code>muse</code>.',
      'atm.alt': 'A statue head gazing upward amid stardust and constellations',
      'auth.tag': '// AUTHORSHIP',
      'auth.link': 'DarkArty07 on GitHub',
      'auth.t': 'Aether Plugin is open source under the MIT license, and the successor to Aether Agents: the same method, rebuilt on a harness made for software.',
      'links.docs': 'Documentation', 'links.lic': 'License',
      'foot.t': 'The implementer, supervisor and reviewer agents adapt prompt templates of superpowers; the Aether preset adapts GitHub Spec Kit\'s templates; several pieces port ideas from oh-my-claudecode, all under the MIT License. The text inside the windows is illustrative.',
      'foot.indep': 'Aether is an independent project; it is not affiliated with or endorsed by Anthropic.',
      'foot.top': 'Back to the origin ↑', 'foot.gal': 'More animations →',
      'motion.pause': 'Pause animation', 'motion.play': 'Enable animation',
      'motion.calm': 'Your system asks for less motion: calm animation.', 'motion.full': 'Play full',
      'motion.fullon': 'Full animation, though your system asks for less motion.', 'motion.tocalm': 'Calm it'
    }
  };

  var S = { lang: 'es', run: true, calm: false, mode: 'full' };
  function t(k) {
    var d = DICT[S.lang];
    return d[k] !== undefined ? d[k] : DICT.es[k];
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var INSTALL_CMD = 'claude plugin install aether --marketplace DarkArty07/aether-plugin';
  var langHooks = [];

  function applyLang() {
    html.lang = S.lang;
    var es = S.lang === 'es';
    var title = es ? 'Aether Plugin · modo Aether para Claude Code' : 'Aether Plugin · Aether mode for Claude Code';
    var desc = es
      ? 'Aether es un plugin de Claude Code que añade un modo Aether opcional: un Lead convierte tu intención en una spec y un plan revisados, los construye con un swarm paralelo y te informa en un solo brief.'
      : 'Aether is a Claude Code plugin that adds an opt-in Aether mode: a Lead turns your intent into a reviewed spec and plan, builds it with a parallel swarm and reports back in one brief.';
    document.title = title;
    [['meta[name="description"]', desc], ['meta[property="og:title"]', title], ['meta[property="og:description"]', desc],
     ['meta[property="og:locale"]', es ? 'es_ES' : 'en_US'], ['meta[property="og:locale:alternate"]', es ? 'en_US' : 'es_ES'],
     ['meta[name="twitter:title"]', title], ['meta[name="twitter:description"]', desc]].forEach(function (p) {
      var m = $(p[0]); if (m) m.setAttribute('content', p[1]);
    });
    $$('[data-i18n]').forEach(function (el) { var v = t(el.getAttribute('data-i18n')); if (typeof v === 'string') el.textContent = v; });
    $$('[data-i18n-html]').forEach(function (el) { var v = t(el.getAttribute('data-i18n-html')); if (typeof v === 'string') el.innerHTML = v; });
    $$('[data-i18n-alt]').forEach(function (el) { el.setAttribute('alt', t(el.getAttribute('data-i18n-alt'))); });
    $$('[data-i18n-label]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label'))); });
    $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === S.lang)); });
    $('#motion-l').textContent = t(S.run ? 'motion.pause' : 'motion.play');
    langHooks.forEach(function (fn) { fn(); });
  }

  /* ------------------------------------------------------------------ */
  /* Timing helpers (cancellable, pausable, rAF based)                   */
  /* ------------------------------------------------------------------ */
  function wait(ms, ctl) {
    return new Promise(function (res, rej) {
      var acc = 0, last = performance.now();
      (function f(now) {
        if (!ctl.alive()) { rej(CANCEL); return; }
        var d = now - last; last = now;
        if (d > 200) d = 16;
        if (!(ctl.hold && ctl.hold())) acc += d;
        if (acc >= ms) res(); else requestAnimationFrame(f);
      })(last);
    });
  }
  function anim(ms, fn, ctl, linear) {
    return new Promise(function (res, rej) {
      var acc = 0, last = performance.now();
      (function f(now) {
        if (!ctl.alive()) { rej(CANCEL); return; }
        var d = now - last; last = now;
        if (d > 200) d = 16;
        if (!(ctl.hold && ctl.hold())) acc += d;
        var p = Math.min(1, acc / ms);
        fn(linear ? p : (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2));
        if (p >= 1) res(); else requestAnimationFrame(f);
      })(last);
    });
  }

  var comps = [];
  /* A component runs `run(ctl)` while it is visible and motion is on; otherwise `still()` shows its final state.
     In full motion `run` loops; in calm motion (ctl.calm) it plays once, and afterwards the final state stays. */
  var TH = [0, .05, .1, .15, .2, .25, .3, .35, .4, .45, .5, .6, .7, .8, .9, 1];
  function component(el, run, still, opts) {
    opts = opts || {};
    var c = { tok: 0, vis: false, el: el, done: false };
    c.ctl = function (my) { return { alive: function () { return my === c.tok; }, hold: opts.hold, calm: S.calm }; };
    c.sync = function () {
      c.tok++;
      if (!S.run || (S.calm && c.done)) { still(); return; }
      if (c.vis) {
        var my = c.tok;
        Promise.resolve().then(function () { return run(c.ctl(my), my); })
          .then(function () { if (my === c.tok && S.calm) c.done = true; })
          .catch(function (e) { if (e !== CANCEL) { console.error(e); } });
      }
    };
    /* Visible = enough of the element is on screen, or it fills half the viewport (tall sections never reach a ratio). */
    var io = new IntersectionObserver(function (es) {
      var e = es[es.length - 1], vh = (e.rootBounds && e.rootBounds.height) || window.innerHeight;
      var v = e.isIntersecting && (e.intersectionRatio >= (opts.th || 0.25) || e.intersectionRect.height >= vh * 0.5);
      if (v !== c.vis) { c.vis = v; c.sync(); }
    }, { threshold: TH });
    io.observe(el);
    comps.push(c);
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* Typed text                                                          */
  /* ------------------------------------------------------------------ */
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function lineHtml(l, n) {
    var txt = n === undefined ? l : l.slice(0, n);
    if (l.indexOf('$ ') === 0) {
      var rest = txt.length > 2 ? txt.slice(2) : '';
      return '<span class="p">$</span>' + (txt.length > 1 ? ' ' : '') + '<span class="k">' + esc(rest) + '</span>';
    }
    var cls = l.indexOf('## ') === 0 ? 'h' : (l.charAt(0) === '#' ? 'c' : (l.charAt(0) === '-' ? 'li' : 'k'));
    return '<span class="' + cls + '">' + esc(txt) + '</span>';
  }
  function allHtml(lines) { return lines.map(function (l) { return lineHtml(l); }).join('\n'); }
  function typedHtml(lines, upto, caret) {
    var out = [], i, rem = upto;
    for (i = 0; i < lines.length; i++) {
      if (rem <= 0) break;
      var n = Math.min(lines[i].length, rem);
      out.push(lineHtml(lines[i], n));
      rem -= lines[i].length + 1;
    }
    return out.join('\n') + (caret ? '<span class="caret"></span>' : '');
  }
  function totalChars(lines) { return lines.reduce(function (a, l) { return a + l.length + 1; }, 0); }

  /* ------------------------------------------------------------------ */
  /* Pixel GIFs (img.px)                                                 */
  /* ------------------------------------------------------------------ */
  /* A GIF starts when it comes into view, so its story begins at its first frame, and it is not fetched before.
     It freezes (a canvas copy of the frame on screen) when motion is paused or calm. Without JavaScript a noscript copy of the image plays it. */
  var pxImgs = $$('img.px');
  function pxSync(img) {
    var frozen = S.mode !== 'full', still = img._still;
    if (!frozen) { if (still) still.hidden = true; img.hidden = false; return; }
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
  langHooks.push(function () { pxImgs.forEach(function (i) { if (i._still) i._still.setAttribute('aria-label', i.alt); }); });

  /* ------------------------------------------------------------------ */
  /* Motion state                                                        */
  /* ------------------------------------------------------------------ */
  /* Three modes: 'full', 'calm' (the OS asks for reduced motion: no large or looping motion,
     the sequences play once as fades) and 'off' (paused by the toggle: every final state shown). */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefFull = load('aether-landing-motion') === 'full';
  function wantMode() { return reduce.matches && !prefFull ? 'calm' : 'full'; }
  function updateNote() {
    var n = $('#mnote'), show = reduce.matches && S.run;
    n.hidden = !show;
    if (!show) return;
    $('#mnote-t').textContent = t(S.calm ? 'motion.calm' : 'motion.fullon');
    $('#mnote-b').textContent = t(S.calm ? 'motion.full' : 'motion.tocalm');
  }
  function setMode(m) {
    var on = m !== 'off';
    S.mode = m; S.run = on; S.calm = m === 'calm';
    html.classList.toggle('anim', on);
    html.classList.toggle('calm', S.calm);
    html.setAttribute('data-motion', on ? (S.calm ? 'calm' : 'running') : 'paused');
    var b = $('#motion');
    b.setAttribute('aria-pressed', String(!on));
    $('.motion-i', b).textContent = on ? '❚❚' : '▶';
    $('#motion-l').textContent = t(on ? 'motion.pause' : 'motion.play');
    updateNote();
    pxImgs.forEach(pxSync);
    comps.forEach(function (c) { c.done = false; c.sync(); });
    if (on) { revealCheck(); }
    onScroll();
  }

  /* ------------------------------------------------------------------ */
  /* Reveal on scroll                                                    */
  /* ------------------------------------------------------------------ */
  var revealIO = null;
  function revealCheck() {
    if (revealIO) revealIO.disconnect();
    revealIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('.reveal:not(.in)').forEach(function (el) { revealIO.observe(el); });
  }

  /* ------------------------------------------------------------------ */
  /* Hero                                                                */
  /* ------------------------------------------------------------------ */
  $$('.wm span').forEach(function (s, i) { s.style.setProperty('--k', i); });

  /* Parallax only in full motion; one write per frame, and none when the value has not changed. */
  var par = $('#heropar'), ticking = false, lastPar = null;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY || window.pageYOffset;
      var v = S.mode === 'full' && y < window.innerHeight * 1.4 ? 'translate3d(0,' + Math.round(y * 0.16) + 'px,0)' : '';
      if (par && v !== lastPar) { par.style.transform = v; lastPar = v; }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* An image fades in, and its animation starts, only once it is decoded. */
  function whenReady(img) {
    if (!img) return;
    var done = false;
    function ok() { if (!done) { done = true; img.classList.add('ready'); } }
    if (img.decode) img.decode().then(ok, function () { if (img.complete) ok(); else img.addEventListener('load', ok); });
    else if (img.complete && img.naturalWidth) ok();
    else img.addEventListener('load', ok);
    img.addEventListener('error', ok);
  }
  whenReady($('.hero-img'));

  /* Looping CSS animations pause while their section is off screen (.off, see style.css). */
  var offIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target.classList.toggle('off', !e.isIntersecting); });
  }, { rootMargin: '80px 0px' });
  $$('main > section').forEach(function (s) { offIO.observe(s); });

  /* ------------------------------------------------------------------ */
  /* Nav                                                                 */
  /* ------------------------------------------------------------------ */
  var menu = $('#menubtn'), links = $('#navlinks');
  menu.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  $$('a', links).forEach(function (a) { a.addEventListener('click', function () { links.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') { links.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); } });
  var secIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      $$('.nav-links a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-sec') === e.target.id); });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main > section').forEach(function (s) { secIO.observe(s); });

  $$('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      S.lang = b.getAttribute('data-lang');
      store('aether-landing-lang', S.lang);
      applyLang();
    });
  });

  /* ------------------------------------------------------------------ */
  /* 01 RADAR                                                            */
  /* ------------------------------------------------------------------ */
  (function () {
    var root = $('#radar'), cards = $$('.card', root).slice(0, 5), acr = $$('.acr li', root), acrCard = $('.card-acr', root);
    function clear() { cards.forEach(function (c) { c.classList.remove('lit'); }); acr.forEach(function (s) { s.classList.remove('lit'); }); acrCard.classList.remove('lit'); }
    function all() { cards.forEach(function (c) { c.classList.add('lit'); }); acr.forEach(function (s) { s.classList.add('lit'); }); acrCard.classList.add('lit'); }
    component(root, async function (ctl) {
      clear();
      await wait(350, ctl);
      for (var i = 0; i < 5; i++) {
        cards[i].classList.add('lit'); if (acr[i]) acr[i].classList.add('lit');
        await wait(520, ctl);
      }
      acrCard.classList.add('lit');
    }, all, { th: 0.3 });
  })();

  /* ------------------------------------------------------------------ */
  /* 02 TEAM: crabs + network                                            */
  /* ------------------------------------------------------------------ */
  var CRAB = [
    '..mmmmmmmm..',
    '..oPooooPo..',
    'oooooooooooo',
    'oooooooooooo',
    '..oooooooo..',
    '..OOOOOOOO..',
    '..O.O..O.O..',
    '..O.O..O.O..'
  ];
  var CRAB_COL = {
    green: { o: '#a6e3a1', O: '#4c9a58', m: '#d6f7d1' },
    blue: { o: '#89b4fa', O: '#4668b8', m: '#c9dcff' },
    pink: { o: '#f5c2e7', O: '#b4609f', m: '#ffe3f6' }
  };
  $$('.crab').forEach(function (svg) {
    var pal = CRAB_COL[svg.getAttribute('data-c')], body = '', legs = '';
    CRAB.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var ch = row.charAt(x);
        if (ch === '.') continue;
        var fill = ch === 'E' ? '#f6f1ff' : ch === 'P' ? '#0d0b1c' : pal[ch];
        var r = '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + fill + '"/>';
        if (y >= 6) legs += r; else body += r;
      }
    });
    svg.innerHTML = '<g>' + body + '</g><g class="claws">' + legs + '</g>';
  });

  (function () {
    var team = $('#team'), net = $('#net'), lead = $('#role-lead'), cards = $$('.roles .role', team);
    var NS = 'http://www.w3.org/2000/svg';
    function mk(tag, attrs) { var e = doc.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
    function layout() {
      var cr = team.getBoundingClientRect(), lr = lead.getBoundingClientRect();
      var wasDrawn = net.classList.contains('drawn');
      net.innerHTML = '';
      if (cr.width < 1) return;
      net.setAttribute('viewBox', '0 0 ' + cr.width + ' ' + cr.height);
      var x0 = lr.left + lr.width / 2 - cr.left, y0 = lr.bottom - cr.top;
      var rects = cards.map(function (c) { return c.getBoundingClientRect(); });
      var y1 = rects[0].top - cr.top, mid = y0 + (y1 - y0) / 2;
      rects.forEach(function (r, i) {
        var xi = r.left + r.width / 2 - cr.left;
        var d = 'M' + x0 + ' ' + y0 + ' V' + mid + ' H' + xi + ' V' + y1;
        var g = mk('g', { style: '--j:' + i });
        g.appendChild(mk('path', { d: d, class: 'base', pathLength: '1' }));
        g.appendChild(mk('path', { d: d, class: 'flow' }));
        g.appendChild(mk('circle', { cx: xi, cy: y1, r: 4, class: 'nd' }));
        net.appendChild(g);
      });
      var j = mk('circle', { cx: x0, cy: y0, r: 4, class: 'nd' }); net.appendChild(j);
      if (wasDrawn) net.classList.add('drawn');
    }
    var rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 120); });
    langHooks.push(function () { setTimeout(layout, 60); });
    window.addEventListener('load', layout);
    setTimeout(layout, 0);
    component(team, async function (ctl) {
      layout();
      net.classList.remove('drawn');
      await wait(400, ctl);
      net.classList.add('drawn');
    }, function () { layout(); net.classList.add('drawn'); }, { th: 0.2 });
  })();

  /* ------------------------------------------------------------------ */
  /* 03 PATHS                                                            */
  /* ------------------------------------------------------------------ */
  var small = window.matchMedia('(max-width: 640px)');
  function mergeText(n) { return small.matches ? n + '/4' : 'MERGE ' + n + '/4'; }
  function ptAt(path, len, tt, dot) {
    var p = path.getPointAtLength(len * tt);
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
  }
  function resetDia(svg) {
    $$('.pn', svg).forEach(function (n) { n.classList.remove('on', 'run', 'done'); });
    $$('.pl-on', svg).forEach(function (p) { p.style.opacity = 0; });
    $$('.dot', svg).forEach(function (d) { d.style.opacity = 0; });
    var m = $('#mergelbl', svg); if (m) m.textContent = mergeText(0);
  }
  function node(svg, n) { return $('[data-n="' + n + '"]', svg); }
  /* A dot travels the path in full motion; in calm motion the highlighted line fades in instead. */
  function travel(path, len, dot, ms, ctl) {
    if (ctl.calm) { dot.style.opacity = 0; return wait(ms, ctl); }
    dot.style.opacity = 1; ptAt(path, len, 0, dot);
    return anim(ms, function (e) { ptAt(path, len, e, dot); }, ctl);
  }
  function stillDia(svg) {
    $$('.pn', svg).forEach(function (n) { n.classList.remove('run', 'done'); n.classList.add('on'); });
    $$('.pl-on', svg).forEach(function (p) { p.style.opacity = 1; });
    $$('.dot', svg).forEach(function (d) { d.style.opacity = 0; });
    var m = $('#mergelbl', svg); if (m) m.textContent = mergeText(4);
  }

  $$('.path').forEach(function (art) {
    var type = art.getAttribute('data-path'), svg = $('svg', art), holding = false;
    function setHold(v) { holding = v; art.classList.toggle('hold', v); }
    art.addEventListener('mouseenter', function () { setHold(true); });
    art.addEventListener('mouseleave', function () { setHold(false); });
    art.addEventListener('focus', function () { setHold(true); });
    art.addEventListener('blur', function () { setHold(false); });
    if (!svg) return;   // a GIF diagram has no script to run
    var opts = { th: 0.3, hold: function () { return holding; } };
    var dots = $$('.dot', svg);

    if (type === 'direct') {
      var p1 = $('#d-p1', svg), L1 = p1.getTotalLength();
      component(art, async function (ctl) {
        do {
          resetDia(svg);
          await wait(450, ctl);
          node(svg, 'lead').classList.add('on');
          await wait(600, ctl);
          p1.style.opacity = 1;
          await travel(p1, L1, dots[0], 1500, ctl);
          node(svg, 'res').classList.add('on'); dots[0].style.opacity = 0;
          if (ctl.calm) return;
          await wait(2400, ctl);
        } while (true);
      }, function () { stillDia(svg); }, opts);
    } else if (type === 'delegate') {
      var a = $('#t-p1', svg), b = $('#t-p2', svg), La = a.getTotalLength(), Lb = b.getTotalLength();
      component(art, async function (ctl) {
        do {
          resetDia(svg);
          await wait(450, ctl);
          node(svg, 'lead').classList.add('on');
          await wait(800, ctl);
          a.style.opacity = 1;
          await travel(a, La, dots[0], 1100, ctl);
          dots[0].style.opacity = 0;
          node(svg, 'sub').classList.add('run');
          await wait(1500, ctl);
          node(svg, 'sub').classList.remove('run'); node(svg, 'sub').classList.add('done');
          b.style.opacity = 1;
          await travel(b, Lb, dots[0], 1100, ctl);
          node(svg, 'res').classList.add('on'); dots[0].style.opacity = 0;
          if (ctl.calm) return;
          await wait(2400, ctl);
        } while (true);
      }, function () { stillDia(svg); $$('.pn[data-n="sub"]', svg).forEach(function (n) { n.classList.add('on'); }); }, opts);
    } else {
      var lines = $$('#s-lines .pl', svg), outs = lines.slice(0, 4), ins = lines.slice(4, 8), lr = lines[8], rb = lines[9];
      var lens = lines.map(function (l) { return l.getTotalLength(); });
      var mergeLbl = $('#mergelbl', svg);
      // draw the highlight copies of the lines on demand
      function hi(d) { var p = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('class', 'pl pl-on'); svg.insertBefore(p, svg.querySelector('.pn')); p.getBoundingClientRect(); p.style.opacity = 1; return p; }
      var extras = [];
      function clearExtras() { extras.forEach(function (p) { p.remove(); }); extras = []; }
      component(art, async function (ctl) {
        do {
          clearExtras(); resetDia(svg);
          await wait(450, ctl);
          node(svg, 'lead').classList.add('on');
          await wait(700, ctl);
          var i;
          for (i = 0; i < 4; i++) { extras.push(hi(outs[i].getAttribute('d'))); if (!ctl.calm) { dots[i].style.opacity = 1; ptAt(outs[i], lens[i], 0, dots[i]); } }
          if (ctl.calm) await wait(1100, ctl);
          else await anim(1100, function (e) { for (var k = 0; k < 4; k++) ptAt(outs[k], lens[k], e, dots[k]); }, ctl);
          for (i = 0; i < 4; i++) { node(svg, 'u' + i).classList.add('run'); dots[i].style.opacity = 0; }
          await wait(1700, ctl);
          for (i = 0; i < 4; i++) {
            extras.push(hi(ins[i].getAttribute('d')));
            await travel(ins[i], lens[4 + i], dots[0], 650, ctl);
            dots[0].style.opacity = 0;
            node(svg, 'u' + i).classList.remove('run'); node(svg, 'u' + i).classList.add('done');
            node(svg, 'merge').classList.add('on');
            mergeLbl.textContent = mergeText(i + 1);
            await wait(420, ctl);
          }
          extras.push(hi(lr.getAttribute('d')));
          await travel(lr, lens[8], dots[0], 600, ctl);
          node(svg, 'review').classList.add('on');
          await wait(1000, ctl);
          extras.push(hi(rb.getAttribute('d')));
          await travel(rb, lens[9], dots[0], 500, ctl);
          dots[0].style.opacity = 0;
          node(svg, 'brief').classList.add('on');
          if (ctl.calm) return;
          await wait(2800, ctl);
        } while (true);
      }, function () {
        clearExtras(); stillDia(svg);
        $$('.pn-u', svg).forEach(function (n) { n.classList.remove('on'); n.classList.add('done'); });
        lines.forEach(function (l) { l.style.stroke = 'var(--mauve)'; });
      }, opts);
      // restoring the line colour when motion resumes
      comps[comps.length - 1].resetLines = function () { lines.forEach(function (l) { l.style.stroke = ''; }); };
      var cmp = comps[comps.length - 1], origSync = cmp.sync;
      cmp.sync = function () { if (S.run) cmp.resetLines(); origSync(); };
    }
  });

  /* ------------------------------------------------------------------ */
  /* 04 FLOW                                                             */
  /* ------------------------------------------------------------------ */
  (function () {
    var tl = $('#tl'), items = $$('li', tl), num = $('#tl-num'), txt = $('#tl-text'), all = $('#tl-all'), box = $('.flow'), hold = false, cur = 0;
    function show(k) {
      cur = k;
      items.forEach(function (li, i) { li.classList.toggle('on', i === k); li.classList.toggle('past', i < k); });
      num.textContent = '#' + (k + 1);
      txt.textContent = t('flow.d' + k);
    }
    function buildAll() {
      all.innerHTML = items.map(function (li, i) { return '<li><i>' + String(i + 1).padStart(2, '0') + '</i><span><b>' + esc(t('flow.s' + i)) + '</b> · ' + esc(t('flow.d' + i)) + '</span></li>'; }).join('');
    }
    box.addEventListener('mouseenter', function () { hold = true; });
    box.addEventListener('mouseleave', function () { hold = false; });
    items.forEach(function (li, i) { li.addEventListener('mouseenter', function () { show(i); }); });
    /* The detail text changes length with each step; reserve the tallest one, so the page below does not move while it cycles. */
    function fit() {
      if (!S.run || !txt.offsetHeight) return;
      txt.style.minHeight = '';
      var keep = cur, max = 0;
      for (var k = 0; k < items.length; k++) { txt.textContent = t('flow.d' + k); max = Math.max(max, txt.offsetHeight); }
      txt.style.minHeight = max + 'px';
      txt.textContent = t('flow.d' + keep);
    }
    var fitTimer = null;
    window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 150); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    langHooks.push(function () { buildAll(); show(cur); fit(); });
    buildAll();
    component(box, async function (ctl) {
      fit();
      for (var k = 0; ; k = (k + 1) % items.length) {
        show(k);
        if (ctl.calm && k === items.length - 1) return;
        await wait(ctl.calm ? 2800 : 2300, ctl);
      }
    }, function () {
      if (S.run) { show(items.length - 1); return; }
      items.forEach(function (li) { li.classList.remove('on'); li.classList.add('past'); });
    }, { th: 0.3, hold: function () { return hold; } });
  })();

  /* typed windows */
  function typedWindow(winEl, pre, getLines, afterTyped) {
    var ghost = $('.t-ghost', pre), live = $('.t-live', pre);
    function fill() { ghost.innerHTML = allHtml(getLines()); }
    langHooks.push(fill); fill();
    /* Full motion types each line at a steady pace and rewrites the DOM only when a character appears;
       calm motion fades the lines in one by one. Before a loop restarts, the text fades out. */
    return component(winEl, async function (ctl) {
      do {
        var lines = getLines(), n = totalChars(lines), i, done = 0;
        live.classList.remove('out');
        live.innerHTML = ctl.calm ? '' : '<span class="caret"></span>';
        if (afterTyped && afterTyped.reset) afterTyped.reset();
        await wait(ctl.calm ? 300 : 500, ctl);
        for (i = 0; i < lines.length; i++) {
          var len = lines[i].length, base = done;
          if (ctl.calm) {
            live.innerHTML = lines.slice(0, i).map(function (l) { return lineHtml(l); }).join('\n') + (i ? '\n' : '') + '<span class="fresh">' + lineHtml(lines[i]) + '</span>';
            done += len + 1;
            await wait(i === 0 && afterTyped ? 900 : 420, ctl);
            continue;
          }
          var shown = -1;
          await anim(Math.max(120, len * 24), function (e) {
            var k = base + Math.round(e * len);
            if (k !== shown) { shown = k; live.innerHTML = typedHtml(lines, k, true); }
          }, ctl, true);
          done += len + 1;
          live.innerHTML = typedHtml(lines, done, true);
          await wait(i === 0 && afterTyped ? 650 : 180, ctl);
        }
        if (!ctl.calm) live.innerHTML = typedHtml(lines, n, false);
        if (afterTyped && afterTyped.done) afterTyped.done();
        if (ctl.calm) return;
        await wait(afterTyped && afterTyped.hold ? afterTyped.hold : 7000, ctl);
        live.classList.add('out');
        await wait(450, ctl);
      } while (true);
    }, function () { live.classList.remove('out'); live.innerHTML = allHtml(getLines()); if (afterTyped && afterTyped.still) afterTyped.still(); }, { th: 0.35 });
  }

  typedWindow($('#briefwin'), $('#brief-typed'), function () { return t('brief.lines'); }, { hold: 9000 });

  /* ------------------------------------------------------------------ */
  /* 05 CONTROL terminal                                                 */
  /* ------------------------------------------------------------------ */
  var yeswin = $('#yeswin');
  typedWindow($('#termwin'), $('#term-typed'), function () { return t('term.lines'); }, {
    hold: 7000,
    reset: function () { yeswin.classList.remove('has'); },
    done: function () { yeswin.classList.add('has'); },
    still: function () { yeswin.classList.add('has'); }
  });

  /* ------------------------------------------------------------------ */
  /* 06 LANES                                                            */
  /* ------------------------------------------------------------------ */
  (function () {
    var root = $('#lanes'), nodes = {}, order = ['agy', 'grok', 'codex', 'cursor', 'muse'], tok = $('#token'), host = $('.lanes-img', root);
    if (!tok) return;   // the lanes are a GIF now: there is no overlay to drive
    $$('.ln', root).forEach(function (n) { nodes[n.getAttribute('data-n')] = n; });
    function st(n, key) { $('.ln-st', nodes[n]).textContent = t(key); nodes[n]._st = key; }
    /* Bars drain on the compositor: one scaleX transition, no per-frame width changes. */
    function bar(n, pct, ms, ease) {
      var i = $('.ln-bar i', nodes[n]);
      i.style.transition = ms ? 'transform ' + ms + 'ms ' + (ease || 'ease') : 'none';
      i.style.setProperty('--fill', pct / 100);
    }
    function reset(ms) {
      Object.keys(nodes).forEach(function (k) {
        nodes[k].classList.remove('on', 'dry');
        st(k, 'lanes.st.idle');
        if (k !== 'native') bar(k, 100, ms);
      });
      tok.classList.remove('show');
    }
    function place(n, instant) {
      var el = nodes[n];
      var x = el.offsetLeft - el.offsetWidth / 2 - 2, y = el.offsetTop + el.offsetHeight / 2;
      if (el.style.position === 'relative' || getComputedStyle(el).position === 'relative') { tok.classList.remove('show'); return; }
      if (instant) { tok.style.transition = 'none'; }
      tok.style.setProperty('--tx', x + 'px'); tok.style.setProperty('--ty', y + 'px');
      if (instant) { void tok.offsetWidth; tok.style.transition = ''; }
      tok.classList.add('show');
    }
    langHooks.push(function () { Object.keys(nodes).forEach(function (k) { if (nodes[k]._st) st(k, nodes[k]._st); }); });
    component(root, async function (ctl) {
      var first = true;
      do {
        reset(first ? 0 : 700);
        first = false;
        await wait(900, ctl);
        for (var i = 0; i < order.length; i++) {
          var k = order[i], reading = (k === 'agy' || k === 'grok');
          if (!ctl.calm) place(k, i === 0);
          await wait(i === 0 ? 100 : 850, ctl);
          nodes[k].classList.add('on');
          st(k, 'lanes.st.use');
          if (reading) {
            bar(k, 4, 2300, 'cubic-bezier(.45,0,.55,1)');
            await wait(2300, ctl);
            st(k, 'lanes.st.low');
          } else {
            st(k, 'lanes.st.noread');
            await wait(1700, ctl);
            st(k, 'lanes.st.fail');
          }
          await wait(500, ctl);
          nodes[k].classList.remove('on'); nodes[k].classList.add('dry');
        }
        if (!ctl.calm) place('native', false);
        await wait(850, ctl);
        nodes.native.classList.add('on');
        st('native', 'lanes.st.native');
        if (ctl.calm) return;
        await wait(3600, ctl);
      } while (true);
    }, function () {
      reset(0);
      order.forEach(function (k) { nodes[k].classList.add('dry'); if (k === 'agy' || k === 'grok') bar(k, 4); st(k, (k === 'agy' || k === 'grok') ? 'lanes.st.low' : 'lanes.st.fail'); });
      nodes.native.classList.add('on'); st('native', 'lanes.st.native');
    }, { th: 0.3 });
  })();

  /* ------------------------------------------------------------------ */
  /* 07 INSTALL                                                          */
  /* ------------------------------------------------------------------ */
  (function () {
    var live = $('#inst-live');
    var line = '$ ' + INSTALL_CMD;
    component($('#instwin'), async function (ctl) {
      if (ctl.calm) {
        live.innerHTML = '';
        await wait(300, ctl);
        live.innerHTML = '<span class="fresh">' + lineHtml(line) + '</span>';
        return;
      }
      live.innerHTML = '<span class="caret"></span>';
      await wait(500, ctl);
      var shown = -1;
      await anim(INSTALL_CMD.length * 28, function (e) {
        var k = Math.round(e * line.length);
        if (k !== shown) { shown = k; live.innerHTML = typedHtml([line], k, true); }
      }, ctl, true);
      live.innerHTML = typedHtml([line], line.length, true);
    }, function () { live.innerHTML = lineHtml(line); }, { th: 0.4 });

    var btn = $('#copybtn'), msg = $('#copymsg'), tm = null;
    function say(ok) {
      msg.textContent = t(ok ? 'copy.ok' : 'copy.fail');
      if (ok) { btn.textContent = t('copied'); }
      clearTimeout(tm);
      tm = setTimeout(function () { btn.textContent = t('copy'); msg.textContent = ''; }, 2400);
    }
    function fallback() {
      var ta = doc.createElement('textarea');
      ta.value = INSTALL_CMD; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      doc.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      say(ok);
    }
    btn.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(INSTALL_CMD).then(function () { say(true); }, fallback);
      } else fallback();
    });
  })();

  /* ------------------------------------------------------------------ */
  /* Motion toggle + boot                                                */
  /* ------------------------------------------------------------------ */
  $('#motion').addEventListener('click', function () { setMode(S.run ? 'off' : wantMode()); });
  $('#mnote-b').addEventListener('click', function () {
    prefFull = S.calm;
    store('aether-landing-motion', prefFull ? 'full' : 'calm');
    setMode(wantMode());
  });
  langHooks.push(updateNote);
  if (reduce.addEventListener) reduce.addEventListener('change', function () { if (S.run) setMode(wantMode()); else updateNote(); });

  var saved = load('aether-landing-lang');
  S.lang = saved === 'en' || saved === 'es' ? saved : 'es';
  applyLang();
  /* Boot without transitions, so content does not fade out the moment motion turns on. */
  html.classList.add('boot');
  setMode(wantMode());
  void html.offsetHeight;
  requestAnimationFrame(function () { requestAnimationFrame(function () { html.classList.remove('boot'); }); });
})();
