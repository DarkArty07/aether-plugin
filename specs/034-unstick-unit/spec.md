# Destrabar en marcha una unidad del enjambre

- **Date:** 2026-11-12
- **Status:** Draft
- **Intent:** `specs/034-unstick-unit/intent.md` (tarjeta de intención confirmada por el dueño; cierra el issue #238, parte 3 de #188).

## Criteria

- C1, la alerta: cuando una unidad se traba, el Lead se entera mientras el flujo corre, con la corrida, la unidad y el motivo, sin consultar nada por su cuenta. «arrelgar el marcha pero que alerte al lead si se detecta que se trabo». Evidence: un escenario del workflow con agentes simulados deja una unidad trabada mientras el flujo corre, y una prueba del comando de vigilancia muestra que termina, mientras el flujo sigue, imprimiendo la corrida, la unidad y el motivo.
- C2, las demás siguen: mientras la unidad trabada espera, las unidades que no dependen de ella siguen corriendo y fusionándose. «arrelgar el marcha» (palabra 2): el flujo no se para. Evidence: un escenario del workflow con una unidad trabada y otras independientes, de la misma ola y de una ola posterior, muestra que esas se fusionan antes de que termine la espera de la trabada.
- C3, arreglar en marcha: el Lead entrega al flujo en curso el arreglo de la unidad sin pararlo; el flujo lo fusiona con las reglas de siempre (`Owns`, pruebas de fusión, línea base) y lanza después sus dependientes en el mismo lanzamiento. «arrelgar el marcha». Evidence: un escenario del workflow entrega un arreglo durante la espera y termina con la unidad fusionada y sus dependientes fusionados; otro, con un arreglo que la fusión rechaza, termina con la unidad bloqueada y sus dependientes sin correr.
- C4, una sola revisión final: un lanzamiento en el que una unidad se arregló en marcha termina con una sola revisión final, que también la cubre. Palabra 2: arreglar «en marcha», sin relanzar. Evidence: el escenario de C3 cuenta una revisión final y su paquete incluye el arreglo.
- C5, espera acotada: si el arreglo no llega en un tiempo acotado, la unidad termina bloqueada como hoy y sus dependientes no corren; la espera nunca deja la corrida colgada. Tiempo configurable, con valor por defecto. «que alerte al lead si se detecta que se trabo» (el Lead puede no estar mirando). Evidence: un escenario del workflow sin entrega termina con la unidad bloqueada tras el tiempo configurado; una prueba lee el tiempo de configuración, no del código.
- C6, el informe: el informe muestra la unidad como arreglada por el Lead, igual que una adoptada, con lo que el Lead hizo, y el gasto del lanzamiento se anota como el de cualquier lanzamiento que termina. «arrelgar el marcha». Evidence: una prueba del informe sobre una corrida con una unidad arreglada en marcha la cuenta como integrada y muestra su motivo y su commit; una prueba del gasto lo encuentra anotado (#191).
- C7, probado sin gastar tokens: los escenarios del workflow, con agentes simulados, cubren el camino de unidad trabada, alerta, arreglo y seguir, y el de unidad trabada y tiempo agotado. Evidence: `npm test` corre ambos escenarios en el arnés con el modelo falso.
- C8, las reglas del Lead: la skill `aether:swarm` dice al Lead qué hacer con la alerta; el arranque (`skills/using-aether`) no crece. «que alerte al lead». Evidence: una prueba busca en `skills/swarm/SKILL.md` la regla de la alerta; las pruebas de tamaño de las partes del arranque pasan y `skills/using-aether` no cambia de tamaño respecto de la base.

## User scenarios

1. **Unidad trabada y arreglada.** Dado un enjambre en marcha y el comando de vigilancia del Lead en segundo plano, cuando una unidad queda trabada (por ejemplo, una prueba fuera de su `Owns`), entonces el comando termina y despierta al Lead con la corrida, la unidad y el motivo; el Lead arregla la unidad y se la entrega al flujo; el flujo la fusiona con las reglas de siempre, lanza sus dependientes y termina con una sola revisión final.
2. **Las demás siguen.** Dado que una unidad espera su arreglo, cuando otras unidades no dependen de ella, entonces siguen corriendo y fusionándose sin esperar a la trabada.
3. **El arreglo no llega.** Dado que una unidad trabada espera, cuando pasa el tiempo configurado sin entrega, entonces la unidad termina bloqueada con su motivo, sus dependientes se saltan y la corrida termina; todo como hoy.
4. **El arreglo se rechaza.** Dado que el Lead entregó un arreglo, cuando la fusión lo rechaza (archivos fuera de `Owns` o pruebas en rojo), entonces la unidad termina bloqueada, sin una segunda espera, con el motivo del rechazo.
5. **Nadie vigila.** Dado que el Lead no dejó el comando de vigilancia, cuando una unidad se traba, entonces el flujo espera el tiempo configurado y termina como en el escenario 3.
6. **Sin trabadas.** Dado un enjambre en que ninguna unidad se traba, cuando corre, entonces el comando de vigilancia termina al acabar la corrida diciendo que nada se trabó, y el flujo no cambia en nada.

## Requirements

- R1: Una unidad «trabada» es la que hoy terminaría `blocked`: la escalera la bloquea (`blocked-same-cause`, `blocked-outside-owns`, escalera agotada) o su fusión se rechaza después del reintento (archivos fuera de `Owns`, pruebas en rojo tras fusionar). Al trabarse, la unidad no termina: queda en espera de arreglo, el flujo lo anota con su corrida, su unidad y su motivo en un lugar que las herramientas del Lead leen, y lo dice en su vista de progreso. Sirve a: C1, C3.
- R2: Mientras la unidad espera, su trabajo (rama o parche) sigue disponible para el Lead, con los archivos que quedaron fuera de `Owns` y el motivo, y se conserva hasta que la espera acabe. Sirve a: C3.
- R3: Existe un comando, de la herramienta `aether-wt`, que el Lead deja en segundo plano junto al enjambre. Termina cuando una unidad de la corrida está trabada y no atendida, e imprime la corrida, la unidad y el motivo. Si ya hay una trabada sin atender al lanzarlo, termina de inmediato con ella; relanzarlo no pierde ninguna. Termina también, sin quedar colgado, cuando la corrida acaba, diciendo si hubo unidades trabadas. Sirve a: C1, C5.
- R4: Existe un comando de `aether-wt` con el que el Lead entrega al flujo en curso el arreglo de una unidad trabada (corrida, unidad y el trabajo arreglado) y un motivo. Se rechaza si la unidad no espera ese arreglo, y no toca la rama de integración. Sirve a: C3, C6.
- R5: El flujo toma la entrega y la fusiona por el mismo camino y con las mismas reglas que cualquier unidad: una a la vez, con `Owns`, pruebas de fusión y línea base. Si se rechaza, la unidad termina `blocked` con el motivo, sin segunda espera. Sirve a: C3.
- R6: Mientras una unidad espera, las unidades que no dependen de ella, directa o indirectamente, no esperan: siguen corriendo y fusionándose, también las de olas posteriores. Sirve a: C2.
- R7: Cuando la entrega se fusiona, los dependientes de la unidad corren en el mismo lanzamiento. Cuando termina bloqueada, siguen saltándose como hoy. Sirve a: C3, C5.
- R8: La espera tiene un tiempo máximo, en segundos, guardado en un archivo de configuración y no en el código, con valor por defecto de 1800 (30 minutos). Pasado el tiempo sin entrega, la unidad termina `blocked` con su motivo de siempre. La espera marca el tiempo con las pausas que el flujo ya usa para otros fines, y esas pausas no cuentan en el presupuesto de agentes. Sirve a: C5.
- R9: Un lanzamiento con una unidad arreglada en marcha y todas sus unidades fusionadas hace una sola revisión final, cuyo paquete incluye el arreglo; la revisión no se difiere por esa unidad ni se repite. Sirve a: C4.
- R10: El informe de la corrida cuenta la unidad arreglada en marcha como integrada y la muestra como arreglada por el Lead, como una adoptada, con el motivo y el commit del arreglo. El resultado del lanzamiento, que termina de forma normal, se registra en el gasto. Sirve a: C6.
- R11: Los escenarios del workflow en `tests/`, con agentes simulados y el modelo falso, cubren: unidad trabada, alerta, arreglo y seguir (R1, R4 a R7, R9); unidad trabada y tiempo agotado (R8); y arreglo rechazado en la fusión (R5). Un escenario sin unidades trabadas muestra que el flujo y su resultado no cambian. Sirve a: C7.
- R12: La skill `aether:swarm` dice al Lead, en palabras: dejar el comando de vigilancia en segundo plano al lanzar el enjambre; qué hacer cuando termina con una unidad trabada (leer el motivo, arreglar la unidad, entregarla con el comando de R4, relanzar la vigilancia); y que, sin entrega a tiempo, la unidad termina bloqueada y se trata como hoy. Las guías de `docs/` que describen unidades bloqueadas dicen lo mismo y siguen pasando `tests/docs-facts.test.js`. `skills/using-aether` y sus partes del arranque no cambian de tamaño. Sirve a: C8.

## Proposals

None.

## Assumptions

- **Cómo llega la alerta.** Se comprobó en el código y en la documentación del Workflow tool: un script de workflow solo puede escribir con `log()` (la vista de progreso del dueño, no un mensaje al Lead) y devolver su resultado al final; sus agentes pueden ejecutar comandos. No hay canal a mitad de camino hacia el Lead. Lo que sí despierta al Lead es que termine algo que él lanzó en segundo plano (`skills/using-aether` lo dice de los delegados; la tarjeta lo supone también de un comando de Bash en segundo plano). Por eso la alerta es R3: un comando que el Lead deja corriendo y que termina al trabarse una unidad. El flujo y los comandos se hablan por archivos de la corrida, como ya hacen `adopted.json` y la escalera. Reversible: un canal mejor reemplaza R3 sin cambiar R1, R4 ni R5. Riesgo declarado: que Claude Code despierte al Lead por un Bash en segundo plano no se probó con un modelo real aquí; la prueba sin tokens (C7) no lo prueba, y una sesión real lo comprobaría a petición del dueño, que no quiere mediciones de pago sin pedirlas.
- **Una espera por unidad.** Una unidad espera una sola vez: si la entrega se rechaza, termina bloqueada. Evita ciclos sin fin. El dueño puede pedir más intentos.
- **El arreglo pasa por la fusión del flujo, no por `aether-wt adopt` a mano.** El Lead no escribe en la rama de integración mientras el flujo corre, porque chocaría con sus fusiones de una a la vez. Consecuencia, dicha por la tarjeta («con las reglas de siempre»): un arreglo que necesita tocar archivos fuera de `Owns` se rechaza, y la unidad termina bloqueada con el camino de siempre (`aether-wt adopt`). Reversible.
- **Tiempo por defecto de 1800 s.** Largo para que el Lead lea, arregle y entregue; corto frente a los techos de una corrida autónoma. Un tick de pausa son 120 s como máximo, así que 30 minutos son 15 ticks; con `ops` apagado cada tick cuesta una llamada de Haiku. Reversible, porque está en configuración.
- **Las unidades independientes de olas posteriores no esperan.** La tarjeta pide que las que no dependen de la trabada sigan «como hoy»; hoy una ola posterior arranca cuando termina la anterior, y con la espera eso las retendría. El plan puede cambiar cómo se ordenan las olas, no el resultado de R6.
- **El comando de vigilancia termina al acabar la corrida** (R3) para no quedar colgado. En una sesión sin cabeza (`claude -p`) Claude Code detiene el trabajo en segundo plano 10 minutos después del último turno, como ya dice la skill `aether:swarm`.

## Irreversible actions

None.

## Out of scope

- Que el Lead pause por su cuenta una unidad que no está trabada.
- Cambiar la escalera, sus escalones o la regla de repetición (partes 1 y 2 de #188).
- Cambios en `/aether:design`.
- Que el Lead escriba en la rama de integración mientras el flujo corre.
- Publicar una versión.
