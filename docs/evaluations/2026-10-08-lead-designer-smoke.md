# Smoke run: the Lead and the Designer (2026-10-08)

**Question.** Do the platform facts that the [Lead and Designer spec](../superpowers/specs/2026-10-08-lead-and-designer-design.md) rests on hold in real sessions? The checks are S7–S13 in spec §11, plus S0 for the harness. This is Task 6 of the [plan](../superpowers/plans/2026-10-08-lead-and-designer.md).

**Verdict: every check passes** in run 2, on Claude Code 2.1.295. Run 1 found three faults, all in the harness, and they were fixed before run 2.

## Setup

- **Fixture:** an empty git repository whose README says "A reading-list library and CLI", with an integration worktree on `feature/trial`. It was built by [`setup.sh`](lead-designer-smoke/setup.sh).
- **The session:**
  - `claude -p` over stream-json, driven by [`drive.py`](lead-designer-smoke/drive.py): one long-lived process, with one owner message per turn;
  - the plugin from `feature/lead-designer`, with `--model sonnet --effort xhigh`;
  - bypassed permissions, MCP connectors off, the advisor off, and a $15 cap.
- **The owner:** a simulated owner ([`owner.py`](lead-designer-smoke/owner.py)). It runs on Sonnet, with no settings, plugins or tools, and follows [`brief.md`](lead-designer-smoke/brief.md).
- **The checks:** [`check.py`](lead-designer-smoke/check.py) reads the transcripts of the main session and its subagents.

## Run 1: what it found

The Lead handed off at the right moment, but the run ended at the 12-turn cap with the Designer still on its first round.

**Three harness faults:**
1. **The background Designer.** In stream-json mode, a turn ends while a background agent works. When the agent finishes, the session starts a turn of its own that relays the result: a background test on Haiku confirmed it. The driver did not wait for that turn, so the simulated owner answered "ok, espero" eleven times.
   - **Fix:** after a result, the driver waits while `background_tasks_changed` lists running tasks, or while a turn the session started is under way. It asks the simulated owner only once the session is idle.
2. **The cost.** `total_cost_usd` accumulates over the process, so the session's cost is its last value.
3. **The owner's messages in SDK sessions.** In sessions driven over stream-json, the owner's messages have no `origin` field. `aether-voice` found them anyway through its fallback rule, which the plan requires. The checker looked only for `origin.kind` `human`, and now uses `aether-voice`'s rule.

Even so, run 1 already passed S0, S7, S8, S11, S12 and S13 ([checks](lead-designer-smoke/results/run1-checks.json)).

## Run 2: results

| Check | Result | Evidence |
|---|---|---|
| S0. Several turns in one process | Pass | 9 turns; stopped on the simulated owner's `DONE` |
| S7. The Lead on Sonnet at `xhigh` | Pass | Every main-session request: `claude-sonnet-5-5`, `xhigh` |
| S8. The Designer as `aether:designer` on Opus at `max`, with 1-hour cache writes | Pass | One Designer; every request `claude-opus-5-5`, `max`; 1-hour cache writes present |
| S9a. The guard lets the Designer write the spec | Pass | The Designer wrote `docs/superpowers/specs/2026-10-08-reading-list-design.md` and committed it (`7c62eda`) |
| S9b. The guard refuses the Lead | Pass | The probe's Write was refused: "PreToolUse:Write hook error: In Aether mode only the Designer writes specs and plans…" |
| S10. `SendMessage` resumes the Designer | Pass | Two `SendMessage` calls; the same Designer went on after each |
| S11. `aether-voice` gives the Designer the owner's words | Pass | `aether-voice --session <the Lead's id>`, whose output holds the owner's first message |
| S12. No advisor call | Pass | No `server_tool_use` named `advisor` in any transcript |
| S13. The hand-off follows the owner's confirmation | Pass | The first Agent call to `aether:designer` answered "Sí, lo confirmo así. Pásaselo al Designer." |

The [conversation](lead-designer-smoke/results/run2-conversation.json) ran as the spec describes:
1. **The Lead understood the request.** It explored the empty repository and wrote back its understanding, keeping what the owner said apart from its assumptions. It took the owner's corrections, and the owner confirmed.
2. **The hand-off and the relay.**
   - The Designer proposed approaches, and the Lead showed them "tal cual".
   - The owner chose one, and the Lead sent the choice on with `SendMessage`.
   - The Designer presented the full design. The owner approved it, and the Designer wrote and committed the spec.
3. **The probe.** After `DONE`, the Lead tried the probe's write, and the guard refused it.

## Cost and time

| | Value |
|---|---|
| Session cost (Claude Code's `total_cost_usd`) | **$4.41** |
| Lead, Sonnet 5.5 | $0.43 |
| Designer, Opus 5.5 | $3.98: 128,321 output tokens, 1.21M cache reads, 147K cache writes |
| Simulated owner (outside the system) | $0.12 |
| Wall time | 23 min 11 s |

**Observations:**
- **The Lead is cheap.** Its turns cost cents. Most of its 9 turns took under 20 s; the first, which explored the repository, took 52 s.
- **At `max`, the Designer is thorough and expensive.** It wrote 128K output tokens, and a 437-line spec for a small CLI ([here](lead-designer-smoke/results/run2-designer-spec.md)). Most of the session's cost is its output. Trial 3 compares this with an Opus main session that designs itself.
- **The relay was verbatim,** as the bootstrap asks. The Lead framed each round in one line, then quoted the Designer.

## Cleanup

The fixture `~/.cache/aether-smoke-ld` and its `~/.claude/projects/` folders were deleted after the runs.
