# 004 · Conciliación de la documentación: propósito, README, metodología y guía de quien acaba de instalar

- **Date:** 2026-10-15
- **Status:** Draft (revisión 3, tras dos `revise` del Judge)
- **Intent:** «quiero que despliegues el swarm para que vayan arreglando la documentación incluido el readme, nosotros haremos los sprites, y como aún no sabemos cómo vamos a hacer la landing page solo se encargará el swarm de conciliar documentación, propósito, readme, metodología y documentación para personas que recién lo instalan que irá conectado a la página de documentación que también va conectado a la landing page». Antes, el dueño dividió las piezas así: «en el readme explicamos la instalación que es etc, en el landing page más de lo que es que busca y cómo, y en la página de documentación necesitamos ir manejando cómo se usa, es como la guía de usuario».

## Criteria

- C1: Una persona que acaba de instalar Aether llega, con la guía de inicio y sin leer nada más, a arrancar el modo Aether y a saber qué pasa con su primera petición. Evidence: un revisor independiente ejecuta cada comando de la guía que no necesita un modelo (instalación desde un marketplace local, `claude plugin configure`, `aether-plan check` sobre un plan de ejemplo), en un directorio de configuración desechable y no en el del dueño, y registra su salida; cada paso que sí necesita un modelo lo contrasta con el código que lo implementa (la skill `using-aether`, los hooks, el workflow). La corrida real con un modelo la hace el dueño y queda en su lista.
- C2: El README es la puerta de entrada (qué es, instalación, primer arranque y a dónde ir), y no el historial del proyecto. Evidence: una prueba comprueba su longitud, sus secciones y que no contiene el historial por versiones ni los ensayos.
- C3: Propósito, metodología, README y guías dicen lo mismo entre sí y lo mismo que el código del plugin en `origin/main` (0.10.0). Evidence: una prueba de hechos comprueba lo que una máquina puede comprobar (opciones y valores por defecto, bins, agentes y skills, rutas, versión), y la revisión final audita el resto afirmación por afirmación.
- C4: Nada de lo que hoy dice el README se pierde: lo que sale del README vive en otra página de `docs/`, y su destino es el de R7. Evidence: una tabla «sección del README en 122755a → página destino» sin filas vacías, verificada por la revisión final.
- C5: Los documentos quedan listos para que una página de documentación y la landing los enlacen sin reescribirlos. Evidence: una prueba comprueba que cada página tiene front matter (`title`, `description`, `order`), que los enlaces internos y sus anclas resuelven, y que `docs/index.md` lista cada página.

## User scenarios

- S1. Dado que alguien acaba de ejecutar `claude plugin install aether …`, cuando abre el README, entonces ve en una pantalla qué es Aether, cómo se arranca y el enlace a `docs/getting-started.md`. Sirve a: C1, C2.
- S2. Dado que alguien sigue `docs/getting-started.md`, cuando llega al final, entonces ha arrancado el modo Aether, sabe qué hace el Lead con su primera petición, y sabe leer el brief y qué es «Espera tu sí». Sirve a: C1.
- S3. Dado que alguien quiere saber para qué existe Aether y qué busca, cuando abre `docs/purpose.md`, entonces encuentra el problema, los cinco objetivos de RADAR y lo que Aether no es, sin tener que leer el README entero. Sirve a: C2, C3.
- S4. Dado que se cambia el valor por defecto de una opción del plugin, cuando corre `npm test`, entonces la prueba de hechos falla hasta que la documentación lo diga. Sirve a: C3.
- S5. Dado que más adelante se construye la página de documentación, cuando lee `docs/`, entonces construye su navegación a partir del front matter y de `docs/index.md`, sin editar ninguna página. Sirve a: C5.

## Requirements

