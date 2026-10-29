# Corrida auto-20261028-155518-67ab

## Intención

> Tienes la cuenta abierta ilimitada para pruebas y trabjaa autonomamente que no estare disponible
— permiso del dueño, 2026-10-28T21:53:31.954Z

Sus palabras sobre lo que se prueba:
- «Necesito saber primero como un sonnet xhigh programa el snake. Depsues necesito saber si un sistema que programo con haiku puede alcanzar el resultado de un sonnet xhigh y que condiciones necesitamos. Despues necestio saber si un sistema mejora el resultado con skills o es lo mismo.»
- «Un modelo como haiku puede programar el resultado de uno mayor si lo guaimos bien. 2: que aportan las skills.»
- «El snake se tiene que ver bien visualmente, y estbale para jugar eso es lo que se tiene que lograr»
- «no uses modo sueprdelegacion, primero tengo que dejar desmotrado esto unciamente con los modelos que claude code tiene. Fable 5.1 queda fuera»
- «si obtenemos algo asi como el de opus pero usando haiku ahorramiamos costos muy brutos» · «ve docuemtnando que es impórtante»
- Antes: «Instala todas. Estan por algo.» (las skills de ECC y Ponytail) · «Mira trabaja en un worktree.»

Criterios:
- C1: Etapa 1 medida: Sonnet xhigh solo (Claude normal, sin Aether) construye el snake del spec de octubre.
- C2: Aether normal (0.25.1, Haiku primero, sin superdelegación) construye el mismo spec, medido igual.
- C3: Aether normal + las skills de ECC y Ponytail; lo único distinto son las skills.
- C4: Aether guiado (dirección de arte, recetas, ojos con capturas, chequeos), sin las skills de ECC.
- C5: Calificación a ciegas de todos (más los dos de octubre como anclas) con la rúbrica fija; capturas para el dueño.
- C6: Respuesta escrita con evidencia: ¿Haiku guiado alcanza a Sonnet xhigh / al de Opus de octubre?, ¿con qué condiciones?, ¿a qué costo?, ¿qué aportan las skills?
- C7: Solo modelos de Claude Code (Haiku, Sonnet, Opus), sin superdelegación, sin Fable.

## Topes

- Horas: 8 (por defecto)
- USD: 50 (por defecto; cubre swarms y lanes, no las sesiones de prueba ni mis turnos). El dueño dijo «cuenta abierta ilimitada para pruebas»: grant de sesión paid-call con esa cita.

## Decisiones

