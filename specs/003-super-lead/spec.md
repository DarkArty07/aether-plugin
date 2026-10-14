# El super Lead: tres caminos y un modelo elegido para cada tarea

- Date: 2026-10-14
- Status: Draft, revision 2, after the Judge's `revise` on revision 1. Short design (route "Short design" of `using-aether`): the Lead wrote it, the Judge reviews it because it changes the Lead's core behavior, and delegate tasks build it. No plan and no tasks follow.
- Intent: que el agente principal se comporte como un super Lead orquestador, nativo en el plugin: opera Aether, elige el camino de cada trabajo (directo, tarea delegada o swarm) y elige el mejor modelo para cada tarea por costo, calidad y velocidad, también para las tareas delegadas, sabiendo siempre qué modelo usa. En palabras del dueño (2026-10-14):
  - «El agente principal, o sea tú, se tiene que comportar como un super lead orchestrator. Tiene que operar el sistema Aether, pero además tiene que ver qué modelo es mejor para cada tarea en base a costos, calidad y velocidad, como ya lo venía haciendo, pero tiene que aplicar también para los agentes delegate task. El sistema necesita tres caminos. El camino directo: el lead orchestrator hace el trabajo porque es un cambio muy acotado. El camino delegate task: porque es un trabajo acotado pero sigue siendo una tarea manejable. Y el camino swarm: porque es una tarea larga y costosa o compleja.»
  - «todo esto debería de venir cargado en el plugin […] hay algunas cosas que están anotadas en memory.md que SÍ deberían de ser comportamientos nativos del plugin»
  - «un orquestador debe saber siempre qué modelo está usando»
  - «te aconsejo que delegues para que dejes libre esta CLI y podamos seguir conversando»
- Source: `docs/handoff/2026-10-14-super-lead-and-quota-lanes.md`, §1 and §4.1.
- Amends: spec 002, only the path of the models index (line 28 and R17), from `docs/models/models.json` to `plugins/aether/config/models/models.json`.

## Context

