# Tasks: arreglar los puntos débiles de la auditoría y dejar que el Lead entre solo al modo plan

**Spec:** [spec.md](spec.md)

## Global Constraints

- Cada tarea empieza por las pruebas de su sección `Tests (write first)`: se escriben y se comprueba que fallan contra el código actual. Si una prueba ya pasa porque el hallazgo de la auditoría era falso (A7 de la spec), se conserva la prueba, no se toca el código de producción de ese punto y se dice en el informe de la tarea (R24).
- Se usan los ayudantes que ya tiene cada archivo de pruebas (`setup`, `human`, `guardBash`, `ownerTranscript`, `transcripts`, `world`, `compile`, `ensure`, `commitIn`, `useDataDir`, `ageRun`, `tempDir`, `makeRepo` y los de `tests/spend-fixtures.js`). Una prueba que cambia la conducta que otra fijaba se reescribe en la tarea que cambia el código.
- `lib/` no define un helper dos veces (`tests/guards.test.js`, R15), no deja identificadores sin usar y respeta las capas (`tests/layers.test.js`). Lo que dos módulos necesitan va a `plugins/aether/lib/common.js`.
- Las pruebas no dependen de ventanas de reloj estrechas: usan `now` inyectado, procesos sincronizados por archivos o márgenes holgados (R14).
- Ninguna tarea toca un archivo fuera de su `Owns`, nada bajo `specs/` ni `.specify/`, y ninguna ejecuta una acción irreversible (`merge-main`, `push`, `publish`, `deploy`, `paid-call`) ni llama a un modelo de pago (R25).
- Los bins de esta rama se llaman por su ruta (`node plugins/aether/bin/aether-<nombre>`), no por el `PATH`.
- Cada parte de `aether-session-start` queda en 9.800 caracteres o menos, también desde una ruta de instalación de 400 caracteres (`tests/session-start-parts.test.js`).

## Aether Execution
- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US3] Rechazar citas del dueño dentro de una frase que niega la acción, en `plugins/aether/lib/autonomy.js` → Task 1
- [ ] T002 [P] [US1] Evaluar todas las clases irreversibles de la línea y analizar los heredocs de shell, en `plugins/aether/lib/guard.js` → Task 2
- [ ] T003 [US1, US2] Exigir permiso por clase, proteger `grants.json` y `run.json` y fallar cerrado, en `plugins/aether/lib/guard.js` → Task 3
- [ ] T004 [P] [US4] Escribir el estado del run de forma atómica, en `plugins/aether/lib/run.js` → Task 4
- [ ] T005 [P] [US5] Crear `runShell` y `withLock` en `plugins/aether/lib/common.js` → Task 5
- [ ] T006 [P] [US6] Probar la paridad de los globs del workflow con `lib/globs.js`, en `tests/globs.test.js` → Task 6
- [ ] T007 [P] [US6] Quitar las ventanas de tiempo estrechas de las pruebas de Muse, Grok y lane-marks → Task 7
- [ ] T008 [P] [US6] Cubrir el ciclo completo de delegación en `tests/delegate-mod.test.js` y `plugins/aether/hooks/delegate.test.ts` → Task 8
- [ ] T009 [P] [US7] Corregir la documentación de `aether-exam`, `Tier`, `Ladder`, `npm test` y el versionado `0.x` → Task 9
- [ ] T010 [P] [US8] Dar nombre accesible a `#motion`, contraste a los pasos, 404 fija y Pages fijado → Task 10
- [ ] T011 [US5] Terminar el grupo de procesos al vencer las comprobaciones, en `delegate-checks.js`, `plan-compile.js` y `exam.js` → Task 11
- [ ] T012 [US4, US5] Conservar el trabajo sin integrar en `sweepRun` y `sweepStale`, y matar el grupo en `settleMerge`, en `plugins/aether/lib/worktrees.js` → Task 12
- [ ] T013 [US5] Archivar bajo bloqueo y archivar las líneas `outcome` del registro de delegados en `spend-archive.js` y `spend.js` → Task 13
- [ ] T014 [US5] Resumir y podar la observación bajo bloqueo, en `plugins/aether/lib/observe-digest.js` → Task 14
- [ ] T015 [US5] Podar el registro de delegados a 30 días archivando antes sus `outcome`, en `delegate-prune.js`, `delegate-log.js` y `session-start.js` → Task 15
- [ ] T016 [US9] Enseñar al Lead a entrar y salir del modo plan, en `skills/using-aether/SKILL.md` y las guías → Task 16

---

### Task 1: Rechazar citas del dueño dentro de una frase que niega la acción

**Aether:**
- Review: xhigh — una prohibición del dueño recortada y registrada como permiso deja pasar una acción irreversible o un modelo caro
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `plugins/aether/lib/delegate-authorize.js`, `tests/autonomy.test.js`, `tests/delegate-authorize.test.js`
- Depends on: none
- Serves: R5, R24

**Interfaces:**

En `plugins/aether/lib/autonomy.js`:

- `verifyQuote(sessionId, quote, { configDir, allowNegation = false } = {})` devuelve `{ ok: true, time }` o `{ ok: false, reason }`. `verifyWith` recibe el mismo `allowNegation`.
- Con `allowNegation: false`, la cita vale si alguna aparición suya en un mensaje del dueño no está negada. Si todas lo están, devuelve exactamente `{ ok: false, reason: "the quote is in a negated clause of the owner's message" }`.
- Una aparición está negada cuando, en la cláusula del mensaje que la contiene, se cumple una de estas tres condiciones (los negadores son palabras enteras, sin acentos ni mayúsculas: `no`, `nunca`, `jamas`, `tampoco`, `ni`, `not`, `never`, `don't`, `dont`, `do not`, `doesn't`, `cannot`, `can't`, `won't`):
  1. hay un negador en la cláusula antes del inicio de la cita;
  2. la primera palabra de la cita es un negador;
  3. la cita contiene la palabra `ni`.
- Una cláusula termina en `.`, `;`, `:`, `!`, `?`, `,`, un salto de línea o una de las palabras `pero`, `sino`, `aunque`, `mas`, `but`, `however`, `although`. `sin` y `without` no son negadores. Un `no` dentro de la cita que no es su primera palabra no la niega.
- `revoke` llama a `verifyQuote(..., { configDir, allowNegation: true })`. `grant`, `start`, `brakeOff`, `check`, `list` y `statusReader` usan el valor por defecto.

En `plugins/aether/lib/delegate-authorize.js`: `authorize`, `holds` y `startStepOf` siguen llamando a `autonomy.verifyQuote` sin `allowNegation`; el motivo llega como `error` de `authorize`.

**Tests (write first):**

En `tests/autonomy.test.js`:

```js
test('a quote taken from a negated clause is refused, and sin, a plain repeat and a negated revocation are not (R5)', (t) => {
  const NEGATED = 'Por ahora no hagas push a origin ni publiques nada.'
  const SIN = 'Haz push sin preguntarme cuando terminen las pruebas.'
  const NIGHT = 'Trabaja toda la noche sin parar hasta cerrar la lista.'
  const EN = "Please don't run all night on this branch, never push anything."
  const lines = [NEGATED, SIN, NIGHT, EN, 'ya no fusiones a main sin preguntarme', HOURS].map((text, i) => human(text, `2026-10-09T19:0${i}:00.000Z`))
  const { configDir, mainRoot } = setup(t, { [SESSION]: lines })
  const denied = { ok: false, reason: "the quote is in a negated clause of the owner's message" }

  for (const quote of ['hagas push a origin ni publiques nada', 'publiques nada', 'push a origin', 'run all night on this branch', 'push anything']) {
    assert.deepEqual(autonomy.verifyQuote(SESSION, quote, { configDir }), denied, quote)
    assert.equal(autonomy.verifyQuote(SESSION, quote, { configDir, allowNegation: true }).ok, true, quote)
  }
  assert.deepEqual(autonomy.grant(mainRoot, { class: 'push', quote: 'hagas push a origin ni publiques nada', session: SESSION }, { configDir, now: T0 }), denied)
  assert.equal(fs.existsSync(grantsFile(mainRoot)), false, 'a refused grant writes nothing')
  assert.deepEqual(autonomy.start(mainRoot, { quote: 'run all night on this branch', session: SESSION }, { configDir, now: T0 }), denied)
  assert.equal(autonomy.openRun(mainRoot), null)

  for (const quote of ['Haz push sin preguntarme', 'Trabaja toda la noche sin parar', HOURS]) {
    assert.equal(autonomy.verifyQuote(SESSION, quote, { configDir }).ok, true, quote)
  }
  assert.equal(autonomy.grant(mainRoot, { class: 'push', quote: 'Haz push sin preguntarme', session: SESSION }, { configDir, now: T0 }).ok, true)
  assert.equal(autonomy.start(mainRoot, { quote: 'Trabaja toda la noche sin parar', session: SESSION }, { configDir, now: T0 }).ok, true)
  assert.equal(autonomy.revoke(mainRoot, { class: 'merge-main', quote: 'ya no fusiones a main sin preguntarme', session: SESSION }, { configDir, now: T0 }).ok, true)
})

test('a quote that is negated in one message and plain in another is accepted (R5)', (t) => {
  const { configDir } = setup(t, {
    [SESSION]: [human('No hagas push a origin todavia.', '2026-10-09T19:00:00.000Z'), human('Ahora sí, puedes hacer push a origin cuando quieras.', '2026-10-09T19:05:00.000Z')],
  })
  assert.equal(autonomy.verifyQuote(SESSION, 'push a origin', { configDir }).ok, true)
})
```

En `tests/delegate-authorize.test.js`:

```js
test('authorize refuses an owner quote taken from a negated sentence, and writes nothing (R5)', (t) => {
  const w = world(t, { sessions: { [SESSION]: ['Por favor no uses Sonnet en esta tarea ni pases a Opus.', SONNET_WORDS] } })
  const refused = authorized(w, { model: 'sonnet', quote: 'uses Sonnet en esta tarea', task: 't-neg' })
  assert.equal(refused.ok, false)
  assert.match(refused.error, /negated clause/)
  assert.equal(authorizeLines(w.dataDir).length, 0)
  const accepted = authorized(w, { model: 'sonnet', quote: 'pásalo a Sonnet para esto', task: 't-neg' })
  assert.equal(accepted.ok, true)
})
```

**Acceptance:**

- `node --test tests/autonomy.test.js tests/delegate-authorize.test.js tests/quota-brake.test.js tests/aether-autonomy.test.js` pasa en verde.
- Las citas que ya usan las pruebas existentes (`MERGE`, `HOURS`, `REVOKE`, `OPUS_WORDS`, `SONNET_WORDS`) siguen valiendo.

---

### Task 2: Evaluar todas las clases irreversibles de la línea y analizar los heredocs de shell

**Aether:**
- Review: xhigh — un script escondido en un heredoc o una segunda acción detrás de la primera pasaría sin permiso
- Area: guard
- Owns: `plugins/aether/lib/guard.js`, `tests/guard-heredoc.test.js`, `tests/guard.test.js`
- Depends on: none
- Serves: R1, R2, R24

**Interfaces:**

En `plugins/aether/lib/guard.js`:

- `irreversibleClasses(command, cwd)` devuelve un arreglo con todas las clases irreversibles distintas de la línea, en orden de aparición: `'merge-main' | 'push' | 'publish' | 'deploy' | 'delete' | 'credentials'`. Recorre todos los segmentos, incluidas secuencias, tuberías, subshells, sustituciones y scripts anidados (`bash -c`, `eval`). `[]` si no hay ninguna. Se exporta.
- `irreversibleClass(command, cwd)` devuelve `irreversibleClasses(command, cwd)[0] ?? null`.
- Un segmento que invoca `bash`, `sh`, `zsh` o `dash` (tras `dropWrappers` y `nameOf`), sin `-c` y sin un archivo de script, o con `-s`, y que arranca un heredoc (`<<` o `<<-`; delimitador sin comillas, entre comillas o con barra) analiza el cuerpo del heredoc como script, con las mismas reglas y el mismo tope `MAX_NESTING` que `bash -c`. Un heredoc hacia otro comando (`cat`), hacia un shell que lee un archivo (`bash script.sh <<EOF`) o hacia `bash -c "…"` sigue siendo texto. Un heredoc anidado dentro del cuerpo de otro se analiza también.
- `segmentsOf` hace llegar a `matchWords` los cuerpos de los heredocs que cada segmento arrancó (por ejemplo, como una propiedad del arreglo de palabras del segmento); la forma exacta es de quien implementa.

**Tests (write first):**

