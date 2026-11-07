---
title: Archivos del proyecto, skills y continuidad
description: La regla de AGENTS.md y CLAUDE.md, el mapa de .aether/, los cuatro tipos de skills, la continuidad de sesión y el ordenado
order: 211
---

# Archivos del proyecto, skills y continuidad

Esta guía explica la organización formal de archivos y la continuidad entre sesiones en Aether: cómo estructurar las instrucciones del proyecto, el mapa del directorio local `.aether/`, cómo se gestionan y asignan las skills, cómo funciona la continuidad para saber dónde se quedó el trabajo y cómo ordenar proyectos desordenados.

## La regla de los archivos

Aether organiza las instrucciones del proyecto en tres niveles para que cualquier agente o harness encuentre lo necesario sin sobrecargar el contexto:

1. `AGENTS.md` es el mapa que lee cualquier agente al entrar al proyecto. Define el propósito general, la arquitectura, las reglas de desarrollo y las convenciones compartidas por los agentes, delegados y unidades de swarm.
2. `CLAUDE.md` es la línea `@AGENTS.md` más lo que es solo de Claude. Las directivas generales van en `AGENTS.md` para que los harnesses externos también las lean; en `CLAUDE.md` solo se colocan directivas exclusivas de Claude Code o de sus herramientas. Si `CLAUDE.md` consta únicamente de `@AGENTS.md`, los harnesses externos reciben `AGENTS.md` de forma directa.
3. Las reglas especializadas por ruta se guardan en `.claude/rules/`. Estos archivos modulares cargan automáticamente según el archivo que toca Claude Code, manteniendo el contexto enfocado en lo que se está editando.

Tanto `CLAUDE.md` como `AGENTS.md` siguen un tope de 200 renglones. Si alguno supera los 200 renglones, el hook del Lead muestra un aviso informativo. Este tope solo avisa y nunca bloquea tu trabajo.

## El mapa de .aether/

El estado local en tiempo de ejecución, los briefs temporales y las copias de trabajo viven en la carpeta `.aether/` en la raíz del proyecto. Este directorio está ignorado por el control de versiones y nunca va a git.

La estructura interna sigue el mapa definido en `plugins/aether/lib/tree-map.js`. Cada proyecto en el que corre Aether incluye un archivo `.aether/README.md` que documenta esta distribución:

| Ruta | Contenido | Escritor | Duración | En Git |
|---|---|---|---|---|
| `README.md` | Mapa del directorio de estado .aether y políticas | aether-session-start | permanente | nunca |
| `autonomy/` | Registro de permisos de autonomía, topes y autores de confianza | aether-autonomy | permanente | nunca |
| `broken-runs/` | Estado en cuarentena de corridas corruptas o interrumpidas | aether-plan | hasta limpiar | nunca |
| `pending.jsonl` | Registro de comandos irreversibles pendientes del sí del dueño | aether-guard | permanente | nunca |
| `runs/` | Directorios de estado de corridas activas y completadas | aether-plan | hasta limpiar | nunca |
| `worktrees/` | Copias de trabajo de unidades de una corrida (<run>/<task>) | aether-wt | hasta el fin de la corrida | nunca |
| `worktrees/lanes/` | Copias de trabajo desechables para llamadas de lectura (<run>/<call>) | aether-lane | hasta el fin de la llamada | nunca |
| `worktrees/exams/` | Copias de trabajo desechables donde corren exámenes (<feature>-<id>) | aether-exam | hasta el fin del examen | nunca |
| `work/seats/` | Trabajo y copias de trabajo de rondas de seats (<id>/) | aether-lane | 7 días | nunca |
| `work/delegates/` | Trabajo y copias de trabajo de delegados en otros harnesses (<id>/) | aether-delegate | 7 días | nunca |
| `tmp/` | Briefs temporales, paquetes y mensajes de seats | aether-plan, aether-wt, aether-lane | 24 horas | nunca |
| `exam/` | Examen de aceptación oculto mientras lo redacta el Examiner | Examiner | hasta el fin de la corrida | nunca |
| `lanes/` | Copias de trabajo heredadas de lanes (migradas a worktrees/lanes/) | legacy | migradas al arrancar | nunca |
| `exams/` | Copias de trabajo heredadas de exámenes (migradas a worktrees/exams/) | legacy | migradas al arrancar | nunca |
| `seats/` | Trabajo heredado de seats (migrado a work/seats/) | legacy | migrado al arrancar | nunca |
| `delegates/` | Trabajo heredado de delegados (migrado a work/delegates/) | legacy | migrado al arrancar | nunca |

### Limpieza de arranque y migración

Al iniciar una sesión, Aether ejecuta una limpieza de arranque automática:
- Los briefs y archivos temporales de `tmp/` se eliminan tras 24 horas.
- El trabajo de diseño en `work/seats/` y de delegados en `work/delegates/` se conserva 7 días antes de borrarse.
- Las notas de continuidad antiguas de más de 30 días se podan.

