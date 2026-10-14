# El super Lead: tres caminos y un modelo elegido para cada tarea

- Date: 2026-10-14
- Status: Draft. Short design (route "Short design" of `using-aether`): the Lead wrote it, the Judge reviews it because it changes the Lead's core behavior, and delegate tasks build it. No plan and no tasks follow.
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
- El índice de modelos está en `docs/models/` (`models.json`, `profiles.json`, `harness-models.json`, `README.md`), que no se distribuye con el plugin. Solo lista modelos de agy y grok: no tiene Haiku 5.5, que el swarm y el Lead usan de forma nativa, así que la regla 3 («cada modelo en uso tiene su perfil») no se cumple para los modelos nativos.
- El Lead no puede leer un archivo del plugin en otro proyecto: el bootstrap no le da la ruta de la carpeta del plugin, y el skill del swarm nombra `plugins/aether/config/lanes.json` (línea 28), una ruta que solo existe en este repositorio. El hook sí la conoce (`aether-session-start:14`, `CLAUDE_PLUGIN_ROOT`).
- El bootstrap mide 22,727 bytes. En Claude Code 2.1.296 un contexto de hook de 19.8 KB se guardó en un archivo y al Lead le llegó un preview de 2 KB con la ruta (`docs/claude-code-research.md` F21; `docs/evaluations/2026-10-09-installable/A2-start.md:116`). El Lead conoce el resto de sus reglas solo si abre ese archivo, y nada en los primeros 2 KB se lo pide.
- `aether-lane seat` ya acepta `--author opus` (`ALIASES` en `plugins/aether/lib/seats.js:36`), pero el bootstrap dice que el autor del spec es siempre `sonnet` (línea 96).

## Criteria

- C1 · Asequible y Rápido. Cada llamada a Agent que hace el Lead pasa un `model` y un `effort` elegidos para la tarea por la rúbrica, y el Lead dice cuál y por qué; ningún subagente hereda el modelo ni el esfuerzo de la sesión, salvo los agentes cuya definición los fija. Evidencia: la sección Models del bootstrap lo dice; un test comprueba que la sección, la rúbrica y sus precios están y coinciden con `config/prices.json`.
- C2 · Robusto. El Lead elige uno de tres caminos con límites dichos (directo, tarea delegada, swarm), y el trabajo largo nunca corre dentro de su conversación. Evidencia: la sección The three paths del bootstrap; un test comprueba que el bootstrap la tiene.
- C3 · Robusto. El Lead sabe qué modelo usa y para qué sirve cada uno: el plugin distribuye el índice de modelos con los modelos nativos de Claude incluidos, cada modelo en uso con su perfil, y el bootstrap le da al Lead su ruta absoluta. Evidencia: el builder escribe en `plugins/aether/config/models/`; los tests del índice cubren el harness `claude`; un test comprueba que la ruta que inyecta el hook existe.
- C4 · Robusto. Las reglas llegan al Lead aunque Claude Code le entregue el bootstrap como preview. Evidencia: un test comprueba que los primeros 1,800 caracteres del contexto inyectado tienen la orden de leerlo entero, los tres caminos y la regla del modelo.
- C5 · Robusto. Todo lo que el bootstrap y el skill del swarm nombran existe: comandos, subcomandos, agentes, skills y archivos de configuración. Evidencia: `tests/bootstrap-names.test.js`.
- C6 · Robusto. Ningún texto que se distribuye afirma que el Lead corre en Sonnet como un hecho ni nombra una ruta de este repositorio; el README, las decisiones y las descripciones del plugin dicen lo mismo que el bootstrap. Evidencia: los tests de C5 y los que fijan el README y los manifiestos; la decisión A48.

## User scenarios

