# Plan: `/aether:audit`, una auditoría del proyecto que entrega una lista ordenada por urgencia

- **Especificación:** [spec.md](spec.md); **tareas:** [tasks.md](tasks.md); **investigación:** [research.md](research.md); **prototipo:** [prototype.md](prototype.md)

## Technical context

- **Pila.** Node.js 22, CommonJS, sin dependencias (CLAUDE.md). El repositorio es el del plugin: `plugins/aether/` (bins, `lib/`, skills), `tests/` con `node --test`, `docs/`, `specs/`.
- **Lo que ya existe y se reutiliza.** `lib/git.js` (`git()`, `repoPaths()`), `lib/common.js` (`writeAtomic`, `readJsonOrNull`, `killGroup`, `isObject`), `lib/run.js` (`dataDir()`, `toId()`, `safeRealpath()`, las tres líneas de exclusión de Aether), `lib/lane-process.js` (`commandPath()`, `commandInstalled()`), `aether-report --spend` para el costo, `aether-delegate` y la herramienta `Agent` para los delegados, y `tests/helpers.js` (`makeRepo`, `tempDir`, `runBin`, `useDataDir`, `commitIn`).
- **Reglas del repositorio que el código nuevo debe cumplir** (las hacen cumplir `tests/guards*.test.js`, `tests/bins-thin.test.js` y `tests/docs-facts.test.js`): un bin delgado de menos de 160 líneas que solo pide `node:path` y `lib/`; cada archivo de `lib/` con su comentario de cabecera (6 palabras o más) y `// Family: <familia>.`; la familia declarada en `docs/reference/components.md`; ninguna función auxiliar definida dos veces; ningún nombre definido o requerido que no se use; ningún ciclo de `require`; el conteo de comandos de `bin/` que dan las páginas.
- **Estructura nueva.**
  - `plugins/aether/bin/aether-audit`: el comando, delgado.
  - `plugins/aether/lib/`: la familia `audit` (prefijo `audit-`, orquestador `audit.js`): `audit.js`, `audit-common.js`, `audit-exec.js`, `audit-store.js`, `audit-report.js`, `audit-snapshot.js`, `audit-scan.js`, `audit-github.js`, `audit-risk.js`, `audit-tools.js`, `audit-analyze.js`, `audit-verify.js`, `audit-clean.js`, `audit-triage.js`.
  - `plugins/aether/skills/audit/SKILL.md` (y un archivo de referencia al lado, `topics.md`, con el catálogo de temas): lo escribe el Lead.
  - `tests/audit-*.test.js`; `docs/guide/audit.md`, `docs/es/guias/auditar-un-proyecto.md`.
- **Cómo se construye.** Esta sesión del Lead no tiene la herramienta Workflow: el plan se construye con tareas delegadas, cada una en su worktree, integradas una a una (`aether-wt`), no con el enjambre. La Tarea 1 (el texto del skill) la escribe el Lead, no un delegado, y va primero porque `tests/commands.test.js` exige que cada verbo de un bin tenga un llamador en un skill y `tests/docs-facts.test.js` que `components.md` nombre cada skill. La instalación, el release y la versión son del dueño y no están en las tareas.

## Gate

No hay `.specify/memory/constitution.md` en este repositorio: los principios son los de CLAUDE.md, que las pruebas hacen cumplir y que el diseño sigue (bins delgados, lógica en `lib/`, sin dependencias, docs sujetas al árbol).

- Nada especulativo, y nada para una necesidad hipotética: **pasa.** Cada módulo sirve a un requisito del spec (columna `Serves` de cada decisión). Se dejan fuera, por no pedirlos el spec: un workflow propio (queda como propuesta del spec), instalar herramientas, un puntaje de salud, modelos de lenguaje en el código.
- Ninguna abstracción, opción, archivo o dependencia que ningún requisito pida: **falla en cuatro puntos, que se justifican en `## Complexity`:** la opción `--out`, el archivo `audit-common.js`, el ejecutor inyectable `exec` y las tablas de etiquetas `es`/`en`. Los demás archivos y opciones nacen de un requisito.

## Design

### D1. Qué es código y qué es juicio del Lead

