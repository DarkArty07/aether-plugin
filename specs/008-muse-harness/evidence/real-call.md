# Las llamadas reales a Muse (L1 y L2 del plan)

Hechas el 2026-10-19/20 por el Lead, con la concesión `paid-call` de sesión que el dueño dio con sus palabras («apruebo todas las llamdas reales necesarias») y que se revoca al terminar. Muse Code **1.4.11** (el `muse` instalado se actualizó de 1.4.10 durante la sesión), la sesión de suscripción del dueño, sin `META_API_KEY`, desde un directorio de trabajo vacío en `/tmp`. Cada llamada usó el adaptador `lib/harness/muse.js`, la entrada `muse` de la tabla y `laneEnv` (el entorno de una lane), con el mismo prompt de `scripts/lane-smoke.js`: crear `hello.txt` con el texto `lane ok` y responder el objeto `{"status":"done","file":"hello.txt"}` con `--output-schema`. La salida cruda está en este directorio: [exec-json-real.jsonl](exec-json-real.jsonl) (llamada 1) y [exec-json-real-hung.jsonl](exec-json-real-hung.jsonl) (llamada 2); la llamada 1 también es el fixture `tests/fixtures/muse/exec-json-real.jsonl` (con la ruta personal cambiada por `/home/user`).

## Qué se hizo

| # | Comando (línea de órdenes del adaptador) | Resultado |
|---|---|---|
| 1 | `muse exec --json --provider meta --model muse-wonder-full-1.0 --reasoning-effort low --output-schema <esquema> --contributor-mode off --no-foreign-personal-context --disable-approval --disable-reminders --disable-request-user-input --max-model-steps 200 <prompt>` | exit 0 en 12,2 s; limpia; objeto `{"file":"hello.txt","status":"done"}`; `hello.txt` creado con `lane ok`. Uso: entrada 53 722, salida 144, razonamiento 57, caché leída 26 740 (2 llamadas al modelo). |
| 2 | igual, con `--max-model-steps 1` | **colgó**: 12 registros y el último es `opening meta model stream attempt 1/10`; sin uso ni `allowance`; el tiempo límite (180 s) mató el proceso (exit 143). |
| 3 | igual que la 1 con `--model muse-spark-1.3` | exit 0 en 5,8 s; limpia, mismo objeto; uso 53 923 / 279. |
| 4 y 5 | dos como la 3, a la vez, en directorios distintos | las dos exit 0 y limpias (6,1 s y 4,9 s). |

## Lo que se midió

- **`allowance` real** (en el registro `run.usage`, snake_case): `{ as_of_ms, source: "stream", tier: null, weekly: { resets_at_ms, used_percent }, window: { resets_at_ms, used_percent } }`. En las llamadas: semanal 6 % usado (reinicia el 2026-10-26 00:00 UTC), ventana de 5 h 0 % usado (reinicia 05:13 UTC). Es la forma que el adaptador suponía (R27): `parse` la leyó, guardó `muse-observed.json` y `aether-lane quota muse` mostró «5h: 100 % left · weekly: 94 % left». Cada llamada gastó menos de 1 punto de cuota.
- **El texto final** va en `run.terminal.completed` (`payload.text`), con `terminal: "completed"` y `reason: null`. Las llamadas a herramientas **sí** salen en `--json` (`tool.result` con `correlation_facts` y `edit_facts`: `write_file`, la ruta y las líneas añadidas).
- **`--output-schema` acepta los esquemas de los roles.** La suscripción **cubre `muse exec`**. El **sandbox de Linux arranca y ejecuta** (la herramienta escribió el archivo) dentro de WSL2.
- **Muse llama a un modelo que su lista no muestra:** `muse-spark-1.3` respondió aunque `model/list` de `muse serve` solo lista `muse-wonder-full-1.0`.
- **Dos `muse exec` a la vez conviven** con el índice SQLite compartido (dos llamadas, dos directorios): `maxParallel` pasa de 1 a 2.
- Una llamada de una línea gasta unos 54 000 tokens de entrada, casi todos las instrucciones propias de Muse; la mitad llega de la caché.
- Un fallo de acceso se ve en stderr después de dos avisos propios que empiezan por `muse: `: `muse: workspace root: …` y `muse: Agent delegation: auto unavailable: workspace is untrusted.` (ver §8 del README).

## Lo que salió mal y se arregló

- **La razón de un `exit` distinto de 0 tomaba la primera línea de stderr**, que en Muse siempre es uno de sus avisos y no el error: una llamada sin sesión habría dicho `exit 1: muse: workspace root: …` en vez de `exit 1: missing meta credentials…`. Ahora es la primera línea que no empieza por `muse: ` (prueba con los textos reales).
- **`--max-model-steps 1` cuelga a Muse.** El adaptador pasa 200, así que no se alcanza, y un cuelgue lo mata el tiempo límite de la lane (el proceso y sus hijos terminan y la unidad corre nativa). No se obtuvo el registro `run.terminal.failed` de un `stepLimit`.

## Lo que sigue sin verse

- Un fallo a mitad de corrida: `stepLimit`, cuota agotada y su `quota` dentro del fallo, `authRequired` con sesión caduca. El adaptador los lee de forma tolerante, según el esquema (R27); la primera vez que ocurra en una corrida real hay que comparar.
- Si el saldo de cuota baja de verdad con una unidad larga (aquí cada llamada gastó menos de un punto).
- La cuota antes de la primera llamada sigue sin poder leerse (`usage/read` vuelve vacío).
