# Tareas: instalar, lanzar y aprender Aether sin fricción (0.30.0)

- **Plan:** [plan.md](plan.md)

Cada tarea dice quién la hace: **Lead** (la sesión principal), **Sonnet** o **Haiku** (subagentes, con su modelo explícito). Ningún subagente corre en Opus. Los subagentes no hacen commits; el Lead revisa, integra y hace los commits.

## Oleada 1: verificar

- [x] **T1 · Haiku.** Probar que un skill de plugin pasado como el prompt (`claude -p "/demo:hello"`) se ejecuta. Resultado: sí con `-p`; en modo interactivo lo detiene la pregunta de confianza en la carpeta y queda para T21.
- [x] **T2 · Sonnet.** Cómo saber si los workflows dinámicos están encendidos (`enableWorkflows`, `disableWorkflows`, `CLAUDE_CODE_DISABLE_WORKFLOWS`) y el formato de `claude plugin configure --values-stdin` (un objeto JSON de cadenas; el Lead lo probó en una configuración desechable).
- [x] **T3 · Lead.** Esta especificación, el plan y las tareas.

## Oleada 2: código (cada tarea con sus pruebas)

- [ ] **T4 · Sonnet.** `lib/doctor.js`, `bin/aether-doctor`, `tests/doctor.test.js` y el skill `doctor` (R10, R11).
- [ ] **T5 · Sonnet.** `aether-first-setup --permissions` y el directorio por defecto (R4, R5); el lanzador lee `AETHER_PERMISSION_MODE` (R8); sus pruebas en `tests/first-setup.test.js` y `tests/launcher.test.js`.
- [ ] **T6 · Lead.** El skill `setup` en lugar de `first-setup` (R2, R3, R6, R7). Depende de T4 y T5.
- [ ] **T8 · Sonnet.** El skill `help` y `tests/help.test.js` (R12).
- [ ] **T9 · Sonnet.** La línea de bienvenida del hook SessionStart y sus pruebas (R9).

## Oleada 3: documentación

- [ ] **T10 · Lead.** `## Quick start` en el README y la prueba R1 con el orden nuevo (R17).
- [ ] **T11 · Sonnet.** `docs/getting-started.md` con los cuatro pasos; la prueba de `tasks.md` a `docs/contributing.md` (R16).
- [ ] **T12 · Sonnet.** Guías 1 a 4, en inglés y en español (R13).
- [ ] **T13 · Sonnet.** Guías 5 a 8, en inglés y en español (R13).
- [ ] **T14 · Sonnet.** «What Aether adds», «Qué agrega Aether» y `docs/es/index.md` (R14, R15).
- [ ] **T15 · Sonnet.** La sección de instalación de `site/index.html`, en español y en inglés (R18).
- [ ] **T16 · Haiku.** Los enlaces de `docs/index.md`, la lista de páginas de `tests/docs-facts.test.js`, las filas de `docs/reference/components.md` y los nombres de `first-setup` que quedan en las páginas (R15, R19).
- [ ] **T17 · Haiku.** El borrador del changelog, el roadmap y el handoff; el Lead lo revisa (R19).

## Oleada 4: verificar y entregar

- [ ] **T18 · Haiku.** `npm test` y el resumen de los fallos; el Lead los arregla.
- [ ] **T19 · Sonnet.** Una instalación limpia en un `CLAUDE_CONFIG_DIR` desechable desde la rama: instalar, `aether-doctor`, `aether-first-setup`, `claude plugin configure`, y que `aeth` corra el lanzador.
- [ ] **T20 · Lead.** La versión 0.30.0 en sus cuatro lugares, la decisión A103, la revisión del diff completo, los commits y el push a la rama.
- [ ] **T21 · Dueño.** Los cuatro pasos en su máquina, con una sesión interactiva.

## Nombres de las páginas nuevas

- Inglés, `docs/tutorials/`: `install-and-start.md`, `first-request.md`, `whole-feature.md`, `read-the-brief.md`, `work-for-hours.md`, `other-harnesses.md`, `see-the-spend.md`, `update-and-uninstall.md`; y `docs/what-aether-adds.md`.
- Español, `docs/es/guias/`: `instalar-y-arrancar.md`, `primera-peticion.md`, `feature-completa.md`, `leer-el-brief.md`, `trabajar-horas.md`, `otros-harnesses.md`, `ver-el-gasto.md`, `actualizar-y-desinstalar.md`; `docs/es/que-agrega-aether.md` y `docs/es/index.md`.
