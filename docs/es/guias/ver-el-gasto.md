---
title: Ver el gasto
description: Lee lo que costó una sesión a precio de lista con el panel /spend y aether-report, y qué agrega la línea Asequible del brief
order: 207
---

# Ver el gasto

Al final de esta guía puedes decir cuánto costó una sesión, qué modelos y roles lo gastaron, y cuánto fue a otros harnesses. Toma unos cinco minutos, en una sesión que ya haya trabajado.

## Antes de empezar

- Tienes una sesión de Aether que ya hizo algo de trabajo, o vas a empezar una con `aeth`. El panel existe solo en una sesión de Aether; en una sesión de `claude` normal `/spend` no se ofrece, a propósito.
- Sabes que los dólares son a precio de lista. No son un porcentaje de tu cuota, ni lo que te cobra tu suscripción.

## Pasos

### 1. Abre el panel

Dentro de la sesión de Aether, escribe:

```
/spend
```

Lo que ves: un panel con el gasto a precio de lista de esta sesión. El total son los turnos del Lead y los de los agentes, repartidos por modelo, por esfuerzo y por rol, más las llamadas a otros harnesses y sus dólares. No llama a ningún modelo ni escribe nada en el chat. `Esc` o `x` lo cierra.

Si la sesión aún no gastó nada, el panel dice `No spend recorded yet`. Nunca muestra US$ 0.00 ni la cifra de otra sesión.

### 2. Lee los números

- **Un modelo sin precio** aparece en la lista, pero no se suma al total.
- **`incomplete`** significa que parte del registro no se pudo leer. El total es lo que se leyó.
- **La cuenta de reanudaciones** es aproximada. Una reanudación es un hueco de más de una hora entre dos eventos de la sesión, y el panel marca la cuenta como `approximate`.
- **Una sesión guarda una sola cifra.** El mismo id sigue sumando cuando la reanudas con `/resume`, `/compact` o `aeth --resume`. `/clear` y `--fork-session` empiezan un id nuevo, y el anterior sigue siendo su propia sesión.

### 3. Saca la misma cifra desde una shell

`aether-report --spend` la imprime como un objeto JSON: `usd` es el total, con `leadUsd`, `agentsUsd`, `byModel`, `byEffort`, `byRole` y `harness` (sus `calls` y `usd`). Dentro de una sesión, pídele al Lead que lo corra, porque ahí los comandos `aether-*` están en el `PATH` de la herramienta Bash. En una shell normal, corre su archivo por la ruta, donde `<versión>` es la que muestra `claude plugin list`:

```
node ~/.claude/plugins/cache/aether-plugin/aether/<versión>/bin/aether-report --spend --session <id>
```

Sin `--session` reporta la sesión que escribió última, que puede ser otra si corres varias a la vez. El panel siempre usa su propia sesión.

### 4. Mira la cuota aparte de los dólares

El precio de lista dice cuánto costarían los tokens. La cuota dice cuánto te queda de un plan, y `/harnesses` la muestra por cada harness (ver [Otros harnesses](otros-harnesses.md)). Para ver las tareas delegadas, dónde corrió cada una y cómo subió desde Haiku, usa `aether-report --delegates`.

### 5. Encuentra las mismas cifras en el brief

Todo informe de cierre lleva una línea de la sesión:

```
Sesión <id>: US$ <total> a precio de lista (Lead US$ <lead>, agentes US$ <agentes>). El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>).
```

La línea RADAR **Asequible** del brief da los dólares, la cuota usada, y el modelo y el esfuerzo de cada tarea delegada. Una tarea que tú colocaste en Sonnet u Opus con tus propias palabras también se cuenta ahí. Su vecina, **Delegación**, da las llamadas y los tokens que corrieron en otros harnesses, y la cuota que quedaba al empezar y al terminar.

Una corrida tiene una segunda cifra, su tope (US$ 50, salvo que nombraras otro). Cubre el swarm, las llamadas a otros harnesses y los asientos externos del diseño, y deja fuera los turnos del propio Lead. La línea de la sesión dice que no es esa cifra («y no es la cifra del tope»). Para el significado de cada línea RADAR, ve [Leer el brief](leer-el-brief.md).

## Comprueba que funcionó

- `/spend` se abre y muestra un total mayor que cero después de que la sesión trabajó.
- El total está repartido por modelo, esfuerzo y rol, y con la superdelegación encendida muestra las llamadas a otros harnesses.
- `aether-report --spend --session <id>` imprime `"recorded":true`.
- El informe de cierre trae la línea «Sesión …» con el mismo total.

Si `/spend` no se ofrece, lee [The /harnesses panel is not offered](../../guide/troubleshooting.md#the-harnesses-panel-is-not-offered) (en inglés); cubre también `/spend`.

## Siguiente

- [Leer el brief](leer-el-brief.md): las líneas RADAR y el resto del brief.
- [Trabajar por horas](trabajar-horas.md): los topes de una corrida y el freno de cuota.
- [Otros harnesses](otros-harnesses.md): la cuota de cada plan.
- [El panel /spend](../../guide/lanes.md#the-spend-panel) y [Delegates](../../guide/delegates.md#reading-the-log) (en inglés): la referencia de ambas cifras.
