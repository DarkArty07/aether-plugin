# Dejar el proyecto limpio y coherente antes de hacerlo público

- **Date:** 2026-10-26
- **Status:** Draft
- **Intent:** [intent.md](intent.md)

## Criteria

Cada criterio cita las palabras del dueño tal como están en la tarjeta y nombra la evidencia que lo prueba.

- C1. **El proyecto no conserva nombres ni registros de comportamientos que ya no existen:** ya no se acepta la opción `lanes` ni `seats`, ni `AETHER_SUPERDELEGATION_LEGACY`, ni se lee el registro viejo del router, ni se borran archivos `.router.json`, ni quedan rutas de compatibilidad con formatos antiguos que nadie escribe ya. «Esta bien acutlaiza lo nuevo esta son las cosas que queria que detecras jkusto esto queria.» Evidencia: una búsqueda en el árbol no encuentra esos nombres en código, configuración ni docs vigentes, salvo menciones históricas expresas de su retirada; las pruebas fijan que el registro viejo no se lee y que ningún `.router.json` se borra.
- C2. **Un modelo solo recibe llamadas de los roles que su lista `roles` permite;** hoy la lista se valida y nunca se usa para elegir. «Esto tmabien lo queria Como ya ha flucutado mucho por el desarrollo quiero que todo este coentado ya cutlizar funciones que ahora se comprotan de otra manera.» Evidencia: una prueba pide un rol que un modelo no permite y ese modelo no es el elegido ni recibe la llamada.
- C3. **Cada comentario del código describe lo que el código hace hoy:** los comentarios que citan una decisión o una spec citan el número correcto, cada módulo dice en su cabecera qué es y a qué familia pertenece, y no quedan comentarios que describan un comportamiento reemplazado. «Esto tmabien lo queria Como ya ha flucutado mucho por el desarrollo quiero que todo este coentado ya cutlizar funciones que ahora se comprotan de otra manera.» Evidencia: una revisión de las cabeceras y de las citas a decisiones y specs contra el código y contra `docs/decisions.md`, sin citas a números equivocados ni descripciones de conductas ya reemplazadas.
- C4. **Cada dato vive en una sola fuente, o las copias están declaradas y las guarda una prueba:** los precios y las cifras de Muse son coherentes entre `prices.json`, `pairs.json`, `lanes.json` y `models.json`; la escalera de delegates se lee de una sola configuración; las listas de harnesses, de clases irreversibles y de plazos no se repiten sin que nada las compare. «Lo primero que necesitamos hacer es que incoherecnias de arquiectura tenemos respecto el codgio, y luego buscar que codigo ya no usamos para mejorar mantenibilidad» Evidencia: las pruebas de coherencia fallan cuando una copia declarada diverge de su fuente, y cada dato repetido que queda está declarado como copia.
- C5. **Las capas del código son las que dice la arquitectura:** los bins solo leen argumentos y llaman a `lib/`; no hay ciclos entre módulos de `lib/`; los adaptadores de harness no dependen del módulo que los orquesta; los helpers repetidos viven en un solo sitio; las familias de archivos (`lane-*`, `router-*`, `delegate-*`, `observe-*`, `seat*`, `spend*`) tienen nombre y lugar coherentes. «necesito publicar ahora si mi plugin y comenzar a preparar varias tareas. Hacer publico el repo. Lo primero que necestio hacer antes de eso, es una refacorrizacion para limpiar codigo que no se usa, coherencia arquitectonica, y limpiar o ordenar docs.» Evidencia: el grafo de dependencias de `lib/` no tiene ciclos ni aristas de un adaptador a su orquestador, ningún bin contiene lógica propia, y las pruebas existentes pasan sin cambiar su sentido.
- C6. **No queda código que solo mantienen sus pruebas ni restos de lo ya reemplazado:** se quitan `waitForDelegate`, `lineText`, `LANE_NOTES`, los fixtures del router viejo y los imports sin uso, y toda constante o clave de configuración que nada lea y que ningún script o documento use. «Lo primero que necesitamos hacer es que incoherecnias de arquiectura tenemos respecto el codgio, y luego buscar que codigo ya no usamos para mejorar mantenibilidad» Evidencia: una búsqueda no encuentra esos nombres ni referencias a ellos, y la suite pasa sin las pruebas que solo los sostenían.
- C7. **Los comandos que ningún flujo del plugin llama y que el dueño no usa se quitan,** salvo los que el Lead usa según sus reglas (`aether-delegate verdict --from-scratch`). «Yo no los uso YO como usuario lo unico que uso es aether-lead.» Evidencia: cada comando que queda tiene un llamador en un flujo del plugin, en las reglas del Lead o es `aether-lead`; los quitados no aparecen en el árbol ni en los docs vigentes.
- C8. **Los adaptadores de `codex` y `cursor` se quedan sin cambios de comportamiento, y la documentación y la tabla de opciones dicen que no están probados con una cuenta real.** «Es que no tengo esas cuebntas actualmente no la podemos probar porque no tengo sus cuentas.» Evidencia: las pruebas de esos adaptadores pasan sin cambios de sentido, y la guía y la tabla de opciones llevan el aviso de no probados con cuenta real.
- C9. **Los docs que no sirven a quien llega por primera vez salen del árbol,** y siguen quedando `decisions.md`, el changelog, las guías, la referencia, los docs de método y el último handoff; cada documento que se queda describe lo que el proyecto hace hoy y solo lo que es cierto, empezando por las decisiones D3, D4, D9, D10, A28, A40, A55, A61, A62 y por lo que `CLAUDE.md` dice del guard y de los bins; ningún archivo versionado contiene rutas absolutas de la carpeta personal del dueño ni su correo. «Sacalas del arbol tambien es lo que queria que descubierias adaptar el proyecto a un repopublico porque esta pensado para ser opensource. No vamos a usar CI porque ya no tengo minutos de CI dispoinubles.» Evidencia: el árbol ya no contiene los docs retirados y los que quedan están enlazados y resuelven; una búsqueda sobre los archivos versionados no encuentra rutas de la carpeta personal del dueño ni su correo.
- C10. **El comportamiento visible no cambia,** salvo por los criterios 1 y 2, y `npm run check` termina en verde. «Lo primero que necestio hacer antes de eso, es una refacorrizacion para limpiar codigo que no se usa, coherencia arquitectonica, y limpiar o ordenar docs.» Evidencia: `npm run check` en verde y ninguna prueba existente cambia de sentido salvo las que fijaban el legado de C1 o la lista `roles` sin efecto de C2.