En el archivo nuevo `tests/guard-heredoc.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { irreversibleClass, irreversibleClasses } = require('../plugins/aether/lib/guard.js')

test('irreversibleClasses lists every class of the line once, in order (R1)', () => {
  assert.deepEqual(irreversibleClasses('git push origin main && npm publish'), ['push', 'publish'])
  assert.deepEqual(irreversibleClasses('npm publish; npm publish --tag next | cat'), ['publish'])
  assert.deepEqual(irreversibleClasses('echo $(gh pr merge 7) && rm -rf ~ && git push'), ['merge-main', 'delete', 'push'])
  assert.deepEqual(irreversibleClasses('ls -la'), [])
  assert.equal(irreversibleClass('git push origin main && npm publish'), 'push')
  assert.equal(irreversibleClass('ls -la'), null)
})

test('a shell that takes its script from a heredoc is read like bash -c (R2)', () => {
  for (const [command, cls] of [
    ["bash <<'EOF'\nnpm publish\nEOF", 'publish'],
    ['sh <<-EOF\n\tgit push origin main\n\tEOF', 'push'],
    ['env bash <<EOF\ngh pr merge 7\nEOF', 'merge-main'],
    ['zsh <<"END"\nnpm publish\nEND', 'publish'],
    ['dash <<\\END\nkubectl apply -f x.yaml\nEND', 'deploy'],
    ['bash -s <<EOF\nnpm publish\nEOF', 'publish'],
    ["bash <<'A'\nbash <<'B'\nnpm publish\nB\nA", 'publish'],
    ["bash <<'EOF' | tee out.log\ngit push origin main\nEOF", 'push'],
  ]) {
    assert.equal(irreversibleClass(command), cls, command)
  }
})

test('a heredoc that no shell runs as a script stays text (R2)', () => {
  for (const command of [
    "cat <<'EOF'\nnpm publish\nEOF",
    "bash script.sh <<'EOF'\nnpm publish\nEOF",
    'bash -c "echo ok" <<EOF\nnpm publish\nEOF',
    "git commit -F - <<'EOF'\nfix: do not npm publish\nEOF",
  ]) {
    assert.equal(irreversibleClass(command), null, command)
  }
  assert.equal(irreversibleClass("bash <<'EOF'\necho hi\nEOF\nnpm publish"), 'publish')
})
```

**Acceptance:**

- `node --test tests/guard-heredoc.test.js tests/guard.test.js tests/guard-intent.test.js tests/guard-merge-main.test.js tests/copies-classes.test.js` pasa en verde.
- `irreversibleClass` devuelve lo mismo que antes para toda línea sin heredoc de shell.

---

### Task 3: Exigir permiso por clase, proteger `grants.json` y `run.json` y fallar cerrado

**Aether:**
- Review: xhigh — es la barrera que decide si una acción irreversible corre sin permiso y si un agente puede falsificar permisos
- Area: guard
- Owns: `plugins/aether/lib/guard.js`, `tests/guard.test.js`, `tests/guard-intent.test.js`, `tests/guard-merge-main.test.js`
- Depends on: Task 2 — `decideBash` usa `irreversibleClasses` y la lectura de heredocs que esa tarea crea en el mismo archivo
- Serves: R1, R3, R4, R24

**Interfaces:**

En `plugins/aether/lib/guard.js`, `decideBash(input, env)`:

- **Una clase a la vez (R1).** Para cada clase de `irreversibleClasses(command, cwd)` consulta `check(mainRoot, cls, { session })`. Cada clase sin permiso vigente deja una entrada en `.aether/pending.jsonl` (una por clase, en orden, con `command` redactado y `mode`). Con `AETHER_IRREVERSIBLE=enforce` el comando se rechaza con el motivo de la primera clase sin permiso (el texto de hoy, con su clase). Si todas tienen permiso, devuelve `null` sin escribir nada.
- **Fuera de un repositorio (R4).** Si `repoPaths(cwd)` falla, permite sin registrar, como hoy. Ese `try` no cubre a `check`. Solo hay que llamar a `repoPaths` cuando hay alguna clase irreversible: un comando corriente no arranca procesos de `git`.
- **Registro ilegible (R4).** Si `check` lanza (JSON inválido, estructura inválida), la clase cuenta como sin permiso: se registra y, en `enforce`, se rechaza. En modo `log` se registra y se permite.
- **Escrituras protegidas (R3): una regla por mención, que no resuelve rutas ni sigue `cd`.** Un análisis de cada orden (qué argumento es el destino, qué opción lo adjunta, en qué directorio corre) dejó abierto un frente nuevo en cada ronda de la versión anterior de esta tarea: opciones adjuntas (`-t`), directorios, globs, `cd` en subshells y condicionales. Esta regla no entiende lo que hace la orden: mira los nombres. Rechaza siempre (con o sin `AETHER_IRREVERSIBLE`, solo en una sesión de Aether, como hoy; fuera de ella el guard no actúa) cualquier segmento que `segmentsOf` entrega (scripts anidados y cuerpos de heredoc de shell incluidos; un cuerpo de heredoc hacia otra orden no cuenta) cuando se cumple una de estas cuatro cosas, con el motivo: ``Aether's autonomy registry and run states are written only by aether-autonomy. Use `aether-autonomy` (grant, revoke, start, spend, end) instead of editing <lo que el segmento nombra>.``
  1. **Nombra un archivo protegido.** El texto del segmento, tal cual y sin quitar comillas, contiene `grants.json` o `run.json` con límite de nombre: ni precedido ni seguido de una letra, cifra, `_`, `.` o `-` (así `grants.json.bak` y `grants.jsonl` no cuentan). Esto incluye un segmento que solo asigna (`F=grants.json`), un `node -e` o un `python -c` cuyo código lo nombra, y un nombre relativo (`cd .aether/autonomy && echo x > grants.json`).
  2. **Nombra con un patrón.** Una palabra del segmento (sin comillas) que contiene `*`, `?`, `[` o `{a,b}` y alguno de los componentes `.aether` o `autonomy` alcanza `.aether/autonomy/grants.json` o `.aether/autonomy/auto-20261009-200000-ab12/run.json`. Para la coincidencia usa `globToRegExp` de `lib/globs.js` sobre cada alternativa de la llave (se expande un nivel de `{a,b}`; sin anidar), con el final de la ruta anclado y un prefijo cualquiera permitido. Ejemplos que se rechazan: `.aether/autonomy/grants.?son`, `.aether/autonomy/*.json`, `.aether/autonomy/*/run.json`, `.aether/autonomy/{grants,x}.json`.
  3. **Orden que borra, mueve o copia, con el directorio.** La orden (tras `dropWrappers` y `nameOf`) es una de `rm`, `rmdir`, `unlink`, `mv`, `cp`, `rsync`, `install`, `ln`, `chmod`, `chown`, `chgrp`, `truncate`, `shred`, `dd`, `tar`, `unzip`, `patch`, o `find` con `-delete`, `-exec` o `-execdir`, y una palabra del segmento, quitadas las comillas y un `/`, `/.` o `/*` final, termina en `.aether` o en `.aether/autonomy`, o es `autonomy`. Esto cubre `rm -rf .aether`, `mv .aether /tmp/x`, `cp -r /tmp/autonomy .aether/`, `cp -ft.aether/autonomy /tmp/x`, `cp --target-directory=.aether/autonomy /tmp/x`, `chmod -R 777 .aether`, `cd .aether && rm -r autonomy`.
  4. **Una redirección** (`>`, `>>`, `>|`, `&>`, `&>>`, con un descriptor delante o sin él) cuyo destino cumple 1, 2 o 3, sea cual sea la orden y aunque el segmento no tenga orden (`> .aether/autonomy/grants.json`). Las redirecciones de entrada (`<`, `<<`, `<&`, `0<&0`, `3</dev/null`) nunca cuentan, y un número de descriptor delante de `<` o `>` no es un argumento ni un nombre de script: lo que viene después sigue siendo la orden y su heredoc.
  
  **Se exceptúan de 1 a 3 (no de 4)** las órdenes de solo lectura: `echo`, `printf`, `cat`, `less`, `more`, `head`, `tail`, `grep`, `egrep`, `fgrep`, `rg`, `ls`, `stat`, `file`, `wc`, `diff`, `cmp`, `jq`, `test`, `[`, `sed` sin `-i`/`--in-place`, `sort` sin `-o`, `find` sin `-delete`/`-exec`/`-execdir`/`-fprint`, `git` salvo `clean`, `rm`, `mv`, `restore` y `checkout`, y `gh`. También se exceptúa `aether-autonomy` (la orden, o `node` cuyo primer argumento que no es una opción termina en `/aether-autonomy`), que es el escritor autorizado de los registros. Una orden que no está en esas listas y nombra un archivo protegido (1 o 2) se rechaza, haga lo que haga.
  
  **Límites conocidos, que se documentan en un comentario de `guard.js` y que NO son hallazgos de esta tarea ni hay que cerrarlos:** un nombre que el comando construye al ejecutarse (variables como `${F}nts.json`, sustituciones de comando, `eval`, un programa que arma la ruta, escritura por cifrado o por `printf` de partes), `cd .aether/autonomy` seguido de un patrón que no nombra los archivos (`rm *`), y el falso positivo de que, en una sesión de Aether, cualquier orden fuera de la lista de solo lectura que nombre otro archivo llamado `grants.json` o `run.json` (por ejemplo, `python train.py --config run.json` en un proyecto del dueño) también se rechaza. No sigas `cd`, ni subshells, ni `&&`/`||`, ni resuelvas rutas contra `cwd`: la regla funciona por los nombres precisamente para no tener que hacerlo.
  
  Leer esos archivos (`cat`, `grep`, `ls`), escribir `diary.md`, `brief.md` o un archivo de nombre parecido (`grants.json.bak`), y `mkdir .aether/runs/x` o `rm -rf .aether/worktrees/old` siguen permitidos.

**Tests (write first):**

En `tests/guard.test.js` (usa `guardBash`, `ownerTranscript`, `PUSH_QUOTE`, `REASON`, `readPending` y `pendingFile` del archivo). Reescribe la prueba «a grant registry that cannot be read allows the command and records nothing»: fijaba la conducta que R4 corrige.

