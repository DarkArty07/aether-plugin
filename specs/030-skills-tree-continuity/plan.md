# Plan: soporte formal de skills, un árbol de archivos ordenado y continuidad entre sesiones

- **Spec:** [spec.md](spec.md) (aprobada por el Judge en la revisión 3). Hechos con fuente: [research.md](research.md). Tarjeta: [intent.md](intent.md).
- **Rama:** `feat/030-skills-tree-continuity`, sobre `main` ac1e68a. La versión que sale es 0.35.0.

La spec es una sola feature con cuatro historias en orden (H1 continuidad, H2 archivos y estado, H3 skills, H4 ordenar proyectos). El plan las construye en ese orden, y cada historia deja el producto utilizable aunque las siguientes no se hagan. Esta sesión no tiene la herramienta Workflow: cada tarea la construye un delegado de la escalera de delegados, en su propia copia de trabajo, y el Lead las fusiona de una en una. Cada tarea es de un solo módulo y una sola preocupación, con sus pruebas.

## Technical context

- **Pila:** Node.js 22, CommonJS, sin dependencias (el `package.json` de la raíz es privado y solo tiene scripts). Las pruebas son `node:test` sobre repositorios git y carpetas desechables de `tests/helpers.js` (`tempDir`, `makeRepo`, `commitIn`); el mod (`hooks/*.mjs`) se prueba con `npm run test:mod`.
- **Dónde se engancha cada cosa** (leído en `main` ac1e68a; `research.md` §5):
  - `plugins/aether/hooks/hooks.json`: hoy SessionStart (notas y cinco partes), PreToolUse (`aether-guard`) y los cinco hooks de `aether-observe`. No hay Stop, PostCompact, PostToolUse de archivos ni PermissionRequest.
  - `lib/session.js` (`markSession`, `isAetherSession`, `pruneSessions`) y `lib/session-start.js` (`main`, las notas junto a `autonomyNote`, `pruneOldFiles`): la marca de la sesión del Lead y el arranque.
  - `lib/guard.js` (`decide` para las herramientas de archivos, `decideBash`, `irreversibleClasses`, `protectedMention`) y `lib/autonomy.js` (`CLASSES`), `lib/autonomy-command.js` (los verbos de `aether-autonomy`), `lib/voice.js` (las palabras del dueño).
  - `lib/delegate-task.js` (`parseBrief`, `begin`), `lib/plan.js` (`parseAetherFields`, `renderBrief`), `lib/plan-compile.js` (`check`, `compile`), `lib/lane-calls.js` (`claudeMdSections`).
  - Las rutas de `.aether/`: `lib/run.js`, `lib/worktrees.js`, `lib/lane-work.js`, `lib/exam.js`, `lib/seats.js`, `lib/seat-calls.js`, `lib/delegate-calls.js`, `workflows/*.workflow.js`, `hooks/ops-command.mjs`, `agents/implementer.md`, `agents/examiner.md`.
- **Lo que las pruebas ya fijan y esta feature toca:** `tests/guards.test.js` exige que cada módulo de `lib/` tenga un comentario de cabecera con su `Family:`, que la familia esté declarada en `docs/reference/components.md`, que no haya un ayudante definido dos veces ni nombres sin uso, y que `lib/` no tenga ciclos (`tests/layers.test.js`). `tests/docs-facts.test.js` fija la lista de páginas, el conteo de comandos de `bin/`, las decisiones y el orden del changelog. `tests/commands.test.js` exige que cada verbo de cada bin tenga un llamador (un hook, una skill o un agente). `tests/autonomy.test.js:51` fija las clases irreversibles en siete.
- **Estructura nueva** (nombres elegidos por el plan, ver Design):
  - Bin: `bin/aether-continuity` (delgado, como los demás).
  - Familias de `lib/` nuevas: `continuity-*` (nota de sesión y sus hooks), `tree-*` (rutas de `.claude`, comprobación de `CLAUDE.md`, mapa, limpieza y migración de `.aether/`), `skill-*` (reglas, registro, encargo, revisión, hallazgo repetido, sin uso), `tidy-*` (detector, informe, guarda).
  - Skills nuevas del plugin: `skills/skills/`, `skills/art-direction/`, `skills/tidy/`; se retira `skills/onboard/`.
  - Guía nueva: `docs/guide/project-files-and-skills.md` y `docs/es/guias/archivos-skills-y-continuidad.md`.

## Gate

Sin `.specify/memory/constitution.md` en este repositorio, las comprobaciones son las de la plantilla y las invariantes del proyecto (`CLAUDE.md`).

