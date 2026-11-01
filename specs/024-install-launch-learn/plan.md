# Plan: instalar, lanzar y aprender Aether sin fricción (0.30.0)

- **Especificación:** [spec.md](spec.md); **tareas:** [tasks.md](tasks.md)

## Lo que se aprendió de otros plugins

- **oh-my-claudecode** (v5.7.24): tres pasos numerados, un `/omc-setup` que se puede correr otra vez y termina en una pantalla de bienvenida, un `/omc-doctor` con un reporte fijo, y una página de problemas cuyos títulos son los mensajes de error. En contra: siempre activo, sobrescribe `~/.claude/CLAUDE.md` y su documentación se contradice entre tres sitios.
- **everything-claude-code (ECC)** (2.2.3): una instalación de un comando con dos preguntas con respuesta por defecto, que comprueba el resultado y guarda lo elegido como opciones del plugin; una tabla «quiero X → usa Y»; un skill de ayuda que responde leyendo los archivos actuales. En contra: cuatro o más caminos de instalación, un README de 2,209 líneas, cifras que no coinciden y una configuración que cambia un ajuste ajeno sin avisar.
- **Claude Code 2.1.316:** un plugin no puede ejecutar nada al instalarse ni fijar los permisos o el tema; `claude plugin install` no pregunta las opciones; el `agent` de un `settings.json` de plugin haría del Lead el agente de toda sesión, lo que rompe el modo opcional. Por eso el lanzador y `aeth` se quedan.

Aether copia lo cómodo y conserva lo suyo: modo opcional, dormido fuera del Lead, y la documentación sujeta al árbol por pruebas.

## Decisiones

- **D1. Nombres.** El skill `first-setup` pasa a llamarse `setup`. El bin `aether-first-setup` conserva su nombre, porque el changelog y los stubs instalados lo nombran; `/aether:setup` lo usa. Bins nuevos: `aether-doctor`. Skills nuevos: `setup`, `doctor`, `help`. `aether:first-setup` entra a las excepciones de `tests/docs-facts.test.js` como nombre retirado que el changelog conserva.
- **D2. Directorio de `aeth`.** R5: `~/.local/bin` si está en el `PATH`; si no, el de `claude` cuando está dentro de `$HOME` y se puede escribir; si no, `~/.local/bin` con su línea para el `PATH`. Nunca un directorio del sistema.
- **D3. Permisos.** El stub lleva el modo elegido en `AETHER_PERMISSION_MODE`; el lanzador lo usa y, sin él, se comporta como hoy. Las tres opciones son `autonomous` (`bypassPermissions`, por defecto), `auto` y `ask` (`manual`). `AETHER_IRREVERSIBLE=enforce` sigue por defecto en los tres.
- **D4. Opciones.** El skill guarda `superdelegation` y `harnesses` con `claude plugin configure aether@aether-plugin`; no escribe archivos de ajustes a mano.
- **D5. Doctor.** `lib/doctor.js` tiene las revisiones como funciones puras sobre lo que se le inyecta (entorno, ejecutor de comandos, sistema de archivos), para probarlas sin red ni modelo; `bin/aether-doctor` solo lee argumentos.
- **D6. Ayuda.** `/aether:help` lleva su mapa en el propio skill (el plugin instalado no trae `docs/`) y enlaza las guías en GitHub; una prueba lo mantiene al día con los skills, workflows y paneles.
- **D7. Bienvenida.** El `systemMessage` del hook SessionStart, solo para el Lead y solo en `startup`.
- **D8. Guías.** `docs/tutorials/` (inglés) y `docs/es/guias/` (español), con los mismos ocho temas; las páginas de referencia de `docs/guide/` no cambian de lugar.

## El reparto de modelos

La sesión principal hace las decisiones, la especificación, el skill `setup`, el README con su prueba, la revisión de todo lo que entregan los subagentes, las pruebas finales, los commits y el push. Los subagentes corren solo en **Sonnet** (código con sus pruebas y la prosa de las guías) o **Haiku** (verificaciones, tareas mecánicas y resúmenes), con el modelo puesto de forma explícita en cada llamada y nunca como `fork`, que hereda el modelo de la sesión principal. Los que trabajan a la vez lo hacen en worktrees separados o sobre archivos que no se cruzan. Ninguno corre en Opus.

## Oleadas

1. **Verificar** (T1, T2).
2. **Código A** en paralelo: T4, T5, T8, T9. **Código B:** T7 (depende de T4) y T6 (depende de T4 y T5).
3. **Documentación** en paralelo: T10 a T15. Después T16 y T17.
4. **Verificar y entregar:** T18, T19, T20. T21 es del dueño.
