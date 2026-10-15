# Conciliación de la documentación: tareas

**Spec:** [spec.md](spec.md)

## Global Constraints

- **Base y fuente.** El árbol es `origin/main` en 122755a (Aether 0.10.0). Lo que una página dice es lo que `plugins/aether/` hace en este árbol (A2). Lo que se mueve sale del README de 122755a: `git show 122755a:README.md` (451 líneas; el `README.md` del árbol es el mismo hasta la Task 16). El plan, `specs/004-docs-reconciliation/plan.md`, tiene el mapa «sección del README → página» y la lista de lo que las pruebas fijan: léelo.
- **Idioma.** Las páginas, las pruebas y los comentarios van en inglés y sin emojis. Los términos de producto en español se conservan: RADAR (Rápido, Autónomo, Delegación, Asequible, Robusto), «Espera tu sí», «Supuestos». Este archivo y el plan, en español.
- **Los hechos se leen del código, no de la memoria.** Cada número, valor por defecto, nombre de comando, ruta y comportamiento que una página afirma se comprobó en `plugins/aether/` (`skills/`, `config/`, `bin/`, `agents/`, `hooks/`, `lib/`, `workflows/`, `.claude-plugin/plugin.json`) o en `scripts/`. Si el código no lo sostiene, la página no lo dice. Una frase del README que ya no es cierta se corrige (R12) y la corrección va nombrada en tu informe, con la fuente. Lo que solo un cambio del plugin arreglaría no se arregla: R13 prohíbe tocarlo; va al informe como hallazgo.
- **Qué se mueve y cómo.** Lo que una tarea mueve conserva su texto palabra por palabra y sin recortar. Solo cambian: (a) los enlaces, que pasan a ser relativos a la página nueva; (b) las referencias del tipo «(see Options)», que pasan a ser enlaces; (c) lo que dejó de ser cierto (R12); (d) una introducción corta si la página la necesita. Las cadenas que una prueba fija (la lista de cada tarea) se conservan exactas, con su puntuación.
- **Front matter.** Cada página nueva empieza con exactamente tres claves, `title`, `description` y `order` (entero), entre dos líneas `---`, y su primer encabezado es `# <title>`. El `description` es una línea sin `: ` ni comillas. Títulos y órdenes:

  | Página | `title` | `order` |
  |---|---|---|
  | `docs/index.md` | Aether documentation | 0 |
  | `docs/getting-started.md` | Getting started | 1 |
  | `docs/purpose.md` | Purpose | 2 |
  | `docs/methodology.md` | Methodology | 3 |
  | `docs/guide/options.md` | Options | 10 |
  | `docs/guide/lanes.md` | Lanes | 11 |
  | `docs/guide/design-seats.md` | Design seats | 12 |
  | `docs/guide/autonomy.md` | Autonomy | 13 |
  | `docs/guide/ops.md` | Ops without a model | 14 |
  | `docs/guide/maintenance.md` | Maintenance | 15 |
  | `docs/guide/troubleshooting.md` | Troubleshooting | 16 |
  | `docs/reference/components.md` | Components | 20 |
  | `docs/contributing.md` | Contributing | 30 |
  | `docs/changelog.md` | Changelog | 31 |
  | `docs/roadmap.md` | Roadmap | 32 |

- **Enlaces (R10).** Todos relativos y que resuelven. Desde `docs/guide/` o `docs/reference/`, la raíz del repositorio es `../../`; desde `docs/`, `../`. Las páginas se escriben a la vez: una página enlaza a otra con su ruta, y a una sección de otra solo con una de estas anclas (los encabezados fijados por las pruebas):

  | Ancla | Página |
  |---|---|
  | `#requirements`, `#install`, `#start` | `docs/getting-started.md` |
  | `#options`, `#what-you-set-yourself` | `docs/guide/options.md` |
  | `#lanes` | `docs/guide/lanes.md` |
  | `#design-seats` | `docs/guide/design-seats.md` |
  | `#autonomy` | `docs/guide/autonomy.md` |
  | `#platforms`, `#update-pin-roll-back-and-uninstall`, `#data`, `#upgrading-from-06` | `docs/guide/maintenance.md` |
  | `#principles` | `docs/purpose.md` |
  | `#development`, `#release` | `docs/contributing.md` |

  Una cadena fijada que contiene una ruta desde la raíz (`docs/evaluations/seats/README.md`, `docs/superpowers/specs/2026-10-09-lead-autonomy-design.md`, `specs/001-design-seats/spec.md`) se conserva entera: escríbela como texto del enlace, o como su destino con el prefijo `../` o `../../` delante de la ruta original, que la deja intacta.
- **Valores por defecto (R6).** La única tabla de opciones es la de `docs/guide/options.md`; las demás páginas enlazan a ella. Donde una página repite un valor por defecto de `lanes`, `harnesses`, `ops` o `seats`, lo escribe en la forma «`opción`, `valor` by default»: `on` y `off` para los booleanos, sin acentos graves; una cadena como `agy` o `balanced`, con ellos. Ejemplos: «`lanes`, off by default», «`ops`, on by default», «`harnesses`, `agy` by default», «`seats`, `balanced` by default». El valor es el del manifiesto, `plugins/aether/.claude-plugin/plugin.json`.
- **Lo que ninguna página ni el README puede decir** (hoy lo prohíben las pruebas y R11 las extiende a todas las páginas):
  - `aether:designer`; `approves the spec and the plan`; `the relay of both sides`;
  - `main session, on Sonnet`; `main session, Sonnet`; `` `aether:lead`, on Sonnet ``; `itself, one subagent, or the swarm`. El Lead «empieza» en Sonnet: `starts on Sonnet`;
  - `aether-mode`, `aether-install` y `.local/share/aether-plugin`, en cualquier parte que no sea la sección `### Upgrading from 0.6` de `docs/guide/maintenance.md`;
  - `provisional`, `interim` o `until another method` en una línea que nombre a grok y la cuota o el lector;
  - la palabra `superpowers` en la sección `### Requirements` de `docs/getting-started.md`.
- **Nombres.** Un `aether-<nombre>` entre acentos graves, solo o con sus argumentos, es un archivo de `plugins/aether/bin/`: `aether-autonomy`, `aether-exam`, `aether-guard`, `aether-lane`, `aether-plan`, `aether-report`, `aether-session-start`, `aether-voice`, `aether-wt`. Las únicas excepciones son `aether-lead` (vive en `scripts/`), `aether-plugin` (el nombre del marketplace y del repositorio), `aether-aether-plugin` y `aether-inline` (directorios de datos) y `aether-mode` (retirado, solo en «Upgrading from 0.6»). Un `aether:<nombre>` es un agente de `plugins/aether/agents/`, una skill de `plugins/aether/skills/` o `aether:run`.
- **Rutas.** Una ruta entre acentos graves que empieza por `plugins/`, `scripts/`, `tests/`, `docs/` o `specs/` y no tiene `<`, `*`, `{`, `$` ni `[` existe en el árbol. La excepción es `scripts/aether-install.js`, el instalador de 0.6, nombrado como retirado en «Upgrading from 0.6». Un ejemplo de plan usa rutas `src/…` y `test/…`, nunca `tests/…`.
- **Sin llamadas de pago y sin tocar la configuración del dueño.** Ninguna tarea corre `claude -p`, `agy`, `codex`, `grok` ni `cursor-agent` con un prompt: una llamada real es `paid-call`. Si corres `claude plugin …` para comprobar un comando de la guía, es con un directorio de configuración desechable (`CLAUDE_CONFIG_DIR=$(mktemp -d)`), nunca con el del dueño, y sin entrar en él con `cd`.
- **Nada fuera de tu `Owns`, y nada bajo `specs/` ni `.specify/`** (aether-guard lo rechaza). R13 cierra la lista de archivos que esta spec puede cambiar. No se sube la versión del plugin, no se empuja, no se abre un pull request y no se fusiona a `main`.
- **Cada unidad deja `npm test` verde** (unos 30 segundos). Solo la Task 20 corre `npm run check`.
- **La comprobación de página.** Hasta que existan las pruebas de la ola 2, una página se juzga con este script. Guárdalo **fuera** del repositorio (por ejemplo en `$TMPDIR/pagecheck.js`; no se commitea), y córrelo desde la raíz de tu worktree con la spec JSON de tu tarea: `node $TMPDIR/pagecheck.js <spec.json>`. Sale con 0 y `ok`, o con 1 y la lista de problemas. Campos de la spec: `page`, `title`, `order`, `headings` (líneas exactas, en ese orden), `sections` (encabezado → cadenas que su sección debe tener; una sección va del encabezado al siguiente de nivel 2 o 3, o al final), `sectionForbidden`, `required`, `patterns` (`source` y `flags`) y `forbidden`. Un enlace a una página que esta spec planea y que todavía no existe en tu worktree no es un problema.

````js
'use strict'
// pagecheck.js <spec.json>, run from the repository root. Not committed: it applies by hand the rules that
// tests/docs-facts.test.js and the readers of wave 2 apply later, so a page is judged before they exist.
const fs = require('node:fs')
const path = require('node:path')

const PAGES = [
  'README.md', 'docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/changelog.md',
  'docs/contributing.md', 'docs/roadmap.md', 'docs/guide/options.md', 'docs/guide/lanes.md', 'docs/guide/design-seats.md',
  'docs/guide/autonomy.md', 'docs/guide/ops.md', 'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md',
  'docs/reference/components.md',
]
const NEVER = [
  'aether:designer', 'approves the spec and the plan', 'the relay of both sides', 'main session, on Sonnet',
  'main session, Sonnet', '`aether:lead`, on Sonnet', 'itself, one subagent, or the swarm',
]
const OLD_NAMES = ['aether-mode', 'aether-install', '.local/share/aether-plugin']
const UPGRADING = '### Upgrading from 0.6'
const NOT_BINS = ['aether-lead', 'aether-plugin', 'aether-aether-plugin', 'aether-inline', 'aether-mode']
const ROOTS = ['plugins/', 'scripts/', 'tests/', 'docs/', 'specs/']

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const text = fs.readFileSync(spec.page, 'utf8').replace(/\r\n/g, '\n')
const problems = []
const fail = (message) => problems.push(message)

// A section runs from its heading to the next heading of level 2 or 3, or to the end of the page.
const section = (heading) => {
  const i = text.indexOf(`\n${heading}\n`)
  if (i < 0) return null
  const rest = text.slice(i + heading.length + 2)
  const end = rest.search(/\n#{2,3} /)
  return end < 0 ? rest : rest.slice(0, end)
}
// The page without fenced blocks and comments, for spans and links.
let fenced = false
const bare = text
  .split('\n')
  .map((line) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      fenced = !fenced
      return ''
    }
    return fenced ? '' : line
  })
  .join('\n')
  .replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ''))

// front matter: exactly title, description and an integer order
const fm = text.match(/^---\n([\s\S]*?)\n---\n/)
if (!fm) fail('no front matter')
else {
  const kv = {}
  for (const line of fm[1].split('\n')) kv[line.slice(0, line.indexOf(':'))] = line.slice(line.indexOf(':') + 1).trim()
  if (Object.keys(kv).sort().join() !== 'description,order,title') fail(`front matter keys are ${Object.keys(kv).join(',')}`)
  if (!/^\d+$/.test(kv.order || '')) fail('order is not an integer')
  if (!kv.description) fail('empty description')
  if (spec.order !== undefined && Number(kv.order) !== spec.order) fail(`order must be ${spec.order}`)
  if (spec.title !== undefined && kv.title !== spec.title) fail(`title must be ${spec.title}`)
}
if (spec.title !== undefined && !text.includes(`\n# ${spec.title}\n`)) fail(`no H1 "# ${spec.title}"`)

let at = -1
for (const heading of spec.headings || []) {
  const i = text.indexOf(`\n${heading}\n`)
  if (i < 0) fail(`missing heading: ${heading}`)
  else if (i < at) fail(`heading out of order: ${heading}`)
  else at = i
}
for (const [heading, needs] of Object.entries(spec.sections || {})) {
  const body = section(heading)
  if (body === null) fail(`missing heading: ${heading}`)
  else for (const need of needs) if (!body.includes(need)) fail(`section "${heading}" lacks: ${need}`)
}
for (const [heading, nots] of Object.entries(spec.sectionForbidden || {})) {
  const body = section(heading)
  if (body !== null) for (const not of nots) if (body.includes(not)) fail(`section "${heading}" holds: ${not}`)
}
for (const need of spec.required || []) if (!text.includes(need)) fail(`missing: ${need}`)
for (const p of spec.patterns || []) if (!new RegExp(p.source, p.flags).test(text)) fail(`no match for /${p.source}/${p.flags}`)
for (const not of [...NEVER, ...(spec.forbidden || [])]) if (text.includes(not)) fail(`forbidden: ${not}`)
const upgrading = section(UPGRADING)
const outside = upgrading === null ? text : text.replace(upgrading, '')
for (const name of OLD_NAMES) if (outside.includes(name)) fail(`"${name}" outside "${UPGRADING}"`)
const grok = text.split('\n').filter((line) => /grok/i.test(line) && /quota|reader/i.test(line)).join('\n')
if (/provisional|interim|until another method/i.test(grok)) fail('a line about the quota or the reader of Grok says provisional, interim or until another method')

// commands in position, plugin names and repository paths, in code spans
const bins = new Set(fs.readdirSync('plugins/aether/bin'))
const known = new Set([
  ...fs.readdirSync('plugins/aether/agents').map((f) => f.replace(/\.md$/, '')),
  ...fs.readdirSync('plugins/aether/skills'),
  'run',
])
for (const m of bare.matchAll(/`([^`\n]+)`/g)) {
  const span = m[1].trim()
  if (!/[@/]/.test(span) && !span.includes('--v')) {
    const c = span.match(/^(aether-[a-z0-9-]+)(?:\s.*)?$/)
    if (c && !bins.has(c[1]) && !NOT_BINS.includes(c[1])) fail(`not a command of bin/: ${c[1]}`)
  }
  for (const n of span.matchAll(/\baether:([a-z][a-z0-9-]*)/g)) if (!known.has(n[1])) fail(`not an agent, a skill or run: aether:${n[1]}`)
  const word = span.split(/\s+/)[0].replace(/[.,;:)]+$/, '')
  if (ROOTS.some((r) => word.startsWith(r)) && !/[<*{$[]/.test(word) && word !== 'scripts/aether-install.js' && !fs.existsSync(word)) fail(`path does not exist: ${word}`)
}

// links and anchors; a page planned in this spec that is not written yet is not a problem
const slug = (h) => h.replace(/`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
const anchorsOf = (body) => {
  const out = new Set()
  const seen = new Map()
  let inFence = false
  for (const line of body.split('\n')) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
      continue
    }
    const m = !inFence && line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)
    if (!m) continue
    const base = slug(m[1])
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    out.add(n === 0 ? base : `${base}-${n}`)
  }
  return out
}
bare.split('\n').forEach((line, i) => {
  for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1]
    if (/^(https?:|mailto:)/i.test(target)) continue
    if (target.startsWith('/')) {
      fail(`line ${i + 1}: ${target} is not relative`)
      continue
    }
    const [file, anchor] = target.split('#')
    const rel = file ? path.normalize(path.join(path.dirname(spec.page), file)) : spec.page
    if (!fs.existsSync(rel)) {
      if (!PAGES.includes(rel)) fail(`line ${i + 1}: ${target} does not resolve`)
      continue
    }
    if (anchor) {
      if (!rel.endsWith('.md')) fail(`line ${i + 1}: ${target}: an anchor on a file that is not Markdown`)
      else if (!anchorsOf(fs.readFileSync(rel, 'utf8')).has(anchor)) fail(`line ${i + 1}: ${target}: no heading has that anchor`)
    }
  }
})

if (problems.length) {
  console.error(`${spec.page}: ${problems.length} problem(s)`)
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}
console.log(`${spec.page}: ok`)
````

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 150

## Checklist

