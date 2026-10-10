# A4: an Aether session's guard, meter and resume

- **Date:** 2026-10-09, between 18:51 and 18:53 (UTC-6).
- **`claude --version`** (through `<S>/c`): `2.1.296 (Claude Code)`.
- **`git -C <S>/clone rev-parse --short HEAD`:** `35e7aa8`. The clone holds the throwaway tag `aether--v0.7.0`; `git tag -l 'aether--v0.7*'` in this repository prints nothing.
- **Scratch path `<S>`:** `/tmp/aether-accept-a4-rd5iBN`. Its `cfg` is the only `CLAUDE_CONFIG_DIR` any `claude` call used, through `<S>/c` or `<S>/c-net`.
- **Fake model:** `node tests/fixtures/fake-model.js --out <S>/fake --script <S>/script.json`. It bound port `44319`, chosen by the system, and `ss -ltnp` showed `127.0.0.1:44319` held by `node`, pid `4006919`, the pid in `<S>/fake/pid`.
- **K0 `stat` record, before anything else** (`stat -c '%n %Y' ~/.claude/settings.json ~/.claude/plugins/installed_plugins.json`, 18:51:34):

  ```
  /home/darkarty/.claude/settings.json 1791478083
  /home/darkarty/.claude/plugins/installed_plugins.json 1791258024
  ```

- **K0 `stat` record, at the end** (18:53:34):

  ```
  /home/darkarty/.claude/settings.json 1791478083
  /home/darkarty/.claude/plugins/installed_plugins.json 1791258024
  ```

  The two records match.

## What differed from the brief's commands

Two facts about this Claude Code version and the fake model changed how checks 1 and 3 ran. Each is shown with its evidence in the checks below. The script, the wrappers and every other command are the brief's.

1. **`-p` sessions start in auto mode here.** Auto mode drops `Agent(*)` and `Bash(*)` from `--allowedTools` as dangerous and sends the call to its classifier, which is the fake model. The fake model answers a request without tools with `ok`, not a severity, so the call is blocked and the guard is never reached. Check 1 and check 3b add `--permission-mode default` to the brief's command, which keeps `--allowedTools` meaning what the brief assumed. The literal command is run and recorded first (1a) and shows the block. This is a property of the harness, whose fake model cannot grade a classifier request, not of the plugin.
2. **The fake model matches the first user message, and a resumed session's first message is the original session's.** `tests/fixtures/fake-model.js` takes the first rule whose `match` is a substring of the first user message of the request, and the guard session's first message is `ACCEPT-GUARD`. Resuming it with `ACCEPT-RESUME` can never reach the `ACCEPT-RESUME` rule, so the brief's check 3 cannot write `bash.txt` on that session, whatever the plugin does. Check 3a records the command as written. Check 3b runs the same command on the session that check 4 produces with `/clear`: its first user message holds its `/clear` records and then `ACCEPT-RESUME`, so it reaches the rule, and the plugin's behavior on resume becomes observable. Check 3b therefore ran after check 4.

An earlier attempt of this task ran the same sequence in `/tmp/aether-accept-a4-bIS28A` and its scratch files agree with this record (same replies, same messages, same results). This file is from a second, complete run.

## Set-up

```
S=$(mktemp -d -t aether-accept-a4-XXXXXX)          # /tmp/aether-accept-a4-rd5iBN
git clone --quiet <worktree> <S>/clone && git -C <S>/clone tag aether--v0.7.0
mkdir -p <S>/fake && nohup node tests/fixtures/fake-model.js --out <S>/fake --script <S>/script.json
git init -q <S>/work
```

