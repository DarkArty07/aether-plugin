# Plan: conciliación de la documentación

**Spec:** [spec.md](spec.md) (aprobado por el Juez en la revisión 3; sus seis notas menores están absorbidas abajo)

## Technical context

- **Stack.** Markdown y Node.js 22 sin dependencias. Las pruebas son `node --test` (`npm test`: 882 pruebas, unos 30 segundos). El plugin es `plugins/aether/` y no cambia, salvo la frase de la skill `swarm` (R13).
- **Base.** `origin/main` en 122755a, Aether 0.10.0 (A2). La rama es `docs/reconcile-0.10.0`; el `README.md` del árbol es el de 122755a, de 451 líneas, y es la fuente de todo lo que se mueve (`git show 122755a:README.md`).
- **Dónde está cada cosa hoy.**
  - `README.md` mezcla cinco públicos: introducción, historial (`## Status`, líneas 27–99), diseño, guía de uso, contribución, principios y hoja de ruta.
  - `docs/` tiene los documentos históricos (decisiones, investigación, evaluaciones, specs y planes de superpowers, issues, handoffs, `models/README.md`) y ninguna guía de uso. Esos no se editan (A6), salvo la línea de R13.
  - Cuatro pruebas leen el README, y una skill nombra una de sus secciones (la repetición del grep de A9, abajo).
- **Lo que falta, contra R1 a R14.**
  - Las 15 páginas de `docs/` (R3 a R9), con front matter (R10).
  - El README reducido a la puerta (R1, R2).
  - `tests/docs-facts.test.js` (R11) y las pruebas que hoy leen el README leyendo también las páginas (R13).
  - La conciliación contra el código y la auditoría de afirmaciones (R12, C3, C4).

**El grep de A9, repetido** sobre `docs/`, `specs/`, `plugins/`, `scripts/` y `tests/` (con `README` y con `README.md#`):

| Quién | Qué depende del README | Qué hace este plan |
|---|---|---|
| `tests/launcher.test.js` | encabezados `### Lanes`, `### Autonomy`, `### Design seats`, `### Requirements`, `### Upgrading from 0.6`, el orden de doce encabezados, líneas `Version X.Y.Z: ` y cadenas sueltas | Task 13 |
| `tests/lanes-docs.test.js` | `indexOf('### Lanes')` y `indexOf('### Design seats')`, y cadenas de la sección de lanes | Task 13 |
| `tests/start-command.test.js` | `indexOf('### Start')` y `indexOf('### What Aether adds')`, y las opciones del lanzador | Task 13 |
| `tests/roles.test.js:52` y `plugins/aether/skills/swarm/SKILL.md:28` | la frase «the README's Lanes section has the rule», igual en los dos | Task 14, una sola unidad |
| `docs/aether-retrospective.md:127` | `../README.md#principles` | Task 16 (`purpose.md#principles`) |
| `scripts/aether-lead:3` | un comentario: «It is the README's start command and nothing else» | nada: sigue siendo cierto (R1 conserva el comando) y R13 prohíbe tocar `scripts/**` |
| `docs/issues/001…:50`, `docs/handoff/2026-10-10-ops-without-llm.md:108`, `docs/roadmap/2026-10-10-radar.md`, `specs/00[1-3]-*` | menciones en prosa de «el README» o de su sección «Upgrading from 0.6» | nada: son registro (A6) |
| `tests/guard.test.js`, `globs.test.js`, `helpers.js`, `exam.test.js`, `workflow*.test.js`, `lane-work.test.js`, `worktrees-merge.test.js`, `models-index.test.js` | `README.md` como nombre de archivo de un fixture, o `docs/models/README.md` | nada |

## Design

Cada decisión dice a qué sirve.

**D1 · Cada sección del README se mueve entera a una página, y el README la resume.** El mapa de abajo es el cuadro de C4: una fila por sección de 122755a, con su destino y su tarea. Lo que se mueve conserva su texto palabra por palabra; solo cambian los enlaces (relativos a la página nueva), las referencias «(see Options)» (pasan a enlaces) y las afirmaciones que dejaron de ser ciertas (R12), que cada tarea nombra en su informe. Sirve a: C2, C4.

