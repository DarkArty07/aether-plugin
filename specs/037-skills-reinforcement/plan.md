# Plan: reforzar el comportamiento de skills (Spec 037)

**Spec:** [spec.md](spec.md)
**Intent:** [intent.md](intent.md)

## Technical context

- **Runtime y lenguaje:** Node.js 22, CommonJS (`'use strict'`), sin dependencias externas (`node:fs`, `node:path`, `node:os`, `node:child_process`, `node:crypto`, `node:test`, `node:assert/strict`).
- **Estructura existente de skills y continuidad:**
  - `plugins/aether/lib/skill-registry.js`: gestiona los registros append-only JSONL en `<dataDir>/skills/` (`created.jsonl`, `installs.jsonl`, `uses.jsonl`).
  - `plugins/aether/lib/skill-rules.js`: clasifica rutas de skills (`aether`, `downloaded`, `project`, `owner`), valida `npx skills add` y autores de confianza (`trusted.json`).
  - `plugins/aether/lib/skill-brief.js`: carga y formatea hasta 3 skills (`MAX_SKILLS = 3`) para inyectarlas en encargos de delegados y del enjambre.
  - `plugins/aether/lib/skill-review.js`: handler `PostToolUse` sobre `Write`, `Edit` y `MultiEdit` que revisa `SKILL.md` (longitud, frontmatter, colisiones) y registra creaciones en `created.jsonl`.
  - `plugins/aether/lib/skill-repeat.js`: handler `PostToolUse` sobre `Bash` tras `aether-delegate verdict` que busca hallazgos repetidos en `delegates/log.jsonl`.
  - `plugins/aether/lib/skill-idle.js` y `plugins/aether/lib/session-start.js`: calculan y emiten en el arranque el aviso de skills de proyecto creadas hace más de 30 días sin uso en `uses.jsonl`.
  - `plugins/aether/lib/continuity-posttool.js` y `plugins/aether/hooks/hooks.json`: despachan los handlers `PostToolUse` de una sesión del Lead (`memoryReminder`, `treeCheck`, `skillRegistry`, `skillReview`, `skillRepeat` y los contadores de edición/lectura directa).
  - `plugins/aether/lib/delegate-task.js`: ejecuta `aether-delegate begin` y `aether-delegate verdict`, anotando lanzamientos y veredictos en `<dataDir>/delegates/log.jsonl` y devolviendo avisos al Lead en `plan.notes`.
  - `plugins/aether/workflows/design.workflow.js`, `plugins/aether/lib/seats.js` y `plugins/aether/lib/seat-calls.js`: orquestan las rondas del Writer y del Judge para `spec` y `plan` (en seats externos y en el agente nativo de respaldo).
  - `plugins/aether/bin/aether-report` y `plugins/aether/lib/report.js`: exponen los modos de reporte (`--run`, `--seats`, `--delegates`, `--spend`, `finalize`, `price`).

## Gate

