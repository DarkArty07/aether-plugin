# Acceptance A3: the dormant normal session and its footprint

- **Date:** 2026-10-09
- **`claude --version`:** 2.1.296 (Claude Code)
- **Clone:** `git -C /tmp/aether-accept-a3-XuvEGF/clone rev-parse --short HEAD` gave `35e7aa8`, tagged `aether--v0.7.0` in the clone only
- **Scratch directory:** `/tmp/aether-accept-a3-XuvEGF`
- **`stat -c '%n %Y' ~/.claude/settings.json ~/.claude/plugins/installed_plugins.json`**
  - before anything else:
    - `/home/darkarty/.claude/settings.json 1791478083`
    - `/home/darkarty/.claude/plugins/installed_plugins.json 1791258024`
  - at the end:
    - `/home/darkarty/.claude/settings.json 1791478083`
    - `/home/darkarty/.claude/plugins/installed_plugins.json 1791258024`
  - the two records match.

## Set-up

- **K1, K2:** the scratch directory was made with `mktemp -d -t aether-accept-a3-XXXXXX`. `git clone --quiet <worktree> <S>/clone && git -C <S>/clone tag aether--v0.7.0` made the throwaway clone and tag.
- **K3:** `<S>/script.json` holds the rule of this task, with `file_path` set to `/tmp/aether-accept-a3-XuvEGF/work/docs/superpowers/specs/x.md`. The fake model of Task 7 started with `--out <S>/fake --script <S>/script.json` and bound port 37859, chosen by the system. `ss -ltnp` showed `127.0.0.1:37859` held by `node`, pid 3872282, the pid in `<S>/fake/pid`.
- **K4:** `<S>/c` and `<S>/c-net` are the wrappers of the kit, with `CLAUDE_CONFIG_DIR=/tmp/aether-accept-a3-XuvEGF/cfg` and `ANTHROPIC_BASE_URL` set to the fake model. `git init -q <S>/work` made the working repository.
- **K5, the pinned install, without `--config`:**
  - `<S>/c-net plugin marketplace add anthropics/claude-plugins-official` printed `Successfully added marketplace: claude-plugins-official`;
  - the session `<S>/c -p hi` ended with the fake model's text reply `ok`, and after 30 seconds `known_marketplaces.json` listed only `claude-plugins-official`. **It needed the second attempt:** `<S>/c-net -p hi` listed `aether-plugin` at once, with `"ref": "aether--v0.7.0"` and `"url": "file:///tmp/aether-accept-a3-XuvEGF/clone"`;
  - `<S>/c plugin install aether@aether-plugin` printed `Successfully installed plugin: aether@aether-plugin (scope: user) (+ 1 dependency: superpowers)` and `1 userConfig option not yet set`;
  - `<S>/c plugin list`: `aether@aether-plugin`, `Version: 0.7.0`, `Status: enabled`, and `superpowers@claude-plugins-official`, `Version: 6.4.1`, `Status: enabled`;
  - `installed_plugins.json` gives `aether@aether-plugin` the `installPath` `/tmp/aether-accept-a3-XuvEGF/cfg/plugins/cache/aether-plugin/aether/0.7.0`.
- **The outer environment:** the session that ran this task has `PATH` with the 0.6.0 `bin/` directory of the owner's installed copy, and `CLAUDECODE=1` and `CLAUDE_CODE_CHILD_SESSION=1`. The wrappers unset the variables the kit names; they do not touch these. The data directory stayed empty and the first request shows no 0.6.0 context, so neither contaminated checks 2 and 3. The `PATH` entry matters only in check 5, where it is handled.

## Check 1: before

`ls -la /tmp/aether-accept-a3-XuvEGF/cfg/plugins/data/` and `ls -laR /tmp/aether-accept-a3-XuvEGF/cfg/plugins/data/aether-aether-plugin/`:

    ls: cannot access '/tmp/aether-accept-a3-XuvEGF/cfg/plugins/data/': No such file or directory
    ls: cannot access '/tmp/aether-accept-a3-XuvEGF/cfg/plugins/data/aether-aether-plugin/': No such file or directory

The data directory did not exist yet, and neither did `plugins/data/`. The fake model had logged 2 requests, both `hi`.

PASS

## Check 2: a normal session with Aether enabled