1. Dado que el dueño pasó al Lead a Opus con `/model`, cuando el Lead necesita un arreglo acotado con tests, entonces lanza una tarea delegada con `model: sonnet` y `effort: high`, y dice «Sonnet en high: código acotado con tests».
2. Dado que el Lead necesita saber quién llama a una función en todo el repositorio, cuando lo pregunta, entonces manda un explorador en Haiku con `effort: medium`, en vez de leer muchos archivos él mismo.
3. Dado que una tarea delegada en Sonnet falló dos veces, cuando el Lead la relanza, entonces sube a Opus en `xhigh` y dice por qué.
4. Dado un cambio de una línea, cuando el Lead lo hace, entonces lo hace él mismo, en línea.
5. Dado un spec cuyo plan tiene seis tareas, cuando se aprueba, entonces el Lead lo construye con `/aether:run`, y los modelos de las tareas salen de su Tier.
6. Dado un Lead en otro proyecto, cuando va a nombrar un modelo para un rol, entonces lee `<carpeta de config del plugin>/models/models.json` en la ruta absoluta que le dio el bootstrap, y el archivo existe.
7. Dado que Claude Code guarda el bootstrap en un archivo y le muestra al Lead un preview de 2 KB, cuando el Lead empieza, entonces el preview le ordena leer el archivo entero y ya le dice los tres caminos y la regla del modelo.
8. Dado que el dueño pide validar grok con una llamada real, cuando el Lead la prepara, entonces no la corre: le da el comando exacto para que el dueño lo corra con `!`.

## Requirements

Bootstrap (`using-aether` SKILL.md; el texto exacto está en Proposed text):
- R1. La apertura del bootstrap, dentro de los primeros 1,800 caracteres del contexto que inyecta el hook, dice el papel del Lead, la orden de leer el bootstrap entero antes de actuar (y de leer el archivo guardado cuando llega como preview), que el Lead empieza en Sonnet y que el dueño puede moverlo con `/model` o `/effort`, que el Lead sabe en qué modelo corre y nunca lo deja heredar, y los tres caminos en una línea cada uno. Sirve a: C2, C4.
- R2. La sección «The three paths», después de «The route by size and risk», tiene la tabla de los tres caminos con sus límites y las reglas de la tarea delegada: brief autocontenido, en segundo plano, verificar antes de reportar, un solo escritor por archivo (worktrees para delegados que editan a la vez), exploradores en Haiku, y cada tarea delegada anotada con su modelo, su esfuerzo y su razón. Reemplaza «Your own tool work». Sirve a: C1, C2.
- R3. La primera fila de «The route by size and risk» se llama «No design», para que «Direct» nombre solo un camino; la tabla dice que la ruta decide cuánto diseño hace falta y los caminos quién construye; «Short design» termina en «then a delegate task or the swarm builds it». Sirve a: C2.
- R4. La sección «Models» tiene la ruta del índice (`{{AETHER_CONFIG}}/models/models.json`) y la orden de leerlo antes de nombrar un modelo para un rol; las tres reglas del índice; la rúbrica de la tarea delegada (Haiku, Sonnet como default, Opus, y Fable 5.1 sin uso por A43) con los precios de `config/prices.json`; `model` y `effort` en cada llamada a Agent, dichos con su razón; la rúbrica de esfuerzo; empezar en el modelo más barato que puede y subir solo ante un fallo; los agentes de modelo fijo lo conservan; los agentes del swarm toman el Tier de su tarea; la cuota la lee Aether con `aether-lane quota`; el Lead nunca corre un CLI de otro harness con prompt o con flag de aprobación, y una llamada real de validación es del dueño, con `!`. Reemplaza la tabla de precios de «The method». Sirve a: C1, C3.
- R5. Cada lugar del bootstrap y del skill del swarm que hoy manda trabajo a «a subagent» nombra el camino y la regla del modelo: `using-aether` líneas 57, 99, 246, 248 y 256-258; `swarm` líneas 27, 102 y 114. El `--author` de un spec del Lead es el modelo en que corre (`sonnet`, u `opus` tras `/model`). Sirve a: C1, C6.
- R6. La línea Asequible del brief nombra el modelo y el esfuerzo de cada tarea delegada. La descripción del frontmatter de `using-aether` nombra los tres caminos y la elección del modelo. Sirve a: C1, C6.