Si se detectan carpetas de una versión anterior (`lanes/`, `exams/`, `seats/` o `delegates/`), la migración las traslada a su nueva ubicación en el arranque sin borrar nada. La migración se aplaza si hay una sesión activa o escrituras recientes, garantizando una migración que no pierde trabajo ni altera copias de trabajo en curso.

## Los cuatro tipos de skills

Las skills aportan conocimientos, flujos y herramientas reutilizables para los agentes. En Aether se clasifican en cuatro tipos según su alcance:

1. **Skills canónicas del plugin:** Vienen integradas en Aether (como `aether:art-direction`, `aether:tidy` y `aether:skills`). Son de solo lectura y no se editan.
2. **Skills permanentes del dueño:** Se guardan globalmente en `~/.agents/skills/`. Están disponibles para todos los proyectos del dueño.
3. **Skills de proyecto:** Se ubican en `.agents/skills/` dentro del repositorio, van en git y se comparten con el equipo. El Lead puede crearlas y editarlas con autonomía.
4. **Skills bajadas:** Se descargan desde registros públicos con `npx skills add` a `.agents/skills/` y quedan anotadas en `skills-lock.json`. No se editan directamente para preservar su integridad; para modificar una skill bajada o del plugin, se copia con otro nombre en `.agents/skills/` y se edita esa copia.

Para mantener la compatibilidad con Claude Code, en `.claude/skills/` se genera un enlace simbólico a cada skill de `.agents/skills/` (o una copia si el enlace no es soportado).

### Descarga y autores de confianza

Para descargar skills externas se utiliza `npx skills add`. Como medida de seguridad ante riesgos de cadena de suministro:
- La lista de autores de confianza empieza vacía.
- Mientras la lista esté vacía, o ante autores no registrados, toda instalación se clasifica como acción irreversible bajo la clase `skill-install`.
- Si se activa `skill-install`, el comando se anota en `pending.jsonl` y queda en espera del sí explícito del dueño.
- El dueño puede agregar autores de confianza mediante `aether-autonomy trust`.
- Bajar skills de forma global con `-g` o desde URLs arbitrarias siempre requiere la confirmación explícita del dueño.

### Asignar skills a una tarea

El Lead puede asignar hasta 3 skills a cada tarea de un agente o delegado externo:
- En `tasks.md`, se indican las skills con el campo `Skills:` (por ejemplo, `Skills: erebus-ui, patron-api`).
- Al compilar briefs o delegar la tarea, se genera la línea `AETHER-SKILLS:` y se adjunta el contenido completo de las skills directamente en el encargo para que cualquier harness disponga de ellas.

## Continuidad

Aether mantiene la continuidad entre sesiones ante cortes de terminal, reinicios y compactaciones de conversación.

### Notas de sesión y privacidad

Durante una sesión del Lead, cada turno, compactación o finalización registra una nota de sesión en `memory/continuity/`, dentro del directorio de memoria de Claude del proyecto.
- Qué guarda: el último mensaje del Lead, el resumen de la última compactación, la rama git y commit actuales, fecha y hora, id de sesión y proceso, y motivo de corte o cierre.
- Privacidad: el texto de la conversación y las notas se guardan solo en la máquina del dueño dentro de `memory/continuity/`. Nunca salen del entorno local ni se envían a servidores externos.

### Aviso de arranque

Al abrir una nueva sesión, Aether examina la nota más reciente y presenta un aviso de 3 a 5 líneas con:
- Dónde se quedó el trabajo en la sesión anterior.
- Los cambios y commits en git desde la última sesión.
- Ramas con trabajo sin fusionar o tareas pendientes.
- Si la sesión anterior terminó de forma imprevista por un corte de terminal, el aviso lo indica y ofrece el comando para reanudarla:
  `claude --resume <id>`

### Poda de 30 días

Las notas no se acumulan indefinidamente. En cada arranque, la poda de 30 días elimina automáticamente notas con más de 30 días de antigüedad o de ramas ya fusionadas en la rama principal, conservando siempre la nota más reciente del proyecto.

## Ordenado con /aether:tidy

Con el tiempo, los proyectos acumulan archivos sueltos, configuraciones obsoletas o skills duplicadas. La skill `/aether:tidy` permite auditar y ordenar el proyecto con seguridad.

Al invocar `/aether:tidy`:
- Se detecta si `CLAUDE.md` no importa a `AGENTS.md` o si alguno supera los 200 renglones.
- Se localizan restos de versiones antiguas en `.aether/` y skills duplicadas entre `.agents/skills/` y carpetas personales.
- Sin confirmación previa, entrega un informe de solo lectura detallando lo que movería o borraría sin modificar ningún archivo.
- Aplicar los cambios requiere el sí explícito del dueño bajo la clase de protección `delete`, garantizando que nada se modifique sin tu consentimiento.

## Páginas relacionadas

- [Autonomía](../../guide/autonomy.md): permisos, topes y acciones irreversibles.
- [Componentes](../../reference/components.md): mapa completo de agentes, skills, hooks y workflows.
- [English version](../../guide/project-files-and-skills.md): this same guide in English.
