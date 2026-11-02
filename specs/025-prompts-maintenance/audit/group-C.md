**Veredicto.** Los cuatro archivos suman 16,931 bytes. No son largos ni muy redundantes; el problema es que **se contradicen en puntos concretos**, sobre todo `help` y `setup`. Todo lo que nombran existe: bins, flags, opciones, rutas, las 18 guías, los skills, `/harnesses` y `/spend`. Pero hay **12 incoherencias verificadas**: 1 alta (setup solo advierte de grok, y los cinco harnesses corren sin pedir permisos), 4 medias en `help` (cosas que con `aeth` ya no son ciertas), 2 media-bajas en `onboard` y 5 bajas. Se pueden quitar unos ~620 B (≈4 %) sin cambiar lo que se le dice al modelo. `onboard` sigue teniendo razón de existir.

## help/SKILL.md (7,110 B)

**Hechos.** Se carga solo cuando la persona escribe `/aether:help [tema]` (`disable-model-invocation`), en cualquier sesión con el plugin, también en `claude` normal. La bienvenida del Lead lo nombra (`lib/session-start.js:42-43`, fijada en `tests/session-start.test.js:367-368`).

Lo que fija `tests/help.test.js`:
- El front matter es exactamente `name, description, argument-hint, disable-model-invocation`, con `"[topic]"` y una descripción de una línea de 200 caracteres o menos.
- Las expresiones `/change nothing/i`, `/start no work/i`, `/topic/i` y la cadena `${CLAUDE_PLUGIN_ROOT}/skills/`.
- Debe nombrar `/aether:` + constitution, doctor, onboard, plan, setup, specify, tasks, design y run, además de `/harnesses` y `/spend`. No puede nombrar `/aether:using-aether`, `/aether:swarm` ni `/aether:autonomous-runs`.
- Los 18 enlaces completos `https://github.com/DarkArty07/aether-plugin/blob/main/<archivo>`, y cada uno debe existir.
- `/Spanish page when you answer in Spanish/i`.
- Los code spans deben incluir `aeth` y `aether-report`, y ningún `aether-*` que no sea bin o `aether-lead`.

**Incoherencias:** I2, I3, I4, I5, I8, I12.

**Redundancia.**
- Interna, ~300 B:
  - L20 «Plain `claude` is not Aether mode» repite L15.
  - L59 «`/aether:doctor` says whether it is on» repite L23.
  - L62 «with `/aether:setup` for the common ones» repite L22.
  - Las 18 etiquetas «(English)/(Spanish)» dicen lo que ya dice la ruta `es/guias/`.
- Externa, ~2,000 B: L29-30, L34-35 y L39-42 repiten para la persona reglas de using-aether (L15-18, L145, L240-249, L259) y de autonomous-runs (L10, L14, L38, L57, L85). No se pueden quitar: el plugin instalado no trae `docs/` y help corre fuera de las sesiones del Lead. Pero es justo la copia que se desfasó, porque el test fija nombres y enlaces, no hechos.

**Redacción engañosa.**
- **L17.** «Name only what is in this map.» y enseguida «Before you name a skill that is not here, list…». La segunda permite lo que la primera prohíbe. Listar la carpeta muestra `swarm`, `autonomous-runs` y `using-aether`, que no son para la persona, y no se dice por qué.
- **L14.** Pide «then the guide to read» en cada ítem, pero L55 (orientarse) y L58-59 (Spec Kit) no tienen guía.
- **L21.** Dice «One task without a session» para `aeth -p`, pero es una sesión, solo que sin pantalla (`what-aether-adds.md:30`).
- **L29, el camino directo.** Lo define como «a small reversible change», que es el criterio de la ruta «No design» (using-aether L72), no del camino directo (L84: unas cinco llamadas, sin ciclo de editar, probar y arreglar).
- **L29, Haiku.** «starts on Haiku» omite que las palabras del dueño pueden poner la tarea en Sonnet u Opus (L115).
- **L39.** Sugiere «trabaja autónomamente» para pedir trabajo por horas, y setup L19 llama «Work autonomously» a una opción que solo quita los avisos de permisos. Inferido: la persona puede creer que al elegirla ya dio permiso de horas.

**Reducción segura:** ~300 B (4 %). No tocaría:
- Las URLs absolutas (~970 B de prefijo repetido): el test las fija y hacen falta porque el plugin no trae `docs/`.
- La lista de comandos y paneles.
- Las ocho opciones, que coinciden con `plugin.json`.

## setup/SKILL.md (5,492 B)

