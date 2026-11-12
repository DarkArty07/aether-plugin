<!-- Copia del cuerpo del issue #257 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

## Qué pasó

En el swarm `20261111-205835-92ee` (Aether 0.37.0, 2026-11-12), la unidad task-29 quedó **bloqueada** después de su primer intento, aunque la escalera sí aceptó el veredicto:

```
the ladder could not be read: unreadable output from aether-wt ladder 20261111-205835-92ee task-29 --verdict fix --payload '…/ladder/task-29-verdict.json' --digest 26e705ba:1486 (the ops agent may have refused or not run it): {"accepted":true,"task":"task-29","status":"open","step":"haiku-xhigh",…,"attempts":1}

(Note: the command output did not print an explicit exit code; 0 is reported here
```

El agente ops (Haiku low) devolvió en `stdout` la línea JSON del bin y **le agregó una nota propia al final**. `opsOnce` en `workflows/run.workflow.js` solo parsea la última línea (`JSON.parse(lines[lines.length - 1])`), así que la tomó como salida ilegible y la unidad se bloqueó con su escalera abierta en `haiku-xhigh`.

## Por qué importa

Bloquea una unidad sana por texto extra del agente ops, y con ella se saltan sus dependientes hasta un relanzamiento manual.

## Propuesta

En `opsOnce` (y en la copia equivalente de `design.workflow.js`), recorrer las líneas desde el final y tomar la última que empiece con `{` y se parsee como objeto JSON. Como prueba, mi copia de la sesión del script ya tiene este cambio.

## Versiones

Encontrado en 0.37.0. En 0.39.3 sigue igual (`run.workflow.js:355` y `design.workflow.js:301` parsean solo la última línea).

