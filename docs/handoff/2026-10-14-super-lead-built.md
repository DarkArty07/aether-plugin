# Handoff: the super Lead built, spec 002 planned, and what waits for the owner

- **Date:** 2026-10-14, the second session of the day. It follows [the first handoff](2026-10-14-super-lead-and-quota-lanes.md) and works through its §4 in order.
- **From:** the Lead. This was Claude Code on Opus 5.5 at `max`, in a plain session the owner asked to act as the super Lead, with the owner present. The owner writes Spanish; code and documents here are English.
- **To:** the next session. Building spec 002 needs an **Aether session**: the swarm's workflow asks for the `aether:<role>` agents, and a plain session withholds them (see §3).
- **Repository state:**
  - Branch **`feat/grok-lane`** at `1aab178` plus this handoff's commit, not pushed.
  - It holds `fix/open-issues-0.9.1` (0.9.1) and local `main`'s `98889cd` (`scripts/aether-lead`), on top of `origin/main` at `e3e85b8` (0.9.0). The plugin says 0.9.1.
  - `npm run check`: 740 unit tests, 35 mod tests, and both manifests valid.
- **Installed plugin:** 0.9.0 (`~/.claude/plugins/cache/aether-plugin/aether/0.9.0`). Nothing here reaches Claude Code until it is merged to `main` and the plugin updates.

## 1. What was done

| Commits | What |
|---|---|
| `6e5eb3d` … `971fa0a` | **Spec 003, the super Lead** ([spec](../../specs/003-super-lead/spec.md)), a short design. The Judge approved revision 3 after `revise` on revisions 1 and 2. |
| `7e7a10d`, `d20d8b7`, `12d8969` | **Its build**, two delegate tasks on Sonnet `xhigh` in worktrees. The models index moved to `plugins/aether/config/models/` and gained the native `claude` harness: Haiku, Sonnet and Opus 5.5 at five efforts, and Fable 5.1 in `excluded` (A43). The Haiku and Fable profiles were written from Anthropic's pages. The bootstrap gained "The three paths" and "Models". The hook now replaces `${CLAUDE_PLUGIN_ROOT}`. Also `tests/bootstrap-names.test.js`, and A48. |
| `401c5d5` | **R16, measured** with the fake model, no paid call. On Claude Code 2.1.299 the Lead's first message is a 1,947-byte preview of a 27.6 KB context that Claude Code saved to a file. The preview holds the order to read it whole, the three paths and the model rule ([evidence](../evaluations/2026-10-14-super-lead/README.md)). |
| `08fd092`, `d79b684` … `739511e` | **After the build's review** (two Opus reviewers, each serious finding checked by a skeptic): stronger tests, a builder that rejects unreadable listings, and spec 003 revisions 4 and 5. The Judge approved revision 5. It adds the delegate path to the exam, Done, the ceilings, the fallbacks, the pending work and the cost lines. |
| `502c7ca`, `6befdc9` | **Spec 002 amended.** The models index's new path. Grok's quota is now read with the ACP request `_x.ai/billing` on `grok agent stdio`, about one second, with no UI; the UI stays only as a fallback (R5). |
| `0a1698f`, `7f4dbdb`, `cc63e56`, `1aab178` | **Spec 002's plan and tasks**, by the Writer on Sonnet `xhigh`. The Judge ruled `revise` on the first review, and the Lead amended R6, R19, A6, A2 and the irreversible actions. The Judge then approved the second review, which included accepting P1, the `aether-lane choice` log. The plan has 15 tasks in 4 waves, with `aether-plan check` ok. Task 10 carries a real `agy /usage` capture, taken with no model call. |
| `4a6f71c` | Local `main` merged in, which brings `scripts/aether-lead` (`98889cd`) into this branch. |

The Lead's own memory for this project was cleaned the same day. Rules now in the plugin left it, and history the repo records left it. What remains is what the repo cannot hold: the owner's quotes, corrections and machine facts.

## 2. Found in this session

