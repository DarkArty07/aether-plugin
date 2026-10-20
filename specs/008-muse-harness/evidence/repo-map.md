# Dónde toca un harness en el repositorio

Barrido del 2026-10-19 hecho por un explorador (delegate task de solo lectura; el enrutador lo corrió en `grok-4.7` a `high`, en una copia desechable del checkout en `0482ba9`). Las referencias `archivo:línea` son suyas. `main` avanzó después hasta `3cafbce` con documentación del enrutador (A62), que no mueve ninguna de estas líneas de código.

**Verificado por el Lead:** `laneEnv` (`lib/lanes.js:433-467`), la forma de una entrada de `config/lanes.json`, que la versión es 0.12.5 y que la decisión libre es A63. **Lo demás es del explorador y no se ha releído línea por línea**: el Writer y el Judge lo comprueban contra el código.

## 1. El contrato del adaptador

Carga: `lib/harness/index.js:6-33`. `HARNESS_NAMES=['agy','codex','grok','cursor']` y `FACTORY={agy:createAgy,…}`; `createAdapter(name,{command,groups})` solo reenvía `command` y `groups` (línea 23). Un nombre fuera de la lista da `unknown harness`; `registerAdapter`/`unregisterAdapter` son para tests. Los llaman `lane-calls.js:518,541`, `seats.js:491-535`, `lane-quota.js:107-153` y `lane-readings.js:49`.

Un adaptador es un objeto con:
- `name`; `installed()` (`commandInstalled` por PATH, `lanes.js:190-201`); `version()`.
- `quota()` → `{groups:{[clave]: lectura}}`.
- `modelArg({model,level})`; `argv({model,level,schemaFile,timeoutSeconds,prompt,conversation})`.
- `parse({stdout,stderr,exitCode},{required,conversation})` → `{clean,reason,structured,usage,conversation}`.
- `usageDelta(prev,cur)`.
- Opcionales: `schemaInPrompt===true` (el JSON del schema va al final del prompt; si falta, el schema va en `--json-schema`, solo agy) y `quotaCost:'process'` (cachea la lectura `quotaLifeMinutes`; solo agy).

`aether-lane` no elige harness: `quota` va a `lane-quota.js`, `start/status` a `lane-calls.js`, `seat` a `seats.js`. El runner hace `spawn(argv[0], argv.slice(1), {cwd, detached, stdio, env: laneEnv})` (`lane-calls.js:372-381`, `seats.js:269-274`).

| | agy | codex | grok | cursor |
|---|---|---|---|---|
| argv | `agy -p <prompt> --model <id>-<nivel> --output-format json --json-schema <file> --dangerously-skip-permissions --print-timeout <N>s` (`agy.js:115-131`) | `codex exec <prompt> --model <id> -c model_reasoning_effort=<nivel> --json --sandbox workspace-write` (`codex.js:58-59`) | `grok -p <prompt> --always-approve --model <id> [--reasoning-effort <nivel>] --output-format json` (`grok.js:67-69`) | `cursor-agent -p --trust --approve-mcps --force <prompt> --model <id> --output-format json`; el nivel no se pasa (`cursor.js:48-49`) |
| salida | un JSON | JSONL: `item.completed`/`agent_message`, uso en `turn.completed` (`codex.js:13-34`) | un objeto; respuesta = primer string de `result\|response\|text\|output` | un objeto; respuesta = `result` |
| parse | propio: exit 0, `status==SUCCESS`, stderr vacío salvo NOTICE, `response` no vacío, `structured_output` con `required` (`agy.js:48-61,135-146`) | `structured.parseRun` (`structured.js:9,137-160`): exit 0 + objeto JSON dentro de la respuesta + `required` = limpio; si no, línea de cuota | igual que codex | igual que codex |
| cuota | lanza `agy -p /usage --output-format json` (60 s), mapea `groups` por nombre; grupo ausente o sin cubos → `{unknown:true}` (`agy.js:85-111`) | `unknownQuota`: todos los grupos `{unknown:true,windows:{}}` (`codex.js:49-50`) | lee `~/.grok/logs/unified.jsonl` sin lanzar proceso (`grok.js:55-58`, `grok-quota.js:46-48`); refresco aparte por ACP (`grok-acp.js:168-188`) | como codex |
| `usageDelta` | resta el acumulado | devuelve el turno | el turno | el turno |
| sandbox | ninguno (`--dangerously-skip-permissions`, A20) | `--sandbox workspace-write` | `--always-approve` | `--force` |