| Sección del README en 122755a (líneas) | Destino (R7) | Task |
|---|---|---|
| Título, introducción y los cinco objetivos de RADAR (1–10) | README (un párrafo y cinco líneas); `docs/purpose.md` (el problema y RADAR completo) | 16, 3 |
| Los roles: Lead, Writer, Judge, swarm, lanes (12–23) | `docs/methodology.md` (§ Who does what); README: lo que es, en un párrafo | 4, 16 |
| Spec Kit, superpowers, Aether Agents (25) | `docs/methodology.md` (el layout); `docs/purpose.md` (lo que Aether no es; el sucesor de Aether Agents) | 4, 3 |
| `## Status`: versiones 0.10 a 0.7 y los ensayos 1 a 3 (27–99) | `docs/changelog.md` bajo `## Status` (R8), sin recortar | 10 |
| `## How it works`: los tres caminos y el diagrama (101–133) | `docs/methodology.md` | 4 |
| La tabla de piezas (135–154) | `docs/reference/components.md` | 9 |
| «Ops without a model» (156–167) | `docs/guide/ops.md` | 7 |
| `### Lanes`, con «Reading the quota», «Adding a harness» y «Turning on Codex, Grok or Cursor» (169–191) | `docs/guide/lanes.md` | 6 |
| `### Design seats` (193–209) | `docs/guide/design-seats.md` | 7 |
| `### Autonomy` (211–221) | `docs/guide/autonomy.md` | 7 |
| `## Use Aether mode` (223) | `docs/getting-started.md`, antes de `### Requirements` (nota 3 del Juez) | 1 |
| `### Requirements`, `### Install`, `### Start` (225–277) | README (resumido) y `docs/getting-started.md` (completo) | 16, 1 |
| `### What Aether adds to a normal session` (279–288) | `docs/reference/components.md`, con versión y fecha de la medición | 9 |
| `### Options` y `### What you set yourself` (290–312) | `docs/guide/options.md` | 5 |
| `### Platforms`, `### Update, pin, roll back and uninstall`, `### Data`, `### Upgrading from 0.6` (314–367) | `docs/guide/maintenance.md` | 8 |
| `## Development` y `### Release` (369–391) | `docs/contributing.md` | 11 |
| `## Documentation` (393–402) | `docs/index.md` (R9) | 12 |
| `## Lessons from Aether Agents` y `## Principles` (404–428) | `docs/purpose.md` | 3 |
| `## Roadmap`, con «Effort» y lo diferido (430–447) | `docs/roadmap.md` | 11 |
| `## License` (449–451) | README | 16 |

Páginas que no vienen del README sino de lo que R3 y R6 piden: la guía de inicio completa (primera petición, trabajar por horas, leer el brief; Task 1) y `docs/guide/troubleshooting.md` (Task 2).

**D2 · Las páginas se escriben de lo que el código hace, no de lo que el README recuerda.** Cada tarea de página lee las fuentes de su fila; la auditoría de la ola 4 las lee de nuevo con otro agente. Sirve a: C3.

| Página | Fuentes en este árbol |
|---|---|
| `getting-started.md`, `troubleshooting.md` | `scripts/aether-lead`; `plugins/aether/agents/lead.md`; `plugins/aether/skills/using-aether/SKILL.md` y `swarm/SKILL.md`; `plugins/aether/hooks/hooks.json`; `bin/aether-session-start` y `lib/session.js`; `bin/aether-guard` y `lib/guard.js`; `lib/plan.js` (los mensajes de `aether-plan check`); `docs/evaluations/2026-10-09-installable/A1…A6` (lo que se verificó con una instalación real); `docs/issues/` (síntomas conocidos) |
| `purpose.md`, `methodology.md` | `skills/using-aether/SKILL.md`; `agents/*.md` (modelo y esfuerzo de cada rol); `docs/roadmap/2026-10-10-radar.md`; `docs/aether-retrospective.md`; `docs/decisions.md` |
| `guide/options.md` | `plugins/aether/.claude-plugin/plugin.json` (`userConfig`); `lib/session.js` (cómo llegan las opciones a los comandos) |
| `guide/lanes.md` | `config/lanes.json`; `lib/lanes.js`, `lib/lane-order.js`, `lib/lane-marks.js`, `lib/lane-readings.js`, `lib/lane-quota.js`, `lib/harness/*.js`; `bin/aether-lane` |
| `guide/design-seats.md` | `config/lanes.json` (`designSeats`); `lib/seats.js`, `lib/exam.js`; `bin/aether-exam`; `specs/001-design-seats/` |
| `guide/autonomy.md` | `config/autonomy.json`; `lib/autonomy.js`, `lib/guard.js`, `lib/pending.js`; `bin/aether-autonomy` |
| `guide/ops.md` | `hooks/ops-command.mjs`; `hooks/register.js`; `docs/decisions.md` (A30, A46) |
| `guide/maintenance.md` | `lib/session.js`, `bin/aether-session-start` (qué se barre y cuándo); `docs/claude-code-research.md` (instalación, `ref`, desinstalar); `docs/evaluations/2026-10-09-installable/A5…A6` |
| `reference/components.md` | `bin/` (nueve comandos), `agents/`, `skills/`, `hooks/`, `workflows/run.workflow.js`; `docs/evaluations/2026-10-09-installable/A3-dormant.md` (la medición) |
| `contributing.md`, `roadmap.md`, `changelog.md`, `index.md` | `package.json`; `tests/launcher.test.js`; `scripts/`; `docs/handoff/2026-10-14-quota-lanes-0.10.0.md`; el README de 122755a |

