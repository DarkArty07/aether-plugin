# Claude Code research

Verified on 2026-10-05 against the official documentation at
<https://code.claude.com/docs> and, for the router, the Aether Router source at commit
`43f9915`. Local Claude Code version: 2.1.290. The maturity labels below are the
documentation's own. The documentation changes weekly, so re-check a detail before
building on it.

## Aether's problems and the matching Claude Code features

| Problem in Aether | Claude Code feature | Maturity |
|---|---|---|
| The flow changed from run to run | Dynamic workflows: a JavaScript script decides what runs next | Available |
| Behavior that must never change | Hooks: 33 lifecycle events that run scripts and can block | Available |
| Morfeo was never woken | A background subagent notifies its parent when it finishes | Available |
| Status while the owner is away | Remote Control push notifications, the Telegram channel plugin, or a hook that calls the Telegram API | Push: available. Channels: research preview |
| Autonomy without brakes | `/goal`, `maxTurns` per subagent, a cap on agents per workflow | Available |
| One model per role | A model per subagent and per invocation, chosen in code by plugin mods; the advisor tool | Advisor: experimental |
| Scattered knowledge | CLAUDE.md or AGENTS.md, and auto memory | Available |
| Release machinery and a Hermes fork | Plugins, installed with `/plugin install` | Available |
| Checking that a request always takes the same path | `claude plugin eval` | Early access |

## Orchestration

### Dynamic workflows

<https://code.claude.com/docs/en/workflows>

- A JavaScript script orchestrates subagents. `agent()` starts one, `parallel()` and
  `pipeline()` fan out, `phase()` groups agents in the progress view and `log()` prints
  a message. Intermediate results live in script variables, not in the main context.
- `agent()` can take a JSON `schema`, and the subagent then returns validated JSON (up
  to five attempts by default). A model the script names counts as the per-invocation
  model.
- Scripts are saved under `.claude/workflows/` or shipped in a plugin's `workflows/`
  directory, and run as `/<name>`.
- Runs can be resumed within the same session. `Date.now()` and `Math.random()` throw
  inside the script, so that a relaunch repeats the same calls.
- A run takes no user input once started. For a sign-off between stages, run each
  stage as its own workflow.
