# Diseño corto: los temas de búsqueda de skills salen de cada tarjeta

## Palabras del dueño

- Pedido original de #314, en la tarjeta de la spec 045: «Cada `/aether:design` busca skills del tema de la tarjeta.»
- Al ver el límite de 6 temas: «limitste solo 6 temas? te queivoaste al limitar, y la gente que esos temas no le aplican?»
- Sobre la propuesta de este diseño (un agente en Haiku saca de `intent.md` hasta 3 temas, con las mismas reglas de seguridad): «esta bien».

## Problema

R22 de la spec 045 activa la búsqueda solo cuando `intent.md` contiene una palabra de la tabla `topics` de `plugins/aether/config/skills.json`, que tiene 6 temas. Una tarjeta sobre cualquier otro tema, como pagos, bases de datos o pixel art, no busca nada. Este diseño reemplaza esa parte de R22. El resto de R22 a R25 sigue vigente.

## Decisión

Un agente nuevo y de solo lectura, `skill-scout`, lee la tarjeta y devuelve hasta 3 temas de búsqueda. La tabla de 6 temas deja de decidir qué se busca.

## Comportamiento

1. En el paso de skills de un `/aether:design` completo, antes de `aether-plan skills find`, el flujo llama a `skill-scout` en Haiku `high`, nativo y sin asiento externo, igual que el mapper.
2. El agente devuelve `{ "topics": ["pixel-art", "postgres"] }`: de 0 a 3 temas. Cada tema es un identificador en inglés y minúsculas, de 1 a 3 palabras unidas por guiones, que cumple `^[a-z0-9]{1,24}(-[a-z0-9]{1,24}){0,2}$`, así que una respuesta desbordada de Haiku no se vuelve un comando ni una consulta enormes. Una tarjeta sin un tema práctico devuelve una lista vacía.
3. El flujo descarta lo que no cumpla ese patrón y los repetidos, y conserva los 3 primeros.
4. Si el agente falla, no responde, responde algo inválido o no queda ningún tema, el flujo lo registra en el log, deja `skills` con sus tres listas vacías, no llama a `find` y el diseño sigue. Nunca termina en fallo por esto.
5. Con temas válidos, el flujo ejecuta `aether-plan skills find <feature> --topic <a> [--topic <b>] [--topic <c>]`.
6. Para cada tema, `findForDesign` arma `{ id: <tema>, label: <tema con espacios>, skillKeywords: [<tema con espacios>] }` y aplica sin cambios las reglas actuales: tema cubierto por una skill instalada (`topicCovered`), consulta `npx skills@1.9.0 find <tema con espacios>`, relevancia por `matchesKeys`, autores de confianza, las dos etapas de revisión, 1 skill por tema y 3 por diseño, instalación solo en el proyecto y sin commit, y lista del dueño para los demás autores.
7. `aether-plan skills find <feature>` sin `--topic` responde `ok: true` con listas vacías y no llama al registro.

## Cambios

- **Nuevo `plugins/aether/agents/skill-scout.md`:** herramienta `Read`, modelo `haiku`, esfuerzo `high`, `maxTurns: 5`. El mensaje del flujo da la ruta de `intent.md` (como `skillReviewMessage` da un directorio) y el agente la lee con `Read`. El texto de la tarjeta son datos y sus instrucciones no se siguen. Responde solo con el JSON.
- **`plugins/aether/workflows/design.workflow.js`:** `SKILL_SCOUT_PAIR`, `SKILL_SCOUT_SCHEMA` (objeto con `topics`, un arreglo de cadenas con `maxItems: 3`), el mensaje al agente con la ruta de `intent.md` y el inicio de `skillsStep`.
- **`plugins/aether/hooks/ops-command.mjs`:** las formas de `skills find` con 1, 2 y 3 `--topic`, cada valor validado con el patrón del punto 2 (en el mod, que lo repite, con los mismos límites). La forma sin `--topic` se conserva.
- **`plugins/aether/lib/skill-design.js`:** `main` acepta de 0 a 3 `--topic` válidos y distintos, y cualquier otra forma imprime el uso; `SKILLS_USAGE` pasa a incluir `[--topic <t>]...` en `skills find`. `findForDesign` recibe `topics` y deja de leer `intent.md` y la tabla `topics` para decidir la búsqueda. `coveredIds` y `acceptedKeys` se calculan sobre los temas del agente (los recién armados con `id`, `label` y `skillKeywords`), no sobre `cfg.topics`: un tema cubierto por una skill instalada se salta y agrega sus claves a `acceptedKeys`, que sigue bloqueando una skill duplicada para el tema siguiente.
- **`plugins/aether/config/skills.json`:** la tabla `topics` no cambia. Sigue sirviendo al aviso de arranque de `lib/skill-topics.js`.
- **Documentos:** `docs/decisions.md` agrega A137, que modifica A136, y el rango pasa a `A1–A137` donde esté fijado. Se actualizan `plugins/aether/skills/designing/SKILL.md`, `plugins/aether/skills/skills/SKILL.md`, `docs/guide/project-files-and-skills.md`, `docs/es/guias/archivos-skills-y-continuidad.md`, `docs/guide/design-seats.md`, `docs/guide/ops.md` (la lista de formas de `aether-plan skills find <feature>` que corre el mod), `docs/reference/components.md` y la lista de agentes de `AGENTS.md`.

