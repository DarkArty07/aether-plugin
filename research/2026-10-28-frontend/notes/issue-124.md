The quota brake froze the Lead session for 72 minutes, and its resume wake-up never fired.

## What happened

In the autonomous run `auto-20261028-155518-67ab` (session `4b87a2cf-…`, installed release 0.25.0), the five-hour window crossed the threshold right after a step of the Lead:

| Time (UTC) | Transcript event |
|---|---|
| 01:58:16.576 | the Lead's step ends with a `Bash` tool use |
| 01:58:16.816 | `run.json` records the pause (98 %, threshold 95 %, resets 02:00, resume 02:02, `savedUnits: []`) |
| 01:58:16.832 | `queue-operation enqueue`: the brake's prompt goes into the queue |
| 01:58:17.008 | the `Bash` result comes back |
| (nothing) | no API request for 72 minutes; no enqueue at 02:02 |
| 03:10:20.993 | the owner presses Esc: `queue-operation remove` of the brake's prompt, `[Request interrupted by user]` |

The Lead never read the brake's message, and the resume message at 02:02 was never submitted. The pause itself lasted four minutes; the frozen session cost 72. Nothing was running, so no work was lost.

## Cause

`turn.step` (`hooks/register.js:617`) awaits `brakeStep` after the step's result. On a new five-hour pause, `brakeRecorded` awaits `$.prompt.submit` (line 379). The mod API says `submit` is "a turn of its own, once the session is idle", and its example calls it with `void`. The session cannot become idle while its own step handler waits for that turn, so the step never returns: a deadlock. `armResume` comes after the awaited submit (line 381), so it is never reached, and the wake-up at the resume hour is never armed.

The same shape sits in `armResume`'s branch for a resume hour already past (line 339), which `brakeStepOnce` reaches from inside a step (line 422) when a session starts while a pause is recorded. `turn.step` fires for every agent of the session, so a crossing seen on a swarm agent's step would hang that agent the same way.

Present on `main` (3b53a29, 0.25.1): lines 339, 344 and 379.

## Fix

- Do not await the submit inside a step: `void $.prompt.submit(...)` at lines 339 and 379, with a `.catch` so a rejection never escapes. The timer callback at line 344 is outside a step and can keep its await.
- Arm the resume before submitting the brake's prompt, so a submit that never settles cannot keep the wake-up from being armed.
- A mod test where `$.prompt.submit` never resolves until the turn ends: the step must still return, and the resume must still be armed.

The notice to the owner's phone was not sent either (`notify: {sent: false, reason: "no-channel"}`); that is the configuration of this machine, not this bug.
