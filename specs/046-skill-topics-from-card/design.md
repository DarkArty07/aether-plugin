# Diseño corto: los temas de búsqueda de skills salen de cada tarjeta

## Palabras del dueño

- Pedido original de #314, en la tarjeta de la spec 045: «Cada `/aether:design` busca skills del tema de la tarjeta.»
- Al ver el límite de 6 temas: «limitste solo 6 temas? te queivoaste al limitar, y la gente que esos temas no le aplican?»
- Sobre la propuesta de este diseño (un agente en Haiku saca de `intent.md` hasta 3 temas, con las mismas reglas de seguridad): «esta bien».
- Sobre la prueba real: «haz la prueba y si pasa subes a main».
- Tras fallar esa prueba, sobre la propuesta de tres cambios de la enmienda (temas amplios, buscar primero en los autores de confianza y dejar la descarga dentro del proyecto): «si adelante».

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
- `tests/workflow-design.test.js` (líneas 17, 95, 417, 426, 475 y 599-611): `ROLES` agrega `skill-scout`, y el arnés del flujo responde `skill-scout` con un stub (`{ topics: [] }` por defecto). Las listas exactas de roles nativos de las líneas 95, 417, 426 y 475 llevan `skill-scout` justo después del primer `judge` (en la línea 417, antes de `mapper`). La prueba de las líneas 599-611 sobrescribe `skill-scout` con un tema válido, de modo que `skills find <feature> --topic <t>` pase por `parseOpsPrompt` (línea 605) y el verbo `skills` se conserve en la lista de la línea 603; con el stub por defecto no se llamaría a `find`.
- `tests/skill-design.test.js` (líneas 432, 467-470, 764-767 y 772, y las llamadas a `findForDesign` por palabras de la tarjeta): las llamadas a `skills find` por el bin pasan `--topic <t>` (sin `--topic` responden listas vacías, no un candidato), el texto de uso nuevo, y `findForDesign` recibe `topics`.
- `tests/ops-command-design.test.js` (líneas 99-122): las formas de `skills find` con `--topic`, válidas e inválidas.
- `plugins/aether/hooks/ops.test.ts` (línea 389): `skills find` con `--topic` corre en el mod.
- Los pines de `A1–A136`: `tests/defect-045-docs.test.js` (línea 83), `tests/docs-032.test.js` (línea 23) y `tests/docs-facts.test.js` (línea 852) pasan a `A1–A137`, junto con `docs/index.md`.

## Supuestos

- La relevancia usa el `id` y el `label` del propio tema (`matchesKeys`); los sinónimos curados de la tabla ya no se aplican. Es más débil para variantes como `postgres` y `postgresql`, y es lo que el dueño aprobó con «la relevancia usa esos temas».
- Los temas van en inglés porque las skills de los autores de confianza tienen nombres y descripciones en inglés. Si un tema no encuentra nada, el diseño sigue.
- Las pruebas del examen oculto de la spec 045 que activan la búsqueda por las palabras de la tabla describen el comportamiento que este diseño reemplaza. Se reportan como obsoletas en el brief, sin borrar ese examen. Ese examen no es compuerta de esta construcción: el Lead lo corre al final y juzga cada falla contra este diseño.
- Un tema queda cubierto si una skill instalada lo menciona en su nombre o descripción (`topicCovered`, sin cambios). Con temas de una palabra esto puede evitar una búsqueda, y es el lado prudente: no instala nada de más y se puede afinar después.

## Fuera de alcance

- Agregar autores de confianza.
- Cambiar los topes de 1 por tema y 3 por diseño.
- Instalar una skill real en este repositorio. La prueba real que pidió el dueño corre en un proyecto desechable, con un `HOME` desechable.
- Buscar skills en un diseño corto.

## Enmienda del 2026-11-18, tras la prueba real

Todo lo anterior está construido en `e3a27a6`. La prueba real no pasó, y esta enmienda corrige los dos defectos que encontró. Donde contradiga lo anterior, vale la enmienda.

