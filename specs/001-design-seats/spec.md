# Asientos de diseño: el Judge, el Writer y el Examinador en cualquier harness

- Date: 2026-10-13
- Status: Built in 0.9.0 (2026-10-13). The names in this spec follow what was built: the option is `seats`, with `native`, `balanced` and `robust`, and the lists live in `designSeats` of the lane table.
- Intent: que los modelos más capaces de otros proveedores y otros harnesses ocupen los asientos donde se decide la calidad del diseño, elegidos por configuración y no fijos en el código, con el agente nativo como respaldo. En palabras del dueño:
  - «ese modelo SI puede ser un designer, estoy buscando las maneras de aprovechar los futuros super modelos de anthropic o los frontera que superen a argon»
  - «después vemos como resolvemos lo del designer que pueda ser ocupado por otros harness»
  - «La idea es ocupar los modelos potentes de otros proveedores y otros harness»
  - «fable se queda fuera hasta que salga fable 5.5 actualmente opus es más capaz de fable a menos de la mitad del costo, cuando salga 5.5 fable si estará justificado en 5.1 no lo está»
- Decidido con el dueño el 2026-10-13: los asientos son el Judge y el Writer; quién ocupa cada asiento lo dice una lista de preferencia por asiento; el concepto es la superdelegación de RADAR (C3), ampliada de volumen a asientos; la elección de asientos (`native`, `balanced`, `robust`) es una opción, `seats`.

## Context

En 0.8.0 el diseño se reparte así: el Lead (Sonnet `xhigh`) escribe el spec, el Writer (`aether:writer`, Sonnet `xhigh`) escribe `plan.md` y `tasks.md`, y el Judge (`aether:judge`, Opus `high`) los revisa. El Writer y el Judge solo corren nativos: los lanes atienden únicamente al implementer, al supervisor y al reviewer del swarm (`ROLES` en `plugins/aether/lib/lanes.js`). RADAR tenía «el Judge en una lane» como 2b.5 y lo difirió (`docs/roadmap/2026-10-10-radar.md`). El Designer de 0.7 corría en agy con la memoria de conversación de agy (`aether-lane design`, decisión A22), y por eso no podía correr en otro harness.

La evidencia de dónde se decide la calidad:
- Trial 1: con un plan que fijaba casi todo con tests, Aether igualó al modo normal (33/33).
- Trial 2: la calidad no fue igual (gráficos 6 contra 8, 3D 5 contra 8). Una de sus dos causas fue lo que lleva el plan: la dirección y el nivel de calidad no llegaron a los implementers, y la recomendación fue que el autor del plan los escriba como criterios comprobables.
- Issue #3: un plan aprobado con una tarea de 9 archivos costó 3 intentos, una hora y 4 unidades dependientes.
- Trial 3: el diseño con Opus capturó los 10 puntos de la intención oculta; que otro modelo lo haga mejor no está medido.

## Criteria

- **C1 · Delegación (C3 de RADAR, ampliada a asientos).** Un modelo de otro harness puede ocupar el Judge, el Writer y el Examinador por configuración, sin cambiar código. Evidencia: tests con un harness simulado ocupan cada asiento, y `aether-report` dice quién ocupó cada uno.
- **C2 · Robusto.** La calidad de un asiento ocupado por un modelo externo no baja frente al nativo. Evidencia: antes de encender un asiento por defecto, la medición de R16 lo compara a ciegas con el nativo; si baja, el asiento vuelve al nativo.
- **C3 · Asequible.** La opción `seats` elige cuánto delegar: `native`, `balanced` o `robust`. Un asiento con la cuota de otro plan no gasta dólares de API. Evidencia: `aether-report` da por asiento el costo a precio de lista o la cuota usada.
- **C4 · Autónomo.** Una falla de un asiento externo nunca llega al dueño: el agente nativo de ese asiento sigue desde los archivos. Evidencia: un test por cada forma de falla termina en el nativo, y el diario lo registra.
- **C5 · Robusto, por independencia.** Quien escribe un documento no lo juzga, y quien escribe el examen no escribió los tests del plan. Evidencia: tests de selección con autor y juez del mismo modelo.
- **C6 · Robusto, por un examen que el swarm no ve.** Una corrida se comprueba con tests de aceptación que ningún agente del swarm vio. Evidencia: en las builds guardadas del trial 2, el examen detecta los defectos conocidos.