- `<S>/script.json` is the brief's script with `<S>` written out. `<S>/c` and `<S>/c-net` are the K4 wrappers (`chmod +x`).
- **K5, into `<S>/cfg` without `--config`:**
  - `<S>/c-net plugin marketplace add anthropics/claude-plugins-official` printed `Successfully added marketplace: claude-plugins-official (declared in user settings)`.
  - `<S>/c -p hi` (from `<S>`) ended with the fake model's `ok`. After 30 seconds `known_marketplaces.json` listed only `claude-plugins-official`. It needed `<S>/c-net -p hi`, after which it listed `aether-plugin` with `"ref": "aether--v0.7.0"` and `"url": "file:///tmp/aether-accept-a4-rd5iBN/clone"`.
  - `<S>/c plugin install aether@aether-plugin` printed `Successfully installed plugin: aether@aether-plugin (scope: user) (+ 1 dependency: superpowers)` and `1 userConfig option not yet set`. No `--config` was passed, so the lanes option is unset and lanes are off.
  - `<S>/c plugin list` showed `aether@aether-plugin`, `Version: 0.7.0`, `Status: enabled`, and `superpowers@claude-plugins-official`, `Version: 6.4.1`, `Status: enabled`.
  - `installed_plugins.json` gave `aether@aether-plugin` the `installPath` `/tmp/aether-accept-a4-rd5iBN/cfg/plugins/cache/aether-plugin/aether/0.7.0`.
  - `<S>/cfg/plugins/data/` did not exist yet.
- **The recording hook**, added to `<S>/cfg/settings.json` after the install:

  ```
  "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "cat >> '/tmp/aether-accept-a4-rd5iBN/session-start.jsonl'; echo >> '/tmp/aether-accept-a4-rd5iBN/session-start.jsonl'" } ] } ] }
  ```

## Check 1: the guard in an Aether session

### 1a: the command as written

```
cd <S>/work && <S>/c --agent aether:lead --effort xhigh -p ACCEPT-GUARD --allowedTools "Agent Write"
```

- Output: `done`. Session `267b4ebe-d000-46ab-95ec-db2451d4b000`, `source` `startup`, `agent_type` `aether:lead`.
- `ls <S>/work/docs/superpowers/specs/y.md`: `No such file or directory`.
- `fake.log`:
  - `n` 3: the Lead (`claude-sonnet-5-5`, effort `xhigh`, `k` 0) answers `Agent`.
  - `n` 4 to 13: ten requests of model `claude-sonnet-5`, no tools, effort null, whose first message starts `<transcript>` and holds the call `{"Agent":"(general-purpose): ACCEPT-SPEC"}`. They are the auto mode classifier's, in two stages of five (`n` 4 to 8 end `Respond with <severity>N</severity> ONLY ...`; `n` 9 to 13 ask for `<thinking>` and then `<severity>N</severity>`). The fake model answered each `ok`.
  - `n` 14: the Lead, `k` 1, answers `text`. `req-14.json` holds a `tool_result` with `is_error` true: `Auto mode could not evaluate this action and is blocking it for safety ...`.
- No request has the first message `ACCEPT-SPEC`: the subagent never started.
- `grep -l "only the Designer writes specs and plans" <S>/fake/req-*.json` found nothing.

This run does not reach the guard, so it proves nothing about it. The cause, from two sessions without `--agent` (so without a marker), each with `--debug-file`:

```
<S>/c -p hi --allowedTools "Agent Write" --debug-file <S>/debug-auto.log
  19: [DEBUG] Ignoring dangerous permission Agent(*) from cliArg (bypasses classifier)
  149: [DEBUG] [session-notices] advertise=false mode=auto ...
<S>/c -p hi --allowedTools "Agent Write" --permission-mode default --debug-file <S>/debug-default.log
  147: [DEBUG] [session-notices] advertise=false mode=default ...
  grep -c "Ignoring dangerous permission" -> 0
```

### 1b: with `--permission-mode default`

```
cd <S>/work && <S>/c --agent aether:lead --effort xhigh -p ACCEPT-GUARD --allowedTools "Agent Write" --permission-mode default
```

- Output: `done`. Session `98ff3837-7b85-4469-8cb1-605173a6af83`, `source` `startup`, `agent_type` `aether:lead`.
- **`<S>/work/docs/superpowers/specs/y.md` does not exist** (`No such file or directory`). `<S>/work` holds only `.git`: `docs` was not created either.
- `fake.log`:
  - `n` 17: the Lead, `k` 0, answers `Agent`.
  - `n` 18: the subagent (first message `ACCEPT-SPEC`), `k` 0, answers `Write`.
  - `n` 19: the Lead, `k` 1. `n` 20: the subagent, `k` 1. `n` 21: the Lead, `k` 1.