`cd /tmp/aether-accept-a3-XuvEGF/work && /tmp/aether-accept-a3-XuvEGF/c -p ACCEPT-NORMAL --allowedTools Write` printed `done`. The fake model logged requests 3 and 4: `{"n":3,...,"first":"\n\n\nACCEPT-NORMAL","k":0,"reply":"Write"}` and `{"n":4,...,"k":1,"reply":"text"}`. The first request is `fake/req-3.json`.

- **The guard allowed the spec write:** `/tmp/aether-accept-a3-XuvEGF/work/docs/superpowers/specs/x.md` exists, 2 bytes, `x`.
- **The data directory's listing is unchanged:**

      /tmp/aether-accept-a3-XuvEGF/cfg/plugins/data/:
      aether-aether-plugin
      superpowers-claude-plugins-official
      /tmp/aether-accept-a3-XuvEGF/cfg/plugins/data/aether-aether-plugin:
      (empty)

  Its contents are the same as before, nothing: no `sessions/` and no `usage/`. The directory itself appeared during this session, together with the one of superpowers, which has no hook that writes: Claude Code creates the data directory of each enabled plugin. After all the sessions of this task, including the disabled one and the probes of check 5, it is still empty, and `find <S>/cfg` finds no `sessions` or `usage` directory under `plugins/data/`. The only `sessions` directory in the configuration is Claude Code's own, `<S>/cfg/sessions`, which is empty.
- **The first request holds no Aether context:** in the JSON of `fake/req-3.json`, `Aether mode is active` occurs 0 times, and `aether:designer`, `aether:implementer`, `aether:ops`, `aether:reviewer`, `aether:supervisor` and `aether:lead` each occur 0 times. The only Aether lines are two skill entries (check 3). The list of agent types names `claude`, `Explore`, `general-purpose`, `Plan` and `statusline-setup`.

PASS

## Check 3: the same session with Aether disabled for one session

`rm .../work/docs/superpowers/specs/x.md`, then `cd /tmp/aether-accept-a3-XuvEGF/work && /tmp/aether-accept-a3-XuvEGF/c -p ACCEPT-NORMAL --allowedTools Write --settings '{"enabledPlugins":{"aether@aether-plugin":false}}'` printed `done`, and `x.md` was written again. The fake model logged requests 5 and 6; the first request is `fake/req-5.json`.

The character counts, the length of each field's JSON as sent (`JSON.stringify(body.<field>).length` over `req-3.json` and `req-5.json`):

| Part | Aether enabled | Aether disabled | Difference |
|---|---|---|---|
| `system` | 6009 | 6009 | 0 |
| `tools` (20 tools in both) | 46677 | 46677 | 0 |
| `messages` | 17453 | 17022 | +431 |

- **`system` and `tools` are identical** (`JSON.stringify` equal; the tool names equal).
- **Where the 431 characters are:** `messages[0]`, the prompt and its two reminders (583, 581 and 13 characters), is identical. `messages[1]`, a `system`-role entry with one text block, grows from 15337 to 15766 characters (+429 of text, +431 as JSON, the two line breaks escaped). That entry carries the session's opening context: superpowers' session-start context, the environment, and the lists of agents and skills. It is what the spec's A2 calls "the first message", where the listing sits on 2.1.296, so the README's "all in the first message" holds.
- **The lines present only with Aether enabled**, by comparing the two messages line by line, are two:
  - `- aether:run: Aether swarm: runs a plan compiled by aether-plan in parallel waves, with tier escalation, supervision, one-at-a-time merges, a final review and cleanup. Pass the JSON that `aether-plan compile` prints as args.` (224 characters);
  - `- aether:swarm: Use in Aether mode to run an approved plan that has Aether fields as a parallel swarm with /aether:run, to act on a run's result, or to relaunch a run's blocked, skipped or pending tasks.` (203 characters).

  The two with their line breaks make 429 characters. No line is present only with Aether disabled.
- **The data directory** is unchanged by this session.
- **The rest of the request body:** `metadata` differs only in the session id. `safeguards` is 17 characters longer with Aether enabled, because `--settings` changes the `flagSettings` path in `classifier_context.rule_roots` (`/tmp/claude-1000` instead of the work directory): a trace of the flag, not of Aether. The whole body differs by 448 characters.

PASS

## Check 4: the static estimate

