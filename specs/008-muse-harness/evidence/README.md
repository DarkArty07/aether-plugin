# Evidencia medida para el diseño de Muse Code como harness

Medida el 2026-10-19 (hora local) con Muse Code 1.4.10 (`1.4.10-R6427.1`, instalado en `~/.local/bin/muse`), las páginas de Meta en `dev.meta.ai/docs`, los metadatos de las sesiones de Muse que el dueño abrió ese día y el repositorio en `3cafbce`. **No es parte de los criterios de la tarjeta:** es lo que el diseño puede dar por cierto, cómo se midió y qué falta.

**No se hizo ninguna llamada a un modelo de Muse.** Se corrió solo `--help`, `--version`, `model-profile`, `schema` y el proveedor local `echo` (sin red ni login, con `HOME` y `XDG_*` desechables). De las sesiones del dueño se leyó la estructura de unos pocos eventos de metadatos: nunca el texto de una conversación ni credenciales.

Archivos de esta carpeta:
- [muse-help.txt](muse-help.txt): la ayuda de la CLI, tal cual.
- [exec-json-echo.jsonl](exec-json-echo.jsonl): una corrida de `muse exec --json` con el proveedor `echo`.
- [msp-extract.json](msp-extract.json): extracto del esquema del protocolo de `muse serve` (errores, métodos, notificaciones y las definiciones de cuota, uso, modelos y fallos).
- [repo-map.md](repo-map.md): dónde toca un harness en el repositorio, con referencias archivo:línea.

## 1. La CLI (medido en la máquina)

| Pregunta | Resultado |
|---|---|
| ¿Qué es? | `muse`, «interactive terminal coding agent» de Meta, beta desde 2026-08-05 (docs). `Muse Code 1.4.10 (1.4.10-R6427.1)`. |
| ¿Modo sin interfaz? | `muse exec [OPTIONS] [PROMPT]`: un prompt, una salida. Códigos de salida (docs): 0 turno completo; 1 fallo o cancelación, incluso al llegar a `--max-model-steps`; 2 uso; 130/143 señales. Un 0 no dice que el trabajo esté bien hecho. |
| ¿Cómo se pasa el prompt? | Argumento posicional, o `--prompt-file <PATH>`. `--api-key-stdin` lee una llave por la entrada estándar. |
| ¿Modelo y esfuerzo? | `--model <ID>`; `--reasoning-effort none\|minimal\|low\|medium\|high\|xhigh\|max\|ultra` (alias `--effort`, por defecto `high`). El proveedor Meta no acepta `none` (docs). |
| ¿Salida para máquinas? | `--json`: registros JSONL por la salida estándar, con sobre `schema_version`, `id`, `stream`, `sequence`, `recorded_at`, `record_type`, `durability`, `causation_id`, `payload_type`, `payload`. La respuesta final va en `run.terminal.completed` (`payload.text`, `payload.terminal`, `payload.reason`); el texto, en `run.output.delta`; el uso, en `run.usage` (corriente `exec.usage`) con `calls`, `completed_calls`, `failed_calls`, `cancelled_calls`, `models[]` (`input_tokens`, `output_tokens`, `cached_tokens`, `reasoning_tokens`) y `allowance`. Con `echo` los tokens son 0 y `allowance` es `null`. Los avisos van por la salida de error. |
| ¿Salida con forma? | `--output-schema <FILE>` da forma a la respuesta final con un JSON Schema (solo proveedor Meta). |
| ¿Freno de gasto? | `--max-model-steps <N>`: único freno documentado; al llegar corta con exit 1 y fallo `stepLimit`. `--max-tool-output-bytes <N>`. |
| ¿Aprobaciones y sandbox? | Activos por defecto. `--yolo` = sin aprobación, sin sandbox y con el workspace confiable. `--disable-approval` quita solo las aprobaciones y deja el sandbox. `--disable-sandbox`; `--sandbox-network restricted\|enabled\|proxy-only` (por defecto `proxy-only`); `--disable-write`; `--disable-shell`. En Linux el sandbox usa bubblewrap (con copia embebida); si no funciona, cada comando de shell falla como error de entorno (`environmentError`). |
| ¿Directorio de trabajo? | El `cwd` por defecto; `--workspace <PATH>` lo fija. Sin `--trust-workspace` el workspace «is untrusted»: no carga las reglas ni skills del proyecto y la delegación automática a subagentes no está disponible (aviso medido en la salida de error). |
| ¿Privacidad? | `--contributor-mode on\|off` (solo esa corrida, no se guarda). `--no-foreign-personal-context` excluye reglas y skills personales de otras herramientas; Meta documenta que Muse lee skills de `~/.claude/skills` y `$CODEX_HOME/skills`. `--no-session-log` no guarda el registro de sesión. `--disable-web-tools`. `--disable-reminders` (agentes recordatorio; los «observadores» hacen sus propias llamadas al modelo y gastan tokens). |
| ¿Subagentes propios? | Muse lanza subagentes (8 por árbol por defecto, `agents.execution_capacity`, hasta 64; un `ultra` sin configurar usa 64). Comparten el checkout salvo que se pida aislamiento por hijo. |
| ¿Credenciales? | Orden de Meta: `META_API_KEY` del entorno, llave guardada (`muse auth set --api-key-stdin`), sesión guardada (`muse login`). Dónde se guardan no está documentado; el changelog 1.4.10 dice que `~/.config/muse` y `~/.config/tbh` guardan el inicio de sesión y los ajustes. No hay comando que muestre el estado de la sesión. `laneEnv` (`lib/lanes.js:438`, `/TOKEN\|KEY\|SECRET/i`) borra toda variable con esos nombres, así que una `META_API_KEY` no llegaría a una lane; la sesión guardada sí (se conserva `HOME` y `XDG_*`). |
| ¿Cómo se lista lo que ofrece? | `muse model-profile show <modelo> [--effort]` solo resuelve un id: a un id inexistente le contesta con valores por defecto, no valida. La lista es el método `model/list` de `muse serve` (filas con `cost`, `contextLimit`, `defaultReasoningEffort`, de la más nueva a la más vieja, con `source`). |
| ¿Registros locales? | `~/.local/share/muse/sessions/AAAA/MM/DD/<id>/session.jsonl` (los guarda salvo `--no-session-log`), más un índice SQLite `session-index.db` con WAL. |