- Nada especulativo y nada para una necesidad hipotética: **pasa.** Cada pieza sirve a un requisito de la spec; lo que la spec deja fuera (hook con Haiku, `WorktreeCreate`, SkillsMP, `.claude/agents/`) no está en el plan.
- Ninguna abstracción, opción, archivo o dependencia que ningún requisito pida: **pasa.** Cero dependencias; ninguna opción nueva en `plugin.json`; un bin nuevo (R2). Cada archivo nuevo de `lib/` se justifica en Files con su requisito. El registro de familias nuevas es lo que `tests/guards.test.js` exige, no un invento (ver Complexity).
- La huella dormida es una invariante (`CLAUDE.md`, R40, R42): **pasa con medición.** Todo hook nuevo sale con 0, sin salida y sin escribir cuando la sesión no es del Lead; una prueba lo comprueba hook por hook y la tabla de `components.md` se mide otra vez. Los PostToolUse nuevos comparten un solo proceso (ver Design D4) para no multiplicar el costo.
- Sin modelo en ningún comportamiento (R41): **pasa.** Hooks y bins; el contenido de las skills de un encargo lo pega código.
- Los bins son delgados y la lógica vive en `lib/` (`CLAUDE.md`): **pasa.**
- Las pruebas no tocan la red, un `.aether/` real ni las carpetas del dueño (R39, R44): **pasa.** Cada prueba recibe `home`, `configDir`, `dataDir` y `procRoot` por parámetro o por el entorno de un proceso hijo.
- Las acciones irreversibles de la spec (la prueba real de C7, instalar skills, borrar restos, migrar, merge, push, etiqueta, instalación) no son tareas: **pasa.** Van como pasos del Lead en Deployment.

## Design

**D1. La nota de sesión es un JSON por sesión en `<memoria>/continuity/<id>.json`.** La carpeta de memoria sale de `autoMemoryDirectory` (en `<configDir>/settings.json`), si no de `CLAUDE_CODE_PROJECT_DIR_NAME`, si no de la regla de la máquina del dueño: `<configDir>/projects/<ruta del checkout principal con cada carácter que no es letra o dígito cambiado por "-">/memory` (A15). La ruta principal sale de `repoPaths(cwd).mainRoot`, así todas las copias de trabajo del repositorio comparten carpeta. La nota trae: `version`, `session`, `source`, `fork` (`true` cuando la sesión nació de un fork), `cwd`, `repo`, `branch`, `commit`, `startedAt`, `updatedAt`, `lastMessage` (hasta 2.000 caracteres), `compactSummary` (hasta 8.000), `process` (`{ pid, start }` o null), `closed` (`{ at, reason }` o null) y `cut` (`{ at, reason }` o null). Se escribe de forma atómica (`writeFileAtomic`). Es JSON y no Markdown para que ningún lector de memoria la confunda con una entrada; ningún código de esta feature toca `MEMORY.md` (R9). Serves: C1, C3.

**D2. La identidad del proceso `claude` se lee de `/proc`** subiendo por los procesos padres del hook hasta el proceso cuyo `comm` es `claude`; la hora de arranque es el campo 22 de `/proc/<pid>/stat`. Un proceso está vivo cuando existe su `stat` y su hora de arranque es la guardada; sin `/proc` el resultado es «desconocido» (`null`) y no se afirma ningún corte (R6). Todas las funciones reciben `procRoot` para que las pruebas armen un `/proc` falso. Serves: C1, C2, C6.

**D3. Un solo bin nuevo, `aether-continuity`, con siete verbos de hook:** `stop`, `precompact`, `postcompact`, `stopfailure`, `sessionend` (las notas, R2), `posttool` (los avisos tras escribir, D4) y `permission` (R20). Se queda en un bin, y no en dos o tres, para mantener los comandos de `bin/` en quince y porque los tres grupos comparten el filtro «solo la sesión del Lead» (R40). El bin lee la entrada, comprueba `isAetherSession` y llama a `lib/continuity-hook.js`, `lib/continuity-posttool.js` o `lib/continuity-permission.js` con un `require` perezoso; un verbo cuyo módulo falla sale con 0 y sin salida (un hook nunca falla ni imprime sin querer). Los hooks de `hooks.json` son entradas propias, separadas de las de `aether-observe` (R3, R4): `SessionEnd` de continuidad no comparte el `timeout` de la de observación, y el almacén de `aether-observe` sigue sin guardar texto. `PreCompact` y `PostCompact` no imprimen nada: la nota guarda el resumen y la compactación no cambia (H1 escenario 3). Serves: C1, C14.