- R1. `README.md` tiene como máximo 160 líneas y, en este orden: título; un párrafo de qué es; una línea `Version X.Y.Z` con enlace a `docs/changelog.md`; los cinco objetivos de RADAR, una línea cada uno; requisitos; instalación; primer arranque (`claude --agent aether:lead --effort xhigh`; con un clon del repositorio, `scripts/aether-lead`; y que `claude` a secas es el modo normal salvo que el repositorio fije el agente); «A dónde ir», con enlaces a `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md` y `docs/index.md`; licencia. No contiene el historial por versiones, las tablas de ensayos ni «Upgrading from 0.6». Sirve a: C2.
- R2. El README deja, arriba, un hueco para la animación de la mascota como comentario HTML (`<!-- hero: ... -->`) y ninguna imagen cuyo archivo no exista. Sirve a: C2.
- R3. `docs/getting-started.md` es la guía de quien acaba de instalar: cómo comprobar que la instalación funcionó; cómo arrancar (`claude --agent aether:lead --effort xhigh`, `scripts/aether-lead` con un clon, el agente por defecto de un repositorio); qué pasa con una primera petición, paso a paso (el Lead escribe su entendimiento, la spec, el Writer el plan, el Judge revisa, se elige entre hacerlo el Lead, una tarea delegada o el swarm); cómo dar permiso para trabajar por horas; cómo leer el brief («Espera tu sí», «Supuestos», RADAR); y qué hacer cuando algo falla, con enlace a `docs/guide/troubleshooting.md`. Sirve a: C1.
- R4. `docs/purpose.md` dice para qué existe Aether y qué busca: el problema que resuelve, RADAR con sus cinco objetivos, los principios (con la ancla `#principles`) y las lecciones de Aether Agents, y lo que Aether no es (no es el modo normal de `claude`; no exige superpowers ni la CLI de Spec Kit). Sirve a: C3, C4.
- R5. `docs/methodology.md` describe el método de punta a punta: dueño → Lead → spec en el formato de Spec Kit → Judge → Writer → Judge → Examiner → los tres caminos (directo, tarea delegada, swarm) → examen → brief; la ruta por tamaño y riesgo; «quien escribe no juzga»; y cómo se eligen modelo y harness. Coincide con la skill `using-aether` y no la contradice. Sirve a: C3.
- R6. `docs/guide/` contiene la guía de uso, una página por tema: `options.md`, `lanes.md`, `design-seats.md`, `autonomy.md`, `ops.md`, `maintenance.md` y `troubleshooting.md`. `options.md` tiene la **única tabla canónica** de las opciones `lanes`, `harnesses`, `ops` y `seats`, con su valor por defecto y cómo se fijan; las demás páginas enlazan a ella, y donde repiten un valor por defecto lo escriben en la forma «`opción`, `valor` by default» (con `on` y `off` para las opciones booleanas, que la prueba lee como `true` y `false`, y que no van entre acentos graves; una cadena como `agy` o `balanced` sí). Sirve a: C1, C3, C4.
- R7. Destino de cada sección del README en 122755a, sin que ninguna se borre:
  - introducción, RADAR y roles → README (resumido), `docs/purpose.md` y `docs/methodology.md`;
  - «Status» (versiones 0.10 a 0.7 y los ensayos) → `docs/changelog.md` (R8);
  - «How it works»: los tres caminos y el diagrama → `docs/methodology.md`; la tabla de piezas → `docs/reference/components.md`; «Ops without a model» → `docs/guide/ops.md`;
  - «Lanes» (con «Reading the quota», «Adding a harness» y «Turning on Codex, Grok or Cursor») → `docs/guide/lanes.md`; «Design seats» → `docs/guide/design-seats.md`; «Autonomy» → `docs/guide/autonomy.md`;
  - «Requirements», «Install» y «Start» → README (resumido) y `docs/getting-started.md` (completo);
  - «What Aether adds to a normal session» → `docs/reference/components.md`, con la versión y la fecha de la medición;
  - «Options» y «What you set yourself» → `docs/guide/options.md`;
  - «Platforms», «Update, pin, roll back and uninstall», «Data» y «Upgrading from 0.6» → `docs/guide/maintenance.md`;
  - «Development» y «Release» → `docs/contributing.md`;
  - «Documentation» → `docs/index.md` (R9);
  - «Lessons from Aether Agents» y «Principles» → `docs/purpose.md`;
  - «Roadmap» (con «Effort» y lo diferido) → `docs/roadmap.md`;
  - «License» → README.
  Sirve a: C3, C4.