```js
test('a chain needs a grant for every irreversible class it holds, heredocs included (R1, R2)', (t) => {
  const repo = makeRepo(t)
  const configDir = tempDir(t, 'aether-claude-')
  ownerTranscript(configDir, 's1', PUSH_QUOTE)
  assert.equal(autonomy.grant(repo.dir, { class: 'push', quote: PUSH_QUOTE, session: 's1' }, { configDir }).ok, true)

  const alone = guardBash(t, 'git push origin main', { cwd: repo.dir, mode: 'enforce', configDir })
  assert.equal(alone.stdout, '')
  assert.equal(fs.existsSync(pendingFile(repo.dir)), false)

  const chained = guardBash(t, 'git push origin main && npm publish', { cwd: repo.dir, mode: 'enforce', configDir })
  assert.equal(JSON.parse(chained.stdout).hookSpecificOutput.permissionDecisionReason, REASON('publish'))
  const heredoc = guardBash(t, "bash <<'EOF'\nnpm publish\nEOF", { cwd: repo.dir, mode: 'enforce', configDir })
  assert.equal(JSON.parse(heredoc.stdout).hookSpecificOutput.permissionDecision, 'deny')
  assert.deepEqual(readPending(repo.dir).map((e) => e.class), ['publish', 'publish'])
})

test('with no grant at all, each class of a chain is recorded and the command is allowed in log mode (R1)', (t) => {
  const repo = makeRepo(t)
  const r = guardBash(t, 'git push origin main && npm publish', { cwd: repo.dir })
  assert.equal(r.stdout, '')
  assert.deepEqual(readPending(repo.dir).map((e) => [e.class, e.mode]), [['push', 'log'], ['publish', 'log']])
})

test('Bash cannot name the autonomy registry or a run state unless it only reads them (R3)', (t) => {
  const repo = makeRepo(t)
  const run = '.aether/autonomy/auto-20261009-200000-ab12/run.json'
  for (const command of [
    'echo "{}" > .aether/autonomy/grants.json',
    'cat extra >> .aether/autonomy/grants.json',
    'tee .aether/autonomy/grants.json </dev/null',
    'cp /tmp/fake.json .aether/autonomy/grants.json',
    'mv .aether/autonomy/grants.json /tmp/saved.json',
    `mv /tmp/fake.json ${run}`,
    'rm -f .aether/autonomy/grants.json',
    `sed -i 's/a/b/' ${run}`,
    `truncate -s 0 ${path.join(repo.dir, '.aether/autonomy/grants.json')}`,
    '> .aether/autonomy/grants.json',
    "bash <<'EOF'\ncat > .aether/autonomy/grants.json\nEOF",
    'bash -c "echo {} > .aether/autonomy/grants.json"',
    "bash 3</dev/null <<'EOF'\necho x > .aether/autonomy/grants.json\nEOF",
    "bash 0<&0 <<'EOF'\necho x > .aether/autonomy/grants.json\nEOF",
    "cd .aether/autonomy && echo '{}' > grants.json",
    "cd .aether/autonomy && (cd /tmp); echo '{}' > grants.json",
    "cd .aether/autonomy || cd /tmp; echo '{}' > grants.json",
    "printf '{}' | tee .aether/autonomy/grants.?son",
    'tee .aether/autonomy/*/run.json < /dev/null',
    'rm .aether/autonomy/{grants,x}.json',
    "F=grants.json; echo '{}' > .aether/autonomy/$F",
    `python3 -c "open('.aether/autonomy/grants.json','w').write('{}')"`,
    `node -e "require('fs').writeFileSync('.aether/autonomy/grants.json','{}')"`,
    'rm -rf .aether',
    'rm -rf .aether/autonomy',
    'mv .aether /tmp/saved-aether',
    'chmod -R 777 .aether',
    'cp -r /tmp/autonomy .aether/',
    'cp -ft.aether/autonomy /tmp/fake.json',
    'cp --target-directory=.aether/autonomy /tmp/fake.json',
    'cd .aether && rm -r autonomy',
  ]) {
    const r = guardBash(t, command, { cwd: repo.dir })
    const out = JSON.parse(r.stdout)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny', command)
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /written only by aether-autonomy/, command)
  }
  for (const command of [
    'cat .aether/autonomy/grants.json',
    'grep push .aether/autonomy/grants.json',
    'ls .aether/autonomy',
    'echo note >> .aether/autonomy/auto-20261009-200000-ab12/diary.md',
    'echo x > .aether/autonomy/grants.json.bak',
    'rm -f .aether/autonomy/grants.json.bak',
    'git commit -m "document grants.json"',
    'gh issue create --body "grants.json and run.json"',
    'echo grants.json',
    'node plugins/aether/bin/aether-autonomy grant --class push --quote "no toques grants.json"',
    'mkdir -p .aether/runs/x',
    'rm -rf .aether/worktrees/old',
    'rm *.json',
    'jq . .aether/autonomy/grants.json',
  ]) {
    assert.equal(guardBash(t, command, { cwd: repo.dir }).stdout, '', command)
  }
  assert.equal(guardBash(t, 'echo "{}" > .aether/autonomy/grants.json', { cwd: repo.dir, marked: false }).stdout, '')
})

test('a grant registry that cannot be read fails closed: the command is recorded, and refused in enforce mode (R4)', (t) => {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, '.aether', 'autonomy'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'autonomy', 'grants.json'), '{ not json')
  const enforced = guardBash(t, 'git push origin main', { cwd: repo.dir, mode: 'enforce' })
  assert.equal(enforced.status, 0, enforced.stderr)
  assert.equal(JSON.parse(enforced.stdout).hookSpecificOutput.permissionDecision, 'deny')
  const logged = guardBash(t, 'git push origin main', { cwd: repo.dir })
  assert.equal(logged.stdout, '')
  assert.deepEqual(readPending(repo.dir).map((e) => [e.class, e.mode]), [['push', 'enforce'], ['push', 'log']])
})
```

**Acceptance:**

- `node --test tests/guard.test.js tests/guard-heredoc.test.js tests/guard-intent.test.js tests/guard-merge-main.test.js tests/copies-classes.test.js tests/guards.test.js tests/layers.test.js` pasa en verde.
- Fuera de un repositorio git sigue permitiendo sin registrar (la prueba existente «outside a git repository a push is allowed silently» sigue en verde).
- Cada línea de las dos listas de la prueba R3 es un caso que la regla debe resolver tal como está escrito. Si una línea de la lista de rechazo no se rechaza, o una de la lista de permiso se rechaza, la tarea no está terminada; si el revisor propone otro caso fuera de estas listas y de la sección de límites conocidos, es una propuesta, no un bloqueo.

---

### Task 4: Escribir el estado del run de forma atómica

**Aether:**
- Area: run-state
- Owns: `plugins/aether/lib/run.js`, `tests/run.test.js`
- Depends on: none
- Serves: R8, R24

**Interfaces:**

En `plugins/aether/lib/run.js`:

- `writeJson(file, value)` crea el directorio padre, escribe `JSON.stringify(value, null, 2) + '\n'` en un archivo temporal único del mismo directorio (`.<nombre>.<pid>.<hex>.tmp`, por ejemplo) y lo renombra sobre `file` con `fs.renameSync`. Si la escritura o el renombrado lanzan, borra el temporal y propaga el error; el contenido anterior de `file` queda intacto. No deja archivos temporales tras una escritura exitosa.

**Tests (write first):**

En `tests/run.test.js` (añade `writeJson` y `readJson` al `require` de `run.js`):

```js
test('writeJson writes a temporary file beside the target and renames it over the target (R8)', (t) => {
  const dir = tempDir(t)
  const target = path.join(dir, 'nested', 'units.json')
  writeJson(target, { a: 1 })
  assert.deepEqual(readJson(target), { a: 1 })
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['units.json'])

  const real = fs.writeFileSync
  const written = []
  t.mock.method(fs, 'writeFileSync', (file, ...rest) => {
    written.push(String(file))
    return real(file, ...rest)
  })
  writeJson(target, { a: 2 })
  t.mock.restoreAll()
  assert.equal(written.length, 1)
  assert.notEqual(written[0], target, 'it never writes the target in place')
  assert.equal(path.dirname(written[0]), path.dirname(target), 'the temporary file is in the same directory')
  assert.deepEqual(readJson(target), { a: 2 })
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['units.json'])
})

test('a crash while writing leaves the previous file whole and no temporary file (R8)', (t) => {
  const dir = tempDir(t)
  const target = path.join(dir, 'graph.json')
  writeJson(target, { a: 1 })
  const real = fs.writeFileSync
  t.mock.method(fs, 'writeFileSync', (file, data, ...rest) => {
    real(file, String(data).slice(0, 4), ...rest)
    throw new Error('simulated crash')
  })
  assert.throws(() => writeJson(target, { a: 2, big: 'x'.repeat(100) }), /simulated crash/)
  t.mock.restoreAll()
  assert.deepEqual(readJson(target), { a: 1 })
  assert.deepEqual(fs.readdirSync(dir), ['graph.json'])
})
```

**Acceptance:**

- `node --test tests/run.test.js tests/aether-wt.test.js tests/aether-plan.test.js tests/plan-relaunch.test.js tests/worktrees-ensure.test.js` pasa en verde.

---

### Task 5: Crear `runShell` y `withLock` en `lib/common.js`

**Aether:**
- Review: xhigh — es el bloqueo del que dependen el gasto, la observación y el registro de delegados, y el ejecutor que mata procesos
- Area: shared
- Owns: `plugins/aether/lib/common.js`, `plugins/aether/lib/lane-marks.js`, `tests/common.test.js`
- Depends on: none
- Serves: R9, R10, R11, R12, R24

**Interfaces:**

En `plugins/aether/lib/common.js` (se exportan los dos; `tests/common.test.js` fija la lista exacta de exportaciones, que esta tarea actualiza):

- `runShell(command, { cwd, timeoutMs, env = process.env, maxBuffer = 64 * 1024 * 1024 } = {})` devuelve un objeto con la forma de `spawnSync`: `{ status, signal, stdout, stderr, error, pid }`, con `stdout` y `stderr` como texto. Ejecuta `sh -c <command>` con `detached: true` (el shell es líder de su grupo) y manda su salida a archivos temporales, que borra al terminar, en vez de a tuberías, para que un nieto que las conserve no deje la llamada colgada. Al vencer `timeoutMs` mata al shell y después a todo el grupo con `killGroup(pid)`; entonces `status` es `null` y `error.code === 'ETIMEDOUT'`. No lanza.
- `withLock(target, fn, { waitMs = 2000, staleMs = 10000 } = {})` es el `withLock` privado de `lane-marks.js` con esas dos constantes como opciones y sin otro cambio de conducta: crea `<target>.lock` con `wx`, espera a que otro lo suelte, rompe un bloqueo con más de `staleMs`, y si no lo consigue en `waitMs` corre `fn` sin él. Devuelve lo que devuelve `fn` y borra su bloqueo al terminar. No es reentrante.

En `plugins/aether/lib/lane-marks.js`: importa `withLock` de `common.js` y borra el suyo, con `LOCK_WAIT_MS` y `LOCK_STALE_MS` pasados como opciones.

**Tests (write first):**

En `tests/common.test.js`: actualiza la prueba de la lista de exportaciones (añade `runShell` y `withLock`; cambia «nineteen» por el número que resulte) y añade:

```js
test('runShell returns spawnSync-shaped output and the exit status (R9)', (t) => {
  const dir = tempDir(t)
  const ok = common.runShell('echo out; echo err 1>&2', { cwd: dir, timeoutMs: 5000 })
  assert.deepEqual([ok.status, ok.stdout, ok.stderr, ok.error], [0, 'out\n', 'err\n', undefined])
  const bad = common.runShell('exit 3', { cwd: dir, timeoutMs: 5000 })
  assert.equal(bad.status, 3)
})

test('runShell kills the whole process group when the timeout ends, and does not wait for a grandchild that holds the output (R9)', (t) => {
  const dir = tempDir(t)
  const pidFile = path.join(dir, 'child.pid')
  const started = Date.now()
  const r = common.runShell(`sleep 60 & echo $! > '${pidFile}'; wait`, { cwd: dir, timeoutMs: 400 })
  assert.ok(Date.now() - started < 10000, 'the call returns soon after the timeout')
  assert.equal(r.status, null)
  assert.equal(r.error.code, 'ETIMEDOUT')
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      common.sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false, 'the background child is dead')
})

test('withLock holds <target>.lock while fn runs and removes it after (R10)', (t) => {
  const target = path.join(tempDir(t), 'x.json')
  const seen = common.withLock(target, () => fs.existsSync(`${target}.lock`) && 'held')
  assert.equal(seen, 'held')
  assert.equal(fs.existsSync(`${target}.lock`), false)
  assert.throws(() => common.withLock(target, () => { throw new Error('boom') }), /boom/)
  assert.equal(fs.existsSync(`${target}.lock`), false, 'the lock goes even when fn throws')
})

test('withLock breaks a stale lock and runs without the lock when it cannot get it (R10)', (t) => {
  const target = path.join(tempDir(t), 'x.json')
  fs.writeFileSync(`${target}.lock`, '')
  const old = new Date(Date.now() - 60 * 1000)
  fs.utimesSync(`${target}.lock`, old, old)
  assert.equal(common.withLock(target, () => 'ran'), 'ran')
  assert.equal(fs.existsSync(`${target}.lock`), false, 'the stale lock was broken and then released')
  fs.writeFileSync(`${target}.lock`, '')
  assert.equal(common.withLock(target, () => 'ran', { waitMs: 50 }), 'ran')
  assert.equal(fs.existsSync(`${target}.lock`), true, 'a lock that is not ours is left alone')
})

test('withLock serialises four processes that read, add one and write a counter (R10)', async (t) => {
  const dir = tempDir(t)
  const counter = path.join(dir, 'counter')
  fs.writeFileSync(counter, '0')
  const script = `
    const common = require(${JSON.stringify(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'common.js'))})
    for (let i = 0; i < 50; i++) common.withLock(process.argv[1], () => {
      const n = Number(require('node:fs').readFileSync(process.argv[1], 'utf8'))
      common.sleepSync(1)
      require('node:fs').writeFileSync(process.argv[1], String(n + 1))
    }, { waitMs: 60000 })`
  await Promise.all([0, 1, 2, 3].map(() => new Promise((resolve, reject) => {
    const child = require('node:child_process').spawn(process.execPath, ['-e', script, counter], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })))
  assert.equal(fs.readFileSync(counter, 'utf8'), '200')
})
```

**Acceptance:**

- `node --test tests/common.test.js tests/lane-marks.test.js tests/lane-start-marks.test.js tests/guards.test.js tests/layers.test.js` pasa en verde.
- `lane-marks.js` ya no define un `withLock` propio.

---

### Task 6: Probar la paridad de los globs del workflow con `lib/globs.js`

**Aether:**
- Area: tests
- Owns: `tests/globs.test.js`
- Depends on: none
- Serves: R15, R24

**Interfaces:**

Sin cambios de código de producción. `plugins/aether/workflows/run.workflow.js` copia de `lib/globs.js` tres funciones y una constante (`WILDCARD`, `normalizePattern`, `isGlob`, `globToRegExp`), entre el comentario «The glob matcher of lib/globs.js, written out because a workflow has no modules» y la función `groupItems`. La prueba extrae ese bloque del texto del workflow y lo compara con el módulo.

