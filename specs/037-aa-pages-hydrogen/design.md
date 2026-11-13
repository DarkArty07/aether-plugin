# Diseño corto: fuera la API de Artificial Analysis, páginas como única fuente, y Gemini 4 Hydrogen (issues #267 y #268)

La tarjeta es `specs/037-aa-pages-hydrogen/intent.md`. La evidencia (la lectura de 13 páginas del 2026-11-13, la lista de agy 1.5.8 y sus grupos de cuota) está en `specs/037-aa-pages-hydrogen/evidence/`.

## Intención del dueño

- «ya no quiero usar la API de AA no sirve, hay que sacarla del repo y del codigo y de todo, la solcuon es leer directamentente las paginas de AA y mantener la info»
- «ya salió gemini 4 hydrogen, nuestro sistema aether no lo detecta verdad?»
- «como sabemos hydrogen que escalon usa? es el probelma de siempre […] como estamos decidiendo que modelo usa que escalon?»
- «hydrogen esta pensnaod para reemplazar a 3.8 flash»
- «Supon que el unico plan que voy a pagar es el necesario de claude no mas. Los demas harness son extras»

## Estado de hoy en `main` (0.42.0)

- `scripts/refresh-lanes.js` ya lee de las páginas las cifras de los pares (inteligencia, costo por tarea y código), con `.claude/skills/artificial-analysis/aa-api.js`, que pese al nombre lee páginas (`figuresOf`, `indexesOf`, `pairFiguresOf`, `readPages`). Conserva la lectura de la clave (`keyFrom`, `keyFile`, `envFileFor`, `KEY`), que exporta.
- `scripts/build-models-index.js` lee la API: la lista gratis `/api/v2/language/models/free`, paginada, con la clave; de ella deduce familias, esfuerzos, «el más nuevo de su línea» y lo reemplazado. Con `--pages` lee además el Terminal-Bench de cada página.
- El skill tiene tres lectores de páginas: `aa-api.js`, `aa-pages.js` y `aa-extract.js`.
- La elección (`plugins/aether/lib/superdelegation.js`, `choose` y `measureBar`) compara solo `intelligence`: un par externo alcanza la referencia con sus puntos menos `TOLERANCE_POINTS` (1), o los puntos exactos para un supervisor. Solo las filas de Claude llevan `code` en `config/pairs.json`; `lib/pairs.js` lo exige para Claude y no lo valida en las demás.
- `agy models` (1.5.8) lista `gemini-4-hydrogen-low`, `-medium`, `-high` y `-xhigh`; ninguna tabla los tiene.

## Criterios

1. **Sin API.** Una búsqueda en el repo de `artificialanalysis.ai/api`, `x-api-key` y `ARTIFICIAL_ANALYSIS_API_KEY` no da ningún resultado fuera de la historia: `specs/` de features anteriores, `docs/changelog.md`, las entradas ya numeradas de `docs/decisions.md`, `docs/handoff/` y `docs/models/artificial-analysis-2026-10-26.md`.
2. **Un solo lector.** `scripts/aa-pages.js` es el único archivo que pide una página de Artificial Analysis. `aa-api.js`, `aa-pages.js` y `aa-extract.js` salen del skill.
3. **La foto.** `plugins/aether/config/models/aa-pages.json` guarda, por dirección de página, lo que dio la página de su propio modelo y la fecha de lectura. `refresh-lanes.js` y `build-models-index.js` trabajan solo con la foto: sin red, y dos corridas seguidas dan los mismos archivos.
4. **El índice sin lista global.** `models.json` y la parte generada de `docs/models/README.md` salen de `harness-models.json`, `pairs.json`, `lanes.json`, `profiles.json` y la foto. «Excluido» y «reemplazado» se declaran en `harness-models.json`, con motivo y fecha.
5. **Hydrogen colocado.** Con la foto del 2026-11-13, `choose` para el papel `implementer` y la cuota de agy disponible elige `agy/gemini-4-hydrogen@medium` para las referencias Haiku `high` y Haiku `xhigh`, y `agy/gemini-4-hydrogen@high` para Sonnet `high`. Para Opus `high` y Opus `xhigh` ningún par de Hydrogen es candidato.
6. **Flash reemplazado.** Ninguna fila de `gemini-3.8-flash` queda en `pairs.json` ni en `lanes.json`, y `harness-models.json` y `models.json` lo dan por reemplazado por Hydrogen, con la fecha y las cifras.
7. **Código en la regla.** Para el papel `implementer`, un par externo con cifra de código es candidato solo si su código llega al de la referencia menos la tolerancia. La decisión dice el motivo cuando un par queda fuera por código.
8. **Nada se borra en silencio.** Si una página no trae un campo, el lector lo nombra en su resumen y la foto conserva el valor anterior con su fecha anterior. Una respuesta 403 o 429 detiene la pasada sin escribir nada.

