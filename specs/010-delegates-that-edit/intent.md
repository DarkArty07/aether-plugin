# Tarjeta de intención: los delegados que editan salen primero a otros harness

- **Dueño:** Christopher
- **Fecha:** 2026-10-21 (borrador para la siguiente sesión; todavía no hay spec)
- **Origen:** la 0.14.1 hizo que los delegados del Lead que **solo leen** pasen por la misma regla que el enjambre y el diseño ([A66](../../docs/decisions.md), [handoff](../../docs/handoff/2026-10-21-router-superdelegation-0.14.1.md)). Quedan fuera los que **editan**: de 15 delegaciones registradas entre el 19 y el 21 de octubre, 13 corrieron en Claude y solo 2, de investigación, salieron.
- **Confirmada por el dueño:** el Lead escribió de vuelta lo que entendía en puntos numerados (las suposiciones A, B y C) y el dueño respondió «lo que supones es lo que quiero».

## 1. Las palabras del dueño

1. «lo que quiero es poder gastar las cuotas de los otros planes incluso con delegate y el swarm y el swarm de diseño» (issue 028, 2026-10-19).
2. «como podriamos conectarlos con el modo superdelgacion para que caigan primero a harness externos y claude code como fallback».
3. «eso haria homogeneo la delegacion de todo el sistema superdelegacion SI O NO. y no habria tantas configs particulares no?»
4. «delegacion por niveles de intelgiencias en modelos y effort no?»: aunque sean harness externos, se sigue delegando por niveles de inteligencia de modelo y de effort.
5. «contruyes esa, quiero que en las sigueintes sesiones tambien el trafico de los agetnes delegados se vyaa a otros harness».

## 2. La intención, en una frase

Con la superdelegación encendida, **todo** delegado del Lead, también el que escribe código, intenta primero un harness externo con la regla única (puntos del par de referencia, cuota que se renueva antes, más barato por tarea), y Claude nativo queda de respaldo.

## 3. Lo que ya se supuso y el dueño confirmó

- **A.** El delegado que edita trabaja en un **worktree de unidad** que crea `aether-wt`, como una unidad del enjambre, y no en la copia desechable de hoy (una copia donde un cambio anula la respuesta).
- **B.** Al terminar, el Lead recibe un resumen, la rama y el resultado de las pruebas. **El Lead revisa y fusiona**, como ya hace con los delegados nativos. Si el externo falla (cuota, modelo, error), la tarea se repite en Claude y **nunca en el mismo par**.
- **C.** Una tarea que tarda más de unos 9 minutos queda en segundo plano en el externo si se puede, y si no, se queda en Claude.

## 4. Lo que hay que medir antes de escribir la spec

- **El límite de 570 segundos.** El motor corre el comando de un delegado con `$.process.run`, que rechaza más de diez minutos (`lib/delegate-limits.js`). Una tarea que edita suele tardar más. Hay que comprobar si el mod puede dejar la llamada externa corriendo y devolver el resultado después, como hace con un agente en segundo plano. Si no se puede, la alternativa es que el Lead lance un `aether-lane delegate` en segundo plano con Bash, que no depende del hook pero sí de que el Lead lo haga.
- **Credenciales fuera del entorno** del CLI externo, como en las lanes (`laneEnv`), y un worktree que no toque el checkout del dueño.
- **Quién supervisa** al delegado: hoy no tiene supervisor. La propuesta es el Lead, antes de fusionar.
- **El cupo** (`maxParallel`) de cada harness: los delegados corren fuera de una corrida y hoy no cuentan contra él.

## 5. Fuera de alcance

- El Lead mismo, que sigue en Claude.
- El enjambre y el diseño, que ya usan la regla.
- Cambiar la regla de elección: es la de A65 y A66.