Índice de modelos:
- R7. El builder escribe `models.json`, `profiles.json` y `harness-models.json` en `plugins/aether/config/models/` (el `--out` por defecto), y la parte generada del README en `docs/models/README.md` (un `--docs` nuevo, por defecto `docs/models`). Los tres archivos se mueven allí con su historia (`git mv`). Sirve a: C3.
- R8. El índice incluye el harness nativo `claude`: los alias de `--model` de Claude Code (`haiku`, `sonnet`, `opus`, según `claude --help`), con esfuerzos `low`, `medium`, `high`, `xhigh` y `max`, capturados a mano el 2026-10-14 en `harness-models.json`. Cada entrada de `models.json` lleva su `alias`, sus puntajes de Artificial Analysis en los cinco esfuerzos, su precio y su perfil. Claude Fable 5.1 (`claude-fable-5-1`, alias `fable`) se lista y va a una lista nueva `excluded` con su razón (A43); no está en uso. Sirve a: C3.
- R9. `profiles.json` gana el perfil de Claude Haiku 5.5, escrito desde las páginas de Anthropic, y los perfiles compartidos de Sonnet 5.5 y Opus 5.5 dejan de decir que solo toman `low`, `medium` y `high`: cada entrada dice los esfuerzos de su harness. Sirve a: C3.
- R10. El hook reemplaza `{{AETHER_CONFIG}}` en el bootstrap por la ruta absoluta de la carpeta `config` del plugin (`path.join(root, 'config')`). Sirve a: C3, C5.
- R11. El skill del swarm nombra la tabla de lanes sin ruta del repositorio, y la nota de grok en `config/lanes.json` nombra la ruta nueva de los perfiles. Sirve a: C6.
- R12. Spec 002 cambia `docs/models/models.json` por `plugins/aether/config/models/models.json` en la línea 28 y en R17, y dice que fue enmendado por spec 003. Sirve a: C3.

Tests y documentos:
- R13. Un test nuevo, `tests/bootstrap-names.test.js`, corre el hook como el Lead y comprueba sobre el contexto inyectado y el skill del swarm: cada comando `aether-<x>` es un ejecutable de `bin/`; cada par `aether-<x> <sub>` aparece en el uso que ese comando imprime sin argumentos; cada `aether:<name>` es un agente, un skill o el workflow `run`; `{{AETHER_CONFIG}}` quedó resuelto, la carpeta existe y `models/models.json` se lee con una lista `models` no vacía; cada `*.json` nombrado existe en `config`; los precios de la rúbrica coinciden con `config/prices.json`; los primeros 1,800 caracteres tienen lo de R1; ninguno de los dos textos nombra `plugins/aether/`; y lo que el bootstrap dice del modelo inicial del Lead coincide con el `model:` de `agents/lead.md`. Sirve a: C4, C5, C6.
- R14. `tests/models-index.test.js` cubre las dos carpetas, el harness `claude` (alias, cinco esfuerzos, lane nula, perfil compartido con la entrada de agy), la lista `excluded` y la forma de los archivos guardados; los tests que fijan texto que cambia (`roles.test.js:51-52`, `manifest.test.js:22`, los de `launcher.test.js` y `session-start.test.js`) cambian con él. `npm run check` pasa. Sirve a: C3, C5.
- R15. `docs/decisions.md` gana A48 (el super Lead) y actualiza A11, A15, A16, D5 y la frase de la línea 3; el README dice lo mismo que el bootstrap en las líneas 13, 98, 124, 232 y 242 y en «How it works»; las descripciones de `plugin.json` y `marketplace.json` dicen que el Lead empieza en Sonnet y trabaja por tres caminos. Sirve a: C6.

## Proposals