## 2. El protocolo de `muse serve` (MSP): cuota, uso y fallos

`muse schema generate-json-schema --out DIR` exporta el esquema embebido en el binario, sin red ni login (huella `sha256:f282ad16…`, ver [msp-extract.json](msp-extract.json)).

| Lo que define | Forma |
|---|---|
| Cuota de suscripción | Método `usage/read` → `UsageReadResult {usage?}`; `usage` falta, nunca es `null`, cuando el host no ha observado nada. `SubscriptionUsage {observedAtMs, tier, window {usedPercent, resetsAtMs, windowDurationMins}, weekly {usedPercent, resetsAtMs}}`: `window` es el bloque «de la clase de 5 horas» y `weekly` el semanal móvil; `usedPercent` es un entero ≥ 0 que puede pasar de 100. La notificación `usage/changed` lleva lo mismo. |
| Cuota agotada | `TurnError {kind, message, retryable, quota?}`; `quota` es `QuotaDetail {limitKind, resetsAtMs}` y está presente **solo si** el fallo fue de cuota: «clients branch on presence, never by parsing `message`». `LimitKind` hoy solo trae `tierLimit` (enum abierto). |
| Clases de fallo | `TurnErrorKind`: `stepLimit`, `configError`, `projectionError`, `logError`, `workflowLaunchError`, `environmentError`, `modelError`, `launchError`, `authRequired`, `mcpLinkError`. `TurnTerminal`: `completed`, `failed`, `cancelled`. |
| Costo y tokens | `session/tokenUsage` (`CumulativeTokenUsage`, con `CumulativeCost {usd, partial}`) y `session/contextUsage`. |
| Modelos | Método `model/list` → `ModelListResult {models, profileId, providerId, source}`; cada fila `ModelCatalogEntry` con `cost {input, cached, output, currency}`, `contextLimit`, `defaultReasoningEffort`, `displayLabel`, `isActive`. |
| Errores del protocolo | 37 códigos JSON-RPC; con reintento solo `overloaded` (−32001) y `backpressured` (−32031). Ninguno es de saldo o de cuota: esos viajan en el fallo del turno. |