**Tests (write first):**

En `tests/globs.test.js` (añade `fs`, `path` y `globToRegExp`, `isGlob` al `require` de `lib/globs.js` si faltan):

```js
test('the glob functions that run.workflow.js copies behave as lib/globs.js on edge patterns and paths (R15)', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'workflows', 'run.workflow.js'), 'utf8')
  const start = text.indexOf('const WILDCARD')
  const end = text.indexOf('// Past eight items')
  assert.ok(start > 0 && end > start, 'the copied block is found in the workflow')
  const copy = new Function(`${text.slice(start, end)}\nreturn { normalizePattern, isGlob, globToRegExp }`)()
  const lib = require('../plugins/aether/lib/globs.js')

  const patterns = ['`src/api/**`', './docs/', ' web\\login\\form.tsx ', '**', '*', 'src/*.js', 'src/**/index', 'a/**/b/*', 'f?.txt', '././x/', 'plain/file.md', '`', '']
  const paths = ['src/api/v1/users', 'src/api/index', 'src/apix/index', 'docs/guide/lanes', 'docs', 'web/login/form.tsx', 'a/x/b/c', 'a/b/c', 'f1.txt', 'f10.txt', 'x/y', 'plain/file.md', 'src/a.js', 'src/deep/a.js', 'src/index']
  for (const pattern of patterns) {
    assert.equal(copy.normalizePattern(pattern), lib.normalizePattern(pattern), `normalizePattern(${JSON.stringify(pattern)})`)
    assert.equal(copy.isGlob(pattern), lib.isGlob(pattern), `isGlob(${JSON.stringify(pattern)})`)
    assert.equal(copy.globToRegExp(pattern).source, lib.globToRegExp(pattern).source, `globToRegExp(${JSON.stringify(pattern)})`)
    for (const file of paths) {
      assert.equal(copy.globToRegExp(pattern).test(file), lib.globToRegExp(pattern).test(file), `${pattern} against ${file}`)
    }
  }
})
```

**Acceptance:**

- `node --test tests/globs.test.js tests/globs-overlap.test.js` pasa en verde.
- Si las dos copias ya divergen, la prueba lo dice con el patrón que falla y la tarea alinea la copia del workflow con `lib/globs.js` (la copia solo existe porque un workflow no tiene módulos); en ese caso su `Owns` se amplía al workflow en el informe, no en silencio.

---

### Task 7: Quitar las ventanas de tiempo estrechas de las pruebas de Muse, Grok y lane-marks

**Aether:**
- Area: tests
- Owns: `tests/muse-quota.test.js`, `tests/grok-acp.test.js`, `tests/lane-marks.test.js`
- Depends on: none
- Serves: R14, R24

**Interfaces:**

Solo pruebas. Las ventanas de hoy:

- `tests/muse-quota.test.js` (líneas 161 a 182): dos pruebas esperan 300 y 600 ms reales frente a `POLL_MS = 250`. `refreshMuseQuota` ya acepta `wait` (la función que usa entre sondeos) y `now`.
- `tests/lane-marks.test.js`: el hijo arranca con `start = Date.now() + 1500` y el de la prueba del bloqueo roto exige `Date.now() - began < 1000`.
- `tests/grok-acp.test.js` línea 82: `elapsed >= 500 && elapsed < 2600` con `timeoutMs: 2600`.

**Tests (write first):**

Estas son las reescrituras; cada una debe seguir probando lo mismo y no depender del reloj:

En `tests/muse-quota.test.js`, las dos pruebas de espera usan un `wait` inyectado que hace en el sondeo exacto lo que hoy hace el temporizador:

```js
test('a refresh that starts while another holds the lock waits and returns the reading the holder saved, without calling muse', async (t) => {
  const dataDir = useDataDir(t)
  const log = useFake(t, { stdout: out(completed('ok'), usage(allowance(72, 40))) })
  assert.deepEqual(takeLock(lockFile(dataDir), { pid: process.pid, since: NOW, until: NOW + 60000 }, NOW), { taken: true, holder: null })
  let polls = 0
  const wait = async () => {
    polls++
    if (polls === 1) {
      fs.mkdirSync(path.dirname(observedFile(dataDir)), { recursive: true })
      fs.writeFileSync(observedFile(dataDir), JSON.stringify({ observedAt: NOW, window: { usedPercent: 72, resetsAtMs: NOW + 3 * HOUR }, weekly: { usedPercent: 40, resetsAtMs: NOW + 5 * 24 * HOUR } }))
      fs.rmSync(lockFile(dataDir), { force: true })
    }
  }
  const reading = await refreshMuseQuota({ command: FAKE_MUSE, now: () => NOW, wait })
  assert.ok(polls >= 1)
  assert.deepEqual(Object.keys(reading.windows).sort(), ['5h', 'weekly'])
  near(reading.windows['5h'].remaining, 0.28)
  near(reading.windows.weekly.remaining, 0.6)
  assert.equal(fs.existsSync(log), false, 'no muse call was made')
})
```

y la segunda («a waiter that finds the holder's record still empty…») igual: el primer `wait` escribe el registro del bloqueo (`{ pid, since: NOW, until: NOW + 60000 }`), el segundo escribe la lectura y quita el bloqueo, con `now: () => NOW + 1000`.

En `tests/lane-marks.test.js`: el padre crea los cuatro hijos, y solo después escribe un archivo `start` con `Date.now() + 300`; cada hijo, antes de su primer intento, espera con `Atomics.wait` hasta que el archivo existe y toma de él la hora de arranque. La prueba del bloqueo viejo borra la aserción `Date.now() - began < 1000` (la de `fs.existsSync(`${file}.lock`) === false` ya distingue «roto» de «esperó y corrió sin él»).

En `tests/grok-acp.test.js` línea 82: la aserción pasa a `elapsed >= 500 && elapsed < 2600 + 5000` (un agente que no contesta devuelve `null` dentro del timeout más el margen de terminar al proceso), y el resto de la prueba queda igual.

**Acceptance:**

- `node --test tests/muse-quota.test.js tests/lane-marks.test.js tests/grok-acp.test.js` pasa en verde, también con la máquina cargada (`for i in 1 2 3; do node --test tests/muse-quota.test.js tests/lane-marks.test.js tests/grok-acp.test.js; done` sin un fallo).
- Ninguna de las tres pruebas contiene un `setTimeout` de espera fija seguido de una aserción sobre lo que otro proceso debía haber hecho para entonces.

---

### Task 8: Cubrir el ciclo completo de delegación en el motor y en el mod

**Aether:**
- Area: tests
- Owns: `tests/delegate-mod.test.js`, `plugins/aether/hooks/delegate.test.ts`
- Depends on: none
- Serves: R13, R24

**Interfaces:**

Solo pruebas. El ciclo, con el `aether-delegate` real (`plugins/aether/bin/aether-delegate`) y la escalera de `plugins/aether/config/ladder.json` (Haiku `high`, corrección a Haiku `xhigh`, un hallazgo repetido sube a Sonnet `high`):

1. `begin` por `createDelegates().toolCall` pone la tarea en Haiku `high`, aunque el Lead pida Opus `max`.
2. Un veredicto `approve` sobre un worktree sin cambios se rechaza (las comprobaciones sin modelo fallan).
3. Un veredicto `fix` con un hallazgo `file:line: qué falta` se registra y la siguiente llamada sube el esfuerzo a Haiku `xhigh` e inyecta `## Findings to fix`.
4. El mismo hallazgo otra vez sube la tarea a Sonnet `high`.
5. Con el archivo dentro de `AETHER-OWNS` y las pruebas pasando, `approve` cierra la tarea.

Si la escalera real se comporta distinto de lo que dice esta lista, la prueba sigue a `config/ladder.json` y a `lib/ladder.js`, no al revés.

**Tests (write first):**

En `tests/delegate-mod.test.js`:

```js
test('the whole delegation cycle with the real aether-delegate: begin on haiku, approve refused, fix, repeated finding rises to sonnet, approve (R13)', async (t) => {
  const fs = require('node:fs')
  const { spawnSync } = require('node:child_process')
  const { makeRepo, tempDir, PLUGIN } = require('./helpers.js')
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-e2e-deleg-')
  const env = { ...process.env, AETHER_DATA_DIR: dataDir }
  const ctx = { session: 's-e2e', dataDir, root: PLUGIN }
  const $ = {
    clock: { now: async () => Date.now() },
    fs: { write: async (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8') } },
    process: {
      run: async (argv, init = {}) => {
        const r = spawnSync(argv[0], argv.slice(1), { cwd: (init && init.cwd) || repo.dir, env, encoding: 'utf8', timeout: (init && init.timeoutMs) || 30000 })
        return { exitCode: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
      },
    },
  }
  const verdict = (...args) => {
    const r = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-delegate'), 'verdict', '--session', 's-e2e', '--task', 't-e2e', ...args], { cwd: repo.dir, env, encoding: 'utf8' })
    return JSON.parse(r.stdout.trim().split('\n').pop())
  }
  const brief = 'AETHER-TASK: t-e2e\nAETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\nImplement src/a.js.'
  const delegates = createDelegates()
  const seen = []
  const launch = (extra = {}) => delegates.toolCall($, { subagent_type: 'general-purpose', description: 'e2e', prompt: brief, ...extra }, async (event) => (seen.push(event), {}), ctx)

  await launch({ model: 'opus', effort: 'max' })
  assert.deepEqual([seen[0].model, seen[0].effort], ['haiku', 'high'])

  const refused = verdict('--verdict', 'approve', '--worktree', repo.dir)
  assert.equal(refused.ok, false, 'an approve with no edited file is refused')

  const finding = 'src/a.js:1: missing module.exports'
  const first = verdict('--verdict', 'fix', '--finding', finding)
  assert.deepEqual([first.ok, first.next.kind, first.next.step], [true, 'fix', 'haiku'])
  await launch()
  assert.deepEqual([seen[1].model, seen[1].effort], ['haiku', 'xhigh'])
  assert.match(seen[1].prompt, /## Findings to fix/)

  const second = verdict('--verdict', 'fix', '--finding', finding)
  assert.deepEqual([second.ok, second.next.kind, second.next.step, second.next.cause], [true, 'rise', 'sonnet', 'repeated'])
  await launch()
  assert.deepEqual([seen[2].model, seen[2].effort], ['sonnet', 'high'])

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'module.exports = 1\n')
  const approved = verdict('--verdict', 'approve', '--worktree', repo.dir)
  assert.equal(approved.ok, true, JSON.stringify(approved))
})
```

En `plugins/aether/hooks/delegate.test.ts` (archivo nuevo; sigue el patrón de `ops.test.ts`: `stubs(on, …)` con `mock.env`, `session.id`, `fs.exists` que marca la sesión, `fs.write`, `agent.spawn` y un `process.run` que responde cada verbo de `aether-delegate` desde una cola). Debe cubrir, por el motor y no por una llamada directa a `createDelegates`:

1. una llamada `Agent` de un `subagent_type` que no empieza por `aether:` se reescribe con el modelo y el esfuerzo del plan que devuelve `begin` y lleva sus notas como contexto;
2. una llamada `aether:judge` no se toca y `process.run` no se invoca;
3. el delegado en otro harness (`external` en el plan) corre su primer paso con `start` y `wait` en el mod y termina sin una petición al modelo;
4. un delegado de solo lectura en Claude pasa por el modelo y su última respuesta se registra con `answer`;
5. un `begin` que falla (`process.run` devuelve error) deja pasar la llamada tal como venía.

Antes de escribirlo, quien implementa mira cómo el motor de pruebas dispara `tool.call`, `agent.spawn` y `turn.step` (el skill `plugin-authoring` y `hooks/register.js`, líneas 552 a 610).

**Acceptance:**

- `node --test tests/delegate-mod.test.js` y `npm run test:mod` pasan en verde.
- La prueba de Node corre `begin` y `verdict` con el binario real, no con una respuesta fingida.

---

### Task 9: Corregir la documentación de `aether-exam`, `Tier`, `Ladder`, `npm test` y el versionado `0.x`

**Aether:**
- Area: docs
- Owns: `docs/reference/components.md`, `docs/contributing.md`, `docs/methodology.md`, `docs/getting-started.md`, `docs/purpose.md`, `docs/roadmap.md`, `docs/guide/design-seats.md`, `docs/guide/troubleshooting.md`, `docs/guide/models-by-role.md`, `tests/docs-facts.test.js`
- Depends on: none
- Serves: R16, R17, R18, R24

**Interfaces:**

- `docs/reference/components.md`, fila de `aether-exam`: dice `` Keeps an exam outside the repository (`store`) and runs it on a commit in a disposable worktree (`run`) ``; ninguna mención a `list`.
- `docs/methodology.md`, `docs/getting-started.md`, `docs/purpose.md`, `docs/roadmap.md`, `docs/guide/design-seats.md`, `docs/guide/troubleshooting.md` y `docs/guide/models-by-role.md`: ninguna línea ni frase presenta `Tier` o `Ladder` como campo del plan. Donde decían que la tarea elige su modelo, dicen lo que hace el sistema: el swarm arranca toda unidad en el primer peldaño de `config/ladder.json` (Haiku `high`), una corrección sube el esfuerzo y un fallo repetido sube de modelo, y `Review` (`high`, `xhigh` o `max`) fija el esfuerzo del supervisor y de la revisión final. El ejemplo de `getting-started.md` (línea con `- Tier:`) pierde esa línea. `troubleshooting.md` deja de enseñar los errores `missing Tier` y la línea `Ladder`, y da los mensajes que hoy emite `aether-plan check` (los de `plugins/aether/lib/plan.js` y `plan-compile.js`).
- `docs/contributing.md`:
  - el ejemplo de `tasks.md` pierde las líneas `- Tier:` y `- Ladder:`; al correr `aether-plan check` da exactamente `{"ok":true,"tasks":2,"waves":[["task-1","task-2"]],"warnings":[]}`, que es lo que la página muestra;
  - dice, tal cual, ``` `npm test` runs the bins, the libraries, the workflow scenarios and the documentation facts; it does not run the mod. ``` y ``` `npm run test:mod` runs `claude plugin test plugins/aether`: the mod, with the usage meter, ops and delegation, on the test engine with a simulated model. ```;
  - bajo `### Release` añade tal cual: ``` While the major version is 0, a minor version (`0.Y.0`) may break compatibility, and the changelog says so explicitly. ```

**Tests (write first):**

En `tests/docs-facts.test.js` (usa `read`, `FILES` y el `require` de `node:child_process` que falte):

```js
test('R16: no page gives aether-exam a list verb', () => {
  const row = read('docs/reference/components.md').split('\n').find((line) => line.startsWith('| `aether-exam` |'))
  assert.ok(row, 'components.md has the aether-exam row')
  assert.match(row, /`store`/)
  assert.match(row, /`run`/)
  assert.doesNotMatch(row, /`list`/)
  for (const file of FILES.filter((f) => f !== 'docs/changelog.md')) {
    assert.doesNotMatch(read(file), /aether-exam list/, file)
  }
})

test('R17: no page presents Tier or Ladder as a field of the plan, and the contributing example checks clean', (t) => {
  for (const page of ['docs/methodology.md', 'docs/getting-started.md', 'docs/contributing.md', 'docs/purpose.md', 'docs/roadmap.md', 'docs/guide/design-seats.md', 'docs/guide/troubleshooting.md', 'docs/guide/models-by-role.md']) {
    const text = read(page).replace(/[^\n]*\bTier\b[^\n]*(?:ignorado|ignored)[^\n]*/g, '')
    assert.doesNotMatch(text, /\bTier\b/, `${page} names Tier`)
    assert.doesNotMatch(text, /- (Tier|Ladder):/, `${page} shows a Tier or Ladder line`)
  }
  const contributing = read('docs/contributing.md')
  const example = contributing.match(/```\n(# Tasks:[\s\S]*?)```/)
  const shown = contributing.match(/```\n(\{"ok":true[^\n]*)\n```/)
  assert.ok(example && shown, 'the page has the example and its output')
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aether-contrib-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'tasks.md'), example[1])
  const r = require('node:child_process').spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-plan'), 'check', path.join(dir, 'tasks.md')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), shown[1])
  assert.match(shown[1], /"warnings":\[\]\}$/)
})