**Hechos.** Lo escribe la persona, o lo abre la línea de instalación `claude plugin install aether --marketplace DarkArty07/aether-plugin && claude "/aether:setup"` (fijada en `tests/docs-facts.test.js:526` y `tests/site.test.js:272`). Se puede repetir. Lo nombran el manifiesto (`tests/manifest.test.js:22`) y las correcciones que sugiere doctor (`tests/doctor.test.js:306,332,354`).

Lo que fija `tests/first-setup.test.js:830-861`:
- Que no exista `skills/first-setup`; `name: setup`; descripción de 200 caracteres o menos; cuerpo de 90 líneas o menos.
- Que contenga, sin distinguir mayúsculas:
  - Comandos: aether-doctor, AskUserQuestion, `aether-first-setup --permissions`, `--name`, `claude plugin configure aether@aether-plugin --values-stdin`, `/aether:doctor`, `/aether:setup`.
  - Valores: `` `autonomous` ``, `` `auto` ``, `` `ask` ``, `(Recommended)`, ``only when `harnesses` is not empty``, multiSelect, `{"superdelegation":"true","harnesses":`, `{"superdelegation":"false"}`.
  - Salidas y nombre: exit 3, exit 2, exit 1, 64, `` `claude` ``.
  - Prohibiciones y avisos: by hand, sudo, shell file, settings file, not found, not enabled.
  - Pantalla final: shellHint, close this terminal, your project's folder.
- Además `/not write code/i`, `LC_ALL` y `LANG`.

Comprobado contra el árbol:
- Campos de `aether-doctor` (`lib/doctor.js:306-315`) y de `aether-first-setup` (`lib/first-setup.js:341-353`).
- Salidas 3, 2 y 1, y reglas del nombre (`first-setup.js:18-22`).
- Valores guardados como cadenas (research I3) y límites de AskUserQuestion (I11).

**Incoherencias:** I1, I9, I10, I11, I12.

**Redundancia,** ~120 B:
- L19 «no permission prompts; the Lead and its agents never stop to ask» dice lo mismo dos veces.
- L31 repite L9.
- Las acciones irreversibles aparecen en L19 y en L44, y las dos listas no coinciden (I10).

**Redacción engañosa.**
- **L9.** Prohíbe tocar «a settings file», pero el paso 4 (L34) corre `claude plugin configure`, que escribe `pluginConfigs` en `~/.claude/settings.json` (research I3; doctor lo lee ahí, `doctor.js:236-243`). Un modelo estricto puede no guardar.
- **L15.** «A failed check … goes on the final screen with its fix». En una primera instalación el chequeo `command` siempre sale `warn` con «Run /aether:setup» (`doctor.js:175`), y tras el paso 3 ya es viejo; igual pasa con el `warn` de harnesses tras el paso 4. Nada dice que la línea del comando sale del paso 3. Inferido: puede aparecer «✗ … Run /aether:setup» en la propia pantalla final del setup.
- **Paso 1.** No cubre que doctor salga con 2 por un nombre inválido (`/aether:setup claude`). Entonces solo devuelve `error`, sin los campos que el paso manda guardar.
- **L30.** Lee la salida 2 como nombre inválido, pero first-setup también sale 2 si `~/.local/bin` existe y no es carpeta (`first-setup.js:326`). Pedir otro nombre no lo arregla.
- **L27.** Ofrece `aether` y `<name>2`. Si el nombre ocupado es justo `aether` (en la máquina del dueño lo es), la primera opción es ese mismo nombre ocupado.
- **Huecos menores.**
  - L13 no dice qué idioma usar con un locale como `fr_…`.
  - L44 solo trae la línea de permisos para `autonomous`.
  - multiSelect deja marcar «No, only Claude» y un harness a la vez, sin decir cuál gana.

**Reducción segura:** ~130 B (2 %). No tocaría las cadenas fijadas, la plantilla de la pantalla final (spec 024 R7) ni las reglas del nombre.

## onboard/SKILL.md (2,615 B)

**Hechos.** Lo escribe la persona al empezar, en cualquier sesión (changelog 0.12.7). Ningún test fija su texto, pero sí su existencia:
- `tests/help.test.js` usa `skills.includes('onboard')` y exige que help nombre `/aether:onboard`.
- `docs-facts` R11 y R15: `/aether:onboard` aparece en `what-aether-adds.md:16,90`, `es/que-agrega-aether.md:16,90` y `reference/components.md:32`.

Comprobado:
- `aether-autonomy status` devuelve `session` (`lib/autonomy.js:348`), y `{open:false}` cuando no hay corrida (L367).
- `CLAUDE_CODE_SESSION_ID` llega al Bash tool (research F30).
- `.specify/feature.json` tiene `feature_directory`.

**Incoherencias:** I6, I7.

**Redundancia:** L10 «start no work» y L32 «Do not start it» (~20 B).