## Diseño

1. **El lector, `scripts/aa-pages.js`.** Reúne lo que hoy hacen los tres del skill: pedir una página (`https://artificialanalysis.ai/models/<slug>`), con caché en disco y al menos 1,5 segundos entre peticiones; hallar el bloque del propio modelo (el más cercano a su `slug`, nunca el primero de la página); y devolver todos sus campos, como hoy `aa-extract.js`. Su orden `read [slug …] [--harness <nombre>]` escribe la foto. Sin argumentos lee las direcciones de todas las filas de `pairs.json`; con `--harness` lee las de ese harness y, siempre, las de las filas de Claude, para que el harness y los escalones sean del mismo día. El skill conserva `SKILL.md` y `agent-prompt.md`, reescritos: las páginas son la fuente por decisión del dueño, y ya no hay orden que lea una API.
2. **La foto, `config/models/aa-pages.json`.** Un objeto por dirección: `readOn`, el nombre que dio la página y sus cifras (inteligencia, costo por tarea del índice, Terminal-Bench 4.0 con su costo y sus minutos por tarea, AA-Briefcase, tasa de alucinación, tiempo por tarea, precios y velocidad). Una línea por dirección, para que el diff de git muestre qué cambió. El HTML queda en la caché, fuera del repo.
3. **`scripts/refresh-lanes.js` sin red ni clave.** Parchea `pairs.json` desde la foto, con las reglas de hoy (una fecha por fila, las filas sin página se mueven con su referencia, la escalera se recalcula y se compara pero no se escribe). Desaparecen `keyFrom`, `keyFile`, `envFileFor` y `KEY`. Avisa en su resumen cuando las filas de un harness y las de Claude tienen fechas de lectura distintas. Escribe los campos de código (`code`, `codeCostPerTaskUsd`, `codeMinutesPerTask`, `codeChecked`) en toda fila cuya página los dé, también las externas.
4. **`scripts/build-models-index.js` sin lista.** Deja de leer la API: salen `MODELS_URL`, la paginación, `--from`, `--since`, `--pages` y `--cache`. Los modelos en uso son los que `harness-models.json` lista para los harnesses elegidos; sus esfuerzos y cifras salen de `pairs.json` y de la foto; «excluido» y «reemplazado» salen de lo declarado en `harness-models.json`. Las secciones que solo existían por la lista global (`withoutFigures`, `outOfScope`, y `superseded` deducido) se rehacen desde lo declarado o desaparecen, y el resumen nombra el modelo listado que no tiene fila ni foto.
5. **Datos.** `harness-models.json`: la lista de agy recapturada el 2026-11-13 con agy 1.5.8, y Flash declarado reemplazado. `pairs.json`: cuatro filas `agy/gemini-4-hydrogen@low|medium|high|xhigh` (direcciones `gemini-4-hydrogen-low`, `-medium`, `-high` y `gemini-4-hydrogen`), grupo `hydrogen`; fuera las filas de Flash; todas las filas refrescadas con la foto. `lanes.json`: el grupo `hydrogen` con la etiqueta de cuota «Gemini Models» y el modelo `gemini-4-hydrogen` con el papel `implementer`; fuera Flash. `profiles.json` y `prices.json`: la entrada de Hydrogen (1,5 y 7,5 dólares por millón; lectura de caché 0,075).
6. **La regla.** En `choose`, cuando `role` es `implementer` y la referencia tiene `code`, se calcula un piso de código igual al de inteligencia (el código de la referencia menos `TOLERANCE_POINTS`, en décimas). `measureBar` devuelve `below-code` para un par cuyo `code` es número y no llega al piso. Un par sin `code` sigue juzgándose solo por inteligencia, y el motivo de la decisión lo dice. La dominancia y el orden (cuota que renueva antes, luego el más barato) no cambian. `lib/pairs.js` valida `code` de 0 a 100 en las filas externas cuando está presente.
7. **Documentación.** `docs/reference/artificial-analysis.md`, `docs/contributing.md`, `docs/guide/lanes.md`, `docs/models/README.md`, `AGENTS.md` y el skill `new-harness` dejan de nombrar la API y la clave y describen el lector, la foto y la regla nueva. `docs/decisions.md` gana una decisión numerada con las palabras del dueño (sacar la API; el código en la regla).