## User scenarios

- **E1. Una instalación con los nombres viejos.** Dado una configuración que nombra `lanes`, `seats` o `AETHER_SUPERDELEGATION_LEGACY`, cuando el plugin la lee, entonces ninguno de esos nombres tiene efecto: manda lo que dice la configuración actual.
- **E2. El registro viejo del router.** Dado un registro del router viejo y archivos `.router.json` en disco, cuando corre `/spend` o `aether-report`, entonces ninguno de los dos los lee ni los borra, y el gasto que muestran es el de las fuentes actuales.
- **E3. Un modelo fuera del rol.** Dado un modelo cuya lista `roles` no incluye el rol pedido, cuando se elige modelo para ese rol, entonces ese modelo no es el elegido y no recibe la llamada; si ningún modelo permite el rol, la elección falla de forma clara sin llamar a un modelo no permitido.
- **E4. Un comentario leído por un recién llegado.** Dado cualquier módulo del proyecto, cuando un recién llegado lee su cabecera y sus comentarios, entonces sabe qué es, a qué familia pertenece y qué hace hoy, y cada cita a una decisión o una spec lleva al número correcto.
- **E5. Una copia que diverge.** Dado un dato declarado como copia de su fuente (un precio, una cifra de Muse, una lista de harnesses, de clases irreversibles o de plazos), cuando alguien lo cambia en un solo sitio, entonces una prueba falla hasta que fuente y copia vuelven a coincidir.
- **E6. Las capas comprobadas.** Dado el árbol tras la limpieza, cuando se recorren las dependencias de `lib/` y el contenido de los bins, entonces no hay ciclos, ningún adaptador de harness depende de su orquestador, ningún bin hace más que leer argumentos y llamar a `lib/`, y ningún helper está repetido en dos sitios.
- **E7. Los restos desaparecen.** Dado el árbol tras la limpieza, cuando se busca `waitForDelegate`, `lineText`, `LANE_NOTES` y los fixtures del router viejo, entonces no aparecen, no quedan imports sin uso ni constantes o claves que nada lea, y la suite pasa sin ellos.
- **E8. Los comandos que quedan.** Dado el árbol tras la limpieza, cuando se lista cada comando, entonces cada uno es llamado por un flujo del plugin, por las reglas del Lead (como `aether-delegate verdict --from-scratch`) o es `aether-lead`, y el dueño sigue entrando por `aether-lead` como hasta hoy.
- **E9. `codex` y `cursor` avisados.** Dado un lector que mira la guía o la tabla de opciones, cuando llega a `codex` o a `cursor`, entonces lee que no están probados con una cuenta real, y dado sus pruebas actuales, cuando corren, entonces pasan con el mismo comportamiento de hoy.
- **E10. Un recién llegado al repo público.** Dado quien abre el repositorio por primera vez, cuando recorre los docs, entonces solo encuentra `decisions.md`, el changelog, las guías, la referencia, los docs de método y el último handoff, todo lo que lee es cierto hoy, y ningún archivo versionado muestra rutas de la carpeta personal del dueño ni su correo.
- **E11. Nada más cambia.** Dado el plugin tras la limpieza, cuando corre `npm run check` y el dueño usa `aether-lead` como hasta hoy, entonces el check termina en verde y el comportamiento visible es el de hoy, salvo lo retirado por C1 y el límite de `roles` de C2.

