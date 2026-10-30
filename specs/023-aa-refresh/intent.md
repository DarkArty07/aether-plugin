# Tarjeta de intención: la tabla de modelos sigue las cifras nuevas de Artificial Analysis (0.28.0)

- **Dueño:** Christopher
- **Fecha:** 2026-10-30
- **Confirmada por el dueño** con «trabaja autonomamente» (4), que abre la corrida autónoma `auto-20261030-012801-eb00` con los topes por defecto (8 h y US$ 50).

## 1. Las palabras del dueño

1. «si me gustaría agregar lo de la skill la página de AA y cambiar los modelos porque AA cambio todo lo de inteligence trabaja autonomamente en lo de Santa resuelve las implicaciones.» («lo de Santa» se lee como «esto»: el refresco de la tabla.)
2. Dicho antes, 2026-10-26: «Artificial Analysis data stays»: las cifras de AA se quedan en el proyecto.
3. Dicho antes, 2026-10-29, sobre los escalones de Codex: «justo esos modelos que escogiste son los que quiero» y «Me agrada. Asi como escogiste todas estas opciones ASI TIENES QUE ESCOGER siempre que hagamos un harness nuevo».

## 2. Lo que el dueño confirmó

La tabla de pares (`config/pairs.json`) y la de lanes (`config/lanes.json`) estaban en la escala de AA del 2026-10-26, salvo las filas de Codex, que se midieron con la del 2026-10-29. AA re-puntuó casi todo (Haiku high 37.8 a 29.6, Sonnet high 46.8 a 41.1, Opus high 53.6 a 51.7). El dueño quiere que la tabla quede en **una sola escala**, que los modelos que la regla elige cambien donde las cifras lo dicen, y que se resuelva todo lo que eso arrastra. Además pidió agregar al repositorio la skill `artificial-analysis` y sus dos páginas.

## 3. Criterios

- C1 La skill y las páginas de AA entran al repo, sin su ruta personal ni su correo. (Hecho antes del diseño: commit 80418f1.)
- C2 La tabla de pares queda en la escala del 2026-10-29: todas las filas con `slug` llevan las cifras de AA de ese día, y las cuatro filas estimadas de Muse Spark se re-estiman con el método de A96 sobre esa escala.
- C3 Los modelos cambian donde la regla lo dice: lo que `choose()` elige para cada pedido de Haiku, Sonnet y Opus se recalcula sobre la tabla nueva, y el cambio (el antes, el después y la razón) queda escrito.
- C4 Las implicaciones resueltas: las pruebas que fijaban la escala vieja o los escalones anteriores dicen lo nuevo, el índice de modelos y su README están regenerados, las guías que citan puntos o escalones los dicen bien, las skills dicen que la tabla es de una sola escala, y hay changelog, decisión A101 y handoff.
- C5 Los límites dichos: los costos por tarea siguen siendo los leídos el 2026-10-26 (la API de AA no los da); la regla lee inteligencia y no Terminal-Bench, y Terra low rinde menos en código que Haiku high con los mismos puntos.
- C6 El bug #134 (el gate de unidad solo guardaba el final de la salida de `npm test`) queda arreglado con una prueba, porque con 53 fallos conocidos habría repetido el bloqueo de la corrida anterior.
- C7 La 0.28.0 lista para publicar (`npm run check`), sin publicar.
- C8 Lo demás, a Propuestas.
