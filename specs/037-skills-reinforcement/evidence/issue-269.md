# #269 Skills: el comportamiento de la spec 030 se cumple en un 30 %, y la causa está en el diseño

Revisión del comportamiento de skills que pidió la spec 030 (0.35.0, 2026-11-07), medido del 2026-11-07 al 2026-11-13 con la versión instalada 0.42.0 y Claude Code 2.1.325.

## Qué se midió y de dónde

- Las conversaciones de esos días en `~/.claude/projects/` (6.228 archivos): cada llamada a la herramienta `Skill`.
- Los registros del directorio de datos: `skills/created.jsonl` (8 líneas), `skills/trusted.json`; `skills/installs.jsonl` y `skills/uses.jsonl` no existen.
- El registro de delegados `delegates/log.jsonl` y los briefs de `delegates/briefs/`.
- El texto de las reglas y de los agentes en 0.35.0 y en 0.42.0 (la sección «Skills» del arranque dice lo mismo en las dos).

## Resultado: alrededor del 30 % (1,5 de 5)

1. Cuatro tipos con su lugar; las de Aether y las bajadas no se editan: **a medias**. La guarda contra editar existe; de las 3 skills que creó el Lead, solo 1 quedó en `.agents/skills/`.
2. Bajar de skills.sh con la lista de confianza: **nunca**. Ningún `npx skills add` de un Lead, ningún `installs.jsonl`; los autores de confianza (anthropics, vercel-labs) están desde el 2026-11-08 sin uso.
3. Hasta 3 skills por tarea de un agente: **nunca**. Ningún `tasks.md` con `Skills:` y ningún brief real con `AETHER-SKILLS:`.
4. El Lead crea skills por su cuenta, con avisos: **a medias**. Creó 3 y las usa él (19 cargas), no sus agentes; el aviso de hallazgo repetido nunca salió y el de skills sin uso cuenta mal.
5. Las skills de Aether nuevas se usan: **a medias**. `aether:skills` se cargó 1 vez en 6 días; no hay ningún `art-direction.md` nuevo desde el 2026-11-07.

Lo que sí funciona: el Lead crea skills de proyecto y las carga él mismo (`criterio-del-dueno` 10 veces, `diseno-de-juego` 5, `direccion-de-arte` 4).

## Por qué falló

Los cinco comportamientos descansan en un párrafo de texto del arranque y nada los dispara en el momento justo; los dos disparadores que se construyeron no salen o cuentan mal. Tres requisitos de la spec 030 estaban mal planteados, y el código los cumplió al pie de la letra:

- R27: «el Lead elige» las skills de cada tarea, pero quien escribe `tasks.md` es el Writer, y nadie le enseñó el campo.
- R31: «el mismo hallazgo» se construyó como el mismo texto exacto.
- R33: el aviso de skills sin uso se definió solo con los usos de los agentes (`uses.jsonl`, Supuesto A9).
- R32 revisa tamaño, nombre, descripción y duplicados, no el lugar; y bajar skills no tiene disparador en la spec.

No se debe a vicios de los proyectos anteriores: el único rastro es que uno de ellos ya tenía `.claude/skills/` y el Lead siguió esa costumbre.

## Lo que decidió el dueño (2026-11-13)

- Cuándo buscar skills: «cuando entra a un tema que no conoce y es un proyecto nuevo. cuando el lead necesita conocmiento practico de una tema. El conocmiento parametrico de los LLM es muy amplio pero no esta aplicado del todo a lo practico, pro ejmplo Machine leraning, sabe que esy tecnoias y demas pero no sabe procesos exactos, o por ejemplo google colab, sabe que es pero no conocieminto a detalle.»
- Por señales visibles, no por lo que el Lead crea saber: «si por señales visibles esta bien, la idea e reforzar este comprotmaineot, averiguar porque fallo arreglar lo que ya esta y agregar hooks para reforzar el comprotmaiento.»
- Lo demás, a recomendación del Lead: «okay abre lo issues y hazme la propuesta para trabjar autonomamente y escoje lo que reocmiendes». El Lead recomendó avisos (no bloqueos), que el aviso de skills en los delegados solo avise al Lead sin meterla en el brief, e incluir `aether-report --skills`.

## Fuera de alcance

Medir si el trabajo sale mejor con skills (llamadas pagadas), ampliar la lista de autores de confianza (decisión del dueño) y mover las dos skills existentes que están en `.claude/skills/` (con `aether:tidy` y el sí del dueño).

## Issues de esta revisión

- #270 El aviso de hallazgo repetido nunca salta (bug)
- #271 El aviso de skills sin uso solo cuenta a los agentes (bug)
- #272 El registro cuenta copias en worktrees como creadas (bug)
- #273 El Writer no conoce el campo `Skills:` (bug)
- #274 Skills de proyecto fuera de `.agents/skills/` (bug)
- #275 Disparador de búsqueda de skills por señales visibles (mejora)
- #276 Avisar al Lead al lanzar un delegado sin skills (mejora)
- #277 `aether-report --skills` (mejora)

