<!-- Copia del cuerpo del issue #203 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

## Lo que está bien

Hay una sola función que ordena los pares, `choose` con `compareCandidates` en `lib/superdelegation.js` (`:111-116`, `:150-230`), y la usan los tres que piden un par: los delegados (por `lib/router-pick.js:63-100`), el enjambre (`lib/lane-delegate.js:266-294` y `lib/lane-pick.js:130-145`) y los asientos de diseño (`lib/seats.js`).

## Qué se observó

- **Tres preparan los datos para esa función:** `viewOf` en `lib/router-pick.js:24-37`, `harnessView` en `lib/lane-quota.js:112-160` y la envoltura de `lib/seats.js`.
- **Dos almacenes de marcas:** `lanes/marks/` (`lib/lane-marks.js`) y `router/lanes/marks/` (`lib/router-marks.js:17-47`), que se leen juntos. Además `router/slow/`, `router/readings/`, `lanes/quota/` y un candado por harness.
- **La regla que lee el Lead es más simple que el código.** Dice: primero la cuota que se renueva antes, luego el par más barato por tarea. El código además aplica un piso de «los puntos pedidos menos 1» (`:19`), descarta pares dominados dentro de un mismo grupo de cuota (`:95-101`) y veta por rol y por autor antes de ordenar; una cuota que no se pudo leer va al final; y el costo es el número fijo de `config/pairs.json`, no el gasto real.
- **Leer la cuota de Muse cuesta una llamada real** de unos 54.000 tokens de entrada por renovación (`lib/harness/muse-quota.js:3-8`, llamada desde `lib/router-renewal.js:35` y `lib/lane-quota.js:29`). Los demás se leen sin llamar a un modelo. La regla del Lead dice que lea la cuota él mismo con `aether-lane quota` y no avisa de esto.
- **Cursor:** tiene adaptador y entrada en `config/lanes.json`, y la skill del enjambre lo nombra, pero los delegados nunca lo usan (`lib/router-pick.js:15`) y su cuota siempre es desconocida (`lib/harness/cursor.js:39-41`).

Relacionado: #136, una sola fuente para la lista de harness.

## Por qué importa

**Robusto y mantenimiento:** una marca puesta en un almacén y leída desde el otro lado es difícil de seguir. **Asequible:** una lectura de cuota que gasta.

## Opciones sin funciones nuevas

1. Un solo sitio que prepare los datos para los tres.
2. Un solo almacén de marcas.
3. Decir en la regla del Lead que la lectura de Muse gasta una llamada.

Lo que no se comprobó: cada cuánto se renueva de verdad la lectura de Muse.

---
Revisión de diseño del 2026-11-09 sobre la versión 0.35.0 (`c95b9da`), de solo lectura. Datos: `delegates/log.jsonl` de la instalación, del 2026-10-23 al 2026-11-07: 43 sesiones y 359 tareas reales (6 de sonda fuera). No se hizo ninguna medición de pago. Índice de la revisión: #207.

