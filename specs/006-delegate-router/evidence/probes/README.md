# Sondas del motor

Un plugin desechable (`plugin/`) cuyo mod registra lo que el motor entrega a `tool.call`, `agent.spawn` y `turn.step` y prueba las reescrituras que necesita el router. `run-probe.sh <modo>` lanza una sesión `claude -p` contra el modelo falso de `tests/fixtures/fake-model.js`, con `HOME` y `CLAUDE_CONFIG_DIR` desechables: ninguna petición sale de la máquina.

Modos: `baseline`, `baseline-omitted`, `spawn-model`, `spawn-model-omitted`, `spawn-effort`, `toolcall`, `typed`, `context`, `deny`, `answer`, `services`. El segundo argumento es el JSON de entrada de la llamada `Agent` del modelo falso. La salida va a `runs/<modo>/` (no se versiona). Los resultados están en `../README.md`, sección 1.