test('R18: contributing.md tells apart npm test and npm run test:mod, and states the 0.x policy', () => {
  const text = read('docs/contributing.md')
  assert.match(text, /`npm test` runs the bins, the libraries, the workflow scenarios and the documentation facts; it does not run the mod\./)
  assert.match(text, /`npm run test:mod` runs `claude plugin test plugins\/aether`: the mod, with the usage meter, ops and delegation, on the test engine with a simulated model\./)
  assert.match(text, /While the major version is 0, a minor version \(`0\.Y\.0`\) may break compatibility, and the changelog says so explicitly\./)
})
```

**Acceptance:**

- `node --test tests/docs-facts.test.js tests/docs-claims.test.js tests/docs-claims-rest.test.js tests/components-docs.test.js` pasa en verde.
- Las páginas siguen cumpliendo las reglas de `tests/docs-facts.test.js` (README de 160 líneas o menos, enlaces que resuelven, `aether-<nombre>` que existe).

---

### Task 10: Dar nombre accesible a `#motion`, contraste a los pasos, 404 fija y Pages fijado

**Aether:**
- Area: site
- Owns: `site/index.html`, `site/app.js`, `site/style.css`, `site/404.html`, `.github/workflows/pages.yml`, `tests/site.test.js`
- Depends on: none
- Serves: R19, R20, R21, R24

**Interfaces:**

- **R19.** El botón `#motion` de `site/index.html` lleva `aria-label="Pausar animación"` (el texto visible inicial). En `site/app.js`, `applyLang()` y `setMode()` asignan `$('#motion').setAttribute('aria-label', t(S.run ? 'motion.pause' : 'motion.play'))` y, en `setMode`, con `on` en lugar de `S.run`, el mismo texto que ponen en `#motion-l`. La regla `.motion span:last-child{display:none}` de pantallas estrechas no cambia.
- **R20.** En `site/style.css` (no `styles.css`: el archivo real), `.tl-n` y `.tl-all i` pasan de `color:var(--faint)` a `color:var(--dim)`. `--dim` es `#9a93c4` sobre `--ink` `#0d0b1c`, con relación de contraste mayor que 6 a 1. En `site/404.html`, la imagen `#lost` lleva `src="assets/img/hero.png"` y `data-src="assets/img/px/lost.gif?v=8"`, con un texto alternativo que describe la imagen fija; junto a ella un `<button type="button" id="play-lost">` con el texto «Ver animación / Play animation» que, al pulsarlo, pone `img.src = img.getAttribute('data-src')`. El GIF no se carga solo; el script de `prefers-reduced-motion` que había se borra porque ya no hace falta.
- **R21.** En `.github/workflows/pages.yml`: `actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4`, `actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa # v3` y `actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e # v4`; `permissions: {}` en la raíz del workflow; `permissions:` con `contents: read` en el job `build`; `permissions:` con `pages: write` e `id-token: write` en el job `deploy`.

**Tests (write first):**

En `tests/site.test.js` (usa `read`, `ROOT`, `SITE` y `withoutComments` del archivo). Reescribe la prueba existente «the workflow deploys only site/, with the permissions and the concurrency group Pages needs» (`tests/site.test.js` líneas 236–248) para que acepte las acciones fijadas por SHA y los permisos por job, y añade las pruebas de R19–R21:

```js
test('the workflow deploys only site/, with the permissions and the concurrency group Pages needs', () => {
  const yml = read(ROOT, '.github', 'workflows', 'pages.yml')
  assert.match(yml, /^\s*-\s*'site\/\*\*'/m)
  assert.match(yml, /actions\/upload-pages-artifact@[0-9a-f]{40}\b/)
  assert.match(yml, /actions\/deploy-pages@[0-9a-f]{40}\b/)
  assert.match(yml, /^\s*path:\s*site\s*$/m)
  assert.match(yml, /^\s*pages:\s*write/m)
  assert.match(yml, /^\s*id-token:\s*write/m)
  assert.match(yml, /^\s*contents:\s*read/m)
  assert.match(yml, /^\s*group:\s*pages\s*$/m)
  assert.match(yml, /name:\s*github-pages/)
  assert.doesNotMatch(yml, /secrets\./, 'the workflow uses no secrets')
})

test('R19: the motion button keeps an accessible name at every width and in both languages', () => {
  assert.match(read(SITE, 'index.html'), /<button[^>]*id="motion"[^>]*aria-label="Pausar animación"/)
  const js = read(SITE, 'app.js')
  assert.equal((js.match(/\$\('#motion'\)\.setAttribute\('aria-label'/g) || []).length >= 2, true, 'applyLang and setMode both set it')
})

test('R20: the step numbers of the flow meet WCAG AA and the 404 page is still by default', () => {
  const css = read(SITE, 'style.css')
  const color = (name) => css.match(new RegExp(`${name}:(#[0-9a-fA-F]{6})`))[1]
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  for (const selector of ['.tl-n', '.tl-all i']) {
    const rule = css.match(new RegExp(`${selector.replace('.', '\\.')}\\{([^}]*)\\}`))[1]
    const used = rule.match(/color:var\(--(\w+)\)/)[1]
    assert.ok(ratio(color(`--${used}`), color('--ink')) >= 4.5, `${selector} uses --${used}`)
    assert.ok(ratio(color(`--${used}`), color('--v3')) >= 4.5, `${selector} on --v3`)
  }
  const html = withoutComments(read(SITE, '404.html'))
  const img = html.match(/<img\b[^>]*id="lost"[^>]*>/)[0]
  assert.match(img, /\ssrc="assets\/img\/hero\.png"/)
  assert.match(img, /\sdata-src="assets\/img\/px\/lost\.gif\?v=8"/)
  assert.doesNotMatch(img, /\ssrc="[^"]*\.gif/)
  assert.match(html, /id="play-lost"/)
})