**D3 · Lo que las pruebas fijan es parte del contrato de cada página.** El Juez pidió que el plan liste cada encabezado fijado y la página que lo conserva, palabra por palabra (nota 2). Están en la tabla de abajo; la tarea de cada página los repite en su comprobación. Sirve a: C4, R13.

| Encabezado (nivel exacto) | Quién lo fija | Página que lo conserva |
|---|---|---|
| `## Use Aether mode`, antes de `### Requirements` | `launcher.test.js:81` (orden) | `docs/getting-started.md` |
| `### Requirements` (su sección no dice `superpowers`) | `launcher.test.js:81`, `:135` | `docs/getting-started.md` |
| `### Install` | `launcher.test.js:81` | `docs/getting-started.md` |
| `### Start` (su sección tiene `--permission-mode bypassPermissions`, `AETHER_IRREVERSIBLE=enforce` y `AETHER_IRREVERSIBLE=log aether-lead`) | `launcher.test.js:81`; `start-command.test.js:84` | `docs/getting-started.md` |
| `### Options` | `launcher.test.js:81` | `docs/guide/options.md` |
| `### What you set yourself` | `launcher.test.js:81` | `docs/guide/options.md` |
| `### Platforms` | `launcher.test.js:82` | `docs/guide/maintenance.md` |
| `### Update, pin, roll back and uninstall` | `launcher.test.js:82` | `docs/guide/maintenance.md` |
| `### Data` | `launcher.test.js:82` | `docs/guide/maintenance.md` |
| `### Upgrading from 0.6` (su sección tiene las cinco cadenas de `:97`; fuera de ella no hay `aether-mode`, `aether-install` ni `.local/share/aether-plugin`) | `launcher.test.js:82`, `:94` | `docs/guide/maintenance.md` |
| `## Development` | `launcher.test.js:82` | `docs/contributing.md` |
| `### Release` | `launcher.test.js:82` | `docs/contributing.md` |
| `### Lanes` (su sección, de más de 1000 caracteres, tiene las once cadenas de `lanes-docs.test.js:28`) | `launcher.test.js:25`; `lanes-docs.test.js:23` | `docs/guide/lanes.md` |
| `### Design seats` | `launcher.test.js:169`; `lanes-docs.test.js:23` (fin de la sección de lanes, que ya no usa) | `docs/guide/design-seats.md` |
| `### Autonomy` | `launcher.test.js:34` | `docs/guide/autonomy.md` |
| `**The three paths.**` al principio de una línea | `launcher.test.js:197` | `docs/methodology.md` |
| las líneas `Version 0.10.0: `, `Version 0.9.1: ` y `Version 0.9: ` | `launcher.test.js:26`, `:116–118` | `docs/changelog.md` |
| `### What Aether adds` (fin de la sección de Start) | `start-command.test.js:84` | ya no se usa: la sección de `### Start` termina en el siguiente encabezado de nivel 2 o 3 |

