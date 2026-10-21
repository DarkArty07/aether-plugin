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

## 6. Actualización del 2026-10-21: la política, con sus palabras

Después de la 0.14.3 el dueño tuvo que repetir la política porque el Lead la trató como opcional («si quieres»). Lo que dijo, tal cual:

- «SI EL MODO SUPERDLEGACION ESTA ACTIVADO ES PRIORDIAD A TODA COSTA DE MANDAR EL TRBAAJO A OTROS HARNESS. QUE PARTE NO SE ME ENTIENDE».
- «primero quiero que se acaben las de otros harness porque si se acaban el trbajo no se detiene en la tarea de larga autonomia siempre esta el fallback de continuar y nunca detener el trabajo, pero si la de claude code se acabo el lead no puede seguir trabajando porque depende de su cuota».
- El Lead no puede salir de Claude: cambiarle el proveedor a la sesión principal apaga las funciones de claude.ai (control remoto desde la app, búsqueda web y más).
- «codex y cursor por el momento no los adoptamos»: lo que importa son agy, grok y muse.
- «necesito que trabjes en lo que conversmaos, continua implementandolo».

En una frase: la cuota de Claude es el punto único de falla de una corrida autónoma, así que es la reserva; las de los otros harness se gastan primero. Velocidad, tamaño de la tarea o comodidad no son razón para usar Claude. Claude toma una tarea solo cuando ningún par externo llega a los puntos que pide o todos están sin cuota o rechazan. Los delegados que editan son hoy la mitad de las delegaciones (22 de 44 del diario) y ninguna salió de Claude.

## 7. Lo que se midió (2026-10-21, cuatro exploradores de solo lectura, en otros harness)

- **El límite de diez minutos es real y el mod no puede devolver un resultado después.** `$.process.run` rechaza más de diez minutos (`lib/delegate-limits.js`); un hijo desprendido sobrevive al padre, pero nada en los hooks vuelve a leer su resultado para dárselo al agente; el único patrón existente para trabajo largo es un runner desprendido más una espera de como mucho 540 s por llamada (`specs/005-aether-design/plan.md`). Camino que queda: **el Lead lanza el comando con Bash en segundo plano**, que no depende del hook y avisa al terminar.
- **Una unidad en una lane hoy necesita un plan compilado.** `aether-lane start` exige un id de corrida, el grafo (`graph.json`) y el encargo de la tarea; `aether-wt merge` y la comprobación de Owns leen el mismo grafo; la supervisión y el texto del encargo viven dentro del workflow. No hay un comando que parta de un encargo suelto (objetivo, archivos, comando de prueba, rutas que posee). El hueco es un comando que **componga** lo que ya existe: crea la corrida y el grafo de una sola unidad, pide el par con `aether-lane pick`, lo lanza, espera, y devuelve la rama; y si ningún par sirve, lo dice para que el Lead use Claude.
- **Las reglas del Lead que mandan el trabajo a Claude** están en `skills/using-aether/SKILL.md`: la ruta «delegate task» para un plan de una o dos tareas, la tabla de modelos de un delegado y el método de ejecución (el enjambre solo desde tres tareas); las fijan `tests/bootstrap-names.test.js`, `tests/bootstrap-design.test.js` (tope de bytes: queda margen de unos 4 KB) y `tests/launcher.test.js`.
- **La revisión final del enjambre ya intenta primero una lane, con el paquete entero en una sola llamada;** solo si no hay par o falla corre en rebanadas en el revisor nativo. Eso queda fuera de esta spec: es un cambio menor aparte (rebanadas en lanes).

## 8. Criterios (qué y por qué, sin el cómo)

