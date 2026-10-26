# 017 · Dejar el proyecto limpio y coherente antes de hacerlo público

## Las palabras del dueño

- «necesito publicar ahora si mi plugin y comenzar a preparar varias tareas. Hacer publico el repo. Lo primero que necestio hacer antes de eso, es una refacorrizacion para limpiar codigo que no se usa, coherencia arquitectonica, y limpiar o ordenar docs.»
- «Lo primero que necesitamos hacer es que incoherecnias de arquiectura tenemos respecto el codgio, y luego buscar que codigo ya no usamos para mejorar mantenibilidad»
- Sobre dejar de aceptar los nombres viejos `lanes` y `seats` y el registro viejo del router: «Esta bien acutlaiza lo nuevo esta son las cosas que queria que detecras jkusto esto queria.»
- Sobre `roles` de `lanes.json`: «Esto tmabien lo queria Como ya ha flucutado mucho por el desarrollo quiero que todo este coentado ya cutlizar funciones que ahora se comprotan de otra manera.»
- Sobre los comandos que nada llama: «Yo no los uso YO como usuario lo unico que uso es aether-lead.»
- Sobre `codex` y `cursor`: «Es que no tengo esas cuebntas actualmente no la podemos probar porque no tengo sus cuentas.»
- Sobre los docs históricos y el repo público: «Sacalas del arbol tambien es lo que queria que descubierias adaptar el proyecto a un repopublico porque esta pensado para ser opensource. No vamos a usar CI porque ya no tengo minutos de CI dispoinubles.»
- Sobre cómo seguir: «En abse a lo que ya entendiste que quiero arreglar esto y en paralelo busca mas cosas»

## Lo que entendí (el dueño lo confirmó con su orden de arreglarlo)

El dueño va a publicar el plugin y a abrir el repositorio, que nació para ser código abierto. Antes quiere que el proyecto quede coherente y fácil de mantener: que la arquitectura que describen los docs sea la que hay en el código, que no quede código ni configuración de comportamientos que ya cambiaron, que los comentarios digan lo que las funciones hacen hoy y que los docs que un recién llegado no necesita salgan del árbol. No hay otros usuarios del plugin: el repo es privado y solo él lo tiene instalado, así que no se conserva compatibilidad con nombres antiguos. Lo único que él usa es `aether-lead`.

Esta tarjeta cubre ese trabajo de limpieza. Una búsqueda aparte, en paralelo, mira todo lo que hace falta para publicar (historial de git, datos personales, licencias, la superficie de GitHub, documentos para colaboradores), y lo que encuentre va a la tarjeta 018.

## Criterios (qué y por qué, nunca cómo)

