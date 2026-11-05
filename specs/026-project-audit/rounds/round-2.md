# Round 2 of the real-project tests (spec 026, R29)

Written before the round. The tree under test is `feat/audit-skill` itself, with the round-1 corrections of the skill (`acd2172`, `7e76ad4`) and the corrected Task 4 (`1b3a6ed`: the reader refuses wrapped and flagged package-manager calls, Makefile inline recipes and unknown flags; a missing tool is «could not»; a project's `.venv/bin` comes first on the PATH). The harness is round 1's. All three projects were audited in round 1, so this round also tests the comparison with the earlier audit (R18).

| Project | Invocation | Answer to the topic question | What it checks besides round 1's |
|---|---|---|---|
| `aether-plugin` (the same quiet clone, `origin/HEAD` at `main`) | `/aether:audit` | «sí, pero quita accesibilidad» | a topic removed by name; new / still / resolved against round 1; branches located by their tip commit |
| `aether-router` | `/aether:audit` | «sí» | the analysis finds pytest and ruff in `.venv/bin` by itself; `pip-audit` missing is «could not», not «output not understood»; verdicts «proposal» only for opportunities |
| `constancias-escolares` | `/aether:audit` | «sí, y agrega fiabilidad» | the topic question in a project with no remote, with a topic added by name |

## Results

(filled in after the round)