- [ ] T001 [P] [US2] La guía de quien acaba de instalar in docs/getting-started.md → Task 1
- [ ] T002 [P] [US2] Qué hacer cuando algo falla in docs/guide/troubleshooting.md → Task 2
- [ ] T003 [P] [US3] Para qué existe Aether y qué busca in docs/purpose.md → Task 3
- [ ] T004 [P] [US3] El método de punta a punta in docs/methodology.md → Task 4
- [ ] T005 [P] [US4] La única tabla de opciones in docs/guide/options.md → Task 5
- [ ] T006 [P] [US5] Lanes, sin recortar in docs/guide/lanes.md → Task 6
- [ ] T007 [P] [US5] Design seats, Autonomy y Ops in docs/guide/design-seats.md, docs/guide/autonomy.md y docs/guide/ops.md → Task 7
- [ ] T008 [P] [US5] Mantenimiento: plataformas, actualizar, datos y «Upgrading from 0.6» in docs/guide/maintenance.md → Task 8
- [ ] T009 [P] [US5] Las piezas y la medición fechada in docs/reference/components.md → Task 9
- [ ] T010 [P] [US5] El historial por versiones y los ensayos in docs/changelog.md → Task 10
- [ ] T011 [P] [US5] Contribuir y la hoja de ruta in docs/contributing.md y docs/roadmap.md → Task 11
- [ ] T012 [P] [US5] El índice por público in docs/index.md → Task 12
- [ ] T013 [P] [US4] Las tres pruebas que leen el README leen el README y las páginas in tests/launcher.test.js, tests/lanes-docs.test.js y tests/start-command.test.js → Task 13
- [ ] T014 [P] [US4] La frase de la skill `swarm` y la prueba que la fija in plugins/aether/skills/swarm/SKILL.md y tests/roles.test.js → Task 14
- [ ] T015 [P] [US4] La prueba de hechos in tests/docs-facts.test.js → Task 15
- [ ] T016 [US1] El README como puerta, R1 en la prueba de hechos y el enlace del retrospectivo in README.md → Task 16
- [ ] T017 [P] [US4] Auditoría de lanes, seats, ops y options in docs/guide/lanes.md → Task 17
- [ ] T018 [P] [US4] Auditoría de la guía de inicio, la solución de problemas, autonomía y mantenimiento in docs/getting-started.md → Task 18
- [ ] T019 [P] [US4] Auditoría de propósito, metodología, piezas y README in docs/methodology.md → Task 19
- [ ] T020 [US4] Auditoría de historia y mapa, la tabla de C4 y `npm run check` in docs/changelog.md → Task 20

### Task 1: La guía de quien acaba de instalar (`docs/getting-started.md`)

**Aether:**
- Tier: sonnet high — una página nueva, de varios apartados, que sale de leer el flujo real del código y de lo que se verificó con una instalación; las pruebas solo fijan encabezados y cadenas
- Review: xhigh — C1: un comando o un paso falso en la guía de quien acaba de instalar es el defecto que el dueño más ve, y ninguna prueba lo atrapa
- Area: docs-start
- Owns: `docs/getting-started.md`
- Depends on: none

**Interfaces:**

Archivo `docs/getting-started.md`, front matter `title: Getting started`, `order: 1`, y `# Getting started` debajo. Encabezados, exactos y en este orden (puedes añadir otros de nivel 3 entre los de nivel 3 y de nivel 2 después de `## Your first request`, no antes de `### Start`):

```text
# Getting started
## Use Aether mode
### Requirements
### Install
### Check that it worked
### Start
## Your first request
## Work for hours
## Read the brief
## When something fails
```