### Evidencia

Herramienta `skills@1.9.0`, el 2026-11-18. Fuente: su `--help` y llamadas reales en un proyecto desechable. El detalle está en los comentarios de #314.

- **E1.** `skill-scout`, en Haiku 5.5, devolvió `pdf-report`, `pdf-merge` y `pdf-text-extract` para una tarjeta de reportes en PDF. Con esas consultas la búsqueda general no devolvió ninguna skill de un autor de confianza. Además, la relevancia (`matchesKeys`) exige el tema completo en el nombre, y la skill de confianza se llama `pdf`.
- **E2.** `find <consulta> --owner <autor>` existe («Search only repositories from a GitHub owner») y devuelve primero `anthropics/skills@pdf` para las tres consultas. Su salida puede traer una sección `Partial matches` y resultados poco relacionados.
- **E3.** `skill-reviewer`, lanzado desde el proyecto con permisos normales, no pudo leer `<data dir>/skills/review/pdf`: `Glob`, `Read` y `Grep` fueron denegados, y rechazó la skill. Con acceso de lectura a esa carpeta la leyó entera y la aprobó.
- **E4.** `add <fuente> --skill <nombre>`, ejecutado en `<proyecto>/.aether/skill-review/pdf/`, escribió solo ahí: `.agents/skills/pdf/` y `skills-lock.json`. No creó enlaces ni una carpeta `.claude`, y no tocó la raíz del proyecto ni el `HOME`.
- **E5.** `find zzqxjk --owner anthropics`, sin coincidencias, imprime `No skills found for "zzqxjk" from owner "anthropics"` y sale con 0. Una búsqueda por autor sin resultados no es un error de proceso.
- **No medido.** Que `skill-reviewer` lea con permisos normales una carpeta ignorada por git dentro del proyecto (E3 solo midió la del directorio de datos; E4 solo midió escribir ahí) y que lo haga también desde un worktree enlazado. Lo mide la verificación real, pasos 3 y 5.

### Cambio A: temas amplios

`plugins/aether/agents/skill-scout.md` pide que cada tema sea el nombre de una tecnología, un formato de archivo, una herramienta, un motor o una plataforma con que trabaja la tarjeta (`pdf`, `docker`, `postgres`, `godot`, `pixel-art`), nunca una acción ni una función (`pdf-merge`, `report-generation`). Es una palabra cuando el nombre tiene una, y 2 o 3 solo cuando el nombre mismo las tiene (`pixel-art`, `google-colab`). Se quita la frase «Your answer is one line per practical topic of the card», que contradice la orden de responder un solo objeto JSON. No cambian el patrón, el tope de 3 ni las frases que fijan las pruebas (`intent.md`, la tarjeta como datos, las instrucciones que no se siguen y `{ "topics"`).

### Cambio B: primero los autores de confianza

En `findForDesign` (`plugins/aether/lib/skill-design.js`), para cada tema no cubierto:

