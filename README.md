# Aether Plugin

<!-- hero: the mascot animation goes here -->

A plugin for Claude Code that adds an opt-in **Aether mode**: an accountable orchestrator, the Lead, that turns the owner's intent into a reviewed spec and plan, builds it with a parallel swarm of agents and with the other coding plans the owner pays for, and reports in one brief. The Lead writes the owner's intent card and launches `/aether:design`, which runs the Writer and the Judge on their own until the spec, the plan and the tasks are approved; then the Lead builds the plan itself, through delegate tasks, or with the swarm in parallel. Plain `claude` stays normal mode.

Version 0.11.0 ([changelog](docs/changelog.md))

Aether serves five goals, **RADAR**:
- **Rápido** (fast): fast, cheap models do the bulk of the work, and nothing iterates without end;
- **Autónomo** (autonomous): the owner is not asked about trivial things, and every irreversible step reaches them in one list;
- **Delegación** (delegation): work goes to other coding harnesses (agy, Codex, Grok, Cursor) while their quota lasts;
- **Asequible** (affordable): each role runs on the cheapest model and effort that does it well;
- **Robusto** (robust): quality code, checked by tests, evidence and independent reviews.

## Requirements

- Claude Code 2.1.294 or later;
- Node.js 22;
- git 2.36 or later;
- for lanes, the CLI of each harness you turn on: `agy`, `codex`, `grok` or `cursor-agent`.

## Install

```
claude plugin install aether --marketplace DarkArty07/aether-plugin
```

Add `--config lanes=true` to turn the lanes on (`lanes`, off by default; see [Options](docs/guide/options.md#options), which has the plugin's four options and how to set them).

## First start

Aether mode is chosen per session:

```
claude --agent aether:lead --effort xhigh
```

The Lead is the agent `aether:lead`, which starts on Sonnet; `--effort xhigh` sets its effort, because a plugin cannot. In a clone of this repository, `scripts/aether-lead` runs that command for you, with permissions bypassed and with aether-guard refusing an irreversible command that no grant covers.

Plain `claude` is the normal mode, and the plugin is dormant there, unless the repository sets the agent: put `{ "agent": "aether:lead", "effortLevel": "xhigh" }` in its `.claude/settings.local.json`.

Then tell the Lead what you want. [Start](docs/getting-started.md#start) has the launcher in full, and [Getting started](docs/getting-started.md) what happens to your first request.

## Where to go

- [Getting started](docs/getting-started.md): the install, the first start, and what the Lead does with your first request.
- [Purpose](docs/purpose.md): why Aether exists, the five goals of RADAR and the principles it follows.
- [Methodology](docs/methodology.md): the roles, the three paths and the swarm, from your request to a merged result.
- [Documentation](docs/index.md): every guide, the reference, the changelog and the design record.

## License

Aether Plugin is open source under the [MIT License](LICENSE). The implementer, supervisor and reviewer agents adapt prompt templates of [superpowers](https://github.com/obra/superpowers), the Aether preset adapts [GitHub Spec Kit](https://github.com/github/spec-kit)'s templates, and several pieces port ideas from [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode), all under the MIT License; [`plugins/aether/NOTICE`](plugins/aether/NOTICE) has the details. The plugin directory carries its own copy of the license.
