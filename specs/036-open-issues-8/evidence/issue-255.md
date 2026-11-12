<!-- Copia del cuerpo del issue #255 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

**Versión:** aether 0.39.3. Se vio el 2026-11-12 en la corrida \`auto-20261112-015910-9484\`, tarea \`oi7-t2-tree-line\` (muse \`muse-spark-1.3\` \`high\`, unidad \`20261112-020042-f7ba/task-1\`).

**Qué pasó**
- El brief pedía \`git checkout --detach f372305\` antes de empezar. Esa línea sirve para los delegados en Claude, que empiezan desde \`origin/main\`, pero esta tarea corrió en muse.
- El implementador hizo su commit \`39a1ae4\` sobre HEAD desacoplado. La rama de la unidad \`aether/20261112-020042-f7ba/task-1\` se quedó en la base \`f372305\`.
- El resultado decía «Branch: aether/20261112-020042-f7ba/task-1 at 39a1ae4…», que es el HEAD del worktree, no la rama.
- El revisor (\`muse/muse-wonder-1.0@max\`) recibió un paquete vacío («Base == Head, no commits») y dio \`not-ready\` con dos hallazgos críticos, que eran falsos.
- \`aether-wt merge 20261112-020042-f7ba task-1\` contestó \`{"merged":false,"reason":"empty"}\`. Hubo que fusionar el commit por su hash.

**Por qué importa:** si el Lead se fía de la revisión, rechaza un trabajo bueno y lo sube un escalón. Si se fía del resultado, intenta fusionar una rama vacía.

**Ideas, sin decidir**
- Después del implementador, si HEAD está desacoplado y por delante de la rama, mover la rama a HEAD, o rechazar el intento con un motivo claro.
- Que el resultado nombre la rama y su commit tal como están, no el HEAD del worktree.
