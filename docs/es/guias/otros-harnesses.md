---
title: Otros harnesses
description: Manda trabajo a agy, Codex, Grok, Cursor o Muse mientras dure su cuota, y compruébalo con el panel /harnesses
order: 206
---

# Otros harnesses

Al final de esta guía Aether manda el trabajo que no es del Lead a los planes de código que ya pagas, y puedes ver la cuota de cada uno. Toma unos quince minutos, casi todos instalando el CLI e iniciando sesión.

## Antes de empezar

- Aether está instalado y `aeth` funciona ([Instalar y arrancar](instalar-y-arrancar.md)).
- Estás en Linux o WSL. La superdelegación corre solo en Linux: en macOS y en Windows nativo las lanes quedan apagadas.
- Tienes un plan con el harness: agy, Codex, Grok, Cursor o Muse.
- Sabes lo que enciendes. Una lane trabaja sin pedir permisos y gasta la cuota de otro plan. Por eso `superdelegation` viene apagada por defecto y la enciendes tú. Claude nativo es siempre el respaldo, y el Lead mismo se queda en Claude.

## Pasos

### 1. Instala el CLI e inicia sesión tú mismo

Instala el CLI del harness como indica su fabricante e inicia sesión, en tu propia terminal. Aether nunca inicia sesión por ti ni abre los archivos de credenciales de un harness. Los comandos son `agy`, `codex`, `grok`, `cursor-agent` y `muse`. Comprueba que se encuentra el que instalaste:

```
which codex
```

Aether busca en el `PATH` del proceso de Claude Code, no en el de tu shell. Un directorio que solo agrega el perfil de tu shell puede faltar ahí.

### 2. Corre /aether:setup otra vez

```
claude "/aether:setup"
```

La configuración revisa de nuevo, y ahora encuentra los CLI que instalaste. Pregunta si mandarles trabajo, y puedes elegir varios. «No, solo Claude» es la respuesta recomendada. (También repite la pregunta de permisos: elige la misma respuesta para conservarla.) La opción de cada harness lleva una advertencia de que corre sin pedir permisos. Luego guarda tu respuesta como las opciones `superdelegation` y `harnesses`.

Cierra la terminal y abre una nueva: las opciones se leen cuando arranca una sesión.

### 3. O pon las opciones a mano

En Claude Code, abre `/plugin` → Installed → aether → Configure options. Pon `superdelegation` en true. Lista los harnesses en `harnesses`, separados por comas, entre `agy`, `codex`, `grok`, `cursor` y `muse`, por ejemplo `agy,codex`. Los valores por defecto son `superdelegation`, apagada, y `harnesses`, `agy`. Una lista sin ningún nombre válido significa `agy`. `claude plugin configure aether@aether-plugin` muestra qué opciones no están puestas.

### 4. Abre el panel

Arranca `aeth` en tu proyecto y escribe:

```
/harnesses
```

Lo que ves: un panel que no imprime nada en el chat y no llama a ningún modelo. Su título es `Aether · other harnesses`, y debajo una línea de opciones, `superdelegation ON · harnesses agy,codex`. Para cada harness muestra la versión y, por cada grupo de cuota, un estado (`usable`, `dry until <fecha> UTC`, `under the reserve` o `no reading`) y una barra con la parte que queda y `resets in <h>`. `Recent delegates` lista las cinco delegaciones más recientes.

`r` vuelve a leer la cuota, y `Esc` o `x` cierra el panel. El panel solo lee: el interruptor es la opción `superdelegation`. Con Muse encendido, `r` hace una llamada mínima, de unos 54 000 tokens de entrada de su suscripción.

### 5. Deja que el Lead lo use

No hay nada más que hacer. Con `superdelegation` encendida, cada llamada de un agente que no es el Lead va a un harness cuando uno de sus modelos, con algún esfuerzo, puntúa casi tanto como lo haría el par nativo. Va primero la cuota que se renueva antes, luego la llamada más barata. Claude nativo toma la llamada solo cuando ninguno puede. Un harness que falta, está sin cuota o falla manda la llamada al siguiente, y al final a Claude, sin preguntarte.

### 6. Conoce los límites

- **Contención.** Grok trabaja con `--always-approve`, y las otras lanes también corren sin avisos, en un worktree propio. Aether revisa los archivos que cambian y quita de su entorno las variables con nombre de token, clave o secreto. Pero tu directorio personal sigue ahí, porque cada CLI guarda allí su sesión. Esto previene accidentes, no a un agente que se ponga a buscar tus archivos, y nada deshace una acción de red.
- **Cursor** no está probado con una cuenta real, y viene sin modelos en la tabla de lanes, así que no toma ninguna llamada hasta que los agregues (ver [Lanes](../../guide/lanes.md#lanes), en inglés).
- **Codex, Grok y Muse** ya tienen sus modelos en las tablas. `muse-wonder-full-1.0`, de Muse, solo lo da Meta en algunos planes; una cuenta sin él es rechazada y la llamada corre en Claude.

## Comprueba que funcionó

- `/harnesses` muestra `superdelegation ON` y los harnesses que listaste, ninguno marcado `enabled, not installed`.
- Cada grupo de cuota dice `usable`. Un grupo `under the reserve` o `dry` se salta hasta que se recupere.
- `/aether:doctor` lista los CLI de harness que encontró.
- Después de un swarm, `/spend` muestra las llamadas a otros harnesses y sus dólares (ver [Ver el gasto](ver-el-gasto.md)).

Si ningún trabajo sale de Claude, o un harness muestra `Quota unavailable`, lee [Nothing runs on a lane](../../guide/troubleshooting.md#nothing-runs-on-a-lane) y [los mensajes del panel](../../guide/troubleshooting.md#the-harnesses-panel-says-quota-unavailable-or-enabled-not-installed) (en inglés).

## Siguiente

- [Ver el gasto](ver-el-gasto.md): los dólares y las llamadas que salieron de Claude.
- [Trabajar por horas](trabajar-horas.md): una corrida larga, con su freno de cuota.
- [Lanes](../../guide/lanes.md#lanes) (en inglés): la regla que elige el harness de cada llamada.
- [Opciones](../../guide/options.md#options) (en inglés): `superdelegation` y `harnesses`.
