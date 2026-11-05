# Tarjeta de intención: arreglar los puntos débiles de la auditoría y dejar que el Lead entre solo al modo plan

- **Dueño:** Christopher
- **Fecha:** 2026-11-04
- **Origen:** la auditoría del 2026-11-04 (`/aether:audit`, 9 temas, 29 hallazgos, 26 verificados, 25 ordenados de P1 a P3). El informe guardado está en `~/.claude/plugins/data/aether-aether-plugin/audits/aether-plugin-d50407450eb9/2026-11-04`. Los números de abajo son los de ese informe.
- **Confirmada por el dueño** al aprobar el plan en el modo plan (`~/.claude/plans/pero-necesito-que-hagas-snuggly-penguin.md`).

## 1. Las palabras del dueño

1. «Necesito que hagas un plan con esta auditoría para resolver todos estos puntos débiles que se encontraron en esta auditoría. Necesito que hagas un plan y me lo muestres. Yo te digo si lo apruebo o no lo apruebo para trabajar de manera autónoma.»
2. «Para esos dos, dame este resuélvelos tú de manera autónoma.» (los puntos 10 y 13, los dos que pedían una decisión de diseño suya)
3. «Sobre los 2, 6 y 7 que son cambios en el Word, este, eso lo puedes decidir tú. Yo no lo veo complicado.» (el guard)
4. «se me hace raro que el lead no puede activar el modo plan por su cuenta entonces necesito que investigues porque el no puede activar el modo plan este revisa eso porque creo que eso es del plugin también»

## 2. Lo que el dueño confirmó

1. Se resuelven los 25 puntos de la auditoría, en una rama aparte creada desde `main`, con una prueba por punto.
2. Decisiones que tomó el Lead por él: el punto 10 falla cerrado y anota el comando como pendiente; el 13 rechaza una cita que va en una frase con negación; el 2, el 6 y el 7 con diseño del Lead; el 20 como una línea de política de versionado en `docs/contributing.md`; el 23 con la imagen fija por defecto.
3. La causa de que el Lead no entre solo al modo plan: el plugin no lo bloquea (`agents/lead.md` sin lista de herramientas, ningún hook ni el mod lo nombran), pero el arranque de Aether nunca le dice al Lead cuándo ni cómo usarlo, `EnterPlanMode` es una herramienta diferida, y el lanzador fuerza `--permission-mode bypassPermissions`. Se arregla con una regla en el arranque (paquete 8).
4. Los puntos 19 (tags de 0.14.5, 0.14.4, 0.9 y 0.8) y 21 (comentario en #148) no se hacen sin un sí aparte; el Lead deja el borrador.
5. Fusionar a `main`, sacar una versión y empujar siguen siendo decisión del dueño.

## 3. Criterios

Qué y por qué, nunca cómo. Cada uno se apoya en una cita de la sección 1.

1. Una cadena de comandos con varias acciones irreversibles exige permiso para cada una de ellas; un shell que recibe su script por heredoc no esconde esas acciones; ningún comando de Bash puede escribir los registros protegidos (`grants.json`, `run.json`); un registro de permisos ilegible no deja pasar una acción irreversible y deja un pendiente (puntos 2, 6, 7 y 10; citas 2 y 3).
2. Una cita del dueño dentro de una frase que niega la acción no sirve como autorización de esa acción (punto 13; cita 2).
3. Cerrar o barrer un run no destruye el trabajo sin integrar ni el estado necesario para recuperarlo, y un corte del proceso no deja ilegible el estado del run (puntos 1, 5 y 11; cita 1).
4. Cuando vence el tiempo de una comprobación no quedan procesos suyos vivos; dos podas a la vez no pierden gasto ni eventos de observación; el historial de delegados no crece sin límite (puntos 9, 17, 24 y 25; cita 1).
5. Las pruebas cubren la delegación completa dentro del motor, no dependen de tiempos justos y detectan si las copias de las funciones de glob del workflow se separan de las de `lib/globs.js` (puntos 8, 16 y 18; cita 1).
6. La documentación no afirma nada falso sobre `aether-exam`, el campo Tier, el ejemplo de `contributing.md`, qué comando corre las pruebas del mod ni el versionado en 0.x (puntos 3, 4, 15 y 20; cita 1).
7. La web tiene nombre accesible en el botón de movimiento a cualquier ancho, contraste suficiente en los números del flujo y una página 404 que no se mueve sin que se pida; el workflow de Pages fija sus acciones y da a cada job solo los permisos que usa (puntos 12, 22, 23 y 14; cita 1).
8. Cuando el dueño pide un plan, o antes de construir por la ruta de spec y plan o de diseño corto, el Lead entra por su cuenta al modo plan de Claude Code y sale con la aprobación del dueño; nunca lo hace en una sesión sin terminal (`claude -p`) ni en una corrida autónoma; y se comprueba en una sesión real (cita 4).
9. Todo queda en una rama aparte, con `npm run check` en verde; nada se fusiona, etiqueta, empuja ni publica sin el sí del dueño (citas 1 y 4 de la sección 2).

## 4. Lo que queda fuera

- Los puntos 19 y 21, hasta que el dueño diga sí.
- Los dos hallazgos sin verificar: la línea base de observación sin uso y los nueve avisos automáticos de `aether-observe` (#120, #121, #126 a #131 y #133).
- Fusionar a `main`, la versión 0.31.1 y cualquier push.
- Cambiar el modo de arranque del lanzador (`bypassPermissions`) o `agents/lead.md`.

## 5. Respuestas a las preguntas aclaratorias

- ¿Quién decide el 10 y el 13? El Lead, con las decisiones de la sección 2 (cita 2).
- ¿Quién decide el diseño del guard (2, 6, 7)? El Lead (cita 3).
- ¿Topes? Propuestos por el Lead: US$ 60 y 5 horas; el dueño no los ha confirmado con sus palabras.
- ¿Issues? Uno por punto de la auditoría, creados antes de empezar (parte del plan aprobado).
