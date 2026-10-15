# 004 · Conciliación de la documentación: propósito, README, metodología y guía de quien acaba de instalar

- **Date:** 2026-10-15
- **Status:** Draft
- **Intent:** «quiero que despliegues el swarm para que vayan arreglando la documentación incluido el readme, nosotros haremos los sprites, y como aún no sabemos cómo vamos a hacer la landing page solo se encargará el swarm de conciliar documentación, propósito, readme, metodología y documentación para personas que recién lo instalan que irá conectado a la página de documentación que también va conectado a la landing page». Antes, el dueño dividió las piezas así: «en el readme explicamos la instalación que es etc, en el landing page más de lo que es que busca y cómo, y en la página de documentación necesitamos ir manejando cómo se usa, es como la guía de usuario».

## Criteria

- C1: Una persona que acaba de instalar Aether llega, con la guía de inicio y sin leer nada más, a arrancar el modo Aether y a recibir su primer resultado. Evidence: un lector independiente (agente revisor) sigue `docs/getting-started.md` al pie de la letra y cada comando, opción y ruta que nombra existe en el plugin, sin discrepancias.
- C2: El README es la puerta de entrada (qué es, instalación, primer arranque y a dónde ir), y no el historial del proyecto. Evidence: una prueba comprueba su longitud, sus secciones y que no contiene el historial por versiones ni los ensayos.
- C3: Propósito, metodología, README y guías dicen lo mismo entre sí y lo mismo que el código del plugin en `origin/main` (0.10.0). Evidence: una prueba de hechos comprueba lo que una máquina puede comprobar (opciones y valores por defecto, bins, agentes, rutas, versión), y la revisión final audita el resto afirmación por afirmación.
- C4: Nada de lo que hoy dice el README se pierde: lo que sale del README vive en otra página de `docs/`. Evidence: una tabla «sección del README en 122755a → página destino» sin filas vacías, verificada por la revisión final.
- C5: Los documentos quedan listos para que una página de documentación y la landing los enlacen sin reescribirlos. Evidence: una prueba comprueba que cada página tiene front matter (`title`, `description`, `order`), que los enlaces internos y sus anclas resuelven, y que `docs/index.md` lista cada página.

## User scenarios

- S1. Dado que alguien acaba de ejecutar `claude plugin install aether …`, cuando abre el README, entonces ve en una pantalla qué es Aether, cómo se arranca y el enlace a `docs/getting-started.md`. Sirve a: C1, C2.
- S2. Dado que alguien sigue `docs/getting-started.md`, cuando llega al final, entonces ha arrancado el modo Aether, ha visto qué hace el Lead con su primera petición, y sabe leer el brief y qué es «Espera tu sí». Sirve a: C1.
- S3. Dado que alguien quiere saber para qué existe Aether y qué busca, cuando abre `docs/purpose.md`, entonces encuentra el problema, los cinco objetivos de RADAR y lo que Aether no es, sin tener que leer el README entero. Sirve a: C2, C3.
- S4. Dado que se cambia el valor por defecto de una opción del plugin, cuando corre `npm test`, entonces la prueba de hechos falla hasta que la documentación lo diga. Sirve a: C3.
- S5. Dado que más adelante se construye la página de documentación, cuando lee `docs/`, entonces construye su navegación a partir del front matter y de `docs/index.md`, sin editar ninguna página. Sirve a: C5.

## Requirements

