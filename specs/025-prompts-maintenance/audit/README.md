# Auditoría de los prompts de Aether (2026-11-02)

Cuatro auditorías de solo lectura hechas por Opus a esfuerzo `max` para el issue #140. Cada una cubre un grupo de archivos y verifica contra el árbol:

- `group-A.md`: las reglas del Lead (`using-aether`, `autonomous-runs`, `swarm`, `agents/lead.md`): 24 incoherencias, 12 bloques duplicados.
- `group-B.md`: los agentes, las skills del Writer y el preset de Spec Kit: 16 incoherencias.
- `group-C.md`: las skills que escribe la persona (`help`, `setup`, `doctor`, `onboard`): 12 incoherencias.
- `group-D.md`: los prompts armados en código (workflows, `lib/seats.js`, `lib/lane-calls.js`, `lib/delegate-task.js`…): una alta y varias medias.

Las auditorías no cambian ningún archivo. Su costo medido fue de US$ 26.75 (A 8.59, B 5.66, C 4.97, D 7.53).