El spec pide que las partes sin modelo se prueben sobre repositorios desechables (R27) y que el juicio lo haga un modelo. El plan lo reparte requisito por requisito. Lo que es código está en `aether-audit`; el Lead solo lo llama y le pasa archivos. Lo que es juicio lo hace el Lead con un texto fijo en el skill y lo escribe en los archivos que el código lee.

| Req. | Código (determinista, probado) | Juicio del Lead (texto del skill) |
| --- | --- | --- |
| R4, R5, R6, R7, R8 | Todo: elegir y leer el comando, correr con tope, linter, auditoría de dependencias, secretos sin valor, TODO, ramas, issues y PR (`gh`), hotspots, fotografías antes y después y su atribución | Escoger un comando del README cuando ningún manifiesto declara tests, y pasarlo con `--tests-command` |
| R9, R10, R11 | El estimado de tiempo y costo a partir de las auditorías guardadas (`analysis.estimate`) | Proponer temas y razones, hacer la pregunta, leer la respuesta, ignorar un tema desconocido |
| R12, R14 | La compuerta de R13, el establecimiento de los veredictos de R14 y R15 (`candidates`, `verdicts`) | Lanzar los delegados revisores y verificadores, sus instrucciones, no escoger su modelo |
| R16 | Juntar los hallazgos con la misma `causeKey` y el mismo estado, con todas sus ubicaciones | Asignar la `causeKey` a cada hallazgo (la causa raíz) |
| R17 | Validar que el issue citado esté abierto en la lista que trajo el análisis, quitar el hallazgo y decir cuál y con qué número; decir que no pudo comparar si `gh` falló | Decidir que un issue abierto cubre un hallazgo y anotar `coveredBy` |
| R18 | Encontrar la auditoría anterior por la clave del proyecto, marcar «nuevo» o «sigue» por `causeKey`, listar los «resueltos» (solo los que cambiaron en git desde el HEAD de la anterior), los «no vueltos a encontrar» y los de temas no revisados esta vez | Reusar la `causeKey` de la auditoría anterior cuando es el mismo problema |
| R19 | Validar los niveles, quitar el nivel a lo «sin verificar», forzar P3 a la «propuesta», rechazar un hallazgo verificado sin juicio | Dar a cada hallazgo gravedad, prioridad, razón en una frase, tamaño, si es regresión, costo de esperar y cómo se haría; la edad no es gravedad |
| R20 | El orden dentro de cada nivel | Los insumos del orden (R19) |
| R21, R22, R23 | Armar las once secciones en su orden, los conteos, el desglose de descartados, «No cubrí» (revisiones del análisis, temas fuera, lo que cada revisor no miró, revisores agotados), la lectura de «no se pudo leer el costo» | «Espera tu sí», «Supuestos», el RADAR y la línea del costo (las cifras salen de `aether-report --spend`); adaptar la entrega al idioma de la persona |
| R24 | Identidad del proyecto, clave, carpeta, fecha, guardar y encontrar la anterior | — |
| R25 | Que ninguna salida se escriba dentro del proyecto auditado (`--out`) | Crear los issues solo después de la elección de la persona (`gh issue create`) |
| R26 | — | Todo: delegados en segundo plano, esperar, entregar |
| R3 | `--lang es|en` para las etiquetas | Responder en el idioma de la persona; para otro idioma, traducir la entrega |

*Serves:* C2, C4, C5, C6, C7.

### D2. Una familia `audit` y un bin delgado

`bin/aether-audit` solo lee argumentos y llama a `audit.main`, como `aether-plan`. `lib/audit.js` es el orquestador de la familia `audit` y despacha seis subcomandos a su módulo, cargado cuando se pide (un `require` literal dentro de una función por subcomando). Cada módulo de subcomando exporta `command(args, ctx)` y devuelve `{ code, result, summary }`; `audit.js` imprime siempre **una línea JSON**, como los demás bins.

```
aether-audit analyze    [--no-tests] [--tests-command <cmd>] [--timeout-seconds <n>] [--out <file>]
aether-audit candidates <candidatos.json>                              [--out <file>]
aether-audit verdicts   <salida-de-candidates.json> <veredictos.json>  [--out <file>]
aether-audit clean      <salida-de-verdicts.json> --analysis <analisis.json> --topics <a,b,c> [--out <file>]
aether-audit triage     <salida-de-clean.json> <juicios.json>          [--out <file>]
aether-audit report     --meta <meta.json> --analysis <analisis.json> --triage <triaje.json> [--lang es|en] [--save] [--out <file>]
```

