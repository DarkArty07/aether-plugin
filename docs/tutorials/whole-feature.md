---
title: A whole feature
description: Ask for a bigger piece of work and follow it through the questions, the design, the build and the brief, knowing what to do at each point
order: 103
---

# A whole feature

At the end of this guide a feature is built, reviewed and reported in one brief, and you know where the Lead needs you and where it does not. Your part takes about twenty minutes; the build takes as long as the feature needs.

## Before you start

- Aether is installed and `aeth` works ([Install and start Aether](install-and-start.md)). You have done [Your first request](first-request.md).
- Dynamic workflows are on. The design and the swarm are dynamic workflows, and `/aether:doctor` says whether they are. If they are off, turn on Dynamic workflows in `/config` and start a new session. The Lead tells you this and does not design by hand.
- Your project is a git repository.

## Steps

### 1. Ask for the feature

```
Add a discount-code field to the checkout, with tests
```

### 2. Confirm what the Lead understood

The Lead explores the context and writes back its understanding in numbered points, apart from what it assumes. Confirm it with «sí, es buena idea». A correction that leaves your intent as it was goes into the note; one that changes it gets a new write-back. If you say you do not know, the Lead asks one question instead.

This step is yours. The Lead does not go on without it.

### 3. Answer the clarifying questions

The Lead asks at most five questions, one at a time, and only about a choice that is hard to reverse, surprising or a real trade-off. What a default can settle, it assumes and records, and does not ask. Before the design it also tells you what is worth knowing: a better option if it sees one, the scope, and the estimated cost and time from finished runs, or that there is no history yet.

### 4. The intent card

The Lead writes `specs/NNN-<topic>/intent.md`, with your words as you said them, the understanding you confirmed, the criteria, what is out and your answers. Only the Lead writes it, and it commits the folder. Read it once. If something is wrong, tell the Lead.

### 5. `/aether:design` runs by itself

The Lead launches `/aether:design` with the card. You wait. The Writer writes the spec and the Judge reviews it; the Writer then writes the plan and the tasks, `aether-plan check` passes and the Judge reviews them; last, the Examiner writes a hidden exam that the builders never see. A document gets at most two revisions.

You can ignore the verdicts and the `Complexity` table. The Lead reads them. The design ends with one result:
- **`approved`:** the spec, plan and tasks are ready. Nothing to do.
- **`clarify`:** the card left a choice open. The Lead asks you, writes your answer into the card and launches again.
- **`dispute`:** a review did not approve after two revisions, or the Judge rejected the approach. The Lead rethinks the card or puts both positions in your list. It never overrides the Judge.
- **`failed`:** the step and why. The Lead launches once more.

### 6. The build

The Lead chooses how to build and says why: itself, a delegate task, or the swarm (`/aether:run`) for a plan of three or more tasks.

What happens next depends on your permission:
- **Without permission to work for hours,** the Lead stops at the plan with a short brief that recommends how to build. Your yes starts the build.
- **With it,** for example «trabaja por horas», the Lead builds on its own within its ceilings. [Work for hours](work-for-hours.md) has the details.

You can ignore the swarm's mechanics: the waves, the worktrees, the supervisor and the climbs from Haiku to Sonnet and Opus. Approved units merge one at a time, a final review covers the whole run, and no worktree is left behind. When the build ends, the hidden exam runs on the branch that holds it. A failing test is a blocking finding of the brief.

### 7. Read the brief

The Lead ends with one brief that opens with «Espera tu sí» and «Supuestos». [Read the brief](read-the-brief.md) shows how to read it and how to answer.

## Check that it worked

- `specs/NNN-<topic>/` holds `intent.md`, `spec.md`, `plan.md` and `tasks.md`.
- The brief arrived, and every item of «Espera tu sí» says what happens on your yes and on your no.
- A swarm builds on a feature branch, never on `main`. A merge to `main` waits for your yes.
- The brief says what was not verified, so you know where to look first.

## Next

- [Read the brief](read-the-brief.md): every part of the brief and how to answer.
- [Work for hours](work-for-hours.md): let the Lead run to the end without you.
- [Methodology](../methodology.md): the method from intent to brief, and [Autonomy](../guide/autonomy.md#autonomy) for the permission to work for hours.
