<!-- Copia del cuerpo del issue #209 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

## Qué se observó

- El informe de una corrida guarda el inicio y el fin, lo que tardó cada agente y cada llamada a otro plan. No guarda cuánto duran las pruebas del gate, las pruebas de cada fusión ni las esperas.
- Corrida del 7 de noviembre (0.34.0, 16 unidades): **12,3 horas de reloj**. Las llamadas a otros planes cubren 5,0 horas. Los agentes de Claude suman 2,6 horas (Lead 0,8, supervisores 0,5, implementadores 0,9, revisor 0,4). Aunque ninguno se solapara con otro, quedan **al menos 4,7 horas sin ningún modelo trabajando**, y el informe no dice en qué se fueron.
- Lo que el diseño hace en ese hueco: cada intento pasa por un gate que corre el comando de pruebas entero, dos a la vez como máximo (`GATE_SLOTS = 2`, `workflows/run.workflow.js:392`); cada fusión lo corre otra vez, de una en una (`workflows/run.workflow.js:238-239`); y `aether-plan compile` lo corre una vez para la línea base.
- Este repositorio tiene 300 archivos de prueba. Lo que tarda una pasada no está en ningún registro: en el registro de delegados `checks.tests` es la palabra «pass», y `baseline.json` no guarda duración.
- Comparación: otro repositorio hizo 63 unidades en 1,3 horas (29 de octubre). Aquí, 10 unidades en 4,4 horas, 17 en 6,7 y 16 en 12,3.

## Por qué importa

**Rápido:** no se puede mejorar lo que no se ve. El piso de una unidad son dos pasadas completas de pruebas, y no se sabe cuánto es eso.

## Opciones sin funciones nuevas

Ninguna dentro del código. Lo único posible sin tocarlo es cronometrar a mano una pasada de `npm test` para conocer ese piso.

Guardar la duración de cada gate, de cada fusión y de cada espera en el informe es una función nueva: está en #206.

## Lo que no se comprobó

Si esas 4,7 horas fueron pruebas, esperas de cuota o una pausa. Con los registros de hoy no se puede distinguir.

---
Segunda vuelta de la revisión de diseño, 2026-11-09, versión 0.35.0 (`c95b9da`), de solo lectura. Datos: `runs.jsonl` (17 corridas finalizadas del 2026-10-15 al 2026-11-07, 15 en este repositorio), los registros de llamadas a otros planes (`lanes/*.jsonl`, 1.271 llamadas) y los 40 informes de corridas autónomas de este repositorio. No se hizo ninguna medición de pago ni se corrió ninguna prueba. Índice de esta vuelta: #216. Índice de la primera: #207.