- `grep -l "only the Designer writes specs and plans" <S>/fake/req-*.json` found only `<S>/fake/req-20.json`, the subagent's request. Its `tool_use` is `Write` of `/tmp/aether-accept-a4-rd5iBN/work/docs/superpowers/specs/y.md`, and its `tool_result`, `is_error` true, is:

  ```
  PreToolUse:Write hook error: In Aether mode only the Designer writes specs and plans. Hand this change to the aether:designer agent (resume it with SendMessage, or start one with the spec or plan path) instead of editing /tmp/aether-accept-a4-rd5iBN/work/docs/superpowers/specs/y.md yourself.
  ```

**PASS** (1b, with the flag above; 1a recorded for the reason it was needed).

## Check 2: the meter

The session id is `98ff3837-7b85-4469-8cb1-605173a6af83`, the `session_id` of the `startup` line with `agent_type` `aether:lead` that check 1b added to `<S>/session-start.jsonl`.

- `<S>/cfg/plugins/data/aether-aether-plugin/usage/98ff3837-7b85-4469-8cb1-605173a6af83/0.json` exists, 896 bytes: `"session":"98ff3837-...","part":0,"claudeCode":"2.1.296"`, **5 entries**: 3 with `"agent":null` (the Lead) and 2 with `"agent":"a64032ad8d895a16b"`, which `agents` names as `{"type":"general-purpose","description":"write a spec"}`. Every entry has `"model":"claude-sonnet-5-5","effort":"xhigh","input":10,"output":5`.
- Command and output:

  ```
  CLAUDE_CONFIG_DIR=<S>/cfg node -e "console.log(require('<S>/cfg/plugins/cache/aether-plugin/aether/0.7.0/lib/run.js').dataDir())"
  /tmp/aether-accept-a4-rd5iBN/cfg/plugins/data/aether-aether-plugin
  ```

- When this check ran, `sessions/` held exactly two markers, `267b4ebe-...` (1a) and `98ff3837-...` (1b), and `usage/` held a directory for each. No marker was written for the sessions started without `--agent aether:lead`: the two K5 sessions and the two diagnostic runs of check 1a. At the end of the run `sessions/` held three markers and `usage/` three directories, the third being check 4's `50bbbf4d-...`.

**PASS**

## Check 3: resume

### 3a: the command as written, on the guard session

```
cd <S>/work && <S>/c --resume 98ff3837-7b85-4469-8cb1-605173a6af83 --agent aether:lead --effort xhigh -p ACCEPT-RESUME --allowedTools Bash
```

- Output: `done`.
- `<S>/session-start.jsonl` has a new line `"session_id":"98ff3837-...","agent_type":"aether:lead","hook_event_name":"SessionStart","source":"resume"`.
- The marker `<S>/cfg/plugins/data/aether-aether-plugin/sessions/98ff3837-7b85-4469-8cb1-605173a6af83.json` still exists. Its `startedAt` moved from `1791593576005` to `1791593586860`: session start rewrites the marker on resume.
- **`<S>/bash.txt` does not exist.** One request, `n` 22: the first message is `ACCEPT-GUARD`, `k` 1, answer `text`. The fake model never sees `ACCEPT-RESUME` as a first message, so it never answers `Bash`, whatever the plugin does.

### 3b: the same command on the session check 4 produced

Run after check 4, on its session `50bbbf4d-fa59-401e-8cdf-af8ef7f9e2e2`, with `--permission-mode default` for the reason in "What differed" and `< /dev/null`:

```
cd <S>/work && <S>/c --resume 50bbbf4d-fa59-401e-8cdf-af8ef7f9e2e2 --agent aether:lead --effort xhigh -p ACCEPT-RESUME --allowedTools Bash --permission-mode default < /dev/null
```