test('R21: pages.yml pins its actions by SHA and gives each job only the permissions it uses', () => {
  const yml = read(ROOT, '.github', 'workflows', 'pages.yml')
  const uses = [...yml.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1])
  assert.equal(uses.length, 3)
  for (const use of uses) assert.match(use, /^actions\/(checkout|upload-pages-artifact|deploy-pages)@[0-9a-f]{40}$/, use)
  assert.match(yml, /^permissions: \{\}\s*$/m)
  const build = yml.slice(yml.indexOf('\n  build:'), yml.indexOf('\n  deploy:'))
  const deploy = yml.slice(yml.indexOf('\n  deploy:'))
  assert.match(build, /permissions:\s*\n\s+contents: read/)
  assert.doesNotMatch(build, /pages: write|id-token: write/)
  assert.match(deploy, /permissions:\s*\n\s+pages: write\s*\n\s+id-token: write/)
  assert.doesNotMatch(yml.slice(0, yml.indexOf('\njobs:')), /contents: read|pages: write|id-token: write/)
})
```

**Acceptance:**

- `node --test tests/site.test.js` pasa en verde, con todos los activos de `site/` aún referenciados (el GIF `lost.gif` por `data-src`).

---

### Task 11: Terminar el grupo de procesos al vencer las comprobaciones

**Aether:**
- Area: worktrees
- Owns: `plugins/aether/lib/delegate-checks.js`, `plugins/aether/lib/plan-compile.js`, `plugins/aether/lib/exam.js`, `tests/delegate-checks.test.js`, `tests/exam.test.js`, `tests/baseline.test.js`, `tests/wt-gate.test.js`
- Depends on: Task 5 — usa `runShell` de `lib/common.js`
- Serves: R9, R24

**Interfaces:**

- `delegate-checks.runTests(worktree, command, { timeoutMs = 900000, tailChars = 4000 })` conserva su firma y su resultado `{ command, exitCode, passed, timedOut, outputTail }`; ejecuta con `common.runShell(command, { cwd: worktree, timeoutMs })` en lugar de `spawnSync`. `wt-gate.js` la usa y no cambia.
- `plan-compile.recordBaseline(cwd, testCommand, { timeoutMs = BASELINE_TIMEOUT_MS } = {})` usa `runShell`, conserva su resultado `{ recordedAt, durationMs, exitCode, signatures, timedOut }` y se exporta.
- `exam.runTest(command, cwd, timeoutSeconds)` usa `runShell`; conserva `{ exitCode, timedOut, output }`.

**Tests (write first):**

En `tests/delegate-checks.test.js`:

```js
test('runTests leaves no process alive after a timeout, whatever the shell started (R9)', (t) => {
  const repo = makeRepo(t)
  const pidFile = path.join(repo.dir, 'child.pid')
  const r = checks.runTests(repo.dir, `sleep 60 & echo $! > '${pidFile}'; wait`, { timeoutMs: 400 })
  assert.equal(r.timedOut, true)
  assert.equal(r.passed, false)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      require('../plugins/aether/lib/common.js').sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false)
})
```

En `tests/exam.test.js` (usa `repoWithSpec`, `writeExam`, `exam`, `tempDir`):

```js
test('a timed-out exam test leaves no process alive (R9)', (t) => {
  const repo = repoWithSpec(t)
  const data = tempDir(t, 'aether-data-')
  const pidFile = path.join(tempDir(t), 'exam-child.pid')
  const slow = { id: 'slow-tree', criterion: 'C1', command: `sleep 60 & echo $! > '${pidFile}'; wait`, files: [] }
  exam.store(repo.dir, FEATURE, writeExam(path.join(tempDir(t), 'exam'), [slow]), { dataDir: data })
  const result = exam.runExam(repo.dir, FEATURE, { dataDir: data, timeoutSeconds: 1 })
  assert.equal(result.tests[0].timedOut, true)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      require('../plugins/aether/lib/common.js').sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false)
})
```

En `tests/baseline.test.js`:

```js
test('recordBaseline stops the whole process group of a test run that outlives its timeout (R9)', (t) => {
  const dir = tempDir(t)
  const pidFile = path.join(dir, 'base.pid')
  const { recordBaseline } = require('../plugins/aether/lib/plan-compile.js')
  const result = recordBaseline(dir, `sleep 60 & echo $! > '${pidFile}'; wait`, { timeoutMs: 400 })
  assert.equal(result.timedOut, true)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      require('../plugins/aether/lib/common.js').sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false)
})
```

(Si `tests/baseline.test.js` no importa `tempDir`, `fs` o `path`, los añade.)

**Acceptance:**

- `node --test tests/delegate-checks.test.js tests/exam.test.js tests/baseline.test.js tests/wt-gate.test.js tests/aether-plan.test.js` pasa en verde.
- Ni `delegate-checks.js`, ni `plan-compile.js` ni `exam.js` llaman ya a `spawnSync` para ejecutar un comando de pruebas.

---

### Task 12: Conservar el trabajo sin integrar al cerrar y barrer un run, y matar el grupo en `settleMerge`

**Aether:**
- Review: xhigh — hoy cerrar o barrer un run borra los parches y las ramas de las unidades sin integrar, es decir, trabajo del usuario
- Area: worktrees
- Owns: `plugins/aether/lib/worktrees.js`, `tests/worktrees-cleanup.test.js`, `tests/worktrees-merge.test.js`, `tests/wt-sweep.test.js`, `tests/wt-save.test.js`
- Depends on: Task 5 — `settleMerge` usa `runShell` de `lib/common.js`
- Serves: R6, R7, R9, R24

**Interfaces:**

En `plugins/aether/lib/worktrees.js`:

- `savePatches(mainRoot, runId, interrupted)` devuelve además `retained`: la lista de tareas cuya rama `aether/<runId>/<tarea>` no está integrada en `graph.integration.branch`, o que no se puede juzgar porque el grafo no se puede leer. Sigue escribiendo el parche de cada una.
- `sweepRun(cwd, runId, { finish = false } = {})`:
  - no borra la rama de una tarea de `retained` (se añade a `remaining.branches`) y devuelve `retainedBranches: [<rama>, ...]`;
  - no borra `.aether/runs/<runId>/` mientras haya `retained`, `savedBranches`, un marcador sin verificar vivo, archivos en `patches/`, worktrees o ramas restantes; en ese caso `finished` es `false`;
  - una unidad integrada y limpia se barre como hasta ahora; sin trabajo pendiente, `--finish` sigue borrando la carpeta (`finished: true`).
- `sweepStale(cwd, { hours = 24, now })`: conserva `.aether/runs/<id>/` con las mismas condiciones (llama a `sweepRun` sin `finish`), no cuenta esa ejecución en `swept`, y registra `abandoned` una sola vez por ejecución aunque la barra otra vez. Las demás ramas de la conducta de hoy (`interrupted-saved`, marcador vivo) no cambian.
- `settleMerge`: ejecuta `graph.testCommand` con `common.runShell(graph.testCommand, { cwd: integration, timeoutMs, maxBuffer })` en lugar de `spawnSync`; conserva `status`, `stdout`, `stderr`, `error.code === 'ETIMEDOUT'` y el resultado de hoy.

**Tests (write first):**

En `tests/worktrees-cleanup.test.js` (añade `const run = require('../plugins/aether/lib/run.js')`):

```js
test('sweepRun --finish keeps the run directory, the patch and the branch of an unmerged unit, and removes a merged one (R6)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, one.path, 'src/t1/a.js', 'unmerged work\n', 'work on task-1')
  const two = ensure(repo.dir, args.runId, 'task-2')
  commitIn(repo, two.path, 'src/t2/a.js', 'merged work\n', 'work on task-2')
  assert.equal(merge(repo.dir, args.runId, 'task-2').merged, true)

  const r = sweepRun(repo.dir, args.runId, { finish: true })
  const patch = path.join(args.runDir, 'patches', 'task-1.patch')
  assert.deepEqual(r.patches, [patch])
  assert.equal(r.finished, false)
  assert.deepEqual(r.retainedBranches, [one.branch])
  assert.ok(r.remaining.branches.includes(one.branch))
  assert.match(fs.readFileSync(patch, 'utf8'), /\+unmerged work/)
  assert.equal(fs.existsSync(path.join(args.runDir, 'graph.json')), true)
  assert.notEqual(repo.git('branch', '--list', one.branch), '')
  assert.equal(repo.git('branch', '--list', two.branch), '')
})

test('sweepRun --finish still removes the run directory when everything is merged (R6)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const one = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, one.path, 'src/t1/a.js', 'work\n', 'work on task-1')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  const r = sweepRun(repo.dir, args.runId, { finish: true })
  assert.equal(r.finished, true)
  assert.equal(fs.existsSync(args.runDir), false)
})

test('sweepStale keeps the directory, the graph, the patch and the branch of a run with unmerged work, and records it once (R7)', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, one.path, 'src/t1/a.js', 'unmerged work\n', 'work on task-1')
  const patch = path.join(args.runDir, 'patches', 'task-1.patch')
  const abandoned = () => fs.readFileSync(path.join(run.dataDir(), 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.runId === args.runId && r.status === 'abandoned')

  ageRun(args, 48)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [] })
  assert.equal(fs.existsSync(patch), true)
  assert.equal(fs.existsSync(path.join(args.runDir, 'graph.json')), true)
  assert.notEqual(repo.git('branch', '--list', one.branch), '')

  ageRun(args, 96)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [] })
  assert.equal(fs.existsSync(patch), true, 'a second sweep does not delete the patch')
  assert.equal(abandoned().length, 1, 'the run is recorded as abandoned once')
})
```

Reescribe, en `tests/wt-sweep.test.js`, la prueba «sweep --finish without a marker removes the branch», que fija que cerrar un run con un worktree sin confirmar borra la carpeta del run: con R6 el parche se conserva, `finished` es `false` y la carpeta sigue (la parte del marcador, `junk` y el resto de sus aserciones que no dependen de esto se mantienen). Revisa también las pruebas de `sweepRun` y `sweepStale` de `tests/worktrees-cleanup.test.js` y de `tests/wt-save.test.js` que dependan de que una rama no integrada se borre.

En `tests/worktrees-merge.test.js` (usa `setup`, `setTestCommand`, `writeBaseline`, `commitIn`, `merge`; añade `const common = require('../plugins/aether/lib/common.js')`):

```js
test('merge stops the whole process group of a test run that timed out (R9)', (t) => {
  const { repo, args, unit } = setup(t)
  const pidFile = path.join(args.runDir, 'child.pid')
  setTestCommand(args.runDir, `sleep 60 & echo $! > '${pidFile}'; wait`)
  writeBaseline(args.runDir, [])
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const started = Date.now()
  const r = merge(repo.dir, args.runId, 'task-1', { timeoutMs: 500 })
  assert.equal(r.merged, false)
  assert.equal(r.timedOut, true)
  assert.ok(Date.now() - started < 10000)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      common.sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false)
})
```

**Acceptance:**

- `node --test tests/worktrees-cleanup.test.js tests/worktrees-merge.test.js tests/worktrees-ensure.test.js tests/worktrees-adopt.test.js tests/worktrees-salvage.test.js tests/wt-sweep.test.js tests/wt-save.test.js tests/aether-wt.test.js tests/merge-lock.test.js tests/lane-work.test.js tests/report.test.js tests/session-start.test.js` pasa en verde.
- Un run con todas sus unidades integradas se sigue cerrando y barriendo igual que antes.

---

### Task 13: Archivar el gasto bajo bloqueo y archivar las líneas `outcome` del registro de delegados

**Aether:**
- Review: xhigh — un error aquí pierde o duplica dólares del gasto archivado, o se pisan dos podas
- Area: spend
- Owns: `plugins/aether/lib/spend-archive.js`, `plugins/aether/lib/spend.js`, `tests/spend-races.test.js`, `tests/spend-prune.test.js`, `tests/spend.test.js`, `tests/install-dirs.test.js`
- Depends on: Task 5 — usa `withLock` de `lib/common.js`
- Serves: R10, R12, R24

**Interfaces:**

- `spend-archive.archiveSpend(dataDir, session, source, { prices })` (fuentes `'usage'` y `'lanes'`, como hoy) corre todo su cuerpo dentro de `common.withLock(path.join(dataDir, 'spend', '.' + session), fn, { waitMs: 10000, staleMs: 60000 })`; `withLock` le añade `.lock`, así que el archivo de bloqueo es `spend/.<session>.lock`. Conserva la relectura y la marca `through` de hoy. `withLock` no falla nunca: pasado el plazo corre sin bloqueo. Es un límite que el plan acepta (Design 8) para un mantenimiento que dura milisegundos: no lo cambies ni lo pruebes.
- NUEVA `spend-archive.archiveOutcomes(dataDir, session)` → `{ archived, lines }`:
  - devuelve `{ archived: false, lines: 0 }` para un nombre que no es id de sesión, y cuando el registro de delegados de esta instalación (`delegates/log.jsonl`, `delegateLog.logFile(dataDir)`) no existe o no tiene `outcome` de la sesión;
  - si los tiene, toma el mismo bloqueo de la sesión (`spend/.<session>`, mismos plazos), lee las líneas del registro que son JSON con `kind === 'outcome'` y `session` igual, y conserva su texto exacto; lee las líneas que ya tiene `spend/<session>.outcomes.jsonl`, si existe; escribe con `common.writeAtomic` la unión (primero lo que ya había, después las líneas nuevas que no estaban, comparadas por texto exacto); vuelve a leer el archivo y comprueba que cada línea del registro está en él; devuelve `{ archived: true, lines: <líneas añadidas por esta llamada> }`;
  - LANZA si no puede leer el registro (un error distinto de «no existe»), escribir o comprobar: quien la llama conserva entonces el registro;
  - una línea del registro que no se lee como JSON no se archiva (no se sabe de qué sesión es).
- `spend.js` exporta `outcomesFile(dataDir, id)` (`<dataDir>/spend/<id>.outcomes.jsonl`). `readOutcomeEvents` sigue devolviendo `{ events, complete }`, pero para las instalaciones de `run.installDirs(dataDir)` lee primero TODOS los `delegates/log.jsonl` y después TODOS los `outcomesFile`, con `readOutcomesIn` y el mismo conjunto `earlier`: una línea idéntica cuenta una sola vez aunque esté en el registro y en el archivo, o en dos instalaciones, y una línea distinta nunca se omite. Se lee el registro antes que el archivo porque el archivo se escribe antes de que se borre la línea del registro. No hay marcas de tiempo nuevas: `isSummary`, `through` y los resúmenes de hoy no cambian.

**Tests (write first):**

En `tests/spend-races.test.js` (usa `useDataDir`, `wrap`, `summaryPath`, `onDisk`, `report`, `close` y los de `spend-fixtures`; añade `outcome` al `require` de `spend-fixtures.js`, `archiveOutcomes` al de `spend-archive.js`, `outcomesFile` al de `spend.js` y `tempDir` al de `./helpers.js`):

```js
test('archiveSpend holds the session lock while it renames the summary, and releases it (R10)', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const lock = path.join(dataDir, 'spend', '.s1.lock')
  let heldDuringRename = null
  wrap(t, 'renameSync', (file) => file.startsWith(summaryPath(dataDir, 's1')), () => { heldDuringRename = fs.existsSync(lock) })
  assert.deepEqual(archiveSpend(dataDir, 's1', 'usage', { prices: PRICES }), { archived: true, events: 1 })
  assert.equal(heldDuringRename, true)
  assert.equal(fs.existsSync(lock), false)
})

test('a stale session lock does not stop archiveSpend (R10)', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const lock = path.join(dataDir, 'spend', '.s1.lock')
  fs.mkdirSync(path.dirname(lock), { recursive: true })
  fs.writeFileSync(lock, '')
  ageFile(lock, 1)
  assert.deepEqual(archiveSpend(dataDir, 's1', 'usage', { prices: PRICES }), { archived: true, events: 1 })
})

