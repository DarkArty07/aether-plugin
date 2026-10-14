# Acceptance R16 of spec 003: the Lead's first message carries the bootstrap's opening

- **Date:** 2026-10-14 (about 00:58 to 01:01 local)
- **Claude Code:** `claude --version` gives `2.1.299 (Claude Code)`
- **Tree under test:** this worktree at `12d8969` (fast-forwarded from `e3e85b8` with `git merge --ff-only 12d8969`), loaded with `--plugin-dir <worktree>/plugins/aether`
- **Scratch directory:** `/tmp/aether-r16-ld9tWa` (`<S>` below), from `mktemp -d` under `/tmp`; `CLAUDE_CONFIG_DIR` at `<S>/cfg`; the session's cwd was `<S>/work`, an empty git repository
- **Method:** as in `docs/evaluations/2026-10-09-installable/A2-start.md`: the fake model of `tests/fixtures/fake-model.js`, one session, no paid call, nothing reached a real model.

## Set-up

- `<S>/script.json`: one rule, `[{"match":"ACCEPT-R16","replies":[{"text":"ok"}]}]`.
- `node tests/fixtures/fake-model.js --out <S>/fake --script <S>/script.json` in the background. `<S>/fake/port` held `35409`; `ss -ltnp` showed the `node` process (pid 1024149) on `127.0.0.1:35409`. This version of the fake model writes no `pid` file, so the pid came from `ss`.
- The session ran from a script (`<S>/run.sh`, because the sandbox of this task refuses a long inline `env`/`sh -c` line) that did, in order: `unset CLAUDECODE CLAUDE_CODE_SESSION_ID`, exported `CLAUDE_CONFIG_DIR=<S>/cfg`, `ANTHROPIC_BASE_URL=http://127.0.0.1:35409` and `ANTHROPIC_API_KEY=fake-key-for-local-model`, `cd <S>/work`, then:

  ```
  exec timeout 120 claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh -p ACCEPT-R16
  ```

## What was found

Exit 0, standard output `ok`. The fake model logged one request:

```
{"n":1,"model":"claude-sonnet-5-5","effort":"xhigh","first":"\n\n\nACCEPT-R16","k":0,"reply":"text"}
```

Request 1 is the first (and only) one whose first user message holds `ACCEPT-R16` (`messages[0]`). The text that holds `Aether mode is active` is `messages[1].content[0]`, a `system`-role message of 13,559 characters (13,585 bytes), which also carries the environment block, the agent listing and the skill listing of Claude Code. It is saved as it reached the model in `first-message.txt`, next to this file.

1. **Preview, not full.** The hook's context was too large to inline. Claude Code saved it and the message holds:

   ```
   SessionStart hook additional context: <persisted-output>
   Output too large (27.6KB). Full output saved to: <S>/cfg/projects/-tmp-aether-r16-ld9tWa-work/<session>/tool-results/hook-<id>-1-additionalContext.txt

   Preview (first 2KB):
   Aether mode is active.

   # Aether mode
   (the rest of the 1,947 bytes)
   ...
   </persisted-output>
   ```

2. **Size.** The persisted file was 28,387 bytes (shown as 27.6KB). The preview, the text between `Preview (first 2KB):` and the closing `...`, is **1,947 bytes** (1,947 characters), and the saved file starts with exactly that text.
3. **What the preview holds:**

   | Looked for | In the preview |
   |---|---|
   | `Aether mode is active` | yes (its first line) |
   | `Read this whole bootstrap before you act` | yes, with the instruction to Read the saved file in full when the bootstrap reached the Lead as a preview |
   | The three paths: `Direct`, `Delegate task`, `Swarm` | yes, all three, each with its one-line rule |
   | `model` | yes (`on the model and effort you choose for it`, `/model`, `never let a subagent inherit it`) |
   | `${CLAUDE_PLUGIN_ROOT}` | absent |

4. **The plugin root.** In the saved file `${CLAUDE_PLUGIN_ROOT}` (and the bare name `CLAUDE_PLUGIN_ROOT`) is absent, and the plugin's real path appears:
   `<worktree>/plugins/aether/config/models/models.json` and `<worktree>/plugins/aether/config/prices.json`. The `## Models` section starts at byte offset 7,159 of the saved file, past the preview, which is why the preview ends before it and the path is only in the file.

Also seen: the agent listing of the same message has `aether:examiner`, `aether:implementer`, `aether:judge`, `aether:ops`, `aether:reviewer`, `aether:supervisor` and `aether:writer`, and no `aether:lead`; the model was `claude-sonnet-5-5` at `xhigh`.

## Cleanup

- Stopped the fake model: `kill 1024149`; afterwards `ps -p 1024149` found nothing and `ss -ltn` showed nothing on `:35409`.
- Deleted `rm -rf /tmp/aether-r16-ld9tWa` (`fake`, `cfg` with its projects and plugin data, `work`, `script.json`, `run.sh` and the outputs). `ls -d /tmp/aether-r16-*` then found nothing.
- Outside `<S>`: nothing to delete. `ls ~/.claude/projects` was the same before and after the session, and `~/.grok` (which existed before the run) had no entry changed by it. Everything the session wrote went under `CLAUDE_CONFIG_DIR`, inside `<S>`.

Result: PASS
