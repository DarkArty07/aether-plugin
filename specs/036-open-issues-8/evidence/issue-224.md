<!-- Copia del cuerpo del issue #224 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

## Qué se observó

**Lo que la observación ya sabe.** Al cerrar cada sesión del Lead, la observación escribe una lectura (`observe/read.json`). Hoy tiene 48 puntos:
- **22 propuestas de calibración:** 11 pares cuyo costo real no coincide con la tabla, 5 pares más lentos que su ficha, 3 pares que fallan mucho (`grok@xhigh`, `agy/argon@high` y `agy/gemini@high`) y 3 que dicen «Too many rounds» para el Writer, el Judge y el Examiner;
- 15 fricciones por correcciones del dueño, 8 por herramientas que fallan y 3 más.

**Nadie las ve.**
- `aether-observe` solo tiene dos verbos, `hook` y `file-issues` (`bin/aether-observe:4-14`): no hay comando para mostrar la lectura.
- Los avisos del inicio solo anuncian issues creados (`lib/observe-notice.js`).
- Ninguna skill nombra `aether-observe`.
- La calibración, por diseño, no cambia la configuración (`lib/observe-calibrate.js:3-4`).

**Coincide con lo que esta revisión halló a mano:** los pares que fallan (#195) y las rondas de más en el diseño (#212) ya estaban calculados en esa lectura.

**Lo demás, en números.** Son 2.385 líneas en 11 archivos, con 9 detectores y 11 umbrales. Ha creado 13 issues automáticos; 9 eran «possibly blocked by mistake», una clase que ya no crea issues. La captura de desarrollo guarda 341 fragmentos de 67 sesiones y contó 20 correcciones del dueño en 15.

**Sus promesas se cumplen.** Las seis comprobadas están en el código: solo actúa en sesiones del Lead, la instalación normal no guarda contenido de conversaciones, nada sale de la máquina salvo en desarrollo con `autoissue`, se poda a los 30 días, y la lectura de desarrollo solo se enciende por sus tres vías.

## Por qué importa

- **RADAR entero:** el sistema ya mide lo que habría que ajustar y el ajuste no llega a nadie.
- **Sobreingeniería:** 2.385 líneas cuyo resultado principal, hoy, no tiene lector.

## Opciones sin funciones nuevas

Ninguna: falta el camino para enseñarlo. Mostrar las propuestas de calibración en el aviso de inicio, en `aether-report` o en el informe de cierre es una función nueva: está en #206.

---
Tercera vuelta de la revisión de diseño, 2026-11-09, versión 0.35.0 (`c95b9da`), de solo lectura. Datos: 58 sesiones del Lead en este repositorio (del 2026-10-14 al 2026-11-09, 911 mensajes del dueño), leídas con scripts locales que solo sacan cuentas: ningún texto de conversación salió de la máquina ni está en estos issues. No se hizo ninguna medición de pago ni se corrió ninguna prueba. Índice de esta vuelta: #225. Índices anteriores: #207 y #216.