- **Constitución (`.specify/memory/constitution.md`):** pass — el repositorio no define `.specify/memory/constitution.md`; rigen las reglas de `AGENTS.md` (Node 22 CommonJS sin dependencias, bins delgados y lógica en `lib/`, huella dormida cero fuera de una sesión del Lead, las 3 partes del arranque dentro de 9.800 caracteres y pruebas de hechos en `tests/docs-facts.test.js`).
- **Nothing speculative, and nothing for a hypothetical need:** pass — cada cambio responde directamente a C1–C9 y R1–R22 (#269 y sus hijos #270–#277).
- **No abstraction, option, file or dependency that no requirement asks for:** pass — no se añade ninguna opción de usuario ni ningún módulo nuevo en `plugins/aether/lib/`; toda la lógica nueva se incorpora en los módulos existentes de la familia `skill` (`skill-registry.js`, `skill-brief.js`, `skill-repeat.js`, `skill-idle.js`, `skill-review.js`) y el único archivo nuevo de producto es `plugins/aether/config/skills.json`, exigido explícitamente por R2 y R12 para almacenar como dato editable sin tocar código el umbral de similitud de hallazgos y la tabla de temas prácticos con señales visibles.

## Design

### 1. Datos de configuración (`plugins/aether/config/skills.json`) — R2, R12, A4, A5

Se crea `plugins/aether/config/skills.json` con dos secciones leídas por `loadSkillsConfig(customPath)` en `lib/skill-registry.js` (con soporte de sobreescritura por ruta o variable de entorno `AETHER_SKILLS_CONFIG` en pruebas):

1. `repeat`:
   - `minWordLength`: `3` (longitud mínima de palabra significativa tras normalizar).
   - `similarityThreshold`: `0.35` (proporción mínima de palabras significativas compartidas, sobre la unión de palabras significativas de ambos hallazgos, para considerar repetidos dos hallazgos sobre el mismo archivo).
   - `stopwords`: lista de palabras vacías en español e inglés (`falta`, `cuando`, `donde`, `para`, `como`, `este`, `esta`, `with`, `from`, `that`, `this`, `when`, etc.) que se descartan al tokenizar.
2. `topics`: lista de temas prácticos iniciales (los dos ejemplos del dueño en `intent.md`, `machine-learning` y `google-colab`, más `godot`, `containers`, `browser-automation` y `shaders`). Cada entrada tiene:
   - `id`: identificador en kebab-case (p. ej. `machine-learning`, `google-colab`).
   - `label`: nombre legible del tema (`Machine Learning`, `Google Colab`, `Godot Engine`, `Containers and Docker`, `Browser Automation`, `Shaders and GPU Graphics`).
   - `files`: extensiones o nombres de archivos visibles en el repositorio (p. ej. `[".ipynb"]`, `["project.godot", ".gd"]`, `["Dockerfile", "docker-compose.yml", "compose.yaml"]`, `["playwright.config.ts", "playwright.config.js"]`, `[".wgsl", ".glsl", ".frag", ".vert"]`).
   - `dependencies`: paquetes buscados en `package.json`, `requirements.txt` o `pyproject.toml` (p. ej. `["torch", "pytorch", "tensorflow", "scikit-learn", "sklearn", "keras", "xgboost", "transformers", "lightgbm"]`, `["google-colab", "colab"]`, `["@playwright/test", "playwright", "puppeteer"]`, `["three", "regl", "twgl.js"]`).
   - `words`: palabras o frases buscadas sin distinción de mayúsculas/acentos en `specs/NNN-<tema>/intent.md` (p. ej. `["machine learning", "entrenar modelo", "red neuronal", "fine-tuning", "dataset", "pytorch", "scikit-learn"]`, `["google colab", "colab", "cuaderno colab", "tpu colab"]`, etc.).
   - `skillKeywords`: palabras clave que identifican si una skill instalada en `.agents/skills/`, `.claude/skills/`, `~/.agents/skills/`, `~/.claude/skills/` o `skills/installs.jsonl` cubre el tema en su `name` o `description` de `SKILL.md`.

### 2. Registro de avisos, deduplicación de `created.jsonl` y `aether-report --skills` (`lib/skill-registry.js`, `lib/report.js`, `bin/aether-report`) — R5, R6, R7, R16, R17, R18, A7

En `plugins/aether/lib/skill-registry.js`:
- **Registro de avisos (`notices.jsonl`, R16):**
  - `noticesFile(dataDir)` apunta a `<dataDir>/skills/notices.jsonl`.
  - `recordNotice(dataDir, { time, session, repo, kind, name })` y `readNotices(dataDir)` guardan y leen únicamente `{ time, session, repo, kind, name }` (nunca texto de la conversación, spec 014 R10). Las clases de aviso (`kind`) son: `topic-search`, `skill-location`, `skill-unloaded`, `repeated-finding`, `idle-skills` y `delegate-skill`.
- **Resolución de repositorio principal y ruta relativa (`canonicalRepo`, `skillRelPath`, R5, R7):**
  - `canonicalRepo(entry)` obtiene la raíz del repositorio principal a partir de `entry.repo` o `entry.path`: primero recorta cualquier sufijo de worktree de Aether o Claude (`/.aether/(?:work|worktrees|lanes|exams|seats|delegates)(?:/.*)?$` o `/.(?:worktrees|claude/worktrees)(?:/.*)?$`) y el sufijo `/.(?:agents|claude)/skills/.*$`, y si el directorio resultante existe en disco intenta `repoPaths(dir).mainRoot` (conservando el directorio recortado cuando `git` ya no está o el directorio fue borrado).
  - `skillRelPath(entry)` extrae de `entry.path` la ruta relativa de la skill en el repositorio (`.agents/skills/<name>` o `.claude/skills/<name>`).
- **Consulta `git` de solo lectura y deduplicación (`alreadyInGitBefore`, `shouldRecordCreated`, `readCreatedDeduplicated`, R5, R6, R7, A7):**
  - `alreadyInGitBefore(repo, relPath, beforeMs)`: cuando `repo` existe en disco y `relPath` es una ruta relativa de skill, ejecuta en solo lectura `git log --reverse --format=%ct -- <relPath>` (o sobre `.agents/skills/<name>` y `.claude/skills/<name>` cuando se comprueba antes de crear). Si `beforeMs === null` (comprobación en escritura, R6), devuelve `true` cuando existe al menos un commit previo en `repo` para esa skill. Si `typeof beforeMs === 'number'` (comprobación en lectura, R7), devuelve `true` cuando el archivo de la skill existe en `repo` y el primer commit en `git` tiene `firstCommitSec * 1000 < beforeMs`. Si `repo` o la ruta en `repo` no existen en disco o `git` falla, devuelve `false`.
  - `shouldRecordCreated(dataDir, { repo, name, dir, type })` (R5, R6): devuelve `false` si en `readCreated(dataDir)` ya existe una entrada con el mismo `(canonicalRepo(e), e.name)` (o `type === 'owner'` y el mismo `name`), o si para `type === 'project'` `alreadyInGitBefore(repo, relPath, null)` es `true`.
  - `readCreatedDeduplicated(dataDir)` (R7): recorre `readCreated(dataDir)` en orden, agrupa por `(canonicalRepo(entry), entry.name)` conservando la primera entrada de cada par (con `repo: canonicalRepo(entry)`), y descarta toda entrada de proyecto donde `alreadyInGitBefore(repo, skillRelPath(entry), entry.time)` sea `true`. Sobre las 8 líneas reales de #269 en `~/.claude/plugins/data/aether-aether-plugin/skills/created.jsonl`, agrupa las 2 de `diseno-de-juego` en 1, agrupa las 4 de `artificial-analysis` en 1 y la descarta porque `artificial-analysis` ya tenía commit en `aether-plugin` desde 0.28.0 antes de `entry.time`, dejando exactamente las 3 skills reales (`diseno-de-juego`, `criterio-del-dueno` y `direccion-de-arte`).
- **Reporte de desempeño (`skillsReport`, `aether-report --skills`, R17, R18):**
  - `skillsReport(dataDir, { repo, since, until, session } = {})` lee únicamente los archivos JSONL de `skills/` (`created.jsonl`, `installs.jsonl`, `uses.jsonl`, `notices.jsonl`), nunca conversaciones, filtrando opcionalmente por `repo` (comparado contra `canonicalRepo`), `since` (`time >= since`), `until` (`time <= until`) y `session`.
  - Devuelve `{ mode: 'skills', period: { since, until }, totals: { created, createdRaw, downloaded, leadLoads, agentUses, delegateUses, swarmUses, notices, noticesByKind }, created, downloaded, leadLoadsBySkill, agentUsesBySkill, projects }`, donde `projects[repoKey]` desglosa por proyecto las skills creadas (sin duplicados de worktrees ni preexistentes en git), bajadas (deduplicadas por `(repo, name)`), cargas del Lead (`kind === 'lead'`), usos en agentes (`delegate` y `run`) y avisos emitidos por clase.
  - `plugins/aether/bin/aether-report` acepta `--skills` (con `--repo`, `--since`, `--until`, `--session`) desde cualquier shell sin requerir una sesión activa del Lead.

### 3. Similitud de hallazgos entre tareas y sesiones y sugerencia de skill para delegados (`lib/delegate-task.js`, `lib/skill-repeat.js`, `lib/skill-brief.js`) — R1, R2, R15, R16, R22, A4, A6

- **Proyecto en cada veredicto (`lib/delegate-task.js`, R22):**
  - En `verdict`, se resuelve `repo = repoPaths(r.cwd).mainRoot` (o `null` si `r.cwd` no es un repositorio git) y se incluye `repo` en la entrada `kind: 'verdict'` escrita en `delegates/log.jsonl`.
- **Comparación de hallazgos por similitud de palabras y entre sesiones (`lib/skill-repeat.js`, R1, R2, R16, R22, A4):**
  - `wordsOf(text, config)` normaliza el texto (`NFD`, sin diacríticos, minúsculas), extrae tokens alfanuméricos de longitud `>= config.minWordLength` que no estén en `config.stopwords`.
  - `wordsEqual(a, b)` considera iguales dos palabras cuando `a === b` o cuando ambas tienen al menos 5 caracteres y comparten un prefijo común de al menos 5 caracteres (captando inflexiones como `validar`/`valida`).
  - `wordSimilarity(detailA, detailB, config)` calcula la proporción de palabras significativas compartidas sobre la unión (`shared / (wordsA.length + wordsB.length - shared)`), con respaldo a igualdad exacta normalizada si ningún texto tiene palabras largas; `findingsMatch(detailA, detailB, config)` devuelve `true` cuando `wordSimilarity >= config.similarityThreshold`.
  - `repeatedFindings(dataDir, { session, task, repo, config })` lee todas las entradas de `delegates/log.jsonl` (`readEntries(dataDir)`). Identifica la tarea objetivo por `(targetSession, targetTask)` y su `targetRepo = repo || targetEntry.repo || null`. Compara los hallazgos del último veredicto de corrección de la tarea objetivo contra los veredictos de corrección de cualquier otra tarea `(entry.session, entry.task) !== (targetSession, targetTask)` que pertenezca al mismo proyecto:
    - si `targetRepo` y `entry.repo` existen, exige `entry.repo === targetRepo` (permitiendo que coincidan tareas de sesiones distintas aunque reutilicen el id `t1`);
    - si `entry.repo` o `targetRepo` falta (entradas antiguas anteriores a R22), solo compara dentro de la misma sesión (`entry.session === targetSession && entry.task !== targetTask`).
  - En `posttool(input, ctx)`, cuando hay hallazgos repetidos, emite el aviso al Lead y registra cada archivo repetido con `recordNotice(dataDir, { session: input.session_id, repo, kind: 'repeated-finding', name: item.file })`.
- **Sugerencia de skill al lanzar un delegado sin `AETHER-SKILLS:` (`lib/skill-brief.js`, `lib/delegate-task.js`, R15, R16, A6):**
  - En `lib/skill-brief.js`, `listProjectSkills(cwd)` lee `.agents/skills/*/SKILL.md` y `.claude/skills/*/SKILL.md` del proyecto (deduplicadas por `name`, tomando `name` y `description` del frontmatter).
  - `matchDelegateSkills(cwd, { prompt, description, owns })` compara sin modelo cada skill del proyecto contra el texto del encargo (`prompt` y `description`) y las rutas de `owns`: una skill coincide cuando su `name` (o todas las partes de su nombre en kebab-case de longitud `>= 4`, o al menos 2 palabras significativas de longitud `>= 4` de su `name` y `description`) aparecen en las palabras normalizadas del encargo o de las rutas de `owns`.
  - En `lib/delegate-task.js` `begin`, cuando `brief.skills.length === 0`, llama a `matchDelegateSkills(r.cwd, { prompt, description, owns: brief.owns })`. Si hay coincidencias, agrega en `notes` (`plan.notes`) el aviso `Aether delegate task <id>: project skill(s) <names> match this brief; add AETHER-SKILLS: <names> if it helps.` sin modificar `args.prompt` ni `externalPrompt`, y registra cada skill sugerida en `notices.jsonl` (`kind: 'delegate-skill'`, R16). Además, cuando el encargo sí trae `AETHER-SKILLS:`, `recordUse` guarda `repo: mainRoot`.

### 4. Skills del proyecto en `/aether:design` y reglas del Writer, Judge y `aether:tasks` (`lib/skill-brief.js`, `lib/seats.js`, `lib/seat-calls.js`, `workflows/design.workflow.js`, `agents/writer.md`, `agents/judge.md`, `skills/tasks/SKILL.md`, `speckit/commands/speckit.tasks.md`) — R8, R9

- En `lib/skill-brief.js`, `formatProjectSkills(skills)` construye el bloque:
  ```markdown
  ## Project skills

  Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):
  - `<name>`: <description>
  ```
  (o cadena vacía `''` cuando el proyecto no tiene skills en `.agents/skills/` ni en `.claude/skills/`).
- En `lib/seats.js`:
  - `seatPrompt({ seat, harness, adapter, message, workdir, feature, doc = 'plan' })`: cuando `(seat === 'writer' && doc !== 'spec')` o `(seat === 'judge' && doc !== 'spec' && !(typeof message === 'string' && /^Review the spec\b/.test(message)))`, obtiene `listProjectSkills(workdir)` y, si hay skills y `message` aún no incluye `## Project skills`, añade `formatProjectSkills(skills)` al prompt del seat externo.
  - `seatCommand` incluye `projectSkills: listProjectSkills(top)` en `value` cuando devuelve `unavailable` (exit 3) o `failed` (exit 4).
- En `lib/seat-calls.js`:
  - `start(cwd, flags)` incluye `projectSkills: listProjectSkills(top)` en su respuesta `{ started: true, id, at, projectSkills }`.
- En `workflows/design.workflow.js`:
  - `awaitSeat` conserva `projectSkills` de `started.projectSkills` o `waited.reply.value.projectSkills`.
  - En `seatRound`, cuando la ronda es de `doc === 'plan'` para `writer` o `judge` y pasa al agente nativo (`nativeAnswer`), si `projectSkills` tiene elementos, añade el bloque `## Project skills` a `nativeText`.
- En `plugins/aether/agents/writer.md`, `plugins/aether/skills/tasks/SKILL.md` y `plugins/aether/speckit/commands/speckit.tasks.md`:
  - El bloque `**Aether:**` y la lista de campos documentan `- **Skills** is optional: up to 3 project or installed skills that help the task, separated by commas, such as \`- Skills: direccion-de-arte, patron-api\`.`
- En `plugins/aether/agents/judge.md`:
  - Bajo `**On a plan and its tasks:**`, añade la comprobación de que, cuando el proyecto tiene skills disponibles, las tareas donde sirve una skill del proyecto la incluyan en `- Skills:` (máximo 3 por tarea) y ninguna tarea liste una skill ajena a su trabajo.

### 5. Registro de cargas de `Skill` del Lead, avisos de ubicación y falta de `aether:skills`, detector de temas prácticos y aviso de 30 días (`hooks/hooks.json`, `lib/skill-idle.js`, `lib/skill-review.js`, `lib/continuity-posttool.js`, `lib/session-start.js`) — R3, R4, R10, R11, R12, R13, R16, R18, R19, A1, A2, A3, A5

- **Cargas de `Skill` por el Lead (`hooks/hooks.json`, `lib/skill-review.js`, `lib/continuity-posttool.js`, R3, A3):**
  - En `plugins/aether/hooks/hooks.json`, el matcher `PostToolUse` de `aether-continuity posttool` pasa de `"Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash"` a `"Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash|Skill"`.
  - En `lib/skill-review.js` (invocado desde `lib/continuity-posttool.js`), cuando `input.tool_name === 'Skill'` y la llamada es de la sesión principal del Lead (`!input.agent_id`), se extrae únicamente el identificador de la skill (`input.tool_input?.skill || input.tool_input?.name || input.tool_input?.skill_name`, recortado al primer token sin espacios ni saltos de línea, descartando `args` y cualquier texto de la conversación) y se registra con `recordUse(dataDir, { time: now, session: input.session_id, repo: mainRoot, kind: 'lead', run: null, task: null, skills: [skillName] })`.
- **Aviso de skills sin uso en 30 días (`lib/skill-idle.js`, `lib/session-start.js`, R4, R7, R16):**
  - `idleSkills(dataDir, { repo, days = 30, now })` usa `readCreatedDeduplicated(dataDir)` (R7) y marca como usada toda skill presente en `readUses(dataDir)` dentro de la ventana de 30 días (tanto `kind: 'lead'` como `kind: 'delegate'` y `kind: 'run'`, normalizando el prefijo opcional `aether:` para que cargar `criterio-del-dueno` o `aether:criterio-del-dueno` cuente igual).
  - En `session-start.js`, cuando `idleLine` produce aviso en el arranque, se registra cada skill nombrada con `recordNotice(data, { time: now, session, repo: mainRoot, kind: 'idle-skills', name })`.
- **Avisos al crear o cambiar una skill de proyecto (`lib/skill-review.js`, R10, R11, R16):**
  - En `skill-review.js` `posttool`, cuando `info.type === 'project'`:
    1. **Ubicación (R10):** comprueba si el archivo editado se accedió bajo `.claude/skills/<name>/` (o fuera de `.agents/skills/<name>/`) y la carpeta `.claude/skills/<name>` es un directorio real en lugar de un enlace simbólico a `.agents/skills/<name>`. Si quedó como carpeta real fuera de `.agents/skills/`, añade un aviso inmediato (sin bloquear) indicando que la copia real de una skill de proyecto debe vivir en `.agents/skills/<name>/` con un enlace simbólico en `.claude/skills/<name>`, y anota `recordNotice(dataDir, { session: input.session_id, repo, kind: 'skill-location', name: info.name })`.
    2. **Falta de `aether:skills` en la sesión (R11):** comprueba en `readUses(dataDir)` si en `session === input.session_id` existe una carga (`kind === 'lead'`) de `aether:skills` o `skills`. Si no la cargó en esa sesión, añade un aviso (sin bloquear) indicando cargar `aether:skills` para revisar las reglas de estructura, ubicación en `.agents/skills/` y enlace en `.claude/skills/`, y anota `recordNotice(dataDir, { session: input.session_id, repo, kind: 'skill-unloaded', name: info.name })`.
- **Detector de temas prácticos por señales visibles (`lib/skill-review.js`, `lib/session-start.js`, R12, R13, R16, A1, A2, A5):**
  - `detectUncoveredTopics({ cwd, home, dataDir, intentPath, config })`:
    1. Lee la tabla `topics` de `config/skills.json` via `loadSkillsConfig`.
    2. Inspecciona señales visibles sin modelo en `cwd` (`files` en la raíz y primer nivel del proyecto, `dependencies` en `package.json`, `requirements.txt` y `pyproject.toml`, y `words` en `intentPath` cuando se escribe o edita `specs/NNN-<tema>/intent.md` o cuando existe la tarjeta activa).
    3. Para cada tema cuyas señales aparecen, comprueba si alguna skill instalada en `.agents/skills/`, `.claude/skills/`, `~/.agents/skills/`, `~/.claude/skills/` o `skills/installs.jsonl` contiene el `id` del tema o alguna de sus `skillKeywords` en `name` o `description` de su `SKILL.md`.
    4. Filtra los temas que ya recibieron un aviso `kind === 'topic-search'` en la misma `(session, repo, topic.id)` en `notices.jsonl` (A2).
  - Se dispara en dos momentos sin bloquear nunca:
    1. En `lib/session-start.js` durante el primer arranque de Aether en un proyecto nuevo (`firstSession === true` en `startup` y sin estado previo en `<mainRoot>/.aether/runs` ni `<mainRoot>/.aether/autonomy`, A1).
    2. En `lib/skill-review.js` (`PostToolUse` de `Write`, `Edit`, `MultiEdit`) cuando la ruta escrita es `specs/NNN-<tema>/intent.md`.
  - Para cada tema descubierto sin skill instalada, registra `recordNotice(dataDir, { session, repo, kind: 'topic-search', name: topic.id })` y devuelve el aviso indicando el tema detectado y la instrucción de cargar `aether:skills` y buscar una skill antes del plan.

### 6. Texto de `aether:skills` y documentación (`skills/skills/SKILL.md`, `docs/`) — R14, R18, R19, R20

- `plugins/aether/skills/skills/SKILL.md`: se actualiza la sección de búsqueda y creación para explicar cuándo buscar una skill (ante el aviso por señales visibles o al entrar a un tema práctico nuevo), aclarar que las skills son para procesos prácticos paso a paso mientras que la documentación de la API de una librería se consulta con Context7, e indicar que si no encuentra una buena skill escribe la skill del proyecto en `.agents/skills/<name>/SKILL.md` con lo que aprendió (R14). `skills/using-aether/SKILL.md` no se modifica, manteniendo intacto el presupuesto de caracteres de las 3 partes del arranque (R19).
- `docs/guide/project-files-and-skills.md`, `docs/es/guias/archivos-skills-y-continuidad.md` y `docs/reference/components.md`: documentan los avisos reforzados de skills, el paso de las skills del proyecto al Writer y al Judge para el campo `Skills:` en los planes, `config/skills.json`, `aether-report --skills` y el alcance de `PostToolUse` incluyendo `Skill` con huella dormida cero fuera de una sesión del Lead (R18, R20).

## Files

- `plugins/aether/config/skills.json` (nuevo): parámetros de similitud de hallazgos (`repeat`) y tabla de temas prácticos con señales visibles (`topics`).
- `plugins/aether/lib/skill-registry.js`: `loadSkillsConfig`, `noticesFile`, `recordNotice`, `readNotices`, `canonicalRepo`, `skillRelPath`, `alreadyInGitBefore`, `shouldRecordCreated`, `readCreatedDeduplicated` y `skillsReport`.
- `plugins/aether/lib/report.js` y `plugins/aether/bin/aether-report`: modo `--skills` (`--repo`, `--since`, `--until`, `--session`).
- `plugins/aether/lib/skill-brief.js`: `listProjectSkills`, `formatProjectSkills` y `matchDelegateSkills`.
- `plugins/aether/lib/seats.js`, `plugins/aether/lib/seat-calls.js` y `plugins/aether/workflows/design.workflow.js`: entrega de las skills del proyecto (`name` y `description`) al Writer y al Judge en las rondas de `plan` (externas y nativas).
- `plugins/aether/agents/writer.md`, `plugins/aether/agents/judge.md`, `plugins/aether/skills/tasks/SKILL.md` y `plugins/aether/speckit/commands/speckit.tasks.md`: enseñanza y revisión del campo `Skills:` (hasta 3 por tarea).
- `plugins/aether/lib/delegate-task.js`: guardado de `repo` en cada `veredicto` (R22), `repo` en `recordUse` y aviso de skill sugerida en `plan.notes` cuando un delegado se lanza sin `AETHER-SKILLS:` (R15, R16).
- `plugins/aether/lib/skill-repeat.js`: similitud de palabras leída desde `config/skills.json`, comparación entre tareas del mismo proyecto en igual o distinta sesión (y solo misma sesión cuando falta `repo`), y registro de aviso `repeated-finding` (R1, R2, R16, R22).
- `plugins/aether/hooks/hooks.json`, `plugins/aether/lib/skill-idle.js`, `plugins/aether/lib/skill-review.js`, `plugins/aether/lib/continuity-posttool.js` y `plugins/aether/lib/session-start.js`: captura de `Skill` en `PostToolUse` (R3), filtro de 30 días con cargas del Lead y `readCreatedDeduplicated` (R4, R7), avisos de ubicación fuera de `.agents/skills/` (R10) y falta de `aether:skills` (R11), y detector de temas prácticos por señales visibles en el arranque de un proyecto nuevo y al escribir `intent.md` (R13, R16).
- `plugins/aether/skills/skills/SKILL.md`, `docs/guide/project-files-and-skills.md`, `docs/es/guias/archivos-skills-y-continuidad.md` y `docs/reference/components.md`: guía de procesos vs Context7 y documentación de lo nuevo (R14, R18, R20).
- Pruebas actualizadas: `tests/skill-registry.test.js`, `tests/aether-report.test.js`, `tests/skill-brief.test.js`, `tests/seats.test.js`, `tests/seat-calls.test.js`, `tests/workflow-design.test.js`, `tests/agents-design.test.js`, `tests/skill-repeat.test.js`, `tests/delegate-skills.test.js`, `tests/skill-idle.test.js`, `tests/skill-review.test.js`, `tests/continuity-posttool-skills.test.js`, `tests/continuity-hook.test.js`, `tests/session-start-tidy.test.js`, `tests/new-skills.test.js`, `tests/project-files-docs.test.js` y `tests/docs-030.test.js`.

## Verification

1. Pruebas unitarias y de integración por módulo:
   - `node --test tests/skill-registry.test.js tests/aether-report.test.js`
   - `node --test tests/skill-brief.test.js tests/seats.test.js tests/seat-calls.test.js tests/workflow-design.test.js tests/agents-design.test.js`
   - `node --test tests/skill-repeat.test.js tests/delegate-skills.test.js tests/delegate-task.test.js`
   - `node --test tests/skill-idle.test.js tests/skill-review.test.js tests/continuity-posttool-skills.test.js tests/continuity-hook.test.js tests/session-start-tidy.test.js tests/session-start-parts.test.js tests/dormant-030.test.js`
   - `node --test tests/new-skills.test.js tests/project-files-docs.test.js tests/docs-030.test.js tests/components-docs.test.js tests/docs-facts.test.js`
2. Comprobación de solo lectura de `aether-report --skills` sobre el directorio de datos real de la versión instalada del dueño (R17, R21):
   - `AETHER_DATA_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/data/aether-aether-plugin" node plugins/aether/bin/aether-report --skills`
3. Validación completa del repositorio (R21, C9):
   - `npm run check` (`npm test`, `npm run test:mod` y `npm run validate`).

## Assumptions

- **A1 (de `spec.md`):** Un «proyecto nuevo» para el disparador de búsqueda por señales visibles en el arranque es el primer arranque de Aether en ese repositorio principal (`firstSession === true` en `startup` y sin directorios previos en `<mainRoot>/.aether/runs` ni `<mainRoot>/.aether/autonomy`); además, el disparador corre siempre al escribir o editar `specs/NNN-<tema>/intent.md`.
- **A2 (de `spec.md`):** El aviso de búsqueda por señales visibles (`topic-search`) no se repite para el mismo `(session, repo, topic)` dentro de la misma sesión al editar varias veces `intent.md`.
- **A3 (de `spec.md`):** Las cargas de `Skill` del Lead se registran desde el hook `PostToolUse` de `aether-continuity posttool` añadiendo `Skill` a su matcher en `hooks/hooks.json`, guardando únicamente el nombre de la skill (`input.tool_input.skill`) y los metadatos del evento en `skills/uses.jsonl` (`kind: 'lead'`), nunca argumentos ni texto de la conversación.
- **A4 (de `spec.md`):** Cada veredicto guarda `repo` (raíz del repositorio principal), una tarea se identifica por `(session, task)`, las entradas antiguas sin `repo` solo se comparan dentro de su misma sesión, y el parecido entre hallazgos sobre el mismo archivo se mide por la proporción de palabras significativas compartidas según `repeat` en `config/skills.json`.
- **A5 (de `spec.md`):** La tabla `topics` de `config/skills.json` inicia con `machine-learning`, `google-colab`, `godot`, `containers`, `browser-automation` y `shaders`, y considera cubierto un tema cuando alguna skill instalada contiene el `id` o una de las `skillKeywords` del tema en su `name` o `description` de `SKILL.md`.
- **A6 (de `spec.md`):** En `aether-delegate begin`, cuando el encargo no lleva `AETHER-SKILLS:`, la coincidencia con una skill del proyecto se calcula sin modelo contra las palabras del encargo y las rutas de `AETHER-OWNS`, y el aviso se entrega en `plan.notes` sin modificar `args.prompt`.
- **A7 (de `spec.md`):** `readCreatedDeduplicated` agrupa `skills/created.jsonl` por `(repo, name)` conservando la primera entrada tras normalizar rutas de worktrees al repositorio principal, y descarta toda entrada cuya skill ya tenía un commit en `git` en `repo` anterior al `time` de la entrada (conservándola si `repo` o la ruta ya no existen).

## Risks

- **Resolución de segundos en timestamps de `git log --format=%ct` frente a milisegundos en `created.jsonl`:** `%ct` devuelve segundos enteros mientras `entry.time` está en milisegundos. Si en una prueba automatizada una skill nueva se crea y se confirma en `git` dentro del mismo segundo, comparar `firstCommitSec * 1000 <= entry.time` podría tomar el commit posterior como anterior. Mitigación: en escritura (R6) se consulta `git log -n 1` *antes* de que la skill nueva sea confirmada en `git`, y en lectura (R7) `alreadyInGitBefore(repo, relPath, entry.time)` exige estrictamente `(firstCommitSec + 1) * 1000 <= entry.time` (el commit existía al menos en un segundo anterior a `entry.time`), lo que separa con exactitud una skill preexistente en git de una recién creada.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| None | — | — |
