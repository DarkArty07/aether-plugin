Seen on 2026-10-28 in the frontend experiment (Snake 3D, 12 tasks, every call native), runs `20261028-170457-cce3` (arm s3) and `20261028-170459-5fe2` (arm s4), both started with `--plugin-dir` on branches that change only agent prompts (`exp/frontend-skills`, `exp/frontend-guided`, on 0.25.1).

**What happened.**
- Both Leads compiled with the `aether-plan` on `PATH`, which was the **0.25.0** release's (the ops prompts carry `PATH='/home/darkarty/.claude/plugins/cache/aether-plugin/aether/0.25.0/bin'`). The arm run with the installed 0.25.1 (s2) reported the same: "the `aether-plan` of PATH points to 0.25.0", and compiled with the explicit 0.25.1 path.
- With a `binDir` that is not the mod's own (`hooks/register.js` `opsCommand()`: "when they are not this mod's own, the model runs the prompt"), every ops command went to the `aether:ops` agent on **Haiku**: 163 requests in s4, US$ 0.04. In s2, none.
- Three times in s4 the Haiku ops agent **ran the command successfully but reported `"exitCode": -1`** in its structured answer. For example, for `aether-wt ladder 20261028-170459-5fe2 task-12` its StructuredOutput was `{"exitCode": -1, "stdout": "{\"task\":\"task-12\",\"status\":\"open\",\"step\":\"haiku\",...}"}`. `opsOnce()` returns `exited with -1` for any non-zero `exitCode`, so the unit was blocked ("the ladder could not be read"). `task-4` was blocked twice and `task-12` once, which cost three relaunches (and triggered the review issue filed beside this one). Run by hand, the same command exited 0.

**Two faults.**
1. A session's `PATH` can hold an older release's bins (0.25.0 after 0.25.1 was installed), and a `--plugin-dir` session's `PATH` holds the installed release's, so a compile from `PATH` mixes versions and loses the mod's ops (#13 closed this for the bins the agents run, not for the compile's `binDir`).
2. When the model runs an ops command, a hallucinated `exitCode` fails a command whose stdout is the bin's own valid JSON line without an `error`.

**Proposals.** (a) The swarm skill and the Lead's bootstrap tell the Lead to compile with `${CLAUDE_PLUGIN_ROOT}/bin/aether-plan` (or the mod also runs commands whose `binDir` is another installed Aether release); (b) `opsOnce()` trusts a parsed bin JSON line without `error` over a model-reported `exitCode`, or treats an `exitCode` of -1 with valid JSON as 0 and records it. Related: #13, #118, #2.

Evidence: the s4 session transcript under `~/.claude/projects/-home-darkarty--cache-aether-exp-frontend-s4-guided/` (search `"exitCode":-1`), `~/.cache/aether-exp-frontend/s4-guided/.aether/runs/20261028-170459-5fe2/result-1.json` and `result-2.json`, and the cost by role in `~/.cache/aether-exp-frontend/data-s4-guided/runs.jsonl` (`aether:ops`).
