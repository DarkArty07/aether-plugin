# Tarjeta de intención: soporte formal de skills, un árbol de archivos ordenado y continuidad entre sesiones

- **Dueño:** Christopher
- **Fecha:** 2026-11-07
- **Issue:** #125 (empezó por la dirección de arte; el dueño lo amplió a este tema de higiene: «creo que este issue es el bueno para esto»).
- **Confirmada por el dueño** con «okay ya esta aprobado junto con todo lo demas», «me agrada todo, todo se queda. haz un plan», su aprobación del plan en plan mode y el permiso «y trabaja autonamemte» (sesión e68e9fb9, corrida auto-20261107-010706-a4d1).

## 1. Las palabras del dueño

1. «Vamos a añadir soprote formal de skills para ether plugin, actualmente todos mi proyectos si manejan porque yo pido que las hagan pero no hay una especifciacion formal deque el lead tiene que hacer mantener o descrgar skills adecuadas. Investiga esto. Donde guardan las skills. Y tmabien me gustaria combidanrlo con la formalizacion de .aether .claude actualemtne que se guarda en cada ruta d elos dos, creo que no tenemos bien formalizado todos los arhcivos intenros de workflows una ruta donde guardalos.»
2. «la direccion de arte seria una skill aether no? son las skills canonicas de plugin, las skills de dueño y las skills bajadas por internet, hay que darle donde bajar»
3. «me gustaria meter una ordenacion formal que no se si ya haya sobre los archivos .md que el lead genera, ya sabes claude.md etc osea hacer un arbol de ordenaicon formal de archivos que dentro van las skills e intrucciones de como manteneralas descargalsds y hacerlas»
4. «hay que darle mas orden que todo se lea en un lugar y de manera ordenada, la idea es tomar lo que claude "ya tiene" y ampliarlo hacia lo que aether plugin necesita […] ademas, continuidad como sabe el lead que continuidad de proyecto hay? ahy reglas especifcias de continuidad?»
5. «sobre los proyectos existens el lead tambien los ordena»
6. «Ese cli ya no lo necesito.» (el CLI viejo `aether`, Python/Hermes)
7. «respecto al tema de las skills, tengo estas dos opcioens: https://www.skills.sh/ https://github.com/VoltAgent/awesome-agent-skills»
8. «considera que vamos a usar hooks para todos los puntos de ocmprotamiento que queremos cmabiar»
9. «okay ya esta aprobado junto con todo lo demas. Ahora falta la ultima cosa, el orden de los archivos y las rutas»
10. «los agentes tambien podran usar skills? el lead detemrianra cuales les instala perosnalmente?»
11. «me gustaria que el lead detemrine si son por proyecto si son permaemtne osea tal cual como hace el pero apliquye para agentes, cinlsuo que le pueda crear skills.» · «vamos a verlo en la practica»
12. «la creacion de skills sera autonoma verdad? no dependera del dueño las pida»
13. «me agrada todo, todo se queda. haz un plan» · «y trabaja autonamemte»

## 2. Lo que el dueño confirmó

El Lead le propuso estas doce conductas, cada una con el hook que la hace cumplir, y el dueño las aprobó todas (citas 9 y 13). Todos los hooks corren sin modelo y actúan solo en sesiones del Lead.

