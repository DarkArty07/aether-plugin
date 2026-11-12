<!-- Copia del cuerpo del issue #201 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

## Qué se observó

Varias secuencias de comandos que no cambian están escritas como prosa, y el Lead las reproduce de memoria:

- **Freno de cuota** (`skills/autonomous-runs/SKILL.md`, «The quota brake»): parar workflows, delegados y lanes; por cada corrida del enjambre `aether-wt save`; `aether-autonomy quota-saved --from`; a veces `git push`; anotar; más tarde `aether-plan compile --run`. Es un párrafo de unos 1.900 caracteres.
- **Aprobar una edición** («The verdict»): veredicto, mirar en qué rama está, registrar el permiso si es `main`, `aether-wt merge` o git, y correr las pruebas otra vez. Son 4 o 5 pasos del Lead por tarea; en dos semanas se aprobaron 199 tareas que editaban.
- **Un «sí» con el guard en `enforce`** («Recording the owner's authorizations»): registrar el permiso de sesión, correr la acción y revocarlo, cada cosa en su llamada.
- **La frase de gasto del cierre** («The closing report»): correr `aether-report --spend --session` y armar la frase a mano con cuatro condiciones (`recorded`, `unpriced`, `tokenless`, `complete`).
- **`aether-autonomy status`** antes de cada delegado, cada diseño y cada enjambre de una corrida. `aether-delegate begin` no consulta los topes.
- **Lanzar el diseño** («Designing»): leer tres variables de entorno y la raíz del repo para escribir el JSON de argumentos.

## Buenas prácticas

> «Workflows are systems where LLMs and tools are orchestrated through predefined code paths» — Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

> «we see brittle if-else hardcoded prompts» — Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

## Por qué importa

- **Robusto:** cada paso es un sitio donde equivocarse o saltárselo.
- **Rápido y Asequible:** cada paso es un turno del modelo más caro.
- Además ocupan texto de las reglas (#200).

## Opciones

Sin código no hay arreglo: cada secuencia sería un solo comando de un bin que ya existe. Están una por una en #206 para que el dueño decida cuáles valen la pena.

Lo que no se sabe: cuántas veces falló cada secuencia en la práctica. El registro no lo guarda.

---
Revisión de diseño del 2026-11-09 sobre la versión 0.35.0 (`c95b9da`), de solo lectura. Datos: `delegates/log.jsonl` de la instalación, del 2026-10-23 al 2026-11-07: 43 sesiones y 359 tareas reales (6 de sonda fuera). No se hizo ninguna medición de pago. Índice de la revisión: #207.