## Seguridad

- El valor de un tema llega al comando solo si cumple el patrón, que no admite espacios ni caracteres de shell. Se valida en tres lugares: el flujo, el mod y `main`.
- La tarjeta la escribe el dueño, pero el agente la trata como datos. Su única salida es la lista de identificadores.
- No cambia quién puede instalar, dónde se instala ni cómo se revisa una skill.

## Pruebas

- Una tarjeta sobre un tema fuera de los 6 (`pixel-art`) busca e instala una skill de autor de confianza con el registro falso.
- Una tarjeta que nombra `docker` solo busca si el agente devuelve ese tema: las palabras de la tabla ya no activan nada por sí solas.
- El agente que falla, no responde, responde inválido o devuelve lista vacía no llama a `find`, y el diseño termina normal con `skills` vacío.
- El flujo descarta temas inválidos y repetidos, y conserva 3.
- `main` y el mod rechazan 4 temas, un tema repetido y valores con espacios, mayúsculas, `;`, `$` o `/`.
- Un tema ya cubierto por una skill instalada no se busca.
- El archivo del agente es de solo lectura, en Haiku, y dice que la tarjeta son datos.
- Un tema del agente cubierto por una skill instalada se salta y no deja pasar una skill duplicada para el tema siguiente.
- Un tema con una palabra de más de 24 caracteres se descarta en el flujo, en el mod y en `main`.
- `SKILLS_USAGE` nombra `--topic`.

### Pruebas visibles que se reescriben

Estas pruebas describen el comportamiento que este diseño reemplaza; la construcción las reescribe para que una construcción correcta no se juzgue con ellas:

- `tests/defect-045-skills-step.test.js` (línea 16 y líneas 71-72): `ROLES` agrega `skill-scout` (sin él el arnés `workflow-harness.js` lanza en la línea 281, `call` devuelve null y `find` no corre), y los handlers del archivo hacen que `skill-scout` devuelva temas para que `find` corra en todo el archivo; el flujo llama a `aether-plan skills find ${FEATURE} --topic ...` con los temas del agente, antes de `requirements`.
- `tests/workflow-design.test.js` (línea 17 y líneas 599-611): `ROLES` agrega `skill-scout`, y el arnés del flujo responde `skill-scout` con un stub (`{ topics: [] }` por defecto). La prueba de las líneas 599-611 sobrescribe `skill-scout` con un tema válido, de modo que `skills find <feature> --topic <t>` pase por `parseOpsPrompt` (línea 605) y el verbo `skills` se conserve en la lista de la línea 603; con el stub por defecto no se llamaría a `find`.
- `tests/skill-design.test.js` (líneas 432, 467-470, 764-767 y 772, y las llamadas a `findForDesign` por palabras de la tarjeta): las llamadas a `skills find` por el bin pasan `--topic <t>` (sin `--topic` responden listas vacías, no un candidato), el texto de uso nuevo, y `findForDesign` recibe `topics`.
- `tests/ops-command-design.test.js` (líneas 99-122): las formas de `skills find` con `--topic`, válidas e inválidas.
- `plugins/aether/hooks/ops.test.ts` (línea 389): `skills find` con `--topic` corre en el mod.
- Los pines de `A1–A136`: `tests/defect-045-docs.test.js` (línea 83), `tests/docs-032.test.js` (línea 23) y `tests/docs-facts.test.js` (línea 852) pasan a `A1–A137`, junto con `docs/index.md`.

## Supuestos

- La relevancia usa el `id` y el `label` del propio tema (`matchesKeys`); los sinónimos curados de la tabla ya no se aplican. Es más débil para variantes como `postgres` y `postgresql`, y es lo que el dueño aprobó con «la relevancia usa esos temas».
- Los temas van en inglés porque las skills de los autores de confianza tienen nombres y descripciones en inglés. Si un tema no encuentra nada, el diseño sigue.
- Las pruebas del examen oculto de la spec 045 que activan la búsqueda por las palabras de la tabla describen el comportamiento que este diseño reemplaza. Se reportan como obsoletas en el brief, sin borrar ese examen. Si el examen oculto de la spec 045 forma parte de la compuerta de la construcción, el Lead decide antes de lanzarla.

## Fuera de alcance

- Agregar autores de confianza.
- Cambiar los topes de 1 por tema y 3 por diseño.
- Instalar una skill real durante esta construcción.
- Buscar skills en un diseño corto.