## Requirements

- R1. La opción `lanes` y la opción `seats` dejan de aceptarse: no están declaradas, ningún código las lee y la tabla de opciones no las lista. Sirve a: C1
- R2. `AETHER_SUPERDELEGATION_LEGACY` deja de leerse y no tiene ningún efecto. Sirve a: C1
- R3. El registro viejo del router no se lee en ningún sitio, y ningún archivo `.router.json` se lee ni se borra; `/spend` y `aether-report` muestran solo el gasto de las fuentes actuales. Sirve a: C1
- R4. No queda ninguna ruta de compatibilidad con formatos antiguos que nadie escribe ya, incluida la compatibilidad con corridas ya compiladas (`binDir`, `firstBase` de `run.workflow.js`). Sirve a: C1
- R5. La elección de modelo para un rol solo puede dar un modelo cuya lista `roles` incluye ese rol, y la lista sigue validándose como hasta hoy. Sirve a: C2
- R6. Cuando ningún modelo permite el rol pedido, la elección falla de forma clara y ningún modelo no permitido recibe la llamada. Sirve a: C2
- R7. Ningún comentario describe un comportamiento ya reemplazado, y cada comentario que cita una decisión o una spec cita el número correcto. Sirve a: C3
- R8. Cada módulo dice en su cabecera qué es y a qué familia pertenece. Sirve a: C3
- R9. Los precios y las cifras de Muse coinciden entre `prices.json`, `pairs.json`, `lanes.json` y `models.json`: cada uno vive en una sola fuente, o sus copias están declaradas como copias. Sirve a: C4
- R10. La escalera de delegates se lee de una sola configuración. Sirve a: C4
- R11. Las listas de harnesses, de clases irreversibles y de plazos viven en una sola fuente, o sus copias están declaradas como copias. Sirve a: C4
- R12. Hay pruebas que comparan cada copia declarada de R9 y R11 con su fuente y fallan cuando divergen. Sirve a: C4
- R13. Cada bin solo lee argumentos y llama a `lib/`; ninguna lógica vive en un bin. Sirve a: C5
- R14. No hay ciclos entre módulos de `lib/`, y ningún adaptador de harness depende del módulo que lo orquesta. Sirve a: C5
- R15. Ningún helper está repetido: cada uno vive en un solo sitio. Sirve a: C5
- R16. Las familias de archivos (`lane-*`, `router-*`, `delegate-*`, `observe-*`, `seat*`, `spend*`) tienen nombre y lugar coherentes entre sí y con la arquitectura documentada. Sirve a: C5
- R17. `waitForDelegate`, `lineText`, `LANE_NOTES`, los fixtures del router viejo y los imports sin uso no están en el árbol, y tampoco las pruebas que solo los sostenían. Sirve a: C6
- R18. Ninguna constante ni clave de configuración que nada lea, y que ningún script o documento use, queda en el árbol. Sirve a: C6
- R19. Cada comando que queda es llamado por un flujo del plugin, es usado por el Lead según sus reglas (como `aether-delegate verdict --from-scratch`) o es `aether-lead`; los demás comandos no están en el árbol ni en los docs vigentes, y los que quedan conservan su nombre. Sirve a: C7
- R20. Los adaptadores de `codex` y `cursor` tienen el mismo comportamiento que hoy, y la documentación y la tabla de opciones dicen que no están probados con una cuenta real. Sirve a: C8
- R21. Los docs históricos no están en el árbol; quedan `decisions.md`, el changelog, las guías, la referencia, los docs de método y el último handoff, con sus enlaces en pie. Sirve a: C9
- R22. Cada documento que queda describe lo que el proyecto hace hoy y solo lo que es cierto: quedan corregidas las decisiones D3, D4, D9, D10, A28, A40, A55, A61, A62 y lo que `CLAUDE.md` dice del guard y de los bins. Sirve a: C9
- R23. Ningún archivo versionado contiene rutas absolutas de la carpeta personal del dueño ni su correo. Sirve a: C9
- R24. El comportamiento visible es el de hoy salvo lo retirado por los requisitos de C1 y el límite de `roles` de los de C2, y `npm run check` termina en verde. Sirve a: C10