- R8. `docs/changelog.md` recibe el historial por versiones y los ensayos de la sección «Status», sin recortarlos y con las líneas `Version X.Y.Z: …` palabra por palabra, bajo un encabezado `## Status`. Empieza con una entrada «Unreleased» que dice que la frase de la skill `swarm` sobre el README cambió (R13) sin subir la versión, y que llega con el siguiente release. La primera línea `Version X.Y.Z:` es la del manifiesto. Sirve a: C2, C3, C4.
- R9. `docs/index.md` lista cada página que esta spec crea, ordenadas por público (quien acaba de instalar, usuario, quien contribuye), con una línea cada una, y enlaza todos los documentos que la sección «Documentation» del README enlaza hoy: `docs/roadmap/2026-10-10-radar.md`, `docs/superpowers/specs/2026-10-07-aether-plugin-design.md`, `docs/superpowers/specs/` y `docs/superpowers/plans/`, `docs/evaluations/`, `docs/claude-code-research.md`, `docs/decisions.md`, `specs/001-design-seats/`, `docs/evaluations/seats/README.md`, `docs/aether-retrospective.md`, y además `docs/models/README.md` y `docs/issues/`. Sirve a: C4, C5.
- R10. Cada página nueva empieza con front matter YAML de tres claves: `title`, `description` y `order` (entero), y todos sus enlaces internos son relativos y resuelven, anclas incluidas. Sirve a: C5.
- R11. `tests/docs-facts.test.js` (Node, sin dependencias, `node:test`) comprueba, contra el árbol, y declara en el propio archivo su regla de extracción y su lista de excepciones:
  - cada página de R3 a R9 existe y tiene el front matter de R10, y los enlaces y las anclas internas del README y de esas páginas resuelven;
  - cada `aether-*` entre acentos graves, en posición de comando (el comando solo, o seguido de sus argumentos), existe en `plugins/aether/bin/` o en la lista de excepciones; no se miran los fragmentos que contienen `@`, `/` o `--v` (rutas, marketplaces y etiquetas), y la lista de excepciones tiene `aether-lead` (que vive en `scripts/`), `aether-plugin` (el nombre del marketplace y del repositorio), `aether-aether-plugin` y `aether-inline` (directorios de datos) y los nombres retirados que se citan como tales (`aether-mode`);
  - cada `aether:<nombre>` es un agente de `plugins/aether/agents/`, una skill de `plugins/aether/skills/` o `aether:run`;
  - la tabla de `docs/guide/options.md` coincide con `userConfig` de `plugins/aether/.claude-plugin/plugin.json` (opciones y valores por defecto), y ninguna página repite, en la forma de R6, un valor distinto;
  - la versión de la línea `Version X.Y.Z` del README y la del primer encabezado de `docs/changelog.md` es la del manifiesto;
  - el README cumple R1.
  Sirve a: C2, C3, C5.
- R12. Las afirmaciones ya conocidas por desactualizadas se corrigen: «Roadmap → Now: version 0.9»; la lista de decisiones «A1–A43» (hoy llega a A49); «the eight commands of `bin/`» (hoy son nueve); la medición «What Aether adds to a normal session», hecha con 0.7.0, que se fecha y se mueve (R7), no se retira; y el resto de lo que la revisión final encuentre. Sirve a: C3.
- R13. Los cambios se limitan a `README.md`, `docs/index.md`, `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md`, `docs/changelog.md`, `docs/contributing.md`, `docs/roadmap.md`, `docs/guide/**`, `docs/reference/**` y `tests/docs-facts.test.js`, y a estas excepciones, cada una de una sola clase de cambio:
  - `tests/launcher.test.js`, `tests/lanes-docs.test.js` y `tests/start-command.test.js`: solo de dónde leen. Cada aserción sobre un hecho o un encabezado se conserva y apunta a la página que ahora lo contiene (el README y las páginas de R3 a R9); las cadenas que una aserción buscaba en un solo archivo se buscan en el conjunto de esas páginas; y la comprobación de orden «the guide has its parts in order», que mira doce encabezados en un archivo, pasa a una comprobación de orden por página, con los mismos encabezados en su orden relativo dentro de cada página. No se borra ninguna aserción, y el plan nombra cada una que cambia;
  - `tests/roles.test.js`: solo la cadena de la frase de la skill `swarm` (línea 52), que cambia en el mismo commit que la skill;
  - `docs/aether-retrospective.md`: su enlace a `../README.md#principles` pasa a `purpose.md#principles` (A9);
  - `plugins/aether/skills/swarm/SKILL.md`: la frase «the README's Lanes section has the rule» pasa a nombrar `docs/guide/lanes.md` (A9).
  No se toca nada más de `plugins/aether/**`, `scripts/**`, `docs/decisions.md`, `docs/evaluations/**`, `docs/issues/**`, `docs/handoff/**`, `docs/superpowers/**`, `docs/roadmap/**` ni `specs/00[1-3]-*`. Sirve a: C4.