Salida: `0` bien, `1` error (`{"ok":false,"error":"..."}`), `2` uso incorrecto. `--out <archivo>` escribe el resultado completo en el archivo y imprime `{"ok":true,"out":...,"summary":...}`; sin él imprime el resultado. El archivo de `--out` **debe estar fuera del proyecto auditado** (R25, C6); si no, sale con 2.

*Serves:* C1, C2, C6, C9. Razones: la costumbre del repositorio (CLAUDE.md, «Bins are thin»); y la salida del análisis es demasiado grande para leerla entera en la salida de una herramienta del Lead.

### D3. El análisis automatizado (R4 a R8)

`analyze` corre en el directorio actual, que debe ser un repositorio git, y devuelve un objeto:

```
{ ok, version: 1, generatedAt, project: { name, key, identity, remote, root, defaultBranch },
  checks: { tests, lint, dependencies, secrets, todos, branches, issues, prs, hotspots },
  changes: { changed, attributed: [...], unattributable: [...] },
  selfFindings: [ <hallazgo ya establecido> ],
  estimate: { samples, perTopic? } }
```

Cada revisión es `{ state: 'result' | 'not-applicable' | 'could-not', reason?, ...datos }` (R5): una revisión que no se pudo nunca se cuenta como limpia, y el comando sale con 0 aunque todas sean `not-applicable`. Nunca instala ni inicializa nada, no hace `git fetch` ni `pull`, y no corre un comando que corrija (R6).

**Qué tan hondo lee el comando de tests (la decisión que pidió la revisión del plan).** `audit-risk.js` lee la **cadena completa de lo que `npm test` (o `make test`, `composer test`, `tox`) correría**, no solo el nombre y el cuerpo del script:

1. **Qué scripts entran.** El guion pedido; sus ganchos `pre<nombre>` y `post<nombre>` (`npm test` → `pretest` → `test` → `posttest`); y, de forma transitiva, cada script que el cuerpo de uno de ellos nombra (`npm run x`, `npm x` para `test|start|stop|restart`, `pnpm`, `yarn`, `bun run`, `run-s`, `run-p`, `npm-run-all` con sus patrones `test:*`), cada blanco de `Makefile` con sus prerrequisitos y `$(MAKE) x`, cada `@script` de `composer.json` y las líneas `commands`, `commands_pre` y `commands_post` de `tox.ini`.
2. **Hasta dónde.** Cinco niveles de profundidad y 40 scripts. Si la cadena es más honda o más ancha, **no se corre** y el motivo es «la cadena de scripts pasa de 5 niveles / de 40 scripts». Los ciclos se cortan con un conjunto de visitados.
3. **Los archivos que un script llama por ruta** (`sh x.sh`, `bash x.sh`, `./x.sh`, `node x.js`, `python x.py`, dentro del proyecto) se leen un nivel (hasta 64 KB y 400 líneas) y su texto se revisa con los mismos patrones; no se siguen más allá.
4. **Qué se busca**, en el nombre y en el texto de cada script: despliega o publica (`deploys`), migra (`migrates`), siembra datos (`seeds`), corre de punta a punta contra un servicio en vivo (`live-e2e`), usa credenciales (`credentials`), corrige o toca git (`fixes`) o instala (`installs`). Los patrones son una tabla de datos en `audit-risk.js`, una fila por clase, con su prueba.
5. **Cierra por defecto (fail-closed).** Lo que no se puede leer (un script que el manifiesto no resuelve a algo legible, un nombre de script calculado con `$(...)` o `$VAR`) tampoco se corre.

El resultado de un comando rechazado es `{ state: 'could-not', notRun: true, reason }` con el camino hasta lo que lo detuvo (por ejemplo «`npm test` llega a `db:seed` por `pretest`: siembra datos»), que el reporte dice como «no se corrió». El mismo `audit-risk.js` lee el linter y la auditoría de dependencias: un `lint` que lleva `--fix` no se corre.

Los demás módulos:

