# Round 1 of the real-project tests (spec 026, R29)

Written before the round: the projects, how each is invoked and the answer each session gets to the topic question. Each project runs a headless Lead session of the development tree (`scripts/aether-lead --plugin-dir <tree>/plugins/aether -p '<invocation>' --output-format json`, then `--resume <session> -p '<answer>'`), with the tree's `plugins/aether/bin` first on `PATH`, `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` so the session waits for its background delegates, and `AETHER_IRREVERSIBLE=enforce`. «¿Cuáles tomas?» is never answered, so no issue is created.

| Project | Stack | Remote | Invocation | Answer to the topic question |
|---|---|---|---|---|
| `aether-plugin` (a quiet clone of `main`, with the remote branches, remote URL set to GitHub) | Node 22, no dependencies, `npm test` | GitHub | `/aether:audit` | «sí» |
| `aether-router` | Python, `uv`, pytest | GitHub | `/aether:audit` | «sí» |
| `constancias-escolares` | PHP 8, Laravel, `composer test` (SQLite in memory) | none | `/aether:audit bugs security docs tests` (R11: no question) | none: the topics are named |

In the quiet clone, the view of local branches, worktrees and stash is partial: only `main` is a local branch, and it has no worktrees or stash of its own.

## Results

The tree under test was the branch `test/audit-r1`: `feat/audit-skill` at `d1320ea` plus the first build of Task 4 (`60dc904`), whose correction was still running; the three projects' test commands use none of the shapes that build's review found unsafe.

| Project | Session | Topic question | Topics | Candidates → verified → listed | Unverified | Time | Cost (list) | Project after |
|---|---|---|---|---|---|---|---|---|
| `aether-plugin` (quiet clone) | `93083ebb-d012-42c7-a977-ed23a1098b4a` | one, in the prototype's shape: 9 proposed with reasons, 3 left out with reasons, «no history yet»; answered «sí» | 9 | 47 → 36 → 32 (P2 10, P3 22) | 0 | 2.7 min to the question, 13 min after it | US$ 0.41 + 20.79 (25 Muse calls, US$ 18.77) | identical but for Aether's three exclude lines and an empty `.aether/delegates/` (allowed by R25); no worktree left |
| `aether-router` | `8d83ff2a-b9d4-4f5f-92ac-a9528952e3a7` | one: 11 proposed, 1 left out, an estimate from the earlier audit of another project (US$ 1.79 per topic); answered «sí» | 11 | 44 → 33 → 32 | 1 | 8.6 min to the question (tests 192 s, run twice), 12 min after it | US$ 0.44 + 19.54 (30 Muse calls, US$ 17.61) | identical |
| `constancias-escolares` | `5c9458be-d476-4b57-93d3-02df78078613` | none: the topics were named (R11) | 4 | 18 → 13 → 13 (P1 1, P2 5, P3 7) | 0 | 7.6 min in all | US$ 7.16 (12 Muse calls, US$ 6.24) | identical but for Aether's three exclude lines and an empty `.aether/delegates/` |

Every reviewer and verifier ran on Muse (`muse-spark-1.3`), so nothing was reproduced: every listed finding is «confirmado leyendo». No secret value was printed in any delivery. No issue was created. The full reports are in the development installation's data directory, `~/.claude/plugins/data/aether-inline/audits/<project key>/2026-11-04/`; they are not copied here, because this repository is public and two of the projects are the owner's private ones.

Spot checks of findings, by the Lead, against the code: `aether-plugin` 6 (`worktrees.js:693` runs `git rev-parse HEAD^1` without `allowFail`) and 7 (the two install guides show `0.30.0` while the version is `0.30.2`) are true.

### Defects of the skill found in this round, and what changed

1. **A location was invented.** The Lead turned the `0` line of branch findings into `1` so they would pass the gate (`origin/feat/audit-skill:1`). Changed: the reviewer brief says a branch is located by its name and its tip commit, and an open issue is not a finding by itself; the Lead may fix a candidate's shape, never invent a location (`acd2172`).
2. **The Lead changed a verdict** (read-confirmed to refuted, on its own reading). Changed: the Lead copies each verdict as given and never makes one stronger; when a verifier's evidence contradicts its verdict, the claim is written as unverified with that reason (`acd2172`).
3. **The Lead rewrote a candidate's path.** Allowed now as a shape fix said under «Assumptions»; the claim and the evidence are never rewritten (`acd2172`).
4. **A preamble before the report** («Informe terminado. Una nota antes de dárselo…»). Changed: nothing goes before the header line; a note goes under «Assumptions» (`7e76ad4`).
5. **A verifier gave «proposal» to a claim that was not an opportunity**; the command rightly left it unverified. Changed: the verifier brief says a proposal is only for an opportunity, and a future risk the code shows is read-confirmed (`7e76ad4`).
6. **Reviewers tried `gh`**, which has no session in their disposable copy. Changed: the brief says they have no gh and no network, and that what they need from GitHub is in the brief (`7e76ad4`).
7. **Several answers came as free text or invalid JSON** (a trailing comma) at the first try; one `fix` each was enough. Changed: the briefs ask for one fenced block of valid JSON at the end (`7e76ad4`).
8. **Code: a Python project's tools live in its `.venv`.** `python` and `ruff` were not on the global PATH; the Lead reran the analysis with `.venv/bin` on the PATH itself. Sent to Task 4's correction: the runners put `.venv/bin` or `venv/bin` first on the PATH.
9. **Code: a missing tool (pip-audit) was «output not understood».** Status 127 from `sh -c` was not read as a missing tool. Sent to Task 4's correction (its review found the same).

What worked as specified: one question in the prototype's shape, none with named topics (R10, R11); the estimate from an earlier audit (R10); the phases in order; the gate, the verdicts, the merge, the open issue removed (`aether-plugin`: 1 covered by an issue), the bands and the order; the eleven sections; the report saved outside the project (R24); the cost from `aether-report --spend` (R23); no change to the projects (R25, C6).