1. **El proyecto no conserva nombres ni registros de comportamientos que ya no existen.** Ya no se acepta la opción `lanes` ni `seats`, ni `AETHER_SUPERDELEGATION_LEGACY`, ni se lee el registro viejo del router, ni se borran archivos `.router.json`, ni quedan rutas de compatibilidad con formatos antiguos que nadie escribe ya. Porque el dueño pidió «actualiza lo nuevo» y no hay más instalaciones.
2. **Un modelo solo recibe llamadas de los roles que su lista `roles` permite.** Hoy la lista se valida y nunca se usa para elegir. Porque el dueño la quería conectada y no solo escrita.
3. **Cada comentario del código describe lo que el código hace hoy.** Los comentarios que citan una decisión o una spec citan el número correcto; cada módulo dice en su cabecera qué es y a qué familia pertenece; no quedan comentarios que describan un comportamiento reemplazado. Porque el desarrollo «ha fluctuado mucho» y el dueño quiere todo comentado y al día.
4. **Cada dato vive en una sola fuente, o las copias están declaradas y las guarda una prueba.** Entre otros: los precios y las cifras de Muse son coherentes entre `prices.json`, `pairs.json`, `lanes.json` y `models.json`; la escalera de delegates se lee de una sola configuración; las listas de harnesses, de clases irreversibles y de plazos no se repiten sin que nada las compare. Porque la pregunta de partida es qué incoherencias hay entre la arquitectura y el código.
5. **Las capas del código son las que dice la arquitectura.** Los bins solo leen argumentos y llaman a `lib/`; no hay ciclos entre módulos de `lib/`; los adaptadores de harness no dependen del módulo que los orquesta; los helpers repetidos viven en un solo sitio; las familias de archivos (`lane-*`, `router-*`, `delegate-*`, `observe-*`, `seat*`, `spend*`) tienen nombre y lugar coherentes. Porque lo pidió como «coherencia arquitectónica».
6. **No queda código que solo mantienen sus pruebas ni restos de lo ya reemplazado.** Se quitan `waitForDelegate`, `lineText`, `LANE_NOTES`, los fixtures del router viejo y los imports sin uso, y toda constante o clave de configuración que nada lea y que ningún script o documento use. Porque pidió «código que no se usa».
7. **Los comandos que ningún flujo del plugin llama y que el dueño no usa se quitan,** salvo los que el Lead usa según sus reglas (`aether-delegate verdict --from-scratch`). Porque dijo que solo usa `aether-lead`.
8. **Los adaptadores de `codex` y `cursor` se quedan sin cambios de comportamiento, y la documentación y la tabla de opciones dicen que no están probados con una cuenta real.** Porque no hay cuentas para probarlos.
9. **Los docs que no sirven a quien llega por primera vez salen del árbol,** y siguen quedando `decisions.md`, el changelog, las guías, la referencia, los docs de método y el último handoff. Cada documento que se queda describe lo que el proyecto hace hoy y solo lo que es cierto, empezando por las decisiones D3, D4, D9, D10, A28, A40, A55, A61, A62 y por lo que `CLAUDE.md` dice del guard y de los bins. Ningún archivo versionado contiene rutas absolutas de la carpeta personal del dueño ni su correo. Porque quiere adaptar el proyecto a un repo público.
10. **El comportamiento visible no cambia,** salvo por los criterios 1 y 2, y `npm run check` termina en verde. Porque es una refactorización.

## Fuera de esta tarjeta

- Hacer público el repo, publicar el plugin, hacer push o fusionar a `main`: esperan el sí del dueño en su momento.
- Montar CI de ningún tipo: no hay minutos disponibles.
- Probar `codex` o `cursor` con cuentas reales.
- Los contenidos de la tarjeta 018: historial de git, licencias y términos de uso de datos de terceros (issue #97), la superficie de GitHub (issues, ramas, etiquetas), los documentos para colaboradores (CONTRIBUTING, SECURITY y similares) y los archivos locales del dueño (`assets/brand/`, `.omx/`, `.claude/`).
- Rediseñar cómo funcionan los harnesses o la escalera de delegates.

## Respuestas a las preguntas

- ¿Se borra el legado de `lanes` y `seats`? Sí. El dueño tiene que poner `superdelegation: true` en sus opciones antes de usar la versión sin ese legado; eso lo hace él.
- ¿`roles` debe limitar? Sí, lo quería conectado.
- ¿Qué se hace con los comandos sin llamador? Se quitan, salvo los del Lead.
- ¿`codex` y `cursor`? Se quedan, sin pruebas reales posibles.
- ¿Qué pasa con los docs históricos? Salen del árbol.

## Suposiciones del Lead (el dueño puede vetarlas)

1. «coentado» es «comentado» y «ya cutlizar» es «y actualizar»: el criterio 3 es sobre los comentarios al día. Es la más probable de que se corrija.
2. Quitar el lector del registro viejo del router borra el gasto del 19 al 22 de octubre de `/spend` y de `aether-report`; el dueño lo aceptó cuando se lo dije.
3. «Sacar los docs del árbol» incluye `docs/superpowers`, `docs/evaluations`, los handoffs (menos el último), `docs/roadmap` y `docs/evidence`; los archivos de `specs/` siguen siendo el método del proyecto y se quedan, salvo las carpetas `evidence/` con scripts que ya no corren.
4. La compatibilidad con corridas ya compiladas (`binDir`, `firstBase` de `run.workflow.js`) se quita también, porque nadie relanza corridas viejas.