Las cadenas sueltas (las de `launcher.test.js:55–74`, `:132`, `:170`, `:198`; las de `lanes-docs.test.js:49–60`, `:75`, `:80`; y las del lanzador, `start-command.test.js:82–86`) se buscan en el conjunto del README y las páginas; la Task de cada página lista las que le tocan.

**D4 · Las pruebas que leen el README leen el conjunto «README y páginas», y lo que es de un encabezado lo leen de su página.** Cada una define su lista `DOC_FILES` (R13 no deja tocar `tests/helpers.js`): `README.md`, `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md`, `docs/guide/options.md`, `lanes.md`, `design-seats.md`, `autonomy.md`, `ops.md`, `maintenance.md`, `troubleshooting.md`, `docs/reference/components.md`, `docs/changelog.md`, `docs/contributing.md`, `docs/roadmap.md`, `docs/index.md`. Ninguna aserción se borra, y la Task 13 nombra cada una que cambia, con su línea. Un `section()` o un `slice` se aplica a la página que contiene el encabezado, nunca al conjunto: así un encabezado que falta falla donde debe (nota 2). La comprobación de orden «the guide has its parts in order» pasa a una por página con los mismos doce encabezados. Sirve a: C4, R13.

**D5 · `tests/docs-facts.test.js` llega antes de que el README se reduzca (cambia el orden del Lead).** El Lead pedía las olas 1 páginas, 2 lectores, 3 README, 4 docs-facts, 5 auditoría. Este plan pone docs-facts en la ola 2, junto a los lectores, y la reducción del README en la ola 3 lo amplía con R1. Por qué:
- los defectos de las páginas (un enlace roto, una ancla, un comando que no existe, un valor por defecto distinto del manifiesto) aparecen en la ola 2, cuando una página se puede relanzar sin haber tocado el README, y no en la 4;
- la reducción del README deja de ser una tarea sin prueba: su prueba roja es R1, escrita antes, que falla contra las 451 líneas y pasa con la puerta;
- la regla se mantiene: cada unidad deja `npm test` verde. Docs-facts de la ola 2 lee el README viejo solo donde éste ya cumple (enlaces, comandos, nombres, valores por defecto, versión: lo comprobé contra 122755a), y las tres pruebas que miran texto que el README viejo aún tiene mal (rutas, el conteo de `bin/`, el rango de decisiones) leen solo las páginas hasta que la Task 16 las pasa a leer también el README.
Sirve a: C2, C3, C5.

**D6 · Orden de las olas.** Cada unidad deja `npm test` verde, porque el swarm deshace una fusión que rompe una prueba.

| Ola | Tareas | Por qué en este lugar |
|---|---|---|
| 1 | 1 a 12: las páginas, independientes | el README no se toca: nada se rompe |
| 2 | 13 (los tres lectores), 14 (`roles` y la frase de la skill, una unidad), 15 (docs-facts) | los lectores y docs-facts necesitan las páginas; ninguno necesita al otro |
| 3 | 16: el README, R1 en docs-facts y el enlace del retrospectivo | solo después de que los lectores no dependan ya del README |
| 4 | 17 a 19: la conciliación y la auditoría por dominio | leen el árbol final |
| 5 | 20: la auditoría de historia y mapa, y `npm run check` | corre al final, sobre un árbol con todo fusionado (R14) |

**D7 · La comprobación de página (un script que no se commitea).** Hasta que existan las pruebas de la ola 2, una página se juzga con el script de «Global Constraints»: front matter, encabezados, cadenas pedidas y prohibidas, comandos, nombres, rutas, enlaces y anclas. Es la misma regla que docs-facts y los lectores aplican después, de modo que una página llega a la ola 2 sin el defecto que la haría fallar. Sirve a: C3, C5.

**D8 · Front matter y orden.** Solo `title`, `description` y `order` (A7). Los valores salen de una tabla en «Global Constraints» para que dos tareas no repitan un orden ni inventen un título. El `description` es una línea sin `: `. Sirve a: C5.

