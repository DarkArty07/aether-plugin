# Tarjeta de intención: reforzar el comportamiento de skills

- **Fecha:** 2026-11-13
- **Issues:** el paraguas #269 y sus hijos #270 a #277.
- **Confirmada por el dueño:** aprobó en modo plan la corrida `auto-20261113-172541-1e75` con este alcance, topes de 8 h y US$ 100.
- **Base:** versión 0.42.0, `origin/main` en `fbe5522`.
- **Evidencia:** el cuerpo de cada issue está copiado en `evidence/issue-NNN.md`, con las cifras de la medición del 2026-11-07 al 2026-11-13. Lee esas copias; cada criterio de abajo nombra su issue.

## 1. Las palabras del dueño

1. Sobre lo que pasó desde la spec 030: «no he visto que el lead intale por su cuenta skills, si he visto que usa las de aether pero no he tenido oprotndad de ver el desempeño».
2. Cuándo debe buscar skills el Lead: «cuando entra a un tema que no conoce y es un proyecto nuevo. cuando el lead necesita conocmiento practico de una tema. El conocmiento parametrico de los LLM es muy amplio pero no esta aplicado del todo a lo practico, pro ejmplo Machine leraning, sabe que esy tecnoias y demas pero no sabe procesos exactos, o por ejemplo google colab, sabe que es pero no conocieminto a detalle.»
3. El objetivo: «si por señales visibles esta bien, la idea e reforzar este comprotmaineot, averiguar porque fallo arreglar lo que ya esta y agregar hooks para reforzar el comprotmaiento. hazme una propeusta»
4. El permiso: «okay abre lo issues y hazme la propuesta para trabjar autonomamente y escoje lo que reocmiendes»

## 2. Lo que el dueño confirmó

