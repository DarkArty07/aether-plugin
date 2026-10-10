# Handoff: take the LLM out of Aether's `ops` calls

- **Date:** 2026-10-10
- **From:** the Lead (Claude Sonnet, an Aether session) and the owner, DarkArty07. The owner writes Spanish; code and documents in this repository are English.
- **To:** a cloud agent. It sees only this repository on GitHub, so everything it needs is here. The Lead's local memory and scratch files are not available to it.
- **Repository state:** `main` at the commit that adds this file. Plugin version **0.7.0** (`plugins/aether/.claude-plugin/plugin.json`). The 0.7.0 work ("installable plugin for anyone") is merged and tagged: `aether--v0.6.0` and `aether--v0.7.0` are on origin. It is **not published as a release and not installed** by the owner yet.

## 1. The task, in one paragraph

Aether's swarm workflow runs every `aether-wt` and `aether-lane` command through a Haiku "ops" subagent whose only job is "run this exact command with Bash and return its output". In the last run, 71 of 100 agents were these couriers. They cost almost nothing in dollars, but they **refuse** to run mutating commands intermittently (9 of 22 in one launch), and a refused merge blocks a unit and cascades. The owner's words: *"para qué gasta un LLM si solo ejecutan un comando, un script perfectamente lo podría hacer"*. Make those calls run **without a model**, with the existing model path kept as the fallback.

## 2. Constraints from the owner (read first)

- **No swarm runs.** The owner's compute window is spent. Do not launch `aether:run`, do not make paid model calls. Everything below is doable with unit tests, `claude plugin test`, and a local fake model.
- **Bounded change.** One mod file, one small pure parser, tests, docs. Do not touch the workflow's logic, the agents' prompts or the bins, except in the fallback list of §7.
- **Never push to `main`, tag, publish or make the repository public.** Work on a branch (`feature/ops-in-mod`) and open a pull request. The owner merges.
- **Do not rewrite the ops prompt to claim authority.** The refusal is a harness safeguard; the fix is to take the model out of deterministic commands, not to argue with it.
- **Never run `claude` against a real `~/.claude`.** Use a scratch `CLAUDE_CONFIG_DIR`, a fake model on a port you let the system choose (bind port 0), and throwaway clones.
- Secrets: none belong in the repository.

## 3. Evidence (run `20261009-181450-2c4e`, two launches, 49.5 minutes)

| Role | Agents | Cost at list price | Notes |
|---|---|---|---|
| `aether:ops` | **71** | US$ 0.06 (0.5 %) | 133 requests |
| `aether:implementer` | 12 | US$ 6.38 | Sonnet `xhigh` on acceptance probes is US$ 5.57 of it |
| `aether:supervisor` | 16 | US$ 2.84 | |
| `aether:reviewer` | 1 | US$ 1.28 (+ US$ 1.03 on a lane) | |

The 71 `ops` agents were: **36** for merges and closes (16 `aether-wt merge`, 16 `aether-wt remove`, 4 retries named `close again`), **31** only because of lanes (6 `aether-lane status`, 12 `start`, 13 `wait`), **4** for `aether-wt diff --final` and `aether-wt sweep`.

**Refusals.** Launch 1 was started from the owner's message "aderlante implementa". The harness gave every ops agent a first message `[Workflow harness — user request] … the only user voice in this task … aderlante implementa`, then the computed task marked "carries no user authority". It refused **9 of 22** mutating calls: 1 of 9 merges, 4 of 9 closes, and all 4 `close again` retries. Each refusal quotes that relayed sentence ("does not clearly ask for a merge", "does not ask to remove a worktree"). The final cleanup sweep removed the 4 leftover worktrees, so only the merge of one unit blocked, and its 7 dependents were skipped. Launch 2 was started from a turn a background notification triggered, so **no user request was relayed**, and it refused **0 of 15**. The correlation suggests the refusals follow the relayed sentence; it is not proven. Earlier runs: 5 of 13 ops calls refused (lanes plan run), 3 of 9 merges (0.5.0), 0 of 6 (0.6.0).