Lo que hay hoy (rama `feat/grok-lane`, 705 tests en verde):
- El bootstrap del Lead es `plugins/aether/skills/using-aether/SKILL.md`, que `bin/aether-session-start` inyecta entero como `additionalContext` (líneas 16-19 y 129-137). Dice «You are the **Lead**: the main session, on Sonnet» (línea 9); «The route by size and risk» mezcla el camino directo y el delegado en una fila («You, or one subagent with a self-contained brief», línea 68); «Your own tool work» manda el trabajo largo a «one subagent with a self-contained brief, on Sonnet unless the tier rubric says otherwise» (línea 246), sin decir que el modelo se pasa en la llamada; ningún texto del plugin habla del esfuerzo de un subagente. La tabla de precios (líneas 45-49) cubre solo Opus, Sonnet y Haiku.
- El caso que lo motivó (handoff §1.3): el dueño pasó la sesión a Opus con `/model` y un delegado lanzado sin `model` heredó Opus para una tarea acotada de código.
- Todos los agentes de Aether fijan su modelo y su esfuerzo en su definición: `judge`, `examiner` y `reviewer` en Opus `high`, `writer` en Sonnet `xhigh`, `supervisor` en Sonnet `high`, `implementer` en Haiku `xhigh` y `ops` en Haiku `low` (`plugins/aether/agents/*.md`).
- El índice de modelos está en `docs/models/` (`models.json`, `profiles.json`, `harness-models.json`, `README.md`), que no se distribuye con el plugin. Solo lista modelos de agy y grok: no tiene Haiku 5.5, que el swarm y el Lead usan de forma nativa, así que la regla 3 («cada modelo en uso tiene su perfil») no se cumple para los modelos nativos. Fable 5.1 no aparece en ninguna parte: ni en el índice ni en `config/prices.json`.
- El Lead no puede leer un archivo del plugin en otro proyecto: el bootstrap no le da la ruta de la carpeta del plugin, y el skill del swarm nombra `plugins/aether/config/lanes.json` (línea 28), una ruta que solo existe en este repositorio. El hook sí la conoce (`aether-session-start:14`, `CLAUDE_PLUGIN_ROOT`). Claude Code sustituye `${CLAUDE_PLUGIN_ROOT}` en el contenido de los skills y agentes de un plugin, pero no en el `additionalContext` de un hook (https://code.claude.com/docs/en/skills#available-string-substitutions; https://code.claude.com/docs/en/hooks#add-context-for-claude).
- El bootstrap mide 22,727 bytes. Claude Code guarda en un archivo el `additionalContext` de más de 10,000 caracteres y en su lugar pone la ruta y un preview de hasta 2,000 caracteres (la misma página de hooks). Así se midió en 2.1.296: un contexto de 19.8 KB llegó al Lead como un preview de 2 KB (`docs/claude-code-research.md` F21; `docs/evaluations/2026-10-09-installable/A2-start.md:116`). El Lead conoce el resto de sus reglas solo si abre ese archivo, y nada en los primeros 2 KB se lo pide.
- `aether-lane seat` ya acepta `--author opus` (`ALIASES` en `plugins/aether/lib/seats.js:36`), pero el bootstrap dice que el autor del spec es siempre `sonnet` (línea 96).
- Una llamada a Agent con `subagent_type: "fork"` corre siempre en el modelo de la sesión e ignora `model`.

## Criteria

- C1 · Asequible y Rápido. Cada llamada a Agent que hace el Lead para una tarea delegada pasa un `model` y un `effort` elegidos para la tarea por la rúbrica, y el Lead dice cuál y por qué; ningún subagente hereda el modelo ni el esfuerzo de la sesión, y los agentes de Aether conservan los de su definición. Evidencia: la sección Models del bootstrap lo dice; un test comprueba que la sección y la rúbrica están y que sus precios coinciden con `config/prices.json` y con el índice.
- C2 · Robusto. El Lead elige uno de tres caminos con límites dichos (directo, tarea delegada, swarm), y el trabajo largo nunca corre dentro de su conversación. Evidencia: la sección The three paths del bootstrap; un test comprueba que el bootstrap la tiene.
- C3 · Robusto. El Lead sabe qué modelo usa y para qué sirve cada uno: el plugin distribuye el índice de modelos con los modelos nativos de Claude incluidos, cada modelo en uso con su perfil, y el bootstrap le da al Lead su ruta absoluta. Evidencia: el builder escribe en `plugins/aether/config/models/`; los tests del índice cubren el harness `claude`; un test comprueba que la ruta que inyecta el hook existe.
- C4 · Robusto. Las reglas llegan al Lead aunque Claude Code le entregue el bootstrap como preview. Evidencia: un test comprueba que los primeros 1,800 caracteres del contexto inyectado tienen la orden de leerlo entero, los tres caminos y la regla del modelo; y una corrida de Claude Code con el modelo falso (sin llamadas pagadas), como la de A2-start, muestra que el primer mensaje del Lead lleva esa apertura.
- C5 · Robusto. Todo lo que el bootstrap y el skill del swarm nombran existe: comandos, subcomandos, agentes, skills y archivos de configuración. Evidencia: `tests/bootstrap-names.test.js`.
- C6 · Robusto. Ningún texto que se distribuye afirma que el Lead corre en Sonnet como un hecho ni nombra una ruta de este repositorio; el README, las decisiones y las descripciones del plugin dicen lo mismo que el bootstrap. Evidencia: los tests de C5 y los que fijan el README y los manifiestos; la decisión A48.

## User scenarios

1. Dado que el dueño pasó al Lead a Opus con `/model`, cuando el Lead necesita un arreglo acotado con tests, entonces lanza una tarea delegada con `model: sonnet` y `effort: high`, y dice «Sonnet en high: código acotado con tests».
2. Dado que el Lead necesita saber quién llama a una función en todo el repositorio, cuando lo pregunta, entonces manda un explorador en Haiku con `effort: medium`, en vez de leer muchos archivos él mismo.
3. Dado que una tarea delegada en Sonnet falló (terminó sin el trabajo, o su trabajo siguió fallando sus tests tras una ronda de arreglos), cuando el Lead la relanza, entonces la corre un modelo más arriba, en Opus con `xhigh`, y dice por qué.
4. Dado un cambio de una línea, cuando el Lead lo hace, entonces lo hace él mismo, en línea.
5. Dado un spec cuyo plan tiene seis tareas, cuando se aprueba, entonces el Lead lo construye con `/aether:run`, y los modelos de las tareas salen de su Tier. Dado un plan de dos tareas en Tier haiku, entonces el Lead lo construye con dos tareas delegadas en Sonnet.
6. Dado un Lead en otro proyecto, cuando va a nombrar un modelo para un rol, entonces lee `models/models.json` en la carpeta de config del plugin, en la ruta absoluta que le dio el bootstrap, y el archivo existe.
7. Dado que Claude Code guarda el bootstrap en un archivo y le muestra al Lead un preview de 2,000 caracteres, cuando el Lead empieza, entonces el preview le ordena leer el archivo entero y ya le dice los tres caminos y la regla del modelo.
8. Dado que el dueño pide validar grok con una llamada real, cuando el Lead la prepara, entonces no la corre: le da el comando exacto para que el dueño lo corra con `!`.

## Requirements

Bootstrap (`using-aether` SKILL.md; el texto exacto está en Proposed text):
- R1. La apertura del bootstrap, dentro de los primeros 1,800 caracteres del contexto que inyecta el hook, dice el papel del Lead, la orden de leer el bootstrap entero antes de actuar (y de leer el archivo guardado cuando llega como preview), que el Lead empieza en Sonnet y que el dueño puede moverlo con `/model` o `/effort`, que el Lead sabe en qué modelo corre y nunca lo deja heredar, y los tres caminos en una línea cada uno. Sirve a: C2, C4.
- R2. La sección «The three paths», después de «The route by size and risk», tiene la tabla de los tres caminos con sus límites (el swarm para un plan de tres tareas o más, o con una tarea de Tier opus; tareas delegadas para un plan de una o dos) y las reglas de la tarea delegada: brief autocontenido, en segundo plano, verificar antes de reportar, un solo escritor por archivo (worktrees para delegados que editan a la vez), exploradores en Haiku, y cada tarea delegada anotada con su modelo, su esfuerzo y su razón. Reemplaza «Your own tool work». Sirve a: C1, C2.
- R3. La primera fila de «The route by size and risk» se llama «No design», para que «Direct» nombre solo un camino; la tabla dice que la ruta decide cuánto diseño hace falta y los caminos quién construye; «Short design» termina en «then a delegate task or the swarm builds it», y «Spec and plan» en «the swarm builds them, or delegate tasks when the plan is small (see "The three paths")». Sirve a: C2.
- R4. La sección «Models» tiene la ruta del índice (`${CLAUDE_PLUGIN_ROOT}/config/models/models.json`) y la orden de leerlo antes de nombrar un modelo para un rol; las tres reglas del índice; la rúbrica de la tarea delegada (Haiku, Sonnet como default, Opus, y Fable 5.1 sin uso por A43), con los precios de `config/prices.json` y, para Fable, los de su entrada `excluded` del índice; `model` y `effort` en cada llamada a Agent para una tarea delegada, dichos con su razón, y nunca un fork; la rúbrica de esfuerzo; cuándo y cómo se sube (un modelo más arriba, en `xhigh`, cuando la tarea termina sin el trabajo o su trabajo sigue fallando sus tests tras una ronda de arreglos); que una tarea de plan hecha como tarea delegada corre en Sonnet, o en Opus si su Tier es opus; que los agentes de Aether conservan el modelo y el esfuerzo de su definición; que los agentes del swarm toman el Tier de su tarea; que la cuota la lee Aether con `aether-lane quota`; y que el Lead nunca corre un CLI de otro harness con prompt o con flag de aprobación: una llamada real de validación es del dueño, con `!`. Reemplaza la tabla de precios de «The method». Sirve a: C1, C3.
- R5. Cada lugar del bootstrap y del skill del swarm que hoy manda trabajo a «a subagent» nombra el camino y la regla del modelo: `using-aether` líneas 57, 99, 246, 248 y 256-258; `swarm` líneas 27, 102 y 114. El `--author` de un spec del Lead es el modelo en que corre (`sonnet`, u `opus` tras `/model`). Sirve a: C1, C6.
- R6. La línea Asequible del brief nombra el modelo y el esfuerzo de cada tarea delegada. La descripción del frontmatter de `using-aether` nombra los tres caminos y la elección del modelo. Sirve a: C1, C6.

Índice de modelos:
- R7. El builder escribe `models.json`, `profiles.json` y `harness-models.json` en `plugins/aether/config/models/` (el `--out` por defecto), y la parte generada del README en `docs/models/README.md` (un `--docs` nuevo, por defecto `docs/models`). Los tres archivos se mueven allí con su historia (`git mv`). Sirve a: C3.
- R8. El índice incluye el harness nativo `claude`, en la lista por defecto de `--harnesses`: los alias de `--model` de Claude Code (`haiku`, `sonnet`, `opus`, `fable`, según `claude --help`), con esfuerzos `low`, `medium`, `high`, `xhigh` y `max`, capturados a mano el 2026-10-14 en `harness-models.json`. Cada entrada de `models.json` lleva su `alias`, sus puntajes de Artificial Analysis en los cinco esfuerzos, su precio y su perfil. Claude Fable 5.1 (`claude-fable-5-1`, alias `fable`) va a una lista nueva `excluded`, con su razón (A43), su precio de Artificial Analysis y su perfil; no está en uso. Las cifras salen de la respuesta guardada de Artificial Analysis cuya ruta da el brief, o de la API de Artificial Analysis si ese archivo ya no está. Sirve a: C3.
- R9. `profiles.json` gana los perfiles de Claude Haiku 5.5 y Claude Fable 5.1, escritos desde las páginas de Anthropic, y los perfiles compartidos de Sonnet 5.5 y Opus 5.5 dejan de decir que solo toman `low`, `medium` y `high`: cada entrada dice los esfuerzos de su harness. La columna «Its maker says» de la rúbrica cita, palabra por palabra, el propósito de cada perfil. Sirve a: C3.
- R10. El hook reemplaza `${CLAUDE_PLUGIN_ROOT}` en el bootstrap por la ruta absoluta de la carpeta del plugin (`root`, `aether-session-start:14`), como Claude Code lo hace en los skills. Sirve a: C3, C5.
- R11. El skill del swarm nombra la tabla de lanes como `${CLAUDE_PLUGIN_ROOT}/config/lanes.json`, que Claude Code sustituye al cargar el skill, y la nota de grok en `config/lanes.json` nombra «models/profiles.json in the plugin's config folder», sin ruta del repositorio. Sirve a: C6.
- R12. El Lead, de forma directa (aether-guard solo deja escribir specs al Lead y al Writer), cambia `docs/models/models.json` por `plugins/aether/config/models/models.json` en la línea 28 y en R17 de spec 002, y anota en su Status que lo enmendó spec 003. Sirve a: C3.

Tests, verificación y documentos:
- R13. Un test nuevo, `tests/bootstrap-names.test.js`, corre el hook como el Lead y comprueba sobre el contexto inyectado y el skill del swarm: cada comando `aether-<x>` es un ejecutable de `bin/`; cada par `aether-<x> <sub>` que aparece dentro de un code span o de un bloque de código aparece también en el uso que ese comando imprime sin argumentos; cada `aether:<name>` es un agente, un skill o el workflow `run`; en el contexto inyectado no queda `${CLAUDE_PLUGIN_ROOT}`, y cada ruta que empieza por la carpeta del plugin existe, con `config/models/models.json` legible y una lista `models` no vacía; los precios de la rúbrica coinciden con `config/prices.json` (Haiku, Sonnet y Opus) y con la entrada `excluded` del índice (Fable); la cita de cada fila está en el propósito del perfil de su modelo; los primeros 1,800 caracteres tienen lo de R1; ninguno de los dos textos nombra `plugins/aether/`; y lo que el bootstrap dice del modelo inicial del Lead coincide con el `model:` de `agents/lead.md`. Los archivos de una corrida (`run.json`, `result.json` y los demás) no entran en estas comprobaciones. Sirve a: C4, C5, C6.
- R14. `tests/models-index.test.js` cubre las dos carpetas, el harness `claude` (alias, cinco esfuerzos, lane nula, perfil compartido con la entrada de agy), la lista `excluded` y la forma de los archivos guardados; los tests que fijan texto que cambia (`roles.test.js:51-52`, `manifest.test.js:22`, los de `launcher.test.js` y `session-start.test.js`) cambian con él. `npm run check` pasa. Sirve a: C3, C5.
- R15. `docs/decisions.md` gana A48 (el super Lead) y actualiza A11, A15, A16, D5 y la frase de la línea 3; el README dice lo mismo que el bootstrap en las líneas 13, 98, 124, 232 y 242 y en «How it works»; las descripciones de `plugin.json` y `marketplace.json` dicen que el Lead empieza en Sonnet y trabaja por tres caminos. Sirve a: C6.
- R16. Una corrida de Claude Code con el modelo falso, sin llamadas pagadas y con un `CLAUDE_CONFIG_DIR` propio, como la de A2-start, arranca al Lead desde el plugin de esta rama y guarda en `docs/evaluations/2026-10-14-super-lead/` el primer mensaje que recibe el modelo: el preview contiene la apertura de R1. Sirve a: C4.

## Proposals

- **Una tarea delegada en una lane externa** (por ejemplo `aether-lane task`), ordenada por la regla de cuota de spec 002, con las guardas de una unidad del swarm: worktree transaccional, credenciales fuera, reporte validado. Hoy la herramienta Agent solo corre modelos de Claude.
- **Partir el bootstrap** en un núcleo de menos de 10,000 caracteres, que se inyecta entero, y skills que el Lead carga cuando las necesita.
- **Un verbo `aether-lane models`** que imprima la tabla del índice, para un Lead que perdió la ruta tras una compactación.
- **Revisar el precio de lectura de caché de Sonnet 5.5**: la referencia de Anthropic dice US$0.20 por millón y `config/prices.json` (OpenRouter, 2026-10-07) dice US$0.10.

## Assumptions

- A1. El Lead sigue empezando en Sonnet con `xhigh` (`agents/lead.md`, el lanzador); solo cambia lo que el texto afirma. Base: el dueño no pidió otro modelo para el Lead. Reversible.
- A2. La tarea delegada empieza en Sonnet con `high`, y no en Haiku como una tarea del swarm, porque no tiene supervisor ni escalera propia; por eso una tarea de plan hecha como tarea delegada también corre en Sonnet, o en Opus si su Tier es opus. Base: handoff §1.2 («the default for a delegate task»). Reversible.
- A3. La rúbrica de esfuerzo de los delegados sigue la del Writer para el Tier: Sonnet y Opus nunca bajo `high`; `max` solo con una razón; un intento que sube de modelo corre en `xhigh`, como la escalera del swarm. Base: `agents/writer.md`. Reversible.
- A4. Las tareas delegadas son subagentes nativos; una tarea delegada en una lane externa queda en Proposals. Base: la herramienta Agent solo corre modelos de Claude, y una lane necesita las guardas del swarm. Reversible.
- A5. El bootstrap sigue siendo un solo texto inyectado, con lo esencial en sus primeros 1,800 caracteres y la orden de leerlo entero; partirlo queda en Proposals. Base: es el arreglo más chico que hace llegar las reglas dentro del preview de 2,000 caracteres que documenta Claude Code; llevarlo bajo 10,000 caracteres cambia la estructura del Lead. Reversible.
- A6. La lista del harness `claude` se captura a mano de `claude --help`, como las demás listas, porque Claude Code no tiene un comando que liste modelos. Reversible.
- A7. Las cifras de Artificial Analysis salen de la respuesta guardada del 2026-10-13, la misma que generó el `models.json` actual, así que reconstruir no usa la red; si ese archivo ya no está, el builder pide la API de Artificial Analysis con la clave del dueño (una consulta de datos, no una llamada a un modelo) sin imprimirla. Reversible.
- A8. Spec 002 se enmienda solo en la ruta del índice; su aprobación vale para el resto. Reversible.
- A9. El límite entre la tarea delegada y el swarm para un plan es de tres tareas, o una tarea de Tier opus. Base: con una o dos tareas el costo fijo del swarm (compilar, un supervisor por intento, una revisión final en Opus) pesa más que su paralelismo; las tareas de Tier opus (seguridad, migraciones, concurrencia, arquitectura) piden supervisor y revisión final. Reversible.

## Irreversible actions

None. Todo son commits locales en `feat/grok-lane`; la corrida de R16 usa el modelo falso y no hace llamadas pagadas; el push, el pull request y el merge son parte del release (handoff §4.5) y los decide el dueño.

## Out of scope

- Cambiar el modelo o el esfuerzo por defecto del Lead.
- Rutear las tareas delegadas por cuota (Proposals).
- El Tier, la escalera y los modelos del swarm, del Judge, del Writer y del Examinador.
- codex y cursor en el índice.
- Subir la versión del plugin: es parte del release.
- La memoria propia del Lead: no está en el repositorio.

## Proposed text

The exact text for `plugins/aether/skills/using-aether/SKILL.md`. Unchanged sections are not repeated. `${CLAUDE_PLUGIN_ROOT}` is written as is: the hook replaces it (R10).

**Frontmatter `description`:** add "the three paths (direct, delegate task, swarm) and the choice of model" before "fallbacks".

**The opening** replaces the first paragraph (line 9); the list "These work with you:" stays after it, with one item added before the swarm: `- **delegates**: one subagent for each delegate task, on the model you choose;`

    You are the **Lead**: the main session, holding the whole conversation with the owner in a 1M-token window. You are the owner's right hand and the accountable orchestrator, not a messenger. You answer for the whole result: a good design, a correct implementation and a correct deployment. You understand what the owner wants, decide who does each piece of work and on which model, and report in briefs. Your briefs are your work.

    **Read this whole bootstrap before you act.** If it reached you as a preview with the path of a saved file, Read that file in full first: every section of it binds you.

    You start on Sonnet at `xhigh`; the owner may move you with `/model` or `/effort`. Your system prompt names the model you run on: know it, and never let a subagent inherit it.

    Each piece of work takes one of three paths (see "The three paths"):
    - **Direct:** a very bounded change, about five tool calls and no edit-test-fix loop: you do it inline.
    - **Delegate task:** bounded work that is still a real task: one subagent in the background, on the model and effort you choose for it (see "Models").
    - **Swarm:** long, costly or complex work, an approved plan of three or more tasks, or with a task of Tier opus: `/aether:run`.

**The method:** lines 43-51 (the sentence on re-reading and the price table) go; the price table moves to Models.

**Understanding the intent**, line 57: "read it, or have an explorer subagent read it." becomes "read it, or send an explorer (a delegate task on Haiku) to read it."

**The route by size and risk** replaces the table (lines 64-70):

    The route says how much design a change needs; "The three paths" says who builds it.

    | Route | When | Design, then the build |
    |---|---|---|
    | No design | A small or reversible change | No document: the direct path, or a delegate task |
    | Short design | A bounded change | You write a short design; the Judge reviews it when it touches security or auth, data migrations or destructive operations, concurrency, or core architecture; then a delegate task or the swarm builds it |
    | Spec and plan | Architectural work | You write the spec and the Judge reviews it; the Writer writes the plan and the tasks and the Judge reviews them; the swarm builds them, or delegate tasks when the plan is small (see "The three paths") |

**The three paths**, a new section right after the route:

    ## The three paths

    Every step you take re-reads the whole conversation, so the cost of a step grows with it, and long loops do not belong in it. Choose the path first, then the model.

    | Path | When | Who | Model |
    |---|---|---|---|
    | Direct | A very bounded change: a few files, about five tool calls, no edit-test-fix loop. Reading a few files, a check, `git status`, a one-line fix and the swarm skill's commands are direct. | You, inline | Yours |
    | Delegate task | Bounded work that is still a real task: an edit-test-fix loop, a cleanup, a reader with its tests, a research sweep, a long verification. Also each task of an approved plan of one or two tasks, none of them of Tier opus. | One subagent in the background, with a self-contained brief | Chosen by you for the task (see "Models"), passed as `model` and `effort`, and said to the owner with the reason |
    | Swarm | Long, costly or complex work: an approved plan of three or more tasks, or with a task of Tier opus | `/aether:run` | Per task, by the plan's Tier and effort, with the ladder and a supervisor |

    - **The brief** of a delegate task is self-contained: the goal, the files, the test command, what done means, what it must not touch, and that it takes no irreversible action.
    - **In the background:** delegate tasks run in the background, so the owner can keep talking to you.
    - **Verify before you relay:** read a delegate's diff and run its tests before you report what it claims.
    - **One writer per file:** while a delegate edits this checkout, edit nothing it may touch. Delegates that edit at the same time each get their own worktree (`isolation: "worktree"`), and you merge them one at a time.
    - **Questions about the code** go to an explorer on Haiku, not to many reads of your own.
    - **Record it:** each delegate task is a line in the diary's Decisiones, or in your reply outside a run, with its model, its effort and why.

**Models**, a new section right after The three paths:

    ## Models

    Choose every model on purpose, for quality, cost and speed together.

    **The index.** `${CLAUDE_PLUGIN_ROOT}/config/models/models.json` lists each model Aether uses, native and on the lanes: its harness, the id or alias to pass, the efforts its harness takes, its scores at those efforts, its price and its profile; its `excluded` list says which models are left out, and why. Read it before you name a model for a role. Its three rules:
    1. Only the newest generation of each line is used: Sonnet 5.5, not Sonnet 5.
    2. Only a model its harness's own CLI lists is used.
    3. Each model in use has a profile written from its maker's pages. Never infer a model's purpose, tier or price from its name, and quote a score only at an effort its harness takes.

    **A delegate task's model.** Prices in USD per million tokens, input / output, at API list prices (`${CLAUDE_PLUGIN_ROOT}/config/prices.json`; Fable's from the index):

    | Model | Price | Speed | Its maker says | Use it for |
    |---|---|---|---|---|
    | Haiku 5.5, `haiku` | 0.10 / 0.50 | fastest | "high-volume, latency-sensitive tasks such as classification, extraction, and routing" | listings, lookups, explorers, mechanical edits |
    | Sonnet 5.5, `sonnet` | 2 / 10 | fast | "the best combination of speed and intelligence" | bounded coding with tests and a precise brief, cleanups, docs: the default |
    | Opus 5.5, `opus` | 4 / 20 | moderate | "long-running agentic coding and knowledge work" | hard debugging, a final review, or a task Sonnet already failed |
    | Fable 5.1 | 10 / 50 | slower | "demanding reasoning and long-horizon agentic work" | not used until Fable 5.5 (A43) |

    Haiku's prices rise five times when a prompt exceeds 100K tokens.

    - **On every Agent call for a delegate task, pass `model` and `effort`,** and say the model, the effort and why in the message that launches it. After `/model` or `/effort`, your own model and effort are not what a delegate needs. A delegate task is never a fork: a fork always runs on your model and ignores `model`.
    - **Effort:** Haiku `medium` for listings and lookups, `high` for mechanical edits; Sonnet `high`, or `xhigh` where the behavior matters beyond its tests (input parsing, the file system, security, data loss, concurrency); Opus `high`, or `xhigh` for hard debugging. `max` only with a reason the task needs it: it thinks for minutes per answer.
    - **Climb on failure:** start at the cheapest model that can do the task. When a delegate task fails, because it ends without the work or its work still fails its tests after one round of fixes, run it again one model up (Haiku, Sonnet, Opus) at `xhigh`, as the swarm's ladder does. A delegate task starts on Sonnet, where a swarm task starts on its Tier, because it has no supervisor and no ladder of its own: a plan task you build as a delegate task runs on Sonnet, or on Opus when its Tier is opus.
    - **Fixed models:** Aether's own agents keep the model and effort of their definition: pass neither when you start `aether:judge`, `aether:writer`, `aether:examiner` or `aether:reviewer`. A resumed agent keeps its model. The swarm's agents take their task's Tier and Review from the workflow.
    - **Quota:** lanes and seats spend other plans' quota, first the one most at risk of being wasted at its reset. `aether-lane quota` reads each harness's quota: read it yourself, and never ask the owner for a date or a balance.
    - **Other CLIs:** never run agy, grok, codex or cursor-agent with a prompt or an approval flag from your own shell, and never read their credentials: lanes and seats run them. A real call to validate one is a `paid-call`: give the owner the exact command to run with `!`.

