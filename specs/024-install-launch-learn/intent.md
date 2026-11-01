# Tarjeta de intención: instalar, lanzar y aprender Aether sin fricción (0.30.0)

- **Dueño:** Christopher
- **Fecha:** 2026-10-31
- **Confirmada por el dueño** con «Yo usaría también el 0.30.0 adelante procede», después de aprobar el plan de tareas y modelos de esta tarjeta.

## 1. Las palabras del dueño

1. «en el siguiente release me quiero dedicar a […] la comodidad que tiene el plugin para la persona que lo instala y cómo lo aprende a usar y cómo lo lanza.»
2. «me gustaría añadir una página de documentación con guías, así punto por punto, qué es lo que agrega este plugin para el uso de la persona que lo necesita.»
3. «que quede bien formalizado el plugin y te puedes guiar de otros plugins que existen» (oh-my-claudecode y everything-claude-code).
4. Sobre los pasos: «Lo de exit también está confuso me gustaría responder las preguntas y cerrar la terminal para abrir una nueva.»
5. Sobre las decisiones: «Yo usaría también el 0.30.0», «Documentación de las guías ingles y español», «Permisos por defecto es sin pedir permisos como yo lo uso en mi instalación».
6. Sobre los subagentes: «NO uses subagentes en opus. Puedes usar subagentes en sonnet y haiku pero no opus. Delimita que tareas va a hacer cada modelo y agente».

## 2. Lo que el dueño confirmó

Una persona nueva instala y usa Aether en **cuatro pasos**:

1. Pega una línea en la terminal: `claude plugin install aether --marketplace DarkArty07/aether-plugin && claude "/aether:setup"`.
2. Contesta las preguntas de `/aether:setup` y cierra la terminal.
3. Abre una terminal nueva en la carpeta de su proyecto y escribe `aeth`.
4. Le dice al Lead lo que quiere.

Los días siguientes, solo el paso 3.

`/aether:setup` revisa sin preguntar lo que se puede detectar y hace **dos preguntas**, a veces una: cómo arranca `aeth` con los permisos (por defecto «trabaja de forma autónoma», sin pedir permisos, como el lanzador de hoy) y si manda trabajo a los otros harnesses que encontró instalados (por defecto no). Si el nombre `aeth` está ocupado, pregunta otro.

## 3. Criterios

- C1 **Instalar:** una línea instala el plugin y abre Claude Code con `/aether:setup`; la configuración revisa los requisitos, hace las dos preguntas, guarda las opciones, deja `aeth` en un directorio del `PATH` cuando lo hay y termina en una pantalla que dice qué escribir.
- C2 **Lanzar:** `aeth` es la forma recomendada; arranca con el modo de permisos elegido (autónomo por defecto) y abre el Lead con una línea de bienvenida que nombra `/aether:help`.
- C3 **Diagnosticar:** `/aether:doctor` da un reporte fijo (qué revisó, qué falló, el arreglo exacto) sin cambiar nada.
- C4 **Aprender:** guías paso a paso en inglés y en español, una página «qué agrega Aether» punto por punto con una hoja de atajos, y `/aether:help` dentro de la sesión.
- C5 **README y sitio:** los cuatro pasos arriba del README y en la sección de instalación del sitio, en los dos idiomas.
- C6 **Lo que no cambia:** el plugin sigue dormido en una sesión normal (no avisa, no escribe, no inyecta); la configuración no toca archivos que no son suyos ni ajustes ajenos a Aether.
- C7 **El reparto de modelos:** los subagentes corren solo en Sonnet o Haiku, cada uno con su modelo explícito; ninguno en Opus.
- C8 La 0.30.0 lista para publicar (`npm run check`), sin publicar: el tag y la publicación los hace el dueño.

## 4. Fuera

- El aviso de versión nueva al arrancar: necesita consultar la red; queda en Propuestas.
- Un comando de instalación propio (npx o curl): la línea con `&&` basta.
