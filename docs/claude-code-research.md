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

## Phase 0 findings (2026-10-07)

Measured on Claude Code 2.1.293 with a throwaway plugin. The tests ran headless sessions (`claude -p`) with Haiku as the main model and bypassed permissions. The plugin was deleted afterwards. Each finding answers one of the questions S1–S6 in the [design spec](superpowers/specs/2026-10-07-aether-plugin-design.md#13-scope-and-phases), or is new.

| Question | Result |
|---|---|
| Are dynamic workflows available? (new) | **Not by default on this plan.** No `Workflow` tool, no plugin or project workflow commands, and no bundled `/deep-research`. The `enableWorkflows: true` setting turns them on, and passing it with `--settings` for one session was enough. |
| S1. Workflow `agent()` options | `agent(prompt, { agentType, model, phase, label, schema })` works. With `agentType: '<plugin>:<agent>'` the agent's prompt and its `tools` are applied: tools narrowed to Bash, plus `StructuredOutput` when a schema is given. An agent without `agentType` gets the full default tool set, including MCP connector tools. `parallel()` takes an array of functions that return promises. `agent()` resolves to `null` on a terminal failure and may reject. |
| S1. Subagents through the Agent tool | Plugin agent definitions apply `model`, `effort`, `tools` and the prompt body. |
| S2. Plugin `bin/` on `PATH` | Yes, for subagents and for workflow agents. |
| S3. `turn.step` | Fires for the main session, subagents and workflow agents. The event carries `turnId`, `index`, `model`, `effort`, `messageCount` and, for agents, `agentId`. The result's `usage` has `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` and `model`. |
| S3. Where a mod can write | `$.fs.write` to an absolute path outside the plugin works. `$.env.get('CLAUDE_PLUGIN_DATA')` returned nothing for a `--plugin-dir` plugin, so a mod needs a fixed data directory. |
| S4. Model aliases | `haiku` resolves to `claude-haiku-5-5` and `sonnet` to `claude-sonnet-5-5`, both for subagents and for workflow agents. |
| S5. SessionStart context | A plugin's SessionStart `additionalContext` and superpowers' bootstrap both reach the session. |
| S6. `finally` when the owner stops a run | Not tested: stopping a run needs an interactive session. The design does not rely on it. |
| `agent.spawn` (new) | Fires for subagents and for workflow agents (`subagentType: "workflow-subagent"` when no type is given). Fields: `tool_use_id`, `prompt`, `description`, `subagentType`, `provider`, `parentModel`, `permissionMode`, `background`, `fork`, and `model` when one is set. `next({ ...e, model })` changed a Sonnet-defined agent to Haiku, and `{ deny }` refused a spawn with the mod's message. |
| Cost accounting (new) | `claude -p --output-format json` reports `modelUsage` per model with `costUSD` and `costBasis: "list"`. The main session's cache writes were billed at the 1-hour rate. |
| MCP connectors (new) | claude.ai connector tools and instructions also reach subagents and untyped workflow agents. This adds context, and therefore cost, to every agent. |

## Plans 2 and 3 findings (2026-10-08)

Measured on Claude Code 2.1.294 while building and running the swarm. Real headless runs used throwaway fixtures that were deleted afterwards.

| Topic | Result |
|---|---|
| Workflow `meta` | `phases: [{ title, detail }]` is accepted. Each `agent()` call's `phase` places it in the progress view, and its `label` becomes the agent's `description` in `agent.spawn`. |
| Workflows under `claude -p` | The session waits for the workflow and returns its result. The output's `duration_ms` covers only the main session's turns, so time a run from outside. It waits at most 10 minutes after the last turn and then stops background work, workflows included. Trial 2's first Aether run was stopped this way during its final review. `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` waits indefinitely. |
| Workflow state on disk | Claude Code keeps each workflow's state under `~/.claude/projects/<project>/<session>/workflows/`: the script copy, the run file and the agents' metadata. This happens even with `--no-session-persistence`. `cleanupPeriodDays` governs those files, not Aether. |
| A killed session | SIGTERM to the session's process group stops its workflow too, and the script's `finally` does not run. The leftovers stay until the SessionStart sweep or a manual `aether-wt sweep --run`. |
| Mods: layout | `hooks.json` gets `"modules": ["./register.js"]`, which can sit beside settings hooks. The module is ESM and exports `register(on)`. When the plugin is loaded with `--plugin-dir`, Claude Code writes `.claude-plugin/types/` and a `tsconfig.json` into the plugin directory, so ignore both in git. |
| Mods: `turn.step` | A hook is an async generator: `const r = yield* next(e)`. `e` has `turnId`, `index`, `model`, `effort`, `messageCount`, and `agentId` for agents. `r.usage` has input, output, cache-read and cache-creation tokens and the model. It does not split cache writes by lifetime. |
| Mods: `agent.spawn` | It fires for workflow agents too, with `subagentType` set to the `agentType` (such as `aether:implementer`). `next(e)` resolves to `{ model, agentId }`, where `agentId` matches the agent's `turn.step` events. `claude plugin validate --strict` fails a gating hook that has no `.catch`. `.catch(($, e, next) => next(e))` is replay-safe. |
| Mods: API | `$.session.id()`, `$.session.version()` and `$.clock.now()` are async. `$.env.get` reads the process environment. `$.fs.write` creates directories and is not atomic. Limits: 4 MiB per file, and 10 s of a hook's own time. |
| Mods: tests | `claude plugin test <dir>` runs `*.test.ts` files with `claude-code/testing`: stubs per call or event, `mock.clock`, `mock.env`, and `$.turn.step(...)` read to its end. No session or network is involved. |
| Cost accounting | The meter's token totals match `modelUsage` exactly, model by model. Claude Code's `costUSD` uses the real cache-write lifetimes and OpenRouter's rates, with one exception found in trial 2: Sonnet 5.5 cache reads (see below). Pricing the meter's tokens with "1 hour for the main session, 5 minutes for agents" came out 3% low in the smoke run, because some agent writes are billed at 1 hour. The `-p` output's `usage.cache_creation` splits `ephemeral_1h` and `ephemeral_5m` for the main session's last turn only. |
| `claude -p` flags | `--no-session-persistence` keeps no transcript. `--max-budget-usd` caps a run's spend. `--strict-mcp-config`, with `ENABLE_CLAUDEAI_MCP_SERVERS=false`, keeps connectors out. |

## Lead and Designer findings (2026-10-08)

Facts the Lead and Designer split relies on, from Claude Code's documentation.

| Topic | Result | Source |
|---|---|---|
| Hook inputs | Hooks that fire inside a subagent receive `agent_id` and `agent_type`. `aether-guard` reads them to tell the Designer from every other agent. | https://code.claude.com/docs/en/hooks |
| Subagent fields | A subagent's frontmatter accepts `skills`, which loads the named skills into it, and `experimental.cacheTtl`, which sets the prompt-cache lifetime (`1h`). Subagents can use the Skill tool. | https://code.claude.com/docs/en/sub-agents |
| Skill model and fork | A skill's `model` applies for one turn only. `context: fork` runs the skill in a fresh context. | https://code.claude.com/docs/en/skills |
| Window and effort | `autoCompactWindow` (or `--autocompact`, or `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, from 100K to 1M tokens) sets the window at which auto-compaction runs; Aether keeps the 1M window and leaves it unset. Effort resolves in this order: an explicit choice (`CLAUDE_CODE_EFFORT_LEVEL`, then `--effort` or `/effort`), then the settings (`modelSettings`, `effortLevel`), then the model's default. A subagent's or a skill's `effort` overrides the session's level, but not `CLAUDE_CODE_EFFORT_LEVEL`. | https://code.claude.com/docs/en/model-config, https://code.claude.com/docs/en/sub-agents |
| Advisor | `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` turns the advisor tool off. Each consultation reads the whole conversation uncached, about $2.60 per call at 650K tokens on Opus. | https://code.claude.com/docs/en/advisor |

## Trial 2 findings (2026-10-08)

From the transcripts of [trial 2](evaluations/2026-10-08-trial-2.md), on Claude Code 2.1.294.

| Topic | Result |
|---|---|
| Cache lifetimes in the transcripts | Each assistant message's `usage.cache_creation` splits `ephemeral_5m_input_tokens` from `ephemeral_1h_input_tokens`. This holds for the main session and for every subagent and workflow agent, under `<session>/subagents/`. Pricing each request from them matched `costUSD` exactly for Opus and Haiku. |
| Cache lifetimes in practice | In both trial-2 sessions, every main-session cache write was billed at 1 hour and every agent write at 5 minutes. |
| Sonnet 5.5 cache reads | `costUSD` charges them at $0.20 per million tokens. OpenRouter charges $0.10 on every endpoint, Anthropic's included. Every other rate matches. The plugin follows OpenRouter, the owner's basis (A6). |
| Prompts over 200,000 tokens | `costUSD` charged them at the normal rates for Opus and Sonnet 5.5. Trial 2's normal run had 87. OpenRouter lists a long-prompt tier only for Haiku 5.5, from 100,000 tokens. |

## Effort per task findings (2026-10-08)

From the effort probe of the [effort per task plan](superpowers/plans/2026-10-08-effort-per-task.md), on Claude Code 2.1.295.

| Topic | Result |
|---|---|
| A call's effort against the agent file's | A workflow `agent()` call with `effort: 'high'` on `aether:ops`, whose file sets `low`, ran at `high`. One with `effort: 'medium'` on `aether:implementer`, whose file sets `xhigh`, ran at `medium`. |
| A call with no effort | An `aether:ops` call that named no effort ran at `low`. |
| Where the effort is recorded | Each assistant line of a workflow agent's transcript carries `effort` and `perTurnEffort`. The usage meter's agent ids are the transcripts' ids. |
| The end-to-end check | 2026-10-08: `check-effort.js` passed on a one-task swarm run of version 0.3.0. The implementer ran at `medium`, the supervisor at `xhigh`, the final reviewer at `high` and ops at `low`. The run took 1 minute and cost $0.13 at OpenRouter prices. |
| The check inside an Aether-mode session | A `claude -p` child inherits the parent's `PATH`, and a session started by `aether-mode` has `main`'s `plugins/aether/bin` first. The child then ran `main`'s `aether-plan`, which refused the new `haiku medium` Tier line. Put the branch's `plugins/aether/bin` first on the child's `PATH` (`PATH="$REPO/plugins/aether/bin:$PATH"`) when the check runs from such a session. |

## Lanes findings (2026-10-08)

From the verification run for the [lanes spec](superpowers/specs/2026-10-08-lanes-design.md): agy 1.3.2, 24 calls in throwaway directories, and Claude Code's mod API types.

| Topic | Result |
|---|---|
| Quota | `agy -p "/usage" --output-format json` costs no tokens. `command.data.groups[]` holds each group's `name` and `buckets`, and each bucket its `window` (`5h` or `weekly`), `remaining_fraction` and `reset_time`. The groups are "Gemini Models" and "Claude and GPT models". The meter is coarse: about 170K tokens of small Gemini calls did not move it. |
| Results | The JSON holds `status`, `response`, `usage` (`input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens`, `total_tokens`), `conversation_id` and `duration_seconds`. With `--json-schema`, `structured_output` holds the object, and it works together with file edits. `input_tokens` excludes cache reads, and usage is cumulative per conversation. |
| Failures | `status` and the exit code are not enough. A print timeout and a missing `--conversation` both exit 0 with `SUCCESS`; only stderr, an empty `response` or another `conversation_id` shows them. An invalid model exits 1 with `ERROR`, and an unknown flag exits 2. |
| Containment | `--sandbox` does not contain agy: its file tools wrote outside the working directory, with or without `--dangerously-skip-permissions`, and its terminal became read-only even inside it. Lanes do not use it. |
| Instructions | agy loads `AGENTS.md` and `GEMINI.md`, not `CLAUDE.md`, and reads a file such as a `SKILL.md` by its absolute path. |
| Concurrency | Four calls at once succeeded; more were not tried. |
| Cache | On Claude models a resumed conversation reads the cache; on Gemini it did not. |
| Waiting in Bash | A subagent's Bash call waited about 9 minutes and returned. Past the default 120 s a call moves to the background, so long calls set `timeout` explicitly. |
| Mods and workflow agents | `agent.spawn` fires for each workflow agent with its full `prompt`, which a hook can read but not rewrite. `$.process` runs host commands, and a `turn.step` hook can answer without calling the model; the mod uses both since A30 (F24 to F33). |

## Installable plugin findings (2026-10-09)

Measured on Claude Code 2.1.296 with throwaway plugins, an isolated `CLAUDE_CONFIG_DIR`, and a local fake model (`tests/fixtures/fake-model.js`) that binds port 0, so the system picks a free port; no fixed port is ever used, and no model request reaches Anthropic. Check that a port is free before binding any other local server.

| # | Fact | Source |
|---|---|---|
| F1 | `claude --agent <plugin>:<agent>` with an agent whose body is empty runs the main session on the agent's model, here Sonnet. Claude Code's system prompt stays unchanged (5,921 characters, as in a plain session), and the session keeps the same 20 tools, `Agent`, `Workflow`, `SendMessage` and `Skill` among them. | Measured |
| F2 | An agent with a body replaces the whole system prompt: 154 characters instead of 5,921. | Measured |
| F3 | An agent's `effort` frontmatter does not apply to the main session, which stays at `medium`, Sonnet 5.5's default. `--effort xhigh` sets the main session to `xhigh`, and subagents that set no effort of their own follow it. | Measured |
| F4 | `"agent": "<plugin>:lead"` and `"effortLevel": "xhigh"` in a repository's `.claude/settings.local.json` give the same session as the flags, `agent_type` included. | Measured |
| F5 | A SessionStart hook receives `agent_type: "<plugin>:lead"` when the session was started with `--agent`, and no `agent_type` without it. | Measured |
| F6 | Hooks that fire inside plugin subagents, `general-purpose` subagents and workflow agents (with an `agentType`, and without one as `workflow-subagent`) receive the session's own `session_id`. Their `agent_type` is the subagent's type. | Measured |
| F7 | `export` lines that a SessionStart hook appends to `CLAUDE_ENV_FILE` reach the Bash commands of the main session, of subagents and of workflow agents. | Measured |
| F8 | Hook processes receive `CLAUDE_PLUGIN_DATA`: `<plugins root>/data/<id>`, where `<id>` is the plugin id with each character other than a letter, digit, `_` or `-` replaced by `-`. That is `aether-aether-plugin` for `aether@aether-plugin`, and `aether-inline` for a `--plugin-dir` copy. Hooks also receive `CLAUDE_PLUGIN_OPTION_<KEY>`. Bash commands receive neither. | Measured (Bash: documented) |
| F9 | A mod loads from a copied marketplace install, as from `--plugin-dir`. In a mod:<br>- `$.env.get('CLAUDE_PLUGIN_DATA')` is `null`;<br>- `$.plugin.name` and `$.plugin.root` are properties, and the root of a marketplace install is its version directory in the plugin cache;<br>- `register(on, options)` receives the `userConfig` values;<br>- `classic.SessionStart` carries `agent_type`;<br>- `agent.offer` fires once for each agent offered, with `e.agent` such as `aether:designer`. | Measured |
| F10 | Returning `{ isOffered: false }` from `agent.offer` withholds that agent. | Documented |
| F11 | `claude plugin install <p> --config lanes=true` stores `pluginConfigs["<id>"].options.lanes = true` in user settings. Hooks then see `CLAUDE_PLUGIN_OPTION_LANES=true`, and the mod receives `{ lanes: true }`. | Measured |
| F12 | A dependency `{ "name": "superpowers", "marketplace": "claude-plugins-official" }` resolves when the root marketplace lists `claude-plugins-official` in `allowCrossMarketplaceDependenciesOn`.<br>- With the official marketplace added, the install works, and adding that marketplace even installed superpowers by itself.<br>- Without it, the install succeeds with a warning, and the plugin fails to load with `Dependency "superpowers@claude-plugins-official" is not installed — run claude plugin install superpowers@claude-plugins-official, or check that its marketplace is added`.<br>Claude Code adds the official marketplace at a user's first interactive session. | Measured (the last sentence: documented) |
| F13 | A marketplace added from a local path loads the plugin in place, from the working tree: no copy and no pin. `claude plugin marketplace add` refuses `<path>#<ref>` ("Path does not exist") and `file://…#<ref>` ("Invalid marketplace source format"). | Measured |
| F14 | A `git` marketplace with a `file://` URL and a `ref`, declared under `extraKnownMarketplaces` in user settings, is cloned at the next session start, and installs a copy of that tag into the plugin cache. Changing the `ref`, starting a session and running `claude plugin update` moved the plugin from 0.0.1 to 0.0.2 and back. The data directory survived each move. | Measured |
| F15 | `claude plugin marketplace add owner/repo#<ref>` pins a GitHub marketplace to a tag, and `claude plugin install <p> --marketplace owner/repo` adds the marketplace and installs in one command (2.1.292 or later). Removing a marketplace uninstalls its plugins and deletes their data. | Documented |
| F16 | A `--plugin-dir` copy replaces an installed plugin of the same name for that session: only the development copy's mod ran. | Measured |
| F17 | After an update, the previous version's directory stays for 14 days. A pinned `version` keeps users on it until the author changes it. Auto-update is off by default for third-party marketplaces. | Documented |
| F18 | Dynamic workflows are available on paid plans; on Pro they are turned on once, in `/config`. With `enableWorkflows: true` the `Workflow` tool is present. | Documented (the tool: measured) |
| F19 | A plugin's settings honor only `agent` and `subagentStatusLine`. A plugin cannot set environment variables, permissions, effort or the advisor. | Documented |
| F20 | The advisor is off unless the user configures it. `/advisor off` or `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` turns it off. | Documented |
| F21 | The 0.6.0 plugin, installed and enabled, in a plain session that is not Aether mode:<br>- the first message grows by 4,280 characters: "Aether mode is active", a 2 KB preview of the bootstrap (Claude Code saved the 19.8 KB context to a file), five agent lines, `aether:run` and `aether:swarm`;<br>- the system prompt and tools stay unchanged;<br>- `claude plugin details` estimates about 405 tokens always on: agents about 270, skills about 130;<br>- eight executables are on `PATH`. | Measured |
| F22 | An agent's `skills` frontmatter preloads nothing when the agent is the main session. | Measured |
| F23 | In a repository whose local settings set `"agent": "<plugin>:lead"`, the command `claude --agent claude` starts a default session: the default model, the plain system prompt, and `agent_type: "claude"`. The repository's `effortLevel` still applies. | Measured |

### Dormant footprint of 0.7.0

Measured on Claude Code 2.1.296 on 2026-10-09 (acceptance A3, `docs/evaluations/2026-10-09-installable/A3-dormant.md`). Aether 0.7.0 was installed from a throwaway clone at its tag into an isolated `CLAUDE_CONFIG_DIR`, with the fake model on `127.0.0.1`. The session ran from a plain git repository without `--agent`, so it is a normal session. `<S>` is the scratch directory, and `<S>/c` runs `claude` with `CLAUDE_CONFIG_DIR` set to `<S>/cfg` and `ANTHROPIC_BASE_URL` set to the fake model.

The commands (checks 2 to 5):

    cd <S>/work && <S>/c -p ACCEPT-NORMAL --allowedTools Write
    cd <S>/work && <S>/c -p ACCEPT-NORMAL --allowedTools Write --settings '{"enabledPlugins":{"aether@aether-plugin":false}}'
    <S>/c plugin details aether@aether-plugin
    ls <S>/cfg/plugins/cache/aether-plugin/aether/0.7.0/bin | wc -l

The first request of each of the two sessions, in characters of each field's JSON as sent:

| Part | Aether enabled | Aether disabled | Difference |
|---|---|---|---|
| `system` | 6,009 | 6,009 | 0 |
| `tools` (20 tools) | 46,677 | 46,677 | 0 |
| `messages` | 17,453 | 17,022 | +431 |

- **Where:** `system` and `tools` are identical. The 431 characters are in `messages[1]`, the entry that carries the session's opening context: the session-start context of superpowers, the environment, and the lists of agents and skills. `messages[0]`, the prompt and its reminders, is identical.
- **The lines present only with Aether enabled:** two skill entries, 429 characters of text with their line breaks (431 as JSON): `- aether:run: Aether swarm: runs a plan compiled by aether-plan in parallel waves, ...` (224 characters) and `- aether:swarm: Use in Aether mode to run an approved plan that has Aether fields as a parallel swarm ...` (203).
- **What is absent:** `Aether mode is active`, and any line for `aether:designer`, `aether:implementer`, `aether:ops`, `aether:reviewer`, `aether:supervisor` or `aether:lead`. The agent list names only Claude Code's own agents. In F21, 0.6.0 added 4,280 characters to the same first message.
- **The static estimate:** `claude plugin details aether@aether-plugin` gives `Always-on: ~100 tok`. Its inventory is 2 skills, 6 agents and 2 hooks, each skill and agent under 20 tokens always on. It lists the agents, which a normal session is not offered. The measured growth, 431 characters, is about 108 tokens at four characters a token.
- **The commands on `PATH`:** `bin/` of the installed copy holds 8 files. From the Bash tool of a normal session, `command -v` resolved all eight, `aether-autonomy`, `aether-guard`, `aether-lane`, `aether-plan`, `aether-report`, `aether-session-start`, `aether-voice` and `aether-wt`, into that directory, which was on `PATH`. The probe ran with the 0.6.0 `bin/` directory that the outer session had on `PATH` removed, because it came first and answered.
- **The data directory:** `<S>/cfg/plugins/data/aether-aether-plugin/` did not exist before the first normal session. After it, and after the disabled session, it exists and is empty: Claude Code creates the directory of each enabled plugin, superpowers' too. There is no `sessions/` and no `usage/`.
- **The hooks, run directly** with `AETHER_DATA_DIR` in the scratch directory, for a payload without `agent_type` and for one with `agent_type: "claude"`: `aether-session-start` exits 0 with no output, and `aether-guard` exits 0 with no output on a spec write. Neither writes a file.
- **The whole request body** differs by 448 characters: 431 in `messages`, and 17 in `safeguards`, where `--settings` changes the `flagSettings` path. `metadata` differs only in the session id.

## Ops without a model (2026-10-10)

Measured on Claude Code 2.1.296 for decision A30, with a throwaway plugin, an isolated `CLAUDE_CONFIG_DIR` and `HOME`, an emptied environment (`env -i`), and the fake model (`tests/fixtures/fake-model.js`) on a port the system chose. No model request left the machine. The evidence is in [the evaluation](evaluations/2026-10-10-ops-in-mod.md). "Documented" means the mod API types that `/plugin-types` writes, as published for 2.1.277.

| # | Fact | Source |
|---|---|---|
| F24 | A `turn.step` hook that never calls `next` answers a step alone. It yields `{ kind: 'tool', index: 0, id, name: 'StructuredOutput' }`, `{ kind: 'input', index: 0, json }` and `{ kind: 'stop', stopReason: 'tool_use', usage: null }`, and returns `{ turnId, index, answer: '', toolUses, stopReason: 'tool_use', usage: null }`. On the first step of a workflow agent called with a `schema`, that makes no model request. The engine runs the tool, whose result is "Structured output provided successfully", and the agent ends with no further step. `agent()` returns the object. The transcript keeps the assistant message under the agent's model, with every token count 0. | Measured |
| F25 | The structured-output tool of a workflow agent is named `StructuredOutput`. A hook that yields another name (`structured_output`) gets the tool result `<tool_use_error>Error: No such tool available: structured_output</tool_use_error>`, and the agent's next step goes to the model. | Measured |
| F26 | `agent.spawn`'s `e.prompt` is the prompt exactly as the workflow passed it. The harness adds its `[Workflow harness — computed task] … carries no user authority` frame later, in the agent's first message. `e` holds `tool_use_id`, `prompt`, `description`, `subagentType`, `provider`, `model`, `parentModel`, `permissionMode`, `background`, `fork` and `workflow` (`{ runId, agentIndex }`), and no `cwd`. `next(e)` resolved with the `agentId` before the agent's first `turn.step` in every case. That step has `index` 0 and the same `agentId`. | Measured |
| F27 | `$.process.run` does not count against a hook's 10-second budget. Commands of 150 s, 330 s and 560 s resolved, and each step was answered with the command's output. Two long calls ran at once, each in its own agent's step (the workflow ran two agents at a time on that machine). Lanes wait at most 540 s per `aether-lane wait`. | Measured (the budget rule: documented) |
| F28 | When a command outlives `timeoutMs`, `$.process.run` rejects with a `HooksError` whose message is `<plugin>: $.process.run(<argv[0]>) aborted: still running after <n>ms`. The child is killed together with its non-detached children: a grandchild meant to write a file after 25 s never wrote it. A detached grandchild (`detached: true`, stdio ignored), like `aether-lane start`'s runner, survived, and the call returned 40 ms after the direct child exited. A command that cannot start rejects at once with `failed to start: ENOENT …`: an `argv[0]` not on `PATH` (`Executable not found in $PATH`), or a `cwd` that does not exist. So does a `{ deny }` from another plugin's `process.run` hook. `node` given a script that does not exist resolves instead, with exit 1 and nothing on standard output. | Measured |
| F29 | A non-zero exit code resolves, and passes through as is (3 stayed 3). Standard output is cut at 4 MiB: a 20 MB output came back as 4,194,304 characters, and a 1 MB output came back whole. The result also carries `isStdoutTruncated` and `isStderrTruncated`, which the 2.1.277 types do not list. | Measured |
| F30 | `argv[0]` is looked up on `PATH` (`node` worked), and an absolute path to a script with a shebang runs it. The child inherits the Claude Code process's environment, not the Bash tool's, and so does everything it starts. Compared with a Bash call of the same session, it lacked what Claude Code adds to Bash commands, among them `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `GIT_EDITOR=true` and the plugins' `bin/` directories on `PATH`. It also lacks the exports a SessionStart hook writes to `CLAUDE_ENV_FILE` (F7). In the mini run, a plan whose test command needs `AETHER_LANES` passed its merge through the Bash tool, and failed it through `$.process.run` (`reason: tests`, reverted): Aether's own session-start hook exports `AETHER_LANES` that way. Shell-profile variables reach the child only when Claude Code was started from that shell; the probe started it with `env -i`, so `SHELL` and the profile's variables were missing too. `aether-wt` and `aether-lane` read none of the variables Claude Code adds, but a merge's test command and agy run in this environment, and `aether-lane status` looks for agy on its `PATH`. | Measured |
| F31 | "Git runs with repo hooks off" (documented) does not reach git started by the command. A `git commit` made by a script under `$.process.run` ran the repository's `pre-commit` hook, as it did under the Bash tool. git as `argv[0]` itself was not tried. | Measured |
| F32 | On two throwaway repositories, each with a compiled one-task run, Aether's own agent `aether:ops` ran six commands: `aether-lane status`, `aether-wt merge`, `aether-wt remove`, `aether-wt diff --final`, `aether-lane wait` of an unknown call, and `aether-wt sweep`. The mod and the Bash tool printed the same output once paths, run ids and hashes were masked, and the Bash tool's `Exit code 1` line was dropped (the mod reports that code as `exitCode`). The final tree, the worktrees, the branches and `final.diff` were the same too. The mod made no model requests for the six agents; with `$.process.run` refused, the model made 12. The same held after the review's fixes, run again. | Measured |
| F33 | A mod's capabilities come from its source: `claude plugin validate` lists `$.process.run` among the module's `calls`, and no manifest field declares it. `claude plugin install` and `claude plugin details` print the same for the plugin with and without the call. An administrator's plugin can refuse a whole module by what it calls (`plugin.register`), withhold `$.process`, or deny a call; a denied call rejects. | Measured (`validate`, `install`, `details`); documented (policy) |

## OpenRouter prices

The snapshot of 2026-10-07, rechecked on 2026-10-08 and unchanged. It covers the Anthropic endpoint, in USD per million tokens. The plugin's copy is `plugins/aether/config/prices.json`.

| Model | Input | Output | Cache read | Cache write 5 min | Cache write 1 h |
|---|---|---|---|---|---|
| Opus 5.5 | 4.00 | 20.00 | 0.20 | 5.00 | 8.00 |
| Sonnet 5.5 | 2.00 | 10.00 | 0.10 | 2.50 | 4.00 |
| Haiku 5.5 | 0.10 | 0.50 | 0.01 | 0.125 | 0.20 |
| Haiku 5.5, prompt of 100,000 tokens or more | 0.50 | 2.50 | 0.05 | 0.625 | 1.00 |

- **Sources:** `https://openrouter.ai/api/v1/models/anthropic/<slug>/endpoints`, with the slugs `claude-opus-5.5`, `claude-sonnet-5.5` and `claude-haiku-5.5`.
- **Opus fast mode:** Opus 5.5 also has a "fast" endpoint at twice these prices. The usage meter cannot tell fast-mode requests apart.
- **Gemini 3.8 Flash** (`https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints`, snapshot 2026-10-08), for lanes: input 0.75, output 3.75, cache read 0.075. Reasoning is priced as output.

## Still to verify

- Whether `agent.spawn` accepts non-Anthropic model IDs (prototype step 1).
- Whether a workflow's `finally` block runs when the owner stops the run from the interactive progress view. It does not run when the session's process is killed (2026-10-08).
- Whether `$.env.set` at `session.start` can set `ANTHROPIC_BASE_URL`.
- How to declare each model's context window in a mixed session.
- What agy prints when a quota group runs out. Lanes treat any non-clean result as a failure and read `/usage`.
- Whether agy takes more than four calls at once.
- Whether files under `~/.gemini` feed agy's context.