- `audit-tools.js` elige y corre los tests (manifiestos y archivos de construcción en un orden fijo; el Lead puede pasar `--tests-command`), el linter si el proyecto lo declara y la auditoría de dependencias del ecosistema (`npm`/`pnpm audit --json`, `pip-audit`, `composer audit`, `cargo audit`; los otros ecosistemas son `could-not` «sin herramienta compatible»). Corre `sh -c` en el proyecto con un entorno sin variables que parezcan secretos, `CI=true`, la entrada cerrada y un tope de 300 s (A3, `--timeout-seconds`). Con `--no-tests` la revisión es `not-applicable`. Si faltan las dependencias instaladas (`node_modules`), la revisión es `could-not`: nunca instala.
- `audit-scan.js` lee git sin modelos: secretos en el árbol y en el historial de **todas** las ramas, solo tipo, archivo, línea o commit (R7); TODO y FIXME con archivo y línea; ramas (edad, adelanto, si ya se fusionó); hotspots (R8) con puntaje `cambios × log2(líneas + 1)` y al menos dos cambios, de modo que un archivo grande casi inmóvil queda debajo de uno que cambia mucho.
- `audit-github.js` lee los issues y PR abiertos con `gh` solo si el remoto es de GitHub.
- `audit-snapshot.js` toma la fotografía de `git status` (con el hash del contenido de cada ruta), `HEAD`, la rama actual, los worktrees, las ramas, el stash y `.git/info/exclude` sin las tres líneas de Aether y sin `.aether/`; compara dos fotografías y envuelve cada paso del análisis (tests, linter, dependencias) con una fotografía antes y otra después, de modo que un cambio que sale de un paso se atribuye a ese paso y uno que aparece entre dos pasos es «no atribuible» (R6). Los archivos ignorados no cuentan.
- `audit-analyze.js` junta todo, calcula la clave del proyecto y el estimado, y arma los `selfFindings`.

*Serves:* C2, C4, C6.

### D4. Los hallazgos: un vocabulario cerrado y un flujo de archivos JSON

`audit-common.js` (hoja) fija los vocabularios, el error de uso (código de salida 2) y el lector de argumentos que comparten todos los módulos: `TOPICS` (los doce de R9, con ids `bugs`, `security`, `dependencies`, `tests`, `reliability`, `performance`, `accessibility`, `architecture`, `docs`, `releases`, `hygiene`, `opportunities`), `TYPES`, `VERDICTS` (`proven`, `read-confirmed`, `proposal`, `refuted`, `unverified`; en el reporte «comprobado», «confirmado leyendo el código», «propuesta», «refutado», «sin verificar»), `PRIORITIES`, `SEVERITIES`, `SIZES`, `WAIT_COSTS` y `CHECK_STATES`.

El flujo, con un archivo por etapa, escrito por el Lead en un directorio temporal fuera del proyecto:

1. Los revisores devuelven candidatos. El Lead los junta en un arreglo. `candidates` aplica la compuerta de R13: sin ubicación válida (`file` y `line` entero ≥ 1, o `file` y `commit`) o sin evidencia, o con un campo obligatorio vacío o un tema o tipo fuera del vocabulario, el candidato va a `discarded` con su razón. Salida: `{ accepted, discarded, counts: { candidates } }`.
2. Los verificadores devuelven un registro por candidato. `verdicts` lo establece (R14, R15): un veredicto válido deja el hallazgo `verified`; uno `refuted` con evidencia lo descarta; **todo lo demás** (sin registro, veredicto fuera de los cinco, sin evidencia, sin causa raíz, disparador o impacto reescritos, `proven` sin reproducción o de un verificador que no corrió en `claude`, `proposal` en algo que no es oportunidad, verificador agotado) lo deja `unverified` con su razón. Nunca se conserva como verificado. Salida: `{ findings, discarded, counts: { candidates, verified } }`.
3. El Lead agrega a cada hallazgo su `causeKey` y, si lo cubre un issue abierto, `coveredBy`. `clean` junta, quita lo cubierto y compara con la auditoría anterior (R16 a R18). Salida: `{ findings, unverified, discarded, counts, issueComparison, sinceLast }`.
4. El Lead escribe un archivo de juicios por id. `triage` lo valida, ordena y numera (R19, R20). Salida: la de `clean` más `list` (numerada) y `unverified`.
5. `report` arma las once secciones de R21 y, con `--save`, guarda `report.json` y `report.md` en la carpeta del proyecto (R24). `report.json` es el objeto completo del reporte, incluida su lista `list`, de modo que la auditoría siguiente la use para comparar.