**Lo que este esquema no dice** y solo se ve con una llamada real: lo que trae `allowance` en `run.usage` de `exec --json` (el flujo de `exec` usa registros en snake_case, no el camelCase del protocolo), la forma del `reason` de un `run.terminal.failed`, y si `usage/read` contesta algo antes de la primera petición.

## 3. La cuenta del dueño (metadatos, no credenciales)

- En sus sesiones de Muse de ese día: `session.login.completed` con `method: "device_code"`, `subscribed: true` y `trigger: "onboarding"`.
- Usó `muse-wonder-1.0` y `muse-wonder-full-1.0` (proveedor `meta`). Según Meta, Wonder Full «is available only in Muse Code on the Power Usage and Maximum Usage plans».
- `META_API_KEY` no está definida en el entorno (se comprobó solo si la variable existe, no su valor).
- **Inferencia, no confirmada por el dueño:** su cuenta es una suscripción de plan Power o Maximum.
- `ARTIFICIAL_ANALYSIS_API_KEY` no está definida en el entorno, pero `scripts/refresh-lanes.js` también la busca en el `.env` del directorio de datos. **Corregido tras el diseño (ver §8):** el script corrió en seco sin error (`No figure changed.`), así que hay una clave que el script lee. El spec y el plan partieron de que no la había.

## 4. Modelos y precios (páginas de Meta, leídas el 2026-10-19 por resumen de WebFetch: verificar en la página)

Precios en USD por millón de tokens, con caché / entrada / salida. Ventana de contexto de 1 048 576 tokens.

| Modelo | Qué dice Meta | Precio | Límites por equipo |
|---|---|---|---|
| `muse-spark-1.3` | «latest version», «Recommended for new work»; todos los esfuerzos, incluido `max`. Para «high-volume or cost-sensitive work». | 0.15 / 1.25 / 4.25 | 3 000 RPM, 4 M TPM |
| `muse-spark-1.3-contributor` | Entrena modelos de Meta «in exchange for a lower price». Sin `max`. | 0.002 / 0.10 / 0.20 | 150 RPM, 3 M TPM |
| `muse-spark-1.2`, `-contributor` | Versión anterior. | igual que 1.3 | igual |
| `muse-spark-1.1` | Original; «not available in Muse Code». | igual | igual |
| `muse-wonder-1.0` | Preview; esfuerzos `minimal` a `max`; para «complex multi-file changes» y trabajo agéntico largo. Sin modo contributor. | 0.20 / 4.00 / 20.00 | 3 000 RPM, 4 M TPM |
| `muse-wonder-full-1.0` | No es un modelo de la API: solo en Muse Code con planes Power o Maximum. | solo el plan | sin dato |

Los puntajes publicados por Meta y por terceros no coinciden entre páginas ni son comparables con los `aa` de `config/lanes.json` (otra versión del índice, tomada el 2026-10-08); la tabla debe tomar los suyos de Artificial Analysis.

## 5. Cómo se paga (Meta)

- **Suscripción** (`/docs/muse-code/subscriptions`): planes Everyday («10-50 prompts every 5 hours»), High (5×), Power (20×) y Maximum (80×); sin precios en la página. Se aplica a la llave de Muse Code conectada en el onboarding y «works only through the Muse Code CLI while signed in»; la página no dice si cubre `muse exec`. Cualquier otra llave se factura por token. Al agotarse: «upgrade to the next plan, or wait until your limit refreshes», sin texto de error documentado.
- **Contributor mode:** Meta dice que en Muse Code viene encendido por defecto y «gives more usage in exchange for training use»; el changelog 1.4.6 lo deja solo para suscriptores y el 1.4.8 dice que apagarlo en los ajustes lo deja fuera incluso de las peticiones de fondo.
- **Pago por token** (`/docs/pricing-rate-limits`): tabla de la sección 4. Meta no documenta un tope de gasto; el «payment threshold» solo decide cuándo se cobra la tarjeta.

## 6. El repositorio