`/tmp/aether-accept-a3-XuvEGF/c plugin details aether@aether-plugin`:

    aether 0.7.0
      Skills (2)  swarm, using-aether
      Agents (6)  designer, implementer, lead, ops, reviewer, supervisor
      Hooks (2)  SessionStart, PreToolUse  (harness-only — no model context cost)
      MCP servers (0)
      LSP servers (0)
    Projected token cost
      Always-on:   ~100 tok   added to every session

Each of the 2 skills and 6 agents is under 20 tokens always on. The estimate lists the six agents, which the measured first request does not carry; the measured growth, 431 characters, is about 108 tokens at four characters a token.

PASS

## Check 5: the commands on `PATH`

`ls /tmp/aether-accept-a3-XuvEGF/cfg/plugins/cache/aether-plugin/aether/0.7.0/bin | wc -l` gave `8`: `aether-autonomy`, `aether-guard`, `aether-lane`, `aether-plan`, `aether-report`, `aether-session-start`, `aether-voice`, `aether-wt`.

An added probe measures the README's claim itself, from the Bash tool of a normal session, on a second fake model (port 45573, its own `fake-path` directory and wrapper `c-path`, the same as `c` with its own port):

- `ACCEPT-PATH` with `--allowedTools Bash --permission-mode dontAsk` ran `for c in <the eight>; do command -v $c; done` and printed `$PATH`. With the outer `PATH` as it was, all eight resolved to the 0.6.0 copy, whose directory comes earlier in `PATH`, and `PATH` held both directories: that 0.6.0 one and `/tmp/aether-accept-a3-XuvEGF/cfg/plugins/cache/aether-plugin/aether/0.7.0/bin`.
- With the 0.6.0 directory removed from `PATH` in `c-path`, all eight resolved to `/tmp/aether-accept-a3-XuvEGF/cfg/plugins/cache/aether-plugin/aether/0.7.0/bin/<name>`, and that directory was the only `aether` entry in `PATH`.
- A first attempt with the default permission mode did not run the command: the auto-mode classifier asked the fake model, which cannot answer it. That attempt changed nothing.

The hooks, run directly from the installed copy with `env -i` and `AETHER_DATA_DIR=<S>/hookprobe/data`:

- `aether-session-start` with `{"session_id":"probe-1","source":"startup",...}` and with `"agent_type":"claude"`: exit 0, no output;
- `aether-guard` with a `Write` of a spec in session `probe-1`: exit 0, no output;
- `<S>/hookprobe` stayed empty.

`hooks/hooks.json` of the installed copy runs `node "${CLAUDE_PLUGIN_ROOT}/bin/aether-session-start"` on `SessionStart` (`startup|resume|clear|compact`) and `node "${CLAUDE_PLUGIN_ROOT}/bin/aether-guard"` on `PreToolUse` for `Write|Edit|MultiEdit|NotebookEdit`: one process each.

PASS

## Check 6: stop

`kill $(cat <S>/fake/pid)`, and the same for the second fake model (`<S>/fake-path/pid`). `ss -ltnp` then showed no listener on 37859 or 45573, and `ps` showed neither process.

PASS

## Check 7: the README section

`### What Aether adds to a normal session` is inserted in `README.md` between the end of `### Start` (after its list of what the swarm needs) and `### Options`, with the measured values:

- Claude Code 2.1.296, Aether 0.7.0;
- the first request grows by 431 characters, all in the first message: the `aether:run` and `aether:swarm` entries of the skills list;
- the system prompt and the tools are unchanged;
- about 100 tokens always on;
- the eight commands of `bin/` on `PATH`;
- one short `node` process at each session start and each `Write`, `Edit`, `MultiEdit` or `NotebookEdit` call, which finds no Aether session and exits.

No measurement contradicts a line of the section. The line `Nothing is injected, refused, recorded or written.` holds for Aether: the hooks print nothing and write nothing, and the empty data directory was created by Claude Code.

PASS

## Check 8: the research subsection

`### Dormant footprint of 0.7.0` is the last part of `## Installable plugin findings (2026-10-09)` in `docs/claude-code-research.md`. It has the counts of check 3, the lines present only with Aether enabled, the commands of checks 2 to 5, the `Always-on` estimate, the `PATH` and data directory findings, and Claude Code 2.1.296.

PASS

## Check 9: `npm test`

`npm test` in the unit worktree: `# tests 375`, `# pass 375`, `# fail 0`. The test `the guide has its parts in order` of `tests/launcher.test.js` passes with the new section between `### Start` and `### Options`.

PASS

Result: PASS