**D9 · Enlaces.** Todos relativos. Una página enlaza a otra con la ruta, y a una sección de otra solo por las anclas de la tabla de «Global Constraints» (las de los encabezados fijados), porque las páginas se escriben a la vez. Las cadenas fijadas que contienen una ruta desde la raíz (`docs/superpowers/specs/2026-10-09-lead-autonomy-design.md`, `docs/evaluations/seats/README.md`, `specs/001-design-seats/spec.md`) se conservan enteras: en el changelog, el prefijo `../` sobre la ruta original (nota 4 del Juez) las mantiene; en una página de `docs/guide/` la ruta va como texto del enlace. Sirve a: C5, R10.

**D10 · Una sola tabla de opciones.** `docs/guide/options.md` tiene la tabla `Option | Default | Set it | What it does` con las cuatro opciones del manifiesto; el valor por defecto de un booleano es `on` u `off`, y el de una cadena va entre acentos graves. Cualquier otra página enlaza a ella, y donde repite un valor lo escribe en la forma de R6. Docs-facts compara la tabla con `userConfig` y busca la forma de R6 en todas las páginas. Sirve a: C3, R6.

**D11 · La auditoría es de otro agente, por dominio.** Las tareas 17 a 20 no escriben páginas nuevas: leen cada afirmación de las suyas contra su fuente y corrigen, y devuelven un registro (afirmación, fuente, veredicto). Esa es la evidencia de C3 para lo que una máquina no comprueba; la de C4 es la tabla de D1, verificada fila por fila en la Task 20 contra `git show 122755a:README.md`. Sirve a: C3, C4.

**D12 · El README tiene una forma fija que la prueba R1 comprueba.** `# Aether Plugin`; el comentario `<!-- hero: … -->` justo debajo; un párrafo de lo que es; `Version X.Y.Z ([changelog](docs/changelog.md))`; los cinco objetivos, una línea cada uno (`- **Rápido** …`); `## Requirements`; `## Install`; `## First start`; `## Where to go`; `## License`. Los encabezados en inglés y en esa forma son una elección del plan (A4 abajo): R1 fija el orden y el contenido, no las palabras. Sirve a: C2.

**D13 · Una unidad a la vez de lo que R13 llama excepción.** `roles.test.js` y la frase de la skill cambian en la misma unidad (Task 14), porque `roles.test.js:52` compara la frase entera; `aether-retrospective.md` cambia en la unidad del README (Task 16), porque es la que quita `README.md#principles`. Sirve a: C4, R13.

## Files

| Archivos | Qué cambia | Task |
|---|---|---|
| `docs/getting-started.md` | nuevo: R3 | 1 |
| `docs/guide/troubleshooting.md` | nuevo: síntomas, causa y qué hacer | 2 |
| `docs/purpose.md` | nuevo: R4 | 3 |
| `docs/methodology.md` | nuevo: R5, con los tres caminos y el diagrama | 4 |
| `docs/guide/options.md` | nuevo: la tabla única (R6) y «What you set yourself» | 5 |
| `docs/guide/lanes.md` | nuevo: lanes, sin recortar | 6 |
| `docs/guide/design-seats.md`, `docs/guide/autonomy.md`, `docs/guide/ops.md` | nuevos: movidos del README | 7 |
| `docs/guide/maintenance.md` | nuevo: plataformas, actualizar, datos, «Upgrading from 0.6» | 8 |
| `docs/reference/components.md` | nuevo: la tabla de piezas y la medición, fechada | 9 |
| `docs/changelog.md` | nuevo: «Unreleased» y `## Status` palabra por palabra (R8) | 10 |
| `docs/contributing.md`, `docs/roadmap.md` | nuevos: «Development» y «Release»; «Roadmap» | 11 |
| `docs/index.md` | nuevo: R9 | 12 |
| `tests/launcher.test.js`, `tests/lanes-docs.test.js`, `tests/start-command.test.js` | solo de dónde leen (R13) | 13 |
| `tests/roles.test.js`, `plugins/aether/skills/swarm/SKILL.md` | solo la frase de la skill, en un commit (R13) | 14 |
| `tests/docs-facts.test.js` | nuevo: R11, más lo que R12 y C3 piden a una máquina | 15, 16, 20 |
| `README.md`, `docs/aether-retrospective.md` | el README reducido (R1, R2); el enlace del retrospectivo (R13) | 16 |
| las páginas de cada dominio | la auditoría corrige lo que no es cierto | 17 a 20 |

