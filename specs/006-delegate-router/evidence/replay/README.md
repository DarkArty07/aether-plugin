# Arnés de replay

Repite las delegaciones reales contra Jev y compara lo que habría decidido la política con lo que corrió y costó. **No lleva datos:** el corpus, los briefs y los resultados se generan en `out/` (no se versiona) o en `REPLAY_DIR`.

1. `node extract-corpus2.js out/corpus2.jsonl` extrae las delegaciones de `~/.claude/projects` (proyectos de trabajo, con filtro de secretos) y su costo real.
2. `OPENROUTER_API_KEY=… node jev-run.js` clasifica cada brief con `typesafe/jev-1.14` (rubric v1 en línea; `q-v1.json` es el mismo) y escribe `out/jev-results.jsonl`. La llave se lee solo del entorno.
3. `node analyze.js` (política v0) y `node replay-v1.js` (política asimétrica) comparan costo y decisiones.
4. `jev-guard-test.js` prueba una segunda capa para `aether-guard` con comandos etiquetados; `jev-plan-lint.js`, los `Tier:` de los planes contra la lectura de Jev.