## User scenarios

1. **Balanceado, Argon en el Judge.** Dada la elección `balanced`, lanes encendidos, agy en `harnesses` y Argon con cuota, cuando el Lead termina un spec, entonces el Judge corre en Argon dentro de agy, su veredicto se valida contra el esquema del Judge, y el diario y el reporte nombran a Argon como juez.
2. **Sin cuota.** Dado el escenario 1 con agy sin cuota, cuando el Lead pide el Judge, entonces `aether-lane seat judge` sale con 3 sin cambiar nada, el Lead inicia el Judge nativo en Opus, y nada llega a la lista del dueño.
3. **Independencia.** Dada la elección `robust` con Argon primero en el Writer y en el Judge, cuando Argon escribe el plan, entonces el Judge de ese plan no es Argon: es el siguiente de su lista, o Opus nativo.
4. **Contención del Writer.** Dado un Writer externo que, además de `plan.md` y `tasks.md`, cambia un archivo de código, cuando su ronda termina, entonces la ronda se deshace, su trabajo queda en una ref de respaldo, la salida es 4, y el Writer nativo escribe el plan desde los archivos.
5. **Examen.** Dada la elección `balanced` y un plan aprobado, cuando el Examinador escribe el examen desde el spec y las interfaces públicas del plan, entonces el examen queda en el directorio de datos de Aether, fuera de git y de los briefs; y cuando el swarm termina, `aether-exam run` lo corre en una copia de la rama de integración, y cada test que falla aparece en el brief como hallazgo bloqueante, con el criterio que cubre.
6. **Nativo.** Dada la elección `native`, cuando el Lead diseña, entonces ningún asiento usa un harness externo, el Examinador no corre, y el flujo es el de 0.8.0.

## Requirements

- **R1. Tres asientos.** Judge (nativo: `aether:judge`, Opus `high`), Writer (nativo: `aether:writer`, Sonnet `xhigh`) y Examinador (nativo: `aether:examiner`, Opus `high`, nuevo). Cada uno puede tener ocupantes externos. Sirve a: C1.
- **R2. La elección es una opción del plugin.** `seats`, con `native`, `balanced` o `robust`; por defecto `balanced`. Llega a los comandos de la sesión como `AETHER_SEATS`. Un valor desconocido cuenta como `balanced`, y la sesión lo avisa. Sirve a: C3.
- **R3. Cada elección da una lista por asiento.** Para cada asiento, si está encendido y su lista de modelos externos en orden de preferencia, escritos `<harness>/<modelo>`. El nativo es siempre el último y no se escribe. Las listas viven en `config/lanes.json`, bajo `designSeats`; el dueño las cambia en su copia, con `AETHER_LANES_CONFIG`. Sirve a: C1, C3.
- **R4. Quién se sienta.** Ocupa el asiento el primer modelo de su lista cuyo harness está encendido (lanes en `on` y el harness en la opción `harnesses`), está instalado, tiene cuota sobre la reserva, y declara ese asiento en sus `roles` de `lanes.json`. Si ninguno puede, se sienta el nativo. Sirve a: C1, C4.
- **R5. Independencia.** El Judge de un documento nunca es el modelo que lo escribió, y el Examinador nunca es el modelo que escribió el plan. Si el primero de la lista choca, se toma el siguiente. Sirve a: C5.
- **R6. Rondas sin memoria.** Cada ronda recibe lo que necesita en su mensaje: el documento, la intención confirmada con las palabras del dueño, y en una revisión, su veredicto anterior y lo que cambió. Ningún asiento depende de la conversación de un harness, así que cualquier harness puede ocupar cualquier asiento. Sirve a: C1.
- **R7. Contención.** Cada ronda externa corre en un worktree desechable del commit actual, con el entorno sin credenciales de los lanes.
  - Judge: no puede cambiar ningún archivo.
  - Writer: solo `plan.md` y `tasks.md` de la carpeta del spec.
  - Examinador: solo `.aether-exam/` dentro de su worktree; Aether lo mueve al almacén del examen.

  Un cambio fuera de lo permitido deshace la ronda, guarda lo que había en `refs/aether/seat/<id>/round-<n>` y cuenta como falla. Sirve a: C4, C5.