[repo-map.md](repo-map.md) reúne el barrido del explorador (`grok-4.7` a `high`, por el enrutador, en una copia desechable del checkout en `0482ba9`). El Lead verificó `laneEnv`, la forma de una entrada de `config/lanes.json` y que `main` solo avanzó con documentación del enrutador (A62, PR #43) hasta `3cafbce`. La versión sigue siendo 0.12.5 y la siguiente decisión libre es A63.

## 7. Lo que no se midió

- Una corrida con un modelo real: la forma de `allowance`, el `reason` de un fallo o de una cuota agotada, si las llamadas a herramientas salen en `--json`, cuánto tarda un arranque y cuánta cuota gasta una llamada típica.
- Si la suscripción del dueño cubre `muse exec` (si no, debería salir `authRequired` o similar).
- Si el sandbox de Linux funciona dentro de WSL2.
- Si dos `muse exec` a la vez en worktrees distintos conviven con el índice SQLite compartido.
- Los puntajes de Artificial Analysis de Spark 1.3, Wonder 1.0 y Wonder Full a cada esfuerzo.

## 8. Medido después del diseño (2026-10-19; sin la cuenta del dueño y sin gasto)

Con `HOME` y `XDG_*` desechables:

| Caso | Salida |
|---|---|
| `muse exec --json …` sin sesión | exit 1, salida estándar **vacía**, y en la de error `missing meta credentials: run \`muse login\` or set META_API_KEY, or save credentials at <XDG_CONFIG_HOME>/muse/auth.json`. Esa ruta es el archivo de login: no se lee. |
| con una `META_API_KEY` inventada | exit 1, salida estándar **vacía**, y en la de error `failed to fetch model catalog: authentication failed: your API key from META_API_KEY was rejected — update or unset it`. |

`muse exec` pide el catálogo de modelos a Meta al arrancar. Por eso un fallo de acceso es **previo a la corrida y no deja ningún registro JSONL**: `parse` lo recibe como «exit distinto de 0 y salida estándar vacía» y debe dar como razón `exit 1: <primera línea de stderr>` (la regla 3 de D3 del plan), no `unreadable output`. Un `authRequired` dentro de un `run.terminal.failed` solo sería posible si la sesión caduca a mitad de una corrida, y no se ha visto. El fallo a mitad de corrida (cuota agotada, `stepLimit`) sigue sin verse: pide una llamada real.

**Dos correcciones a lo que partió el diseño:**
1. **Sí hay clave de Artificial Analysis para el script.** `scripts/refresh-lanes.js` falla con `ARTIFICIAL_ANALYSIS_API_KEY is not set, and <dir>/.env does not have it` cuando no hay ninguna, y en esta sesión corrió bien. El paso L3 del plan (añadir los modelos medidos a la tabla) es posible; el script solo refresca las cifras `aa` de modelos que ya están en la tabla, así que se añade cada modelo con su `aa.slug` y luego se refresca.
2. **El validador de la tabla no acepta `xhigh` como valor de `levels`.** En `lib/lanes.js:25-26,60` las cuatro claves `low`, `medium`, `high` y `xhigh` son obligatorias y sus valores solo pueden ser `low`, `medium` o `high`. La A-P7 del plan (niveles de Muse como identidad, con `xhigh`) haría fallar la tabla al añadir un modelo en L3. La entrada de Muse mapea `xhigh` a `high`, como las de agy y grok, y Muse corre ese nivel en `high` (su esfuerzo por defecto). Nada de las tareas 1 a 14 cambia, porque la tabla de Muse nace sin modelos. Un esfuerzo `max` sigue nativo porque ningún modelo declara la clave `max` (`lane-calls.js:158`).

## 9. Fuentes

Meta: [auth](https://dev.meta.ai/docs/muse-code/auth), [suscripciones](https://dev.meta.ai/docs/muse-code/subscriptions), [extender y headless](https://dev.meta.ai/docs/muse-code/extending), [configuración](https://dev.meta.ai/docs/muse-code/configuration), [modelos](https://dev.meta.ai/docs/models), [precios y límites](https://dev.meta.ai/docs/pricing-rate-limits), [changelog](https://dev.meta.ai/docs/muse-code/changelog). Terceros: [E2B](https://docs.e2b.dev/agents/muse), [QAInsights](https://qainsights.com/?p=18730), [eesel](https://www.eesel.ai/blog/meta-muse-code-pricing), [Artificial Analysis](https://artificialanalysis.ai/models/muse-spark-1-3-xhigh).