**Other findings from the same data**
- Per-hop courier latency is about 3–5 s (`remove`, `diff --final` and `sweep` take 3–4 s). A merge averages 26 s because it runs the test suite. Lane `wait` calls are 27 of the 38 agent-minutes of ops: an agent blocked on an external process.
- `ops()` in the workflow reports a refusal as `unreadable output from <command>: Not run. …`, which hides the cause. That message is Aether's, and it is a bug of its own.
- The per-unit `close` is redundant: the final `cleanup` sweep removes whatever is left, and it did.
- GitHub issues #2 and #4 on this repository track the same problem ("structural fix is sub-project 2: run the deterministic commands in code").

## 4. Why the design had no exit

A workflow script (Claude Code 2.1.296) has only `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()`, `args`, `budget` and `workflow()`. It has no shell, no filesystem and no Node API. The only way a workflow can run `aether-wt merge` is an agent with the Bash tool. Aether made that agent as dumb as it could (`plugins/aether/agents/ops.md`: Haiku, effort `low`, `maxTurns: 5`), but a model still decides whether to run it.

**Where the code is**
- `plugins/aether/workflows/run.workflow.js`:
  - `OPS_SCHEMA` (line ~84): `{ exitCode: integer, stdout: string }`, both required.
  - `opsPrompt(command, { payload, long })` (~199) builds the message. Shape, in order: `Run this command with the Bash tool, once, exactly as written[, with the Bash tool's timeout set to 600000]:`, a blank line, `cd '<repoRoot>' && <command>`, a blank line, `Then return its exit code and its complete standard output …`; and, for a lane start, a marker line `=== aether-lane payload: <path> ===` followed by the lane's prompt text (data, never a command).
  - `ops(command, …)` (~220) calls the agent with `schema: OPS_SCHEMA`, takes the **last line of `stdout` as JSON** and returns it (or `{ error }`).
  - Call sites: `aether-lane status <run>` (~272), `aether-lane start|wait|result|stop <run> <id> …` (~304–341), `aether-wt merge <run> <unit>` (~696), `aether-wt remove <run> <unit> [--keep-patch]` (~718, retried at ~720), `aether-wt diff <run> --final` (~738), `aether-wt sweep --run <run>` (~774, retried at ~776).
- `plugins/aether/hooks/register.js` is the plugin's mod (the usage meter). It already receives every `agent.spawn` and `turn.step`, keeps `state.agents[agentId] = { type, description }` for Aether sessions, parses the ops prompt's payload marker (`lanePayload`) and saves the lane prompt itself with `$.fs.write`. A session is "Aether" only when its Lead started it (`classic.SessionStart` with `agent_type === 'aether:lead'`) or a marker file exists; `aetherSession($)` gives that state.
- The bins are `plugins/aether/bin/aether-wt` and `aether-lane` (Node scripts with a shebang).

## 5. What the platform allows (verified in the type declarations; re-fetch to confirm for your build)

