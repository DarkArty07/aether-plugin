# Aether Plugin

A spec-driven multi-agent system for software development, built as a plugin for
Claude Code. You state your intent once. A design agent clarifies it and writes the spec.
An orchestrator then runs a swarm of agents in parallel, each on the model its task
needs, and keeps you informed on Telegram.

It is the successor to [Aether Agents](https://github.com/DarkArty07/Aether-Agents):
the same method, rebuilt on a harness made for software.

## Status

Version 0.1 is in progress. The current design is
[docs/superpowers/specs/2026-10-07-aether-plugin-design.md](docs/superpowers/specs/2026-10-07-aether-plugin-design.md).
The rest of this README still records the decisions of 2026-10-05.

- Plan 1 (foundation) added plan checking, unit worktrees and their cleanup.
- Plan 2 (swarm) adds `/aether:run`. The plan's tasks run in parallel on their tiers,
  with a supervisor for every attempt, one merge at a time, a final review on Opus,
  and cleanup.
- Plan 3 (measurement and trial) is next.

## Use Aether mode

Aether mode is chosen per session. `aether-mode` loads the plugin and turns on dynamic
workflows; `claude` stays in normal mode, with superpowers alone.

In fish:

    ln -s (realpath scripts/aether-mode.fish) ~/.config/fish/functions/aether-mode.fish

In bash or zsh:

    aether-mode() { claude --plugin-dir /path/to/aether-plugin/plugins/aether --settings '{"enableWorkflows": true}' "$@"; }

Run the tests with `node --test "tests/*.test.js"`. They need Node.js 22 and no dependencies.

## Lessons from Aether Agents

The method worked: specs, exploration notes, saved learnings and visible order. The
infrastructure did not:

- Hermes, a general personal-assistant harness, offered many equivalent tools, so the
  model took a different path for the same request each time.
- Autonomy had no hard budget and no independent check of "done", and it turned into
  more than 20 hours of over-engineering.
- Blocked work failed silently: hours later the owner learned that nothing had been
  running.
- Each role had a fixed model, but critical units, especially frontend work, need a
  strong one.
- The design agent had to maintain too many separate knowledge stores.
- The Supervisor chained its tasks, so the intended swarm never ran in parallel.

## Principles

1. **Mechanism in code, judgment in the model.** Anything that must always happen the
   same way (status, waking, retries, budgets) is a hook or a script, never a prompt
   instruction.
2. **Bounded autonomy.** Every objective has a budget and a verifiable definition of
   done. When the budget runs out, the system stops and reports.
3. **The task chooses the model.** Roles set defaults; each unit's domain and risk
   select its model, and a failed review moves it up a tier.
4. **Contracts first, then the swarm.** A short sequential phase fixes interfaces and
   file ownership; parallel work runs against them. Units are independent by default,
   and every dependency needs a reason.
5. **One place per kind of knowledge.**
6. **Keep the method.** Spec Kit for specifications, Graphify for orientation,
   independent review.

## Architecture (current direction)

| Piece | Responsibility |
|---|---|
| Claude Code plugin | Agents, skills, hooks, workflows and mods in one installable package |
| Design agent | Main session (tentatively Opus): talks with the owner, clarifies the intent, writes the spec and its budget |
| Orchestrator | Orchestration in code, not an agent's turn-by-turn judgment. Current direction: a dynamic workflow script that decomposes with a strong model, runs units in parallel worktrees, reviews, integrates and reports. Agent teams are still to be evaluated |
| Model routing | Plugin mods: `agent.spawn` sets each subagent's model; `turn.step` can change it per request |
| Aether Router | Endpoint for all model traffic (`ANTHROPIC_BASE_URL`); picks provider and account by model ID and absorbs usage limits |
| Claude models | Reached through the documented pass-through: a base URL with no gateway credential keeps the claude.ai login active |
| Status | A small Telegram layer driven by hooks, for notices and monitors only |
| Knowledge | `CLAUDE.md` for how to build and test, `specs/` for what to build, auto memory for learnings |
| Runtime | Local, on WSL2 |

## Documentation

- [Aether Agents retrospective](docs/aether-retrospective.md): what Aether was, why
  each piece existed, what failed and why.
- [Claude Code research](docs/claude-code-research.md): the verified capabilities and
  limits this design relies on.
- [Decisions](docs/decisions.md): every decision so far, including the pending ones.

## Next step

A minimal prototype that proves two things:

1. A mod using `agent.spawn` sends a subagent to a non-Anthropic model through the
   router.
2. The design agent runs on Opus through the router with the subscription
   pass-through. This needs a change in the router.

## Prior art to review first

- [MartyBonacci/specswarm](https://github.com/MartyBonacci/specswarm): spec-driven
  development orchestration plugins for Claude Code.
- [kivo360/OmoiOS](https://github.com/kivo360/OmoiOS): turns specs into merged PRs with
  a swarm of model-agnostic coding agents.