test('archiveOutcomes keeps the outcomes of a session in its own file, and the report counts them once while the log holds them and after it is gone (R12)', (t) => {
  const dataDir = useDataDir(t)
  const price = outcome(dataDir, 's-d', 3, 'm-b', 'output')
  close(report(dataDir, 's-d').usd, price)
  assert.deepEqual(archiveOutcomes(dataDir, 's-d'), { archived: true, lines: 1 })
  assert.deepEqual(archiveOutcomes(dataDir, 's-d'), { archived: true, lines: 0 })
  assert.equal(fs.readFileSync(outcomesFile(dataDir, 's-d'), 'utf8').trim().split('\n').length, 1)
  for (const phase of ['log still holds the outcome', 'log is gone']) {
    const after = report(dataDir, 's-d')
    close(after.usd, price)
    assert.equal(after.harness.calls, 1, phase)
    assert.equal(after.complete, true, phase)
    fs.rmSync(path.join(dataDir, 'delegates', 'log.jsonl'), { force: true })
  }
  assert.deepEqual(archiveOutcomes(dataDir, 's-d'), { archived: false, lines: 0 })
})

test('the same outcome in two installs is counted once, and a different one is never hidden (R12)', (t) => {
  const root = tempDir(t, 'aether-installs-')
  const home = path.join(root, 'data', 'aether-aether-plugin')
  const other = path.join(root, 'data', 'aether-inline')
  const same = outcome(home, 's-x', 2, 'm-b', 'output')
  outcome(other, 's-x', 2, 'm-b', 'output')
  const apart = outcome(other, 's-x', 1, 'm-b', 'output')
  close(report(home, 's-x').usd, same + apart)
  assert.deepEqual(archiveOutcomes(home, 's-x'), { archived: true, lines: 1 })
  fs.rmSync(path.join(home, 'delegates', 'log.jsonl'), { force: true })
  close(report(home, 's-x').usd, same + apart)
  close(report(other, 's-x').usd, same + apart)
})

test('archiveOutcomes throws when the log cannot be read, so the caller keeps it (R12)', (t) => {
  const dataDir = useDataDir(t)
  fs.mkdirSync(path.join(dataDir, 'delegates', 'log.jsonl'), { recursive: true })
  assert.throws(() => archiveOutcomes(dataDir, 's-e'))
  assert.equal(fs.existsSync(outcomesFile(dataDir, 's-e')), false)
})
```

Si las pruebas existentes de este archivo que ponen `wrap` sobre `readdirSync` o `renameSync` se ven afectadas por el bloqueo, se adaptan sin quitar lo que prueban. En `tests/spend-prune.test.js`, la prueba de cuatro procesos que ya existe sigue en verde con el bloqueo.

**Acceptance:**

- `node --test tests/spend.test.js tests/spend-bin.test.js tests/spend-ladder.test.js tests/spend-prune.test.js tests/spend-races.test.js tests/install-dirs.test.js tests/retired-journal.test.js tests/guards-spend.test.js tests/guards.test.js tests/layers.test.js` pasa en verde.
- Un resumen escrito antes de este cambio se lee y se suma igual (no se tocó su forma).
- Fuera de alcance, no lo pruebes ni lo corrijas: la ventana de milisegundos de `withLock` tras su plazo, y los `outcome` que otro proceso añada al registro mientras `archiveOutcomes` lo lee (la poda de la tarea 15 vuelve a archivar bajo su bloqueo).

---

### Task 14: Resumir y podar la observación bajo bloqueo

**Aether:**
- Area: observe
- Owns: `plugins/aether/lib/observe-digest.js`, `tests/observe-digest.test.js`
- Depends on: Task 5 — usa `withLock` de `lib/common.js`
- Serves: R11, R24

**Interfaces:**

En `plugins/aether/lib/observe-digest.js`:

- `digestSession`, `digestAll` y `pruneObserve` toman, cada una una sola vez, `common.withLock(path.join(dataDir, 'observe', '.summary'), fn, { waitMs: 10000, staleMs: 60000 })` (el archivo de bloqueo es `observe/.summary.lock`) alrededor de su lectura, fusión y escritura de `observe/summary.json`. El bloqueo no es reentrante: `pruneObserve` llama a variantes internas sin bloqueo de la fusión (la que hoy hace `digestAll`). Un evento podado se cuenta una sola vez en `pruned`, aunque dos procesos podan a la vez.
- Lo que R11 pide es que dos procesos que resumen o podan a la vez no pierdan ni dupliquen nada. NO pide, y no debes añadir ni probar, la conservación de un evento que `observe.appendEvent` agregue mientras `pruneObserve` reescribe `observe/events.jsonl`: `appendEvent` está fuera de lo que esta tarea posee, es una línea añadida con `appendFileSync` en el camino caliente de los hooks y no toma el bloqueo; esa ventana de milisegundos queda como límite conocido (déjalo escrito en un comentario junto a la reescritura). No modifiques `observe.js`.
- `withLock` no falla nunca: pasado el plazo corre sin bloqueo. Es un límite que el plan acepta (Design 8) para un mantenimiento que dura milisegundos: no lo cambies ni lo pruebes.

**Tests (write first):**

En `tests/observe-digest.test.js` (usa `seed`, `age`, `DAY`, `digest`, `observe`):

```js
test('digestSession and pruneObserve hold the summary lock while they write the summary (R11)', (t) => {
  const dir = tempDir(t)
  const now = Date.UTC(2026, 9, 23)
  seed(dir, 's-old', now - 40 * DAY)
  seed(dir, 's-new', now - DAY)
  const lock = path.join(dir, 'observe', '.summary.lock')
  const real = fs.renameSync
  const held = []
  t.mock.method(fs, 'renameSync', function (from, to, ...rest) {
    if (String(to) === path.join(dir, 'observe', 'summary.json')) held.push(fs.existsSync(lock))
    return real.call(this, from, to, ...rest)
  })
  digest.digestSession(dir, 's-new')
  digest.digestAll(dir)
  digest.pruneObserve(dir, { days: 30, now })
  t.mock.restoreAll()
  assert.ok(held.length >= 3)
  assert.equal(held.every(Boolean), true, 'the summary is only written under the lock')
  assert.equal(fs.existsSync(lock), false)
})