- Limits: 16 concurrent agents by default (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`,
  up to 256) and 1,000 agents per run.
- When an agent hits a usage limit, the run waits for the reset only in an interactive
  session signed in with a subscription. Under `claude -p`, the Agent SDK, a
  background session, Remote Control or an agent-team teammate, that agent fails
  instead.

### Subagents

<https://code.claude.com/docs/en/sub-agents>

- The frontmatter includes `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`,
  `isolation: worktree`, `memory` (`user`, `project` or `local`), `hooks`, `mcpServers`,
  `skills`, `background` and `permissionMode`.
- The model is resolved in this order: the per-invocation `model` parameter, the
  definition's `model`, `CLAUDE_CODE_SUBAGENT_MODEL`, and finally the parent's model.
  The Agent tool's `model` parameter takes the aliases `opus`, `sonnet`, `haiku` and
  `fable`.
- Subagents run in the background by default and notify the parent when they finish.
  They can nest three levels deep, with up to 20 running at once by default.
- `claude --agent <name>`, or the `agent` setting, runs the main session as that agent.

### Agent teams

<https://code.claude.com/docs/en/agent-teams>

Experimental and off by default (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).

- What we could use:
  - a shared task list with dependencies, where teammates claim tasks under a file
    lock;
  - direct messages between teammates;
  - quality hooks (`TaskCreated`, `TaskCompleted`, `TeammateIdle`);
  - teammates built from subagent definitions, each with its own model.
- Gaps:
  - teammates do not get their own worktrees;
  - in-process teammates are not restored when a session resumes;
  - one team per session, and teams cannot nest;
  - interactive sessions only;
  - task status can lag behind the real state.

### `/goal`

<https://code.claude.com/docs/en/goal>

A session-scoped, prompt-based Stop hook. After each turn, a small, fast model judges
whether the completion condition is met, not yet met, or impossible. The condition can
include a limit on turns or time, and the command works with `claude -p`.

## Models

<https://code.claude.com/docs/en/model-config>

- Aliases on the Anthropic API: `fable` (Fable 5.1), `opus` (Opus 5.5), `sonnet` (Sonnet
  5.5) and `haiku`. `opusplan` uses Opus while planning and Sonnet while executing.
- Effort ranges from `low` to `max` and can be set per subagent or per skill.
- `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU,FABLE}_MODEL` map each alias to any model ID.
- The [advisor tool](https://code.claude.com/docs/en/advisor) (experimental, Anthropic
  API only) lets the main model consult a stronger one at decision points. Claude
  decides when to consult it, and subagents inherit it.

## Plugins and mods

<https://code.claude.com/docs/en/plugins/components>,
<https://code.claude.com/docs/en/plugins/mods/reference>

- A plugin can ship skills, commands, agents, hooks, MCP servers, LSP servers,
  executables (`bin/`), workflows, output styles, themes, channels and monitors. It
  also gets a persistent data directory and `userConfig` values, whose secrets are kept
  in secure storage.
- A plugin's own `settings.json` honors only `agent`, which runs a plugin agent as the
  main session, and `subagentStatusLine`. It cannot set environment variables such as
  `ANTHROPIC_BASE_URL`.
- Mods are JavaScript hooks inside a plugin. The events that matter here:
  - `agent.spawn` fires before a subagent or teammate starts. Returning
    `next({ ...e, model })` chooses its model, and returning `{ deny }` blocks it.
  - `turn.step` can change the model or effort of each request.
  - `prompt.compose` and `prompt.section` can rewrite the system prompt.
  - `tool.describe` can make a tool deferred or eager.
  - `session.receive` and `session.send` observe messages between sessions.
- The mods API includes `$.env`, `$.http.fetch`, `$.clock.every`, `$.prompt.submit`
  (which starts a turn once the session is idle), `$.process`, `$.store` and
  `$.agent.spawn`. Each hook gets 10 seconds of its own execution time.

## Status and reachability

- **Channels** (research preview) are MCP servers that push events into a running
  session. The official Telegram, Discord and iMessage plugins are two-way and need
  Bun. Events arrive only while the session is open, and only from allowlisted
  senders. <https://code.claude.com/docs/en/channels>
- **Remote Control** drives a local session from the Claude app, with push
  notifications either "when Claude decides" or "when actions are required".
  <https://code.claude.com/docs/en/remote-control>
- **Background sessions** (research preview) start with `claude --bg` and run under a
  supervisor daemon. `claude agents --json` reports their state to scripts, and a
  session moves into a worktree before it edits files.
  <https://code.claude.com/docs/en/agent-view>
- **Cross-session messaging**: a message from another session arrives as a new turn
  once the receiving session is idle.

## Knowledge

<https://code.claude.com/docs/en/memory>

CLAUDE.md (or AGENTS.md) holds instructions that people write. Auto memory is a
`MEMORY.md` index plus one file per memory, each typed `user`, `feedback`, `project`
or `reference`. The first 200 lines or 25 KB of the index load at startup.

## Behavior evaluation

<https://code.claude.com/docs/en/plugin-evals>

`claude plugin eval` runs test cases with the plugin and against a no-plugin
baseline. Graders: `regex`, `tool_used`, `tool_order`, `file_exists`, `llm` and
`baseline`, with 1 to 50 runs per case. `tool_used` and `tool_order` can measure
whether the same request takes the same path.

## Gateways and non-Anthropic models

<https://code.claude.com/docs/en/llm-gateway>,
<https://code.claude.com/docs/en/llm-gateway-protocol>

- `ANTHROPIC_BASE_URL` applies to the whole session. There is no endpoint per agent or
  per model, so mixing providers in one session needs a single gateway that routes by
  model ID.
- Claude Code treats unrecognized model IDs as current models and assumes a
  200K-token context window unless told otherwise.
- **Subscription pass-through**: "Setting only that variable, without a gateway
  credential, doesn't replace the subscription. Requests still route through the
  gateway, but a saved claude.ai login remains the active credential, so its usage
  limits and billing apply." The gateway must forward the OAuth capability in
  `anthropic-beta`.
- "Anthropic doesn't endorse, maintain, or audit third-party gateway products, and
  doesn't support routing Claude Code to non-Claude models through any gateway."
  Routing to other models works, but it is unsupported, and new Claude Code releases
  can add request fields that the gateway must translate.
- With `CLAUDE_CODE_GATEWAY_HINT_HEADERS=1`, each request carries
  `x-claude-code-request-class` (`main`, `subagent`, `workflow`, `compaction` or
  `auxiliary`) and the agent's ID. A router can use them for routing and accounting.
- Products built on the Agent SDK may not offer claude.ai login, so this project runs
  as a plugin inside the official Claude Code.
  <https://code.claude.com/docs/en/agent-sdk/overview>

## Aether Router

The owner's local gateway, at commit `43f9915`:

- It serves Anthropic Messages (`/v1/messages`) on a loopback port and rotates
  accounts across several providers. It started as a pool of Codex accounts.
- It authenticates local clients with its proxy token, sent as a bearer token or as
  `x-api-key`.
- Its `claude-aether` wrapper proved that Claude Code can run non-Anthropic models
  through the router. The wrapper forces every agent onto the session's model, so
  that no subagent falls back to a native Claude alias. It also loads MCP tools eagerly
  (`ENABLE_TOOL_SEARCH=false`), because translated requests do not support deferred
  tools. The wrapper is not adopted.
- Changes this project needs:
  - a pass-through lane that forwards `claude-*` requests unchanged with the client's
    own login;
  - authentication of the local client through a custom header
    (`ANTHROPIC_CUSTOM_HEADERS`), because `Authorization` then carries the claude.ai
    login.

## Still to verify

- Whether `agent.spawn` accepts non-Anthropic model IDs (prototype step 1).
- Whether workflow agents fire `agent.spawn` and `SubagentStop`.
- Whether `$.env.set` at `session.start` can set `ANTHROPIC_BASE_URL`.
- How to declare each model's context window in a mixed session.
