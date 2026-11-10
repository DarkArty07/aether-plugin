---
title: Tu primera petición
description: Dale al Lead una tarea pequeña y síguela desde tu mensaje hasta el brief corto del final
order: 202
---

# Tu primera petición

Al final de esta guía un cambio pequeño está hecho y comprobado, y sabes qué hizo el Lead para llegar ahí. Toma unos diez minutos.

## Antes de empezar

- Aether está instalado y `aeth` funciona ([Instalar y arrancar Aether](instalar-y-arrancar.md)).
- Tienes un proyecto en un repositorio git, con una cosa pequeña por arreglar. Esta guía usa un test que falla.
- Abriste `aeth` en la carpeta del proyecto.

## Pasos

### 1. Pide lo pequeño

Dile al Lead lo que quieres, con tus palabras:

```
Arregla el test que falla en test/cart.test.js
```

Lo que ves: el Lead explora el código antes de preguntar nada. Te pregunta solo lo que el código no puede responder, una pregunta a la vez, así que responde corto. Si escribe de vuelta lo que entendió, en puntos numerados, confírmalo con «sí, es buena idea» o di qué cambiar.

Un cambio pequeño o reversible no necesita documento: no hay tarjeta de intención, ni especificación, ni plan.

### 2. El Lead elige un camino y dice por qué

El Lead toma uno de tres caminos para cada trabajo, y te dice cuál y por qué:
- **Directo:** un cambio muy acotado, en pocos archivos y sin un ciclo de editar, probar y corregir: a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan. El Lead lo hace él mismo, en la conversación. Lo ves leer, editar y correr el test.
- **Tarea delegada:** trabajo acotado que sigue siendo una tarea de verdad, como un ciclo de editar, probar y corregir. Un subagente trabaja en segundo plano. Empieza en Haiku, el modelo más barato, y sube a Sonnet y después a Opus solo cuando debe. El sistema guarda ese escalón, no el Lead. Mientras tanto puedes seguir hablando con el Lead.
- **Swarm:** un plan de tres o más tareas, construido en paralelo. Una primera petición casi nunca lo necesita. Si el Lead decide que la tuya sí, diseña primero: [Una feature completa](feature-completa.md) sigue ese camino.

Un test que falla suele ser el camino directo o una sola tarea delegada.

### 3. Déjalo trabajar

Puedes ignorar qué modelo hace qué, los reintentos y las subidas. Antes de decirte que el trabajo de un delegado está listo, el Lead lo comprueba con pruebas y reglas que no necesitan un modelo: los tests, los archivos tocados fuera de lo que la tarea posee y un cambio vacío.

Aun así, dos cosas pueden llegar a ti:
- Un push, un merge a `main`, una publicación, un despliegue o un borrado. El guardia lo rechaza hasta que digas que sí, y va a tu lista en el brief.
- Una pregunta de permisos de Claude Code, si elegiste «Preguntar antes de cada herramienta». La sesión espera en ella. Contéstala.

### 4. Lee el brief corto

Cuando el trabajo termina, el Lead te da un brief. Fuera de una corrida es corto: lo que pediste, las decisiones, lo que espera tu sí, los supuestos, lo que no se verificó y las líneas RADAR que aplican. Los nombres de sus secciones están en español:
- «Espera tu sí» es tu lista: lo que solo tú puedes decidir. Si nada te espera, no tienes nada que contestar.
- «Supuestos» es lo que tu petición no cubría y el Lead decidió asumir. Veta los que no te gusten.
- «Qué no verifiqué» es lo que el Lead no pudo comprobar. Sé escéptico ahí.

La línea de cierre empieza con «Sesión» y dice cuánto costó la sesión a precio de lista.

[Leer el brief](leer-el-brief.md) explica cada parte y cómo contestar.

## Comprueba que funcionó

- Corre tú mismo el comando de tests. El test pasa, y el brief dice qué comando corrió el Lead.
- `git diff` y `git log` muestran qué cambió.
- El brief dice lo que el Lead no verificó, así que sabes qué mirar primero.

## Siguiente

- [Una feature completa](feature-completa.md): una petición más grande, con preguntas, un diseño y un swarm.
- [Leer el brief](leer-el-brief.md): cada parte del brief y cómo contestarla.
- [Methodology](../../methodology.md) (en inglés): los roles y los tres caminos completos, y [Delegates](../../guide/delegates.md) (en inglés) para ver cómo sube una tarea delegada.