- D1: banco de pruebas · nuevo o el de octubre · el de octubre (trial 2: spec, examen oculto de 25 casos, banco de Chromium con 13 chequeos, rúbrica de 40) · así se compara también con 23/40 y 32/40 de octubre; él lo pidió («puedes buscalro») · Lead
- D2: formato del spec · tal cual o con `Intent` y `## Criteria` · añadí ambos con el mismo contenido de su primer párrafo y la cita del dueño, para que A47 los lleve a cada brief como en el método de hoy; el resto igual · el mismo archivo para todos los brazos · Lead
- D3: entorno de Sonnet solo · su Claude normal con superpowers o limpio · limpio: superpowers y ECC apagados solo en ese repo (settings.local.json); verificado con una llamada de Haiku que lista las skills (US$ 0.003) · «Sonnet xhigh haciendo el snake» es el modelo solo; superpowers metería subagentes y su método · reversible: se puede repetir con superpowers · Lead
- D4: repos de prueba fuera del árbol del plugin (`~/.cache/aether-exp-frontend/`) · para que ni el CLAUDE.md ni las skills del proyecto aether-plugin se filtren · Lead
- D5: superdelegación apagada sin tocar su configuración · `--settings` por sesión con `pluginConfigs.*.options.superdelegation=false` (y observedev/autoissue apagados para que las sesiones de prueba no abran issues); verificado: `AETHER_SUPERDELEGATION=off` con la versión instalada y con la rama · C7 · Lead
- D6: el diseño de Aether es uno solo para s2, s3 y s4 (Writer + Judge en modo corto sobre tasks.md, en una sesión Lead sin cabeza); sin Examiner porque el examen es el oculto de octubre · así s2 contra s3 difiere solo en skills, y s4 añade solo la guía · Lead
- D7 (revisada): escribí una dirección de arte propia («Lantern Night»), pero el plan del Writer ya trae la suya con números («Neon Dusk», fijada por los tests de la tarea 5). La descarté: s4 usa el mismo tema y el mismo plan que s2 y s3, y solo añade `look.md` (la lista de lo que deben mostrar las capturas, derivada del plan, sin requisitos nuevos) · así lo que cambie entre s2 y s4 son recetas, ojos y chequeos, no el tema · Lead
- D8: la skill de recetas (`threejs-game`) se verificó en Chromium antes de usarla: la primera versión salía casi negra y sin estrellas; se corrigieron luces, exposición y tamaño de las estrellas · palanca 2 · Lead
- D9: ojos (palanca 3): `scripts/shots.cjs` (Chromium, piloto automático, capturas y chequeos); el implementer lo corre y lee sus capturas; supervisor y revisor final reciben `Bash` solo para correrlo una vez y mirar el juego · prototipo en la rama `exp/frontend-guided` (dab9962) · Lead
- D10: chequeos (palanca 4): `npm run check:visual` en el comando de pruebas de s4: falla con errores de página, cuadro negro o quemado, o juego que no arranca; antes de que exista `src/main.js` se salta · Lead
- D11: skills de s3: las de su ECC instalado (2.2.2, 292) + las 6 de Ponytail = 298, en `.claude/skills/` del repo de s3; rama `exp/frontend-skills` (01647c5) da la herramienta Skill a implementer, supervisor y revisor; sin instrucción extra de usarlas (lo realista) · Lead
- D12: calificación: un Opus nuevo por build, a ciegas (letras al azar), con la rúbrica de octubre, 9 capturas por build más los datos del banco; dos rondas · los dos builds de octubre entran como anclas · Lead
- D13: una quinta corrida, s5 «plan rico» · parar con 4 o probar la condición que salió · probarla: Opus (yo) escribe una dirección de arte rica dentro de Neon Dusk (entorno con horizonte, decorado, serpiente con más presencia, cámara y luz que respondan a las críticas del juez), el Writer la lleva al plan con tests, el Judge la revisa en modo corto, y el swarm guiado la construye en Haiku · C6: el dueño pidió «qué condiciones necesitamos»; sin esta corrida la condición es solo hipótesis · cuesta ~US$ 15-20 y ~1.5 h; él dio «cuenta abierta ilimitada para pruebas» · Lead

## Descubrimientos

- El snake de octubre está en la historia de git (borrado del árbol el 2026-10-26, commit 26bcac2). De las seis técnicas que propuso trial 2, solo la 1 se construyó (A47, la intención del spec en cada brief); la dirección de arte, la revisión visual, la ola de pulido y pasar notas adelante no.
- Los implementers de Aether no tienen la herramienta Skill y los subagentes no heredan skills: instalar skills sin más no les llega.
- ECC 2.2.2 ya está instalado como plugin del dueño, deshabilitado. 311 skills; casi nada de three.js.
- La versión instalada es 0.25.1 (otra sesión la publicó); el worktree parte de origin/main 3b53a29 = 0.25.1.
- three.js r186 depreca `PCFSoftShadowMap` y `Clock`; con un `EffectComposer`, `renderer.info` cuenta solo la última pasada (1 draw call) salvo `autoReset = false`: el `getRenderInfo()` de octubre medía mal por eso. Son trampas que un modelo chico repite de memoria.
- **La palanca 1 ya existe en el método de hoy:** el Writer (Sonnet) escribió un plan de 12 tareas con dirección de arte completa: paleta, luces con intensidades, la cabeza modelada, los estudios que brillan, las chispas, el anillo, la sacudida de cámara, el HUD con sus gradientes. Hasta cita las trampas de r186 (`PCFShadowMap`, `info.autoReset`). El Judge (Opus) lo revisó. Haiku recibe la dirección de arte en cada brief.
- El banco de octubre reproduce hoy sus números exactos (Aether 12/13 y 25/25; normal 13/13 y 24/25). Los fps en software no sirven: el mismo build de octubre dio 11.8 y 41.3 fps según la carga de la máquina; se quitaron de los datos del juez.
- Los ojos: `shots.cjs` con `clock.runFor` tardaba 4 min 13 s (dibuja cada 16 ms); con `clock.fastForward` tarda 54 s. Una vista previa (`scripts/preview.html`) monta mundo, serpiente y HUD antes de que exista `main.js`, así las tareas 8, 9 y 10 también ven su trabajo (probado con las piezas de octubre: 48 s).
- El campo `skills:` de un agente del plugin sí precarga la skill (probado: el implementer citó el título y R16 sin herramientas). Los agentes de Aether no existen en una sesión normal, solo en la del Lead.