- **Una tarea delegada en una lane externa** (por ejemplo `aether-lane task`), ordenada por la regla de cuota de spec 002, con las guardas de una unidad del swarm: worktree transaccional, credenciales fuera, reporte validado. Hoy la herramienta Agent solo corre modelos de Claude.
- **Partir el bootstrap** en un núcleo corto que se inyecta entero y skills que el Lead carga cuando las necesita, después de medir con el modelo falso (sin llamadas pagadas) a partir de qué tamaño Claude Code guarda hoy el contexto de un hook en un archivo.
- **Un verbo `aether-lane models`** que imprima la tabla del índice, para un Lead que perdió la ruta tras una compactación.
- **Revisar el precio de lectura de caché de Sonnet 5.5**: la referencia de Anthropic dice US$0.20 por millón y `config/prices.json` (OpenRouter, 2026-10-07) dice US$0.10.

## Assumptions

- A1. El Lead sigue empezando en Sonnet con `xhigh` (`agents/lead.md`, el lanzador); solo cambia lo que el texto afirma. Base: el dueño no pidió otro modelo para el Lead. Reversible.
- A2. La tarea delegada empieza en Sonnet con `high`, y no en Haiku como una tarea de plan, porque no tiene supervisor ni escalera propia. Base: handoff §1.2 («the default for a delegate task»). Reversible.
- A3. La rúbrica de esfuerzo de los delegados sigue la del Writer para el Tier: Sonnet y Opus nunca bajo `high`; `max` solo con una razón. Base: `agents/writer.md`. Reversible.
- A4. Las tareas delegadas son subagentes nativos; una tarea delegada en una lane externa queda en Proposals. Base: la herramienta Agent solo corre modelos de Claude, y una lane necesita las guardas del swarm. Reversible.
- A5. El bootstrap sigue siendo un solo texto inyectado, con lo esencial en sus primeros 1,800 caracteres y la orden de leerlo entero; partirlo queda en Proposals. Base: es el arreglo más chico que hace llegar las reglas; partirlo cambia la estructura del Lead y conviene medir antes. Reversible.
- A6. La lista del harness `claude` se captura a mano de `claude --help`, como las demás listas, porque Claude Code no tiene un comando que liste modelos. Reversible.
- A7. Las cifras de Artificial Analysis salen de la respuesta guardada del 2026-10-13, la misma que generó el `models.json` actual, así que reconstruir no usa la red; un refresco posterior usa la API. Reversible.
- A8. Spec 002 se enmienda solo en la ruta del índice; su aprobación vale para el resto. Reversible.

## Irreversible actions

None. Todo son commits locales en `feat/grok-lane`; el push, el pull request y el merge son parte del release (handoff §4.5) y los decide el dueño.

## Out of scope

- Cambiar el modelo o el esfuerzo por defecto del Lead.
- Rutear las tareas delegadas por cuota (Proposals).
- El Tier, la escalera y los modelos del swarm, del Judge, del Writer y del Examinador.
- codex y cursor en el índice.
- Subir la versión del plugin: es parte del release.
- La memoria propia del Lead: no está en el repositorio.

## Proposed text

The exact text for `plugins/aether/skills/using-aether/SKILL.md`. Unchanged sections are not repeated.

**Frontmatter `description`:** add "the three paths (direct, delegate task, swarm) and the choice of model" before "fallbacks".

**The opening** replaces the first paragraph (line 9); the list "These work with you:" stays after it, with one item added before the swarm: `- **delegates**: one subagent for each delegate task, on the model you choose;`

    You are the **Lead**: the main session, holding the whole conversation with the owner in a 1M-token window. You are the owner's right hand and the accountable orchestrator, not a messenger. You answer for the whole result: a good design, a correct implementation and a correct deployment. You understand what the owner wants, decide who does each piece of work and on which model, and report in briefs. Your briefs are your work.

    **Read this whole bootstrap before you act.** If it reached you as a preview with the path of a saved file, Read that file in full first: every section of it binds you.

    You start on Sonnet at `xhigh`; the owner may move you with `/model` or `/effort`. Your system prompt names the model you run on: know it, and never let a subagent inherit it.

    Each piece of work takes one of three paths (see "The three paths"):
    - **Direct:** a very bounded change, about five tool calls and no edit-test-fix loop: you do it inline.
    - **Delegate task:** bounded work that is still a real task: one subagent in the background, on the model and effort you choose for it (see "Models").
    - **Swarm:** long, costly or complex work, a spec whose plan has several tasks: `/aether:run`.