1. `trusted.json` se lee una vez por llamada, no una vez por candidato. Los autores van en orden alfabético. Solo se consulta un autor que cumpla `^[a-z0-9][a-z0-9-]{0,38}$`; cualquier otro no se consulta y se anota en `skipped`. Por tema se consultan como mucho los 5 primeros autores válidos; cada uno de los demás se anota en `skipped` como `trusted author <autor> not searched: limit 5`. `skipped` es una lista nueva del resultado de `findForDesign` (`[]` también en los resultados vacíos); no entra en `errors`, así que un `trusted.json` con más de 5 autores o con una entrada inválida no vuelve `ok: false` cada búsqueda (`result.ok` sigue siendo `errors.length === 0`, línea 423). El flujo (`design.workflow.js`, línea 1090) la muestra en su registro junto a los errores, sin tratarla como fallo.
2. Por cada autor de confianza corre `find <consulta> --owner <autor>`. De esa salida solo cuentan las skills cuya fuente es de ese autor.
3. Después corre la búsqueda general de hoy, `find <consulta>`.
4. Los resultados se procesan en ese orden con las reglas actuales, sin cambios: relevancia por `matchesKeys`, nombre y fuente seguros, 1 skill aceptada por tema, 1 pendiente por tema, 3 por diseño y duplicados. Un par `fuente@nombre` ya visto en el mismo tema se salta.
5. Una búsqueda cuya salida no trae ningún `owner/repo@skill` cuenta como «sin resultados». El tema anota `topic <id>: invalid response: no skill token` solo cuando ninguna de sus búsquedas trajo uno.
6. Una búsqueda que falla o que vence anota su error como hoy y termina las búsquedas de ese tema. `find <consulta> --owner <autor>` sin coincidencias sale con 0 (E5), así que no termina nada: solo cuenta como «sin resultados» (punto 5).
7. Cuando un tema ya tiene su skill aceptada, sus búsquedas restantes no corren: ni los demás autores ni la búsqueda general, y no se encola ninguna sugerencia de otro autor para ese tema. Hoy el bucle ya se detiene en `accepted >= 1`; esto lo extiende a las búsquedas que siguen. La sugerencia de otro autor (1 pendiente por tema) solo se encola cuando el tema no logró ninguna skill aceptada, y solo la puede traer la búsqueda general, porque las búsquedas por autor solo cuentan skills de autores de confianza.
8. Intentos de descarga. Una descarga es un intento aunque falle, o aunque la etapa de código rechace la skill. Se permite 1 intento por tema y 3 por diseño, cuenten o no como aceptados; hoy (líneas 398-413) un fallo o un rechazo hace `continue` sin subir `accepted`, y el siguiente resultado de confianza descargaría otra vez sin límite. Tras el intento de un tema, ese tema termina, sea cual sea el resultado del intento: no procesa más resultados, sus búsquedas restantes no corren (ni los demás autores ni la general) y no encola ninguna sugerencia. La skill aceptada es su única salida, y si el intento falla o se rechaza, el tema queda sin skill y el error o el rechazo se anotan como hoy. Así, la sugerencia de otro autor del punto 7 solo se encola en un tema que no hizo ningún intento de descarga. Una prueba lo fija: un tema cuya descarga falla no hace ninguna búsqueda más y no encola nada. Los dos topes son constantes de `skill-design.js`, junto a `MAX_PER_DESIGN`.
9. Cota de espera. Cada búsqueda vence a los `FIND_TIMEOUT_MS` (15 s) y cada descarga a los `ADD_TIMEOUT_MS` (60 s). Con N autores consultados por tema (N ≤ 5), un tema hace como mucho N+1 búsquedas y un diseño de 3 temas 3·(N+1) búsquedas, más 3 intentos de descarga como máximo. Búsquedas + intentos × 60 s ≤ 600 s: 15·18 + 3·60 = 270 + 180 = 450 s con N = 5, dentro de los 600 s de `OPS_TIMEOUT_MS`, porque la descarga corre en la misma llamada de `ops` que las búsquedas (`design.workflow.js`, línea 1083). Sin red, la primera búsqueda que vence termina el tema (punto 6): 15 s por tema, 45 s en total, y sin resultados no hay descargas.

### Cambio C: la descarga espera su revisión dentro del proyecto