Ninguna tarea posee un archivo bajo `specs/` ni `.specify/`. Ninguna toca `scripts/**`, `docs/decisions.md`, `docs/evaluations/**`, `docs/issues/**`, `docs/handoff/**`, `docs/superpowers/**`, `docs/roadmap/**` ni `specs/00[1-3]-*`.

## Verification

Comando: `npm test` (`node --test "tests/*.test.js"`). Cada unidad lo deja verde. `npm run check` (R14) lo corre la Task 20 sobre el árbol con todo fusionado, y el Lead otra vez sobre la rama de integración al terminar; los dos tocan el mod y los manifiestos y necesitan la CLI `claude`.

| Criterio | Qué lo prueba |
|---|---|
| C1 | no hay prueba automática: la evidencia es de un revisor independiente, **fuera del swarm y después de él**. Ejecuta cada comando de `docs/getting-started.md` que no necesita un modelo (instalar desde un marketplace local, `claude plugin configure`, `aether-plan check` sobre el plan de ejemplo de la guía) en un directorio de configuración desechable (`CLAUDE_CONFIG_DIR=$(mktemp -d)`), y registra su salida; cada paso que sí necesita un modelo lo contrasta con `skills/using-aether/SKILL.md`, los hooks y el workflow. La corrida real con un modelo es del dueño (A10). La Task 1 ya corre lo que puede y lo informa. |
| C2 | los tests de R1 de la Task 16 (longitud, secciones, orden, sin historial ni ensayos ni «Upgrading from 0.6») |
| C3 | `tests/docs-facts.test.js` (comandos, agentes y skills, tabla de opciones y valores repetidos, versión, rutas, el conteo de `bin/`, el rango de decisiones, la línea «Now»); los lectores de la Task 13, que siguen verificando cada hecho que verificaban; y el registro de afirmaciones de las tareas 17 a 20 para lo demás |
| C4 | la tabla de D1, fila por fila (Task 20, contra `git show 122755a:README.md`); la comparación exacta del changelog (Task 10); y los lectores de la Task 13 corridos sin el README (la comprobación de aceptación de esa tarea), que prueba que las páginas llevan todo lo que el README llevaba |
| C5 | docs-facts: front matter de cada página, enlaces y anclas del README y de las páginas, `docs/index.md` enlaza cada página y cada documento de R9 |
| R12 | docs-facts (conteo de `bin/`, rango de decisiones, línea «Now»); la fecha de la medición, en la Task 9 y en la auditoría |
| R13 | `git diff --stat` sobre la rama: solo los archivos de la lista; la Task 13 nombra cada aserción que cambia, y la Task 20 lo verifica |
| R14 | `npm run check` en la Task 20 y en la rama de integración |

**Paso del Lead para C1.** Terminado el swarm, el Lead lanza ese revisor como una tarea delegada (Sonnet a `high`, en un worktree desechable de la rama de integración) con `CLAUDE_CONFIG_DIR=$(mktemp -d)`; su salida, comando por comando, va al brief del Lead y no al repositorio.

## Assumptions

