# Handoff: the quota brake for autonomous runs, and a workflow that keeps its work when it is interrupted (0.16.0)

- **Date:** 2026-10-21. It follows [the 0.15.0 handoff](2026-10-21-delegates-that-edit-0.15.0.md), whose section 3 says why the brake was needed.
- **From:** the Lead, Claude Code on Sonnet 5.5, in the same long session, working autonomously on «Comienza a trabajar automáticamente en el freno».
- **To:** the next session.
- **Repository state:** built on the branch `feat/quota-brake` (worktree `.worktrees/quota-brake`), from `main` after 0.15.0. Nothing of it is merged, tagged, pushed or installed: it waits for the owner's word.

## 1. What was asked

«un freno que cuando la cuota de 5 hrs llegue al 95 porciento de su límite te avise y detengas todos los procesos para asegurar la continuidad de los trabajos autónomos cuando regrese la ventana de 5hr y se reinicie continúes trabajando . A menos que con petición explícita mis continúes trabajando hasta acabar», and «que si un workflow se interrumpe no se pierda el trabajo». Spec 011 (`specs/011-quota-brake/`) holds the card, the spec, the plan and the tasks; [decision A73](../decisions.md) says what was decided.

## 2. What was done

- **Designed** by `/aether:design` (1 h 54 min: spec and plan in three rounds each, Muse and Grok as Writers, the Judge on Claude Opus every round because no external pair reaches its points, the Examiner's files completed by the Lead into 12 hidden tests) and **built** by the swarm on lanes, in three launches: tasks 4 and 8 ran on Claude Opus because Muse's window was out; tasks 1, 2, 5 and 6 were blocked by plan gaps (tests that no task owned, a defect of task 4) and adopted by the Lead; tasks 3 and 7 merged.
- **Verified:** the hidden exam passes 12 of 12; the suite passes 1636, the mod's 86, the strict validation.
- **The final reviews found, and the Lead fixed:** concurrent steps could handle one crossing twice (a single-flight guard now), the failure branches of the mod had no tests (six added), and a settings test took the session's own variables.
- **R17, measured for real.** A probe plugin (below) read `$.session.usage().rateLimits` in a live session: `five_hour` 8 % used, resetting `2026-10-22T01:50:00Z`, and `seven_day` 32 %, resetting `2026-10-27T19:00:00Z`. The same session's stream carried a `rate_limit_event` with those windows (`utilization` as a fraction). A timer of the mod (`$.clock.after(15000, ...)`) called `$.prompt.submit` and **woke the idle streaming session**: its second answer was the word the prompt asked for. Two things to note: the five-hour reset hour of a first reading (`02:30:00Z`) was not the one of a reading 2 minutes later (`01:50:00Z`), so the brake takes the hour from the reading that crossed, not from an earlier one; and the wake was tried in streaming print mode, not in the interactive terminal.

The probe (a plugin dir with `.claude-plugin/plugin.json` and `hooks/hooks.json` = `{ "hooks": {}, "modules": ["./register.js"] }`, run with `claude -p --input-format stream-json --output-format stream-json --verbose --plugin-dir <dir> --model haiku` and its stdin held open for 70 seconds):

```js
export function register(on) {
  let armed = false
  on('turn.complete', async ($, e, next) => {
    if (!armed) {
      armed = true
      const usage = await $.session.usage()
      await $.fs.write('/tmp/probe/usage.json', JSON.stringify(usage.rateLimits, null, 1))
      $.clock.after(15000, () => $.prompt.submit({ text: 'WAKE PROBE: reply with the single word WOKE and nothing else.' }))
    }
    return next(e)
  })
}
```

## 3. What the next session must know

- **Open in the owner's answers:** whether the saved unit branches may go to GitHub. The brake keeps them local; `brakepush` turns the push on and a push still needs his permission each time.
- **The brake does not watch itself.** It reads the window after each metered step; a session in which nobody asks the model anything reads nothing.
- **The wake works in streaming print mode.** Nobody tried it in the interactive terminal. If it does not wake there, the diary and the session-start note are the fallback (R8).
- **The brake stops the run; it does not make the next pair continue the partial work of a delegate or a seat round** ([issue 049](../issues/049-a-delegate-or-a-seat-round-that-loses-its-pair-mid-task-is-redone-from-scratch-not-continued.md)). The time issues [043](../issues/043-a-design-seat-round-has-no-time-cap-and-the-plan-writers-took-8-to-29-minutes.md) to [048](../issues/048-a-design-takes-three-rounds-per-document-and-each-round-reruns-the-writer.md) are open: the design of this feature took 1 h 54 min, 84 of them for the plan.
- **Tests that read the real data directory:** `delegate-calls` failed while Muse's window was out because it reads `lanes/quota/muse-observed.json` of the real data dir. Three others read the shell's Aether variables. Run the suite with `env -u AETHER_SUPERDELEGATION -u AETHER_LANE_HARNESSES -u AETHER_SUPERDELEGATION_LEGACY -u AETHER_IRREVERSIBLE`.

## 4. Open

- The minor findings of the final reviews (seven in the last, in `.aether/runs/20261021-140811-3594/result.json`).
- Cleanup: the worktree `.worktrees/quota-brake` and its branch stay until the release.

## 5. Release

Version 0.16.0 is in the four places the contributing guide names, with the roadmap and the badge. **It waits for the owner's word:** merge to `main`, tag `aether--v0.16.0`, push, `claude plugin update aether@aether-plugin`.

## 6. What the next session has to watch

That a real autonomous run at the threshold warns and pauses and, at the reset, wakes by itself; that `status` shows `stop: "quota"` meanwhile and the hours do not run; that a relaunch after an interruption leaves the merged units out.