**Ausente, agotado y cura.** `installed()===false` → `start` da `{unavailable:'not-installed'}` (`lane-calls.js:298`) y el orden lo excluye (`lane-order.js:140-141`). Una lectura con alguna ventana `remaining<=reserve` (0.05, `config/lanes.json`) no es usable (`lane-order.js:15-21`). Las marcas viven en `lanes/marks/<harness>__<grupo>.json` (`lane-marks.js:3-17`): confirmada hasta el reinicio solo si la lectura muestra saldo bajo la reserva, si no `dryMarkMinutes` (60). El rechazo de agy («Individual quota reached», `quota-refusal.js:7-27`) marca 60 min y una lectura no lo levanta (A60). En codex, grok y cursor, `parseRun` pone `reason` `quota: …` si stderr o lo que está fuera de la respuesta casa con `/rate.?limit|quota|usage limit|too many requests|\b429\b/i`, y `judge` (`lane-calls.js:432-438`) lo trata como cuota. Una marca que vino de una lectura se levanta con una lectura sana más joven que `quotaLifeMinutes` (`liftIfHealthy`). Solo grok tiene refresco (`lane-quota.js:23-25`).

**Entorno y credenciales.** `laneEnv` (`lanes.js:433-467`) deja `HOME`, `PATH`, locales, `XDG_*` y `AETHER_*`, y tira toda variable con `TOKEN|KEY|SECRET`; apunta a un directorio vacío `GH_CONFIG_DIR`, `DOCKER_CONFIG` y `CLOUDSDK_CONFIG`, deja `NPM_CONFIG_USERCONFIG`, `AWS_*` y `KUBECONFIG` en `/dev/null` y pone `protocol.allow=never` en git. Ningún adaptador abre un archivo de login: cada CLI guarda el suyo bajo `HOME`.

**Cwd.** El swarm usa el worktree de la unidad o la copia lectora (`lane-calls.js:276-278,377`); los asientos y los delegates, un worktree desechable (`seats.js:487-518`). El runner mata el grupo de procesos al vencer el tiempo.

## 2. Dónde aparece cada harness

**Código que hay que tocar para que `muse` exista como lane** (si no, la opción lo descarta, `lanes.js:222-226`):
- `lib/harness/index.js:6-7` (lista y factory) y `lib/harness/muse.js`.
- `config/lanes.json:9-81`: entrada con `command`, `maxParallel`, `waitSeconds`, `quotaLifeMinutes`, `timeouts`, `groups` y `models`. Cada modelo lleva `group`, `replaces`, `roles`, `levels` (esfuerzo de Aether → esfuerzo del harness), `aa` y `note`. Hoy codex y cursor tienen `models: {}` (A37: sin modelos hasta una llamada real).
- `hooks/panel-view.mjs:9` (`HARNESS_NAMES`, copia que `tests/panel-conformance.test.js:34` exige igual) y `:17` (`READ_TIMEOUT_MS`); `hooks/panel-layout.mjs:391` pinta esa lista; `hooks/panel.jsx:3-4,15,21` comenta «four harnesses».
- `plugin.json:18-22`: la `description` de `userConfig.harnesses` lista `agy, codex, grok, cursor` (default `agy`); `tests/manifest.test.js:44` la compara byte a byte.

**Código que nombra harnesses sin ser el registro** (tocar solo si Muse entra en ese papel): el router y los delegates solo conocen agy y grok (`router-quota.js:17`, `router-renewal.js:20`, `delegate-calls.js:22`, `bin/aether-route:12,45,207`); `lane-quota.js:23-25` (refresco, solo grok); `scripts/build-models-index.js:32` (`HARNESSES=['claude','agy','codex','grok','cursor']`, por defecto `claude,agy,grok`, y cómo lista cada uno `:55-58`); `config/models/models.json` (`harnesses:[claude,agy,grok]`) y `harness-models.json`; `build-router-rungs.js:74`; `config/prices.json` (precios por id de modelo; no nombra harnesses).

**Genérico, sin nombrar a Muse:** `workflows/run.workflow.js` y `design.workflow.js` (el harness llega como token), `agents/*.md`, `hooks/register.js` y `ops-command.mjs` (`HARNESSES=/^[a-z]+(,[a-z]+)*$/`), `scripts/lane-smoke.js` y `refresh-lanes.js` (leen la tabla), `bin/aether-lane`, `bin/aether-session-start:96-99`.

**Prosa y docs que hay que actualizar** (listas fijas en la sección 5): `docs/guide/lanes.md`, `options.md`, `ops.md`, `docs/getting-started.md`, `README.md`, `CLAUDE.md`, `docs/changelog.md`, `docs/decisions.md`, `docs/models/README.md`, `skills/using-aether/SKILL.md` (el bootstrap), `skills/swarm/SKILL.md`, `site/index.html` y `site/app.js` (nodos y textos en español e inglés).

## 3. Selección y orden