- **P1 · Idioma.** Este plan y las tareas, en español; las páginas, las pruebas y los comentarios, en inglés (A1 de la spec: el dueño lo confirmó). Es la regla de los planes 001 y 002. Reversible.
- **P2 · El orden de las olas cambia el del Lead** (D5): docs-facts va en la ola 2 y la reducción del README en la 3. Si el Lead prefiere docs-facts al final, la Task 15 se mueve detrás de la Task 16 y la Task 16 deja de ampliarla; nada más cambia. Reversible.
- **P3 · `docs/reference/` tiene una sola página, `components.md`.** R7 no pide otra, y R13 solo permite ese directorio por ella. Reversible.
- **P4 · Los encabezados del README** son `## Requirements`, `## Install`, `## First start`, `## Where to go` y `## License`, y su línea de versión es `Version 0.10.0 ([changelog](docs/changelog.md))`. R1 fija el orden y el contenido, no las palabras. Reversible: la prueba R1 de la Task 16 es la única que las nombra.
- **P5 · Títulos y órdenes de las páginas** son los de la tabla de «Global Constraints». Una landing o un generador los puede cambiar sin tocar el contenido. Reversible.
- **P6 · `docs/handoff/` y `docs/models/README.md` no se listan por audiencia.** R9 pide `docs/models/README.md` y `docs/issues/`, además de lo que el README enlazaba; `docs/handoff/` no estaba en el README y no se añade (YAGNI). Reversible.
- **P7 · Las pruebas de rutas, del conteo de `bin/`, del rango de decisiones y de la línea «Now»** están en docs-facts aunque R11 no las enumere: C3 pide «rutas, bins, versión» a una máquina, y R12 nombra tres de esas afirmaciones. Cada una lee las páginas y, desde la Task 16, el README. La excepción de rutas es una: `scripts/aether-install.js`, el instalador de 0.6, nombrado como retirado. Reversible: se borran los tests.
- **P8 · El plan de ejemplo de la guía de inicio** usa rutas `src/` y `test/` (no `tests/`), para que la prueba de rutas no lo tome por una ruta del repositorio. Reversible.
- **P9 · El script de comprobación de página no se commitea** (R13 no deja un archivo nuevo fuera de la lista). Va en «Global Constraints» y cada implementador lo guarda fuera del repositorio. Reversible.
- **P10 · Modelos.** Las páginas van en Sonnet a `high`; los lectores, docs-facts, el README y las auditorías, a `xhigh`; el changelog y la frase de la skill, en Haiku a `high`, porque una comparación exacta o una prueba que fija la cadena entera los deja sin margen. El Lead puede subirlos. Reversible.
- **P11 · El presupuesto** es `Max agents: 150`: 20 unidades, de 4 a 7 agentes cada una con la fusión y la limpieza, y margen para reintentos.

## Risks

- **Quitar una sección de un texto que la tiene dos veces.** Mientras el README y las páginas guardan el mismo texto (olas 1 a 3), una prueba que lo quita del conjunto con `String.replace` quita solo la primera copia y deja la otra: «only Upgrading from 0.6 names…» lee cada archivo sin su propia sección (hallazgo 1 del Juez, en la Task 13). Una prueba nueva de este tipo debe hacer lo mismo.
- **Una página de la ola 1 con un defecto frena a docs-facts (Task 15) en la ola 2.** Es la señal buscada: la unidad se bloquea con el nombre del defecto, el Lead relanza la página y después la Task 15. Las demás unidades de la ola 2 no dependen de eso.
- **Perder texto al mover.** Se cubre por tres lados: la comprobación exacta del changelog (Task 10), los lectores corridos sin el README (Task 13) y la verificación fila por fila de D1 (Task 20). Lo que el README tenía y ninguna prueba nombra lo atrapa la Task 20.
- **Una cadena fijada se escapa de una página** y la reducción del README la deja sin casa. La Task 13 corre los tres lectores sin el README antes de que la Task 16 lo reduzca; si falta una cadena, la unidad se bloquea con su nombre y se corrige la página.
- **Las páginas se escriben a la vez y se enlazan entre sí.** La tabla de anclas de «Global Constraints» fija las únicas anclas ajenas permitidas; los enlaces a una página que otra tarea escribe no se comprueban hasta docs-facts.
- **El README corto se desvía de lo que dice la guía.** Las dos cosas que repite (el comando de arranque y la instalación) las fija R1 y la prueba de la Task 16; el resto lo lee de `getting-started.md`.
- **Una prohibición de las pruebas alcanza a las páginas nuevas** (nota 5 del Juez): `aether:designer`, los nombres retirados fuera de «Upgrading from 0.6», «main session, on Sonnet» y compañía, «provisional» e «interim» en una línea de grok y cuota. Están en «Global Constraints», y el script de comprobación las busca.
- **Tareas grandes (issue 003).** Ninguna posee más de cinco rutas; la más larga en texto, la Task 1, tiene un archivo.
- **La auditoría encuentra algo que solo un cambio del plugin arreglaría.** R13 prohíbe tocar el plugin: la página dice lo que el código hace, y el hallazgo va a la lista del dueño en el informe de la tarea.
- **C1 no se cierra aquí.** El revisor independiente y la corrida real del dueño (A10) son posteriores al swarm; el plan solo deja la guía lista y las salidas de lo que sí se corrió.
- **`npm run check` necesita la CLI `claude`.** Si no está en el entorno de la Task 20, la tarea lo informa y el Lead lo corre en su sesión.
