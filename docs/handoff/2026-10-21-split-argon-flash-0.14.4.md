# Handoff: agy's Argon and Flash have a quota key each (0.14.4), and what the owner wants built next

- **Date:** 2026-10-21. It follows [the 0.14.3 handoff](2026-10-21-delegate-time-limits-0.14.3.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, in the long session that watched 0.14.1, fixed 0.14.2 and 0.14.3 and then had the policy explained to it once more.
- **To:** the next session. Read section 3 first: it is the owner's policy and the plan he confirmed.
- **Repository state:** built on the branch `fix/split-argon-flash`; section 6 says how it was released.

## 1. What was asked

After 0.14.3 the Lead proposed splitting the Gemini key of agy's table (one key held Argon and Flash, so an Argon refusal kept Flash out for 60 minutes). The owner: «si apruebo separar argon de flash, eso es un error de diseño corrígelo también».

## 2. What was done

| Where | What |
|---|---|
| `config/lanes.json`, `config/pairs.json`, `config/router/rungs.json` | agy's `groups` are `argon` and `flash`, both reading `Gemini Models`, plus `claude`; the models and the four Gemini pairs point to their own key; the rungs were regenerated with `scripts/build-router-rungs.js --write`. |
| `lib/lane-marks.js`, `docs/guide/lanes.md` | The comment and the agy paragraph say three keys. |
| `tests/` (13 files) | 5 new tests: a mark on one key leaves the other usable for the choice function, the swarm's pick and the router; a reading saved with the old keys is no whole reading and nothing throws; a mark file of the old key `gemini` is ignored in both stores. About 15 tests that named the real table's `gemini` key now name `argon`, `flash` or both. |
| `docs/decisions.md` (A69), `changelog.md`, `roadmap.md`, `issues/038` | The record. |

Known and not changed: `lib/report.js` adds up consumption per key, so a run that used both models counts the shared Gemini window twice in `quotaByHarness` and lists `Gemini Models` twice. The fix is to group the keys by the `/usage` group they read.

## 3. What the owner wants, and why (read this first)

In his words, after a long exchange in which the Lead did not get it:

- «SI EL MODO SUPERDLEGACION ESTA ACTIVADO ES PRIORDIAD A TODA COSTA DE MANDAR EL TRBAAJO A OTROS HARNESS».
- «primero quiero que se acaben las de otros harness porque si se acaban el trabajo no se detiene en la tarea de larga autonomia, siempre esta el fallback de continuar y nunca detener el trabajo, pero si la de claude code se acabo el lead no puede seguir trabajando porque depende de su cuota».
- The Lead stays on Claude, and that is not a choice: changing the provider of the main session turns off every claude.ai feature, including controlling the session remotely from the app, and web search.
- «codex y cursor por el momento no los adoptamos»: the harnesses that matter are agy, Grok and Muse.

What that means, in the Lead's reading (the owner confirmed it): the quota of Claude Code is the single point of failure of an autonomous run, so it is the reserve and the others are drained first; speed, the size of the task and convenience are never a reason to use Claude; Claude takes a task only when no external pair reaches the points it needs or every one is dry or refuses. The Lead's own turns are the floor of Claude's spend, so the Lead must stay small: no reading of big files, no long loops, a fresh session with a handoff for big work.

**Where the system fails that policy today.** The journal of the router (44 delegations on 2026-10-21): the 22 that edit files went to Claude, none outside; of the 22 that only read, 12 went outside. The router has a gate, "read-only", before it looks at any pair (`conclude` in `lib/route.js`; the decision of a delegate that edits has no candidates and no choice): an external delegate works on a throwaway copy of the last commit, so an edit would be lost (A66 (4)). The Lead's own rules (`skills/using-aether`) send a plan of one or two tasks to a delegate task, which stays on Claude. The sliced final review of the swarm runs on the native reviewer (`reviewRunSliced` in `workflows/run.workflow.js`). In 0.14.1 the half that reads was built and the half that edits was left as «the next spec»; the owner agreed to the order, but the next spec was not started, and the work of the following hours went into the half that reads (0.14.2 and 0.14.3).

**The three changes the owner needs, in the order the Lead proposed (not yet confirmed as an order):**

1. **The Lead's rule** (`skills/using-aether`, the bootstrap): with superdelegation on, work that edits goes through the swarm (external lanes) even when it is one or two tasks; a native delegate only as the fallback. Small: text and docs tests; effect at once.
2. **Spec 010, delegates that edit go first to other harnesses.** The card is `specs/010-delegates-that-edit/intent.md`, with his assumptions A to C confirmed («lo que supones es lo que quiero»): a unit worktree made by `aether-wt` instead of the throwaway copy; the Lead gets a summary, the branch and the test result, reviews and merges; a failure repeats on another pair, never the same; and the limit of ten minutes of the engine's `$.process.run` must be measured first (can the mod leave the call running and hand the result back later, or must the Lead start `aether-lane delegate` in the background?). The router's read-only gate goes for these tasks. Large: build it with the swarm itself, so it leaves Claude too.
3. **The final review of the swarm on lanes.** Today a large package is cut in slices that run on the native reviewer; move the slices to lanes.

Smaller: see 0.14.2 and 0.14.3 on a real harness (section 5), the two delegates decided in the same seconds that pick the same pair, and the Writer seat for `design.md`.

## 4. What the owner decided, in his words

- «si apruebo separar argon de flash, eso es un error de diseño corrígelo también» (done in this version).
- The policy of section 3. He has not yet said to start the three changes; the Lead asked whether to leave a handoff for a new session, and had no answer when this was written. The release of this version also waits for his word.

## 5. Open

- **Nothing of 0.14.2, 0.14.3 or 0.14.4 has run on a real harness.** The chain of #45 needs an Argon refusal with Grok or Muse free (Argon said it is out until about 2026-10-26 13:30 local, an estimate that failed once); the slow marks and the 20-tool-call bound need an audit on Grok; Muse has never run a real delegate.
- **With Argon out and Grok at `high` marked slow, level C delegates go to Muse first.**
- **The report counts the shared Gemini window twice** (section 2).
- **After the update, agy has no reading for a few seconds:** the saved reading has the old keys and the router renews it in the background.
- **Tests that read the shell.** Three tests fail when the shell has `AETHER_SUPERDELEGATION` or `AETHER_LANE_HARNESSES` set, as an Aether session does; with `env -u` on them the whole suite passes (1511 tests).
- **Not worked:** the skip of same-harness candidates after one `unavailable`; the double read of readings and marks in `lib/router-pick.js`.

## 6. Release

Version 0.14.4 is in the four places the contributing guide names (and the roadmap, the badge and the pins of two tests). The branch is committed and checked; the merge, the tag and the push wait for the owner's word.

## 7. What the next session has to watch

For the split: the journal's `quota` for an agy delegate lists `argon` and `flash` apart; a refusal of Argon leaves `agy__argon.json` and no `agy__flash.json`, and Flash still takes the next delegate that asks for its points. For the policy: the share of delegations that leave Claude (`aether-report --delegates`), by kind, once the three changes exist.