## Proposals

Ninguna.

## Assumptions

Cada suposición es un valor por defecto reversible: el dueño puede deshacerlo a poco coste. Las cuatro primeras vienen de la tarjeta, que el dueño puede vetar; el resto las añade esta spec donde la tarjeta calla.

- **A1. «coentado» es «comentado» y «ya cutlizar» es «y actualizar»:** C3 trata de los comentarios al día. Base: es la lectura que el Lead registró en la tarjeta y que el dueño confirmó con su orden de arreglarlo; la propia tarjeta la marca como la más probable de que se corrija. El dueño puede revertirla, y entonces C3, R7 y R8 se reescriben.
- **A2. Quitar el lector del registro viejo del router borra el gasto del 19 al 22 de octubre de `/spend` y de `aether-report`.** Base: la tarjeta registra que el dueño lo aceptó cuando se lo dijeron; los archivos en disco no se borran (R3). Reversible restaurando el lector.
- **A3. «Sacar los docs del árbol» (R21) incluye `docs/superpowers`, `docs/evaluations`, los handoffs menos el último, `docs/roadmap` y `docs/evidence`.** Los archivos de `specs/` siguen siendo el método del proyecto y se quedan, salvo las carpetas `evidence/` con scripts que ya no corren; el README, `CLAUDE.md` y el sitio también se quedan. Base: la lista que el Lead registró en la tarjeta. El dueño puede revertirla documento a documento desde el historial.
- **A4. La compatibilidad con corridas ya compiladas (`binDir`, `firstBase` de `run.workflow.js`) se quita con el resto del legado (R4),** porque nadie relanza corridas viejas. Base: la tarjeta lo registra como suposición del Lead y no hay otros usuarios. Reversible restaurando esas rutas.
- **A5. Cuando ningún modelo permite un rol, la elección falla sin llamar a nadie (R6),** en lugar de ignorar la lista `roles` y elegir como hoy. Base: es lo único compatible con «un modelo solo recibe llamadas de los roles que su lista `roles` permite» (C2). El dueño puede revertirlo a un aviso con elección libre.
- **A6. Los nombres viejos que aún estén en las opciones del dueño simplemente dejan de leerse, sin error ni migración automática,** y el dueño pone `superdelegation: true` en sus opciones antes de usar la versión sin ese legado, como registra la tarjeta en sus respuestas. Base: no hay más instalaciones que la suya. Reversible volviendo a leer los nombres.
- **A7. Lo retirado (docs, código muerto, comandos) se borra del árbol y queda solo en el historial de git,** sin carpeta de archivo dentro del repo. Base: «Sacalas del arbol» (C9) y un repo pensado para un recién llegado; limpiar el historial mismo es asunto de la tarjeta 018. El dueño puede revertirlo restaurando cualquier archivo desde el historial.
- **A8. El inventario exacto de R18, R19, R11 y R15 se cierra al leer el código, con la definición de cada criterio («que nada lea», «que ningún flujo llama», «repetido»),** además de los nombres que la tarjeta ya nombra. Base: la tarjeta fija la definición y los ejemplos, no la lista cerrada. El dueño puede revertir cada baja una a una.
- **A9. Donde un documento necesita una ruta de ejemplo, la ruta personal del dueño se sustituye por una genérica o relativa; donde no hace falta, desaparece (R23).** Base: el requisito es que no quede el dato personal, no perder el ejemplo. Reversible sin coste.
- **A10. Los renombres por coherencia de familias (R16) tocan archivos internos; los nombres de los comandos que quedan y de `aether-lead` no cambian.** Base: C7 conserva lo que el dueño y los flujos usan, y C10 pide el mismo comportamiento visible. Reversible volviendo al nombre anterior.

