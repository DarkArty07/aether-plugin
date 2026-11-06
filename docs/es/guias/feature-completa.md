---
title: Una feature completa
description: Pide un trabajo más grande y síguelo por las preguntas, el diseño, la construcción y el brief, sabiendo qué hacer en cada punto
order: 203
---

# Una feature completa

Al final de esta guía una feature está construida, revisada y reportada en un solo brief, y sabes dónde te necesita el Lead y dónde no. Tu parte toma unos veinte minutos; la construcción toma lo que la feature necesite.

## Antes de empezar

- Aether está instalado y `aeth` funciona ([Instalar y arrancar Aether](instalar-y-arrancar.md)). Ya hiciste [Tu primera petición](primera-peticion.md).
- Los workflows dinámicos están encendidos. El diseño y el swarm son workflows dinámicos, y `/aether:doctor` dice si lo están. Si están apagados, enciende Dynamic workflows en `/config` y abre una sesión nueva. El Lead te lo dice y no diseña a mano.
- Tu proyecto es un repositorio git.

## Pasos

### 1. Pide la feature

```
Agrega un campo de código de descuento al checkout, con tests
```

### 2. Confirma lo que entendió el Lead

El Lead explora el contexto y escribe de vuelta lo que entendió, en puntos numerados, aparte de lo que asume. Confírmalo con «sí, es buena idea». Una corrección que deja tu intención como estaba entra en la nota; una que la cambia recibe un nuevo escrito de vuelta. Si dices que no sabes, el Lead hace una pregunta en su lugar.

Este paso es tuyo. El Lead no sigue sin él.

### 3. Contesta las preguntas

El Lead hace como máximo cinco preguntas, una a la vez, y solo sobre una elección difícil de revertir, sorprendente o un compromiso real. Lo que un valor por defecto puede resolver, lo asume y lo anota, y no lo pregunta. Antes del diseño también te dice lo que vale la pena saber: una opción mejor si la ve, el alcance, y el costo y el tiempo estimados de las corridas terminadas, o que todavía no hay historial.

### 4. La tarjeta de intención

El Lead escribe `specs/NNN-<topic>/intent.md`, con tus palabras tal como las dijiste, el entendimiento que confirmaste, los criterios, lo que queda fuera y tus respuestas. Solo el Lead la escribe, y hace commit de la carpeta. Léela una vez. Si algo está mal, díselo al Lead.

### 5. `/aether:design` corre solo

El Lead lanza `/aether:design` con la tarjeta. Tú esperas. El Writer escribe la especificación y el Judge la revisa; el Writer escribe después el plan y las tareas, `aether-plan check` pasa y el Judge los revisa; al final, el Examiner escribe un examen oculto que los constructores nunca ven. Un documento recibe como máximo dos revisiones.

Puedes ignorar los veredictos y la tabla `Complexity`. El Lead los lee. El diseño termina con un resultado:
- **`approved`:** la especificación, el plan y las tareas están listos. Nada que hacer.
- **`clarify`:** la tarjeta dejó una elección abierta. El Lead te pregunta, escribe tu respuesta en la tarjeta y lanza de nuevo.
- **`dispute`:** una revisión no aprobó tras dos revisiones, o el Judge rechazó el enfoque. El Lead replantea la tarjeta o pone las dos posturas en tu lista. Nunca pasa por encima del Judge.
- **`failed`:** el paso y por qué. El Lead lanza una vez más.

### 6. La construcción

El Lead elige cómo construir y dice por qué: él mismo, una tarea delegada, o el swarm (`/aether:run`) para un plan de tres o más tareas.

Lo que sigue depende de tu permiso:
- **Sin permiso para trabajar por horas,** el Lead se detiene en el plan con un brief corto que recomienda cómo construir. Tu sí inicia la construcción.
- **Con él,** por ejemplo «trabaja por horas», el Lead construye por su cuenta dentro de sus topes. [Trabajar por horas](trabajar-horas.md) tiene los detalles.

En una sesión interactiva, el Lead entra por su cuenta al modo plan de Claude Code en cuatro momentos: cuando le pides un plan con cualquier palabra, cuando le das permiso de trabajar solo, aunque la tarea sea pequeña (antes de abrir la corrida), antes de escribir la tarjeta de un trabajo grande o de política, y antes de construir un diseño aprobado. El plan tiene siempre las mismas partes: intención, criterios, recursos (horas y dólares, que puedes cambiar antes de aprobar), ruta, supuestos, qué esperará de ti, y costo y tiempo estimados. Tu sí abre la corrida, pero no autoriza merges, push ni publicaciones. No entra en `claude -p`, en un subagente ni dentro de una corrida ya iniciada.

Puedes ignorar la mecánica del swarm: las oleadas, los worktrees, el supervisor y las subidas de Haiku a Sonnet y a Opus. Las unidades aprobadas se integran una a la vez, una revisión final cubre toda la corrida y no queda ningún worktree atrás. Cuando termina la construcción, el examen oculto corre sobre la rama que la contiene. Un test que falla es un hallazgo bloqueante del brief.

### 7. Lee el brief

El Lead termina con un brief que abre con «Espera tu sí» y «Supuestos». [Leer el brief](leer-el-brief.md) muestra cómo leerlo y cómo contestar.

## Comprueba que funcionó

- `specs/NNN-<topic>/` tiene `intent.md`, `spec.md`, `plan.md` y `tasks.md`.
- Llegó el brief, y cada ítem de «Espera tu sí» dice qué pasa con tu sí y con tu no.
- Un swarm construye en una rama de feature, nunca en `main`. Un merge a `main` espera tu sí.
- El brief dice lo que no se verificó, así que sabes dónde mirar primero.

## Siguiente

- [Leer el brief](leer-el-brief.md): cada parte del brief y cómo contestarla.
- [Trabajar por horas](trabajar-horas.md): deja que el Lead corra hasta el final sin ti.
- [Methodology](../../methodology.md) (en inglés): el método de la intención al brief, y [Autonomy](../../guide/autonomy.md#autonomy) (en inglés) para el permiso de trabajar por horas.