## Espera tu sí

## Propuestas

## Estado

- Worktree `.worktrees/exp-frontend`, rama `exp/frontend-guided` (desde 3b53a29).
- Repos de prueba en `~/.cache/aether-exp-frontend/`: base (3f408dd: spec + esqueleto), s1-sonnet.
- Etapa 1 terminada: Sonnet xhigh solo, US$ 4.34 (list), 28.6 min, 88 turnos, 110 tests verdes, commit 7192bb3, tema «Abyssal Glow» (fondo marino, como el normal de octubre). Por su cuenta instaló Playwright en /tmp y probó el juego en Chromium: se dio ojos solo. Banco: 13/13 chequeos, examen oculto 25/25, 0 errores, 93 draw calls, 60k triángulos, 7.1 fps en software. Se ve rico (rocas, algas, orbes, medusa como comida, HUD con teclas): es una marca alta. Capturas enviadas al dueño.
- Diseño compartido terminado: Writer (Sonnet) + Judge (Opus), ronda 1 `revise` (1 bloqueante: un test de encuadre imposible en 4×4; 1 mayor: estrellas fuera de cuadro; 5 menores), ronda 2 `approve` con 3 menores. 12 tareas en 4 olas (6, 4, 1, 1). US$ 9.27 list, 65 min de reloj (Sonnet 2.93, Opus 6.34). El flujo corrió el Examiner aunque se pidió que no (el método rehace el examen al cambiar el plan); su examen quedó en data-d-design/exams y no se usa. Commit 80a1e3f.
- s2-normal, s3-skills, s4-guided preparados desde 80a1e3f (s4: 40c634e con look.md, shots, preview y `npm test && npm run check:visual`; aether-plan check pasa). Integración `.worktrees/integration` en `feature/snake` en cada uno.
- Juez a ciegas, ronda 1a (Opus nuevo por build, US$ 0.23 cada uno): oct-normal 28/40 (en octubre 32), oct-aether 22/40 (en octubre 23), s1-sonnet 28/40. El juez reproduce el orden de octubre: está calibrado. **Respuesta a la pregunta 1 del dueño: Sonnet xhigh solo hace un snake tan bueno como el modo normal de octubre (Opus + subagentes Sonnet xhigh), por US$ 4.34 y 29 min contra US$ 21.95 y 2 h 18 min.** Ambos «parecen juego terminado»; el Aether de octubre no.
- **s2-normal terminado:** 12/12 en Haiku al primer intento, 0 subidas; revisor final Opus «ready-with-fixes» (2 importantes que el Lead arregló: BEST que bajaba sin storage, badge NEW BEST tapado con reduced-motion; 21 menores sin trabajar); 135 tests verdes; `feature/snake` en 632e03c. Sesión US$ 6.68 (total_cost_usd): Opus 4.91, Sonnet 1.57, Haiku 0.20 (¡los implementers cuestan 3 %!). 22.2 min de reloj. Su Lead notó que `/tmp/compile.json` lo pisó otra sesión paralela y recompiló con `--run` (sin daño: cada repo corrió su propio swarm, verificado).
- **s3-skills terminado:** 12/12 en Haiku al primer intento, 0 subidas; revisor «ready-with-fixes» con los mismos 2 importantes que s2 (arreglados por el Lead) y 21 menores; 135 tests; `feature/snake` en 970fb37. Sesión US$ 7.78: Opus 5.30, Sonnet 2.01, Haiku 0.48. 25.8 min.
- **Hallazgo clave de skills:** en s3 ningún implementer, supervisor ni revisor invocó una sola de las 298 skills (la única llamada a Skill fue el Lead cargando `aether:swarm`). Los agentes sí tenían la herramienta y la lista, pero la lista traía solo nombres (`- frontend-patterns`, `- frontend-slides`…), sin descripción: el presupuesto del 1 % las recorta. Instaladas así, las skills no aportan nada y cuestan (Haiku US$ 0.48 contra 0.20 en s2, por el contexto extra).
- **s4-guided terminado:** 12/12 en Haiku al primer intento, 0 subidas; revisor `ready` con 4 menores, todos visuales y vistos en sus capturas (cuadros oscuros, media 10-17/255; la tarjeta del título tapa la serpiente; el disco del suelo con borde duro; títulos partidos en dos líneas); `npm test && npm run check:visual` verde; `feature/snake` en 1692904. Sesión US$ 3.00; run US$ 2.69 (implementers 0.69, supervisores 0.95, revisor 0.65, ops 0.04, main 0.35). 27.6 min, con 4 lanzamientos.
- **Banco de s2, s3 y s4:** los tres 13/13 chequeos y 25/25 en el examen oculto, 0 errores (igual que Sonnet solo). Lo «estable para jugar» lo logran todos.
- **Las capturas de s2, s3 y s4 son casi idénticas:** el mismo tablero neón, limpio y vacío, con el disco gris del suelo detrás. El plan fija la geometría, los colores y las intensidades con tests; Haiku lo transcribe fiel. Ni las skills ni los ojos cambian el aspecto: **el techo visual lo pone el plan, no Haiku.** La escena de Sonnet solo es mucho más rica (rocas, algas, orbes, medusa) porque Sonnet diseñó y construyó a la vez, sin un plan que lo limite.
- **Juez a ciegas, 2 rondas (Opus nuevo por build, letras al azar; ±1 entre rondas; US$ 2.75 en total):** oct-normal 28.5, s1-sonnet 28.5, s2-normal 26.0, s4-guided 26.0, s3-skills 23.5, oct-aether 22.0. Todos menos oct-aether «parecen juego terminado». Las críticas comunes: serpiente pequeña en un tablero grande y cámara lejana (incluso en Sonnet solo); a los de Aether, además, «escena plana, tema genérico, esferas simples».
- **Lectura:** (1) Aether hoy subió de 22 a 26 respecto de octubre (A47 y la dirección de arte del Writer). (2) Haiku ejecutó el plan perfecto (12/12 a la primera, 25/25, 13/13) por US$ 0.20–0.69: no es Haiku lo que limita. (3) Ni las skills (s3) ni la guía (s4) movieron la nota: el plan fija el aspecto. (4) La brecha con Sonnet solo (2.5 puntos, en creatividad y 3D) es de diseño: el plan pide una escena más pobre que la que Sonnet inventó solo. Hipótesis: la condición es un plan con un diseño visual rico, no más ayuda para Haiku.
- **Los ojos se usaron:** los implementers de las tareas visuales corrieron `npm run shots` y leyeron imágenes (task-9 ~14, task-10 ~8, task-12 ~8, task-8 ~3); supervisores de 8, 9, 10, 12 y el revisor final también. Cambios por mirar: task-9 agrandó las pupilas (el brillo las borraba); task-10 rehízo la tarjeta del HUD y la verificó; task-8 vio el disco del suelo gris (fijado por el plan: lo dejó como inquietud); task-12 no cambió nada. Límite: la vista previa de task-9 no tenía el mundo (task-8 no estaba en su worktree), así que juzgó sobre fondo oscuro. Un fallo del script: «clock.pauseAt: Cannot fast-forward to the past» una vez (se repitió y pasó).
- **Dos confusiones en s4 (no son de la guía):**
  1. Tras los relanzamientos, la revisión final se planeó solo con la última tanda (task-12): 1 Opus a `high` sin porciones, en lugar de 5 porciones a `xhigh` como en s2 y s3. El paquete sí cubría todo el run (base 40c634e → 1692904), pero la lista de unidades y los menores diferidos eran solo de task-12. Por eso el revisor costó US$ 0.65 y no ~5: el ahorro de s4 viene de ese bug, no de la guía. Para issue.
  2. Los Leads de s3 y s4 compilaron con el `aether-plan` del PATH, que no es el bin de la rama: el mod deja entonces cada comando ops a un modelo (Haiku; 163 peticiones en s4) en vez de correrlo él (issue 008/#13). Tres de esas llamadas volvieron con -1 (task-4 dos veces, task-12) y bloquearon unidades: 3 relanzamientos. s2 compiló con la ruta explícita de 0.25.1 y no tuvo ops por modelo.
- **Causa exacta del -1:** el agente ops de Haiku corrió `aether-wt ladder` bien (su stdout es el JSON correcto, `"status":"open"`) pero puso `"exitCode": -1` en su respuesta estructurada; `opsOnce()` lo toma como falla. Llegó a un modelo porque el Lead compiló con el `aether-plan` del PATH, que es el de **0.25.0** (ni siquiera 0.25.1). Confirmado en el código: `reviewPlan()`/`reviewSlices()`/`reviewerPrompt()` leen `units` de la tanda; #5 (cerrado) arregló solo el paquete. Issues abiertos: #122 (revisión final tras relanzar) y #123 (ops por Haiku con exitCode -1; PATH con 0.25.0).
- s4-guided (detalle anterior): dos fallas de infraestructura `aether-wt ladder <run> task-N exited with -1` (task-4 en el lanzamiento 1, task-12 en el 2): unidades bloqueadas por no poder leer la escalera, no por calidad; su Lead relanzó. La familia del issue #118 (fallas silenciosas de ops). Para issue al final.
- s5 «plan rico» (D13): `art.md` enriquecido escrito (sol synthwave, piso de rejilla al horizonte, montañas, figuras flotantes, destellos, haces; serpiente continua con visor, luz y estela; faro en la comida; cámara más baja; exposición 1.25; tarjeta del título en el tercio inferior). Repo d5-rich (58d06ae). Sesión de diseño lanzada 17:45 (b35o14d5j): Writer revisa plan y tareas, Judge en modo corto.
- Diseño rico aprobado: Writer revisó tareas 8, 9, 10, 12 y añadió la 13 (`src/render/horizon.js`); Judge ronda 1 `revise` (1 mayor: tinte de game over invisible; 3 menores), ronda 2 `approve` (2 menores). 13 tareas, 4 olas. US$ 11.47, 56 min (Sonnet 5.59, Opus 5.89; incluye otro Examiner). Decisión del Writer más allá de art.md: cámara de 70° de campo para que el sol y las montañas entren.
- s5-rich preparado (ff0bfed, igual que s4: shots con vista previa del horizonte, look.md del plan rico, `npm test && npm run check:visual`, la skill) y lanzado 18:44 (bso2mk91b), rama exp/frontend-guided. Única diferencia de entorno con s4: el prompt pide compilar con el `aether-plan` de la rama (para que el mod corra ops y no Haiku) y guardar sus archivos en `.aether/`, no en `/tmp`. Shots: `pauseAt` con margen de 500 ms (el fallo de reloj de s4).
- Lanzados en paralelo (16:47): s2 (instalada 0.25.1, tarea ban76k824), s3 (rama exp/frontend-skills, bf4xmk45z), s4 (rama exp/frontend-guided, b6qbpi73f). `aether-autonomy status`: 1.15 h de 8, stop null.

## Pausa de cuota 2026-10-29T01:58:16.816Z

- Ventana de 5 horas al 98% (umbral 95%); reinicia 2026-10-29T02:00:00.000Z; la corrida se retoma 2026-10-29T02:02:00.000Z.
- Aviso al dueño: no enviado (no-channel).
- **El freno congeló la sesión 72 min (issue #124).** Se disparó 5 s después de terminar s5 (01:58:11), con nada corriendo: nada que guardar (`savedUnits: []`), nada perdido. Pero su mensaje quedó en cola y la sesión no hizo otra petición hasta que el dueño pulsó Esc a las 03:10. Causa en `hooks/register.js`: el paso (`turn.step`, l. 617) espera `brakeStep`, que espera `$.prompt.submit` (l. 379); `submit` solo entrega «once the session is idle», y la sesión no queda libre mientras su propio paso espera: interbloqueo. `armResume` va después (l. 381), así que el aviso de las 02:02 nunca se programó. Igual en `main` (0.25.1). La pausa real fue de 4 min; el congelamiento, 72.
- 03:11: `status` sin stop; la corrida sigue.

## s5-rich: resultado

- 13/13 fusionadas, 12 al primer intento; task-9 (vista de la serpiente) subió de Haiku `high` a Haiku `xhigh` (la cabeza salía como mancha blanca: los ojos lo vieron). 0 escaladas de modelo, 0 bloqueos, 0 relanzamientos (el bin de la rama evitó el #123).
- Revisor final (6 porciones Opus `xhigh`): `ready-with-fixes`, 0 críticos, 4 importantes (BEST sin storage, cabeza que no se oscurece al morir, sol tapado por el suelo por orden de dibujo, sol fuera de cuadro), 24 menores. El Lead arregló 3 con tests y dio el cuarto por resuelto en su efecto.
- `npm test && npm run check:visual`: 187 tests verdes; examen oculto 25/25. `feature/snake` en fb68c3a.
- Costo de la sesión: US$ 10.72 (Opus 6.32 = revisores finales, Sonnet 2.91, Haiku 1.48). Reloj 68.9 min (00:49–01:58 UTC); el swarm 60 min.
- Banco: 13/13 chequeos, 0 errores, 22 comidas en 40 s, 71 draw calls, 15.1k triángulos. Mis ojos: escena synthwave completa (rejilla al horizonte, montañas con aristas, sol rayado, haces, figuras flotantes), muy distinta de s2-s4. Defectos: serpiente aún pequeña y lejana (el campo de 70° del Writer agranda el tablero), sol cortado arriba, figuras cercanas como manchas pálidas. Game over bien (montañas oscuras, sol rayado, tinte).
- Juez a ciegas ronda 3a y 3b con los 7 builds (bhp4z2i8f, b9tnbu8bf), lanzadas 03:2x.

## Pruebas 6 y 7 (D14)

- D14: dos pruebas más · parar con 5 o medir lo que falta · medir: s6 = Haiku xhigh solo (Claude normal, sin Aether, mismo esqueleto y prompt que s1), da el punto de partida de Haiku; s7 = el mismo plan rico de s5 con implementers en Sonnet (copia del plugin de la rama con `config/ladder.json` que empieza en Sonnet high/xhigh; mismo árbol que s5, verificado por hash 6fc2e81), dice si Haiku pierde algo frente a Sonnet con el mismo plan · C6 («si un sistema que programo con haiku puede alcanzar el resultado de un sonnet xhigh y que condiciones necesitamos») · el dueño, presente, lo leyó y no objetó · Lead
- Lanzadas ~03:30 UTC: s6 (b77zsdtt4), s7 (b7c11no6q). `status`: 5.42 h de 8, stop null.

## Veredictos del dueño (jugó los 7 en su equipo, 03:4x UTC)

- Juez a ciegas, rondas 3a y 3b con los 7 (US$ 3.2): s1-sonnet 28.75 (4 rondas), oct-normal 28.5, **s5-rich 27.0 (27, 27)**, s2 26.0, s4 25.75, s3 24.75, oct-aether 21.75. Críticas a s5 en las dos rondas: serpiente y comida diminutas al fondo de un tablero enorme, fondo que distrae, HUD tenue; elogios: synthwave coherente, faro de la comida, efectos en el espacio, primer plano de la cabeza en game over.
- Sus palabras: s1-sonnet «ni lo puedo ver me aparece todo oscuro y en pantalla negra» (tiene GPU de alto rendimiento: «está mal programado»); oct-normal «es el mejor pero… si costo no esta tan justificado»; **s5-rich «a mi parecer es el mejor. Este resultado me impresiona»**; s2 «aceptable… mediocre»; s4 «lo mismo solo brillan las orillas»; s3 «exactamente igual pero un poquitito de input lag»; oct-aether «las iluminaciones no dejan jugar… esta muy brillante».
- **Descubrimiento:** el juez y los ojos ven Chromium con render por software (SwiftShader); el build de Sonnet solo se ve bien ahí y sale negro en la GPU real del dueño (el HUD y la lógica funcionan: llegó a Game Over; el canvas no dibuja nada). Los demás builds, con el mismo compositor HalfFloat + 4 muestras, sí se ven en su equipo. Diferencias de s1: `powerPreference: 'high-performance'` y muchos shaders propios (`onBeforeCompile` y 5 `ShaderMaterial`). Causa sin confirmar: falta la consola.
- Costos comparados: oct-normal US$ 21.95 (Opus 8.35 controlador y revisión final, Sonnet xhigh 13.56 = 62 %, Haiku 0.04), 2 h 18 min. s5 completo ≈ US$ 22.2 (diseño 11.47 + construcción 10.72; Opus ≈ 12.2, Sonnet ≈ 8.5, Haiku 1.48) y ~2 h 05 min, sin contar la dirección de arte que escribí yo. Mismo costo, distinto reparto.
- **El dueño señaló que s5 no es una medición limpia, y tiene razón.** Mis turnos (Opus, contexto de ~450k) no están en los US$ 22: escribir art.md y look.md y preparar s5 fueron ~15 peticiones, unos US$ 1.5 a precio de lista (23:51–23:56 UTC; art.md solo, US$ 0.23 con 5k tokens de salida); cada petición cuesta ~US$ 0.09 solo por releer mi contexto. Lo que pesa más es el conocimiento: art.md se escribió viendo las críticas del juez a 6 builds y sus capturas (es una segunda iteración, no un disparo), y el plan rico se apoya en el diseño anterior (d-design, US$ 9.27), que no sumé. Costo real desde cero de llegar a s5: d-design 9.27 + build de referencia y juez (~7-8) + mi art.md ~1.5 + d5-rich 11.47 + s5 10.72 ≈ US$ 31-40.

## s6-haiku: resultado

- Haiku xhigh solo (Claude normal, mismo esqueleto y prompt que s1): 3 commits en `main` (3145cad), 79 tests verdes, examen oculto 25/25. US$ 2.51 en 29.6 min (03:24–03:53 UTC). **No fue Haiku puro:** por su cuenta lanzó un subagente `general-purpose` con `model: "sonnet"` para una revisión de solo lectura (US$ 1.02) y arregló lo que encontró («Fix review findings: pause, best score, framing, antialiasing»); Haiku costó US$ 1.49. También usó ScheduleWakeup para esperar al subagente.
- Servido en http://localhost:8308/ para el dueño. Banco y juez a ciegas (rondas 4a, 4b) en curso (bgd3rfn8s).
- Veredicto del dueño sobre s6-haiku: «un poco por encima de las de aether conservador pero bueno y estable, resultado mediocre no impresionante».

## Encuesta de las 298 skills (pedida por el dueño)

- Su hipótesis: «eso puede ser una skill que nada más se aplique a cosas de frontend… Skills de "Dirección de arte"», y que alguna de las 298 pudo mejorar el resultado si la leían. Lancé un subagente (pedí Sonnet; el mod lo pasó a delegado en Haiku high, d-mvt0i3yn-c30c); aprobado tras comprobar sus citas en los archivos.
- Resultado: ninguna skill trata de juegos, three.js o WebGL; ninguna es una dirección de arte con números. Las que habrían ayudado poco: `gan-style-harness` (bucle generador-evaluador con capturas; su propio texto estima 4-6 h y US$ 125-200), `frontend-design-direction` (pide propósito, tono y paleta antes de codificar, sin números ni cámara ni tamaño del protagonista; 93 líneas), `accessibility` (contraste 4.5:1 para el HUD), `make-interfaces-feel-better`, `taste-distillation` (medir brillo de capturas). `taste` tiene la forma de art.md pero es para videoclips y pide negros profundos (lo contrario de lo que pidió el juez). Conclusión: la skill de dirección de arte para frontend 3D hay que escribirla.
- s6-haiku, banco y juez: 13/13 chequeos, 0 errores, 24 comidas, 105 draw calls; juez a ciegas 22 y 24 = **23.0** (tema «cozy low-poly» pastel; serpiente diminuta en tablero enorme, efecto de comer invisible, cámara fija casi cenital, sin postprocesado visible). El juez lo pone bajo los Aether (24.75-26); el dueño, un poco por encima. Discrepancia anotada.

## s7-rich-sonnet: resultado

- Mismo plan rico y mismo método guiado que s5, implementers en Sonnet (copia del plugin con la escalera empezando en Sonnet high/xhigh). 12/13 al primer intento en Sonnet high; task-12 (main.js) gastó la escalera (Sonnet high → xhigh → Opus high, 5 intentos) por una contradicción del plan: su prueba «horizonte en cuadro» solo pasa tocando `SUN_WINDOW` de horizon.js, que es de task-13. El Lead adoptó el parche a mano (`aether-wt adopt`, 5b96429, SUN_WINDOW 0.45 → 0.15). En s5, Haiku pasó la misma tarea al primer intento (¿la resolvió de otra forma?, por ver).
- Revisor final `ready-with-fixes`, 2 importantes (formas flotantes quemadas que tapaban SCORE; sol pálido sin rayas) arreglados por el Lead; luminancia en juego 39-50. `npm test && npm run check:visual` verde; examen oculto 25/25; `feature/snake` en 3b41d3f.
- Costo de la sesión US$ 8.78: implementers 5.55 (Sonnet; incluye el intento de Opus), supervisores 1.10, **revisor 0.99 (9 peticiones, Opus high, una sola pasada: en s5 fueron 60 peticiones a xhigh, US$ 6.32; probable #122 tras el bloqueo y la adopción)**, Lead 1.14. Swarm 45 min (03:24–04:09 UTC), contra 69 de s5.
- Comparación justa sin el revisor: s5 4.40 (Haiku 1.48) contra s7 7.79 (Sonnet 5.55): los implementers en Sonnet cuestan 3.7 veces más.
- Banco y juez (rondas 5a, 5b) en curso (b7meq0jk0). Servido en http://localhost:8309/.
- Veredicto del dueño: «No veo diferencia alguna entre sonnet rico y haiku rico». **Respuesta a su pregunta 1, con su propio ojo: con el mismo plan rico, Haiku iguala a Sonnet.** Costo a revisión igual (sumando a s7 la revisión de s5): s7 ≈ US$ 14.1 contra s5 10.72; solo la parte de programar, 5.55 contra 1.48.
- s7 banco y juez: 13/13, 0 errores, 22 comidas, 69 draw calls; juez a ciegas **27 y 27 = 27.0, con las mismas notas por criterio que s5 (7, 7, 6, 7)** y las mismas críticas (serpiente pequeña al fondo, cielo recargado). El juez y el dueño coinciden: con el mismo plan, Haiku = Sonnet. C6 respondida.
- 04:2x UTC: 6.35 h de 8. Siguiente: informe (artifact), brief y cierre.
