# Round 3 of the real-project tests (spec 026, R29)

Written before the round. The tree under test is `feat/audit-skill` with every correction of rounds 1 and 2: the audit's stamp in every delegate id (`55f375f`), «resolved» only when the code changed (`0c81037` and the branch rule after it), composer's own `@php` (`3bb34c9`), Aether's delegate worktrees out of the snapshot (`3bb34c9`), a proven verdict from another harness written as read-confirmed (`c4f72b4`), and nothing before the topic question (`5ab47b7`). The three audits run at the same time again, so the round also shows whether their delegates still collide. The harness is round 1's. Muse's five-hour window was at 11 % before the round and Codex was not usable, so some delegates may run on other harnesses.

| Project | Invocation | Answer to the topic question | What it checks besides rounds 1 and 2 |
|---|---|---|---|
| `aether-plugin` (the same quiet clone) | `/aether:audit` | «sí» | no id collision with the other two audits; «not found again» instead of «resolved» on an unchanged tree |
| `aether-router` | `/aether:audit bugs security tests docs` | none: the topics are named | R11 in a second project; the stamp under concurrency |
| `constancias-escolares` | `/aether:audit` | «yes, go ahead» | the delivery in English when the person answers in English (R3); `composer test` read and run through `@php` |

## Results

(filled in after the round)