- **C1.** Con la superdelegación encendida, un delegado que edita archivos, de cualquier tamaño, corre primero en agy, grok o muse, elegido por la regla única (A65 y A66), y Claude nativo solo cuando ningún par externo lo puede tomar. Por: «PRIORDIAD A TODA COSTA DE MANDAR EL TRBAAJO A OTROS HARNESS».
- **C2.** El trabajo vuelve como una rama que el Lead revisa y fusiona; el CLI externo nunca toca el checkout del dueño. Por: la suposición A y B ya confirmadas.
- **C3.** Una tarea larga no se corta por el límite de diez minutos del motor. Por: el Lead no puede esperar con el mod.
- **C4.** Si un par se rechaza o falla, se prueba el siguiente y nunca el mismo, y Claude queda de último; nunca se le pregunta al dueño. Por: «siempre esta el fallback de continuar y nunca detener el trabajo».
- **C5.** El Lead gasta poco de Claude en esto: lanzar, esperar y decidir; la lectura del diff no la hace él si un revisor externo de solo lectura puede. Por: «el lead no puede seguir trabajando porque depende de su cuota».
- **C6.** Las reglas del Lead lo dicen, de modo que con la superdelegación encendida el Lead no mande trabajo que edita a Claude por costumbre.

## 9. Fuera de alcance

- Codex y Cursor.
- Mover al Lead fuera de Claude.
- La revisión final del enjambre en rebanadas por lane.

## 10. Supuestos del Lead por confirmar (con mi recomendación)

1. **La revisión del diff** la hace un delegado externo de solo lectura (sale a otro harness por la regla actual) y el Lead solo corre las pruebas y decide la fusión. Recomiendo sí, por C5.
2. **Una tarea sin pruebas propias** (por ejemplo documentación) se acepta con la revisión externa del diff y sin el comando de pruebas. Recomiendo sí.
3. **Cuánto espera el Lead:** no espera; sigue con otra cosa y el comando le avisa en segundo plano. Recomiendo sí.

## 11. Después de la primera ronda de diseño (2026-10-21): lo que cambia en la tarjeta

El diseño se corrió una vez (`wf_d46ae949-355`) y terminó en disputa tras tres rondas del Juez. Esta sección corrige la tarjeta con lo que el Juez encontró; donde choca con las secciones 8 a 10, manda esta.

- **Se quita el rechazo en el router.** Había quedado como requisito (R18) que el router rechace una llamada `Agent` que edita cuando la superdelegación está encendida. Cada ronda del Juez le encontró un fallo nuevo: el evento `tool.call` no trae el campo `workflow` y los agentes `aether:*` no pasan por el router. **Queda fuera de alcance y es una propuesta.** C6 se cumple con las reglas del Lead y con una medida: `aether-report` lista los delegados que editan y corrieron en Claude sin que el comando haya dicho «sin candidato».
- **C1 incluye el cupo.** Un harness con el cupo lleno no manda la tarea a Claude: se prueba el siguiente candidato de otro harness, y Claude queda solo cuando cada candidato está lleno, sin cuota o rechaza. Esto invierte a propósito la regla del enjambre de hoy (`workflows/run.workflow.js`, una espera agotada corre en nativo).
- **C5, la revisión del diff.** Corre siempre que exista un par externo distinto del que escribió; si no existe ninguno, el Lead lee el diff. Una tarea sin pruebas propias (documentación) se acepta con el veredicto de esa revisión.
- **El encargo lleva el rol, el modelo y el effort** de la tarea (de la tabla del Lead o del escalón del router): sin ellos `aether-lane pick` no puede pedir los puntos del par de Claude.
- **La fusión a la rama del dueño** la decide el Lead con el permiso que corresponda (`merge-main` si es `main`): el Lead registra el permiso y comprueba la rama; el guardia hoy solo clasifica `gh pr merge`.
- **El trabajo de un intento fallido** se guarda como parche en la carpeta de la corrida para poder verlo, y el worktree del intento se deshace: una sola redacción en toda la spec.
- **C7**, la corrida real con llamadas pagadas, se apoya en las palabras del dueño «autorizo gasto no hay problema».
- **Los supuestos 1 a 3 de la sección 10** quedan tomados como valores por defecto reversibles hasta que el dueño diga otra cosa.
- **Ahora corre sobre las correcciones de esta sesión:** el Juez puede salir a Muse (esquema estricto) y un asiento que falla prueba el siguiente par antes de Claude (A70).
