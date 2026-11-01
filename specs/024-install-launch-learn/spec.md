# Especificación: instalar, lanzar y aprender Aether sin fricción (0.30.0)

- **Intención:** [intent.md](intent.md)
- **Plan:** [plan.md](plan.md); **tareas:** [tasks.md](tasks.md)

## Requisitos

### Instalar

- **R1.** La línea de instalación del README es `claude plugin install aether --marketplace DarkArty07/aether-plugin && claude "/aether:setup"`: la primera parte instala, la segunda abre Claude Code con `/aether:setup` como primer mensaje. Probado en 2.1.316 con `-p`: un skill de plugin pasado como el prompt se ejecuta. En modo interactivo no se pudo probar en el contenedor (lo detiene la pregunta de confianza en la carpeta, que una persona contesta); lo prueba el dueño (T21). Serves: C1.
- **R2.** El skill `setup` (`/aether:setup`) reemplaza a `first-setup`. Lleva `disable-model-invocation`, se puede correr otra vez para cambiar lo elegido, y sigue este orden: revisa (`aether-doctor`), pregunta, instala `aeth` (`aether-first-setup`), guarda las opciones, y muestra la pantalla final. No escribe código, no edita archivos a mano y no toca archivos de shell. Serves: C1, C6.
- **R3.** Las preguntas salen en una sola llamada a AskUserQuestion, en el idioma de la persona, con la opción recomendada primero:
  - **Permisos** (siempre): «Trabaja de forma autónoma (sin pedir permisos)» (recomendada, `autonomous`), «Modo auto de Claude Code» (`auto`), «Preguntar antes de cada herramienta» (`ask`).
  - **Harnesses** (solo si `aether-doctor` encontró al menos uno instalado): «No, solo Claude» (recomendada) o los harnesses encontrados, con selección múltiple; Grok lleva la advertencia de que corre sin pedir permisos.
  - **Nombre** (solo si `aeth` está ocupado): otro nombre, una vez.
  Serves: C1.
- **R4.** `aether-first-setup` acepta `--permissions autonomous|auto|ask` (por defecto `autonomous`). El stub exporta `AETHER_PERMISSION_MODE` (`bypassPermissions`, `auto` o `manual`) salvo que la shell ya lo traiga, y el JSON del resultado dice `permissions`. Un stub escrito por una versión anterior se sigue reconociendo como propio. Serves: C1, C2.
- **R5.** Sin `--dir`, `aether-first-setup` elige el directorio así: `~/.local/bin` si está en el `PATH`; si no, el directorio de `claude` en el `PATH` cuando está dentro de `$HOME` y se puede escribir; si no, `~/.local/bin` con el `shellHint` de hoy. El resultado dice el directorio elegido y `onPath`. Serves: C1.
- **R6.** Las respuestas de los harnesses se guardan como opciones del plugin con `claude plugin configure aether@aether-plugin --values-stdin` y un objeto JSON de cadenas, por ejemplo `{"superdelegation":"true","harnesses":"codex,agy"}`: el comando valida cada valor por su tipo, guarda solo esas claves y conserva las demás (probado en 2.1.316; un valor que no es cadena se rechaza). Con «No, solo Claude» y una configuración anterior con `superdelegation` encendida, se guarda `{"superdelegation":"false"}`; sin configuración anterior no se escribe nada. Serves: C1, C6.
- **R7.** La pantalla final dice, en este orden: la versión instalada; una línea por revisión (✓ o ✗ con su arreglo); el comando, su directorio y si está en el `PATH`; el modo de permisos; los harnesses; y la instrucción «Cierra esta terminal, abre una nueva en la carpeta de tu proyecto y escribe `aeth`», con tres pedidos de ejemplo y las líneas de `/aether:doctor` y `/aether:setup`. Serves: C1.

### Lanzar

- **R8.** El lanzador arranca con `--permission-mode "${AETHER_PERMISSION_MODE:-bypassPermissions}"`: sin la variable hace lo mismo que hoy. Serves: C2.
- **R9.** En una sesión del Lead, al arrancar (`startup`), el hook SessionStart muestra a la persona una línea de bienvenida con la versión y `/aether:help`, en español cuando `LC_ALL`, `LC_MESSAGES` o `LANG` empiezan con `es`, y en inglés si no. En cualquier otra sesión no muestra nada. Serves: C2, C6.