**The design seats**, line 96: "`sonnet` for your spec, the Writer's model for the plan" becomes "for your spec, the model you run on (`sonnet`, or `opus` after `/model`); for the plan, the Writer's model". Line 99: after "in the background" add "; pass no `model` and no `effort`: its definition fixes them".

**The brief**, the Asequible line becomes: `- Asequible: <US$, cuota usada, y el modelo y el esfuerzo de cada tarea delegada>`

**Your own tool work** (lines 239-248) goes: The three paths replaces it.

**The execution method** replaces lines 256-258:

    When the plan is approved, choose its path (see "The three paths"): yourself, delegate tasks, or the swarm, `/aether:run`, which implements the plan's tasks in parallel, each on its model and effort, with a supervisor for every attempt, one merge at a time, a final review, and cleanup.

    In an autonomous run, choose the path yourself (the swarm, by default, when the plan has Aether fields and three or more tasks, or a task of Tier opus) and note it in the diary. Outside a run, recommend one in the brief with a quality, cost and speed reason, and for delegate tasks their model; the owner's yes starts it. When the swarm runs, load the `aether:swarm` skill and follow it.

The exact text for `plugins/aether/skills/swarm/SKILL.md`:
- Line 27: "and offer to build the plan with subagents meanwhile." becomes "and offer to build it meanwhile task by task, each as a delegate task: on Sonnet, or on Opus when its Tier is opus."
- Line 28: "`plugins/aether/config/lanes.json` names each harness's models." becomes "`${CLAUDE_PLUGIN_ROOT}/config/lanes.json` names each harness's models."
- Line 102: "Fix the work yourself when the fix is short; otherwise send it to a subagent, or ask" becomes "Fix the work yourself when it fits the direct path; otherwise send it to a delegate task, on the model the `using-aether` Models section picks, or ask".
- Line 114: "a longer one through a subagent or a relaunch" becomes "a longer one through a delegate task (on Opus when Sonnet already failed at it) or a relaunch".