**Redacción engañosa:** L10 dice «ask nothing» y L32 dice «Close by asking what they want to do».

**Reducción segura:** ~50 B. No tocaría «Check, do not trust» ni «look in the other branches and worktrees»: vienen de fallas reales que el dueño registró.

**¿Sigue teniendo razón de existir?** Sí. Es el único de los cuatro que lee el proyecto (git, handoff, feature abierta, corrida abierta):
- setup y doctor revisan la máquina, no el proyecto.
- help solo lo describe en L55.
- using-aether no manda orientarse al arrancar.

Se solapa con la sugerencia de setup L49 «Explain this project to me», que pide lo mismo sin sus reglas. Quitarlo obligaría a tocar help, tres páginas de docs y dos tests.

## doctor/SKILL.md (1,714 B)

**Hechos.** Lo escribe la persona; lo sugieren setup L53, help L23 y L59, y los docs.

Lo que fija `tests/doctor.test.js:707-735`:
- El front matter es exactamente `name, description, disable-model-invocation`, y el cuerpo tiene 40 líneas o menos.
- Debe contener:
  - Comandos y salidas: aether-doctor, `--name`, exit 2.
  - Avisos: not found, not enabled, new session.
  - Reporte: language, summary, To fix, exactly as given.
  - Símbolos: ✓, ·, !, ✗.
  - Estados: `` `ok` ``, `` `info` ``, `` `warn` ``, `` `error` ``.
- Las expresiones `/change nothing/i`, `/run no fix|never run a fix/i`, `/edit no file/i` y `/write no code/i`.

Comprobado: campos, estados y salidas coinciden con `bin/aether-doctor:8-9` y `lib/doctor.js:287-316`.

**Incoherencias:** I11.

**Redundancia,** ~140 B:
- L9 «you run no fix» y L19 «Never run a fix yourself»: una de las dos debe quedar por la expresión fijada.
- L11 enumera `version`, `installed`, `harnesses`, `options` y `command`, que el reporte no usa.
- «It reads and writes nothing» repite «You change nothing», y además es falso a la letra: sí lee el PATH, la caché y los settings.

**Redacción engañosa.**
- L14 pide el reporte «in the person's language», pero L16-17 piden «its `detail`» y el `fix` «exactly as given». Ambos vienen en inglés, con prosa y comandos mezclados (`doctor.js:93,162,170`), así que traducir y copiar son dos lecturas válidas.
- La salida 1 también puede traer solo `{error}` (`bin/aether-doctor:40-42`), y la skill no dice qué hacer en ese caso.

**Reducción segura:** ~140 B (8 %).

## Duplicados entre archivos y fuente única

- **setup L11, L15 y doctor L11, L13** (doctor ausente = plugin no habilitado; `--name`; campos del JSON), ~450 B. Ambos lo necesitan porque cada skill se carga sola. Fuente: `lib/doctor.js`.
- **Cómo se muestran los chequeos:** setup L55, L58 y doctor L15-19. Fuente: doctor, que es el reporte fijo de spec 024 R11 (ver I11).
- **Acciones irreversibles:** setup L19, L44, help L42, using-aether y autonomous-runs. Fuente: `lib/guard.js:7-8` (ver I10).
- **help L29-42 frente a using-aether y autonomous-runs:** para la persona, la fuente deberían ser los tutoriales (`read-the-brief.md`, `whole-feature.md`, `see-the-spend.md`), que hoy aciertan justo donde help falla.

## Incoherencias, de más a menos seria

**I1 (alta), setup L25:** «Say in the option of `grok` that it runs without permission prompts».
- Los cinco harnesses corren sin pedir permisos. Lo dicen `plugin.json:20` («Each one runs its CLI without permission prompts»), `plugin.json:15` y `other-harnesses.md:16,62`.
- Lo hace el código de cada uno:
  - agy: `--dangerously-skip-permissions` (`agy.js:118`).
  - codex: `approval_policy=never` (`codex.js:81`).
  - cursor: `--trust --approve-mcps --force` (`cursor.js:51`).
  - grok: `--always-approve` (`grok.js:70`).
  - muse: `--disable-approval` (`muse.js:261`).
- Tiene razón el código; la skill sigue spec 024 R3, que solo nombra a grok.
- Es el momento en que la persona da su consentimiento, y se calla el riesgo de agy, codex, cursor y muse. Inferido: por contraste, sugiere que esos sí preguntan.

**I2 (media), help L35:** ««sí» runs that action once».
- Con `aeth` el guard rechaza la acción (`launcher/aether-lead:31` pone `enforce`) hasta que un grant la cubra, y un grant necesita al menos 12 caracteres del dueño (`lib/autonomy.js:18,63`).
- using-aether L245 y autonomous-runs L85 dicen que con una respuesta más corta el Lead pone el comando exacto en el brief para que el dueño lo corra. `read-the-brief.md:62` lo explica bien.
- Un «sí» suelto no ejecuta nada.

