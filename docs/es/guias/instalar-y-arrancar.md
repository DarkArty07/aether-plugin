---
title: Instalar y arrancar Aether
description: Instala el plugin, contesta dos preguntas y abre el modo Aether con un comando corto, en cuatro pasos
order: 201
---

# Instalar y arrancar Aether

Al final de esta guía Aether está instalado y estás hablando con el Lead en tu propio proyecto. Toma unos cinco minutos.

## Antes de empezar

Necesitas:
- Claude Code 2.1.294 o más nuevo;
- Node.js 22;
- git 2.36 o más nuevo;
- una terminal y la carpeta del proyecto en el que quieres trabajar.

Si no estás seguro de tenerlos, sigue: el paso 1 los revisa por ti y dice qué arreglar.

## Pasos

### 1. Pega una línea

Pega esto en una terminal:

```
claude plugin install aether --marketplace DarkArty07/aether-plugin && claude "/aether:setup"
```

La primera parte instala el plugin. La segunda abre Claude Code con `/aether:setup` como primer mensaje.

Lo que ves:
- La instalación imprime que 8 opciones aún no están definidas. Es normal: cada opción tiene un valor por defecto, y la configuración guarda las que tus respuestas cambian.
- Claude Code puede preguntar si confías en la carpeta. Di que sí.
- `/aether:setup` arranca y revisa, sin preguntarte nada, Claude Code, Node, git y lo demás que Aether necesita.

### 2. Contesta las preguntas y cierra la terminal

`/aether:setup` pregunta en tu idioma, en una sola pantalla. Son dos preguntas, a veces una:

**¿Cómo debe arrancar `aeth`, con los permisos?**
- «Trabaja de forma autónoma (sin pedir permisos)» es la respuesta recomendada. Claude Code no se detiene a preguntar antes de cada herramienta, así que el Lead y sus agentes pueden trabajar sin esperarte.
- «Modo auto de Claude Code» deja que Claude Code decida qué llamadas necesitan tu respuesta.
- «Preguntar antes de cada herramienta» hace que Claude Code te pregunte siempre. Un trabajo largo espera en cada pregunta.

Elijas lo que elijas, el guardia de Aether sigue activo: un `push`, un merge a `main`, una publicación, un despliegue y un borrado esperan tu sí, en el brief, salvo que hayas dado permiso para esa clase de acción con palabras generales.

**¿Quieres mandar trabajo a otros harnesses?** Solo la ves si la configuración encontró alguno instalado (`agy`, `codex`, `grok`, `cursor-agent` o `muse`). «No, solo Claude» es la respuesta recomendada. Si eliges alguno, la configuración enciende `superdelegation` y guarda `harnesses`; la opción de Grok lleva la advertencia de que corre sin pedir permisos. [Otros harnesses](otros-harnesses.md) tiene el resto.

Si el nombre `aeth` ya lo usa algo que no es de Aether, la configuración te pide otro nombre, una vez. Nunca reemplaza un archivo que no es suyo.

Después la configuración deja `aeth` en una carpeta de tu `PATH` cuando encuentra una, guarda lo que elegiste y termina en una pantalla final: la versión instalada, una línea por cada revisión (✓ o ✗ con su arreglo), el comando con su carpeta y si está en tu `PATH`, el modo de permisos, los harnesses y qué escribir ahora.

Ahora **cierra esta terminal.** Una nueva encontrará el comando nuevo.

### 3. Abre una terminal nueva en tu proyecto y escribe `aeth`

```
cd ruta/a/tu-proyecto
aeth
```

Lo que ves: Claude Code se abre como el Lead, con el tema violeta de Aether si tu terminal tiene color verdadero, y una línea de bienvenida:

```
Aether 0.30.0 · Lead listo · dime lo que quieres, o escribe /aether:help para ver qué puedo hacer
```

El número es la versión que instalaste. Si el idioma de tu sistema no empieza con `es`, la línea sale en inglés. Aparece una vez, cuando arranca la sesión.

Desde el día siguiente, este es el único paso que necesitas. `aeth -c` continúa la última conversación, `aeth --resume` te deja elegir una más vieja y `aeth -p "<tarea>"` corre una sola tarea. `claude` a secas sigue siendo el modo normal, donde el plugin no hace nada.

Si prefieres no instalar un comando corto, `claude --agent aether:lead --effort xhigh` arranca el mismo Lead. No necesita configuración y usa tus ajustes de permisos habituales de Claude Code.

### 4. Dile al Lead lo que quieres

Escríbelo con tus palabras, como se lo dirías a un colega:

```
El total del carrito ignora el código de descuento. ¿Lo puedes arreglar?
```

[Tu primera petición](primera-peticion.md) sigue una como esta desde tu mensaje hasta el brief.

## Comprueba que funcionó

- Apareció la línea de bienvenida y el Lead responde.
- Escribe `/aether:doctor`. Imprime un reporte fijo: qué revisó, qué falló y el arreglo exacto. Revisa Claude Code, Node, git, la versión de Aether, el comando `aeth` y si está en tu `PATH`, los workflows dinámicos, los harnesses instalados y si la carpeta es un repositorio git. No cambia nada.
- Fuera de una sesión, `claude plugin list` muestra `aether@aether-plugin` con el estado `enabled`.

**No se encuentra `aeth`.** Abre `claude` y escribe `/aether:doctor`. Te da la línea que debes añadir a tu `PATH`. Agrégala al perfil de tu shell, abre una terminal nueva y escribe `aeth` otra vez. Aether nunca edita un archivo de shell por ti.

Para cambiar una respuesta más adelante, corre `/aether:setup` otra vez.

## Siguiente

- [Tu primera petición](primera-peticion.md): una tarea pequeña, desde tu mensaje hasta el brief.
- [Otros harnesses](otros-harnesses.md) y [Actualizar y desinstalar](actualizar-y-desinstalar.md).
- [Getting started](../../getting-started.md) (en inglés): la misma instalación en forma de referencia, y [Troubleshooting](../../guide/troubleshooting.md) (en inglés) cuando algo falla.
- [Options](../../guide/options.md#options) (en inglés): las ocho opciones y sus valores por defecto.