- R14. Al terminar, `npm run check` pasa en la rama de integración: las pruebas existentes, las pruebas del mod y los dos manifiestos. Sirve a: C3.

## Proposals

- P1. Una versión en español de las páginas de `docs/`. No sirve a un criterio de esta spec; el dueño escribe en español y el repositorio en inglés.
- P2. Una página de glosario (RADAR, Lead, seat, lane, swarm, brief, «Espera tu sí»).
- P3. Que el Release cite la prueba de hechos como paso.
- P4. Revisar que el comando de instalación funciona para alguien sin acceso al repositorio (hoy es privado).

## Assumptions

- A1. Las páginas se escriben en inglés, como el resto de los documentos del repositorio, y conservan los términos de producto en español (RADAR, «Espera tu sí»). Base: convención del repositorio. Reversible: P1. Va a la lista del dueño porque es un trade-off real (el primer público de la guía de usuario).
- A2. Se documenta lo que existe en `origin/main` en 122755a (0.10.0), no la rama local `feat/grok-lane`, que va 56 commits atrás. Base: GitHub es la fuente de verdad y el PR #12 ya está fusionado. Reversible.
- A3. El nombre y la ubicación de las páginas son los de R3 a R9. Base: los cuatro cubos que pidió el dueño (propósito, README, metodología, documentación de quien recién instala) más lo que ya vive en el README. Reversible: mover una página cambia enlaces, no contenido.
- A4. El tope de 160 líneas del README es una guía de lectura en una o dos pantallas, no una cifra del dueño. Base: hoy tiene 451 líneas y mezcla cinco públicos. Reversible.
- A5. Los comandos de instalación se documentan tal como están (`claude plugin install aether --marketplace DarkArty07/aether-plugin`). El repositorio es privado hoy, así que solo funcionan para quien tiene acceso; esto no se arregla con documentación. Base: `gh repo view` (`PRIVATE`). Reversible.
- A6. Los documentos históricos (decisiones, ensayos, issues, handoffs, specs 001–003) no se editan, salvo las excepciones de R13. Base: son registro, no guía. Reversible.
- A7. El front matter usa solo `title`, `description` y `order`, un subconjunto que cualquier generador de sitios lee. Base: aún no hay generador elegido. Reversible.
- A8. La landing no se escribe aquí. Cuando exista, enlazará a `docs/purpose.md`, `docs/methodology.md` y `docs/getting-started.md`, que son las rutas estables. Base: el dueño dijo «aún no sabemos cómo vamos a hacer la landing page». Reversible.
- A9. Dos archivos del plugin y de la documentación dependen de secciones del README: `docs/aether-retrospective.md`, línea 127 (`../README.md#principles`), y `plugins/aether/skills/swarm/SKILL.md`, línea 28 («the README's Lanes section has the rule»); y tres pruebas leen secciones del README (`tests/launcher.test.js`, `tests/lanes-docs.test.js`, `tests/start-command.test.js`), más `tests/roles.test.js`, que fija la frase de la skill (R13). Las demás pruebas que nombran `README.md` lo usan como nombre de archivo de un fixture, o leen `docs/models/README.md`, y no cambian. Base: `grep -rn README` en `docs/`, `specs/`, `plugins/` y `tests/`, que el Writer repite antes de mover secciones y que va a su plan. Reversible.
- A10. La corrida real con un modelo, que cierra C1, la hace el dueño; el revisor no hace llamadas de pago. Base: «paid-call» es una clase irreversible. Reversible.

## Irreversible actions

None. Todo es local y reversible: commits en la rama `docs/reconcile-0.10.0` y un worktree de integración. El push y el pull request son del dueño, y no forman parte de esta spec.

## Out of scope

- La landing page, y elegir o construir un generador de sitio estático para la página de documentación.
- La mascota, el GIF y cualquier asset en `assets/`: los hacen el dueño y el Lead aparte.
- Cambios al código del plugin, a sus scripts, y a sus pruebas más allá de las excepciones de R13.
- Reescribir los documentos históricos.
- La traducción al español (P1) y el glosario (P2).
- Publicar, hacer público el repositorio o desplegar nada.