1. La carpeta de revisión pasa de `<data dir>/skills/review/<id>/` a `<raíz del worktree>/.aether/tmp/skill-review/<id>/`. La raíz es `repoPaths(cwd).worktree`, el árbol donde corre la sesión, que es donde un agente puede leer con permisos normales. `reviewRoot` y `reviewDir` de `plugins/aether/lib/skill-install.js` reciben esa raíz, y la usan `fetchForReview`, `installForDesign` y `discardForDesign`. `discardForDesign` pasa a recibir `cwd` (`discardForDesign({ id, cwd, dataDir })`) y calcula la raíz con `worktreeOf(cwd)` como `installForDesign`; la rama `discard` de `main` (línea 551) le pasa su `cwd`.
2. Antes de crearla se llama `ensureExcluded(gitCommonDir)` de `plugins/aether/lib/run.js`, que deja `/.aether/` fuera de git por `.git/info/exclude` sin tocar `.gitignore`. Fuera de un repositorio git no hay nada que excluir.
3. Tras la descarga, la carpeta de revisión conserva solo `.agents/skills/<nombre>/`, `skills-lock.json` y `review.json`. Cualquier otra entrada de primer nivel, en particular `.claude`, y cualquier enlace simbólico de primer nivel se borran. Además, la etapa de código rechaza la skill si en cualquier profundidad de `.agents/skills/<nombre>/` hay un archivo o carpeta llamado `CLAUDE.md`, `AGENTS.md` o `.claude` (sin distinguir mayúsculas). Antes la copia estaba fuera del proyecto y esos archivos no podían cargarse como instrucciones; dentro de la sesión sí podrían, y limpiar solo el primer nivel no basta. Así la copia sin revisar nunca queda como una skill ni como instrucciones que Claude Code pueda cargar.
4. La carpeta se borra como hoy: tras instalar, tras descartar y tras un rechazo de la etapa de código. Cuando `skill-review/` queda vacía, también se borra. Un diseño interrumpido deja su carpeta. La limpieza de `plugins/aether/lib/tree-clean.js` hoy solo barre `.aether/tmp/` de la raíz del checkout principal (`mainRoot`) y no actúa mientras hay una ejecución abierta, así que no alcanza el `.aether/tmp/` de un worktree enlazado. `cleanProject` pasa a barrer también `.aether/tmp/skill-review/` de cada worktree registrado (`git worktree list`), con el mismo plazo de 24 horas y bajo la misma condición de ejecución abierta. Borra solo entradas bajo esa ruta, con su propia comprobación de ruta segura, porque `isSafeToDelete` solo admite rutas bajo `mainRoot/.aether`. `tree-clean.js` y `tests/tree-clean.test.js` son parte de la construcción.
5. El archivo de estado sigue en `<data dir>/skills/design-state/`.
6. Cada candidato de `find` trae `files`: las rutas relativas de los archivos de `.agents/skills/<nombre>/`, ordenadas. Una skill con más de 200 archivos se rechaza en la etapa de código: el revisor lee cada archivo de la lista uno por uno con `Read`, y sin tope una skill enorme haría una lista y una revisión sin límite. El 200 es un supuesto reversible (ver Supuestos de la enmienda). `skillReviewMessage` lista esas rutas, y `skill-reviewer.md` pide leer con `Read` cada archivo de la lista, porque las herramientas de búsqueda pueden saltarse una carpeta que git ignora. El flujo solo lista rutas que sean cadenas, sin `..` y sin `/` inicial.
7. `aether-guard` no cambia: ninguna de sus reglas clasifica ni rechaza `.aether/tmp/skill-review/`.

### Seguridad de la enmienda

- Una copia sin revisar, de un autor de confianza, queda unos minutos dentro del proyecto. No está en `.agents/skills/` ni en `.claude/skills/` del proyecto, está fuera de git y no trae `.claude` ni enlaces de primer nivel; la etapa de código rechaza `CLAUDE.md`, `AGENTS.md` y `.claude` a cualquier profundidad. Nada la ejecuta: la etapa de código y el revisor solo leen.
- La instalación sigue copiando byte por byte la copia revisada y comprobando su hash.
- `--owner` recibe solo autores de `trusted.json` que cumplen el patrón, y `runSkillBin` no usa shell.

### Pruebas nuevas

