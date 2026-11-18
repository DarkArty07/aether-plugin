# Tarjeta de intención: los cinco issues de fallos

## Palabras del dueño

- «Trabaja autonomamente en hacer los de fallos.» (2026-11-17, sobre los issues #318, #317, #316, #314 y #302)
- Sobre #314, de tres opciones, eligió «Repartir e instalar»: el sistema pasa solo a delegados y unidades las skills del proyecto que coincidan, y cada diseño busca e instala skills del tema, solo de autores de confianza y solo en el proyecto.
- En #314, citado del issue: «nuevamente no veo que el lead instale skills por su propia cuenta».
- Sobre subir el trabajo a `main`: «Aún no».

## Entendimiento que el dueño aprobó

El dueño aprobó este plan en el modo de plan de Claude Code. Los cinco issues quedan arreglados en la rama `fix/issues-fallos`, creada desde `feat/codex-gpt-6-2`, con sus pruebas. Nada llega a `main`, nada se sube al remoto y no se saca ninguna versión.

El texto completo de cada issue, con su evidencia, está en `specs/045-defect-issues/evidence/issue-<número>.md`. Esos archivos son la fuente de lo que hay que arreglar.

## Criterios

**C1, #318. La guía de mantenimiento dice la verdad sobre la limpieza.** `docs/guide/maintenance.md` afirma que la limpieza nunca toca worktrees registrados, pero `plugins/aether/lib/tree-clean.js` quita los limpios dentro de una carpeta vencida. La guía debe decir lo que hace el código, y una prueba debe fijar esa frase.

**C2, #317. Una prueba sana no atasca unidades sanas.** La prueba de `tests/seat-partial.test.js` señalada en el issue falla con la máquina cargada, y eso atascó una unidad que solo cambiaba documentos. Debe dejar de depender del reparto de CPU y pasar 20 veces seguidas con la máquina bajo carga, sin perder lo que comprueba.

**C3, #316. Los hallazgos menores de la spec 044 quedan resueltos.** Son 35: los 30 numerados del issue, los 3 de su comentario y los 2 del guard (`claudeConfigWrite` y `trustedWrite`). Cada uno queda arreglado o, si ya no aplica en el código actual, con su razón escrita. El hallazgo 16 es el más serio: el sistema no debe aprobar por sí solo una respuesta cortada o rechazada de un delegado de solo lectura.

**C4, #302. El aviso de modelos nuevos también lee Muse.** El lector diario debe obtener la lista de modelos de Muse igual que la de los demás harness, sin llamar a un modelo, sin gastar cuota y dentro del mismo tope de tiempo. Si Muse falla, no responde o no está instalado, el aviso de los demás harness sigue funcionando.

**C5, #314. Las skills llegan al trabajo sin depender de que el Lead lea un aviso.** Citas: «Repartir e instalar» y «nuevamente no veo que el lead instale skills por su propia cuenta».
- Un delegado o una unidad del enjambre recibe por sí solo las skills del proyecto que coinciden con su tarea, hasta 3.
- Una tarea que no tiene que ver con una skill no la recibe: el issue registra 46 coincidencias de `pxl`, una skill de pixel art, en delegados que casi nunca tocan pixel art.
- Una skill que no se puede cargar se omite y el lanzamiento sigue.
- Las skills que el Lead nombra a mano siguen valiendo.
- Cada `/aether:design` busca skills del tema de la tarjeta. Las de un autor de confianza se revisan completas y se instalan solo en el proyecto. Las de cualquier otro autor no se instalan y quedan en la lista del dueño.
- Si la búsqueda falla o no hay red, el diseño sigue.

**C6. Calidad.** `npm run check` pasa en la rama, el examen oculto no tiene fallos y no queda ningún hallazgo crítico o importante abierto.

## Fuera de alcance

- Subir a `main`, hacer push, sacar una versión o instalar el plugin.
- Agregar autores a la lista de confianza. Hoy son `anthropics` y `vercel-labs`.
- Instalar skills en el nivel global (`~/.agents/skills/` o `-g`).
- Instalar skills reales durante esta corrida: las pruebas usan un registro falso.
- Cambiar cómo el Lead crea skills propias.
- Los otros 18 issues abiertos.
- Cambiar la escalera de `plugins/aether/config/ladder.json`.

## Respuestas a las preguntas

1. **¿Hasta dónde llega el arreglo de #314?** «Repartir e instalar»: repartir las skills del proyecto y además buscar e instalar las de autores de confianza en cada diseño.
2. **¿Cuándo se cierra cada issue?** Cuando su arreglo esté construido y probado en la rama, por la regla del dueño de cerrar un issue cuando su arreglo está hecho.
3. **¿Se puede consultar el Muse real?** Sí, una sola consulta `model/list` a la versión instalada (1.4.23), sin prompt, para confirmar que no gasta cuota. Si gastara, esa parte se detiene y queda en la lista del dueño.