**D4. Un solo despachador de PostToolUse** (`lib/continuity-posttool.js`), con una lista de manejadores, cada uno un módulo con `posttool(input, ctx)` que devuelve un texto o nada: el recordatorio de memoria (R9), la revisión de `CLAUDE.md` y `AGENTS.md` (R12), el registro de una instalación de skill (R26), la revisión de una skill nueva (R32) y el hallazgo repetido tras un veredicto (R31). La salida se entrega como `additionalContext` del evento PostToolUse. Una sola entrada de `hooks.json` (`Write|Edit|MultiEdit|Bash`) evita seis procesos `node` en una sesión que no es del Lead. Serves: C3, C5, C9, C11, C14.

**D5. SessionStart gana el aviso de continuidad y se reordena.** `lib/session-start.js` corre ahora en `startup`, `resume`, `clear`, `compact` y `fork` (el matcher de `hooks.json` agrega `fork`). Las partes del arranque y la limpieza siguen en `startup`, `clear` y `compact` (no en `resume`: la conversación ya las trae); el aviso de continuidad sale en `startup`, `resume`, `clear` y `fork`, nunca en `compact` (A11). El aviso son de 3 a 5 líneas compuestas por `lib/continuity-notice.js` (lee la nota anterior más reciente que no es la propia, la compara con git, nombra ramas sin fusionar, delegados sin resultado y sesiones activas, y da `claude --resume <id>` solo si la sesión se cortó), sin nota anterior es una línea, y se suma al `systemMessage` y al `additionalContext` dentro del tope de `PART_LIMIT`. El arranque abre la nota de la sesión (con `source` y, en un fork, el origen) para que una sesión sin turnos también deje rastro. Serves: C2.

**D6. Diseño nuevo de `.aether/`.** Se eligió el cambio mínimo que cumple R15 y deja intacto el código que ya funciona:

| Lugar nuevo | Qué es | Antes |
| --- | --- | --- |
| `.aether/worktrees/<run>/<task>` | copias de las unidades de un run | igual |
| `.aether/worktrees/lanes/<run>/<call>` | copias desechables de los lanes de solo lectura | `.aether/lanes/` |
| `.aether/worktrees/exams/<feature>-<id>` | copias donde corre el examen | `.aether/exams/` |
| `.aether/work/seats/<id>/` | el trabajo de una ronda de seat (con su copia `wt`) | `.aether/seats/` |
| `.aether/work/delegates/<id>/` | el trabajo de un delegado de otro harness (con su copia `wt`) | `.aether/delegates/` |
| `.aether/tmp/` | lo temporal: encargos, paquetes, mensajes de seats | `.aether-tmp/` (en la raíz de la copia) |
| `.aether/exam/` | el examen mientras lo escribe el Examinador | `.aether-exam/` |
| `.aether/runs/`, `.aether/autonomy/`, `.aether/broken-runs/`, `.aether/pending.jsonl` | sin cambio | igual |
| `.aether/README.md` | el mapa | no existía |

Las copias de runs, unidades y lanes quedan en `worktrees/`; el trabajo de seats y delegados queda agrupado en `work/`. En cada copia de trabajo, lo temporal está en `<copia>/.aether/tmp/` y el examen en `<copia>/.aether/exam/`. Las líneas de exclusión de git siguen siendo `/.aether/`, `/.aether-tmp/` y `/.aether-exam/` (las dos últimas solo cubren el estado viejo). El código nuevo lee los lugares viejos y los nuevos y escribe solo en los nuevos. Serves: C6.

**D7. El mapa `.aether/README.md` sale de un módulo de código** (`lib/tree-map.js`): una tabla `LAYOUT` con cada entrada de `.aether/` (qué es, quién la escribe, cuánto dura, si va a git), el texto del README que se genera de ella y la comprobación de que el README existe. Una prueba recorre el código de Aether, saca las rutas que escribe en `.aether/` y comprueba que cada una está en `LAYOUT`; la guía copia el mismo mapa y una prueba de docs compara los nombres. Serves: C6.