## Irreversible actions

Ninguna se ejecuta en esta limpieza sin el sí del dueño en su momento. Quedan nombradas para que el plan no las dé por concedidas:

- Hacer público el repositorio. Clase: `publish`. Comando: `gh repo edit DarkArty07/aether-plugin --visibility public`.
- Publicar la nueva versión del plugin. Clase: `publish`. Comando: `claude plugin tag plugins/aether`.
- Fundir la rama de la limpieza en `main`. Clase: `merge-main`. Comando: `git merge <rama-de-la-limpieza>` sobre `main`.
- Subir la rama o `main`. Clase: `push`. Comando: `git push origin <rama-de-la-limpieza>` o `git push origin main`.
- Actualizar el plugin instalado del dueño a la versión sin el legado (tras poner él `superdelegation: true`, A6). Clase: `deploy`. Comando: `claude plugin update aether@aether-plugin`.

## Out of scope

- Hacer público el repo, publicar el plugin, hacer push o fusionar a `main`: esperan el sí del dueño en su momento.
- Montar CI de ningún tipo: no hay minutos disponibles.
- Probar `codex` o `cursor` con cuentas reales.
- Los contenidos de la tarjeta 018: historial de git, licencias y términos de uso de datos de terceros (issue #97), la superficie de GitHub (issues, ramas, etiquetas), los documentos para colaboradores (CONTRIBUTING, SECURITY y similares) y los archivos locales del dueño (`assets/brand/`, `.omx/`, `.claude/`).
- Rediseñar cómo funcionan los harnesses o la escalera de delegates.
- Todo cambio de comportamiento que no venga de C1 o C2, y cualquier función nueva.