**El orden dentro de un nivel (R20).** Una regresión va antes que un defecto viejo del mismo nivel (es la primera llave); luego el mayor costo de esperar (`high`, `medium`, `low`); luego el menor costo de hacerlo (`S`, `M`, `L`); a igualdad, el orden en que llegaron. El spec no dice si la regresión pesa más que el costo de esperar; el plan toma el segundo de sus dos textos más literales (la regresión «va antes que un defecto viejo del mismo nivel») y lo registra como supuesto.

*Serves:* C4, C5, C7.

### D5. El reporte y dónde se guarda (R21 a R24)

`audit-report.js` pone en el reporte, en este orden, las secciones de R21: encabezado, «Espera tu sí», «Supuestos», lista P0 a P3, «Sin verificar», «Desde la última auditoría», «Descartados», «No cubrí», RADAR, costo y la pregunta final con un ejemplo. El texto fijo sale de una tabla de etiquetas en español y en inglés (`--lang`); otro idioma recibe el inglés y el Lead traduce al entregar. «Espera tu sí», «Supuestos», el RADAR y el costo vienen escritos por el Lead en el archivo `--meta`. Si el costo no se pudo leer (`cost.readable` falso) el reporte lo dice y no pone cifra (R23). Un cambio no atribuible del análisis sale como una línea de «Supuestos».

`audit-store.js` fija la identidad del proyecto (la URL normalizada del remoto `origin`, o el primer remoto, sin usuario ni clave, en minúsculas y sin `.git`; sin remoto, la ruta real de la raíz del repositorio), su clave (`<nombre>-<12 hex>` con el hash `sha256` de la identidad), la carpeta `<directorio de datos>/audits/<clave>/<AAAA-MM-DD>` (con `-2`, `-3` si ya hay una auditoría ese día), guarda, encuentra la anterior y calcula el estimado (R10) a partir de `meta.durationSeconds`, `meta.costUsd` y los temas de las auditorías guardadas de cualquier proyecto.

*Serves:* C5, C6, C7.

### D6. El skill (Tarea 1, del Lead) y sus rondas

`plugins/aether/skills/audit/SKILL.md` tiene la portada de `onboard` (`name: audit`, `description` de una línea, `argument-hint: "[topics] [--no-tests]"`, `disable-model-invocation: true`). Debe contener, como mínimo: las siete fases en su orden (R2); la llamada al análisis y la pregunta de temas con la forma del prototipo (R10, R11); el catálogo de los doce temas en `topics.md`, cada uno con su fuente de `research.md` (R9); cómo lanzar los revisores y verificadores (R12, R14: delegados de solo lectura con la herramienta `Agent` en segundo plano, sin `AETHER-OWNS`, sin escoger su modelo; los verificadores no reciben el razonamiento del revisor); el uso de cada subcomando de `aether-audit` y los archivos JSON de D4, escritos en un directorio temporal fuera del proyecto; las reglas de juicio de D1 (causa raíz, cobertura por issue, gravedad aparte de prioridad, la edad no es gravedad); la entrega con la forma del prototipo; la regla de que nunca se cita el valor de un secreto; la prohibición de cambiar el proyecto (nada de `git fetch`, `pull`, `--fix`), y de crear issues antes de que la persona elija y solo si el proyecto usa GitHub y `gh` responde; el aviso de que no necesita la herramienta Workflow (R26); y la línea del RADAR con el costo de `aether-report --spend`.

**Un revisor por tema; los verificadores en lotes.** Cada tema confirmado tiene un revisor (R12), con un alcance acotado, y lo que no alcanzó a mirar va a «No cubrí». Un verificador puede tomar hasta cuatro candidatos de la misma zona, cada uno juzgado por separado y sin el razonamiento del revisor (R14): cada delegado tiene un costo fijo de arranque y cada resultado es un turno más del Lead, y con 40 candidatos serían 40 delegados. Si las rondas muestran que el lote empeora los veredictos, se vuelve a uno por candidato.

Las pruebas con proyectos reales (R29) las corre el Lead después de la Tarea 5 y antes de la Tarea 6; **no son tareas** (ninguna tarea posee archivos bajo `specs/`). Se describen en `## Verification`.

*Serves:* C1, C2, C3, C8.

### D7. La documentación (Tarea 6)