**D8. Limpieza de arranque y sello por proyecto.** `lib/tree-clean.js` borra `tmp/` y `.aether-tmp/` de más de 24 horas, los trabajos de seats y delegados terminados de más de 7 días (sin copia registrada con cambios) y lo que `sweepStale` ya borra a las 24 horas se queda (A6). «Sesiones terminadas» se lee como las carpetas por sesión de `tmp/seats/<sesión>/` y los trabajos de delegados terminados: las marcas de sesión del directorio de datos siguen con su poda de 30 días. El sello de 10 minutos pasa de `<datos>/sweep-stale.json` (uno para todos) a un archivo por proyecto, `<datos>/sweep/<sha1 de la ruta principal>.json`, escrito de forma atómica: dos proyectos no se pisan (issue #186) y no hace falta un candado. Serves: C6.

**D9. Migración del estado viejo sin perder trabajo.** `lib/tree-migrate.js` mueve las carpetas viejas (`.aether/lanes`, `.aether/exams`, `.aether/seats`, `.aether/delegates`, `<raíz>/.aether-tmp`, `<raíz>/.aether-exam`) a las nuevas solo en un arranque de sesión y solo cuando ninguna de las tres condiciones de R19 se cumple. Una copia de trabajo registrada en git se mueve con `git worktree move` (sigue registrada, con sus cambios sin guardar); lo que falla se queda donde está; no borra nada. Las tres condiciones usan: la marca de sesión nueva (repositorio, proceso con hora de arranque, última actividad; D2), la marca vieja sin campo de repositorio de menos de 12 horas y la última escritura bajo `.aether/`, `.aether-tmp/` o `.aether-exam/` en las últimas 2 horas (A18). **El orden importa (hallazgo menor del Judge):** la decisión de migrar se calcula antes de que la sesión que arranca escriba nada (la marca de su propia sesión se excluye de (a); el README de D7, el sello y la limpieza de D8 se escriben después), y una prueba fija ese orden. Serves: C6.

**D10. Permisos de `.claude`.** `lib/tree-paths.js` clasifica una ruta resuelta (sin `..`, siguiendo enlaces simbólicos) como `skills`, `rules`, `config` (`settings.json`, `settings.local.json`, `hooks/`), `other` o `escape`. El hook `permission` solo responde `allow` cuando la ruta es `skills` o `rules` del `.claude/` del proyecto de la sesión (A13) y la sesión es del Lead; para cualquier otra cosa no imprime nada. La guarda (`lib/guard.js`) rechaza `config` para cualquier agente, con las herramientas de archivos y con Bash que nombra esas rutas (R21). El límite de A14 (un guion que arma la ruta en tiempo de ejecución) se dice en Risks. Serves: C7.

**D11. Las skills tienen cuatro tipos, clasificados por la ruta real** (`lib/skill-rules.js`): `aether` (dentro de la carpeta de skills del plugin instalado o de `CLAUDE_PLUGIN_ROOT`), `owner` (`~/.agents/skills/` y `~/.claude/skills/`, salvo las que el registro global lista como bajadas), `project` (`.agents/skills/` del proyecto, salvo las que `skills-lock.json` lista) y `downloaded` (las listadas en un lock). **Excepción del plan a R23:** una skill de Aether cuya ruta real queda dentro del repositorio de la sesión (se está desarrollando Aether, como en este repositorio) no se rechaza; sin esa excepción el Lead no podría editar `plugins/aether/skills/**` aquí. Una prueba fija las dos cosas. La guarda rechaza editar `aether` y `downloaded` con el mensaje que dice cómo copiarla a `.agents/skills/` con otro nombre, deja editar `project`, y pone en la clase `skill-install` toda escritura en `owner`. Serves: C8, C11.

**D12. La clase `skill-install` y la lista de confianza.** `CLASSES` de `lib/autonomy.js` gana `skill-install` (ocho clases). `lib/skill-rules.js` analiza un comando Bash (`npx skills add`, `bunx skills add`, `pnpm dlx skills add`, `skills add`) y saca la fuente, el autor (primer segmento de `owner/repo`, en minúsculas, tras los dos alias de skills.sh) y si es global (`-g`/`--global`). `lib/guard.js` clasifica el comando como `skill-install` salvo cuando el autor está en la lista de confianza y la instalación no es global; una fuente sin autor (ruta local, URL de otro sitio) y `-g` siempre lo son. La lista es `<datos>/skills/trusted.json` y empieza vacía (A1, A2); solo la escribe `aether-autonomy trust --author <autor> --quote <palabras>`, que verifica las palabras con `lib/voice.js` como `grant`; la guarda rechaza editarla. Serves: C9.

**D13. Skills en un encargo, por dos caminos que comparten un módulo.** `lib/skill-brief.js` resuelve los nombres (primero `.agents/skills/` y `.claude/skills/` del proyecto, luego las del dueño, luego las de Aether como `aether:<nombre>`), comprueba los límites de A7 (hasta 3, `SKILL.md` de hasta 500 renglones, total pegado hasta 1.500, nombre y descripción válidos), pega el contenido y agrega una línea a `<datos>/skills/uses.jsonl`. El camino del swarm es `aether-plan compile` (`renderBrief` escribe `AETHER-SKILLS:` y el contenido; `aether-plan check` rechaza más de 3 o una que no existe) y cubre los implementadores y los lanes externos; el camino de las delegaciones del Lead es `delegate-task.js` (`parseBrief` lee `AETHER-SKILLS:`, `begin` pega el contenido, anota el registro `launch` y se niega a lanzar con un error claro). Hacen falta los dos porque el hook de agentes no toca a los agentes `aether:*` (R45). Serves: C10.

**D14. Los avisos de skills viajan por los manejadores y por SessionStart:** el registro de instalaciones y la comprobación contra `skills-lock.json` (R26, con el `computedHash` de skills.sh: SHA-256 sobre los archivos ordenados por ruta relativa, ruta y luego bytes, sin `.git` ni `node_modules`, sin enlaces), la revisión de una skill recién escrita (R32), el hallazgo repetido entre tareas con `ladder.parseFinding` y `ladder.findingKey` (R31, A10) como manejadores de PostToolUse, y las skills sin uso (R33) con el detector de desorden (R36) en el aviso de arranque. Cada aviso es una línea, y juntos se quedan dentro de `PART_LIMIT`. Serves: C9, C11, C13.

**D15. La regla de la guarda de `aether:tidy`** (`lib/tidy-guard.js`, llamada desde `decideBash` y `decide`): `rm`, `mv`, `git rm`, `git mv`, `rmdir` y `unlink` sobre los archivos que la skill ordena (los restos del CLI viejo, `CLAUDE.md`, `AGENTS.md` y las carpetas de skills) son `delete`, y un Write que deja vacío `CLAUDE.md` o `AGENTS.md` también. La regla de hoy (`rm -r -f` sobre un destino riesgoso) no cambia y `tests/guard.test.js:414-417` sigue pasando. Serves: C13.

**D16. `aether:tidy` informa con un verbo de solo lectura:** `aether-doctor tidy [<proyecto>...] [--projects <carpeta>]` imprime un JSON con el detector (D14) y la lista de lo que movería o borraría por proyecto, sin escribir. La skill le dice al Lead que corra ese verbo, muestre la lista, pida el sí y aplique solo la lista aprobada. Serves: C13.

**D17. La skill de dirección de arte y el Writer** (R34, R35): `skills/art-direction/SKILL.md` y `skills/skills/SKILL.md`, la línea del Writer y de la skill `plan` (y del preset `speckit/commands/speckit.plan.md`) que ponen `specs/NNN-<tema>/art-direction.md` antes del plan de una feature visual. Sin hook. Serves: C12.

**D18. Reglas del Lead** (`skills/using-aether/SKILL.md`, partes de a lo más 9.800 caracteres): crear skills por su cuenta y a qué nivel, no editar las bajadas, bajar solo de la lista de confianza o con el sí del dueño, leer el aviso de continuidad, `aether:tidy`, y los lugares nuevos de `.aether/`. Serves: C11, C12, C13.

**D19. Documentación y versión:** una guía en inglés y otra en español (reglas de los archivos, mapa de `.aether/`, cuatro tipos de skill, continuidad, ordenado), las páginas que describen rutas y hooks, la huella dormida medida, las decisiones A111 en adelante, el retiro de `/aether:onboard` en el changelog y la versión 0.35.0 en todos los lugares donde vive. Serves: C4, C5, C6, C8, C14.

## Files

Lo que cada tarea crea o cambia está en su campo `Owns`. En resumen:

- **Nuevos de `lib/`:** `continuity-store.js`, `continuity-hook.js`, `continuity-notice.js`, `continuity-posttool.js`, `continuity-permission.js`; `tree-paths.js`, `tree-check.js`, `tree-map.js`, `tree-clean.js`, `tree-migrate.js`; `skill-rules.js`, `skill-registry.js`, `skill-brief.js`, `skill-review.js`, `skill-repeat.js`, `skill-idle.js`; `tidy-detect.js`, `tidy-report.js`, `tidy-guard.js`.
- **Cambiados de `lib/`:** `session.js`, `session-start.js`, `guard.js`, `autonomy.js`, `autonomy-command.js`, `lane-calls.js`, `plan.js`, `plan-compile.js`, `delegate-task.js`, `run.js`, `worktrees.js`, `lane-work.js`, `exam.js`, `seats.js`, `seat-calls.js`, `delegate-calls.js`, `lane-schemas.js`, `doctor.js`.
- **Bins y hooks:** `bin/aether-continuity` (nuevo), `bin/aether-autonomy` (uso), `bin/aether-doctor` (verbo `tidy`), `hooks/hooks.json`, `hooks/ops-command.mjs`, `hooks/register.js` (comentario).
- **Workflows, agentes y skills:** `workflows/run.workflow.js`, `workflows/design.workflow.js`, `agents/implementer.md`, `agents/examiner.md`, `agents/writer.md`, `skills/using-aether/SKILL.md`, `skills/plan/SKILL.md`, `speckit/commands/speckit.plan.md`, `skills/skills/`, `skills/art-direction/`, `skills/tidy/`, `skills/help/SKILL.md`; se borra `skills/onboard/`.
- **Pruebas nuevas:** una por módulo nuevo, en `tests/`.
- **Documentos:** la guía nueva (inglés y español), `docs/index.md`, `docs/es/index.md`, `docs/reference/components.md`, `docs/guide/{maintenance,troubleshooting,observe,delegates,autonomy,design-seats}.md`, `docs/methodology.md`, `docs/what-aether-adds.md`, `docs/es/que-agrega-aether.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/changelog.md`, `README.md`, `CLAUDE.md`, `site/index.html` y las pruebas de documentos que fijan todo eso.

## Verification

- **Comando de prueba:** `npm test` (todas las pruebas de `tests/`, sin red ni modelo). Antes del cierre: `npm run test:mod`, `npm run validate` y `npm run check`.
- **Qué prueba cada criterio:**
  - **C1:** `tests/continuity-hook.test.js` corre cada verbo de `aether-continuity` con la entrada de Claude Code de una sesión del Lead sobre un repositorio y una carpeta de memoria desechables; mide los 200 ms de `sessionend`; `tests/observe-guarantees.test.js` (que ya existe) sigue comprobando que el almacén de observación no guarda texto, y una prueba nueva lo comprueba para `aether-continuity`.
  - **C2:** `tests/continuity-notice.test.js` (rama movida, rama sin fusionar, delegado sin resultado, otra sesión activa, corte, cierre, sin nota, nota ilegible; de 3 a 5 líneas) y `tests/session-start-continuity.test.js` (el tope de la salida).
  - **C3:** `tests/continuity-store.test.js` (poda de 31 días, de ramas fusionadas y de notas vigentes), `tests/continuity-posttool.test.js` (el recordatorio, y que ningún hook de la feature escribe `MEMORY.md`); el brief de la corrida lista lo que el Lead movió (paso del Lead).
  - **C4:** `tests/onboard-retired.test.js` (solo en el changelog y en `docs/decisions.md`; `/aether:help` no lo lista).
  - **C5:** `tests/tree-check.test.js`, `tests/lane-agents-md.test.js` y `tests/project-files-docs.test.js` (la regla en la guía).
  - **C6:** `tests/tree-map.test.js` (cada ruta escrita está en el mapa), `tests/tree-clean.test.js` (incluye dos proyectos, issue #186), `tests/tree-migrate.test.js` (marca nueva con proceso vivo, marca vieja, actividad reciente, arranque posterior, copia con cambios sin guardar) y `tests/session-start-tree.test.js` (el orden).
  - **C7:** `tests/continuity-permission.test.js` y `tests/guard-claude.test.js` (rutas permitidas, vecinas, con `..` y con enlaces simbólicos); la prueba real con `claude -p` es un paso del Lead.
  - **C8 y C9:** `tests/skill-rules.test.js`, `tests/guard-skills.test.js`, `tests/autonomy.test.js`, `tests/skill-registry.test.js`; ninguna toca la red.
  - **C10:** `tests/skill-brief.test.js`, `tests/aether-plan-skills.test.js` y `tests/delegate-skills.test.js`.
  - **C11:** `tests/skill-repeat.test.js`, `tests/skill-review.test.js`, `tests/skill-idle.test.js`, `tests/continuity-posttool-skills.test.js`.
  - **C12:** `tests/new-skills.test.js` y `npm run validate`.
  - **C13:** `tests/tidy-detect.test.js`, `tests/tidy-report.test.js`, `tests/guard-tidy.test.js`; el informe sobre los proyectos del dueño es un paso del Lead.
  - **C14:** `tests/dormant-030.test.js` corre cada hook y cada bin nuevo con una sesión que no es del Lead; `docs/reference/components.md` trae la huella medida; `npm run check`.

## Deployment

Aether se publica como plugin; esta feature no despliega nada por sí misma. El merge a `main`, el push de `feat/030-skills-tree-continuity`, la etiqueta `aether--v0.35.0` y la instalación son acciones irreversibles (`merge-main`, `push`, `publish`) que son del dueño y que la spec lista bajo Irreversible actions: el plan no las ejecuta, quedan en «Espera tu sí» del brief. La comprobación de que la versión salió bien es `npm run check` en verde sobre la rama y, después de que el dueño instale, una sesión nueva del Lead que muestra el aviso de continuidad.

**Pasos del Lead (no son tareas del swarm ni de delegados):**

1. **La prueba real de C7** (`paid-call`, ya cubierta por el permiso «Apruebo hgasto», 2026-10-27, alcance repo): `scripts/aether-lead --plugin-dir <árbol>/plugins/aether --model haiku --max-budget-usd 1 -p '<prompt>'`, que pide escribir `.claude/skills/x/SKILL.md` y `.claude/settings.json`; se anota el resultado y el costo.
2. **El informe de `aether:tidy`** sobre cada proyecto de `~/Desktop/03_PROYECTOS/01_ACTIVOS`, en solo lectura, guardado como `specs/030-skills-tree-continuity/tidy-report.md` con el árbol y el `git status` idénticos antes y después (R39).
3. **Mover las fotos del estado** del índice de la memoria de este repositorio a `memory/archive/` y listar lo movido en el brief (R48); las preferencias generales a `~/.claude/rules/` esperan su sí.
4. **El brief le pide al dueño** aprobar `anthropics` y `vercel-labs` con `aether-autonomy trust --author anthropics --quote "<sus palabras>"` (R47).
5. **La migración del estado viejo** corre de verdad solo cuando el dueño instala la versión; durante la construcción no se toca ningún `.aether/` real.
6. **El ajuste de `tests/docs-facts.test.js` y los pines de versión** los hace la tarea 39; el Lead solo comprueba `npm run check`.

## Assumptions

- **P1. Un solo bin `aether-continuity` para los siete verbos de hook** (D3), en lugar de un bin por hook. La spec pide «un bin propio de continuidad»; los verbos `posttool` y `permission` comparten su filtro de sesión. Reversible: separar el bin es mover dos módulos.
- **P2. La nota es JSON** (`<id>.json`) en `memory/continuity/` (D1). La spec dice «un archivo por sesión»; el formato no está fijado.
- **P3. El trabajo se tiene por fusionado cuando el commit de la nota es ancestro de la punta de la rama principal** (A12 precisado; cubre también una rama ya borrada). La rama principal es `origin/HEAD` si existe, y si no `main`, y si no `master`.
- **P4. `autoMemoryDirectory` se lee solo de `<configDir>/settings.json`** (los ajustes del usuario), no de los del proyecto. La regla de `CLAUDE_CODE_PROJECT_DIR_NAME` y la derivada de A15 se aplican en ese orden.
- **P5. Layout de `.aether/`** como la tabla de D6 (la spec fija el principio; los nombres `worktrees/lanes`, `worktrees/exams`, `work/seats`, `work/delegates`, `tmp` y `exam` son del plan). Reversible: son constantes de `lib/run.js` y de los módulos que las usan.
- **P6. «Sesiones terminadas» de R17** son las carpetas por sesión de `tmp/seats/<sesión>/` y los trabajos de delegados terminados, no las marcas de sesión del directorio de datos (esas siguen en la poda de 30 días de `pruneSessions`), porque borrar una marca por antigüedad de 7 días dejaría sin guarda a una sesión retomada.
- **P7. Una skill de Aether dentro del repositorio de la sesión se puede editar** (excepción de D11 a R23), para que el Lead pueda desarrollar Aether.
- **P8. La instalación de skills se reconoce por el comando Bash** (`npx`, `bunx`, `pnpm dlx` o el binario `skills`, con `add`) y por `-g` o `--global`; los alias de skills.sh son los dos de `research.md` §2. Otras formas de instalar (un guion de Node) no se detectan (A14).
- **P9. El informe de `aether:tidy` es el verbo `aether-doctor tidy`** y no un bin nuevo, para mantener quince bins; `doctor` ya es la comprobación de solo lectura.
- **P10. El aviso de continuidad va en el `systemMessage` (lo ve el dueño) y en el `additionalContext` (lo lee el Lead)**, con el mismo texto, dentro del tope de `PART_LIMIT`.
- **P11. Una delegación del Lead que ya trae `AETHER-SKILLS:` solo se rechaza al empezar** (`begin`); una corrección de la misma tarea vuelve a pegar las mismas skills, porque el encargo se vuelve a leer.
- **P12. Los tests de rutas viejas que cambian con D6 los corrige la tarea que mueve el código** (tareas 12 y 13), dentro de su `Owns`.

## Risks

- **A14 de la spec:** un comando que arma la ruta en tiempo de ejecución (un guion de Node que escribe en `.claude/`) pasa, porque Claude Code lo deja pasar y la guarda solo ve rutas escritas en el comando. Es el límite de la guarda de hoy; la documentación lo dice.
- **El hook `PermissionRequest` no se probó en una sesión interactiva** (`research.md` §1). Si Claude Code lo cambia, la escritura en `.claude/skills/` vuelve a pedir permiso sin romper nada (A16). La prueba real del Lead lo comprueba una vez.
- **La migración de `.aether/` toca estado vivo de otras sesiones** que no son detectables (las de la versión vieja inactivas más de 12 horas y sin escribir en 2 horas, A18). Por eso solo mueve, no borra, y `git worktree move` falla antes que perder una copia; lo que no se puede mover se queda.
- **`SessionEnd` comparte 1,5 s con `aether-observe`** (`research.md` §1): la parte de continuidad es mínima y se mide (R3). Si el tiempo de `aether-observe` fuera el riesgo, va a las Proposals de la spec, no a este plan.
- **Cambiar las rutas de `.aether/` toca unos 40 archivos de pruebas** (los que nombran `.aether-tmp`, `.aether-exam`, `.aether/lanes` o `.aether/exams`). Las tareas 12 y 13 se reparten esas pruebas por módulo y cada una corre `npm test` completo; un archivo de pruebas que ninguna nombre se reporta, no se edita fuera de `Owns`.
- **`aether-plan check` rechaza un plan en cadena;** el plan tiene cuatro puertas de historia (cada historia empieza cuando termina la anterior) pero dentro de cada una hay tareas en paralelo.
- **La spec y su R39 piden el informe sobre los proyectos del dueño;** `aether-doctor tidy` solo lee. Si un proyecto tiene permisos raros, el informe lo dice y sigue.
- **R48 (mover las fotos de la memoria) y la prueba real de C7 no tienen tarea:** son pasos del Lead; `aether-plan check` avisa de que ninguna tarea sirve a R48, y el aviso es esperado.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Un bin con siete verbos, `aether-continuity`, que además de las notas hospeda `posttool` y `permission` | R2 (bin propio de continuidad, distinto de `aether-observe`), R12, R20, R26, R31, R32 (hooks de PostToolUse y de permisos) | Un bin por grupo sube a diecisiete los comandos de `bin/` y repite el filtro de la sesión del Lead (R40) tres veces; cada bin nuevo cuesta pruebas de conteo en cinco archivos |
| Un solo despachador de PostToolUse con una lista de manejadores | R9, R12, R26, R31, R32 y R42 (la huella dormida se mide y debe quedar baja) | Cinco entradas de `hooks.json` lanzan cinco procesos `node` en cada `Write`, `Edit` y `Bash` de una sesión que no es del Lead |
| Cuatro familias nuevas de `lib/` (`continuity`, `tree`, `skill`, `tidy`) declaradas en `docs/reference/components.md` | R2, R14, R25, R37 (módulos nuevos); `tests/guards.test.js` exige que cada módulo de `lib/` tenga su familia | Meterlos como módulos sueltos (`loose`) rompe la regla de prefijo de la prueba, y un solo archivo por historia sería de más de mil renglones |
| La clase irreversible `skill-install` con la lista de confianza en `trusted.json` | R25, R47 | Reusar `publish` o `delete` mezcla la decisión de instalar una skill con la de publicar o borrar, y el permiso del dueño dejaría pasar lo que no dijo |
| La puerta de la migración con tres condiciones y `git worktree move` | R19 (una migración que no pierde trabajo ni rompe una sesión activa) | Mover las carpetas en el primer arranque puede romper una sesión de la versión vieja que sigue escribiendo, o perder una copia con cambios sin guardar |
| Un archivo de sello por proyecto y no un mapa en un solo JSON | R18 (issue #186; dos escrituras a la vez no pierden el sello de otro proyecto) | Un JSON compartido necesita un candado entre procesos y vuelve a perder sellos si el candado vence |
| Dos caminos de pegado de skills (`aether-plan compile` y `delegate-task.js`) sobre un módulo común | R29 y R45 (el hook de agentes no toca a los agentes `aether:*`, así que el swarm necesita el suyo) | Un solo camino deja sin skills al swarm y a los lanes externos, o a las delegaciones del Lead |
| La excepción de D11: una skill de Aether dentro del repositorio de la sesión se puede editar | R23 (sin la excepción el Lead no puede desarrollar Aether) | Rechazar toda ruta de `plugins/aether/skills/**` bloquea el desarrollo de este mismo repositorio |
