# #275 El Lead nunca busca skills en internet: falta un disparador por señales visibles

Parte de #269.

## Qué pasa

El Lead nunca ha buscado ni bajado una skill de internet: ni la spec 030 ni la regla dicen cuándo hacerlo, solo cómo.

## Evidencia (2026-11-13, 0.42.0)

- No existe `skills/installs.jsonl`; en las conversaciones del 2026-11-07 al 2026-11-13 no hay ningún `npx skills add` de un Lead (solo comandos de pruebas).
- Los autores de confianza `anthropics` y `vercel-labs` están dados de alta desde el 2026-11-08 sin ningún uso.
- `aether:skills`, que explica cómo buscar y bajar, se cargó 1 vez en esos días.

## Lo que decidió el dueño (2026-11-13)

«cuando entra a un tema que no conoce y es un proyecto nuevo. cuando el lead necesita conocmiento practico de una tema. El conocmiento parametrico de los LLM es muy amplio pero no esta aplicado del todo a lo practico, pro ejmplo Machine leraning, sabe que esy tecnoias y demas pero no sabe procesos exactos, o por ejemplo google colab, sabe que es pero no conocieminto a detalle.»

«si por señales visibles esta bien»

## Arreglo propuesto

Un hook sin modelo, al escribir `specs/NNN-<tema>/intent.md` y al primer arranque de Aether en un proyecto, busca señales visibles (archivos como `*.ipynb` o `project.godot`, dependencias como `torch` en `requirements.txt` o `pyproject.toml`, palabras de la tarjeta) en una tabla de temas en `config/`. Si un tema no tiene skill instalada, le dice al Lead que cargue `aether:skills` y busque una antes del plan. La skill `aether:skills` aclara que las skills son para procesos (cómo se hace) y la documentación de una API va por Context7. Si no encuentra una buena, el Lead escribe la skill del proyecto con lo que aprendió.

Fricción conocida: casi ninguna skill de Machine Learning o de Colab será de los dos autores de confianza, así que la mayoría esperará el sí del dueño.

