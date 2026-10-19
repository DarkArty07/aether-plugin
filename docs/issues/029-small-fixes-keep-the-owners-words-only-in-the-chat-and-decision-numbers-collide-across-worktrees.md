# Small fixes keep the owner's words only in the chat, and a delegate in a worktree takes a decision number that main already has

**Type:** improvement (method)
**Date:** 2026-10-19
**Found in:** the fix for issue 027, the Lead's session e591573c
**Status:** open
**GitHub:** not filed

## The owner's purpose

«Mi intención no es hacer exigente los procesos a lo estúpido, mi intención es ampliar la metodología de creación del software para mejorar la calidad. [...] Mi idea es tener buenas prácticas y cosas que, entre más use el sistema Aether, más mejore el proyecto en lugar de solo sobrecomplicarlo». Every proposal below is light, optional and meant to be judged by use, not enforced.

## What happened

- **The route.** A fix of about seven files in the lanes quota model went to a delegate task with no document. It changes what a mark on disk means and is shared by the swarm, the seats and the router. The Lead's route table asks for a short design by risk (security and auth, data migrations, concurrency, core architecture) and for a spec by size (architectural work), not by how much of the documentation a change touches. This follows the method as written. It also follows the repo's practice: specs 001 to 006 are large features, and everything else (the router fixes `g1` to `g4`, A56, the `/harnesses` panel in A57 and A58) is an issue and a numbered decision.
- **The owner's words.** What decided the change, the owner's account of the three quotas, exists only in the conversation unless the Lead copies it into the issue or the decision. A57 does; nothing asks for it.
- **The number.** The delegate's worktree branched from `55baf05` and was told to add a numbered decision after the highest, A56. While it worked, PR #38 put A57 and A58 on `main`. Its entry would also be A57. It was found by chance.
- **A command that existed.** The Lead told the owner that `/harnesses` did not exist. The command was on `feat/harness-panel`, a worktree that the Lead's own `git worktree list` showed, and it reached `main` as PR #38 that day. The Lead had read only the checkout.
- **A fact that expired.** The fix for issue 027 rested on the owner's account of agy's quotas (three, Argon apart), which was right on 2026-10-16 and no longer on 2026-10-19: agy 1.4.2 merged Argon into the Gemini quota that day. No probe came before the build. The bootstrap tells the Lead never to run agy from its shell, so the Lead could not check, and `/usage` never showed the separate limit. The real calls ran after the owner asked the Lead to make them: «necesito que que el el lead lo haga, si me va estar pidiendo que haga cosas se pierde la autonomia». They showed the account was stale, and that a reset agy had stated as 163 hours had not held.

## Proposals

1. No new kind of document. When a change alters a concept a guide documents, the issue or the decision quotes the owner's decisive words, as A57 does. The Lead's brief to the delegate asks for it.
2. A decision number is taken when the change is integrated, not when the branch starts. The integrator renumbers; a test that fails on a repeated decision number would catch the rest.
3. A short design stays at the Lead's judgment or the owner's request. The mandatory triggers are not widened until use shows a repeated miss. To see it, each issue could note in one line when a change needed rework after review and whether a design would have caught it.
4. Before saying that a command, a skill or a file does not exist, the Lead looks at the worktrees, the branches and the latest merges.
5. A fix that depends on how a third-party service behaves starts with one dated probe: the tool's version, the date, what was asked and what answered, written in the issue. The Lead makes it itself under a `paid-call` grant, through a command of the plugin that gives the CLI the environment a lane gives (`scripts/lane-smoke.js` does now; an `aether-lane smoke` would put it in `bin/`). The bootstrap line that tells the Lead never to run agy would then say that instead. It costs a few thousand tokens of another plan's quota and saves building on a stale fact.

## Acceptance

- A change to a documented concept leaves the owner's words in the repository without a new document.
- Two decisions never share a number on `main`.
- An issue about a third-party service says the version and date of the probe it rests on, and the Lead can make that probe without handing the owner a command.

## Environment

Claude Code 2.1.303, Aether plugin 0.12.2 installed, Sonnet 5.5 as the Lead, Linux (WSL2).