- Output: `done`.
- `<S>/session-start.jsonl` has a new line `"session_id":"50bbbf4d-fa59-401e-8cdf-af8ef7f9e2e2","agent_type":"aether:lead","hook_event_name":"SessionStart","source":"resume"`.
- **`<S>/bash.txt` holds `resume lanes=off`.** `<S>/c` unsets `AETHER_LANES`, so the `off` can only have come from the line the resume SessionStart hook appended to `CLAUDE_ENV_FILE`; without it the line would read `lanes=unset`.
- The marker `<S>/cfg/plugins/data/aether-aether-plugin/sessions/50bbbf4d-fa59-401e-8cdf-af8ef7f9e2e2.json` still exists (`startedAt` `1791593595827` before, `1791593602566` after: rewritten on resume).
- `fake.log`: `n` 23, `k` 0, answer `Bash`; `n` 24, `k` 1, answer `text`. `req-23.json`: message 0 holds the `<local-command-caveat>`, `<command-name>/clear</command-name>` and `<local-command-stdout>` records, then `ACCEPT-RESUME`, in one user message.

3a shows the resume line and the marker on the guard session, and why its `bash.txt` cannot appear. 3b shows all three observations the brief asks for on a resumed Aether session.

**PASS** (on 3b; 3a's `bash.txt` bullet cannot hold by construction of the script).

## Check 4: `/clear`, headless

```
cd <S>/work && <S>/c --resume 98ff3837-7b85-4469-8cb1-605173a6af83 --agent aether:lead --effort xhigh -p /clear
```

- Output: only a stdin warning (`no stdin data received in 3s`). The model was not called: `fake.log` stayed at 22 lines.
- `<S>/session-start.jsonl` gained two lines:
  - `"session_id":"98ff3837-...","agent_type":"aether:lead","source":"resume"` (the `--resume` itself);
  - **`"session_id":"50bbbf4d-fa59-401e-8cdf-af8ef7f9e2e2","agent_type":"aether:lead","hook_event_name":"SessionStart","source":"clear"`**.
- The marker for that session id existed straight after the command, before check 3b touched it: `<S>/cfg/plugins/data/aether-aether-plugin/sessions/50bbbf4d-fa59-401e-8cdf-af8ef7f9e2e2.json`, 77 bytes, written at 18:53:15.827 and holding `{"session":"50bbbf4d-...","startedAt":1791593595827}`. It was written 158 ms after the resumed session's own marker (18:53:15.669).
- Headless mode does run `/clear`, so this check is verifiable and is not `SKIPPED`.

**PASS**

## Check 5: stop

```
kill $(cat <S>/fake/pid)
ps -p 4006919        # no process
ss -ltnp | grep ":44319 "      # no output: the fake model is stopped
```

**PASS**

## The SessionStart lines, in order

`<S>/session-start.jsonl`, by `session_id`, `source` and `agent_type`:

```
1 267b4ebe-d000-46ab-95ec-db2451d4b000 startup aether:lead     (1a)
2 efe5ecc1-eb4c-4494-b26c-6e99d08b9724 startup -               (diagnostic, no --agent)
3 41209c6d-a14e-47ea-9e0e-75d42f6dc2d7 startup -               (diagnostic, no --agent)
4 98ff3837-7b85-4469-8cb1-605173a6af83 startup aether:lead     (1b)
5 98ff3837-7b85-4469-8cb1-605173a6af83 resume  aether:lead     (3a)
6 98ff3837-7b85-4469-8cb1-605173a6af83 resume  aether:lead     (4, the --resume before /clear)
7 50bbbf4d-fa59-401e-8cdf-af8ef7f9e2e2 clear   aether:lead     (4)
8 50bbbf4d-fa59-401e-8cdf-af8ef7f9e2e2 resume  aether:lead     (3b)
```

At the end, `usage/` held `267b4ebe-...` with 2 entries, `98ff3837-...` with 6 (`0.json` 5, `1.json` 1, the one request of 3a) and `50bbbf4d-...` with 2 (the two requests of 3b). Everything the sessions wrote went under `<S>/cfg/plugins/data/aether-aether-plugin`.

Result: PASS
