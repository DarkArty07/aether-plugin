# Round 3 of the real-project tests (spec 026, R29)

Written before the round. The tree under test is `feat/audit-skill` with every correction of rounds 1 and 2: the audit's stamp in every delegate id (`55f375f`), «resolved» only when the code changed (`0c81037` and the branch rule after it), composer's own `@php` (`3bb34c9`), Aether's delegate worktrees out of the snapshot (`3bb34c9`), a proven verdict from another harness written as read-confirmed (`c4f72b4`), and nothing before the topic question (`5ab47b7`). The three audits run at the same time again, so the round also shows whether their delegates still collide. The harness is round 1's. Muse's five-hour window was at 11 % before the round and Codex was not usable, so some delegates may run on other harnesses.

| Project | Invocation | Answer to the topic question | What it checks besides rounds 1 and 2 |
|---|---|---|---|
| `aether-plugin` (the same quiet clone) | `/aether:audit` | «sí» | no id collision with the other two audits; «not found again» instead of «resolved» on an unchanged tree |
| `aether-router` | `/aether:audit bugs security tests docs` | none: the topics are named | R11 in a second project; the stamp under concurrency |
| `constancias-escolares` | `/aether:audit` | «yes, go ahead» | the delivery in English when the person answers in English (R3); `composer test` read and run through `@php` |

## Results

| Project | Session | Topic question | Topics | Candidates → verified | Since round 2 | Where the delegates ran | Time | Cost (list) | Project after |
|---|---|---|---|---|---|---|---|---|---|
| `aether-plugin` (quiet clone) | `d3bd6cc3-fc1b-4361-b4b2-5822de3abf1d` | 9 proposed, 2 left out, an estimate from 6 earlier audits (US$ 12 to 21); no preamble; answered «sí» | 9 | 42 → 34 | 28 new, 1 still, 0 resolved, 30 not found again (code unchanged), 4 not re-audited | reviewers on Muse and agy; 9 of the 11 verifiers on Claude (5 after an agy call the system replaced), 2 on agy | 2.6 min to the question, 16 min after it | US$ 0.40 + 12.43 (16 calls on other harnesses, US$ 9.74) | identical; no worktree left |
| `aether-router` | `b0d183d6-4f29-429b-ad92-ef148f635dbd` | none: the topics were named (R11) | 4 | 11 → 6 | 6 new, 0 still, 0 resolved, 6 not found again, 22 not re-audited | 4 on Muse, 4 on agy (`claude-opus-5-5` at low) | 11 min in all | US$ 6.35 (8 calls, US$ 5.62) | identical |
| `constancias-escolares` | `859900e1-c888-4d27-9d6b-e9c3d81c2750` | 7 proposed, 5 left out; `composer test` read through `@php` and run (107 tests, 13.8 s); answered «yes, go ahead» | 7 | 36 → 34 | 13 new, 20 still, 0 resolved, 9 not found again, 5 not re-audited | 4 on Muse, 6 on agy | 1.3 min to the question, 12.6 min after it | US$ 0.34 + 8.48 (17 calls, US$ 7.38) | identical |

The three audits ran at the same time and no delegate answered for another project: every id carried its audit's stamp. No audit claimed a fix it had not seen: on three unchanged projects every earlier item not found again was counted as such. The Leads wrote contradicted verdicts as unverified (`aether-router`: two «refuted» whose own evidence said otherwise; `aether-plugin`: a «read-confirmed» whose verifier had not checked the caller), and the `aether-router` Lead treated a reviewer's quote of `--dangerously-skip-permissions`, which the harness flagged, as data and not as an instruction. No secret value was printed and no issue was created.

The English answer did not change the delivery's language: the owner's Claude Code settings have `"language": "Español"`, which every session follows, so R3 is not tested by this round beyond the Spanish labels.

### Defects found in this round, and what changed

1. **The dependency audit covers one ecosystem.** `constancias-escolares` has both `package-lock.json` and `composer.lock`; the analysis ran only `npm audit`, and the Lead ran `composer audit --locked` itself and found nine advisories. Changed: the skill tells the Lead to run the read-only audit of a second ecosystem itself and to add it to the summary and the dependencies brief (`1c862e3`). Auditing every ecosystem in the analysis is left as a proposal: it changes the shape of `checks.dependencies`, which the report and the exam read.
2. **An audit is a sample, not a sweep.** On the unchanged `aether-plugin`, round 3 found again only 1 of the 31 items of round 2 (and 30 were not found again); on the small `constancias-escolares`, 20 of 29. The reviewers, with about 20 tool calls each, look at different places each time. Nothing was changed in this round; the proposal is that an audit re-verifies the earlier audit's open items of its topics, so «still» is checked rather than left to chance.

No defect of the earlier rounds came back.