**I3 (media), help L51:** «From a shell: `aether-report --spend`» (y `--delegates`).
- El `bin/` del plugin está en el PATH del Bash de Claude Code, no en la terminal de la persona (research I8, `docs/claude-code-research.md:380`). `see-the-spend.md:39-42` dice que en una terminal hay que correr el archivo por su ruta.
- En una terminal normal, el comando no se encuentra.

**I4 (media), help L30:** «runs `/aether:design` …, builds, and ends with a brief».
- Sin permiso de horas, el Lead se detiene en el plan y construir espera el sí del dueño: using-aether L249 y L259, autonomous-runs L10, `whole-feature.md:54`.

**I5 (media), help L24 y L42:**
- L24 ofrece la forma larga «with no setup» como si fuera equivalente, y L42 dice que un push «still waits for your yes».
- Sin el lanzador no se define `AETHER_IRREVERSIBLE`: el guard queda en modo `log` (`guard.js:735`), anota el comando y lo deja pasar (`:741`).
- Solo lo frenaría el aviso de permisos propio de Claude Code. `what-aether-adds.md:31` sí aclara «without the launcher's extras».

**I6 (media-baja), onboard L22:** si la corrida es de otra sesión, «do not write its diary or continue it».
- Al reiniciar con `aeth` la sesión es otra, y el `session` de la corrida no cambia (`autonomy.js:281`).
- Pero el inicio de sesión manda retomarla «before anything else» (`session-start.js:65`), y autonomous-runs L50 dice que tras un reinicio se continúa.
- Ninguno de los tres distingue una sesión anterior ya cerrada de otra viva en paralelo.

**I7 (media-baja), onboard L17:** corre `aether-autonomy status` solo «when `.aether/` exists».
- En un worktree enlazado no hay `.aether/` en la carpeta (este worktree no lo tiene), pero `status` lee el del checkout principal (`git.js:26-29`).
- Resultado: se salta el chequeo y no ve una corrida abierta. Sin corrida, `status` devuelve `{open:false}`, así que la condición no protege nada.

**I8 (baja), help L34:** «The brief starts with the result».
- Solo el brief de una corrida autónoma empieza así (autonomous-runs L57). Fuera de una corrida abre con «Espera tu sí» (using-aether L249, `read-the-brief.md:20`).

**I9 (baja), setup L3:** la descripción dice «asks two questions», pero el cuerpo hace hasta tres (L18, L22, L27), igual que spec 024 R3. Solo se ve en el menú.

**I10 (baja):** las listas de acciones irreversibles no coinciden.
- setup L19 y L44: push, merge a main, deploy y borrados.
- help L42: push, merge a main, publish y deploy.
- El guard cubre merge-main, push, publish, deploy, delete y credentials (`guard.js:7-8`).
- L44 se lee como lista completa y omite publish y credentials.

**I11 (baja):** el mismo chequeo se ve distinto en setup y en doctor.
- Para `warn`, setup L55 usa «✗» y doctor L16 usa «!» (el «!» está fijado por el test).
- setup L58 traduce las correcciones y doctor L17 las copia tal cual.

**I12 (baja):**
- Cursor (setup L25): de cursor la skill solo dice que no está probado con una cuenta real. Pero `config/lanes.json` no tiene modelos de cursor, así que elegirlo no manda trabajo (`other-harnesses.md:63`).
- Linux (help L46): omite que superdelegation funciona solo en Linux (`plugin.json:15`).

## Lo que no pude verificar

- Que Claude Code sustituya `${CLAUDE_PLUGIN_ROOT}` dentro de un skill (help L17). Lo afirma `session-start.js:19`, sin medición en research.
- Que el Claude Code real acepte `--permission-mode manual` (opción `ask`) y `auto`. Solo se probó con un `claude` falso (handoff del 2026-11-01).
- Que la persona pueda escribir `/aether:design` y `/aether:run` directamente.
- La ruta de menú de `/plugin` para configurar opciones.
- Si `aeth -c` conserva el id de sesión, que decide el alcance de I6.
- Si alguien usa `/aether:onboard`.

**Fuera de mi grupo, visto al verificar:**
- autonomous-runs L10 remite a la sección «Writing and judging», que no existe en using-aether (se llama «Designing», L141).
- autonomous-runs L57 contradice su propia L87 sobre cómo abre el brief.
- `tests/help.test.js` todavía excluye el skill `first-setup`, que ya no existe (inofensivo).