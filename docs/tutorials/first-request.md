---
title: Your first request
description: Give the Lead a small task and follow it from your message to the short brief at the end
order: 102
---

# Your first request

At the end of this guide a small change is done and checked, and you know what the Lead did to get there. It takes about ten minutes.

## Before you start

- Aether is installed and `aeth` works ([Install and start Aether](install-and-start.md)).
- You have a project in a git repository, with one small thing to fix. This guide uses a failing test.
- You opened `aeth` in the project's folder.

## Steps

### 1. Ask for the small thing

Tell the Lead what you want, in your own words:

```
Fix the failing test in test/cart.test.js
```

What you see: the Lead explores the code before it asks anything. It asks you only what the code cannot answer, one question at a time, so answer short. If it writes back what it understood, in numbered points, confirm it with «sí, es buena idea» or say what to change.

A small or reversible change needs no document: there is no intent card, no spec and no plan.

### 2. The Lead chooses a path and says why

The Lead takes one of three paths for each piece of work, and tells you which and why:
- **Direct:** a very bounded change, a few files and about five tool calls, with no edit-test-fix loop. The Lead does it itself, in the conversation. You see it read, edit and run the test.
- **Delegate task:** bounded work that is still a real task, such as an edit-test-fix loop. One subagent works in the background. It starts on Haiku, the cheapest model, and rises to Sonnet and then to Opus only when it must. The system holds that step, not the Lead. You can keep talking to the Lead meanwhile.
- **Swarm:** a plan of three or more tasks, built in parallel. A first request rarely needs it. If the Lead decides yours does, it designs first: [A whole feature](whole-feature.md) follows that route.

A failing test is usually the direct path or one delegate task.

### 3. Let it work

You can ignore which model does what, the retries and the climbs. Before the Lead tells you a delegate's work is done, it checks it with tests and rules that need no model: the tests, the files touched outside what the task owns, and an empty change.

Two things can still reach you:
- A push, a merge to `main`, a publish, a deploy or a delete. The guard refuses it until you say yes, and it goes to your list in the brief.
- A permission prompt of Claude Code, if you chose «Ask before each tool». The session waits at it. Answer it.

### 4. Read the short brief

When the work ends, the Lead gives you a brief. Outside a run it is short: what you asked, the decisions, what waits for your yes, the assumptions, what was not verified and the RADAR lines that apply. The names of its sections are in Spanish, so this guide names them in Spanish:
- «Espera tu sí» is your list: what only you can decide. If nothing waits for you, you have nothing to answer.
- «Supuestos» is what your request did not cover and the Lead decided to assume. Veto any you do not like.
- «Qué no verifiqué» is what the Lead could not check. Be skeptical there.

The closing line starts with «Sesión» and gives what the session cost at list price.

[Read the brief](read-the-brief.md) explains each part and how to answer.

## Check that it worked

- Run your test command yourself. The test passes, and the brief says which command the Lead ran.
- `git diff` and `git log` show what changed.
- The brief says what the Lead did not verify, so you know what to look at first.

## Next

- [A whole feature](whole-feature.md): a bigger request, with questions, a design and a swarm.
- [Read the brief](read-the-brief.md): every part of the brief and how to answer it.
- [Methodology](../methodology.md): the roles and the three paths in full, and [Delegates](../guide/delegates.md) for how a delegate task climbs.