- La tarjeta de la evidencia: con el tema `pdf` y un registro falso que distingue `--owner`, la skill `pdf` de `anthropics` queda como candidata aunque la búsqueda general no la devuelva.
- Las búsquedas de un tema corren en orden: una por autor de confianza, en orden alfabético, y después la general. `trusted.json` se lee una vez.
- En una búsqueda por autor, una skill de otro autor no cuenta.
- Un autor de `trusted.json` que no cumple el patrón no se consulta y queda en `skipped`, no en `errors`.
- Un tema con búsquedas sin resultados y una con resultados no anota error; uno sin ningún resultado anota `invalid response: no skill token` una sola vez.
- Una búsqueda que vence termina las búsquedas de su tema, y el tema siguiente sí se busca.
- Un tema con su skill aceptada por la búsqueda de un autor no hace la búsqueda general ni otra búsqueda por autor (se cuentan las llamadas) y no encola ninguna sugerencia; un tema sin skill aceptada y con un resultado de autor desconocido en la búsqueda general encola exactamente 1 pendiente.
- Una búsqueda por autor sin coincidencias, con salida `No skills found ...` y estado 0, no anota error y deja correr las búsquedas siguientes.
- Con 7 autores válidos en `trusted.json` se hacen 5 búsquedas por autor más la general, y los otros 2 quedan en `skipped` como `not searched: limit 5`, no en `errors`: `ok` sigue en `true`.
- Un tema cuya descarga falla, y otro cuya skill rechaza la etapa de código, hacen 1 sola descarga cada uno aunque la búsqueda traiga más resultados de confianza; con 3 temas se cuentan como mucho 3 llamadas `add` en el diseño, y una cuarta no ocurre. La cota del punto 9 se escribe en la prueba como constantes (búsquedas, intentos, tiempos).
- La carpeta de revisión queda bajo `.aether/tmp/skill-review/` del worktree, `/.aether/` queda en `.git/info/exclude`, y `git status` del proyecto no la muestra.
- Tras la descarga, una entrada `.claude` y un enlace de primer nivel que deje el registro falso ya no están.
- La etapa de código rechaza una skill con `CLAUDE.md`, `AGENTS.md` o una carpeta `.claude` en una subcarpeta profunda de `.agents/skills/<nombre>/`.
- Un diseño desde un worktree enlazado: la carpeta queda en `.aether/tmp/skill-review/` de ese worktree, `discardForDesign` con `cwd` la encuentra y la borra, e `installForDesign` instala desde ella.
- `tests/tree-clean.test.js`: una carpeta de `skill-review/` de más de 24 horas en un worktree enlazado se borra, una de menos de 24 horas se queda, no se toca nada de ese worktree fuera de `.aether/tmp/skill-review/`, y con una ejecución abierta no se borra nada.
- Tras instalar, descartar o rechazar, la carpeta del candidato no existe, y `skill-review/` tampoco cuando queda vacía.
- El candidato trae `files`; una skill con 201 archivos se rechaza y una con 200 no; el mensaje al revisor lista las rutas y deja fuera una ruta con `..`.
- `skill-scout.md` dice que un tema nunca es una acción, con los ejemplos `pdf` y `pdf-merge`, y ya no dice «one line per practical topic».
- `skill-reviewer.md` pide leer cada archivo de la lista.

### Pruebas visibles que reescribe la enmienda