Source: `https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts` (about 500 K characters; the copy Claude Code writes to a mod's `.claude-plugin/types/claude-code/index.d.ts` in an interactive `--plugin-dir` session wins when they differ). Quotes, as of 2026-10-10:

- **`turn.step` can answer a step alone.**
  > `return yield* next(e)` passes; `for await (const c of next(e)) yield f(c)` transforms; **yielding without `next` answers alone.** A chunk yielded stays: a hook that fails mid-stream is left, the rest from beneath it.
  >
  > A hook that yields its own response has none [no `engine` chunk] to yield, and the engine supplies what the response needs around the chunks it does yield.
- **The chunks** (all may carry an optional `ref`; a chunk built afresh has none "and is taken at its word"):
  - `{ kind: 'tool', index, id, name }`: "A block whose `tool` chunk never comes out of the chain is no tool call: the engine records none and runs none."
  - `{ kind: 'input', index, json }`: "The arguments the tool runs with are the pieces concatenated and parsed once the block ends."
  - `{ kind: 'stop', stopReason, usage }`: "The last chunk of one response". `stopReason` is `'end_turn' | 'tool_use' | … | null`; `usage` may be `null`.
  - `{ kind: 'text', index, text }` and `{ kind: 'thinking', index, text }`.
- **`TurnStepInput`** has `turnId`, `index`, `model`, `effort?`, `messageCount`, and `agentId?` ("a subagent's id … absent on main"); the transcript is not on it.
- **`agent.spawn`**: input has `prompt`, `description`, `subagentType`, `model`, `background`, `cwd` (and, in this repo's measurements, `workflow: { runId, agentIndex }`); `next(e)` resolves to `{ model, agentId }`, or the hook returns `{ deny: reason }`. The `agentId` matches the one `turn.step` carries.
- **`$.process.run(argv, { cwd, env, stdin, timeoutMs })`** → `{ exitCode, stdout, stderr }`:
  > Runs a command on the host by its argument vector (no shell) … One shot … Rejects when the command cannot start or is still running then. **Git runs with repo hooks off.** … timeout 30 s by default, ten minutes at most. … Commands on the host, run as the user the session runs as. CLI only.
- **Limits:** a hook's own execution time is 10 s "not counting time inside `next` or a mods API call other than `$.clock.sleep`", so a long `$.process.run` does not count; a `.catch` handler gets 1 s.
- **Static analysis** (`claude plugin validate --strict`): write each call in full (`$.process.run(...)`), never pass `$` to an imported function or a function defined inside the hook, event names are string literals, imports only by relative path inside the plugin directory, and every gating hook has a `.catch`.
- The workflow harness tells subagents that computed task text "carries no user authority". That is Claude Code's behaviour and the origin of the refusals.

## 6. Proposed change (approved in principle by the owner; the Lead presented it and the owner then asked for this handoff)

1. **`plugins/aether/hooks/ops-command.js` (new, pure, no `$`)**: `parseOpsPrompt(prompt)` returns `{ cwd, bin, args, timeoutMs, payload? }` or `null`. Strict allowlist:
   - first line is exactly the two forms `opsPrompt` produces (with or without the 600000 timeout), then `cd '<absolute path with no quote>' && aether-wt|aether-lane <subcommand> <tokens>`;
   - subcommands: `aether-wt` `merge | remove | sweep | diff` (with `--final` only for `diff`); `aether-lane` `status | start | wait | result | stop | design …` only if a call site needs it (check `lane-design.js`);
   - every token matches `^[A-Za-z0-9._:=@/-]+$`; the command line is the only thing parsed, never the text after the payload marker;
   - anything else, including a second `&&`, `;`, `|`, `$`, a backtick, a quote or a redirect: `null`.
2. **`plugins/aether/hooks/register.js`**:
   - in `agent.spawn`, for `subagentType === 'aether:ops'` in an Aether session, parse the prompt and store the result in `state.agents[agentId].ops` (after `next(e)` resolves the id, as the code does now);
   - in `turn.step`, when `e.agentId` has a stored parsed command and this is the agent's first step: run `$.process.run([<$.plugin.root>/bin/<bin>, ...args], { cwd, timeoutMs })`, then **yield** a `tool` chunk named `StructuredOutput` (verify the exact name), an `input` chunk whose `json` is `JSON.stringify({ exitCode, stdout })`, and a `stop` chunk with `stopReason: 'tool_use'`; return a `TurnStepResult`-shaped value;
   - on any parse miss, any throw, or a non-Aether session: `return yield* next(e)` exactly as today (the Haiku ops path). Record nothing in the usage meter for the model-less step.
3. **Gating:** only sessions the Lead marked as Aether, only `aether:ops`, only when the parser accepts. Keep the `.catch` on every hook.
4. **Docs:** a decision row (the next free `A` number in `docs/decisions.md`), the verified facts as new rows after F23 in `docs/claude-code-research.md`, and one README line under Lanes/How it works: the mod answers `ops` calls itself, the model path stays as a fallback, and a user whose organization blocks mods or `$.process` falls back to it.

**Impact (already weighed):** ~71 fewer model agents per run; the refusal class disappears for the commands the parser accepts; US$ 0.06 saved per run (not the point); about 3–5 s per hop; the mod's declared capabilities now include `process.run`, which anyone installing the plugin will see, and a managed policy can refuse it (then the model path runs); the `no user authority` safeguard no longer applies to these commands, and the controls are the closed list, the Aether-session mark, and the owner's start of the run.

## 7. Plan

1. **Spike first (throwaway, outside the repository).** A scratch plugin with a two-hook mod, a scratch `CLAUDE_CONFIG_DIR`, and `tests/fixtures/fake-model.js` (binds port 0; see `tests/fake-model.test.js` and `docs/evaluations/2026-10-09-installable/A2-start.md` for how the acceptance probes drove `claude -p` against it). A three-line workflow that spawns an agent with `agentType: 'aether:ops'`-like prompt and `schema: { exitCode, stdout }`. Answer: does yielding `tool`+`input`+`stop` from `turn.step` make `agent()` return `{ exitCode, stdout }` with no model request; does the agent end; does a 2-minute `$.process.run` survive; what is the real name of the structured-output tool. Write the findings down (they become the research rows).
2. If the spike passes: TDD the parser (`tests/ops-command.test.js` with injections and every real command form from §4), then the mod change with `claude plugin test` (`plugins/aether/hooks/usage.test.ts` is the model), then `npm run check` (unit tests, mod tests, both manifests strict).
3. **One real mini-run without a swarm:** in a throwaway git repository, run the real `aether-wt` through the mod path and through the fallback, and compare their output.
4. Pull request from `feature/ops-in-mod` to `main`. Describe what was measured, what is still unverified, and the capability change for the README.
5. **If the spike fails:** do not invent. Implement the partial reductions that need no mod, each in `run.workflow.js` with its test, and report: drop the per-unit `close` and keep only the final sweep (it removed those worktrees in the last run); drop the `close again` retry (4 of 4 retries were refused too); turn a model's "Not run" reply into an explicit `{ error: 'refused: …' }` instead of `unreadable output`; merge a lane's `start` and `wait` into one blocking call if `aether-lane` can do it. That takes about 71 agents to about 30.

## 8. How to run things

- Unit tests: `npm test` (Node 22, `node --test "tests/*.test.js"`, no dependencies).
- Mod tests and manifests: `npm run test:mod`, `npm run validate`; all of it: `npm run check`. They need the `claude` CLI (2.1.294 or later; measured on 2.1.296). Without it, `npm test` still runs.
- Run a branch's bin by path, not from the PATH: `node plugins/aether/bin/aether-plan check <plan>`.
- The project's conventions are in `README.md` ("Development"), decisions in `docs/decisions.md`, facts about Claude Code in `docs/claude-code-research.md`, and the design of what is merged in `docs/superpowers/specs/2026-10-09-installable-plugin-design.md`. Acceptance evidence of the merged work is in `docs/evaluations/2026-10-09-installable/`.

## 9. Context that is not in the code

- **Done:** the merge to `main`, and the tags `aether--v0.6.0` and `aether--v0.7.0`, pushed on 2026-10-10 at the owner's word.
- **Waiting for the owner, on their machine (not yours to do):** their own switch from the old fish launcher to the marketplace install (README "Upgrading from 0.6"), and `/advisor off` if an advisor is configured. Do not tag again, and do not move or delete these tags.
- **Open GitHub issues** #1–#7 on this repository are the project's backlog. #2 and #4 are this task. #7 (the lane's idle notice counted as a failure) is fixed in 0.6.0. The 8 successful real agy lane calls of run `20261009-181450-2c4e` (Gemini 3.8 Flash and Sonnet) showed no false failure, which is live evidence for it; the other 4 ended on a real quota limit. It can likely be closed with that evidence, which is the owner's call.
- **Deferred minor findings of the 0.7.0 final review:** the mod and `dataDir()` are two implementations of the data-directory rule (a symlinked `~/.claude` could make `aether-report` say "no usage recorded"); the A8/A16 rows of `docs/decisions.md` join old and new text without a full stop; the README says "first message" where the measurement is `messages[1]`; installing prints "1 userConfig option not yet set" for `lanes` although it defaults to false; a pinned marketplace `ref` change was fetched only by a session with network traffic on.
- **Bigger proposals, not started:** the 19.8 KB session bootstrap reaches the Lead as a 2 KB preview plus a file path (Claude Code 2.1.296), so a fresh Lead knows its rules only by opening that file; warn when an advisor is configured; hide `aether:run` and `aether:swarm` from normal sessions; a macOS CI run once the repository is public; a script that moves the 0.6.0 history into the new data directory.
- **Known defect, not fixed:** `aether-lane design start --cwd <dir>` runs `git rev-parse` in the process's working directory instead of `<dir>`, so it exits 1 from a shell that is not inside a repository.
- Lanes (agy as an external harness) are Linux-only and off by default for third parties; Gemini 3.8 Flash serves Haiku-tier implementers.
