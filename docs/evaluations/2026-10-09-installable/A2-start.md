# Acceptance A2: the native start

- **Date:** 2026-10-09 (18:39 to 18:43 local, UTC-6)
- **Claude Code:** `claude --version` gives `2.1.296 (Claude Code)`
- **Tree under test:** `git -C /tmp/aether-accept-a2-vqsGji/clone rev-parse --short HEAD` gives `35e7aa8`, plugin `aether` 0.7.0, throwaway tag `aether--v0.7.0` in the clone only
- **Scratch directory:** `/tmp/aether-accept-a2-vqsGji` (`<S>` below), with `CLAUDE_CONFIG_DIR` at `<S>/cfg`
- **Shells:** bash (the `bash -c` of check 1), `fish, version 4.2.1` (the `fish -c` of check 2)
- **K0 `stat` record, before anything:**

  ```
  /home/darkarty/.claude/settings.json 1791478083
  /home/darkarty/.claude/plugins/installed_plugins.json 1791258024
  ```

- **K0 `stat` record, at the end (after the fake model stopped):**

  ```
  /home/darkarty/.claude/settings.json 1791478083
  /home/darkarty/.claude/plugins/installed_plugins.json 1791258024
  ```

  The two records match.

Every `claude` call went through `<S>/c` or `<S>/c-net`, to the fake model on `127.0.0.1`, with `CLAUDE_CONFIG_DIR` at `<S>/cfg`. Under `~/.claude/plugins`, `~/.local/share/aether-plugin` and `~/.config/fish` the only file newer than the set-up is `~/.local/share/aether-plugin/usage/6dd2c6ca-aa04-4bf0-8c52-d2ccb5494905/0.json`: the usage file of the Aether session that runs this task (that is its own session id, and the probes' sessions have other ids), not of a probe.

## Set-up

- **K1:** `mktemp -d -t aether-accept-a2-XXXXXX` gave `/tmp/aether-accept-a2-vqsGji`.
- **K2:** `git clone --quiet <worktree> <S>/clone && git -C <S>/clone tag aether--v0.7.0`. The clone's `HEAD` is `35e7aa8` and `plugins/aether/.claude-plugin/plugin.json` says `"version": "0.7.0"`.
- **K3:** the script of the brief was written to `<S>/script.json` with `<S>` literal, and `node tests/fixtures/fake-model.js --out <S>/fake --script <S>/script.json` was started.
  - `<S>/fake/port` held `42715`, so the system chose the port (port 0).
  - `ss -ltnp | grep ":42715 "` gave `LISTEN 0 511 127.0.0.1:42715 ... users:(("node",pid=3872600,fd=21))`. `<S>/fake/pid` held `3872600`, the same process.
- **K4:** `<S>/c` and `<S>/c-net` written as in the kit, `chmod +x`.
- **K5**, into `<S>/cfg`, without `--config`:
  1. `<S>/cfg/settings.json` written with `enableWorkflows` and the `aether-plugin` marketplace pointing at `file:///tmp/aether-accept-a2-vqsGji/clone` at `aether--v0.7.0`.
  2. `<S>/c-net plugin marketplace add anthropics/claude-plugins-official` gave `Successfully added marketplace: claude-plugins-official`.
  3. `<S>/c -p hi` ended with the fake model's text reply `ok`.
  4. **The marketplace was not listed.** After 30 seconds `known_marketplaces.json` held only `claude-plugins-official`. Per the kit, the session was run once more with `<S>/c-net -p hi`, and then `known_marketplaces.json` listed `aether-plugin` (`installLocation` `<S>/cfg/plugins/marketplaces/aether-plugin`). **This start needed `c-net`.**
  5. `<S>/c plugin install aether@aether-plugin` gave `Successfully installed plugin: aether@aether-plugin (scope: user) (+ 1 dependency: superpowers)` and `1 userConfig option not yet set`. That notice is expected without `--config`: the `lanes` option stays unset, so lanes are off.
  6. `<S>/c plugin list` gave `aether@aether-plugin` Version 0.7.0, `Status: enabled`, and `superpowers@claude-plugins-official` Version 6.4.1, `Status: enabled`. `installed_plugins.json` gave `installPath` `/tmp/aether-accept-a2-vqsGji/cfg/plugins/cache/aether-plugin/aether/0.7.0`.

The fake model's requests are numbered `n` in `<S>/fake/fake.log` and saved as `<S>/fake/req-<n>.json`:

| n | what |
|---|---|
| 1, 2 | the two `hi` set-up sessions |
| 3 to 49 | check 1, first attempt, with `--allowedTools` (session `a973863b`) |
| 50 to 59 | check 1, rerun with `--dangerously-skip-permissions` (session `3569fb00`) |
| 60 to 68 | check 2, from fish (session `9ac60db0`) |
| 69 | check 5, `ACCEPT-PLAIN` |
| 70, 71 | check 5, two control sessions |

## Check 1: from bash

```
cd /tmp/aether-accept-a2-vqsGji
bash -c '/tmp/aether-accept-a2-vqsGji/c --agent aether:lead --effort xhigh -p ACCEPT-MAIN --allowedTools "Bash Agent Workflow"'
```

**The first attempt was denied.** The session ran in permission mode `auto` (the transcript's `permissionMode` is `auto`). The Bash call of the script got this tool result (request 14):

```
Auto mode could not evaluate this action and is blocking it for safety — run with --debug for details. ...
```

- Auto mode's classifier sent 40 requests to `claude-sonnet-5` (first message `<transcript>...`, requests 4 to 48), which the fake model cannot answer as a classifier.
- The session still ended with `main done`, and `<S>/bash.txt` was never created.
- Its marker `a973863b-ad63-44fa-bedd-34d00fa39c94.json` was written, because it was an Aether session. This is why check 6 counts three markers, not two.
- The attempt's output is kept in `<S>/denied-run/`.

**The rerun**, as the brief says for a denied tool, with `--dangerously-skip-permissions` in place of `--allowedTools …`:

```
bash -c '/tmp/aether-accept-a2-vqsGji/c --agent aether:lead --effort xhigh -p ACCEPT-MAIN --dangerously-skip-permissions'
```

- Exit 0. Standard output: `main done` three times (the session answers again when the workflow finishes). Standard error: empty.
- The requests (50 to 59) show the script ran to the end: the Lead's Bash, `Agent` (the `ACCEPT-SUB` subagent), `Workflow` (the `ACCEPT-WF` agent), then `text`.
- `<S>/bash.txt`:

  ```
  main lanes=off plan=yes
  sub lanes=off
  wf lanes=off
  ```

PASS (with the permission fallback of the brief, recorded above).

## Check 2: from fish

```
fish -c '/tmp/aether-accept-a2-vqsGji/c --agent aether:lead --effort xhigh -p ACCEPT-MAIN --dangerously-skip-permissions'
```

The same command line as the check 1 rerun. The `--allowedTools` form was not tried again: its denial comes from auto mode and the fake model, not from the shell.

- Exit 0, standard output `main done` twice, standard error empty.
- Requests 60 to 68 follow the same script: Bash, `Agent`, `Workflow`, `text`.
- The first request (60) is, once its session id is masked, identical to the bash session's (50): the same `system`, the same `tools`, the same `messages`.
- Its marker: `9ac60db0-7280-405f-9109-2870cf59e57e.json`.
- The `Shell:` line of the environment block in the request reads `bash` in the fish session as in the bash one.
- `<S>/bash.txt` grew by the same three lines (`bash-after-check1.txt` was copied between the two sessions, so lines 1 to 3 belong to check 1 and lines 4 to 6 to check 2).

PASS.

## Check 3: the Lead's first request

The first request of the bash session whose first message holds `ACCEPT-MAIN` is request 50 (`<S>/fake/req-50.json`). The fish session's is request 60.

| | request 50 (bash) | request 60 (fish) |
|---|---|---|
| `model` | `claude-sonnet-5-5` | `claude-sonnet-5-5` |
| `output_config.effort` | `xhigh` | `xhigh` |
| `Aether mode is active` | `messages[1].content[0]` | `messages[1].content[0]` |

`Aether mode is active` is in a persisted-output preview. The hook's context is 20,382 bytes, so Claude Code saved it and put this in the message:

```
<persisted-output>
Output too large (19.8KB). Full output saved to: /tmp/aether-accept-a2-vqsGji/cfg/projects/-tmp-aether-accept-a2-vqsGji/3569fb00-.../tool-results/hook-e81faa9d-...-additionalContext.txt

Preview (first 2KB):
Aether mode is active.

# Aether mode

You are the **Lead**: ...
```

The saved file starts with `Aether mode is active.` and holds neither `Aether could not pass the lanes option` nor `Aether could not mark this session`.

The denied first attempt's first request (3) has the same `model`, `effort` and Aether context.

PASS.

## Check 4: Aether's agents are offered to the Lead

**Where the listing is.** On Claude Code 2.1.296 it is in the first message of the request: `messages[1]` of request 50, a `system`-role message of 18,916 characters, under the line `Available agent types for the Agent tool:`.

**The listing**, lines beginning `- `, in order:

```
- aether:designer: Aether Designer: writes the approaches, design, spec and plan of architectural work, ...
- aether:implementer: Aether implementer: builds one task of a compiled Aether plan in its own unit worktree, ...
- aether:ops: Aether ops: runs the one aether-wt or aether-lane command the aether:run workflow gives it, ...
- aether:reviewer: Aether final reviewer: reviews everything an Aether swarm run merged, ...
- aether:supervisor: Aether supervisor: reviews one attempt at one unit of an Aether swarm run, ...
- claude: ...
- Explore: ...
- general-purpose: ...
- Plan: ...
- statusline-setup: ...
```

- Lines beginning `- aether:designer:`, `- aether:implementer:`, `- aether:supervisor:`, `- aether:reviewer:` and `- aether:ops:` are present.
- There is no line beginning `- aether:lead:` in the listing, nor anywhere in the request's messages.
- Two more lines begin `- aether:`, `- aether:run:` and `- aether:swarm:`. They are in the list that follows, `The following skills are available for use with the Skill tool:`, so they are skills, not agents.
- The fish session's request 60 gives the same listing.

**For the record, not a pass or fail:** the `Agent` tool's description in `tools` (1,668 characters) names no `aether:` agent.

**The other direction.** The plain session of check 5 (request 69) has no `- aether:designer:` line and no `Aether mode is active`. Task 13 (A3) checks it in full.

PASS.

## Check 5: the system prompt and the tools

```
cd /tmp/aether-accept-a2-vqsGji
/tmp/aether-accept-a2-vqsGji/c -p ACCEPT-PLAIN
```

Exit 0, standard output `ok`. Its first request is request 69 (default model `claude-opus-5-5`, effort `medium`).

**The tools.** 20 in both the Lead's request and the plain one, the same names in the same order:

```
Agent, Bash, CronCreate, CronDelete, CronList, Edit, EnterWorktree, ExitWorktree, ListAgents, NotebookEdit,
Read, ReportFindings, ScheduleWakeup, SendMessage, Skill, TaskStop, WebFetch, WebSearch, Workflow, Write
```

`Agent`, `Workflow`, `SendMessage` and `Skill` are among them.

**The system text.** `system` is an array of three blocks. Compared with request 50:

| block | Lead (50) vs plain (69) |
|---|---|
| 1 (62 characters) and 2 (5,661 characters) | byte-identical: this is Claude Code's system prompt |
| 0 (74 characters) | differs only in a fingerprint: `x-anthropic-billing-header: cc_version=2.1.296.e79; cc_entrypoint=sdk-cli;` against `...296.4b6; ...` |

Two things to judge here, and both come out as not Aether:

- **The fingerprint follows the prompt text.** The two `hi` sessions (requests 1 and 2) share `406`. `ACCEPT-MAIN` gives `e79` in all three of its sessions (3, 50, 60). `ACCEPT-PLAIN` gives `4b6` on two different models (69, 70).
- **The `Bash` tool description follows the model.** It is 1,406 characters for the Lead's `claude-sonnet-5-5` and 1,096 for the plain session's default model, because the Sonnet one carries an extra "Avoid using this tool to run `cat`, `head`..." paragraph. The names and schemas are equal.

Two control sessions, run after the check and not counted in it:

| session | request | model, effort | result against the Lead's request 50 |
|---|---|---|---|
| `-p ACCEPT-PLAIN`, with `--model claude-sonnet-5-5 --effort xhigh` | 70 | `claude-sonnet-5-5`, `xhigh` | `tools` identical (names, descriptions, schemas); `system` blocks 1 and 2 identical; block 0 differs by the fingerprint (`4b6`) |
| `-p ACCEPT-MPLAIN`, with `--model claude-sonnet-5-5 --effort xhigh` | 71 | `claude-sonnet-5-5`, `xhigh` | the whole `system` array identical (fingerprint `e79`) and `tools` identical |

So a plain session and the Lead differ in nothing that Aether adds: the system prompt is Claude Code's own, and the 20 tools are the same.

PASS.

## Check 6: the marker

`<S>/cfg/plugins/data/aether-aether-plugin/sessions/` after checks 1 and 2, and again after the plain sessions of check 5:

```
3569fb00-d442-45e7-b5bf-8364eeb4d823.json   {"session":"3569fb00-d442-45e7-b5bf-8364eeb4d823","startedAt":1791592880977}
9ac60db0-7280-405f-9109-2870cf59e57e.json   {"session":"9ac60db0-7280-405f-9109-2870cf59e57e","startedAt":1791592890090}
a973863b-ad63-44fa-bedd-34d00fa39c94.json   {"session":"a973863b-ad63-44fa-bedd-34d00fa39c94","startedAt":1791592836130}
```

- The directory name is `aether-aether-plugin`: the data directory of plugin `aether` in marketplace `aether-plugin`, under `<S>/cfg/plugins/data/`.
- **Three files, not two,** because three Aether sessions were started: the denied first attempt of check 1 (`a973863b`), the rerun of check 1 (`3569fb00`) and the fish session of check 2 (`9ac60db0`). There is exactly one file per Aether session, and one for each of the two sessions of checks 1 and 2.
- **Plain sessions leave none.** `<S>/cfg/projects/-tmp-aether-accept-a2-vqsGji/` holds eight transcripts: the three `ACCEPT-MAIN` sessions above (marker: yes) and five plain ones, two `hi`, one `ACCEPT-PLAIN` and the two controls (marker: no). The count stayed at three after every plain session.
- The usage meter agrees: `<S>/cfg/plugins/data/aether-aether-plugin/usage/` holds one directory per Aether session, the same three ids, and none for a plain session.

PASS.

## Check 7: the lanes line reaches every agent

`<S>/bash.txt` after both sessions:

```
main lanes=off plan=yes
sub lanes=off
wf lanes=off
main lanes=off plan=yes
sub lanes=off
wf lanes=off
```

- Three lines per session, as expected: the main session sees `AETHER_LANES=off` and `aether-plan` on its `PATH`, the subagent started with `Agent` sees `off`, and the workflow agent sees `off`.
- `off`, never `unset`: the lanes line reached the commands of the main session and of both kinds of agent.
- The workflow line is present in both sessions, so `<S>/fake/fake.log` did not need reading for it. For the record, the workflow agent's requests are 54 and 57 (bash) and 64 and 67 (fish), on `claude-sonnet-5-5` at `xhigh`.
- The denied first attempt wrote no line: its Bash calls were blocked.

PASS.

## Check 8: stop

```
kill $(cat /tmp/aether-accept-a2-vqsGji/fake/pid)
```

- `ps -p 3872600` before the kill showed the `node .../tests/fixtures/fake-model.js --out /tmp/aether-accept-a2-vqsGji/fake ...` process.
- After it, the process was gone and `ss -ltnp | grep ":42715 "` found nothing.
- The K0 `stat` records match (see the head of this file).

PASS.

## Observations

- **Permission mode.** `-p` sessions on this Claude Code version run in auto mode when nothing is allowed. With the fake model the classifier cannot answer, so a tool that needs a permission is denied. `--dangerously-skip-permissions` is the way these probes run scripted tools.
- **The bootstrap is persisted.** `aether-session-start` hands the Lead 20,382 bytes of context. Claude Code saves a hook context of that size to a file and puts only its first 2 KB and the path in the first message. The Lead sees `Aether mode is active.` and the start of the bootstrap, and reads the rest from the file.
- **Inherited environment.** The sessions ran as children of another Claude Code session, so variables such as `CLAUDECODE` and `CLAUDE_CODE_SESSION_ID` were in the environment of `<S>/c`, which unsets only the kit's list. The sessions got their own ids and nothing in the checks depended on those variables.

Result: PASS