- **R8. Respuesta validada.** Cada asiento responde con su esquema:
  - Judge: `verdict` (`approve`, `revise` o `reject`), `findings` (severidad, título, evidencia y arreglo; a lo sumo 10) y `openQuestions`;
  - Writer: las rutas, el commit, el resultado de `aether-plan check`, y sus supuestos y preguntas;
  - Examinador: el comando que corre el examen, sus archivos, y qué criterio del spec cubre cada test.

  Una respuesta que no valida es una falla. Después de un Writer externo, Aether corre `aether-plan check` por su cuenta. Sirve a: C2, C5.
- **R9. Una falla pasa al nativo.** Si el ocupante externo no está disponible, falla, viola la contención o responde fuera del esquema, el agente nativo del asiento hace esa misma ronda desde los archivos. El diario lo registra; la lista del dueño no. Sirve a: C4.
- **R10. Un comando por ronda.** `aether-lane seat <judge|writer|examiner> --session <id> --cwd <dir> --author <modelo>`, con el mensaje por stdin. Imprime una línea JSON y sale con 0 (respuesta), 3 (no disponible; nada cambió), 4 (falló y se deshizo) o 1 (error del comando). El Lead lo corre en segundo plano, como corría `aether-lane design` en 0.7. Sirve a: C1, C4.
- **R11. Registro.** Cada ronda de asiento entra al log de los lanes con su asiento, harness, modelo, estado, duración, tokens y cuota antes y después. `aether-report` muestra por asiento quién lo ocupó, sus veredictos y rondas, y su costo o cuota; es la segunda medida de C3 junto a la de volumen. El brief lo nombra en Delegación. Sirve a: C1, C3.
- **R12. El Examinador escribe el examen.** Después de que el Judge aprueba el plan, y antes del swarm, el Examinador escribe tests de aceptación desde `spec.md` y las interfaces públicas que fija `plan.md`. Nunca lee `tasks.md`, donde están los tests que verá el swarm. El examen se guarda en el directorio de datos de Aether, en `exams/<repo>/<NNN-tema>/`: fuera de git, fuera de los briefs y fuera de los worktrees. Sirve a: C5, C6.
- **R13. Correr el examen.** `aether-exam run <NNN-tema> --ref <commit>` copia el examen a un worktree desechable de ese commit, corre su comando, y da por test pasa o falla, con su criterio. El Lead lo corre al terminar el swarm. Cada fallo es un hallazgo bloqueante del brief y entra al siguiente arreglo; si el Lead cree que un test está mal, lo dice con su razón en el brief y nunca lo ignora en silencio. Sirve a: C6.
- **R14. Las elecciones.**
  - `native`: ningún asiento externo; el Examinador no corre; el Judge revisa lo que revisa en 0.8.0.
  - `balanced`: Judge y Examinador con Argon en agy primero; Writer nativo.
  - `robust`: Writer con Argon en agy primero; Judge nativo (Opus); Examinador nativo.

  En los tres, el Lead sigue en Sonnet `xhigh`. Sirve a: C3.
