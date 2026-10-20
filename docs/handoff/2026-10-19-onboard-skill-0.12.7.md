# Handoff: the `/aether:onboard` skill (0.12.7)

- **Date:** 2026-10-19. It follows [the 0.12.5 handoff](2026-10-19-lanes-marks-lead-max-0.12.5.md). The 0.12.6 branch is not published, and this release does not contain it (section 3).
- **From:** the Lead, Claude Code on Sonnet 5.5 (session 44910646), in the worktree `.worktrees/onboard-skill`.
- **To:** the next session.
- **Repository state:** the branch `feat/onboard-skill` holds two commits: the skill, and the release. This release is 0.12.7, and the tag `aether--v0.12.7` is made on `main` after the branch is merged. The owner's installed plugin stays at 0.12.5 until they run `claude plugin update aether@aether-plugin`.

## 1. What was done

| Where | What |
|---|---|
| `plugins/aether/skills/onboard/SKILL.md` | `/aether:onboard [topic]`: a read-only skill with `disable-model-invocation`. It reads the README and `CLAUDE.md`, `git status` and the log, the newest handoff, the branches, worktrees and pull requests, the feature under way and an open autonomous run, and ends with a brief of 5 to 8 lines. Git wins over a handoff; a run of another session is reported, not continued. |
| `docs/reference/components.md` | The row of the skill, and the sentence that it adds nothing to a plain session. |
| Version, changelog, roadmap, this handoff | The release: `plugin.json`, the pin of `tests/launcher.test.js`, the README, the first line of the changelog and the test that reads it. |

## 2. What the owner decided, in their words

- «siempre digo "Contextualizate" Y espero que el agetne vaya y averigue que es el proyecto que es lo ultimo que se hizo»: the habit the skill replaces.
- «onboard me gusta»: the name. `context` and `recap` exist in Claude Code, `resume` clashes with `--resume`, and `brief` is Aether's word for its reports.
- «adelante escribela va a entrar como fix porque estan trbajando en la futura 0.13.0»: a patch, on A57's reasoning.
- «si mandalo a main y sacalo como 12.7»: merge it and release it as 0.12.7.

## 3. Open

- **`fix/lead-xhigh` (0.12.6, A63) is not published and not in this release.** It was made from the same `main` and bumps the same lines: `plugin.json`, the launcher test, the README, the changelog, the roadmap, and A63. Whoever lands it second rebases and renumbers its version and its decision: it becomes 0.12.8 or later. The tag `aether--v0.12.6` does not exist, so the releases go 0.12.5, 0.12.7.
- **The skill has not been run with a real model.** The first `/aether:onboard` in a new session is the test: it should end on the brief and the question, and start no work.
- **Two tests fail on `main` and on this branch alike:** «status reads each group's windows, marks a group under the reserve unusable, and logs the reading» and «compile gives no lanes when the harness is missing or there is no table». They were not investigated.
- **The run `auto-20261019-145237-9fff` is the 008 session's,** and was left alone.
