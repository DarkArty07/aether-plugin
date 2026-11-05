# Round 2 of the real-project tests (spec 026, R29)

Written before the round. The tree under test is `feat/audit-skill` itself, with the round-1 corrections of the skill (`acd2172`, `7e76ad4`) and the corrected Task 4 (`1b3a6ed`: the reader refuses wrapped and flagged package-manager calls, Makefile inline recipes and unknown flags; a missing tool is «could not»; a project's `.venv/bin` comes first on the PATH). The harness is round 1's. All three projects were audited in round 1, so this round also tests the comparison with the earlier audit (R18).

| Project | Invocation | Answer to the topic question | What it checks besides round 1's |
|---|---|---|---|
| `aether-plugin` (the same quiet clone, `origin/HEAD` at `main`) | `/aether:audit` | «sí, pero quita accesibilidad» | a topic removed by name; new / still / resolved against round 1; branches located by their tip commit |
| `aether-router` | `/aether:audit` | «sí» | the analysis finds pytest and ruff in `.venv/bin` by itself; `pip-audit` missing is «could not», not «output not understood»; verdicts «proposal» only for opportunities |
| `constancias-escolares` | `/aether:audit` | «sí, y agrega fiabilidad» (changed at the round to «sí, y agrega arquitectura», because the question already proposed reliability) | the topic question in a project with no remote, with a topic added by name |

## Results

The analysis of the three sessions ran on `feat/audit-skill` at `9789b57` (before the round-2 code fixes below); the later phases ran on the same code, as `3bb34c9` changed only the analysis.

| Project | Session | Topic question | Topics | Candidates → verified → listed | Since round 1 | Time | Cost (list) | Project after |
|---|---|---|---|---|---|---|---|---|
| `aether-plugin` (quiet clone) | `6d40a15f-c8bf-4929-af58-679d87abaa33` | 10 proposed, 2 left out, an estimate from 3 earlier audits (US$ 18 to 23); answered «sí, pero quita accesibilidad», and accessibility was left out | 9 | 43 → 36 | 23 new, 12 still, 17 «resolved», 3 not re-audited | 2.9 min to the question, 18 min after it | US$ 0.35 + 19.84 (22 Muse calls, US$ 17.17) | identical; no worktree left |
| `aether-router` | `b85dccf8-d809-41dd-86da-b81d0855fcf5` | 10 proposed, 2 left out; the analysis found pytest and ruff in `.venv/bin` by itself and said «pip-audit is not installed» | 10 | 33 → 32 | 17 new, 11 still, 19 «resolved», 1 not re-audited | 4.4 min to the question, 15 min after it | US$ 0.31 + 13.72 (32 Muse calls, US$ 11.13) | identical |
| `constancias-escolares` | `43ba94fb-6510-441b-a929-0abf3edb3496` | 7 proposed, 5 left out; answered «sí, y agrega arquitectura», and architecture was added | 8 | 41 → 37 | 26 new, 8 still, 5 «resolved» | 1.2 min to the question, 11 min after it | US$ 0.32 + 11.26 (19 Muse calls, US$ 9.92) | identical |

No secret value was printed, no issue was created in the audited projects, and no branch location was invented (round 1's defect 1 did not come back). A topic removed and a topic added by name both worked (R10). The Lead of `constancias-escolares` wrote a read-confirmed verdict that its own evidence contradicted as unverified, as round 1's correction asks.

### Defects found in this round, and what changed

1. **«Resolved» claimed fixes that were not.** All three projects were unchanged since round 1 (same HEAD, clean tree), yet the reports said 17, 19 and 5 «resueltos»: the reviewers, who are models, simply did not find those items again. The three Leads said so under «Supuestos», but the line itself was false. Changed: the analysis records HEAD, and an earlier item not found again is «resolved» only when a file of its locations changed since the earlier audit; otherwise it is counted as «no se volvieron a encontrar, pero su código no cambió» (delegate task `audit-resolved`).
2. **Two audits running at once read each other's delegate results.** Every reviewer was `audit-<topic>` and every verifier `audit-verify-<n>` in every audit, and Aether keys an external attempt's files by the task id alone (`delegates/results/<id>.json`). The `aether-router` Lead saw five reviewers and seven verifiers answer about another project and relaunched them; the `aether-plugin` Lead had a verdict refused because `aether-delegate verdict` took another session's attempt. Changed: every id carries the audit's stamp, `audit-<stamp>-<topic>`, with a test (`55f375f`); the cause in Aether's delegate files is issue [#148](https://github.com/DarkArty07/aether-plugin/issues/148).
3. **A verifier on another harness reproduced with `node -e` and said «proven»**, and the command rightly left the claim unverified, so the audit's strongest finding (a way past `aether-guard`) was unranked. Changed: the Lead writes such a verdict as read-confirmed, the weaker one, and keeps what it ran as evidence (`c4f72b4`).
4. **Composer's own `@php` was read as a reference to a script**, so the reader refused Laravel's standard `composer test` («@php artisan test»); the Lead fell back to the README's `vendor/bin/phpunit`. Changed: `@php`, `@composer`, `@putenv` and `@no_additional_args` are composer's own, with reader cases; the real project's tests now run (`3bb34c9`).
5. **The snapshot counted Aether's own delegate worktrees** (`.aether/delegates/*/wt`) as a change of the project, which R25 allows; seen when an analysis ran while the round's delegates were working in the same project. Changed: worktrees under `<root>/.aether/` are left out, with a test (`3bb34c9`).
6. **A preamble before the topic question** («Terminó el análisis automático…»). Changed: the question starts with its first line (`5ab47b7`).