Una guía `docs/guide/audit.md` (inglés) y `docs/es/guias/auditar-un-proyecto.md` (español), enlazadas desde `docs/index.md` y `docs/es/index.md`; la fila de `docs/reference/components.md` (el bin, la familia y el skill) y la nota de la huella en reposo; la mención en `/aether:help` con los enlaces a las guías; una línea en «Qué agrega Aether» en los dos idiomas. Se hace después de las rondas para que la guía diga lo que la skill hace al final y para que `specs/026-project-audit/rounds/` exista cuando la guía lo nombre.

*Serves:* C9.

## Files

| Archivo | Qué y por qué | Tarea |
| --- | --- | --- |
| `plugins/aether/skills/audit/SKILL.md`, `topics.md` | El skill y el catálogo de los doce temas (D6) | 1 |
| `plugins/aether/skills/help/SKILL.md` | La mención de `/aether:audit` en la ayuda | 1 |
| `docs/reference/components.md` | La fila del skill | 1 |
| `tests/audit-skill.test.js` | La portada, las siete fases, los doce temas con su fuente, sin Workflow, los verbos del bin | 1 |
| `plugins/aether/bin/aether-audit` | El comando, delgado (D2) | 2 |
| `plugins/aether/lib/audit.js` | Orquestador de la familia: argumentos, despacho, `--out`, una línea JSON (D2) | 2 |
| `plugins/aether/lib/audit-common.js` | Los vocabularios cerrados, el error de uso y el lector de argumentos (D4) | 2 |
| `plugins/aether/lib/audit-exec.js` | Ejecutor de comandos con tope de tiempo y muerte del grupo de procesos, y el entorno sin secretos (D3) | 2 |
| `plugins/aether/lib/audit-store.js` | Identidad, clave, carpeta, guardar, anterior, estimado (D5) | 2 |
| `plugins/aether/lib/audit-report.js` | Las once secciones y su guardado (D5) | 2 |
| `docs/reference/components.md`, `tests/docs-facts.test.js`, `tests/components-docs.test.js`, `tests/observe-bin.test.js` | La fila del bin y de la familia `audit` y el conteo de catorce comandos de `bin/` que esas pruebas fijan | 2 |
| `tests/audit-foundation.test.js` | Pruebas de la Tarea 2 | 2 |
| `plugins/aether/lib/audit-snapshot.js`, `audit-scan.js`, `audit-github.js` | Lectura del repositorio (D3) | 3 |
| `plugins/aether/lib/run.js` | Solo exporta `EXCLUDES`, que ya existe, para que la fotografía no cuente las líneas de Aether | 3 |
| `tests/audit-scan.test.js` | Pruebas de la Tarea 3 | 3 |
| `plugins/aether/lib/audit-risk.js`, `audit-tools.js`, `audit-analyze.js` | Comandos propios del proyecto y el comando `analyze` (D3) | 4 |
| `tests/audit-analyze.test.js` | Pruebas de la Tarea 4 | 4 |
| `plugins/aether/lib/audit-verify.js`, `audit-clean.js`, `audit-triage.js` | La compuerta, los veredictos, la limpieza y el triaje (D4) | 5 |
| `tests/audit-pipeline.test.js` | Pruebas de la Tarea 5 | 5 |
| `docs/guide/audit.md`, `docs/es/guias/auditar-un-proyecto.md`, `docs/index.md`, `docs/es/index.md`, `docs/reference/components.md`, `docs/what-aether-adds.md`, `docs/es/que-agrega-aether.md`, `plugins/aether/skills/help/SKILL.md`, `tests/docs-facts.test.js`, `tests/audit-docs.test.js` | La documentación (D7) | 6 |
| `specs/026-project-audit/rounds/round-N.md` | La evidencia de cada ronda (R29); lo escribe el Lead | — |

## Verification

