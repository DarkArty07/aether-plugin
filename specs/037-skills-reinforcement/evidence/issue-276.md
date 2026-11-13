# #276 Al lanzar un delegado sin skills, avisar al Lead si el proyecto tiene una del tema

Parte de #269.

## Qué pasa

El Lead nunca ha pasado una skill a un delegado: carga sus skills de proyecto él mismo, pero no se las da a quien hace la tarea.

## Evidencia (2026-11-13, 0.42.0)

- Ningún brief real de `delegates/briefs/` lleva `AETHER-SKILLS:` (solo 2 lo mencionan, como texto de la tarea); `skills/uses.jsonl` no existe.
- El Lead cargó sus 3 skills de proyecto 19 veces entre el 2026-11-08 y el 2026-11-13.
- La regla dice «elige hasta 3» sin decir cuándo.

## Arreglo propuesto

Cuando el Lead lanza un delegado sin `AETHER-SKILLS:` y el proyecto tiene una skill cuyo tema coincide con el brief (palabras del brief, rutas de `AETHER-OWNS`, contra el nombre y la descripción de la skill), el sistema le avisa al Lead cuál podría pasar. Solo avisa: no la mete en el brief, porque una skill que no viene al caso gasta tokens y confunde a Haiku. Elegido por el Lead con el sí del dueño: «escoje lo que reocmiendes».