- **Por qué falló la spec 030 en skills** (medido en #269): los cinco comportamientos descansan en un párrafo de texto del arranque y nada los dispara en el momento justo. Los dos disparadores construidos no salen (#270) o cuentan mal (#271). Tres requisitos de la 030 estaban mal planteados: R27 (el Lead elige las skills de una tarea, pero quien escribe `tasks.md` es el Writer, #273), R31 (el «mismo hallazgo» se construyó como el mismo texto, #270) y R33 (el uso se cuenta solo en agentes, #271).
- **El disparador de búsqueda es por señales visibles**, no por lo que el Lead crea saber (palabra 3): los modelos no notan lo que no saben.
- **Elegido por el Lead con la palabra 4:**
  - todos los hooks nuevos avisan, no bloquean;
  - el aviso de skills en delegados solo avisa al Lead y no cambia el brief, porque una skill que no viene al caso gasta tokens y confunde a Haiku;
  - entra `aether-report --skills`, que responde la palabra 1: ver el desempeño.

## 3. Criterios

**Arreglar lo que ya está** (palabra 3, «arreglar lo que ya esta»):

- **C1, #270. El aviso de hallazgo repetido llega cuando el error se repite.** Dos hallazgos de tareas distintas del mismo proyecto, sobre el mismo archivo y con palabras parecidas, cuentan como repetidos aunque el texto no sea igual y aunque vengan de sesiones distintas. Qué tan parecidas se fija como dato, no en el código. Por qué: hoy nunca salta (35 correcciones, ninguna repetición exacta).
- **C2, #271. Lo que el Lead carga cuenta como uso.** Cada vez que el Lead carga una skill, eso queda como uso, y el aviso de skills sin uso nunca nombra una skill cargada en los últimos 30 días. Lo que se guarda es el nombre de la skill, nunca texto de la conversación. Por qué: el aviso propondría quitar skills que el Lead usa a diario.
- **C3, #272. Una skill se cuenta una vez por proyecto.** Editarla o verla en un worktree no la registra de nuevo como creada. Por qué: hoy el registro dice 8 skills creadas donde hay 3.
- **C4, #273. Los planes pueden llevar skills a sus tareas.** Quien escribe las tareas de un plan conoce las skills del proyecto (nombre y descripción) y el campo `Skills:`, lo usa en las tareas donde una sirve (hasta 3), y la revisión del plan lo mira. Por qué: ningún plan ha llevado nunca una skill.
- **C5, #274. Una skill de proyecto mal puesta se nota al crearla.** Cuando el Lead crea o cambia una skill de proyecto y queda como carpeta real fuera de `.agents/skills/`, o cuando no cargó `aether:skills` en esa sesión, recibe un aviso que le dice qué hacer. Nunca bloquea. Por qué: 2 de 3 quedaron fuera de lugar, justo en las sesiones que no cargaron `aether:skills`.

**Agregar hooks que refuercen** (palabras 2 y 3):

- **C6, #275. El Lead busca skills cuando entra a un tema práctico.** Al escribir una tarjeta de intención, y en el primer arranque de Aether en un proyecto, si hay señales visibles de un tema (archivos, dependencias, palabras de la tarjeta) para el que no hay skill instalada, el Lead recibe un aviso con el tema y la indicación de cargar `aether:skills` y buscar una antes del plan. La tabla de temas y señales es dato que se edita sin tocar código, y empieza con los ejemplos del dueño (Machine Learning, Google Colab) y unos pocos más. `aether:skills` dice que las skills son para procesos, y que la documentación de la API de una librería se busca con Context7; y que si no encuentra una buena, escribe la skill del proyecto con lo que aprendió. Por qué: palabra 2.
- **C7, #276. El Lead sabe qué skill podría pasar a un delegado.** Al lanzar un delegado sin `AETHER-SKILLS:`, si el proyecto tiene una skill cuyo tema coincide con el encargo, el Lead recibe un aviso con su nombre. El encargo no cambia. Por qué: el Lead cargó sus skills 19 veces y nunca se las pasó a un agente.

**Ver el desempeño** (palabra 1):

- **C8, #277. Un comando muestra cómo se usan las skills.** `aether-report --skills` da, por proyecto y por periodo: las skills creadas y bajadas, las cargas del Lead, las pasadas a agentes (delegados y enjambre) y los avisos de este trabajo que salieron. Sobre los datos reales del dueño reproduce el orden de las cifras de #269. Por qué: la medición de #269 se hizo a mano.

**Sin romper nada:**

- **C9. La huella dormida y las reglas no crecen.** Fuera de una sesión del Lead nada cambia; el arranque sigue cabiendo en sus tres partes; `npm run check` pasa; las guías y la referencia de componentes dicen lo nuevo.

## 4. Fuera de alcance

- Medir si el trabajo sale mejor con skills: serían llamadas pagadas.
- Ampliar la lista de autores de confianza: es decisión del dueño.
- Mover las dos skills del dueño que hoy están en `.claude/skills/`: eso es `aether:tidy` con su sí.
- Meter skills en el encargo de un delegado de forma automática (C7 solo avisa).
- Un hook con modelo: todos los avisos corren sin modelo.
- El merge a `main`, el push, la etiqueta y la instalación quedan en «Espera tu sí».

## 5. Respuestas a las preguntas

- **¿Cuándo busca skills el Lead?** Por señales visibles de un tema práctico en un proyecto nuevo o en una tarjeta nueva (palabras 2 y 3).
- **¿Avisar o bloquear?** Avisar, en todos los hooks (elegido por el Lead, palabra 4).
- **¿El aviso de delegados mete la skill en el encargo?** No, solo avisa al Lead (elegido por el Lead, palabra 4).
- **¿Qué es un proyecto nuevo?** *Supuesto del Lead:* el primer arranque de Aether en ese repositorio, sin nota de continuidad ni estado previo de Aether. Es reversible.
- **¿Se dispara `PostToolUse` para la herramienta `Skill` en Claude Code 2.1.325?** *No verificado* (2026-11-13, sin fuente). El diseño lo comprueba sin modelo; si no se dispara, elige otra fuente que solo guarde el nombre de la skill, nunca texto de la conversación (spec 014 R10).