- **Después del título**, una introducción de dos o tres frases: para quién es la guía y qué tendrá quien la siga al final (el modo Aether arrancado, qué pasó con su primera petición, cómo leer el brief).
- **`## Use Aether mode`** abre con una frase y sigue con `### Requirements`, `### Install` y `### Start`: lo que el README de 122755a decía en las líneas 223–264, completo y sin recortar (los requisitos, la instalación, y el arranque con `claude --agent aether:lead --effort xhigh`, con `scripts/aether-lead`, con el agente por defecto de un repositorio, y que `claude` a secas es el modo normal). Las cadenas fijadas por las pruebas están abajo; las tres de `### Start` van **dentro** de esa sección, antes de cualquier encabezado de nivel 2 o 3.
- **`### Check that it worked`** (nuevo): cómo saber, sin un modelo, que la instalación funcionó. Solo lo que verificaste: que el plugin figura instalado, que `claude plugin configure aether@aether-plugin` muestra sus cuatro opciones, y `aether-plan check` sobre el plan de ejemplo de esta guía (un `tasks.md` mínimo de dos tareas independientes, con el bloque de campos de Aether, las rutas en `src/…` y `test/…`, y su sección `## Aether Execution`). Di desde dónde se corre cada comando (los comandos de `bin/` están en el `PATH` de la herramienta Bash de una sesión con el plugin; fuera de ella se corren por su ruta). El plan de ejemplo y el comando van en bloques de código.
- **`## Your first request`** (nuevo, con lo que decía el README en las líneas 266–277): qué pasa con una primera petición, paso a paso: el Lead escribe su entendimiento y espera la confirmación; escribe la spec; el Writer escribe el plan y las tareas; el Judge los revisa; el Lead elige entre hacerlo él, una tarea delegada o el swarm, y lo dice con su razón; y termina con un brief corto que abre con lo que espera tu sí. Incluye la lista de lo que el swarm necesita (campos de Aether en cada tarea, una sección `## Aether Execution`, un worktree de integración en una rama de feature, permisos para `git`, `aether-wt` y las pruebas).
- **`## Work for hours`** (nuevo): cómo dar permiso para trabajar por horas, qué hace el Lead entonces (la corrida, los topes de 8 horas y US$ 50 si no dices otros, el diario, cuándo se detiene), que un permiso de Claude Code que pregunta detiene la corrida como una pregunta, y el enlace a [Autonomy](guide/autonomy.md#autonomy).
- **`## Read the brief`** (nuevo): cómo leer el brief; «Espera tu sí» (acción · clase · por qué · si dices que no · cómo se revierte · el comando exacto), «Supuestos» (ordenados por lo probable que sea que los vetes), las líneas RADAR, «Qué no verifiqué», y qué contestar.
- **`## When something fails`** (nuevo): tres o cuatro fallos comunes con su remedio de una línea, y el enlace a [Troubleshooting](guide/troubleshooting.md).
- Enlaces a otras páginas: `guide/options.md#options`, `guide/lanes.md#lanes`, `guide/design-seats.md#design-seats`, `guide/autonomy.md#autonomy`, `guide/maintenance.md#update-pin-roll-back-and-uninstall`, `methodology.md`, `purpose.md`, `guide/troubleshooting.md`.

Fuentes: `scripts/aether-lead`; `plugins/aether/agents/lead.md`; `plugins/aether/skills/using-aether/SKILL.md` («Understanding the intent», «The three paths», «Writing and judging», «The owner's list», «Autonomous runs», el brief); `plugins/aether/skills/swarm/SKILL.md` §1; `plugins/aether/bin/aether-session-start`; `docs/evaluations/2026-10-09-installable/A1-install.md` a `A4-aether-session.md` (qué se verificó con una instalación real).

**Tests (write first):**

La spec de la comprobación de página (guárdala como `getting-started.json` fuera del repositorio). Falla mientras la página no exista:

```json
{
  "page": "docs/getting-started.md",
  "title": "Getting started",
  "order": 1,
  "headings": ["## Use Aether mode", "### Requirements", "### Install", "### Start", "## Your first request", "## Work for hours", "## Read the brief", "## When something fails"],
  "sections": {
    "### Start": ["--permission-mode bypassPermissions", "AETHER_IRREVERSIBLE=enforce", "AETHER_IRREVERSIBLE=log aether-lead"]
  },
  "sectionForbidden": { "### Requirements": ["superpowers"] },
  "required": [
    "claude plugin install aether --marketplace DarkArty07/aether-plugin",
    "/plugin install aether --marketplace DarkArty07/aether-plugin",
    "--config lanes=true",
    "claude --agent aether:lead --effort xhigh",
    "{ \"agent\": \"aether:lead\", \"effortLevel\": \"xhigh\" }",
    "claude --agent claude",
    "Plain `claude` stays normal mode: the plugin is dormant there.",
    "--settings '{\"enabledPlugins\":{\"superpowers@claude-plugins-official\":false}}'",
    "scripts/aether-lead",
    "a delegate task on a model it names, or the swarm",
    "Espera tu sí",
    "Supuestos",
    "RADAR",
    "guide/troubleshooting.md"
  ]
}
```

Y a mano, porque la comprobación de página no los corre:
1. extrae el plan de ejemplo de la guía a un archivo temporal y corre `node plugins/aether/bin/aether-plan check <archivo>`: sale con 0;
2. cada comando de un bloque de código de la guía que no necesita un modelo se corre, si la CLI `claude` está en tu entorno, con `CLAUDE_CONFIG_DIR=$(mktemp -d)`; el informe da la salida de cada uno, y marca como «necesita un modelo» los que no se corrieron.

**Acceptance:**
- La comprobación de página sale con 0 y `ok`.
- El plan de ejemplo pasa `aether-plan check`, y no es una cadena: sus dos tareas son independientes.
- Cada cadena que el README fijaba en `### Requirements`, `### Install` y `### Start` sigue ahí, exacta.
- Cada paso de «Your first request» corresponde a una sección de `using-aether/SKILL.md` o del workflow, y el informe dice cuál; ningún paso es una suposición.
- El informe lista: las frases del README que cambiaste y por qué (R12), la salida de lo que corriste, y lo que no pudiste comprobar.

### Task 2: Qué hacer cuando algo falla (`docs/guide/troubleshooting.md`)

**Aether:**
- Tier: sonnet high — contenido nuevo que sale de leer qué causa cada fallo en el código; las pruebas solo fijan los encabezados
- Review: xhigh — cada causa y cada remedio tienen que ser ciertos; un remedio falso cuesta más que no tenerlo, y ninguna prueba lo atrapa
- Area: docs-start
- Owns: `docs/guide/troubleshooting.md`
- Depends on: none

**Interfaces:**

Archivo `docs/guide/troubleshooting.md`, front matter `title: Troubleshooting`, `order: 16`, y `# Troubleshooting` debajo. Después, una introducción de una frase y estos diez encabezados de nivel 2, exactos y en este orden. Cada uno dice, en prosa corta, qué se ve, por qué y qué hacer, con el comando exacto cuando lo hay:

```text
## Aether's agents and skills do not show up
## The swarm does not start
## A plan does not pass the check
## The session stops at a permission prompt
## A command was refused or recorded
## Nothing runs on a lane
## A merge fails or times out
## An update does not take
## Worktrees or branches are left behind
## A unit comes back blocked
```

Qué cubre cada uno (tú compruebas cada afirmación en el código y nombras la fuente en el informe):
- **agents and skills do not show up:** una sesión de `claude` a secas es el modo normal y el plugin duerme; el modo Aether se elige con `--agent aether:lead` (`skills/using-aether`, `hooks/register.js`, `bin/aether-session-start`).
- **swarm does not start:** la sesión no tiene la herramienta `Workflow` (flujos de trabajo dinámicos apagados) y qué hace el Lead entonces (`skills/swarm/SKILL.md` §1).
- **plan does not pass the check:** los mensajes de `aether-plan check` que más se ven (cadena de olas con una tarea cada una, rutas que se solapan en una misma ola, falta el bloque `**Aether:**` o su `Tier`, un `Depends on` sin motivo, una tarea con más de seis rutas) y cómo se arreglan (`lib/plan.js`).
- **permission prompt:** un permiso que pregunta detiene una corrida como una pregunta; el remedio es una regla de permisos que cubra `git`, `aether-wt`, `aether-lane` y las pruebas, o `scripts/aether-lead` (`skills/swarm/SKILL.md` §1, «Autonomous runs»).
- **command refused or recorded:** aether-guard y `AETHER_IRREVERSIBLE` (`enforce` rechaza, `log` solo anota), la lista del dueño `.aether/pending.jsonl`, las clases de acción, y que el permiso del dueño se registra con `aether-autonomy grant` (`lib/guard.js`, `lib/pending.js`, `lib/autonomy.js`).
- **nothing runs on a lane:** la opción `lanes` apagada (enlace a [Options](options.md#options)), el harness fuera de `harnesses`, su CLI sin instalar o fuera del `PATH` del entorno de Claude Code, un grupo con marca de agotado, y que las lanes son solo de Linux; `aether-lane quota` y `aether-lane status <run>` dicen cuál (enlace a [Lanes](lanes.md#lanes)).
- **merge fails or times out:** una prueba nueva que falla deshace la fusión, las pruebas que ya fallaban antes no la bloquean (la línea base), y una fusión cuyas pruebas pasan de 10 minutos se corta después de su commit y antes de su reversión; qué hacer cuando el comando de pruebas necesita el entorno de tu shell (la opción `ops`) (`lib/worktrees.js`, `hooks/ops-command.mjs`, [Ops without a model](ops.md)).
- **update does not take:** una sesión con `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` no trae un `ref` cambiado (enlace a [Maintenance](maintenance.md#update-pin-roll-back-and-uninstall)).
- **worktrees or branches left behind:** `aether-wt sweep` y `aether-wt remove` (guarda lo no fusionado como parche), y que el hook de inicio barre las corridas sin tocar durante 24 horas (`bin/aether-wt`, `lib/session.js`).
- **unit comes back blocked:** qué quiere decir `blocked` o `skipped` (la escalera agotada, el mismo hallazgo tres veces, un fallo de fusión), y que lo relanza el Lead, no el dueño (`skills/swarm/SKILL.md` §4 y §5).

Enlaces a [Getting started](../getting-started.md) en la introducción, y a las páginas de la guía que nombra cada apartado.

**Tests (write first):**

```json
{
  "page": "docs/guide/troubleshooting.md",
  "title": "Troubleshooting",
  "order": 16,
  "headings": [
    "## Aether's agents and skills do not show up",
    "## The swarm does not start",
    "## A plan does not pass the check",
    "## The session stops at a permission prompt",
    "## A command was refused or recorded",
    "## Nothing runs on a lane",
    "## A merge fails or times out",
    "## An update does not take",
    "## Worktrees or branches are left behind",
    "## A unit comes back blocked"
  ],
  "required": ["../getting-started.md", "AETHER_IRREVERSIBLE", "aether-lane status", "aether-wt sweep", "aether-plan check"]
}
```

**Acceptance:**
- La comprobación de página sale con 0 y `ok`.
- Cada causa y cada remedio nombra, en tu informe, el archivo del plugin que lo sostiene; ninguno sale de la memoria ni del README.
- Un remedio que depende de una opción da su valor por defecto solo en la forma de R6 o enlaza a la tabla de opciones.
- No hay una afirmación que el código no sostenga: lo que no pudiste confirmar queda fuera, y el informe lo lista.

### Task 3: Para qué existe Aether y qué busca (`docs/purpose.md`)

**Aether:**
- Tier: sonnet high — mueve y resume secciones largas, y escribe el problema y lo que Aether no es; las prohibiciones de las pruebas alcanzan a esta página
- Area: docs-method
- Owns: `docs/purpose.md`
- Depends on: none

**Interfaces:**

Archivo `docs/purpose.md`, front matter `title: Purpose`, `order: 2`, y `# Purpose` debajo. Una introducción de una o dos frases, y estos encabezados de nivel 2, exactos y en este orden:

```text
## The problem
## RADAR
## Principles
## Lessons from Aether Agents
## What Aether is not
```

- **The problem** (nuevo, corto): lo que Aether resuelve; sale de la introducción del README (líneas 3 y 25) y de [docs/aether-retrospective.md](aether-retrospective.md) (lo que falló en Aether Agents). La frase de la línea 25, «Aether Plugin is the successor to [Aether Agents](https://github.com/DarkArty07/Aether-Agents): the same method, rebuilt on a harness made for software.», va aquí o en «What Aether is not», con ese enlace.
- **RADAR:** los cinco objetivos con sus nombres en negrita, cada uno con la frase del README (líneas 5–10), y cómo se mide cada uno (de `docs/roadmap/2026-10-10-radar.md` y `aether-report`; enlace a [la hoja de ruta de RADAR](roadmap/2026-10-10-radar.md)). Los cinco nombres se escriben tal cual: `**Rápido**`, `**Autónomo**`, `**Delegación**`, `**Asequible**`, `**Robusto**`.
- **Principles:** las siete de las líneas 420–428, palabra por palabra, como lista numerada, bajo `## Principles` (la ancla `#principles` la usan el retrospectivo y la guía).
- **Lessons from Aether Agents:** las líneas 404–418, palabra por palabra, con el enlace a Aether Agents.
- **What Aether is not:** no es el modo normal de `claude` (el plugin duerme en una sesión que no arranca con `--agent aether:lead`); no exige superpowers ni la CLI de Spec Kit; no es un servicio ni cambia nada fuera de la sesión que lo elige. Cada afirmación sale del código (`hooks/register.js`, `bin/aether-session-start`, `plugin.json` sin `dependencies`).
- Enlaces: [Getting started](getting-started.md), [Methodology](methodology.md).

Fuentes: README de 122755a líneas 1–25 y 404–428; `plugins/aether/skills/using-aether/SKILL.md` («RADAR»); `docs/roadmap/2026-10-10-radar.md`; `docs/aether-retrospective.md`.

**Tests (write first):**

```json
{
  "page": "docs/purpose.md",
  "title": "Purpose",
  "order": 2,
  "headings": ["## The problem", "## RADAR", "## Principles", "## Lessons from Aether Agents", "## What Aether is not"],
  "required": [
    "**Rápido**", "**Autónomo**", "**Delegación**", "**Asequible**", "**Robusto**",
    "1. **Mechanism in code, judgment in the model.**",
    "2. **Bounded autonomy.**",
    "3. **The task chooses the model and its effort.**",
    "4. **Contracts first, then the swarm.**",
    "5. **Sonnet writes, Opus decides, and a stronger model may take either seat.**",
    "6. **One list for the owner.**",
    "7. **RADAR.**",
    "The method worked: specs, exploration notes, saved learnings and visible order. The infrastructure did not:",
    "Aether Plugin answers each failure:",
    "[Aether Agents](https://github.com/DarkArty07/Aether-Agents)"
  ]
}
```

**Acceptance:**
- La comprobación de página sale con 0 y `ok`.
- Los siete principios y las dos listas de «Lessons» son los del README de 122755a, sin una palabra menos.
- La página no dice `aether:designer` ni ninguna cadena prohibida de «Global Constraints», y no repite un valor por defecto de una opción.
- «What Aether is not» no afirma nada que el código no sostenga; el informe nombra la fuente de cada frase.

### Task 4: El método de punta a punta (`docs/methodology.md`)

**Aether:**
- Tier: sonnet high — sintetiza el método desde la skill `using-aether` y mueve el diagrama; tiene que coincidir con la skill y no contradecirla, y las pruebas fijan solo unas cadenas
- Review: xhigh — C3: una contradicción sutil con `using-aether` (un umbral, un orden, un modelo) no la ve ninguna prueba
- Area: docs-method
- Owns: `docs/methodology.md`
- Depends on: none

**Interfaces:**

Archivo `docs/methodology.md`, front matter `title: Methodology`, `order: 3`, y `# Methodology` debajo. Una introducción de dos frases, y estos encabezados de nivel 2, exactos y en este orden:

```text
## Who does what
## The method, end to end
## The route by size and risk
## Whoever writes does not judge
## How the model and the harness are chosen
```

- **Who does what:** el Lead, el Writer (`aether:writer`), el Judge (`aether:judge`), el Examiner (`aether:examiner`), el swarm (implementers, supervisor, reviewer, ops) y las lanes. Parte de las líneas 12–23 del README, corregidas contra `plugins/aether/agents/*.md` (modelo y esfuerzo de cada rol) y contra `skills/using-aether`. Enlaces a las páginas de lanes, seats y autonomía.
- **The method, end to end:** dueño → Lead → spec en el formato de Spec Kit (`specs/NNN-<topic>/`) → Judge → Writer → Judge → Examiner → los tres caminos (directo, tarea delegada, swarm) → examen → brief. Aquí van, **tal cual**, el párrafo que empieza con `**The three paths.**` (al principio de una línea) con sus tres viñetas `**Direct:**`, `**Delegate task:**` y `**Swarm:**` (líneas 103–106 del README) y el diagrama (líneas 108–133, en su bloque de código). También el párrafo sobre Spec Kit y superpowers (línea 25).
- **The route by size and risk:** la tabla de «The route by size and risk» de `using-aether/SKILL.md`, y su frase sobre qué se le dice al dueño antes de una spec y un plan.
- **Whoever writes does not judge:** que un asiento nunca toma el modelo que escribió lo que revisa (A41), y que como máximo hay dos revisiones por documento.
- **How the model and the harness are chosen:** el índice de modelos (`plugins/aether/config/models/`), la regla de la tarea (Tier y esfuerzo, la escalera), el modelo de cada tarea delegada, las lanes y los asientos, y que la cuota decide entre candidatos (enlaces a [Lanes](guide/lanes.md#lanes) y [Design seats](guide/design-seats.md#design-seats)).

Fuentes: `plugins/aether/skills/using-aether/SKILL.md` (entera), `plugins/aether/agents/*.md`, `plugins/aether/skills/swarm/SKILL.md`, README de 122755a líneas 12–25 y 101–133, `docs/decisions.md` (D5, D6, A39–A43, A48).

**Tests (write first):**

```json
{
  "page": "docs/methodology.md",
  "title": "Methodology",
  "order": 3,
  "headings": [
    "## Who does what",
    "## The method, end to end",
    "## The route by size and risk",
    "## Whoever writes does not judge",
    "## How the model and the harness are chosen"
  ],
  "patterns": [{ "source": "^\\*\\*The three paths\\.\\*\\*", "flags": "m" }],
  "required": [
    "**Direct:**", "**Delegate task:**", "**Swarm:**",
    "the route and the path (direct, delegate task, swarm)",
    "Lead (main session, starts on Sonnet, xhigh)",
    "`aether:writer`", "`aether:judge`", "`aether:examiner`",
    "specs/NNN-<topic>/"
  ]
}
```

**Acceptance:**
- La comprobación de página sale con 0 y `ok`.
- Cada afirmación de la página coincide con `using-aether/SKILL.md` y con las definiciones de `agents/*.md`; el informe lista, para cada número (umbral de tareas, revisiones, esfuerzos), la línea de la skill o del agente que lo sostiene.
- El diagrama es el del README salvo lo que R12 corrige y el informe nombra.
- No dice ninguna de las cadenas de «Sonnet» prohibidas ni `aether:designer` (el Designer de 0.7 puede nombrarse como «the Designer», sin `aether:`).

### Task 5: La única tabla de opciones (`docs/guide/options.md`)

**Aether:**
- Tier: sonnet high — mueve dos secciones y construye la tabla que docs-facts compara con el manifiesto; el valor y la forma de fijarlo salen del código
- Review: xhigh — C3: un valor por defecto o un modo de fijarlo equivocado es la afirmación que más se copia, y la prueba solo compara los valores
- Area: docs-guide
- Owns: `docs/guide/options.md`
- Depends on: none

**Interfaces:**

Archivo `docs/guide/options.md`, front matter `title: Options`, `order: 10`, y `# Options` debajo. Una introducción de dos frases, y estos encabezados, exactos y en este orden:

```text
## Configure Aether
### Options
### What you set yourself
```

- **`### Options`:** abre con la tabla, con **esta** cabecera exacta y una fila por opción del manifiesto, en este orden:

  ```text
  | Option | Default | Set it | What it does |
  |---|---|---|---|
  | `lanes` | off | … | … |
  | `harnesses` | `agy` | … | … |
  | `ops` | on | … | … |
  | `seats` | `balanced` | … | … |
  ```

  La columna `Default` solo tiene `on` u `off` (sin acentos graves) para un booleano, y la cadena entre acentos graves para una cadena. «Set it» dice cómo se fija: al instalar con `--config lanes=true`, con `claude plugin configure aether@aether-plugin`, o en `/plugin` → Installed → aether → Configure options. «What it does» es una frase, con enlace a la página del tema ([Lanes](lanes.md#lanes), [Ops without a model](ops.md), [Design seats](design-seats.md#design-seats)). Debajo de la tabla, las cuatro viñetas del README (líneas 292–295) sin recortar, con sus enlaces; cada viñeta empieza con la forma de R6, y el texto es el del README salvo los enlaces.
- **`### What you set yourself`:** la tabla «Need / Step» de las líneas 301–312, con sus ocho filas y el texto que las presenta, y las cadenas fijadas abajo. Los enlaces «(see Lanes)» y «(see Design seats)» pasan a enlaces a esas páginas.
- Debajo de la tabla de opciones, una frase: «`claude plugin configure aether@aether-plugin` shows the options and which are unset.», y la del README sobre cómo se fijan.

Fuentes: `plugins/aether/.claude-plugin/plugin.json` (`userConfig`: tipo, `default` y `description` de cada opción); `plugins/aether/lib/session.js` y `bin/aether-session-start` (cómo llegan las opciones a los comandos: `AETHER_SEATS`, la opción `ops`); README de 122755a líneas 290–312.

**Tests (write first):**

```json
{
  "page": "docs/guide/options.md",
  "title": "Options",
  "order": 10,
  "headings": ["## Configure Aether", "### Options", "### What you set yourself"],
  "required": [
    "| Option | Default | Set it | What it does |",
    "| `lanes` | off |",
    "| `harnesses` | `agy` |",
    "| `ops` | on |",
    "| `seats` | `balanced` |",
    "`lanes`, off by default",
    "`harnesses`, `agy` by default",
    "`ops`, on by default",
    "`seats`, `balanced` by default",
    "claude plugin configure aether@aether-plugin",
    "/advisor off",
    "Dynamic workflows",
    "AETHER_IRREVERSIBLE=enforce",
    "`harnesses`"
  ]
}
```

**Acceptance:**
- La comprobación de página sale con 0 y `ok`.
- La tabla tiene exactamente las cuatro opciones de `userConfig`, con sus valores por defecto; el informe compara cada fila con el manifiesto.
- Cada texto de «Set it» y de «What it does» está comprobado contra el `description` del manifiesto y el código que lee la opción.
- Las ocho filas de «What you set yourself» siguen ahí, y el informe dice cuáles cambiaste y por qué.

### Task 6: Lanes (`docs/guide/lanes.md`)

**Aether:**
- Tier: sonnet high — mueve una sección larga y densa sin recortarla y la enlaza con el resto; las pruebas fijan treinta cadenas exactas y los números tienen que ser los del código
- Review: xhigh — C3: la regla del orden y los tiempos son los más fáciles de dejar desactualizados, y varias de las cifras no las comprueba ninguna prueba
- Area: docs-guide
- Owns: `docs/guide/lanes.md`
- Depends on: none

**Interfaces:**

Archivo `docs/guide/lanes.md`, front matter `title: Lanes`, `order: 11`, y `# Lanes` debajo. Una introducción de dos frases con el enlace a [Options](options.md#options) (las opciones `lanes` y `harnesses`), y un encabezado de nivel 2 de tu elección (por ejemplo `## Running Aether's calls on other plans`) que contiene, sin que la página tenga otro encabezado de nivel 2 o 3 antes de él:

```text
### Lanes
```

Bajo `### Lanes` va, palabra por palabra, lo que el README tenía en las líneas 169–191: el párrafo de apertura, las viñetas (de «Which harnesses» a «Linux only») y los tres párrafos en negrita «Reading the quota», «Adding a harness» y «Turning on Codex, Grok or Cursor» con su lista numerada. **Sin ningún encabezado de nivel 2 o 3 dentro de esa sección**: una prueba mide la sección desde `### Lanes` hasta el siguiente de esos niveles. Cambian solo los enlaces: el [lanes spec](../superpowers/specs/2026-10-08-lanes-design.md) y la [hoja de ruta de RADAR](../roadmap/2026-10-10-radar.md) con sus rutas relativas, y «(see Options)» → un enlace a [Options](options.md#options).

Fuentes, para comprobar cada cifra: `plugins/aether/config/lanes.json`, `lib/lane-order.js`, `lib/lane-marks.js`, `lib/lane-readings.js`, `lib/lane-quota.js`, `lib/lanes.js`, `lib/harness/{agy,codex,grok,cursor,grok-acp,grok-quota,index}.js`, `bin/aether-lane`, README de 122755a líneas 169–191.

**Tests (write first):**

```json
{
  "page": "docs/guide/lanes.md",
  "title": "Lanes",
  "order": 11,
  "headings": ["### Lanes"],
  "sections": {
    "### Lanes": [
      "- **The order.**",
      "the highest priority first; in a tie, the nearer reset, then the order of `harnesses`",
      "then the groups with no reading, in the order of `harnesses`",
      "divided by the hours to its reset, at least one hour",
      "the shares of different plans compare equal",
      "leaves a dry mark in the plugin's data directory",
      "`dryMarkMinutes`",
      "`quotaLifeMinutes`",
      "the same call goes to the next candidate, and to Aether's own agent when none is left",
      "`lanes.run.choices`",
      "`aether-lane status <run>`"
    ]
  },
  "required": [
    "**Grok's quota is read over ACP**",
    "the request `_x.ai/billing` on `grok agent stdio`",
    "`aether-lane status <run> --refresh`, the quota step of each wave in the workflow",
    "the fallback opens grok's UI for a few seconds (20 at most)",
    "removes the session folder grok made for that directory, and no other",
    "A `status` run by hand does not refresh.",
    "A line without `creditUsagePercent` is read as 0% used",
    "**Adding a harness.**",
    "`HARNESS_NAMES` and `FACTORY` of `plugins/aether/lib/harness/index.js`",
    "`quotaCost: 'process'`",
    "or `unknown` when it cannot read them",
    "(`quotaLifeMinutes`: 10 minutes)",
    "a finished agy call and `aether-lane quota` take a fresh reading",
    "its 30 minutes (`quotaLifeMinutes`)",
    "otherwise for 60 minutes (`dryMarkMinutes`)",
    "above a 5% reserve (`reserve` in the table)",
    "(10 seconds at most)",
    "they call it stale after 30 minutes"
  ]
}
```

**Acceptance:**
- La comprobación de página sale con 0 y `ok`; `### Lanes` mide más de 1000 caracteres hasta el siguiente encabezado de nivel 2 o 3.
- El texto es el del README de 122755a, y el informe da, por cada cifra (10, 20 y 30 segundos o minutos, 60 minutos, el 5 % de reserva, la hora mínima), la línea de `lanes.json` o de `lib/` que la sostiene, y lista cada frase que corregiste.
- Ninguna línea que nombre a grok y la cuota o el lector dice `provisional`, `interim` ni `until another method`.
- Donde la página repite el valor por defecto de `lanes` o `harnesses`, es en la forma de R6 y es el del manifiesto.

### Task 7: Design seats, Autonomy y Ops (`docs/guide/design-seats.md`, `docs/guide/autonomy.md`, `docs/guide/ops.md`)

**Aether:**
- Tier: sonnet high — tres movimientos de secciones medianas, con sus enlaces; las pruebas fijan encabezados y unas cadenas, y cada afirmación se contrasta con el código
- Area: docs-guide
- Owns: `docs/guide/design-seats.md`, `docs/guide/autonomy.md`, `docs/guide/ops.md`
- Depends on: none

**Interfaces:**

Tres archivos, cada uno con su front matter (`title` y `order` de la tabla de «Global Constraints») y su H1. Cada uno abre con una introducción de una frase y un encabezado de nivel 2 de tu elección que contiene el de nivel 3 fijado, y bajo ese encabezado va lo que el README tenía, palabra por palabra, sin ningún otro encabezado de nivel 2 o 3 dentro:

- **`docs/guide/design-seats.md`** (`title: Design seats`, `order: 12`): `### Design seats` y las líneas 195–209 del README: el párrafo, la tabla `seats` × Judge, Writer, Examiner, y las viñetas (What changes, Who takes a seat, A round, The exam, Argon, Measured before it is trusted, Fable). Enlaces: [spec 001](../../specs/001-design-seats/spec.md), la evaluación como texto `docs/evaluations/seats/README.md` con destino `../evaluations/seats/README.md`, [Options](options.md#options) y [Lanes](lanes.md#lanes).
- **`docs/guide/autonomy.md`** (`title: Autonomy`, `order: 13`): `### Autonomy` y las líneas 213–221: el párrafo con el enlace al [autonomy spec](../../docs/superpowers/specs/2026-10-09-lead-autonomy-design.md) y las seis viñetas (Deciding … Files). «(see Start)» pasa a un enlace a [Start](../getting-started.md#start), «(see Ops without a model)» a [Ops without a model](ops.md).
- **`docs/guide/ops.md`** (`title: Ops without a model`, `order: 14`): las líneas 156–167: el párrafo «Ops without a model», sus tres viñetas, el párrafo de «With the `ops` option off…», las cuatro viñetas de lo que cambia (Permissions, Environment, The 10-minute limit, The capability) y la línea «See [decision A30](../decisions.md).». Sin encabezado fijado; la página abre con `## How the mod answers` y sigue con el texto.

Fuentes: `plugins/aether/config/lanes.json` (`designSeats`), `lib/seats.js`, `lib/exam.js`, `bin/aether-exam`, `specs/001-design-seats/`, `docs/decisions.md` (A39–A43) para seats; `config/autonomy.json`, `lib/autonomy.js`, `lib/guard.js`, `lib/pending.js`, `bin/aether-autonomy` para autonomía; `hooks/ops-command.mjs`, `hooks/register.js`, `docs/decisions.md` (A30, A46) para ops.

**Tests (write first):**

Tres specs de la comprobación de página, una por archivo:

```json
{
  "page": "docs/guide/design-seats.md",
  "title": "Design seats",
  "order": 12,
  "headings": ["### Design seats"],
  "required": [
    "`aether-lane seat`",
    "`aether-exam`",
    "docs/evaluations/seats/README.md",
    "specs/001-design-seats/spec.md",
    "Fable",
    "| `seats` | Judge | Writer | Examiner |"
  ]
}
```

```json
{
  "page": "docs/guide/autonomy.md",
  "title": "Autonomy",
  "order": 13,
  "headings": ["### Autonomy"],
  "required": [
    "docs/superpowers/specs/2026-10-09-lead-autonomy-design.md",
    "AETHER_IRREVERSIBLE=enforce",
    "`aether-autonomy grant`",
    "«Espera tu sí»"
  ]
}
```

```json
{
  "page": "docs/guide/ops.md",
  "title": "Ops without a model",
  "order": 14,
  "required": ["**The 10-minute limit.**", "`hooks/ops-command.mjs`", "$.process.run", "[decision A30](../decisions.md)"]
}
```

**Acceptance:**
- Las tres comprobaciones de página salen con 0 y `ok`.
- Cada tabla y cada viñeta del README sigue ahí; el informe lista lo que corregiste y por qué.
- El informe contrasta con el código: la tabla `seats` con `designSeats` de `lanes.json`, la lista de clases de `autonomy` con `lib/autonomy.js`, y el límite de 10 minutos y la lista cerrada de ops con `hooks/ops-command.mjs`.
- Donde una página repite el valor por defecto de `seats` o de `ops`, es en la forma de R6 y es el del manifiesto.
- `autonomy.md` no dice `approves the spec and the plan` ni `the relay of both sides`.

### Task 8: Mantenimiento (`docs/guide/maintenance.md`)

**Aether:**
- Tier: sonnet high — mueve cuatro secciones con comandos y JSON exactos y las enlaza; las pruebas fijan los encabezados y las cadenas de «Upgrading from 0.6»
- Review: xhigh — pérdida de datos: un comando de desinstalar, fijar una versión o volver atrás equivocado borra la configuración de quien lo copia
- Area: docs-start
- Owns: `docs/guide/maintenance.md`
- Depends on: none

**Interfaces:**

Archivo `docs/guide/maintenance.md`, front matter `title: Maintenance`, `order: 15`, y `# Maintenance` debajo. Una introducción de una frase y un encabezado de nivel 2 de tu elección (por ejemplo `## Keep Aether running`), y bajo él, **exactos y en este orden**:

```text
### Platforms
### Update, pin, roll back and uninstall
### Data
### Upgrading from 0.6
```

Cada sección es la del README, palabra por palabra (líneas 314–367): la tabla de plataformas; las viñetas de actualizar, fijar y volver atrás (con su JSON de `extraKnownMarketplaces`), «The session must have network traffic on», «Never remove the marketplace to change versions» y desinstalar; los datos con su directorio y sus plazos; y «Upgrading from 0.6» con sus viñetas y sus dos bloques de JSON. Solo `### Upgrading from 0.6` nombra `aether-mode`, `aether-install` y `.local/share/aether-plugin`; cualquier otra sección que los necesite no los nombra. Los enlaces «(see Options)» y «(see Lanes)» pasan a enlaces a [Options](options.md#options) y [Lanes](lanes.md#lanes).

Fuentes: README de 122755a líneas 314–367; `plugins/aether/lib/session.js` y `bin/aether-session-start` (qué se barre y a los cuántos días); `docs/claude-code-research.md` («Installable plugin findings»); `docs/evaluations/2026-10-09-installable/A5-pin-rollback.md` y `A6-owner-copy.md`; `git tag -l 'aether--v*'` (las etiquetas que existen).

**Tests (write first):**

```json
{
  "page": "docs/guide/maintenance.md",
  "title": "Maintenance",
  "order": 15,
  "headings": ["### Platforms", "### Update, pin, roll back and uninstall", "### Data", "### Upgrading from 0.6"],
  "sections": {
    "### Upgrading from 0.6": [
      "\"source\": \"git\"",
      "\"url\": \"file://",
      "\"ref\": \"aether--v0.7.0\"",
      "claude plugin install aether@aether-plugin --config lanes=true",
      "/advisor off"
    ]
  },
  "required": [
    "claude plugin update aether@aether-plugin",
    "claude plugin uninstall aether@aether-plugin",
    "--keep-data",
    "~/.claude/plugins/data/aether-aether-plugin/",
    "Not verified on a Mac",
    "Never remove the marketplace to change versions"
  ]
}
```

**Acceptance:**
- La comprobación de página sale con 0 y `ok` (incluye que los nombres retirados solo aparecen en «Upgrading from 0.6»).
- Los plazos de «Data» (30 días, 24 horas) y qué se barre están contrastados con `lib/session.js`; el informe los lista con su línea.
- Los comandos de desinstalar y de fijar una versión son exactamente los del README, o la corrección está nombrada con su fuente.
- Las plataformas dicen lo que el README decía: lo que no se verificó no se afirma.

### Task 9: Las piezas y la medición fechada (`docs/reference/components.md`)

**Aether:**
- Tier: sonnet high — mueve una tabla larga y una medición, la corrige contra el árbol y la fecha; las pruebas fijan unas cadenas
- Area: docs-method
- Owns: `docs/reference/components.md`
- Depends on: none

**Interfaces:**

Archivo `docs/reference/components.md`, front matter `title: Components`, `order: 20`, y `# Components` debajo. Una introducción de una frase y estos encabezados de nivel 2:

```text
## The pieces
## What Aether adds to a normal session
```

- **The pieces:** la tabla `| Piece | What it does |` del README (líneas 135–154), una fila por pieza, con la cabecera exacta `| Piece | What it does |`. Corregida contra el árbol: cada pieza existe (los nueve archivos de `plugins/aether/bin/`, los ocho agentes de `plugins/aether/agents/`, las seis skills, el hook de inicio, el mod). La fila `| \`aether-autonomy\` |` conserva ese comienzo exacto. Si falta una pieza que existe (por ejemplo `aether-session-start`), se añade una fila.
- **What Aether adds to a normal session:** las líneas 279–288, con la corrección de R12: «the nine commands of `bin/`» (hoy son nueve), y la medición **fechada**: la versión de Claude Code, la de Aether y la fecha en que se midió (la de `docs/evaluations/2026-10-09-installable/A3-dormant.md`), en una frase que dice que 0.8 a 0.10 no se midieron así. La medición no se retira.
- Enlaces: [Methodology](../methodology.md), [Options](../guide/options.md#options).

Fuentes: `plugins/aether/bin/`, `agents/`, `skills/`, `hooks/hooks.json`, `workflows/`; `docs/evaluations/2026-10-09-installable/A3-dormant.md`; README de 122755a líneas 135–154 y 279–288.

**Tests (write first):**

```json
{
  "page": "docs/reference/components.md",
  "title": "Components",
  "order": 20,
  "headings": ["## The pieces", "## What Aether adds to a normal session"],
  "required": ["| Piece | What it does |", "| `aether-autonomy` |", "nine commands of `bin/`", "Aether 0.7.0", "Claude Code 2.1.296"],
  "patterns": [{ "source": "\\b20\\d\\d-\\d\\d-\\d\\d\\b", "flags": "" }],
  "forbidden": ["eight commands of `bin/`"]
}
```

**Acceptance:**
- La comprobación de página sale con 0 y `ok`.
- La página dice la versión de Claude Code, la de Aether y la fecha de la medición, y no afirma que 0.8 a 0.10 se hayan medido.
- Cada fila de la tabla se contrasta con el árbol; el informe lista las que corregiste o añadiste.
- El número de comandos de `bin/` coincide con `ls plugins/aether/bin | wc -l`.

### Task 10: El historial por versiones y los ensayos (`docs/changelog.md`)

**Aether:**
- Tier: haiku high — una copia con una sustitución mecánica que una comparación exacta fija por completo
- Area: docs-history
- Owns: `docs/changelog.md`
- Depends on: none

**Interfaces:**

Archivo `docs/changelog.md`, front matter `title: Changelog`, `order: 31`, `# Changelog` y dos secciones, exactas y en este orden. La primera es esta, **tal cual**:

```text
## Unreleased

- The `swarm` skill's sentence about the rule that orders the lanes' candidates no longer sends the reader to the README's Lanes section: it names `docs/guide/lanes.md`. The plugin's version stays 0.10.0; the change reaches users with the next release.
```

La segunda es `## Status`, y debajo, **palabra por palabra**, todo lo que el README de 122755a tenía bajo su `## Status`: desde la línea `Version 0.10.0: …` (línea 29) hasta «The first design is … is the current direction.» (línea 99), con las versiones 0.10.0, 0.9.1, 0.9, 0.8 y 0.7, el ensayo 3, los tres planes, el ensayo 1 con su tabla y el ensayo 2 con su tabla. Lo único que cambia es el destino de cada enlace, que no es externo ni una ancla: lleva `../` delante, porque la página está en `docs/` y los destinos eran desde la raíz (`](specs/002-quota-aware-lanes/spec.md)` pasa a `](../specs/002-quota-aware-lanes/spec.md)`). Las palabras no se tocan, las líneas `Version X.Y.Z: …` tampoco, y no se recorta nada.

**Tests (write first):**

Guarda esto fuera del repositorio como `changelog-check.js` y córrelo desde la raíz de tu worktree: `node changelog-check.js docs/changelog.md`. Falla mientras `docs/changelog.md` no exista.

```js
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

const old = execFileSync('git', ['show', '122755a:README.md'], { encoding: 'utf8' })
const from = old.indexOf('\n## Status\n') + '\n## Status\n'.length
const status = old.slice(from, old.indexOf('\n## How it works\n')).trim()
// Only the link targets change: each one that is not external and not an anchor gets "../".
const expected = status.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, '](../$1)')

const log = fs.readFileSync(process.argv[2], 'utf8')
const at = log.indexOf('\n## Status\n')
assert.ok(at >= 0, 'the changelog has ## Status')
assert.equal(log.slice(at + '\n## Status\n'.length).trim(), expected, "the Status section is the README's, word for word, with the targets prefixed by ../")
const unreleased = log.indexOf('\n## Unreleased\n')
assert.ok(unreleased >= 0 && unreleased < at, '## Unreleased comes before ## Status')
const entry = log.slice(unreleased, at)
for (const word of ['swarm', 'README', 'docs/guide/lanes.md', 'next release']) assert.ok(entry.includes(word), `the Unreleased entry says "${word}"`)
assert.ok(!/^Version \d/m.test(entry), 'the Unreleased entry has no Version X.Y.Z: line')
const manifest = JSON.parse(fs.readFileSync('plugins/aether/.claude-plugin/plugin.json', 'utf8'))
assert.equal(log.match(/^Version (\d+\.\d+\.\d+): /m)[1], manifest.version, "the first Version X.Y.Z: line is the manifest's")
console.log('changelog: ok')
```

Y la comprobación de página:

```json
{
  "page": "docs/changelog.md",
  "title": "Changelog",
  "order": 31,
  "headings": ["## Unreleased", "## Status"],
  "patterns": [
    { "source": "^Version 0\\.10\\.0: ", "flags": "m" },
    { "source": "^Version 0\\.9\\.1: ", "flags": "m" },
    { "source": "^Version 0\\.9: ", "flags": "m" }
  ],
  "required": [
    "docs/superpowers/specs/2026-10-09-lead-autonomy-design.md",
    "docs/superpowers/specs/2026-10-09-installable-plugin-design.md"
  ]
}
```

**Acceptance:**
- `changelog-check.js` sale con 0 y `changelog: ok`.
- La comprobación de página sale con 0 y `ok`.
- La primera línea que empieza con `Version X.Y.Z:` es `Version 0.10.0: …`, la del manifiesto.
- La entrada «Unreleased» es la de arriba, sin una palabra distinta.

### Task 11: Contribuir y la hoja de ruta (`docs/contributing.md`, `docs/roadmap.md`)

**Aether:**
- Tier: sonnet high — dos movimientos con correcciones de R12 que salen de leer el estado de 0.10.0; las pruebas fijan encabezados y cadenas
- Area: docs-history
- Owns: `docs/contributing.md`, `docs/roadmap.md`
- Depends on: none

**Interfaces:**

- **`docs/contributing.md`** (`title: Contributing`, `order: 30`, `# Contributing`): una introducción de una frase y, **exactos y en este orden**, `## Development` y `### Release`, con las líneas 371–391 del README: el párrafo del desarrollo y su comando `claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh`, los cuatro comandos de `npm`, el párrafo de Node.js 22 y `scripts/refresh-lanes.js`, y los seis pasos de «Release». R12 corrige el paso 1: sube `"version"` en `plugins/aether/.claude-plugin/plugin.json`, la versión que fija `tests/launcher.test.js`, la línea `Version X.Y.Z` del README y la primera línea `Version X.Y.Z:` de `docs/changelog.md`, y dice que `tests/docs-facts.test.js` comprueba las dos últimas. El enlace a [Methodology](methodology.md) y a [Changelog](changelog.md).
- **`docs/roadmap.md`** (`title: Roadmap`, `order: 32`, `# Roadmap`): las líneas 432–447: «Now», la hoja de ruta de RADAR, `**Effort.**` con sus cuatro viñetas, y «These are deferred until the trials justify them:» con su lista. R12 corrige «Now»: la línea `**Now:**` dice `version 0.10.0` y qué deja para el dueño, leído de `docs/handoff/2026-10-14-quota-lanes-0.10.0.md` (lo que 0.9 dejaba para el dueño ya se hizo o se movió, y la página dice cuál). Enlaces con rutas relativas: [la hoja de ruta de RADAR](roadmap/2026-10-10-radar.md), [la evaluación de los asientos](evaluations/seats/README.md), [las técnicas del ensayo 2](evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost), [el spec del esfuerzo por tarea](superpowers/specs/2026-10-08-effort-per-task-design.md).

Fuentes: `package.json` (los scripts), `tests/launcher.test.js`, `scripts/refresh-lanes.js` y `scripts/check-effort.js` (que existen y qué leen), `docs/handoff/2026-10-14-quota-lanes-0.10.0.md`, `docs/roadmap/2026-10-10-radar.md`, README de 122755a líneas 369–391 y 430–447.

**Tests (write first):**

```json
{
  "page": "docs/contributing.md",
  "title": "Contributing",
  "order": 30,
  "headings": ["## Development", "### Release"],
  "required": [
    "claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh",
    "claude plugin tag plugins/aether",
    "npm run check",
    "tests/docs-facts.test.js",
    "changelog.md"
  ]
}
```

```json
{
  "page": "docs/roadmap.md",
  "title": "Roadmap",
  "order": 32,
  "patterns": [{ "source": "^\\*\\*Now:\\*\\* .*version 0\\.10\\.0", "flags": "m" }],
  "required": [
    "**Effort.**",
    "These are deferred until the trials justify them:",
    "evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost",
    "roadmap/2026-10-10-radar.md"
  ]
}
```

**Acceptance:**
- Las dos comprobaciones de página salen con 0 y `ok`.
- La línea `**Now:**` no dice `version 0.9`, y el informe cita la línea del handoff que sostiene lo que dice.
- Los cuatro comandos de `npm` son los de `package.json` y el informe lo comprueba.
- Cada paso de «Release» es ejecutable tal como está escrito, o la corrección está nombrada.

### Task 12: El índice por público (`docs/index.md`)

**Aether:**
- Tier: sonnet high — una página de enlaces que cubre todo lo que R9 nombra; docs-facts la comprueba, y describir cada una en una línea es lectura
- Area: docs-history
- Owns: `docs/index.md`
- Depends on: none

**Interfaces:**

Archivo `docs/index.md`, front matter `title: Aether documentation`, `order: 0`, `# Aether documentation` y una frase de qué hay aquí, con el enlace al [README](../README.md). Luego estos encabezados de nivel 2, exactos y en este orden, cada uno con una lista de enlaces, **una línea cada uno**, `[nombre](ruta): lo que hay allí`:

```text
## If you just installed Aether
## If you use Aether
## If you contribute
## The design record
```

- **If you just installed Aether:** `getting-started.md`, `purpose.md`, `methodology.md`.
- **If you use Aether:** `guide/options.md`, `guide/lanes.md`, `guide/design-seats.md`, `guide/autonomy.md`, `guide/ops.md`, `guide/maintenance.md`, `guide/troubleshooting.md`, `reference/components.md`.
- **If you contribute:** `contributing.md`, `changelog.md`, `roadmap.md`.
- **The design record:** los documentos que el README de 122755a enlazaba bajo «Documentation», con su línea cada uno (líneas 395–402), y dos más (R9): `roadmap/2026-10-10-radar.md`, `superpowers/specs/2026-10-07-aether-plugin-design.md`, `superpowers/specs/`, `superpowers/plans/`, `evaluations/`, `claude-code-research.md`, `decisions.md` (R12: «D1–D15 … and A1–A49», no A1–A43), `../specs/001-design-seats/spec.md` y `../specs/001-design-seats/plan.md`, `evaluations/seats/README.md`, `aether-retrospective.md`, `models/README.md` (el índice de modelos) y `issues/`.

Cada línea dice lo que hay en el documento, sacado del documento mismo (ábrelo y léelo; no copies la descripción del README si el documento cambió).

**Tests (write first):**

```json
{
  "page": "docs/index.md",
  "title": "Aether documentation",
  "order": 0,
  "headings": ["## If you just installed Aether", "## If you use Aether", "## If you contribute", "## The design record"],
  "patterns": [{ "source": "A1–A49", "flags": "" }],
  "required": [
    "(getting-started.md)", "(purpose.md)", "(methodology.md)",
    "(guide/options.md)", "(guide/lanes.md)", "(guide/design-seats.md)", "(guide/autonomy.md)", "(guide/ops.md)",
    "(guide/maintenance.md)", "(guide/troubleshooting.md)", "(reference/components.md)",
    "(contributing.md)", "(changelog.md)", "(roadmap.md)",
    "(roadmap/2026-10-10-radar.md)", "(superpowers/specs/2026-10-07-aether-plugin-design.md)", "(superpowers/specs/)",
    "(superpowers/plans/)", "(evaluations/)", "(claude-code-research.md)", "(decisions.md)",
    "(../specs/001-design-seats/spec.md)", "(evaluations/seats/README.md)", "(aether-retrospective.md)",
    "(models/README.md)", "(issues/)"
  ]
}
```

**Acceptance:**
- La comprobación de página sale con 0 y `ok`.
- Cada página que esta spec crea tiene una línea, y cada documento que el README de 122755a enlazaba bajo «Documentation» sigue enlazado.
- Nada dice `A1–A43`.
- La página no repite el historial de nadie: solo enlaza.

### Task 13: Las tres pruebas que leen el README leen el README y las páginas

**Aether:**
- Tier: sonnet xhigh — tres archivos de pruebas con una veintena de ediciones, donde ninguna aserción puede borrarse ni debilitarse
- Review: xhigh — R13: el supervisor compara aserción por aserción contra el original; una cadena que se busca en menos sitio, o un encabezado que ya no se exige, pasa los tests y rompe el contrato
- Area: tests
- Owns: `tests/launcher.test.js`, `tests/lanes-docs.test.js`, `tests/start-command.test.js`
- Depends on: Task 1 — `docs/getting-started.md` es la página de `### Requirements`, `### Install` y `### Start`
- Depends on: Task 2 — `docs/guide/troubleshooting.md` está en la lista de páginas que se lee
- Depends on: Task 3 — `docs/purpose.md` tiene los cinco objetivos de RADAR
- Depends on: Task 4 — `docs/methodology.md` tiene `**The three paths.**`
- Depends on: Task 5 — `docs/guide/options.md` tiene `### Options` y `### What you set yourself`
- Depends on: Task 6 — `docs/guide/lanes.md` tiene `### Lanes`
- Depends on: Task 7 — `design-seats.md`, `autonomy.md` y `ops.md` tienen `### Design seats` y `### Autonomy`
- Depends on: Task 8 — `docs/guide/maintenance.md` tiene `### Upgrading from 0.6` y los datos
- Depends on: Task 9 — `docs/reference/components.md` tiene la fila de `aether-autonomy`
- Depends on: Task 10 — `docs/changelog.md` tiene las líneas `Version X.Y.Z: `
- Depends on: Task 11 — `docs/contributing.md` tiene `## Development` y `### Release`
- Depends on: Task 12 — `docs/index.md` está en la lista de páginas que se lee

**Interfaces:**

Sin cambios en los hechos que se comprueban: solo de dónde leen (R13). En cada archivo, una lista `DOC_FILES` (R13 no deja tocar `tests/helpers.js`; la lista se repite en los tres, en este orden) y lo que sigue. Las aserciones sobre un encabezado o una sección leen la página que lo conserva, con el mismo `section()` de antes; las cadenas que se buscaban en el README se buscan en `docs()`, el README y las páginas como un texto.

**Tests (write first):**

Los cambios, como diff sobre cada archivo. Todas las aserciones que no aparecen en el diff quedan como están. **Ninguna aserción se borra** y ningún predicado se debilita.

`tests/launcher.test.js`:

```diff
@@ -9,6 +9,18 @@
 const ROOT = path.join(__dirname, '..')
 const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')
 
+// Spec 004: the README is the way in, and what it used to hold lives in the pages of docs/. `docs()` is the README
+// and those pages as one text, for an assertion that looks for a string anywhere; an assertion about a heading or a
+// section reads the page that keeps it (`page()`).
+const DOC_FILES = [
+  'README.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/guide/options.md',
+  'docs/guide/lanes.md', 'docs/guide/design-seats.md', 'docs/guide/autonomy.md', 'docs/guide/ops.md',
+  'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md', 'docs/reference/components.md', 'docs/changelog.md',
+  'docs/contributing.md', 'docs/roadmap.md', 'docs/index.md',
+]
+const page = (file) => read(...file.split('/'))
+const docs = () => DOC_FILES.map(page).join('\n')
+
 test('the documents record the lanes: decisions, facts, and the skills that use them', () => {
   const decisions = read('docs', 'decisions.md')
   for (const id of ['A20', 'A21', 'A22']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
@@ -22,28 +34,28 @@
   }
   const swarm = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
   for (const text of ['--no-lanes', 'laneFailure', '`aether-lane`', 'Blocked by a lane']) assert.ok(swarm.includes(text), text)
-  assert.match(read('README.md'), /^### Lanes$/m)
-  assert.match(read('README.md'), /^Version 0\.9: /m)
+  assert.match(page('docs/guide/lanes.md'), /^### Lanes$/m)
+  assert.match(page('docs/changelog.md'), /^Version 0\.9: /m)
 })
 
 test('the documents record the autonomy: decisions, the README, and no per-stage gates', () => {
   const decisions = read('docs', 'decisions.md')
   for (const id of ['A23', 'A24', 'A25']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
   assert.match(decisions, /\*\*Update \(2026-10-09, autonomy\)\.\*\*/)
-  const readme = read('README.md')
-  assert.match(readme, /^### Autonomy$/m)
-  assert.ok(readme.includes('| `aether-autonomy` |'))
+  const readme = docs()
+  assert.match(page('docs/guide/autonomy.md'), /^### Autonomy$/m)
+  assert.ok(page('docs/reference/components.md').includes('| `aether-autonomy` |'))
   assert.ok(readme.includes('docs/superpowers/specs/2026-10-09-lead-autonomy-design.md'))
   assert.doesNotMatch(readme, /approves the spec and the plan/)
   assert.doesNotMatch(readme, /the relay of both sides/)
 })
 
-const README = () => read('README.md')
+const README = docs
 
-// A README section: from its heading to the next heading of level 2 or 3.
+// A section of a page: from its heading to the next heading of level 2 or 3.
 function section(text, heading) {
   const start = text.indexOf(`\n${heading}\n`)
-  assert.ok(start >= 0, `the README has ${heading}`)
+  assert.ok(start >= 0, `the page has ${heading}`)
   const rest = text.slice(start + heading.length + 2)
   const end = rest.search(/\n##+ /)
   return end < 0 ? rest : rest.slice(0, end)
@@ -75,24 +87,28 @@
   for (const line of lines) assert.ok(readme.includes(line), line)
 })
 
-test('the guide has its parts in order', () => {
-  const readme = README()
-  const headings = [
-    '## Use Aether mode', '### Requirements', '### Install', '### Start', '### Options', '### What you set yourself',
-    '### Platforms', '### Update, pin, roll back and uninstall', '### Data', '### Upgrading from 0.6', '## Development', '### Release',
+test('the guide has its parts in order, each page keeping its own in their order', () => {
+  // The twelve headings of the guide, in their old order, with the page that keeps each now.
+  const parts = [
+    ['## Use Aether mode', 'docs/getting-started.md'], ['### Requirements', 'docs/getting-started.md'],
+    ['### Install', 'docs/getting-started.md'], ['### Start', 'docs/getting-started.md'],
+    ['### Options', 'docs/guide/options.md'], ['### What you set yourself', 'docs/guide/options.md'],
+    ['### Platforms', 'docs/guide/maintenance.md'], ['### Update, pin, roll back and uninstall', 'docs/guide/maintenance.md'],
+    ['### Data', 'docs/guide/maintenance.md'], ['### Upgrading from 0.6', 'docs/guide/maintenance.md'],
+    ['## Development', 'docs/contributing.md'], ['### Release', 'docs/contributing.md'],
   ]
-  let at = -1
-  for (const h of headings) {
-    const i = readme.indexOf(`\n${h}\n`)
-    assert.ok(i > at, `${h} comes after the part before it`)
-    at = i
+  const at = {}
+  for (const [h, file] of parts) {
+    const i = page(file).indexOf(`\n${h}\n`)
+    assert.ok(i >= 0, `${file} has ${h}`)
+    assert.ok(i > (at[file] ?? -1), `${h} comes after the part before it in ${file}`)
+    at[file] = i
   }
 })
 
 test('only "Upgrading from 0.6" names the old launcher, installer and data directory', () => {
-  const readme = README()
-  const upgrading = section(readme, '### Upgrading from 0.6')
-  const rest = readme.replace(upgrading, '')
+  const upgrading = section(page('docs/guide/maintenance.md'), '### Upgrading from 0.6')
+  const rest = README().replace(upgrading, '')
   for (const old of ['aether-mode', 'aether-install', '.local/share/aether-plugin']) assert.ok(!rest.includes(old), old)
   for (const text of ['"source": "git"', '"url": "file://', '"ref": "aether--v0.7.0"', 'claude plugin install aether@aether-plugin --config lanes=true', '/advisor off']) {
     assert.ok(upgrading.includes(text), text)
@@ -132,7 +148,7 @@
   for (const text of ['**Rápido**', '**Autónomo**', '**Delegación**', '**Asequible**', '**Robusto**', '`aether:writer`', '`aether:judge`', 'specs/NNN-<topic>/', 'AETHER_IRREVERSIBLE=enforce', '`harnesses`']) {
     assert.ok(readme.includes(text), text)
   }
-  assert.ok(!section(readme, '### Requirements').includes('superpowers'))
+  assert.ok(!section(page('docs/getting-started.md'), '### Requirements').includes('superpowers'))
   assert.ok(!readme.includes('aether:designer'))
 })
 
@@ -166,7 +182,7 @@
   const decisions = read('docs', 'decisions.md')
   for (let n = 39; n <= 43; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
   const readme = README()
-  assert.match(readme, /^### Design seats$/m)
+  assert.match(page('docs/guide/design-seats.md'), /^### Design seats$/m)
   for (const text of ['`aether:examiner`', '`aether-lane seat`', '`aether-exam`', '`seats`, `balanced` by default', 'docs/evaluations/seats/README.md', 'specs/001-design-seats/spec.md', 'Fable']) {
     assert.ok(readme.includes(text), text)
   }
@@ -194,7 +210,7 @@
   }
   assert.match(decisions, /^\*\*Update \(2026-10-14, super Lead; D5 updated by A48\)\.\*\*/m)
   const readme = README()
-  assert.match(readme, /^\*\*The three paths\.\*\*/m)
+  assert.match(page('docs/methodology.md'), /^\*\*The three paths\.\*\*/m)
   for (const text of ['**Direct:**', '**Delegate task:**', '**Swarm:**', 'the route and the path (direct, delegate task, swarm)', 'a delegate task on a model it names, or the swarm']) {
     assert.ok(readme.includes(text), text)
   }
```

Quedan igual, y leen `README()` (ahora el conjunto): las cadenas de `launcher.test.js:55–74` (instalación y arranque), `:116–118` (`Version 0.10.0: `, `Version 0.9.1: ` y `Version 0.9: `), `:132–134` (RADAR, `aether:writer`, `aether:judge`, `specs/NNN-<topic>/`, `AETHER_IRREVERSIBLE=enforce`, `` `harnesses` ``), `:136` (`aether:designer`), `:170–171` (seats), `:198–203` (las tres rutas y las cuatro cadenas prohibidas de «Sonnet»). Los títulos de las pruebas que dicen «the README» pueden pasar a decir «the documents»; ninguna otra cosa de ellos cambia.

`tests/lanes-docs.test.js`:

```diff
@@ -14,13 +14,26 @@
 
 const ROOT = path.join(__dirname, '..')
 const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')
+// Spec 004: the README is the way in, and the guide to lanes lives in docs/. `docs()` is the README and the pages of
+// R3 to R9 as one text, for the strings that were once searched in the README alone.
+const DOC_FILES = [
+  'README.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/guide/options.md',
+  'docs/guide/lanes.md', 'docs/guide/design-seats.md', 'docs/guide/autonomy.md', 'docs/guide/ops.md',
+  'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md', 'docs/reference/components.md', 'docs/changelog.md',
+  'docs/contributing.md', 'docs/roadmap.md', 'docs/index.md',
+]
+const docs = () => DOC_FILES.map((file) => read(...file.split('/'))).join('\n')
 const includesAll = (text, phrases, where) => {
   for (const phrase of phrases) assert.ok(text.includes(phrase), `${where} lacks: ${phrase}`)
 }
 
-test("the README's Lanes section explains the order of the candidates, the dry marks, the kept readings and what the report shows", () => {
-  const readme = read('README.md')
-  const section = readme.slice(readme.indexOf('### Lanes'), readme.indexOf('### Design seats'))
+test("the Lanes section of the guide explains the order of the candidates, the dry marks, the kept readings and what the report shows", () => {
+  const page = read('docs', 'guide', 'lanes.md')
+  assert.ok(page.includes('\n### Lanes\n'), 'the Lanes page has ### Lanes')
+  const start = page.indexOf('### Lanes')
+  const rest = page.slice(start + '### Lanes'.length)
+  const end = rest.search(/\n##+ /)
+  const section = end < 0 ? rest : rest.slice(0, end)
   assert.ok(section.length > 1000)
   includesAll(
     section,
@@ -37,12 +50,12 @@
       '`lanes.run.choices`',
       '`aether-lane status <run>`',
     ],
-    'the README Lanes section',
+    'the Lanes section of the guide',
   )
 })
 
-test("the README says that Grok's quota is read over ACP with its UI as the fallback, who refreshes it, and how to add a harness with its reader", () => {
-  const readme = read('README.md')
+test("the documents say that Grok's quota is read over ACP with its UI as the fallback, who refreshes it, and how to add a harness with its reader", () => {
+  const readme = docs()
   includesAll(
     readme,
     [
@@ -58,26 +71,26 @@
       "`quotaCost: 'process'`",
       'or `unknown` when it cannot read them',
     ],
-    'the README',
+    'the documents',
   )
 })
 
 test('the documents do not call the reader of Grok provisional any more', () => {
   // The README before spec 002 (9f0370c) said "Grok's is interim, until another method turns up".
   const stopgap = /provisional|interim|until another method/i
-  for (const file of [['README.md'], ['docs', 'decisions.md']]) assert.ok(!stopgap.test(read(...file).split('\n').filter((line) => /grok/i.test(line) && /quota|reader/i.test(line)).join('\n')), file.join('/'))
+  for (const [name, text] of [['the README and the pages', docs()], ['docs/decisions.md', read('docs', 'decisions.md')]]) assert.ok(!stopgap.test(text.split('\n').filter((line) => /grok/i.test(line) && /quota|reader/i.test(line)).join('\n')), name)
   assert.ok(stopgap.test("Grok's is interim, until another method turns up"))
 })
 
-test("the lengths the README gives are the table's: 10 minutes for agy, 30 for grok, 60 for a dry mark", () => {
+test("the lengths the documents give are the table's: 10 minutes for agy, 30 for grok, 60 for a dry mark", () => {
   const config = lanes.loadConfig(lanes.CONFIG_FILE)
   assert.deepEqual([config.harnesses.agy.quotaLifeMinutes, config.harnesses.grok.quotaLifeMinutes, config.dryMarkMinutes, config.reserve], [10, 30, 60, 0.05])
-  includesAll(read('README.md'), ['(`quotaLifeMinutes`: 10 minutes)', 'a finished agy call and `aether-lane quota` take a fresh reading', 'its 30 minutes (`quotaLifeMinutes`)', 'otherwise for 60 minutes (`dryMarkMinutes`)', 'above a 5% reserve (`reserve` in the table)'], 'the README')
+  includesAll(docs(), ['(`quotaLifeMinutes`: 10 minutes)', 'a finished agy call and `aether-lane quota` take a fresh reading', 'its 30 minutes (`quotaLifeMinutes`)', 'otherwise for 60 minutes (`dryMarkMinutes`)', 'above a 5% reserve (`reserve` in the table)'], 'the documents')
 })
 
-test("the limits the README gives for Grok's reading are the code's: 10 seconds over ACP, 20 for the UI, 30 minutes before a log line is stale", () => {
+test("the limits the documents give for Grok's reading are the code's: 10 seconds over ACP, 20 for the UI, 30 minutes before a log line is stale", () => {
   assert.deepEqual([ACP_TIMEOUT_MS, TIMEOUT_MS, STALE_MS], [10000, 20000, 30 * 60 * 1000])
-  includesAll(read('README.md'), [`(${ACP_TIMEOUT_MS / 1000} seconds at most)`, `for a few seconds (${TIMEOUT_MS / 1000} at most)`, `they call it stale after ${STALE_MS / 60000} minutes`], 'the README')
+  includesAll(docs(), [`(${ACP_TIMEOUT_MS / 1000} seconds at most)`, `for a few seconds (${TIMEOUT_MS / 1000} at most)`, `they call it stale after ${STALE_MS / 60000} minutes`], 'the documents')
 })
 
 test('the swarm skill and the brief name the order, the balance of each group and the choices of the run', () => {
```

`tests/start-command.test.js`:

```diff
@@ -77,13 +77,18 @@
   assert.deepEqual(argsOf(r), [...OWN_ARGS, '--version'])
 })
 
-test('the README shows the same settings as the launcher, and the launcher\'s name', () => {
-  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
-  assert.ok(readme.includes(`--settings '${SETTINGS}'`), 'the README names the settings the launcher passes')
-  assert.ok(readme.includes('scripts/aether-lead'), 'the README names the launcher')
-  const start = readme.slice(readme.indexOf('### Start'), readme.indexOf('### What Aether adds'))
+test('the documents show the same settings as the launcher, and the launcher\'s name', () => {
+  // Spec 004: the README is the way in; the complete start is in the getting-started guide.
+  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'getting-started.md'), 'utf8')
+  const readme = [fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), guide].join('\n')
+  assert.ok(readme.includes(`--settings '${SETTINGS}'`), 'the documents name the settings the launcher passes')
+  assert.ok(readme.includes('scripts/aether-lead'), 'the documents name the launcher')
+  assert.ok(guide.includes('\n### Start\n'), 'the guide has ### Start')
+  const rest = guide.slice(guide.indexOf('### Start') + '### Start'.length)
+  const end = rest.search(/\n##+ /)
+  const start = end < 0 ? rest : rest.slice(0, end)
   for (const text of ['--permission-mode bypassPermissions', 'AETHER_IRREVERSIBLE=enforce', 'AETHER_IRREVERSIBLE=log aether-lead']) {
-    assert.ok(start.includes(text), `the README's Start says the launcher's ${text}`)
+    assert.ok(start.includes(text), `the guide's Start says the launcher's ${text}`)
   }
   assert.ok(fs.readFileSync(LAUNCHER, 'utf8').includes(SETTINGS), 'the launcher carries them')
 })
```

**Acceptance:**
- `node --test tests/launcher.test.js tests/lanes-docs.test.js tests/start-command.test.js` pasa, y `npm test` pasa.
- **Sin el README:** quita `'README.md'` de `DOC_FILES` en `launcher.test.js` y en `lanes-docs.test.js`, y la lectura de `README.md` en la lista de dos de `start-command.test.js` (solo en tu copia de trabajo, sin commitearlo), corre los tres archivos otra vez y todo pasa; después restáuralo. Eso prueba que las páginas llevan todo lo que el README llevaba, antes de que la Task 16 lo reduzca. Si una cadena o un encabezado falta, **no edites una página** (no son tuyas): informa `blocked` con el nombre de lo que falta y de la página que debía tenerlo.
- El informe lista, por archivo, cada aserción que cambió (línea y antes/después) y confirma que el número de aserciones (`assert.*`) de cada archivo es el de antes o mayor: las tres aserciones de existencia que el diff añade lo suben, y ninguna lo baja.
- Ninguna otra cosa de los tres archivos cambió, y `git diff` solo toca esos tres.

### Task 14: La frase de la skill `swarm` y la prueba que la fija

**Aether:**
- Tier: haiku high — una frase exacta, en dos archivos, que la prueba existente fija entera
- Area: tests
- Owns: `plugins/aether/skills/swarm/SKILL.md`, `tests/roles.test.js`
- Depends on: Task 6 — la frase nombra `docs/guide/lanes.md`, que tiene que existir cuando la frase se fusione

**Interfaces:**

En los dos archivos, la misma subcadena exacta cambia, y solo ella. De:

```text
(the README's Lanes section has the rule)
```

a:

```text
(`docs/guide/lanes.md` has the rule)
```

En `plugins/aether/skills/swarm/SKILL.md` está en la viñeta `- **Lanes.**` de §1 (línea 28). En `tests/roles.test.js` está dentro de la cadena `lanes` de la prueba «the swarm checks for the Workflow tool, and runs lanes only with the option on» (línea 52). Es **un** cambio en **un** commit: la prueba compara la viñeta entera.

**Tests (write first):**

La prueba es la que ya existe, con su cadena cambiada: cambia primero `tests/roles.test.js` y verifica que `node --test tests/roles.test.js` falla en «the swarm checks for the Workflow tool, and runs lanes only with the option on»; después cambia la skill y verifica que pasa.

```text
antes:   … each call to the candidate whose quota is most at risk of being lost first (the README's Lanes section has the rule). …
después: … each call to the candidate whose quota is most at risk of being lost first (`docs/guide/lanes.md` has the rule). …
```

**Acceptance:**
- `node --test tests/roles.test.js` y `npm test` pasan.
- `git diff` muestra una línea cambiada en cada archivo, y en cada una solo la subcadena de arriba.
- La skill sigue sin nombrar `aether-mode`, `fish` ni `.local/share` (una prueba de `launcher.test.js` lo exige de todo el plugin).

### Task 15: La prueba de hechos (`tests/docs-facts.test.js`)

**Aether:**
- Tier: sonnet xhigh — un archivo de pruebas que lee Markdown con reglas de extracción, y que tiene que pasar sobre el árbol real
- Review: xhigh — entrada que las pruebas no listan: un enlace con ancla de un encabezado con acentos, un bloque de código, un comentario HTML; y el sistema de archivos
- Area: tests
- Owns: `tests/docs-facts.test.js`
- Depends on: Task 1 — `docs/getting-started.md` es una de las páginas que lee
- Depends on: Task 2 — `docs/guide/troubleshooting.md` es una de las páginas que lee
- Depends on: Task 3 — `docs/purpose.md` es una de las páginas que lee
- Depends on: Task 4 — `docs/methodology.md` es una de las páginas que lee
- Depends on: Task 5 — `docs/guide/options.md` tiene la tabla que compara con el manifiesto
- Depends on: Task 6 — `docs/guide/lanes.md` es una de las páginas que lee
- Depends on: Task 7 — `design-seats.md`, `autonomy.md` y `ops.md` son páginas que lee
- Depends on: Task 8 — `docs/guide/maintenance.md` es una de las páginas que lee
- Depends on: Task 9 — `docs/reference/components.md` tiene el conteo de `bin/`
- Depends on: Task 10 — `docs/changelog.md` tiene la primera línea `Version X.Y.Z:`
- Depends on: Task 11 — `docs/contributing.md` y `docs/roadmap.md` (la línea «Now») son páginas que lee
- Depends on: Task 12 — `docs/index.md` tiene que enlazar cada página

**Interfaces:**

Un archivo, `tests/docs-facts.test.js`: CommonJS con `'use strict'`, `node:test`, sin dependencias, estilo del resto de `tests/` (dos espacios, sin punto y coma). Empieza con un comentario que **declara** la regla de extracción y la lista de excepciones (R11). Define:

```js
const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
const README = 'README.md'
const PAGES = [ /* the 15 pages, relative to ROOT, in this order: */
  'docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/guide/options.md',
  'docs/guide/lanes.md', 'docs/guide/design-seats.md', 'docs/guide/autonomy.md', 'docs/guide/ops.md',
  'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md', 'docs/reference/components.md', 'docs/changelog.md',
  'docs/contributing.md', 'docs/roadmap.md',
]
const FILES = [README, ...PAGES]
const EXCEPTIONS = {          // commands that are not files of plugins/aether/bin/, each with its reason
  'aether-lead': 'the launcher lives in scripts/, not in plugins/aether/bin/',
  'aether-plugin': "the marketplace's and the repository's name",
  'aether-aether-plugin': "the plugin's data directory",
  'aether-inline': 'the data directory of a --plugin-dir session',
  'aether-mode': 'the 0.6 launcher, named as retired',
}
const PATH_EXCEPTIONS = { 'scripts/aether-install.js': 'the 0.6 installer, named as retired in "Upgrading from 0.6"' }
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const manifest = () => JSON.parse(read('plugins/aether/.claude-plugin/plugin.json'))
```

y estas funciones, locales al archivo, con estos nombres, firmas y comportamiento:

| Función | Firma | Qué hace |
|---|---|---|
| `parseFrontMatter` | `(text: string) => { title: string, description: string, order: number } \| null` | lee el bloque entre `---` al principio; `null` si falta, si no tiene **exactamente** las claves `title`, `description` y `order`, si alguna línea no es `clave: valor`, si `title` o `description` están vacíos o si `order` no es un entero |
| `codeSpans` | `(text: string) => string[]` | el contenido de cada par de acentos graves simples en una línea, fuera de bloques cercados (de tres o más acentos graves o `~`) y fuera de comentarios HTML |
| `commandsIn` | `(text: string) => string[]` | de cada `codeSpans`, sin espacios en los bordes, el primer token cuando el fragmento es `aether-<nombre>` solo o seguido de un espacio y sus argumentos (`^aether-[a-z0-9-]+( .*)?$`) y **no** contiene `@`, `/` ni `--v` |
| `pluginNamesIn` | `(text: string) => string[]` | de cada fragmento de `codeSpans`, cada `<nombre>` de `aether:<nombre>` (`\baether:([a-z][a-z0-9-]*)`); `aether:<name>` no cuenta |
| `anchorsIn` | `(text: string) => Set<string>` | el ancla de cada encabezado `#`…`######` fuera de bloques cercados, como la calcula GitHub: minúsculas, se quitan los acentos graves y el texto de un enlace queda, se quita la puntuación salvo `-` y `_`, los espacios pasan a `-`; el segundo encabezado igual lleva `-1`, el tercero `-2` |
| `linksIn` | `(text: string) => { target: string, line: number }[]` | cada `[texto](destino)` o `![alt](destino)` en línea, fuera de fragmentos de código, bloques cercados y comentarios HTML, con `line` 1-based; omite los destinos que empiezan con `http:`, `https:` o `mailto:`; un título entre comillas después del destino se ignora |
| `optionsTable` | `(text: string) => Record<string, boolean \| string>` | la primera tabla cuya cabecera tiene `Option` y `Default` como primera y segunda celda (sin importar mayúsculas); cada fila con la primera celda `` `nombre` `` da `nombre` → `true` si la segunda es `on`, `false` si es `off`, o la cadena si va entre acentos graves; la tabla termina en la primera línea que no empieza con `|` |
| `repeatedDefaults` | `(text: string) => { option: string, value: boolean \| string, line: number }[]` | cada ocurrencia de `` `opción`, on by default ``, `` `opción`, off by default `` o `` `opción`, `valor` by default `` (R6), fuera de bloques cercados |

**Tests (write first):**

Las pruebas, completas. Las escribes en el archivo antes que las funciones (rojas: las funciones no existen), implementas las funciones, y el archivo pasa sobre el árbol:

```js
// ---- the rule, proved on small inputs
test('front matter: title, description and an integer order, and nothing else', () => {
  assert.deepEqual(parseFrontMatter('---\ntitle: A\ndescription: B, c\norder: 3\n---\n\n# A\n'), { title: 'A', description: 'B, c', order: 3 })
  assert.equal(parseFrontMatter('# A\n'), null)
  assert.equal(parseFrontMatter('---\ntitle: A\ndescription: B\n---\n'), null)
  assert.equal(parseFrontMatter('---\ntitle: A\ndescription: B\norder: x\n---\n'), null)
  assert.equal(parseFrontMatter('---\ntitle: A\ndescription: B\norder: 1\nlayout: x\n---\n'), null)
})

test('commands: an aether-* code span in position, alone or with arguments; not paths, marketplaces, tags or fences', () => {
  const text = [
    'Run `aether-plan check` and `aether-lane quota [<harness>...] [--refresh]`.',
    'Not these: `scripts/aether-lead`, `aether@aether-plugin`, `aether--v0.7.0`, `aether-lead --version`, `.aether-exam/`.',
    '```',
    '`aether-fenced`',
    '```',
    '<!-- `aether-hidden` -->',
  ].join('\n')
  assert.deepEqual(commandsIn(text), ['aether-plan', 'aether-lane'])
})

test('plugin names: aether:<name> inside a code span', () => {
  assert.deepEqual(pluginNamesIn('Use `aether:judge`, `/aether:run` and `claude --agent aether:lead --effort xhigh`; `aether:<name>` is a pattern; aether:prose is not read.'), ['judge', 'run', 'lead'])
})

test('anchors follow GitHub: lowercase, no punctuation, spaces to hyphens, repeats numbered, fences skipped', () => {
  const text = '# Title\n\n## Update, pin, roll back and uninstall\n\n### `aether-lane` seat\n\n## Principles\n\n## Principles\n\n```\n## Not a heading\n```\n'
  assert.deepEqual([...anchorsIn(text)].sort(), ['aether-lane-seat', 'principles', 'principles-1', 'title', 'update-pin-roll-back-and-uninstall'])
})

test('links: inline links and images to files and anchors; not external links, code spans, comments or fences', () => {
  const text = 'See [a](guide/lanes.md#lanes), [b](#start), ![c](assets/x.gif), [d](https://example.com/x), [e](mailto:a@b.c) and `[f](nope.md)`.\n\n<!-- hero: ![g](assets/hero.gif) -->\n\n```\n[h](nope.md)\n```\n'
  assert.deepEqual(linksIn(text).map((link) => link.target), ['guide/lanes.md#lanes', '#start', 'assets/x.gif'])
})

test('options: the rows of the table headed Option and Default; on and off are booleans, a backticked value a string', () => {
  const table = ['| Option | Default | Set it | What it does |', '|---|---|---|---|', '| `lanes` | off | a | b |', '| `harnesses` | `agy` | a | b |', '| `ops` | on | a | b |', '', 'after the table'].join('\n')
  assert.deepEqual(optionsTable(table), { lanes: false, harnesses: 'agy', ops: true })
})

test('repeated defaults: only the form of R6, `option`, value by default', () => {
  const text = 'The `lanes`, off by default, and `harnesses`, `agy` by default; `ops`, on by default. Not `seats` by default. `seats`, `robust` by default.'
  assert.deepEqual(repeatedDefaults(text).map(({ option, value }) => [option, value]), [['lanes', false], ['harnesses', 'agy'], ['ops', true], ['seats', 'robust']])
})

// ---- the tree
const bins = () => new Set(fs.readdirSync(path.join(PLUGIN, 'bin')))
const defaults = () => Object.fromEntries(Object.entries(manifest().userConfig).map(([name, option]) => [name, option.default]))

test('R3 to R9: every page exists and starts with title, description and an integer order', () => {
  for (const rel of PAGES) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} exists`)
    assert.ok(parseFrontMatter(read(rel)), `${rel} starts with title, description and an integer order, and no other key`)
  }
})

test('R10: every internal link of the README and the pages is relative and resolves, anchors included', () => {
  for (const rel of FILES) {
    for (const { target, line } of linksIn(read(rel))) {
      const where = `${rel}:${line} -> ${target}`
      assert.ok(!target.startsWith('/'), `${where} is not relative`)
      const [file, anchor] = target.split('#')
      const full = file ? path.resolve(ROOT, path.dirname(rel), decodeURI(file)) : path.resolve(ROOT, rel)
      assert.ok(full === ROOT || full.startsWith(ROOT + path.sep), `${where} leaves the repository`)
      assert.ok(fs.existsSync(full), `${where} does not resolve`)
      if (anchor) {
        assert.ok(full.endsWith('.md') && fs.statSync(full).isFile(), `${where}: an anchor needs a Markdown file`)
        assert.ok(anchorsIn(fs.readFileSync(full, 'utf8')).has(decodeURIComponent(anchor)), `${where}: no heading has that anchor`)
      }
    }
  }
})

test('C5: docs/index.md links every other page, and every document the README listed under Documentation', () => {
  const linked = new Set(
    linksIn(read('docs/index.md')).map(({ target }) => path.relative(ROOT, path.resolve(ROOT, 'docs', target.split('#')[0])).split(path.sep).join('/')),
  )
  for (const rel of PAGES) if (rel !== 'docs/index.md') assert.ok(linked.has(rel), `docs/index.md links ${rel}`)
  const listed = [
    'docs/roadmap/2026-10-10-radar.md', 'docs/superpowers/specs/2026-10-07-aether-plugin-design.md', 'docs/superpowers/specs',
    'docs/superpowers/plans', 'docs/evaluations', 'docs/claude-code-research.md', 'docs/decisions.md',
    'docs/evaluations/seats/README.md', 'docs/aether-retrospective.md', 'docs/models/README.md', 'docs/issues',
  ]
  for (const rel of listed) assert.ok(linked.has(rel), `docs/index.md links ${rel}`)
  assert.ok([...linked].some((rel) => rel.startsWith('specs/001-design-seats')), 'docs/index.md links specs/001-design-seats/')
})

test('R11: every aether-* command in position is a file of plugins/aether/bin/ or a listed exception', () => {
  for (const name of Object.keys(EXCEPTIONS)) assert.ok(!bins().has(name), `${name} is a bin, so it is not an exception`)
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'aether-lead')), 'scripts/aether-lead exists')
  for (const rel of FILES) {
    for (const name of commandsIn(read(rel))) {
      assert.ok(bins().has(name) || name in EXCEPTIONS, `${rel} names \`${name}\`, which is not in plugins/aether/bin/ and not an exception`)
    }
  }
})

test('R11: every aether:<name> is an agent, a skill or aether:run', () => {
  const known = new Set([
    ...fs.readdirSync(path.join(PLUGIN, 'agents')).filter((file) => file.endsWith('.md')).map((file) => file.replace(/\.md$/, '')),
    ...fs.readdirSync(path.join(PLUGIN, 'skills')),
    'run',
  ])
  for (const rel of FILES) {
    for (const name of pluginNamesIn(read(rel))) assert.ok(known.has(name), `${rel} names aether:${name}, which is no agent, skill or aether:run`)
  }
})

test("R11: the options table of docs/guide/options.md is the manifest's userConfig, option by option and default by default", () => {
  assert.deepEqual(optionsTable(read('docs/guide/options.md')), defaults())
})

test("R6: no page repeats, in the form of R6, a default that is not the manifest's", () => {
  let seen = 0
  for (const rel of FILES) {
    for (const { option, value, line } of repeatedDefaults(read(rel))) {
      if (!(option in defaults())) continue
      seen++
      assert.equal(value, defaults()[option], `${rel}:${line} gives ${JSON.stringify(value)} as the default of \`${option}\`; the manifest's is ${JSON.stringify(defaults()[option])}`)
    }
  }
  assert.ok(seen > 0, 'the pages repeat at least one default in the form of R6, so the rule reads something')
})

test("R11: the README's Version line and the changelog's first Version line are the manifest's", () => {
  const readme = read(README).match(/^Version (\d+\.\d+\.\d+)\b/m)
  assert.ok(readme, 'the README has a line that starts with Version X.Y.Z')
  assert.equal(readme[1], manifest().version, "the README's Version line")
  const changelog = read('docs/changelog.md').match(/^Version (\d+\.\d+\.\d+): /m)
  assert.ok(changelog, 'docs/changelog.md has a line that starts with Version X.Y.Z:')
  assert.equal(changelog[1], manifest().version, "the changelog's first Version line")
})

// These three tests read the pages only: until Task 16 the README still holds the stale text it replaces, and Task 16
// makes them read FILES.
test('C3: the repository paths in code spans exist', () => {
  const roots = ['plugins/', 'scripts/', 'tests/', 'docs/', 'specs/']
  for (const rel of PAGES) {
    for (const span of codeSpans(read(rel))) {
      const word = span.trim().split(/\s+/)[0].replace(/[.,;:)]+$/, '')
      if (!roots.some((root) => word.startsWith(root)) || /[<*{$[]/.test(word) || word in PATH_EXCEPTIONS) continue
      assert.ok(fs.existsSync(path.join(ROOT, word)), `${rel} names \`${word}\`, which does not exist`)
    }
  }
})

const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }

test('R12: the count of commands of bin/ that the pages give is the count of its files', () => {
  let seen = 0
  for (const rel of PAGES) {
    for (const m of read(rel).matchAll(/\b(\w+) commands of `bin\/`/g)) {
      seen++
      assert.equal(NUMBERS[m[1].toLowerCase()] ?? Number(m[1]), bins().size, `${rel} says ${m[1]} commands of bin/`)
    }
  }
  assert.ok(seen > 0, 'a page says how many commands bin/ has')
})

test('R12: the range of decisions the pages name runs to the last decision', () => {
  const last = Math.max(...[...read('docs/decisions.md').matchAll(/^\| A(\d+) \|/gm)].map((m) => Number(m[1])))
  let seen = 0
  for (const rel of PAGES) {
    for (const m of read(rel).matchAll(/\bA1[–-]A(\d+)\b/g)) {
      seen++
      assert.equal(Number(m[1]), last, `${rel} says A1-A${m[1]}, and the last decision is A${last}`)
    }
  }
  assert.ok(seen > 0, 'a page names the range of decisions')
})

test("R12: the roadmap's Now line names the manifest's version", () => {
  const now = read('docs/roadmap.md').split('\n').find((line) => line.startsWith('**Now:**'))
  assert.ok(now, 'docs/roadmap.md has a line that starts with **Now:**')
  assert.ok(now.includes(`version ${manifest().version}`), `the Now line names version ${manifest().version}`)
})
```

**Acceptance:**
- Las pruebas de la primera parte (la regla, sobre entradas pequeñas) pasan solo con la regla de extracción de arriba, y las de «the tree» pasan sobre el árbol de esta rama. La prueba sobre el enlace de `docs/aether-retrospective.md` **no** está aquí: la añade la Task 16, junto con el cambio del archivo.
- El comentario de arranque nombra la regla de extracción y cada excepción con su motivo (R11).
- Si una página real hace fallar una de estas pruebas, **no edites la página** (no es tuya): informa `blocked` con el nombre de la página, la línea y la regla, y para la unidad. No agregues una excepción para esconder un defecto: una excepción nueva es solo para algo que no es un defecto (un nombre retirado citado como tal), con su motivo, y se lista en el informe.
- No hay dependencias nuevas ni cambios fuera de este archivo.

### Task 16: El README como puerta, R1 en la prueba de hechos y el enlace del retrospectivo

**Aether:**
- Tier: sonnet xhigh — reduce un documento de 451 líneas a una puerta de unas 90 sin perder una afirmación que otra página no tenga, y amplía una prueba
- Review: xhigh — R1, R2 y C4: lo que el README dice ahora y lo que ya no dice; una frase que se queda sin casa no la atrapa ninguna prueba
- Area: readme
- Owns: `README.md`, `tests/docs-facts.test.js`, `docs/aether-retrospective.md`
- Depends on: Task 13 — los lectores de las tres pruebas ya leen las páginas; sin eso, quitar secciones del README rompe `npm test`
- Depends on: Task 15 — este es el archivo de pruebas que la tarea amplía con R1

**Interfaces:**

1. **`README.md`**, la puerta (R1, R2): como máximo 160 líneas (apunta a unas 90), con estas partes, en este orden y con estos encabezados exactos:

   ```text
   # Aether Plugin
   <!-- hero: the mascot animation goes here -->
   (un párrafo de qué es Aether)
   Version 0.10.0 ([changelog](docs/changelog.md))
   - **Rápido** (fast): …            (los cinco objetivos, una línea cada uno)
   - **Autónomo** (autonomous): …
   - **Delegación** (delegation): …
   - **Asequible** (affordable): …
   - **Robusto** (robust): …
   ## Requirements
   ## Install
   ## First start
   ## Where to go
   ## License
   ```

   - **El párrafo y los cinco objetivos** salen del README de 122755a (líneas 3–10), resumidos; el resto de la introducción (los roles, el swarm, las lanes) ya vive en `docs/methodology.md` y `docs/purpose.md`.
   - **`## Requirements`:** los cuatro requisitos de las líneas 227–230, sin recortar y sin la palabra `superpowers`.
   - **`## Install`:** el comando `claude plugin install aether --marketplace DarkArty07/aether-plugin`, y una frase con `--config lanes=true` y el enlace a [Options](docs/guide/options.md#options).
   - **`## First start`:** `claude --agent aether:lead --effort xhigh`; con un clon del repositorio, `scripts/aether-lead`; y que `claude` a secas es el modo normal salvo que el repositorio fije el agente (`{ "agent": "aether:lead", "effortLevel": "xhigh" }` en su `.claude/settings.local.json`). Enlace a [Start](docs/getting-started.md#start).
   - **`## Where to go`:** una lista con los enlaces `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md` y `docs/index.md`, una línea cada uno.
   - **`## License`:** el párrafo de las líneas 449–451 de 122755a (la sección `## License`), entero, con el enlace a `LICENSE` y a `plugins/aether/NOTICE`.
   - **Ninguna imagen** cuyo archivo no exista (R2): el hueco de la mascota es solo el comentario.
   - No hay `## Status`, ensayos, tablas de ensayos ni «Upgrading from 0.6».

2. **`docs/aether-retrospective.md`**, línea 127: el enlace `[README](../README.md#principles)` pasa a ser `[purpose page](purpose.md#principles)`; es el único cambio del archivo.

3. **`tests/docs-facts.test.js`**: (a) las tres pruebas que leían solo `PAGES` («C3: the repository paths…», «R12: the count of commands…», «R12: the range of decisions…») pasan a leer `FILES` (el README ya no tiene el texto que las hacía fallar), y se quita su comentario «These three tests read the pages only…»; (b) se añaden las tres pruebas de abajo.

**Tests (write first):**

Primero añade esto a `tests/docs-facts.test.js` y verifica que falla contra las 451 líneas del README; después reduce el README. La prueba de la Task 15 que la Task 16 hace pasar («R13: the retrospective links the principles in the purpose page, not in the README») se añade aquí, después de cambiar el retrospectivo.

```js
test('R1: the README is the way in: at most 160 lines, and its parts in order', () => {
  const lines = read(README).split('\n')
  assert.ok(lines.length <= 160, `the README has ${lines.length} lines, and the most is 160`)
  const at = (pattern, what) => {
    const i = lines.findIndex((line) => pattern.test(line))
    assert.ok(i >= 0, `the README has ${what}`)
    return i
  }
  const title = at(/^# \S/, 'a title')
  const hero = at(/^<!-- hero: .* -->$/, 'the comment <!-- hero: ... --> for the mascot')
  const version = at(/^Version \d+\.\d+\.\d+\b.*\]\(docs\/changelog\.md\)/, 'a line "Version X.Y.Z" that links docs/changelog.md')
  assert.ok(hero < 10, 'the comment for the mascot is at the top')
  assert.ok(
    lines.slice(title + 1, version).some((line) => /\S/.test(line) && !line.startsWith('<!--')),
    'a paragraph that says what Aether is comes before the Version line',
  )
  const order = [
    title,
    hero,
    version,
    ...['Rápido', 'Autónomo', 'Delegación', 'Asequible', 'Robusto'].map((goal) => at(new RegExp(`^- \\*\\*${goal}\\*\\*`), `the goal ${goal}, on one line`)),
    at(/^## Requirements$/, '## Requirements'),
    at(/^## Install$/, '## Install'),
    at(/^## First start$/, '## First start'),
    at(/^## Where to go$/, '## Where to go'),
    at(/^## License$/, '## License'),
  ]
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the parts come in the order of R1')
  const section = (heading) => {
    const rest = lines.slice(lines.indexOf(heading) + 1)
    const end = rest.findIndex((line) => /^## /.test(line))
    return (end < 0 ? rest : rest.slice(0, end)).join('\n')
  }
  assert.ok(section('## Install').includes('claude plugin install aether --marketplace DarkArty07/aether-plugin'), 'Install has the command')
  const start = section('## First start')
  for (const need of ['claude --agent aether:lead --effort xhigh', 'scripts/aether-lead', '`claude`', 'normal mode', 'repository']) {
    assert.ok(start.includes(need), `First start has "${need}"`)
  }
  const where = section('## Where to go')
  for (const target of ['docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/index.md']) {
    assert.ok(where.includes(`](${target})`), `Where to go links ${target}`)
  }
})

test('R1: the README holds no history by version, no trial and no upgrade guide', () => {
  const text = read(README)
  assert.equal(text.split('\n').filter((line) => /^Version \d/.test(line)).length, 1, 'one Version line, and no history by version')
  for (const gone of ['## Status', 'Trial 1', 'Trial 2', 'Trial 3', 'Wall clock', 'Upgrading from 0.6']) {
    assert.ok(!text.includes(gone), `the README no longer has "${gone}"`)
  }
})

test('R13: the retrospective links the principles in the purpose page, not in the README', () => {
  const text = read('docs/aether-retrospective.md')
  assert.ok(text.includes('(purpose.md#principles)'), 'the retrospective links purpose.md#principles')
  assert.ok(!text.includes('README.md#principles'), 'the retrospective no longer links README.md#principles')
})
```

**Acceptance:**
- `npm test` pasa, con las tres pruebas nuevas, las tres que pasan a leer `FILES`, y los lectores de la Task 13 sin el README viejo.
- El README tiene como máximo 160 líneas y la forma de arriba; su línea `Version` es la del manifiesto, y los enlaces y las anclas resuelven (docs-facts los comprueba).
- **Nada se pierde (C4):** el informe da, por cada sección de la tabla de D1 del plan cuyo destino incluye el README, qué línea de la puerta la resume, y confirma que las secciones movidas ya no están en el README.
- `docs/aether-retrospective.md` tiene un solo cambio, el de la línea 127.
- El comentario `<!-- hero: … -->` es un comentario HTML y la página no tiene ninguna imagen.

### Task 17: Conciliación y auditoría: lanes, seats, ops y options

**Aether:**
- Tier: sonnet xhigh — leer cada afirmación de cuatro páginas contra el código que las sostiene y corregir; un cambio de comportamiento que ninguna prueba nombra
- Review: xhigh — C3: la auditoría es la única evidencia de lo que una máquina no comprueba; el supervisor mira el registro y comprueba una muestra
- Area: docs-guide
- Owns: `docs/guide/lanes.md`, `docs/guide/design-seats.md`, `docs/guide/ops.md`, `docs/guide/options.md`
- Depends on: Task 16 — la auditoría lee el árbol final, con el README ya reducido

**Interfaces:**

No hay páginas nuevas: se audita y se corrige lo escrito en las tareas 5, 6 y 7. Para **cada** afirmación de las cuatro páginas que dé un número, un valor por defecto, un nombre, una ruta, un orden o un comportamiento, se lee su fuente y se anota (afirmación, fuente con archivo y línea, veredicto: `cierto`, `corregido` o `quitado`). Una afirmación que el código no sostiene se corrige a lo que sí hace, o se quita; nunca se deja. Lo que solo un cambio del plugin arreglaría (R13) no se arregla: va al informe como hallazgo. Las afirmaciones con las que empezar, además de todas las demás:

1. **options.md:** los cuatro `type`, `default` y `description` de `userConfig` contra la tabla, y el modo de fijar cada opción contra `lib/session.js` y `bin/aether-session-start` (`AETHER_SEATS`, `ops` apagada).
2. **lanes.md:** los modelos de cada harness en `config/lanes.json` (agy: Gemini 3.8 Flash para los implementers de Haiku, y su Sonnet 5.5 y su Opus 5.5 para el resto; Grok: `grok-4.7`; Codex y Cursor, entradas sin modelos); «agy's `high` runs Claude's `high` and `xhigh`; calls at `max`, and `ops`, are always native» contra los niveles de la tabla y `lib/lanes.js`.
3. **lanes.md:** la regla del orden contra `lib/lane-order.js` (prioridad = lo que queda de la ventana más larga entre las horas hasta su reinicio, mínimo una hora; el desempate; los grupos sin lectura) y la vida de las lecturas y las marcas contra `lib/lane-readings.js` y `lib/lane-marks.js`.
4. **lanes.md:** la contención contra `lib/harness/{agy,codex,grok,cursor}.js` (`--dangerously-skip-permissions`, `workspace-write`, `--always-approve`, `--force`), el entorno que se limpia y `protocol.allow` contra `lib/lane-work.js` y `lib/lanes.js`, y «Linux only» (`/proc`).
5. **lanes.md:** «Adding a harness» contra `lib/harness/index.js` (`HARNESS_NAMES`, `FACTORY`), `quota()` y `quotaCost`; «Turning on Codex, Grok or Cursor» contra `AETHER_LANES_CONFIG` en `lib/lanes.js`.
6. **design-seats.md:** la tabla contra `designSeats` de `config/lanes.json`; «A round» contra `lib/seats.js` (qué puede cambiar cada asiento, el respaldo, `refs/aether/seat/<id>/round-1`); «The exam» contra `lib/exam.js` («A test that fails runs once more»); «Argon» y «Google AI Ultra» contra `docs/decisions.md` (A39–A43) y `specs/001-design-seats/`.
7. **ops.md:** la lista cerrada de comandos contra `hooks/ops-command.mjs`; el límite de 10 minutos y que corre con `$.process.run` contra `hooks/` y `lib/worktrees.js`; los motivos de caída a la ruta del agente.

**Tests (write first):**

No hay una prueba nueva: la regla de estas páginas ya la comprueban `tests/docs-facts.test.js` y los lectores de la Task 13. Antes de tocar nada, corre `npm test` y verifica que pasa; después de cada corrección, otra vez. La evidencia de la auditoría es el registro de afirmaciones del informe.

**Acceptance:**
- `npm test` pasa, y ninguna página dice una cadena prohibida de «Global Constraints».
- El informe tiene el registro completo: cada afirmación con número, nombre, ruta, orden o comportamiento de las cuatro páginas, su fuente (archivo y línea) y su veredicto; y lista aparte lo corregido o quitado y los hallazgos que solo un cambio del plugin arreglaría.
- Las cadenas que las pruebas fijan siguen exactas; `### Lanes` mide más de 1000 caracteres.
- Los valores por defecto repetidos siguen la forma de R6 y son los del manifiesto.

### Task 18: Conciliación y auditoría: la guía de inicio, la solución de problemas, autonomía y mantenimiento

**Aether:**
- Tier: sonnet xhigh — leer cada afirmación de cuatro páginas contra el código y los hooks y corregir
- Review: xhigh — C1 y C3: la guía de quien acaba de instalar se verifica aquí contra lo que de verdad hace el arranque, y un paso falso no lo atrapa ninguna prueba
- Area: docs-start
- Owns: `docs/getting-started.md`, `docs/guide/troubleshooting.md`, `docs/guide/autonomy.md`, `docs/guide/maintenance.md`
- Depends on: Task 16 — la auditoría lee el árbol final, con el README ya reducido

**Interfaces:**

Como la Task 17, sobre las páginas de las tareas 1, 2, 7 y 8: un registro de cada afirmación con su fuente y su veredicto, y las correcciones. Con las que empezar:

1. **getting-started.md, requisitos:** «Claude Code 2.1.294 or later», «Node.js 22» y «git 2.36 or later»: de dónde sale cada uno (`docs/claude-code-research.md`, `docs/evaluations/2026-10-09-installable/`, lo que el código usa de `git worktree`). Si ninguna fuente sostiene el número, se dice lo que sí se verificó.
2. **getting-started.md, arranque:** los argumentos de `scripts/aether-lead` palabra por palabra, el agente `aether:lead` y su modelo (`agents/lead.md`), y que `--effort xhigh` es del arranque porque un plugin no puede fijarlo.
3. **getting-started.md, la primera petición:** cada paso contra `skills/using-aether/SKILL.md` («Understanding the intent», «The route by size and risk», «Writing and judging», «The three paths»): el orden, quién confirma qué, «at most two revisions per document», cuándo se detiene el Lead en el plan.
4. **getting-started.md, trabajar por horas:** los topes de 8 horas y US$ 50 contra `config/autonomy.json` y `lib/autonomy.js`; qué registra `aether-autonomy start`; qué es un permiso que pregunta.
5. **getting-started.md, el brief:** su forma contra el bloque «The brief» de `using-aether`; las clases de acción contra `lib/autonomy.js`.
6. **troubleshooting.md:** cada causa y cada remedio de los diez apartados, con su archivo.
7. **autonomy.md:** las siete clases (`merge-main`, `push`, `publish`, `deploy`, `delete`, `credentials`, `paid-call`) contra `lib/autonomy.js` y `lib/guard.js`; los archivos de `.aether/autonomy/` y `.aether/pending.jsonl` contra `lib/autonomy.js` y `lib/pending.js`; qué registra y qué rechaza aether-guard, y la diferencia entre `log` y `enforce`.
8. **maintenance.md:** los plazos de «Data» (30 días, 24 horas), qué barre el hook de inicio y qué directorio usa `AETHER_DATA_DIR`, contra `lib/session.js` y `bin/aether-session-start`; el formato de las etiquetas, `aether--v<version>`, contra `git tag -l 'aether--v*'`; los comandos de `claude plugin` contra `claude plugin --help` si la CLI está.

**Tests (write first):**

Igual que la Task 17: `npm test` verde antes y después de cada corrección; la evidencia es el registro del informe. Si la CLI `claude` está en tu entorno, comprueba con `--help` (sin un modelo y con `CLAUDE_CONFIG_DIR=$(mktemp -d)`) cada subcomando de `claude plugin` que las páginas citan.

**Acceptance:**
- `npm test` pasa, y ninguna página dice una cadena prohibida de «Global Constraints».
- El informe tiene el registro completo y la lista de lo corregido, quitado y no verificado.
- El plan de ejemplo de la guía de inicio sigue pasando `aether-plan check` (córrelo).
- Las cadenas fijadas siguen exactas: las tres de `### Start`, las cinco de `### Upgrading from 0.6`, y las del resto.

### Task 19: Conciliación y auditoría: propósito, metodología, piezas y README

**Aether:**
- Tier: sonnet xhigh — leer cada afirmación de tres páginas y del README contra las skills, los agentes y el árbol, y corregir
- Review: xhigh — C3: «Propósito, metodología, README y guías dicen lo mismo entre sí y lo mismo que el código» se juega aquí, y una contradicción con `using-aether` no la ve ninguna prueba
- Area: docs-method
- Owns: `docs/purpose.md`, `docs/methodology.md`, `docs/reference/components.md`, `README.md`
- Depends on: Task 16 — el README es el reducido, y la auditoría lee el árbol final

**Interfaces:**

Como la Task 17, sobre las páginas de las tareas 3, 4 y 9 y sobre el README de la Task 16. Con las que empezar:

1. **methodology.md, roles:** el modelo y el esfuerzo de cada rol contra `agents/*.md` (el Lead en Sonnet; el Writer en Sonnet a `xhigh`; el Judge, el Examiner y el reviewer en Opus a `high`; el supervisor en Sonnet a `high`; el implementer; ops) y el Tier por defecto de un implementer contra `skills/swarm/SKILL.md` y `lib/plan.js`.
2. **methodology.md, caminos y ruta:** el umbral de los tres caminos («three or more tasks, or a task of Tier opus») y la tabla de la ruta por tamaño y riesgo contra `skills/using-aether/SKILL.md`; las salidas 0, 3 y 4 de `aether-lane seat`, y «at most two revisions per document».
3. **methodology.md, el diagrama:** cada nombre y cada comando que nombra (`aether-plan check / compile`, `aether-lane seat`, `aether-exam store` y `run`, `aether-report`, `aether-report finalize`) contra `bin/`; la escalera y los tres hallazgos iguales contra `workflows/run.workflow.js`.
4. **purpose.md:** RADAR y su medición contra `skills/using-aether/SKILL.md` y `docs/roadmap/2026-10-10-radar.md`; «What Aether is not» contra `hooks/register.js`, `bin/aether-session-start` y `plugin.json`.
5. **components.md:** cada fila de la tabla contra `bin/`, `agents/`, `skills/`, `hooks/hooks.json` y `workflows/`; lo que hace el hook de inicio (lo que barre y a los cuántos días) y lo que rechaza o registra aether-guard, contra `bin/aether-session-start`, `lib/session.js`, `bin/aether-guard` y `lib/guard.js`; la versión y la fecha de la medición contra `docs/evaluations/2026-10-09-installable/A3-dormant.md`.
6. **README.md:** cada frase contra la guía y la skill; la línea `Version` contra el manifiesto; que el README no repite nada de lo que las páginas dicen distinto.

**Tests (write first):**

Igual que la Task 17: `npm test` verde antes y después; la evidencia es el registro del informe.

**Acceptance:**
- `npm test` pasa (con `tests/docs-facts.test.js` y los lectores), el README sigue teniendo como máximo 160 líneas y ninguna página dice una cadena prohibida.
- El informe tiene el registro completo; en particular, para cada rol y cada umbral, la línea de la skill o del agente que lo sostiene, y la lista de lo que contradecía a `using-aether`, si algo lo hacía.
- Los siete principios y las listas de «Lessons» siguen siendo las de 122755a.

### Task 20: Conciliación y auditoría: historia y mapa, la tabla de C4 y `npm run check`

**Aether:**
- Tier: sonnet xhigh — comparar el árbol final con el README de 122755a fila por fila, auditar cuatro páginas contra el repositorio y correr la verificación completa
- Review: xhigh — C4 y R14: una fila vacía o una comprobación que no corrió es el defecto que esta tarea existe para impedir
- Area: docs-history
- Owns: `docs/changelog.md`, `docs/roadmap.md`, `docs/contributing.md`, `docs/index.md`, `tests/docs-facts.test.js`
- Depends on: Task 17 — corre al final, sobre un árbol donde ya se fusionó la auditoría de lanes, seats, ops y options
- Depends on: Task 18 — ídem para la guía de inicio, la solución de problemas, autonomía y mantenimiento
- Depends on: Task 19 — ídem para propósito, metodología, piezas y README

**Interfaces:**

1. **Auditoría** de las páginas de las tareas 10, 11 y 12, como la Task 17:
   - **changelog.md:** `changelog-check.js` de la Task 10 sigue pasando; la entrada «Unreleased» sigue siendo la de la Task 10.
   - **roadmap.md:** la línea «Now» contra `docs/handoff/2026-10-14-quota-lanes-0.10.0.md`; las fases de 0.8 contra `docs/roadmap/2026-10-10-radar.md`; «Effort» contra `docs/superpowers/specs/2026-10-08-effort-per-task-design.md`, y que `scripts/check-effort.js` existe y lee lo que dice; y que `aether-report` muestra el costo y el tiempo de cada rol, modelo y esfuerzo (`lib/report.js`).
   - **contributing.md:** los comandos de `package.json`; los seis pasos de «Release» contra lo que `claude plugin tag` hace y el nombre de la etiqueta (`git tag -l 'aether--v*'`); `scripts/refresh-lanes.js` y `ARTIFICIAL_ANALYSIS_API_KEY` contra el script.
   - **index.md:** cada enlace resuelve (docs-facts) y la línea de cada documento dice lo que el documento es.
2. **La tabla de C4:** para **cada fila** de la tabla de D1 del plan (`specs/004-docs-reconciliation/plan.md`), verifica contra `git show 122755a:README.md` que el destino tiene el contenido de la sección (movido, o resumido con nada que se perdiera). Una fila cuyo destino no lo tiene se corrige en la página (si es una de las tuyas) o se informa; no hay filas vacías. Las secciones que solo el README resume (introducción, requisitos, instalación, arranque, licencia) se comparan con `README.md` y con la página completa.
3. **R13:** `git diff --stat 122755a..HEAD` (o contra la base de la rama) lista solo archivos de R13: `README.md`, `docs/index.md`, `docs/getting-started.md`, `docs/purpose.md`, `docs/methodology.md`, `docs/changelog.md`, `docs/contributing.md`, `docs/roadmap.md`, `docs/guide/**`, `docs/reference/**`, `tests/docs-facts.test.js`, `tests/launcher.test.js`, `tests/lanes-docs.test.js`, `tests/start-command.test.js`, `tests/roles.test.js`, `docs/aether-retrospective.md`, `plugins/aether/skills/swarm/SKILL.md` y `specs/004-docs-reconciliation/**`. Cualquier otro es un hallazgo.
4. **Pruebas de hechos:** si la auditoría muestra una clase de afirmación que una máquina puede comprobar y `tests/docs-facts.test.js` no comprueba, y la corrección es una prueba pequeña, añádela al final del archivo con su motivo; si necesita una excepción nueva, solo para algo que no es un defecto, con su motivo.
5. **`npm run check`** (R14): corre `npm run check` (las pruebas, las pruebas del mod y los dos manifiestos). Si la CLI `claude` no está en tu entorno, di cuál de los tres pasos no pudiste correr y por qué: el Lead lo corre.

**Tests (write first):**

Igual que la Task 17: `npm test` verde antes y después de cada corrección; la evidencia es el registro del informe, la tabla de C4 verificada y la salida de `npm run check`.

**Acceptance:**
- `npm test` pasa, y `npm run check` pasa (o se informa qué paso no pudo correr).
- El informe tiene: el registro de afirmaciones de las cuatro páginas; la tabla de C4 con una línea por fila y su veredicto (todas llenas); la lista de archivos de `git diff --stat` fuera de R13 (vacía); y la salida de `npm run check`.
- La línea `Version` del README y la primera línea `Version X.Y.Z:` del changelog siguen siendo las del manifiesto, y docs-facts lo comprueba.
- Nada de lo que hoy dice el README de 122755a se perdió: o está en su destino, o el informe lo lista como pérdida con su sección.