test('three processes pruning the same directory at once keep every session and count every pruned event once (R11)', async (t) => {
  const dir = tempDir(t)
  const now = Date.UTC(2026, 9, 23)
  const old = now - 40 * DAY
  const ids = ['s-a', 's-b', 's-c']
  for (const id of ids) {
    seed(dir, id, old)
    age(dir, id, old)
  }
  const go = path.join(dir, 'go')
  const script = `
    const fs = require('node:fs')
    const digest = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'observe-digest.js'))})
    const [dir, now, ready, go] = process.argv.slice(1)
    fs.writeFileSync(ready, '')
    const wait = new Int32Array(new SharedArrayBuffer(4))
    while (!fs.existsSync(go)) Atomics.wait(wait, 0, 0, 2)
    digest.pruneObserve(dir, { days: 30, now: Number(now) })`
  const readyFiles = ids.map((id) => path.join(dir, `ready-${id}`))
  const children = ids.map((id, i) => new Promise((resolve, reject) => {
    const child = require('node:child_process').spawn(process.execPath, ['-e', script, dir, String(now), readyFiles[i], go], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  }))
  const wait = new Int32Array(new SharedArrayBuffer(4))
  while (!readyFiles.every((f) => fs.existsSync(f))) Atomics.wait(wait, 0, 0, 5)
  fs.writeFileSync(go, '')
  await Promise.all(children)
  const sessions = digest.readSummary(dir).sessions
  assert.deepEqual(Object.keys(sessions).sort(), ids)
  for (const id of ids) {
    assert.equal(sessions[id].pruned.events.PostToolUseFailure, 2, id)
    assert.equal(sessions[id].pruned.events.PreCompact, 1, id)
  }
})

test('four processes digesting different sessions at once keep every session in the summary (R11)', async (t) => {
  const dir = tempDir(t)
  const script = `
    const observe = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'observe.js'))})
    const digest = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'observe-digest.js'))})
    const [dir, id] = process.argv.slice(1)
    for (let i = 0; i < 30; i++) {
      observe.appendEvent(dir, { time: 1000 + i, session: id, kind: 'PostToolUseFailure', tool: 'Bash' })
      digest.digestSession(dir, id)
    }`
  const ids = ['s-a', 's-b', 's-c', 's-d']
  await Promise.all(ids.map((id) => new Promise((resolve, reject) => {
    const child = require('node:child_process').spawn(process.execPath, ['-e', script, dir, id], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })))
  const sessions = digest.readSummary(dir).sessions
  assert.deepEqual(Object.keys(sessions).sort(), ids)
  for (const id of ids) assert.equal(sessions[id].events.PostToolUseFailure, 30, id)
})
```

La primera prueba (`digestSession and pruneObserve hold the summary lock while they write the summary (R11)`) es la que falla de forma determinista antes del arreglo; la segunda retiene a los tres hijos en el archivo `go` hasta que los tres han cargado el módulo y están listos para entrar en `pruneObserve` a la vez.

**Acceptance:**

- `node --test tests/observe-digest.test.js tests/observe.test.js tests/observe-read.test.js tests/observe-guarantees.test.js tests/guards-observe-1.test.js tests/guards-observe-2.test.js` pasa en verde.
- Las pruebas anteriores de este archivo siguen en verde. Si una prueba de `observe-guarantees` falla en tu entorno por una advertencia de proxy de Node en stderr (`UNDICI-EHPA`) y falla igual sin tu cambio, dilo en `concerns` y no la cuentes como fallo tuyo.

---

### Task 15: Podar el registro de delegados a 30 días archivando antes sus `outcome`

**Aether:**
- Review: xhigh — borra líneas del registro de delegados; un error pierde gasto o líneas que un delegado en marcha acaba de escribir
- Area: delegate
- Owns: `plugins/aether/lib/delegate-log.js`, `plugins/aether/lib/delegate-prune.js`, `plugins/aether/lib/session-start.js`, `tests/delegate-log.test.js`, `tests/session-start.test.js`
- Depends on: Task 5 — usa `withLock` de `lib/common.js`
- Depends on: Task 13 — archiva con `archiveOutcomes` de `lib/spend-archive.js` y `spend.js` lee ese archivo
- Serves: R12, R24

**Interfaces:**

En `plugins/aether/lib/delegate-log.js`:

- `appendEntry(dataDir, entry)` toma `common.withLock(path.join(dataDir, 'delegates', '.log'), fn, { waitMs: 10000, staleMs: 60000 })` (el archivo de bloqueo es `delegates/.log.lock`) alrededor de su `appendFileSync`; conserva su conducta de devolver `false` sin lanzar. `delegate-log.js` solo importa `node:fs`, `node:path`, `./run.js` y `./common.js`: nunca `spend.js` ni `spend-archive.js`, porque `spend.js` ya importa `delegate-log.js` y `tests/layers.test.js` prohíbe cualquier ciclo de `require` en `lib/`, incluidos los perezosos.

En el archivo nuevo `plugins/aether/lib/delegate-prune.js` (comentario de cabecera descriptivo de al menos 6 palabras con `// Family: delegate.`, importa `node:fs`, `node:path`, `./delegate-log.js`, `./spend-archive.js`, `./spend.js` y `./common.js`, sin dejar ningún nombre ni `require` sin usar):

- `pruneDelegateLog(dataDir, { days = 30, now = Date.now() } = {})` devuelve `{ pruned: [<sesión>, ...] }` (orden alfabético) y se exporta:
  - una sesión está vencida cuando la mayor `time` numérica de sus entradas es anterior a `now - days * 86400000`; una sesión sin ninguna `time` numérica, y las entradas sin `session`, se conservan;
  - para cada sesión vencida con identificador válido (`isSessionId` de `./spend.js`) llama a `archiveOutcomes(dataDir, session)` de `./spend-archive.js`; si lanza, deja rastro con `noteFailure(dataDir, 'delegates/<session>', err, now)` y conserva la sesión; si pasa, `clearFailure(dataDir, 'delegates/<session>')`;
  - después, bajo `common.withLock(path.join(dataDir, 'delegates', '.log'), …)` con los mismos plazos que `appendEntry` (`{ waitMs: 10000, staleMs: 60000 }`), y para cada sesión archivada: vuelve a llamar a `archiveOutcomes(dataDir, session)` (es idempotente y recoge cualquier `outcome` llegado entre la primera llamada y el bloqueo; si lanza, deja rastro con `noteFailure` y esa sesión se conserva), relee `delegates/log.jsonl`, quita las líneas de las sesiones archivadas (las líneas de otras sesiones, también las añadidas mientras tanto, y las que no se leen como JSON, se conservan tal cual y en su orden) y lo reescribe con `common.writeAtomic`. `withLock` no es reentrante: no llames a `appendEntry` desde dentro;
  - borra por antigüedad (`mtime` anterior a `now - days * 86400000`) los archivos de `delegates/in/`, `delegates/briefs/` y `delegates/external/`.
- `aether-report --delegates` no cambia: sigue leyendo `delegates/log.jsonl` y muestra solo las sesiones retenidas; el gasto de las podadas lo conserva `spend/<id>.outcomes.jsonl`, que `aether-report --spend` ya lee (tarea 13).

En `plugins/aether/lib/session-start.js`, `pruneOldFiles`: importa `{ pruneDelegateLog }` de `./delegate-prune.js` y llama a `pruneDelegateLog(dir, { days: 30 })` junto con `prune`, `pruneLog` y `pruneSessions`, dentro del mismo `try` y con su rastro `session-start`.

**Tests (write first):**

En `tests/delegate-log.test.js` (usa `log`; añade los `require` que falten: `fs`, `path`, `tempDir`, `{ pruneDelegateLog }` de `../plugins/aether/lib/delegate-prune.js`, `{ spendReport, outcomesFile }` de `../plugins/aether/lib/spend.js`, y `{ PRICES, T0, MIN, outcome, usdOf }` de `./spend-fixtures.js`; define `close` como en `tests/spend-races.test.js`):

```js
test('appendEntry and pruneDelegateLog hold delegates/.log.lock while they write or rename log.jsonl (R12)', (t) => {
  const dataDir = tempDir(t, 'aether-del-lock-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  const file = log.logFile(dataDir)
  const lock = path.join(dataDir, 'delegates', '.log.lock')
  const realAppend = fs.appendFileSync
  const realRename = fs.renameSync
  let heldOnAppend = null
  let heldOnRewrite = null
  t.mock.method(fs, 'appendFileSync', function (target, ...rest) {
    if (String(target) === file) heldOnAppend = fs.existsSync(lock)
    return realAppend.call(this, target, ...rest)
  })
  t.mock.method(fs, 'renameSync', function (from, to, ...rest) {
    if (String(to) === file) heldOnRewrite = fs.existsSync(lock)
    return realRename.call(this, from, to, ...rest)
  })
  assert.equal(log.appendEntry(dataDir, { kind: 'launch', task: 't-old', attempt: 1, session: 's-old', time: T0, step: 'haiku' }), true)
  assert.equal(heldOnAppend, true)
  assert.equal(fs.existsSync(lock), false)
  assert.deepEqual(pruneDelegateLog(dataDir, { days: 30, now }), { pruned: ['s-old'] })
  t.mock.restoreAll()
  assert.equal(heldOnRewrite, true)
  assert.equal(fs.existsSync(lock), false)
})

test('pruneDelegateLog archives the outcomes of sessions idle past the window, keeps a line appended meanwhile, and leaves --spend exact (R12)', (t) => {
  const dataDir = tempDir(t, 'aether-del-prune-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  const price = outcome(dataDir, 's-old', 1, 'm-b', 'output')
  log.appendEntry(dataDir, { kind: 'launch', task: 't-old', attempt: 1, session: 's-old', time: T0, step: 'haiku' })
  log.appendEntry(dataDir, { kind: 'launch', task: 't-new', attempt: 1, session: 's-new', time: now - DAY, step: 'haiku' })
  close(spendReport({ dataDir, session: 's-old', prices: PRICES }).usd, price)

  const file = log.logFile(dataDir)
  const real = fs.readFileSync
  let injected = false
  t.mock.method(fs, 'readFileSync', function (target, ...rest) {
    const out = real.call(this, target, ...rest)
    if (!injected && target === file) {
      injected = true
      fs.appendFileSync(file, JSON.stringify({ kind: 'launch', task: 't-live', attempt: 1, session: 's-live', time: now, step: 'haiku' }) + '\n')
    }
    return out
  })
  const res = pruneDelegateLog(dataDir, { days: 30, now })
  t.mock.restoreAll()

  assert.deepEqual(res, { pruned: ['s-old'] })
  assert.deepEqual([...new Set(log.readEntries(dataDir).map((e) => e.session))].sort(), ['s-live', 's-new'])
  assert.equal(fs.readFileSync(outcomesFile(dataDir, 's-old'), 'utf8').trim().split('\n').length, 1)
  const after = spendReport({ dataDir, session: 's-old', prices: PRICES })
  close(after.usd, price)
  assert.equal(after.harness.calls, 1)
  assert.equal(after.complete, true)
  assert.deepEqual(pruneDelegateLog(dataDir, { days: 30, now }), { pruned: [] })
})

test('an outcome of an idle session that arrives while the prune runs is archived too, never lost (R12)', (t) => {
  const dataDir = tempDir(t, 'aether-del-prune-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  const first = outcome(dataDir, 's-old', 1, 'm-b', 'output')
  const file = log.logFile(dataDir)
  const archived = outcomesFile(dataDir, 's-old')
  const late = { kind: 'outcome', id: 'd-5', time: T0 + 5 * MIN, session: 's-old', status: 'ok', harness: 'agy', model: 'm-b', effort: 'low', durationMs: 1, usage: { output: 1e6 }, attempt: 1 }
  const real = fs.renameSync
  let injected = false
  t.mock.method(fs, 'renameSync', function (from, to, ...rest) {
    const out = real.call(this, from, to, ...rest)
    if (!injected && String(to) === archived) {
      injected = true
      fs.appendFileSync(file, JSON.stringify(late) + '\n')
    }
    return out
  })
  const res = pruneDelegateLog(dataDir, { days: 30, now })
  t.mock.restoreAll()
  assert.deepEqual(res, { pruned: ['s-old'] })
  assert.equal(log.readEntries(dataDir).some((e) => e.session === 's-old'), false)
  close(spendReport({ dataDir, session: 's-old', prices: PRICES }).usd, first + usdOf({ model: 'm-b', agent: 'lane', output: 1e6 }))
})

test('pruneDelegateLog keeps a session whose outcomes cannot be archived, and removes old launch files (R12)', (t) => {
  if (process.getuid && process.getuid() === 0) return t.skip('chmod does not stop root')
  const dataDir = tempDir(t, 'aether-del-prune-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  outcome(dataDir, 's-stuck', 1, 'm-b', 'output')
  fs.mkdirSync(path.join(dataDir, 'spend'), { recursive: true })
  fs.chmodSync(path.join(dataDir, 'spend'), 0o500)
  t.after(() => fs.chmodSync(path.join(dataDir, 'spend'), 0o700))
  const oldIn = path.join(dataDir, 'delegates', 'in', 'old.json')
  const freshIn = path.join(dataDir, 'delegates', 'in', 'fresh.json')
  fs.mkdirSync(path.dirname(oldIn), { recursive: true })
  fs.writeFileSync(oldIn, '{}')
  fs.writeFileSync(freshIn, '{}')
  fs.utimesSync(oldIn, new Date(now - 31 * DAY), new Date(now - 31 * DAY))
  fs.utimesSync(freshIn, new Date(now - DAY), new Date(now - DAY))
  const res = pruneDelegateLog(dataDir, { days: 30, now })
  assert.deepEqual(res, { pruned: [] })
  assert.equal(log.readEntries(dataDir, { session: 's-stuck' }).length, 1)
  assert.equal(fs.existsSync(oldIn), false)
  assert.equal(fs.existsSync(freshIn), true)
})
```

En `tests/session-start.test.js` (usa `start`, `makeRepo`, `tempDir`):

```js
test('session start prunes the delegate log of sessions idle for 30 days and archives their outcomes first (R12)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const delegateLog = require('../plugins/aether/lib/delegate-log.js')
  const day = 24 * 3600 * 1000
  const oldTime = Date.now() - 40 * day
  delegateLog.appendEntry(data, { kind: 'outcome', id: 'd-1', task: 't-old', attempt: 1, session: 'old-session', time: oldTime, status: 'ok', harness: 'agy', model: 'some-model', effort: 'low', durationMs: 1, usage: { input: 1000, output: 1000 } })
  delegateLog.appendEntry(data, { kind: 'launch', task: 't-new', attempt: 1, session: 'new-session', time: Date.now() - day, step: 'haiku' })
  const r = start(repo.dir, data)
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual([...new Set(delegateLog.readEntries(data).map((e) => e.session))], ['new-session'])
  const archived = fs.readFileSync(path.join(data, 'spend', 'old-session.outcomes.jsonl'), 'utf8').trim().split('\n')
  assert.equal(archived.length, 1)
  assert.equal(JSON.parse(archived[0]).session, 'old-session')
})
```

**Acceptance:**

- `node --test tests/delegate-log.test.js tests/delegate-report.test.js tests/session-start.test.js tests/session-start-parts.test.js tests/spend-prune.test.js tests/install-dirs.test.js tests/delegate-task.test.js tests/guards.test.js tests/layers.test.js` pasa en verde.
- `aether-report --delegates` muestra solo las sesiones que quedan en `delegates/log.jsonl`, y `aether-report --spend` conserva el costo de las podadas.
- Fuera de alcance, no lo pruebes ni lo corrijas: la ventana de milisegundos de `withLock` tras su plazo.

---

### Task 16: Enseñar al Lead a entrar y salir del modo plan

**Aether:**
- Area: lead-rules
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `docs/guide/autonomy.md`, `docs/es/guias/feature-completa.md`, `docs/changelog.md`, `tests/docs-facts.test.js`
- Depends on: Task 9 — amplía `tests/docs-facts.test.js` después de los hechos que esa tarea añade
- Serves: R22, R24

**Interfaces:**

- `plugins/aether/skills/using-aether/SKILL.md`, bajo `## Plans`, una regla breve en inglés (el idioma del archivo) que diga: cuando el dueño pide explícitamente un plan, o antes de construir por «Spec and plan» o «Short design» en una sesión interactiva fuera de una corrida autónoma, el Lead carga las herramientas diferidas con `ToolSearch` (`select:EnterPlanMode,ExitPlanMode`), llama a `EnterPlanMode` por su cuenta, presenta el plan al dueño y, con su aprobación, llama a `ExitPlanMode` y construye. Nunca llama a `EnterPlanMode` en una sesión sin terminal (`claude -p`), en un subagente ni dentro de una corrida autónoma. Cada una de las cinco partes de `aether-session-start` sigue en 9.800 caracteres o menos (la regla es corta; si desborda, se recorta lo que sobre de `## Plans`, no otra sección).
- `docs/guide/autonomy.md` (inglés): un párrafo que dice que fuera de una corrida autónoma, en una sesión interactiva, el Lead entra por su cuenta al modo plan de Claude Code para mostrar el plan y sale tras el sí del dueño, y que no lo hace en `claude -p` ni en una corrida autónoma.
- `docs/es/guias/feature-completa.md` (español): el mismo párrafo, con la expresión «modo plan».
- `docs/changelog.md`: una línea bajo `## Unreleased` con el mismo hecho. El changelog de hoy no tiene esa sección (`docs/contributing.md` la nombra como convención de lanzamiento): se crea justo antes de `## Status`, sin tocar la primera línea `Version X.Y.Z:` ni las demás.

**Tests (write first):**

En `tests/docs-facts.test.js`:

```js
test('R22: the Lead rules load and use EnterPlanMode and ExitPlanMode in an interactive session, never in claude -p, a subagent or an autonomous run', () => {
  const skill = read('plugins/aether/skills/using-aether/SKILL.md')
  const plans = skill.slice(skill.indexOf('## Plans'), skill.indexOf('## The execution method'))
  for (const word of ['ToolSearch', 'EnterPlanMode', 'ExitPlanMode', 'claude -p', 'subagent', 'autonomous run']) {
    assert.ok(plans.includes(word), `the Plans section names ${word}`)
  }
  assert.match(read('docs/guide/autonomy.md'), /plan mode/i)
  assert.match(read('docs/es/guias/feature-completa.md'), /modo plan/i)
  const unreleased = read('docs/changelog.md').split('\n## ').find((section) => section.startsWith('Unreleased'))
  assert.ok(unreleased && /plan mode/i.test(unreleased), 'the changelog says it under Unreleased')
})
```

**Acceptance:**

- `node --test tests/docs-facts.test.js tests/session-start-parts.test.js tests/bootstrap-design.test.js tests/bootstrap-names.test.js` pasa en verde.
- Ningún cambio toca `plugins/aether/agents/lead.md` ni el lanzador (están fuera del alcance de la spec).