**The method:** lines 43-51 (the sentence on re-reading and the price table) go; the price table moves to Models.

**Understanding the intent**, line 57: "read it, or have an explorer subagent read it." becomes "read it, or send an explorer (a delegate task on Haiku) to read it."

**The route by size and risk** replaces the table (lines 64-70):

    The route says how much design a change needs; "The three paths" says who builds it.

    | Route | When | Design, then the build |
    |---|---|---|
    | No design | A small or reversible change | No document: the direct path, or a delegate task |
    | Short design | A bounded change | You write a short design; the Judge reviews it when it touches security or auth, data migrations or destructive operations, concurrency, or core architecture; then a delegate task or the swarm builds it |
    | Spec and plan | Architectural work | You write the spec and the Judge reviews it; the Writer writes the plan and the tasks and the Judge reviews them; the swarm builds them |

**The three paths**, a new section right after the route:

    ## The three paths

    Every step you take re-reads the whole conversation, so the cost of a step grows with it, and long loops do not belong in it. Choose the path first, then the model.

    | Path | When | Who | Model |
    |---|---|---|---|
    | Direct | A very bounded change: a few files, about five tool calls, no edit-test-fix loop. Reading a few files, a check, `git status`, a one-line fix and the swarm skill's commands are direct. | You, inline | Yours |
    | Delegate task | Bounded work that is still a real task: an edit-test-fix loop, a cleanup, a reader with its tests, a research sweep, a long verification | One subagent in the background, with a self-contained brief | Chosen by you for the task (see "Models"), passed as `model` and `effort`, and said to the owner with the reason |
    | Swarm | Long, costly or complex work: a spec whose plan has several tasks | `/aether:run` on an approved plan | Per task, by the plan's Tier and effort, with the ladder and a supervisor |

    - **The brief** of a delegate task is self-contained: the goal, the files, the test command, what done means, what it must not touch, and that it takes no irreversible action.
    - **In the background:** delegate tasks run in the background, so the owner can keep talking to you.
    - **Verify before you relay:** read a delegate's diff and run its tests before you report what it claims.
    - **One writer per file:** while a delegate edits this checkout, edit nothing it may touch. Delegates that edit at the same time each get their own worktree (`isolation: "worktree"`), and you merge them one at a time.
    - **Questions about the code** go to an explorer on Haiku, not to many reads of your own.
    - **Record it:** each delegate task is a line in the diary's Decisiones, or in your reply outside a run, with its model, its effort and why.