## Pruebas

- Del lector: páginas guardadas como datos de prueba (las de `tests/fixtures/aa-model-page-handmade-*.html` y una real recortada), sin red: el bloque propio, un campo que falta conserva el valor anterior, 403 y 429 no escriben.
- De la foto: rearmar `pairs.json` y `models.json` dos veces da archivos idénticos; ninguna función de los dos scripts recibe `fetch`.
- De la regla: los cinco casos del criterio 5 con las cifras del 2026-11-13; un par sin `code` pasa por inteligencia con el motivo escrito; un supervisor y un asiento de diseño no cambian.
- De ausencia: una prueba que busca en el árbol los tres textos del criterio 1 fuera de las rutas de historia.
- Se retiran `tests/aa-free-endpoint.test.js` y los datos `tests/fixtures/aa-pairs-2026-10-29.json` y `tests/fixtures/codex/aa-api-2026-10-29.json`; se reescriben `tests/aa-api.test.js`, `tests/models-index.test.js`, `tests/models-index-pages.test.js`, `tests/refresh-lanes.test.js` y las que fijan el número de filas y las claves de las tablas (`tests/pairs.test.js`, `tests/lanes.test.js`, `tests/lane-table-index.test.js`, `tests/prices.test.js`).
- `npm run check` completo.

## Fuera de alcance

- Las etapas 2 y 3 (carpetas por harness, extras como plugins, aviso de modelos nuevos).
- El release: versión, changelog, tag y publicación.
- Borrar la clave del `.env` local del dueño.
- Escribir una escalera nueva: si la foto la movería, se informa.
- Otros papeles para Hydrogen.

## Supuestos

1. Hydrogen comparte la cuota «Gemini Models» de agy: agy 1.5.8 informa solo dos grupos y Hydrogen es un modelo Gemini. Se confirma en la primera llamada real.
2. La tolerancia en código es 1 punto, la misma que en inteligencia.
3. Un par sin cifra de código (las estimaciones de Muse, que no tienen página) se juzga como hoy, para no cambiar un harness que el dueño congela.
4. La foto vive junto a las tablas, dentro del plugin, aunque en esta etapa solo la leen los scripts: en la etapa 2 el lector viaja con el plugin.
5. La fila de Hydrogen `low` entra aunque no alcanza ningún escalón: la regla la deja fuera por sí sola y la tabla refleja lo que agy ofrece.

## Acciones irreversibles

Ninguna durante la construcción. Leer las páginas de Artificial Analysis está pedido por el dueño. Fusionar a `main`, hacer push y publicar esperan su sí.