**Skills**
1. **Cuatro tipos.** De Aether: vienen en el plugin y no se editan; la dirección de arte es una. Permanentes del dueño: `~/.agents/skills/`. De proyecto: `.agents/skills/` en git. Bajadas: no se editan, se copian para cambiarlas. La copia real va en `.agents/skills/` y en `.claude/skills/` queda un enlace, como ya hace skills.sh con las skills personales del dueño. *Hook:* PreToolUse rechaza editar una skill de Aether o una bajada.
2. **Buscar y bajar.** Solo el Lead busca y baja, con skills.sh (`npx skills add`). Lee la skill completa. De autores de una lista de confianza que el dueño aprueba una vez, la baja sin preguntar; fuera de ella espera su sí. *Hooks:* PreToolUse revisa la fuente antes de `npx skills add`; PostToolUse guarda de dónde vino y su huella.
3. **Skills para los agentes.** El Lead elige qué skills recibe cada tarea, hasta 3: la línea `AETHER-SKILLS:` en el encargo, el campo `Skills:` en `tasks.md`. *Hook:* el que ya recibe cada llamada a un agente comprueba que existan, pega su contenido en el encargo (igual para Claude que para otros harness) y lo anota en el registro de delegados.
4. **El Lead crea skills para los agentes, por su cuenta.** Cuando un error se repite, cuando el proyecto tiene un método propio o cuando el dueño lo pide. Las de proyecto las crea y las usa solo y lo cuenta en el brief; las permanentes las crea y espera el sí del dueño antes de instalarlas para todos los proyectos. Si una no ayuda, propone quitarla. *Hooks:* PostToolUse tras un veredicto avisa si el mismo hallazgo ya salió en otra tarea; PostToolUse tras crear o cambiar una skill revisa tamaño, nombre, descripción y duplicados; SessionStart avisa de las que nadie usa.
5. **Dirección de arte.** El método es una skill de Aether; el Writer escribe la de cada feature visual en `specs/NNN/art-direction.md`, antes del plan (el experimento del #125 mostró que esa dirección antes del plan es lo que sube el resultado). Sin hook.

**Archivos**
6. **Instrucciones del proyecto.** `AGENTS.md` es el mapa y lo lee cualquier agente (Codex y Cursor lo leen; Claude lo lee cuando no hay `CLAUDE.md`). `CLAUDE.md` es una línea, `@AGENTS.md`, más lo que sea solo de Claude. `.claude/rules/` queda para reglas de Claude que cargan según el archivo que toca. Los encargos que Aether manda a otros harness llevan `AGENTS.md` (hoy solo pegan `CLAUDE.md`, y un `CLAUDE.md` de una línea los dejaría sin instrucciones). *Hooks:* PostToolUse tras editar `CLAUDE.md` o `AGENTS.md` revisa tamaño e importación; SessionStart avisa si el proyecto no cumple.
7. **Estado de Aether ordenado.** `.aether/` (local, fuera de git, distinto de `.claude/`) con un README que es el mapa de sus archivos; todas las copias de trabajo de Aether en una carpeta; el trabajo de seats, delegados y lanes agrupado; `.aether-exam/` y `.aether-tmp/` dentro de `.aether/`; todo lo temporal se borra solo. *Hooks:* SessionStart limpia seats, sesiones, notas viejas y `tmp/`, una vez por proyecto (hoy la marca que lo limita es una sola para todos, issue #186). Las copias de trabajo que crea Claude Code se quedan en `.claude/worktrees/`: un hook WorktreeCreate reemplazaría la creación de Claude Code, y si fallara no se crearía ninguna (lado reversible, supuesto del Lead).
8. **Escribir en `.claude`.** En sesiones del Lead pasa sin preguntar, solo en `skills/` y `rules/`, nunca settings ni hooks. *Hooks:* PermissionRequest deja pasar esas dos carpetas; PreToolUse rechaza que un agente toque settings o hooks.

**Continuidad y memoria**
9. **Continuidad.** Una nota por sesión en la carpeta de memoria de Claude, `memory/continuity/`, fuera del índice: el último mensaje del Lead, el resumen de la compactación, la rama, el commit, la hora y, si hubo, el motivo de un corte. Al abrir una sesión, Aether lee la última nota, la compara con git y da de 3 a 5 líneas: dónde se quedó, qué cambió, qué ramas tienen trabajo sin fusionar, qué delegados quedaron sin resultado, qué otras sesiones estuvieron activas y, si la anterior se cortó (su proceso ya no existe y nunca cerró), el comando para retomarla. La nota guarda texto de la conversación, solo en la máquina del dueño: el dueño lo aprobó (cita 9). *Hooks:* Stop, PreCompact, PostCompact, StopFailure, SessionEnd y SessionStart. Las notas de más de 30 días o de trabajo fusionado se borran solas.
10. **Memoria limpia.** La memoria de Claude solo guarda lo que dura (preferencias, lecciones); las fotos de versiones viejas pasan fuera del índice; las preferencias generales del dueño van a `~/.claude/rules/`. *Hook:* PostToolUse tras escribir en la memoria recuerda que el estado va a continuidad.
11. **Se retira `/aether:onboard`.** La nota automática hace lo que él hacía; para ir a fondo, el dueño se lo pide al Lead con palabras. Queda en el changelog.

**Proyectos existentes**
12. **El Lead los ordena** con estas reglas y pide el sí antes de mover o borrar. *Hooks:* SessionStart detecta el desorden (un `CLAUDE.md` que no importa `AGENTS.md`, uno de más de 200 líneas, restos del CLI viejo, skills duplicadas) y avisa al Lead; la skill `aether:tidy` hace el ordenado; PreToolUse frena cualquier borrado sin su sí.

**Convivencia.** Fuera de una sesión del Lead nada cambia: Claude normal y otros harness no notan nada, y lo que hagan, el Lead lo ve al iniciar por git.

## 3. Criterios

- **C1.** En una sesión del Lead, cada turno, compactación, corte y cierre deja escrita la nota de la sesión con lo que la conducta 9 enumera. (Citas 4 y 8.)
- **C2.** Al abrir una sesión del Lead, el dueño ve de 3 a 5 líneas que le dicen dónde se quedó el trabajo, qué cambió desde entonces y si la sesión anterior se cortó, con cómo retomarla. (Cita 4: «como sabe el lead que continuidad de proyecto hay?».)
- **C3.** Las notas no se acumulan: las viejas o de trabajo fusionado desaparecen solas, y el índice de la memoria no recibe estado. (Citas 4 y 9.)
- **C4.** `/aether:onboard` ya no existe y nada lo menciona como vigente. (Cita 9; conducta 11.)
- **C5.** Hay una regla escrita y comprobada de qué va en `AGENTS.md`, `CLAUDE.md` y `.claude/rules/`. (Citas 3 y 4.)
- **C6.** Cada archivo interno de Aether tiene un lugar documentado en un mapa; las copias de trabajo están en un solo lugar; nada temporal se queda para siempre; lo que ya existe se migra sin perder trabajo. (Citas 1 y 9.)
- **C7.** En una sesión del Lead, escribir en `.claude/skills/` y `.claude/rules/` no pide permiso; nadie puede tocar la configuración ni los hooks de Claude Code por esa vía. (Cita 4: ampliar lo que Claude ya tiene.)
- **C8.** Las skills tienen cuatro tipos con su lugar, y las de Aether y las bajadas no se editan. (Cita 2.)
- **C9.** El Lead baja skills de un lugar definido; lo de fuentes de confianza pasa sin preguntar y lo demás espera el sí del dueño; de cada skill bajada queda fuente y huella. (Citas 2 y 7.)
- **C10.** Cada tarea de un agente puede recibir hasta 3 skills elegidas por el Lead, con su contenido en el encargo, sea en Claude o en otro harness, y queda registro de cuáles recibió. (Citas 10 y 11.)
- **C11.** El Lead crea skills para los agentes por su cuenta, en el nivel que corresponde (proyecto o permanente), y los hooks le avisan cuándo hace falta una y cuándo una no se usa. (Citas 11 y 12.)
- **C12.** Aether trae la skill que enseña a buscar, bajar, crear y mantener skills, y la de dirección de arte, que el Writer usa en las features visuales. (Citas 2 y 3.)
- **C13.** El Lead detecta el desorden de un proyecto existente y lo puede ordenar con la skill `aether:tidy`, pidiendo el sí antes de mover o borrar. (Cita 5.)
- **C14.** Fuera de una sesión del Lead nada cambia, y la huella dormida queda medida. (Convivencia; cita 4.)

## 4. Fuera de alcance

- Aplicar el ordenado a los proyectos del dueño: en esta corrida solo se informa qué cambiaría en cada uno; aplicarlo espera su sí.
- Crear `~/.claude/rules/` con las preferencias del dueño y borrar los restos del CLI viejo: esperan su sí.
- SkillsMP como fuente y la lista de VoltAgent como algo más que una lista de autores: más adelante.
- Un hook con modelo (Haiku) para escribir la continuidad: se descartó, el brief del Lead y el resumen de Claude Code bastan.
- Agentes propios de cada proyecto (`.claude/agents/`): no se crean; lo especial de un proyecto va en skills.
- El merge a `main`, el push, la etiqueta y la instalación: quedan en «Espera tu sí».

## 5. Respuestas a las preguntas

- **¿De dónde se bajan?** De skills.sh: instala, guarda fuente y huella, y tiene búsqueda y auditorías parciales. VoltAgent sirve como lista de autores; SkillsMP queda para después (cita 7 y la comparación que el dueño aprobó).
- **¿Quién busca y baja?** Solo el Lead; los agentes pueden proponer.
- **¿Lista de confianza inicial?** *Supuesto del Lead:* Anthropic (`anthropics`) y Vercel (`vercel-labs`). El dueño agrega más.
- **¿Las skills de los agentes son por tarea o fijas?** El Lead decide por tarea; si una sirve a todas las tareas de un rol en un proyecto, lo anota como regla del proyecto (cita 11).
- **¿Dónde vive la continuidad?** En la memoria de Claude, `memory/continuity/`, fuera del índice; el dueño preguntó «sobre la contuidad es un archivo de memoria no?» y aprobó la propuesta.
- **¿`.aether` y `.claude` se juntan?** No: `.claude` es de Claude Code, está protegida y casi todo va a git; `.aether` es estado local de Aether.
- **¿Se mantiene onboard?** No, se retira (conducta 11).
- **¿Hook con Haiku para la continuidad?** No conviene (conducta 9, fuera de alcance).
- **¿Qué pasa si la sesión se corta a la mitad?** La nota se escribe cada turno; el corte se detecta porque el proceso ya no existe y nunca cerró; la conversación se retoma con `claude --resume <id>`.