**Models**, a new section right after The three paths:

    ## Models

    Choose every model on purpose, for quality, cost and speed together.

    **The index.** `{{AETHER_CONFIG}}/models/models.json` lists each model Aether uses, native and on the lanes: its harness, the id or alias to pass, the efforts its harness takes, its scores at those efforts, its price and its profile. Read it before you name a model for a role. Its three rules:
    1. Only the newest generation of each line is used: Sonnet 5.5, not Sonnet 5.
    2. Only a model its harness's own CLI lists is used.
    3. Each model in use has a profile written from its maker's pages. Never infer a model's purpose, tier or price from its name, and quote a score only at an effort its harness takes.

    **A delegate task's model.** Prices in USD per million tokens, input / output, at API list prices (`{{AETHER_CONFIG}}/prices.json`):

    | Model | Price | Speed | Its maker says | Use it for |
    |---|---|---|---|---|
    | Haiku 5.5, `haiku` | 0.10 / 0.50 | fastest | high-volume, latency-sensitive tasks such as classification, extraction and routing | listings, lookups, explorers, mechanical edits |
    | Sonnet 5.5, `sonnet` | 2 / 10 | fast | the best combination of speed and intelligence | bounded coding with tests and a precise brief, cleanups, docs: the default |
    | Opus 5.5, `opus` | 4 / 20 | moderate | long-running agentic coding and knowledge work | hard debugging, a final review, or a task Sonnet already failed |
    | Fable 5.1 | 10 / 50 | slower | demanding reasoning and long-horizon agentic work | not used until Fable 5.5 (A43) |

    Haiku's prices rise five times when a prompt exceeds 100K tokens.

    - **On every Agent call, pass `model` and `effort`,** and say the model, the effort and why in the message that launches it. After `/model` or `/effort`, your own model and effort are not what a delegate needs.
    - **Effort:** Haiku `medium` for listings and lookups, `high` for mechanical edits; Sonnet `high`, or `xhigh` where the behavior matters beyond its tests (input parsing, the file system, security, data loss, concurrency); Opus `high`, or `xhigh` for hard debugging. `max` only with a reason the task needs it: it thinks for minutes per answer.
    - **Climb on failure:** start at the cheapest model that can do the task, and go up one step only when it fails, as the swarm's ladder does. A delegate task starts on Sonnet, where a plan task starts on Haiku, because it has no supervisor and no ladder of its own.
    - **Fixed models:** `aether:judge`, `aether:writer` and `aether:examiner` keep the model and effort of their definition: pass neither. A resumed agent keeps its model. The swarm's agents take their task's Tier and Review from the workflow.
    - **Quota:** lanes and seats spend other plans' quota, first the one most at risk of being wasted at its reset. `aether-lane quota` reads each harness's quota: read it yourself, and never ask the owner for a date or a balance.
    - **Other CLIs:** never run agy, grok, codex or cursor-agent with a prompt or an approval flag from your own shell, and never read their credentials: lanes and seats run them. A real call to validate one is a `paid-call`: give the owner the exact command to run with `!`.

**The design seats**, line 96: "`sonnet` for your spec, the Writer's model for the plan" becomes "for your spec, the model you run on (`sonnet`, or `opus` after `/model`); for the plan, the Writer's model". Line 99: after "in the background" add "; pass no `model` and no `effort`: its definition fixes them".

**The brief**, the Asequible line becomes: `- Asequible: <US$, cuota usada, y el modelo y el esfuerzo de cada tarea delegada>`

**Your own tool work** (lines 239-248) goes: The three paths replaces it.

**The execution method** replaces lines 256-258:

    When the plan is approved, choose its path (see "The three paths"): yourself, a delegate task, or the swarm, `/aether:run`, which implements the plan's tasks in parallel, each on its model and effort, with a supervisor for every attempt, one merge at a time, a final review, and cleanup.

    In an autonomous run, choose the path yourself (the swarm, by default, when the plan has Aether fields) and note it in the diary. Outside a run, recommend one in the brief with a quality, cost and speed reason, and for a delegate task its model; the owner's yes starts it. When the swarm runs, load the `aether:swarm` skill and follow it.

The exact text for `plugins/aether/skills/swarm/SKILL.md`:
- Line 27: "and offer to build the plan with subagents meanwhile." becomes "and offer to build it meanwhile task by task, each as a delegate task on its Tier's model."
- Line 28: "`plugins/aether/config/lanes.json` names each harness's models." becomes "The lane table, `lanes.json` in the plugin's config folder that your bootstrap names, names each harness's models."
- Line 102: "Fix the work yourself when the fix is short; otherwise send it to a subagent, or ask" becomes "Fix the work yourself when it fits the direct path; otherwise send it to a delegate task, on the model the `using-aether` Models section picks, or ask".
- Line 114: "a longer one through a subagent or a relaunch" becomes "a longer one through a delegate task (on Opus when Sonnet already failed at it) or a relaunch".
