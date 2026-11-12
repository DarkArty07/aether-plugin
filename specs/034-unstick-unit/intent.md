# Tarjeta de intención: destrabar en marcha una unidad del enjambre

- **Fecha:** 2026-11-12
- **Issues:** cierra #238 (parte 3 de #188; relacionados #179, #191, #208).
- **Confirmada por el dueño:** aprobó en modo plan la corrida `auto-20261112-015910-9484` (sesión 6d88bc21), con #238 dentro y la forma elegida por él (palabras 2 y 3).
- **Base:** versión 0.39.3, `origin/main` en `f372305`.

## 1. Las palabras del dueño

1. «necesito qe corrijas los urgentes de manera autonoma» (los urgentes incluyen #238).
2. A la pregunta «¿cómo quieres #238?», con tres opciones (apartar y seguir; arreglar en marcha; dejarlo para otra corrida), eligió: «arrelgar el marcha pero que alerte al lead si se detecta que se trabo».

## 2. Lo que el dueño confirmó

**El problema (#238).** Cuando una unidad del enjambre queda trabada, por ejemplo por un error del plan (una prueba fuera de su `Owns`), el Lead no puede arreglar solo esa unidad y seguir. Hoy tiene que parar todo el flujo (`TaskStop`), guardar con `aether-wt save`, arreglar la unidad a mano, fusionarla, adoptarla con `aether-wt adopt` y relanzar el resto. Evidencia: en la corrida `20261107-030516-ada1` (spec 030, Aether 0.34.0) el enjambre se lanzó 7 veces, y 6 de las paradas fueron para arreglar una unidad trabada (#188, #191). Un flujo parado no devuelve resultado, así que su gasto no se anotaba (#191). Cada lanzamiento que termina con todo fusionado paga su propia revisión final.

**Lo que ya existe y no se cambia.** El enjambre deja seguir a las demás unidades cuando una se traba. La escalera bloquea una unidad cuando se repite la misma causa o los mismos cambios fuera de `Owns` (#188, partes 1 y 2). La revisión final se difiere hasta que todas las unidades estén fusionadas, y `aether-wt adopt` cuenta como integrada una unidad que el Lead hizo a mano.

**La decisión (palabra 2):**
1. Cuando el flujo detecta que una unidad se trabó, **avisa al Lead en ese momento**, mientras el flujo sigue corriendo, sin esperar a que termine el lanzamiento.
2. Las unidades que no dependen de ella siguen trabajando y fusionándose.
3. El Lead **arregla esa unidad en marcha**, sin parar el flujo, y se la entrega.
4. El flujo integra el arreglo con las mismas reglas que cualquier unidad y sigue con las unidades que dependían de ella, en el mismo lanzamiento.

## 3. Criterios

- **C1, la alerta** (palabra 2, «que alerte al lead si se detecta que se trabo»): cuando una unidad se traba, el Lead se entera mientras el flujo corre, con la corrida, la unidad y el motivo, sin tener que consultar nada por su cuenta.
- **C2, las demás siguen:** mientras la unidad trabada espera, las unidades que no dependen de ella siguen corriendo y fusionándose como hoy.
- **C3, arreglar en marcha** (palabra 2, «arrelgar el marcha»): el Lead puede entregar al flujo en curso el arreglo de esa unidad sin pararlo. El flujo lo fusiona con las reglas de siempre (`Owns`, pruebas de fusión, línea base) y después lanza sus dependientes en el mismo lanzamiento.
- **C4, una sola revisión final:** un lanzamiento en el que una unidad se arregló en marcha termina con una sola revisión final, que también la cubre.
- **C5, espera acotada** (RADAR: Rápido): si el arreglo no llega en un tiempo acotado, la unidad termina bloqueada como hoy y sus dependientes quedan sin correr. La espera nunca deja la corrida colgada sin fin. El tiempo es configurable y tiene un valor por defecto razonable.
- **C6, el informe:** el informe de la corrida muestra la unidad como arreglada por el Lead, igual que una adoptada, con lo que hizo el Lead. El gasto del lanzamiento se registra como en cualquier lanzamiento que termina (#191).
- **C7, probado sin gastar tokens:** los escenarios del workflow, con agentes simulados, cubren los dos caminos: el de unidad trabada, alerta, arreglo y seguir, y el de unidad trabada y tiempo agotado.
- **C8, las reglas del Lead:** la skill `aether:swarm` le dice al Lead qué hacer con la alerta. El arranque (`skills/using-aether`) no crece: sus partes están en el límite de tamaño (#241).

## 4. Qué queda fuera

- Que el Lead pause por su cuenta una unidad que no está trabada.
- Cambiar la escalera, sus escalones o la regla de repetición.
- Cambios en `/aether:design`.
- Publicar una versión.

## 5. Respuestas y supuestos

- **¿Cómo lo quiere el dueño?** Palabra 2: arreglar en marcha, con alerta al Lead.
- **Supuesto del Lead: qué es «trabada».** Una unidad que hoy terminaría `blocked`: la escalera la bloquea (`blocked-same-cause`, `blocked-outside-owns`, escalera agotada) o su fusión se rechaza después del reintento (archivos fuera de `Owns`, pruebas en rojo tras fusionar). Es reversible.
- **Supuesto del Lead: cómo llega la alerta.** Hasta donde sé, Claude Code despierta al Lead cuando termina algo que él lanzó en segundo plano (un workflow, un agente o un comando de Bash en segundo plano), y un workflow en marcha no tiene forma de escribirle a mitad de camino. Una forma posible: el Lead deja corriendo, junto al enjambre, un comando en segundo plano que termina cuando una unidad se traba, y eso lo despierta. El Writer debe comprobar en el código y en la documentación del Workflow tool qué hay de verdad, y elegir. Es reversible.
- **Supuesto del Lead: el tiempo de espera** por defecto lo fija la spec y se guarda en configuración, no en el código. Es reversible.