- **The bootstrap does not fit in a hook's context.** Claude Code saves an `additionalContext` over 10,000 characters to a file and injects a 2,000-character preview ([docs](https://code.claude.com/docs/en/hooks#add-context-for-claude)). Spec 003 puts the essentials in the first 1,800 characters and orders the Lead to read the file. Splitting the bootstrap below 10,000 characters is a Proposal there.
- **A plain session withholds every `aether:*` agent.** This is by design (the mod's `agent.offer`). So a plain session cannot run the swarm, and a design seat must be emulated: `general-purpose` with the agent's file, model and effort.
- **An isolated delegate's worktree may start at `origin/main`** (`e3e85b8`), not at the current branch. Every brief should start with `git merge --ff-only <sha>`.
- **The auto-mode classifier refused three things** although the owner had authorized them:
  - deleting another session's worktree and branches ("Interfere With Workloads");
  - adding `--permission-mode bypassPermissions` to `scripts/aether-lead` ("Create Unsafe Agents");
  - some plain reads that came after that.
  The Lead did not route around any of them.
- **Grok's quota without the UI.** `_x.ai/billing` returns the same `config` the UI logs, with `subscription_tier`. `initialize` does not advertise it. Grok's `BillingConfig` struct has `creditUsagePercent`, and the answer omits it when the week's use is zero.
- **A3 is still open.** A real call (about 40K tokens, about US$0.04) left `creditUsagePercent` absent on grok 1.0.52, which is consistent with a zero being omitted; the spend was far below 1%. Keeping R4 (absent counts as 0% used, and R14's dry marks catch a mistake) is the Lead's recommendation. A reading taken after at least 1% of weekly use settles it.
- **Sonnet 5.5's cache-read price:** Anthropic's reference says US$0.20 per million, while `config/prices.json` (OpenRouter, 2026-10-07) says US$0.10. Recorded as a Proposal in spec 003.

## 3. What is left, in order

1. **Build spec 002 with the swarm, in an Aether session.** Start one on this branch's plugin:
   - Run `aether-lead --plugin-dir /home/darkarty/Desktop/03_PROYECTOS/01_ACTIVOS/aether-plugin/plugins/aether`, or install the release first.
   - Then follow the `aether:swarm` skill on `specs/002-quota-aware-lanes/tasks.md`.
   - The integration worktree branches from `feat/grok-lane`. The test command is `npm test`.
   - After it runs, run `npm run test:mod` and `npm run validate`, because the plan adds a form to the mod.
2. **Check the ACP refresh live** once it is built: `node plugins/aether/bin/aether-lane quota grok --refresh`. This is a data query, not a model call.
3. **Release** (the owner's yes; §4).

Later, not now:
- codex and cursor in the index and the lanes;
- Gemini 4 Argon when agy offers it;
- GitHub issues #1 and #6;
- the Proposals of specs 002 and 003.

## 4. What waits for the owner

1. **The launcher.** The owner wants `aether-lead` to start with permissions bypassed («nuestro lanzador corto de claude debería manejar»), and the classifier refused the Lead's edit. Three changes, which the owner makes or lets a session in that mode make:
   - In `scripts/aether-lead`, the exec line becomes `exec claude --agent aether:lead --effort xhigh --permission-mode bypassPermissions \`.
   - In `tests/start-command.test.js`, the expected arguments gain `'--permission-mode', 'bypassPermissions'` after `'xhigh'`, and the slice in the second test becomes `slice(8)`.
   - In README "Start", say so and why.
   - Then copy the script again to `~/.local/bin/aether-lead`, which is a copy, not a link.
   - Recommended with it: `AETHER_IRREVERSIBLE=enforce`, so that aether-guard refuses the irreversible classes until the owner grants them. Without the classifier, the guard is the only check left.
2. **Leftovers:**
   - `git worktree remove .claude/worktrees/short-start-command && git branch -d worktree-short-start-command && git branch -D worktree-agent-a10dee85149f8b12c && rm -rf /tmp/aether-lane-smoke-BiJq6G`
   - The orphaned grok session folders: `rm -rf ~/.grok/sessions/%2Ftmp%2Faether-grok-quota-* ~/.grok/sessions/%2Ftmp%2Faether-lane-smoke-* ~/.grok/sessions/%2Ftmp%2Fclaude-1000%2F*grok-probe`
3. **A3:** keep R4, or wait for a reading taken after at least 1% of weekly use.
4. **Release:**
   - Push `fix/open-issues-0.9.1` and `feat/grok-lane`.
   - Open the pull requests: 0.9.1 first; this branch next, as 0.10.0, with the version bump and its README section.
   - Merge both, and tag.
   - The owner's `~/.claude/settings.json` installs the marketplace at `ref: main`.

## 5. How to run things

```
npm run check                                                   # unit, mod tests, both manifests
node plugins/aether/bin/aether-lane quota grok agy [--refresh]  # quota without a run (the refresh opens grok's UI until spec 002 is built)
node scripts/build-models-index.js --write                      # rebuilds plugins/aether/config/models and docs/models/README.md
node scripts/build-models-index.js --from <saved AA answer> --write   # the same, without the network
node scripts/lane-smoke.js grok grok-4.7                        # one real call (spends plan quota): the owner's yes
```

The fake-model method, with no paid call, is in `docs/evaluations/2026-10-14-super-lead/README.md`.

Never run a prompt through grok, agy, codex or cursor-agent with an approval flag from the agent's own shell, and never read `~/.grok/auth.json`.