- R1. `README.md` tiene como máximo 160 líneas y, en este orden: título; un párrafo de qué es; los cinco objetivos de RADAR, una línea cada uno; requisitos; instalación; primer arranque (`claude --agent aether:lead --effort xhigh` y `scripts/aether-lead`); «A dónde ir», con enlaces a `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md` y `docs/index.md`; licencia. No contiene el historial por versiones, las tablas de ensayos ni «Upgrading from 0.6». Sirve a: C2.
- R2. El README deja, arriba, un hueco para la animación de la mascota como comentario HTML (`<!-- hero: ... -->`) y ninguna imagen cuyo archivo no exista. Sirve a: C2.
- R3. `docs/getting-started.md` es la guía de quien acaba de instalar: cómo comprobar que la instalación funcionó; cómo arrancar (`claude`, `scripts/aether-lead`, el modo por defecto de un repositorio); qué pasa con una primera petición, paso a paso (el Lead escribe su entendimiento, la spec, el Writer el plan, el Judge revisa, se elige entre hacerlo el Lead, una tarea delegada o el swarm); cómo dar permiso para trabajar por horas; cómo leer el brief («Espera tu sí», «Supuestos», RADAR); y qué hacer cuando algo falla, con enlace a `docs/guide/troubleshooting.md`. Sirve a: C1.
- R4. `docs/purpose.md` dice para qué existe Aether y qué busca: el problema que resuelve, RADAR con sus cinco objetivos, los principios y las lecciones de Aether Agents (hoy al final del README), y lo que Aether no es (no es el modo normal de `claude`; no exige superpowers ni la CLI de Spec Kit). Sirve a: C3, C4.
- R5. `docs/methodology.md` describe el método de punta a punta: dueño → Lead → spec en el formato de Spec Kit → Judge → Writer → Judge → Examiner → los tres caminos (directo, tarea delegada, swarm) → examen → brief; la ruta por tamaño y riesgo; «quien escribe no juzga»; y cómo se eligen modelo y harness. Coincide con la skill `using-aether` y no la contradice. Sirve a: C3.
- R6. `docs/guide/` contiene la guía de uso, una página por tema: `options.md` (las opciones `lanes`, `harnesses`, `ops` y `seats`, con su valor por defecto y cómo se fijan), `lanes.md`, `design-seats.md`, `autonomy.md`, `maintenance.md` (plataformas, actualizar, fijar versión y volver atrás, desinstalar, datos) y `troubleshooting.md`. Sirve a: C1, C4.
- R7. `docs/reference/` contiene `components.md` (la tabla de piezas del plugin) y `commands.md` (cada `aether-*` y sus subcomandos, y `/aether:run`), y `docs/contributing.md` contiene Desarrollo y Release del README. Sirve a: C3, C4.
- R8. `docs/changelog.md` recibe el historial por versiones y los ensayos que hoy ocupan la sección «Status» del README, sin recortarlos. Sirve a: C2, C4.
- R9. `docs/index.md` lista cada página de `docs/` que esta spec crea, ordenadas por público (quien acaba de instalar, usuario, quien contribuye), con una línea cada una, y enlaza los documentos históricos que no se tocan (`decisions.md`, `evaluations/`, `roadmap/`). Sirve a: C5.
- R10. Cada página nueva empieza con front matter YAML de tres claves: `title`, `description` y `order` (entero), y todos sus enlaces internos son relativos y resuelven, anclas incluidas. Sirve a: C5.
- R11. `tests/docs-facts.test.js` (Node, sin dependencias, `node:test`) comprueba, contra el árbol: que cada página de R3 a R9 existe y tiene el front matter de R10; que los enlaces y las anclas internas del README y de `docs/` que esta spec crea resuelven; que cada bin `aether-*` que la documentación nombra existe en `plugins/aether/bin/`; que cada agente `aether:*` nombrado existe en `plugins/aether/agents/`; que las opciones nombradas y sus valores por defecto coinciden con `userConfig` de `plugins/aether/.claude-plugin/plugin.json`; que la versión que dice el README es la del manifiesto; y que el README cumple R1. Sirve a: C2, C3, C5.
- R12. Las afirmaciones ya conocidas por desactualizadas se corrigen: «Roadmap → Now: version 0.9»; la lista de decisiones «A1–A43» (hoy llega a A49); la medición «What Aether adds to a normal session», hecha con 0.7.0 (se fecha o se retira); y el resto de lo que la revisión final encuentre. Sirve a: C3.
- R13. Los cambios se limitan a `README.md`, `docs/index.md`, `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md`, `docs/changelog.md`, `docs/contributing.md`, `docs/guide/**`, `docs/reference/**` y `tests/docs-facts.test.js`. No se toca `plugins/aether/**`, `scripts/**`, `docs/decisions.md`, `docs/evaluations/**`, `docs/issues/**`, `docs/handoff/**`, `docs/superpowers/**`, `docs/roadmap/**` ni `specs/00[1-3]-*`. La única excepción es una línea de `docs/aether-retrospective.md`: su enlace a `../README.md#principles` pasa a `purpose.md#principles` (A9). Sirve a: C4.

