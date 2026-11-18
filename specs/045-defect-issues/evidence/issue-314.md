# #314: Desde la 0.43.0 el Lead no crea, no instala ni reparte skills: los avisos de la spec 037 salen y no cambian lo que hace

## Qué pasa

Versión instalada 0.46.0 (`1e44e04`). Los avisos de skills llegaron con la 0.43.0 (spec 037, issues #269 a #277), del 2026-11-13, y se ajustaron en la 0.45.0, del 2026-11-16. Entre el 2026-11-13 y el 2026-11-17, el Lead no creó ninguna skill, no instaló ninguna y no le pasó ninguna a un delegado ni a una tarea de un plan.

El dueño, el 2026-11-17: «nuevamente no veo que el lead instale skills por su propia cuenta».

## Evidencia

Registro de Aether en el directorio de datos del plugin instalado (`skills/` y `delegates/log.jsonl`), leído el 2026-11-17:

- **Crear.** En `created.jsonl`, la última creación es del 2026-11-11 (`diseno-de-juego`, en project pawn); no hay ninguna desde el 2026-11-13. En disco, fuera de los worktrees, los `SKILL.md` más nuevos que el 2026-11-13 son copias de skills que ya existían o las tres de este repo. Las de erebus entraron en git el 2026-10-26 (`a49d4a4`) y el 2026-11-05 (`79c59ac`); las del repo se movieron a `.agents/skills` el 2026-11-16.
- **Instalar.** `installs.jsonl` no existe: no hay ninguna instalación registrada desde que existe el registro (2026-11-07, `e44ba0a`). `trusted.json` tiene a `anthropics` y `vercel-labs` desde el 2026-11-08, así que el Lead podía instalar de ellos sin preguntar. Las skills personales del dueño son todas del 2026-11-06 o anteriores.
- **Buscar.** El aviso `topic-search` salió una sola vez: el 2026-11-16 a las 00:41, con `godot`, en project pawn. Después no aparece ninguna skill de Godot ni ningún registro de instalación.
- **Repartir a delegados.** Del 2026-11-14 al 2026-11-16 hay 186 avisos `delegate-skill` en `notices.jsonl`, en 5 sesiones. El aviso dice «project skill(s) … match this brief; add AETHER-SKILLS». Por skill: new-harness 58, artificial-analysis 56, pxl 46, diseno-de-juego 6, y 5 cada una para correr-lead-bonsai-local, entrenar-lora-bonsai, hf-cli y nnsight. En `delegates/log.jsonl` hay 107 lanzamientos desde el 2026-11-13, y ninguno lleva skills. Los 15 usos de `uses.jsonl` son todos `kind: lead`.
- **Planes.** Desde el 2026-11-13 tuvieron commits los `tasks.md` de 037-aa-pages-hydrogen, 037-skills-reinforcement, 038-aa-pages-hydrogen y 041-run-per-session, y ninguno le asigna `Skills:` a una tarea.
- **Cargas del Lead.** De los 15 usos, 14 son skills de Aether (designing, swarm, run, autonomous-runs, skills). Solo uno es una skill de proyecto: `correr-lead-bonsai-local`, en erebus.

## Qué significa

Los avisos de la spec 037 se emiten, pero son texto que el Lead puede ignorar, y lo ignora. Es la conclusión de #269 («la causa está en el diseño»), ahora con datos de después de su arreglo.

Además, el aviso a delegados parece tener ruido, aunque falta verificarlo leyendo los briefs: `pxl`, que es de pixel art, coincidió 46 veces con delegados de este repo, que casi nunca tocan pixel art. El emparejador es `matchDelegateSkills`, llamado en `plugins/aether/lib/delegate-task.js:750`.

## Relacionado

#269, #273, #275 y #276 (cerrados con la 0.43.0); #307.


## Comentarios