- **Comando de pruebas:** `npm test` (`node --test "tests/*.test.js"`). Cada tarea corre además `node --test tests/<su archivo>`. Al final, `npm run validate` (R31).
- **Qué prueba cada criterio.**
  - **C1:** `tests/audit-skill.test.js` fija la portada; `tests/help.test.js` y `tests/audit-skill.test.js` fijan que `/aether:help` la nombra; las rondas corren en proyectos sin archivos de Aether.
  - **C2:** `tests/audit-foundation.test.js` (estimado) y `tests/audit-analyze.test.js` (el análisis sobre repositorios desechables, incluido el repositorio sin nada); en las rondas, el registro de la sesión muestra la pregunta.
  - **C3:** `tests/audit-skill.test.js` comprueba los doce temas de `topics.md`, cada uno con una URL que está en `research.md`.
  - **C4:** `tests/audit-pipeline.test.js` (un verificador que falla cae en «sin verificar»; un candidato sin ubicación o evidencia se descarta) y `tests/audit-scan.test.js` (el valor de un secreto no sale).
  - **C5:** `tests/audit-pipeline.test.js` (el orden) y `tests/audit-foundation.test.js` (las secciones de R21 en su orden).
  - **C6:** `tests/audit-scan.test.js` (fotografías y atribución) y `tests/audit-foundation.test.js` (`--out` dentro del proyecto se rechaza; guardar no toca el proyecto); en las rondas, las fotografías antes y después.
  - **C7:** `tests/audit-pipeline.test.js` (issue abierto que cubre un hallazgo; auditoría anterior).
  - **C8:** las rondas de abajo.
  - **C9:** `npm test`, `npm run validate` y `tests/docs-facts.test.js` con la guía.
- **Las rondas (R29), a cargo del Lead, después de la Tarea 5.** Ronda 1: al menos tres proyectos de `~/Desktop/03_PROYECTOS/01_ACTIVOS`, de pilas distintas, uno de ellos este repositorio en un clon quieto de `main` con las ramas remotas. Por proyecto, una sesión headless del Lead del árbol de desarrollo (`scripts/aether-lead --plugin-dir <árbol>/plugins/aether -p '/aether:audit'`, y `--resume <sesión> -p '<respuesta>'`), con la respuesta a la pregunta de temas escrita antes en el archivo de la ronda y, en al menos un proyecto, los temas nombrados en la invocación. Cada ronda deja `specs/026-project-audit/rounds/round-N.md` con lo que enumera R29. Las rondas 2 y 3 repiten los proyectos donde hubo defectos del skill (A8). Lo que una ronda encuentre en el código de las Tareas 2 a 5 se corrige con una tarea de corrección aparte, no se oculta en el skill.
- **No hay despliegue.** El merge a `main`, el push y el release quedan para el dueño (spec, «Irreversible actions»), por eso este plan no tiene `## Deployment`.

## Assumptions

- **P1. La compuerta de R13 y la de R15 son código; el Lead no puede subir un hallazgo a «verificado» con la mano.** Base: C4 y el defecto documentado de `claude-code-security-review` (research.md, patrón 3). Reversible: mover la regla al texto del skill.
- **P2. Los ids de los vocabularios están en inglés** (`proven`, `read-confirmed`, `proposal`, `refuted`, `unverified`; `P0`..`P3`; `S`, `M`, `L`) y el reporte los traduce por tabla. Base: el código y los archivos intermedios son para máquinas y para el Lead.
- **P3. Una regresión va antes que el costo de esperar dentro de un nivel** (D4). Reversible: es una línea de `audit-triage.js` y su prueba.
- **P4. Los hotspots se miden sobre los últimos 12 meses de historial**, con puntaje `cambios × log2(líneas + 1)`, al menos dos cambios y los diez primeros. Base: R8 pide el orden por frecuencia y tamaño, y que un archivo grande casi inmóvil quede debajo de uno que cambia mucho.
- **P5. Una rama es «vieja» a los 60 días sin un commit, y un issue «viejo» a los 90** (el prototipo usa «2 meses» y «más de 90 días»). Reversible: dos constantes.
- **P6. La carpeta de una auditoría es `<clave>/<AAAA-MM-DD>` con `-2`, `-3` si ya hay otra ese día.** Base: R24 dice «con la fecha» sin más.
- **P7. Los tests de las rondas y del análisis se corren con un entorno sin variables que parezcan secretos y con `CI=true`.** Base: R4 («como los corren el desarrollador y el CI») y la mitigación de credenciales de «Irreversible actions».
- **P8. La profundidad de lectura de un comando de tests es de cinco niveles y 40 scripts, y lo ilegible no se corre** (D3). Base: la pregunta de la revisión del plan. Reversible: dos constantes.
- **P9. `report.json` es el reporte completo y es lo que la auditoría siguiente lee.** Base: R18 y R24.
- **P10. El análisis admite un idioma de etiquetas `es` o `en`.** Cualquier otro idioma recibe `en` y el Lead lo traduce. Base: R3, sin una tabla por idioma.
- **P11. El skill y las pruebas del skill (Tarea 1) las hace el Lead;** las tareas 2 a 6 las hacen delegados. La primera versión del skill sale de los contratos de este plan y las rondas la corrigen.

