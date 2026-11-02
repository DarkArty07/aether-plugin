---
title: Actualizar y desinstalar
description: Actualiza Aether, enciende la actualización automática, cambia lo que elegiste, fija o revierte una versión, y desinstala el plugin y el comando aeth
order: 208
---

# Actualizar y desinstalar

Al final de esta guía puedes llevar Aether a una versión más nueva, volver a una más vieja y quitarlo por completo. Cada parte toma unos minutos.

## Antes de empezar

- Aether está instalado: `claude plugin list` muestra `aether@aether-plugin`.
- El plugin y `aeth` son dos cosas. El plugin vive en las carpetas de plugins de Claude Code. `aeth` es un archivo pequeño que `/aether:setup` dejó en una carpeta de tu `PATH`. Corre cada vez la versión instalada más nueva, así que una actualización no pide una segunda configuración, y desinstalar el plugin no quita el archivo.
- Una actualización surte efecto en una sesión que arranca después de ella, así que cierra antes tus sesiones de Aether.

## Pasos

### 1. Actualiza

```
claude plugin update aether@aether-plugin
```

Termina con `Restart to apply changes.` Cierra la terminal, abre una nueva y escribe `aeth`. Claude Code guarda 14 días la carpeta de la versión anterior, y `aeth` corre la más nueva.

Lo que ves: la línea de bienvenida nombra la versión nueva.

### 2. O deja que Claude Code lo actualice

En Claude Code, abre `/plugin` → Marketplaces y enciende la actualización automática del marketplace `aether-plugin`. Viene apagada por defecto en los marketplaces de terceros.

### 3. Cambia lo que elegiste

Corre `/aether:setup` otra vez, las veces que quieras, y cierra la terminal después:

```
claude "/aether:setup"
```

Refresca `aeth` y repite las preguntas, así que puedes cambiar el modo de permisos, los harnesses o el nombre. Un `aeth` escrito por una versión anterior sigue funcionando y arranca con los permisos omitidos, como antes. Corre la configuración para elegir otro modo.

### 4. Fija una versión, o revierte

Para quedarte en una versión, dale a la fuente del marketplace un `ref`, una etiqueta de versión, en `~/.claude/settings.json`:

```
"extraKnownMarketplaces": {
  "aether-plugin": { "source": { "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v<versión>" } }
}
```

Edita esa entrada en su lugar. Tras una instalación Claude Code agrega `enabledPlugins` y el marketplace oficial al mismo archivo, y reemplazarlo los perdería. Luego arranca una sesión, que descarga la etiqueta, y corre la actualización del paso 1. Pon el `ref` en una etiqueta más nueva, o quítalo, para volver a avanzar.

Nunca quites el marketplace para cambiar de versión: quitarlo desinstala Aether y borra sus datos. Si la actualización no mueve el plugin, arranca una sesión sin `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` y córrela otra vez. [Mantenimiento](../../guide/maintenance.md#update-pin-roll-back-and-uninstall) (en inglés) tiene los detalles.

### 5. Encuentra el archivo `aeth` antes de desinstalar

Mientras el plugin sigue instalado, escribe `/aether:doctor` en una sesión. La línea del comando dice `aeth runs Aether` y da su ruta. En una terminal también puedes correr:

```
command -v aeth
```

Para estar seguro de que el archivo es de Aether, mira sus dos primeras líneas. La segunda dice `# aether-first-setup stub`:

```
head -n 2 "$(command -v aeth)"
```

### 6. Desinstala el plugin

```
claude plugin uninstall aether@aether-plugin
```

Esto también borra el directorio de datos de Aether, `~/.claude/plugins/data/aether-aether-plugin/`, con los registros de uso, el historial de corridas, el registro de las tareas delegadas y los exámenes ocultos del Examiner. Agrega `--keep-data` para conservarlo.

Aether también guarda archivos dentro de los repositorios donde lo usaste, en `.aether/`: los permisos de autonomía, los diarios y briefs de las corridas, y la lista de comandos irreversibles. No están en el directorio de datos, así que la desinstalación los deja. Borra la carpeta a mano si ya no la quieres.

### 7. Quita el archivo `aeth`

Cuando hayas comprobado que es de Aether, quita el archivo que encontró el paso 5:

```
rm "$(command -v aeth)"
```

Si le diste otro nombre al comando, usa ese nombre. Si corriste la configuración con más de un nombre, repítelo con cada uno. Aether no editó ningún archivo de shell. Si agregaste una línea a tu perfil para poner la carpeta en tu `PATH`, esa línea es tuya: consérvala o quítala.

## Comprueba que funcionó

- Tras una actualización, `claude plugin list` muestra la versión nueva con el estado `enabled`, y `/aether:doctor` dice qué versión está instalada.
- Tras desinstalar, `claude plugin list` ya no muestra `aether@aether-plugin`.
- Tras quitar el archivo, `command -v aeth` no imprime nada.
- Sin `--keep-data`, el directorio de datos ya no existe.

## Siguiente

- [Instalar y arrancar](instalar-y-arrancar.md): para volver a poner Aether.
- [Trabajar por horas](trabajar-horas.md) y [Otros harnesses](otros-harnesses.md): las elecciones que guarda la configuración.
- [An update does not take](../../guide/troubleshooting.md#an-update-does-not-take) (en inglés): cuando la versión no cambia.
- [Opciones](../../guide/options.md#options) (en inglés): las ocho opciones y sus valores por defecto.