## Proposals

- P1. Una versión en español de las páginas de `docs/`. No sirve a un criterio de esta spec; el dueño escribe en español y el repositorio en inglés.
- P2. Una página de glosario (RADAR, Lead, seat, lane, swarm, brief, «Espera tu sí»).
- P3. Que la prueba de hechos corra también en `npm run check`, y que el Release la cite.
- P4. Revisar que el comando de instalación funciona para alguien sin acceso al repositorio (hoy es privado).

## Assumptions

- A1. Las páginas se escriben en inglés, como el resto de los documentos del repositorio (la memoria del proyecto y los handoffs lo dicen), y conservan los términos de producto en español (RADAR, «Espera tu sí»). Base: convención del repositorio. El dueño puede revertirlo: P1.
- A2. Se documenta lo que existe en `origin/main` en 122755a (0.10.0), no la rama local `feat/grok-lane`, que va 56 commits atrás. Base: GitHub es la fuente de verdad y el PR #12 ya está fusionado. Reversible.
- A3. El nombre y la ubicación de las páginas son los de R3 a R9. Base: los cuatro cubos que pidió el dueño (propósito, README, metodología, documentación de quien recién instala) más lo que ya vive en el README. Reversible: mover una página cambia enlaces, no contenido.
- A4. El tope de 160 líneas del README es una guía de lectura en una o dos pantallas, no una cifra del dueño. Base: hoy tiene 451 líneas y mezcla cinco públicos. Reversible.
- A5. Los comandos de instalación se documentan tal como están (`claude plugin install aether --marketplace DarkArty07/aether-plugin`). El repositorio es privado hoy, así que solo funcionan para quien tiene acceso; esto no se arregla con documentación. Base: `gh repo view` (`PRIVATE`). Reversible.
- A6. Los documentos históricos (decisiones, ensayos, issues, handoffs, specs 001–003) no se editan. Base: son registro, no guía. Reversible.
- A7. El front matter usa solo `title`, `description` y `order`, un subconjunto que cualquier generador de sitios lee. Base: aún no hay generador elegido. Reversible.
- A8. La landing no se escribe aquí. Cuando exista, enlazará a `docs/purpose.md`, `docs/methodology.md` y `docs/getting-started.md`, que son las rutas estables. Base: el dueño dijo «aún no sabemos cómo vamos a hacer la landing page». Reversible.
- A9. Un solo documento enlaza a una ancla del README: `docs/aether-retrospective.md`, línea 127, a `../README.md#principles`. Como los principios pasan a `docs/purpose.md#principles` (R4), ese enlace se corrige, y es el único cambio permitido en un documento histórico (R13). Base: `grep -rn 'README.md#'` en `docs/`, `specs/` y `plugins/`, que el Writer repite antes de mover secciones. Reversible.

## Irreversible actions

None. Todo es local y reversible: commits en la rama `docs/reconcile-0.10.0` y un worktree de integración. El push y el pull request son del dueño, y no forman parte de esta spec.

## Out of scope

- La landing page, y elegir o construir un generador de sitio estático para la página de documentación.
- La mascota, el GIF y cualquier asset en `assets/`: los hacen el dueño y el Lead aparte.
- Cambios al código del plugin, a sus pruebas o a sus scripts.
- Reescribir los documentos históricos.
- La traducción al español (P1) y el glosario (P2).
- Publicar, hacer público el repositorio o desplegar nada.