## Risks

- **Correr código del proyecto auditado** (R4). Mitigaciones del plan: la lectura de D3 con cierre por defecto, el tope de tiempo, el entorno sin secretos, `--no-tests`, y las fotografías antes y después. Riesgo que queda: un script que hace daño sin que ninguno de los patrones lo nombre (por ejemplo un binario propio del proyecto). Los patrones son datos y crecen con lo que las rondas encuentren.
- **Falsos «no se corrió».** Un `test` que pasa por `playwright` o por `e2e` en un proyecto que levanta su propio servidor se rechazará. Es el error seguro; el Lead puede pasar `--tests-command` con un comando que sí sea seguro y se lo leerá igual.
- **Dependencias no instaladas.** Solo Node detecta que faltan (`node_modules`). En Python o PHP un test que falla por falta de dependencias parecerá un fallo del proyecto. Mitigación: el verificador lee la salida; la ronda lo dirá si ocurre.
- **Una fuga del valor de un secreto por el camino que no es el análisis** (un revisor que cita el archivo). El código garantiza el análisis, los `TODO` (el texto con un secreto se omite) y el reporte; el resto es una regla del skill, y las rondas lo comprueban buscando el valor en el registro de los delegados.
- **Historial enorme.** La búsqueda de secretos en todas las ramas lee `git log --all -p` con tope de tiempo y de bytes; si se corta, la revisión es `result` con `truncated: true` y el reporte lo dice en «No cubrí».
- **La sesión headless de una ronda puede terminar antes que sus delegados** (R29): lo cubre el relanzamiento descrito en el spec; no cambia el código.
- **Las pruebas fijan el conteo de comandos de `bin/`** en tres archivos; la Tarea 2 los actualiza a catorce. Otra rama que agregue un bin chocará con esto; el conflicto es evidente.
- **Dependencia de la Tarea 6 en las rondas.** Si se construye la guía antes de que exista `specs/026-project-audit/rounds/`, sus enlaces no resuelven; el Lead no la lanza hasta que exista `round-1.md` (la dependencia es del orden de trabajo del Lead, no de un archivo que una tarea posea).
- **El spec no contradice nada que impida el plan.** Una ambigüedad menor: R20 no dice si una regresión pesa más que el costo de esperar (P3 la resuelve).

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| La opción `--out <archivo>` de todos los subcomandos (D2) | R4 y R27: la salida del análisis (TODO, ramas, issues, hotspots) es demasiado grande para leerla entera en la salida de una herramienta del Lead; R6 y R25: el archivo debe quedar fuera del proyecto auditado | Pedir al Lead que redirija la salida con el shell obligaría a que el Lead escriba sin ninguna garantía de que quede fuera del proyecto y sin atomicidad |
| `lib/audit-common.js`, un archivo que solo lista los vocabularios cerrados y trae el error de uso y el lector de argumentos (D4) | R9 (los doce temas), R13 a R20 (tipos, veredictos, niveles, tamaños): el mismo vocabulario y el mismo lector de argumentos los usan seis módulos | Repetirlo en cada módulo rompería la regla de «ninguna función o constante definida dos veces»; ponerlo en `audit.js` crearía un ciclo, porque `audit.js` carga a los módulos |
| El ejecutor inyectable `exec` de los módulos de comandos externos (D3) | R27: las pruebas de `gh`, `npm audit`, `pip-audit` y de los tests del proyecto no deben necesitar la red, las herramientas ni gastar tokens | Llamar a `child_process` en cada módulo obligaría a poner en `PATH` programas falsos en cada prueba y no permitiría simular «sin red» ni «se agotó el tope» |
| Tablas de etiquetas en español y en inglés (D5) | R3 y R21: el reporte lo escribe el código en el idioma de la persona, con las secciones fijas por una prueba | Que el Lead redacte las once secciones cada vez haría que la forma del reporte (R21, C5) no se pudiera probar sin modelos |