### Diagnosticar

- **R10.** `aether-doctor` imprime un objeto JSON `{ ok, version, checks }`; cada revisión tiene `id`, `status` (`ok`, `info`, `warn` o `error`), `detail` y `fix` (el comando o el paso exacto, o `null`). Revisa: Claude Code 2.1.294 o más nuevo; Node 22 o más nuevo; git 2.36 o más nuevo; la versión de Aether instalada; el comando `aeth` (o el stub propio que encuentre) y si está en el `PATH`; los workflows dinámicos; los harnesses instalados (`agy`, `codex`, `grok`, `cursor-agent`, `muse`); y si la carpeta actual es un repositorio git. No escribe nada. Sale con 0 sin errores, 1 con alguno y 2 con un error de uso. Serves: C3.
  - **Workflows** (Claude Code 2.1.316, `settings-reference` y `workflows`): apagados (`error`) si `CLAUDE_CODE_DISABLE_WORKFLOWS` está puesta, o si `disableWorkflows: true` o `enableWorkflows: false` aparece en los ajustes del usuario (`$CLAUDE_CONFIG_DIR/settings.json` o `~/.claude/settings.json`) o del proyecto (`.claude/settings.json`, `.claude/settings.local.json`), porque cualquier fuente que los apaga gana; encendidos (`ok`) si `enableWorkflows: true` y nada los apaga; sin poner (`info`) en otro caso, porque entonces dependen del plan: encendidos salvo en Pro, donde se encienden en `/config` → Dynamic workflows.
- **R11.** El skill `doctor` (`/aether:doctor`, con `disable-model-invocation`) corre `aether-doctor` y muestra el reporte fijo: resumen, revisiones, problemas con su arreglo. No arregla nada por su cuenta. Serves: C3.

### Aprender

- **R12.** El skill `help` (`/aether:help [tema]`, con `disable-model-invocation`) dice qué agrega Aether organizado por lo que la persona quiere hacer, con el comando de cada cosa y el enlace a la guía en su idioma. Lee los skills instalados del plugin para no nombrar uno que no existe. Una prueba fija que nombra cada skill que la persona invoca, cada workflow y cada panel. Serves: C4.
- **R13.** Ocho guías paso a paso en inglés (`docs/tutorials/`) y las mismas en español (`docs/es/guias/`): instalar y arrancar, la primera petición, una feature completa, leer el brief, trabajar horas, otros harnesses, ver el gasto, actualizar y desinstalar. Cada una empieza con lo que vas a lograr, va en pasos numerados con lo que escribes y lo que ves, y termina con cómo comprobar que funcionó. Serves: C4.
- **R14.** «What Aether adds» (`docs/what-aether-adds.md`) y «Qué agrega Aether» (`docs/es/que-agrega-aether.md`): punto por punto, cada comando, agente, panel y opción con para qué sirve, y una hoja de atajos «quiero X → haz Y». Serves: C4.
- **R15.** `docs/index.md` enlaza cada página nueva, y `docs/es/index.md` es el índice en español. Todas las páginas nuevas cumplen las reglas de `tests/docs-facts.test.js`. Serves: C4.
- **R16.** `docs/getting-started.md` usa los cuatro pasos; la prueba con `tasks.md` y `aether-plan check` pasa a `docs/contributing.md`. Serves: C4.

### README y sitio

- **R17.** El README tiene `## Quick start` con los cuatro pasos justo después de la línea `Version`, antes de RADAR, y sigue en 160 líneas o menos. La prueba R1 de `tests/docs-facts.test.js` fija el orden nuevo. Serves: C5.
- **R18.** La sección de instalación del sitio (`site/index.html`) tiene los cuatro pasos en español y en inglés. Serves: C5.

### Registro

- **R19.** La versión 0.30.0 en sus cuatro lugares, el changelog, la decisión A103, la tabla de componentes, el roadmap y el handoff. Serves: C8.

## Propuestas

- El aviso de versión nueva al arrancar el Lead, una vez al día, con un `git ls-remote` acotado y una opción para apagarlo.
- Probar `effort: xhigh` en el frontmatter de `aether:lead`, para que `claude --agent aether:lead` baste sin `--effort`.