- `AETHER_LANES`: `on` y Linux, si no las lanes no corren (`lanes.js:36-41`).
- `AETHER_LANE_HARNESSES`: lista separada por comas; `harnessNames` (`lanes.js:222-229`) recorta, pasa a minúsculas, exige que el nombre esté en `HARNESS_NAMES`, deduplica y conserva el orden; vacía o inválida → `['agy']`. Si el mod no ve la variable, `enabledFor` usa `graph.lanes.harnesses` (`lane-calls.js:175-182`).
- Candidatos del swarm: `lanesArgs` (`lanes.js:243-275`) recorre los habilitados en ese orden y, dentro, los modelos de la tabla cuyo `replaces` y `roles` encajan; `orderCandidates` (`lane-order.js:126-218`) pone primero los grupos con lectura por prioridad (saldo de la ventana más larga / horas al reinicio, mínimo 1 h), y detrás los de lectura desconocida; excluye `not-installed`, `marked`, `dry` y `reserve`. El workflow copia la regla a mano (`run.workflow.js:367-370`). Una lectura `unknown` es usable.
- `AETHER_SEATS`: `native|balanced|robust`, por defecto `balanced`; `designSeats` en `config/lanes.json:4-7` son listas `<harness>/<modelo>` por asiento; `chooseSeat` (`seats.js:76-134`) salta `harness-off`, `author`, `not-installed`, marca viva, cuota ilegible o bajo la reserva; el nativo va el último. Esfuerzo externo fijo: judge y examiner `high`, writer `xhigh` (`seats.js:40`).
- El router no usa este orden: solo agy y grok (A55).

## 4. Tests que nombran harnesses

- Adaptadores: `tests/harness-{agy,codex,grok,cursor,structured,index}.test.js` (`harness-index.test.js:12` fija el arreglo de cuatro), `harness-agy-usage.test.js`. Fakes: `tests/fixtures/fake-agy.js`, `fake-grok.js`, `fake-grok-acp.js`, `grok-acp-billing.jsonl`; codex y cursor inyectan `exec`.
- Panel: `tests/fixtures/panel/quota-{agy,codex,cursor,grok,grok-refresh,missing}.json`, `hooks/panel.test.tsx:8-17`, `tests/panel-view.test.js:159`, `panel-layout.test.js:30`, `panel-conformance.test.js`.
- Otros: `lanes.test.js`, `lane-*.test.js`, `aether-lane.test.js`, `seats.test.js`, `seat-calls.test.js`, `workflow-lanes.test.js`, `workflow-order.test.js`, `ops-command-lanes.test.js`, `models-index.test.js:448` (imprime `agy, codex, grok, cursor`), `roles.test.js:52` (párrafo entero del skill de swarm), `manifest.test.js:44`, `grok-quota.test.js`, `grok-acp.test.js`, `delegate-*.test.js`, `router-*.test.js`, `lanes-docs.test.js`.
- Versión: `tests/launcher.test.js:134-136` clava `manifest.version==='0.12.5'` y que el changelog conserva las líneas 0.12.x y anteriores; `tests/docs-facts.test.js` R11 ata el README y el changelog a `plugin.json`, y **R15 (`:540-546`) clava `Version 0.12.5:` y el nombre del handoff** de 0.12.5: publicar 0.13.0 lo rompe y hay que moverlo con un handoff nuevo. `tests/site.test.js` no nombra harnesses ni cuenta cuatro.

## 5. Textos con número o lista fija

`plugin.json:21`; `hooks/panel-view.mjs:9` y `lib/harness/index.js:6`; `panel.jsx:21` «four harnesses»; `panel.test.tsx:8`; `panel-layout.test.js:30`; `panel-view.test.js:159`; `docs/guide/lanes.md:15,19,33,47`; `docs/guide/options.md:28,52`; `docs/guide/ops.md:20`; `docs/getting-started.md:20`; `README.md:33`; `CLAUDE.md:30`; `docs/changelog.md:89`; `docs/decisions.md:217` (A37); `docs/models/README.md:16`; `skills/swarm/SKILL.md:28`; `skills/using-aether/SKILL.md:121`; `site/index.html:137,448`; `site/app.js:42,150,205,313,906` (`order=['agy','grok','codex','cursor']`); `scripts/build-models-index.js:4,10,32`. «other harnesses» / «otro harness» es genérico y no cuenta.

## 6. Decisiones relacionadas (`docs/decisions.md`)

A20 (lanes: la misma llamada en un harness externo; agotado o fallo vuelve al nativo), A21 (quién sustituye a haiku, sonnet u opus; reserva de 5 %; `max` siempre nativo), A28 (`lanes` es una opción, apagada, solo Linux), A30 (el mod ejecuta `aether-lane` sin modelo), A37 (registro de cuatro adaptadores; Codex y Cursor sin modelos hasta una llamada real), A39 y A40 (asientos y la opción `seats`), A49 (orden por cuota en riesgo, marca seca, caché de agy), A55 (el router manda delegates de solo lectura a agy o grok), A57 y A58 (panel `/harnesses`, una lectura de `aether-lane quota --json` por harness), A60 (marcas de 60 min que se curan con una lectura sana), A61 y A62 (el Lead arranca en `max`; el router hereda `max`).

## 7. Sitios de la versión

`plugins/aether/.claude-plugin/plugin.json:3`, `tests/launcher.test.js:136`, `README.md:16` (y el badge de `:14`), `docs/changelog.md:11` (`Version 0.12.5:`), más `tests/docs-facts.test.js:546` y el handoff `docs/handoff/2026-10-19-lanes-marks-lead-max-0.12.5.md`.
