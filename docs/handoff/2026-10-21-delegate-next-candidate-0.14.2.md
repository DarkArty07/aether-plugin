# Handoff: an external delegate refused at its start tries the next candidate (0.14.2)

- **Date:** 2026-10-21. It follows [the 0.14.1 handoff](2026-10-21-router-superdelegation-0.14.1.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, in the session that watched the first delegations of 0.14.1 and then fixed what they showed.
- **To:** the next session.
- **Repository state:** published on the owner's word of 2026-10-21 («Si abre el issue desarrolla la solución cierra el issue pusheas a local actualizas el plugin y me das el aviso cuando esté resuelto»): merged to `main` (`c5f8360`), tagged `aether--v0.14.2`, pushed, and his plugin updated from 0.14.1 (a restart applies it). Section 4 says what is open.

## 1. What was asked

The owner asked the Lead to watch the delegation of the first session with 0.14.1 (superdelegation on, `harnesses` agy, grok and muse, the router in `auto`) and to say whether it worked as expected. Of 8 read-only delegates, 5 ran outside Claude and 3 fell to Claude Sonnet: two when agy refused Gemini 4 Argon at its start, and one when Grok 4.7 at `high` was killed at 420 seconds. The owner saw that the two refusals never tried Grok or Muse, which the decision had ranked next, and asked: «Un problema, si agy estaba activado porque no pasó a muse. Eso es un error de diseño no?». Then: «Si abre el issue desarrolla la solución cierra el issue pusheas a local actualizas el plugin y me das el aviso cuando esté resuelto».

## 2. What was done

| Where | What |
|---|---|
| `lib/delegate-chain.js` (new) | `runChain`: the primary pair and then the alternates, at most three. It moves on only after a refusal at the start (a quota refusal with no tokens used, or `unavailable`), skips a candidate whose quota group holds a live mark or refused earlier in the chain, gives a later try only the CLI time left of the 570 seconds, writes one outcome per try and the refusal's mark, and builds the attribution. |
| `bin/aether-route` | `delegate` calls the chain and prints `attempts` besides today's fields. |
| `lib/route.js` | The external file carries `alternates`: the `next` entries of the ranking, resolved to model, effort and group through the pairs table. |
| `lib/delegate-calls.js` | A refusal that `lib/quota-refusal.js` recognizes ends as `quota`; a new `maxCliSeconds` caps the CLI limit. |
| `lib/delegate-limits.js`, `lib/router-marks.js` | `retryCliSeconds` and `MIN_RETRY_CLI_SECONDS`; `refusalOf` is exported. |
| `lib/router-report.js` | A delegation has several outcomes: the last decides `ranOn` and `fallback`, `attempts` lists them and `durationMs` adds them up. `totals` did not change. |
| `docs/guide/router.md`, `changelog.md`, `decisions.md` (A67), `roadmap.md`, `issues/034` | The Fallback section tells both cases. |
| `tests/delegate-chain.test.js` (new) and five more test files | 13 cases for the chain (refusal then answer, a shared group, a failure after the start, the third try, the time budget, an old external file), the `alternates`, the report and the verb. |

## 3. What the owner decided, in his words

- «Un problema, si agy estaba activado porque no pasó a muse. Eso es un error de diseño no?» (the Lead answered yes and proposed the next candidate before Claude).
- «Si abre el issue desarrolla la solución cierra el issue pusheas a local actualizas el plugin y me das el aviso cuando esté resuelto». The Lead read «pusheas a local» as in his earlier phrases («pushea a main ya psalo para local», «publica manda a local y pushea»): push `main` and the tag, and update his installed plugin, which is read from GitHub.

## 4. Open

- **Two delegates launched together still both try the refused pair.** The chain moves on inside one delegate; the mark of a refusal is written when it happens, so a second delegate decided in the same seconds still picks the pair. It costs a failed process and no tokens, now without the Claude rerun.
- **An Argon refusal keeps Flash out for 60 minutes.** The mark is per key, and the table has one Gemini key for agy (A60 (4)). Splitting `argon` and `flash` is one line of `lanes.json`; it is a proposal, not done.
- **Grok 4.7 at `high` on an audit hit the 360 second limit** and was killed after the 60 second grace (exit 137), then ran on Claude. A task that needs longer than 6 minutes stays on Claude by design; whether such an audit should ask for a different pair is open.
- **Real calls.** The chain is tested with fake CLIs. A real refusal followed by a real answer on another harness has not been run in a session of the new version; it spends the owner's quota and needs his word.
- **Three tests fail when the shell has superdelegation set.** `tests/aether-lane.test.js` and `tests/aether-plan.test.js` read `AETHER_SUPERDELEGATION` and `AETHER_LANE_HARNESSES` from the environment, which an Aether session sets; with `env -u` on those variables the whole suite passes (1481 tests). They could clear them in `tests/helpers.js`.
- **Findings of this session's review of the router, not worked:** `pairStep` writes the text of an internal error into `decision.choice` with `quota: null` and no `fallback: internal` (the guide says the entry should say it), so a broken router looks like a normal choice; `lib/quota-refusal.js` reads uppercase units as 0, stops at a space and ignores decimals (harmless today, the mark always holds 60 minutes); the readings and the marks are read twice in `lib/router-pick.js`, so a renewal or a refusal that lands in between is not seen by that decision.
- **Unchanged from 0.14.1:** delegates that edit files stay on Claude (spec 010); delegates do not count against the cupo.

## 5. Release

Version 0.14.2 is in the four places the contributing guide names (and the roadmap, the badge and the pins of two tests). `npm run check` passed before the merge (1481 tests with the shell's Aether variables cleared, 69 of the mod, the strict validation). The merge, the tag `aether--v0.14.2` and the push were made on the owner's word above, and `claude plugin update aether@aether-plugin` took his installed plugin from 0.14.1 to 0.14.2. GitHub issue #45 is closed.

## 6. What the next session has to watch

In `aether-report --delegates` a delegation whose first pair refused has more than one entry in `attempts` and no `fallback`; the journal's outcomes carry `attempt`. Signs that something is wrong: a delegate that refused at its start and still ran on Claude with candidates left (check `alternates` in the decision's external file and the marks), a delegate that stays long in the chain (the sum of `attempts` above 570 seconds should never happen), or a candidate tried while its group is marked.