- **R15. Argon en la tabla.** `config/lanes.json` declara `gemini-4-argon` en agy, con los asientos `judge`, `writer` y `examiner`. No toma ningún rol del swarm; ponerlo de reviewer final queda como un cambio de configuración del dueño, que el README explica. Sirve a: C1.
- **R16. Medir antes de dar por bueno.** Un harness de evaluación, adaptado del trial 3, compara cada asiento externo con su nativo, a ciegas:
  - Judge: documentos con defectos sembrados (una tarea demasiado grande, un punto de la intención que falta, un criterio que no se puede probar, una acción irreversible sin listar); cuenta los que encuentra y sus falsas alarmas;
  - Writer: la comparación por pares del trial 3 y los puntos de intención oculta que captura;
  - Examinador: si su examen detecta los defectos conocidos de las builds guardadas del trial 2.

  El resultado decide si cada asiento sigue en la elección `balanced`. Sirve a: C2.
- **R17. Fable fuera.** Ninguna configuración incluida usa Fable 5.1. Fable vuelve a considerarse cuando salga Fable 5.5, con la medición de R16. Sirve a: C3.

## Proposals

None.

## Assumptions

Ordenados de más a menos probable que quieras vetarlos.

1. **La elección `balanced` pone a Argon en el Judge desde el primer día** si ya tienes lanes y agy encendidos, antes de la medición de R16. Base: tu regla «si la calidad baja, se vuelve a Opus» es probar y medir. Se revierte con `seats: native`, o quitando a Argon de la lista en tu copia de `lanes.json`.
2. **El Examinador entra en este spec,** en su propia fase. Base: es el asiento que cubre algo que hoy no existe (C6). Se puede quitar sin tocar el Judge ni el Writer.
3. **El nombre de Argon en agy es `gemini-4-argon` más el nivel,** como `gemini-3.8-flash-high`. No está verificado: el ID público de la API es `gemini-4-argon`, y agy lo ofrece en Ultra. Si el nombre es otro, la primera ronda falla, el nativo sigue, y se corrige en la tabla.
4. **El examen se escribe después del plan, no después del spec.** Base: escrito solo desde el spec, sus tests no conocerían las interfaces y no compilarían. Lee solo las interfaces públicas del plan, nunca los tests de `tasks.md`.
5. **La elección no cambia el swarm.** Los modelos y esfuerzos de implementers, supervisores y reviewer siguen los tiers del plan y el riesgo de la corrida, como en 0.8.0. La tabla que vimos con modelos del swarm por perfil no se construyó: el swarm sigue los tiers que escribe el Writer.
6. **Independencia por modelo, no por proveedor.** Opus juzgando un spec del Lead en Sonnet cuenta como independiente. Exigir otro proveedor dejaría sin Judge a quien solo tiene modelos de Anthropic.
7. **Fable 5.1 queda fuera por tu decisión.** La documentación de Anthropic lo presenta como su modelo más capaz; la decisión se sostiene por costo (US$ 10 / 50 por millón de tokens, contra 4 / 20 de Opus 5.5) y por tu evaluación.

## Irreversible actions

- **La medición de R16** · `paid-call`: llamadas a Opus a precio de API, del orden de US$ 20–30, y cuota de agy · el harness de `docs/evaluations/` que construye este trabajo.
- **La primera ronda real de Argon en agy** · `paid-call` (cuota de tu plan Ultra, en tu máquina) · `echo "<mensaje>" | aether-lane seat judge --session <id> --cwd <dir> --author claude-sonnet-5-5`.
- **Fusionar a `main` y publicar 0.9.0** · `merge-main` y `publish` · el PR, y `claude plugin tag plugins/aether --push`.

## Out of scope

- El Lead en otro modelo o harness.
- Los asientos del swarm (implementer, supervisor, reviewer): ya tienen lanes; la elección no los cambia (supuesto 5).
- El Rescate de unidades detenidas, la segunda opinión en documentos de riesgo y el Meta-ingeniero: usan este mismo mecanismo y pueden venir después.
- Modelos para Codex, Grok y Cursor: siguen vacíos hasta una llamada real en tu máquina.
- Llevar el objetivo del spec a cada brief (causa 2 del trial 2): es código pequeño en `lib/plan.js`, sin asientos, y conviene como cambio aparte. Hecho en 0.9.1 (A47).