- **Ubicación de la carpeta:** `fetchForReview` recibe la raíz como parámetro `root` (junto a `reviewRoot` y `reviewDir`) y sin ella falla con error en lugar de usar `process.cwd()`, para no escribir en el checkout de la prueba. `tests/skill-install.test.js`: las llamadas de las líneas 50 y 66 pasan `root: repo.dir` (la de la línea 66 hoy no crea `repo`: se le añade `makeRepo`), y se reescriben las líneas 52-53 y 69. `tests/skill-design.test.js` (líneas 234-235, 297, 420-423, 445-448, 460-462 y 549). Las llamadas a `discardForDesign` de las líneas 420 y 423 pasan `cwd: w.repo.dir`. Las aserciones «fuera del proyecto» de las líneas 53 y 235 pasan a «dentro de `.aether/tmp/skill-review/` del worktree y fuera de `.agents/skills/` y `.claude/skills/`».
- **Candidatos de las pruebas del flujo:** `tests/defect-045-skills-step.test.js` (líneas 31-32 y 173) y `tests/defect-046-skill-topics.test.js` (línea 365) dan a cada candidato su `dir` nuevo y su `files`.
- **Registro falso:** el de `tests/skill-design.test.js` (líneas 60-110) y el de `tests/defect-046-skill-topics.test.js` (líneas 92-154) separan `--owner` de la consulta y registran los dos.
- **Conteos y consultas:** `tests/skill-design.test.js` (línea 203) y `tests/defect-046-skill-topics.test.js` (líneas 192, 223, 258 y 282) cuentan una búsqueda por autor de confianza más la general. Las aserciones de cero búsquedas no cambian.
- **Errores y tiempo:** `tests/skill-design.test.js` (líneas 382-412, 559 y 563-597) siguen la regla nueva de «sin resultados» y de la búsqueda que vence, y la de 1 intento de descarga por tema si alguna espera una segunda descarga en el mismo tema.
- **Agentes:** `tests/defect-046-skill-topics.test.js` (líneas 51-60), `tests/agents.test.js` (líneas 78-90) y `tests/defect-045-skill-agent.test.js` conservan lo que fijan y suman las frases nuevas.

### Documentos de la enmienda

- `docs/decisions.md`, A137: una actualización fechada el 2026-11-18 con «si adelante», los tres cambios y la evidencia E1 a E5. El rango `A1–A137` no cambia.
- `docs/guide/design-seats.md`, `docs/guide/project-files-and-skills.md` y `docs/es/guias/archivos-skills-y-continuidad.md`: una frase cada uno. Dice que la búsqueda consulta primero a cada autor de confianza, y que la descarga espera su revisión en `.aether/tmp/skill-review/` dentro del proyecto y se borra al terminar.
- `tests/defect-046-docs.test.js` fija esas frases.

### Supuestos de la enmienda

- La limpieza por proyecto de `.aether/tmp/` borra también carpetas con más de 24 horas. La construcción lo comprueba en `plugins/aether/lib/tree-clean.js` y lo reporta si no es así.
- El tope de 200 archivos por skill, el de 5 autores por tema y el de 1 intento de descarga por tema (3 por diseño) son valores reversibles que elegí donde la intención calla; viven como constantes de `skill-install.js` y `skill-design.js`. El de 5 autores se aparta de «cada autor de confianza»: no muerde con los 2 autores de hoy, y el dueño puede confirmarlo o quitarlo.
- El examen oculto de la spec 045 cuenta una búsqueda por diseño y mira la carpeta de revisión en el directorio de datos. Esas comprobaciones quedan obsoletas con esta enmienda; el Lead las juzga contra este diseño, sin borrar ese examen.

### Verificación real

La corre el Lead después de la construcción, en un proyecto desechable con un `HOME` desechable. Solo si pasa completa se sube a `main`.

1. `skill-scout`, en Haiku, devuelve temas amplios para la tarjeta de reportes en PDF y para otras dos tarjetas de temas distintos.
2. `aether-plan skills find` con esos temas deja `anthropics/skills@pdf` como candidata.
3. `skill-reviewer`, con permisos normales y sin acceso extra, lee la carpeta y da su veredicto.
4. `aether-plan skills install` deja la skill solo en el proyecto, sin commit, sin carpeta de revisión y sin nada en el `HOME`.
5. Los pasos 2 a 4 se repiten desde un worktree enlazado del proyecto desechable. Si `skill-reviewer` no puede leer allí `.aether/tmp/skill-review/`, la prueba no pasa y el Lead lo reporta en lugar de mover la carpeta por su cuenta.
