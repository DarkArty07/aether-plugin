# Handoff: a pair that ran out of time is kept out, and the delegates' work is bounded (0.14.3)

- **Date:** 2026-10-21. It follows [the 0.14.2 handoff](2026-10-21-delegate-next-candidate-0.14.2.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, in the session that fixed 0.14.1 and then watched what the owner's second session showed.
- **To:** the next session.
- **Repository state:** built on the branch `fix/delegate-time-limits`; section 5 says how it was released.

## 1. What was asked

After 0.14.2 the owner ran a second session with the new version. It could not test the fix of #45 (agy's Argon mark was still alive, so no pair was refused), but it showed something else: three audits sent to Grok 4.7 at `high` were killed at 420 seconds and rerun on Claude, like the one seen the night before. Four of four. The Lead looked at the code and at Grok's own log (the runs were still working, with 33 to 42 tool calls; the adapter passes Grok no time limit) and proposed two parts: bound the work in the delegate's brief, and keep out a pair that ran out of time. The owner answered: «arregla los bugs trabja autonoam,emtne psuhea y manda a local me dices cuando ya acabes y quiera que pruebe de nuevo en otra sesion».

## 2. What was done

| Where | What |
|---|---|
| `lib/delegate-calls.js` | The note of every external delegate bounds the work (`DELEGATE_TOOL_BUDGET`, 20 tool calls). A flag set by the kill timer says the call was killed at its limit: the outcome is `failed` (never `quota`), says it ran out of time, and carries `timedOut`. |
| `lib/router-slow.js` (new) | The per-pair mark of a call that ran out of time: `markSlow`, `slowPairIds`, 60 minutes, kept in `router/slow/`. |
| `lib/router-pick.js`, `lib/route.js` | The router gives the marked pairs to the choice function as an exclusion, so they show as excluded and the chain's alternates never hold them. A failure inside `pairStep` comes back as `error` and the decision's fallback reads `internal: …`, with no choice. |
| `lib/delegate-chain.js` | A timed-out attempt writes the slow mark and `timedOut`, `slowUntil` on its outcome, and is never a start refusal; a candidate with a live slow mark is skipped; an exception inside an attempt becomes a failed attempt with its outcome. |
| `lib/quota-refusal.js` | agy's stated reset is read in either case of the units and with spaces between the parts. |
| `docs/guide/router.md`, `changelog.md`, `decisions.md` (A68), `roadmap.md`, `issues/035` to `037` | The Fallback section tells the new case. |
| `tests/router-slow.test.js` (new) and six more test files | 25 new tests. |

## 3. What the owner decided, in his words

- «arregla los bugs trabja autonoam,emtne psuhea y manda a local me dices cuando ya acabes y quiera que pruebe de nuevo en otra sesion». «psuhea y manda a local» was read as for 0.14.2: push `main` and the tag, and update his installed plugin.

## 4. Open

- **Nothing here was run with a real harness.** The bound of 20 tool calls is an estimate from the Grok runs; whether Grok at `high` now finishes an audit in time, and what Muse does with one, is for a real session to show.
- **Level C now goes to Muse first when Argon is out and Grok at `high` is marked.** Muse has not run a real delegate in a session; if it also runs out of time, it is marked and the next delegates go to Claude.
- **An Argon refusal keeps Flash out for 60 minutes** (A60 (4)); splitting `argon` and `flash` in agy's table is one line of `lanes.json` and the owner's call.
- **Two delegates decided in the same seconds still pick the same pair,** before either writes its mark.
- **The fix of #45 has not been seen in a session.** It needs a refusal of Argon with Grok or Muse still free; see the next section.
- **Tests that read the shell.** Three tests fail when the shell has `AETHER_SUPERDELEGATION` or `AETHER_LANE_HARNESSES` set, as an Aether session does; with `env -u` on them the whole suite passes (1506 tests).
- **Not worked:** the double read of the readings and the marks in `lib/router-pick.js`; the skip of same-harness candidates after one `unavailable`.

## 5. Release

Version 0.14.3 is in the four places the contributing guide names (and the roadmap, the badge and the pins of two tests). `npm run check` is run before the merge, and the merge, the tag and the push are made on the owner's word above.

## 6. What the next session has to watch

Run read-only delegates of several levels, three or more of them audits of one or two files, with no model or effort. Read `aether-report --delegates` and the router's journal. It works if: an audit no longer waits 420 seconds on Grok at `high` and then runs on Claude; a pair that did run out of time shows `timedOut` and `slowUntil` and is excluded in the next decisions' candidates; a delegate refused at its start with a pair free ends ok on another harness with `attempts` of two or three. Signs of a fault: a delegate that ran out of time and is still picked within the hour; an internal error entry (`fallback` starting with `internal:`); a chain that goes on after a call that used tokens.
