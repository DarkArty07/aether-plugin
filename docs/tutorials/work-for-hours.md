---
title: Work for hours
description: Give the Lead permission to work on its own, know its ceilings and the quota brake, and read the brief it leaves when it stops
order: 105
---

# Work for hours

At the end of this guide the Lead will have worked on a job by itself, and you will have a brief to read when it stops. Setting it up takes about five minutes. The run lasts as long as the job does, up to its ceilings.

## Before you start

- Aether is installed and `aeth` opens it. If not, start with [Install and start](install-and-start.md).
- You have a job the Lead can finish without you, such as a feature with its tests.
- `aeth` starts in the autonomous permission mode by default, with no permission prompts. You chose the mode in `/aether:setup`, and you can run it again to change it. This matters: a permission prompt of Claude Code stops a run like a question, and the session waits at it.

## Steps

### 1. Open Aether mode

In a terminal, in your project folder:

```
aeth
```

You see the Lead's welcome line, which names `/aether:help`.

### 2. Ask for the job and give the permission in your own words

Say what you want, then say you want it done without you. For example:

```
Add a /health endpoint with a test. Trabaja autónomamente: no cuentes conmigo hasta acabar.
```

Other words work too, such as «trabaja por horas». Without this permission the Lead stops at the plan and waits for your yes. With it, your sentence also confirms your intent, so the Lead does not ask again.

What you see: the Lead loads the skill `autonomous-runs` and starts a run with `aether-autonomy start`. The command checks your words against your own messages in the session, and needs at least 12 of your characters, so give a full sentence, not a bare «sí».

### 3. Name the ceilings, or keep the defaults

A run has two ceilings: 8 hours and US$ 50. Say a number and the Lead uses it instead:

```
Work on your own for at most 3 hours and US$ 20.
```

The dollar figure covers the swarm, the calls to other harnesses and the external design seats. It does not add up the Lead's own turns, so the time ceiling is the real guard. When you widen the ceilings mid-run in your own words, the Lead runs `aether-autonomy extend --hours N --usd N|unlimited --quote "<your words>"` instead of ending and reopening the run.

### 4. Let it work

The Lead keeps a diary at `.aether/autonomy/<run id>/diary.md` and updates it after every decision. You can read it at any time. The Lead keeps working while work remains. It stops when the work is done, when it reaches a ceiling, or honestly, when everything left waits for your yes or repeated without progress. A failure that has a fallback, such as a lane out of quota, never reaches you: the Lead handles it and records it.

### 5. Know the quota brake

The five-hour window of your Claude account is the one quota a run cannot replace. At 95 % of it (`quotabrake`, `95` by default) the plugin warns you. In a run, the Lead also stops in order: nothing new starts, what is running is stopped, and each swarm unit's work is committed on its own branch. The run pauses; it does not end.

When the window resets, the plugin wakes the Lead. It reads the diary and relaunches the same run from the saved branches, without repeating the units already merged. If you closed the session, the paused run is found at the next `aeth`. The seven-day window at the same percent only warns. To change the percent, use `/plugin` → Installed → aether → Configure options. The saved branches stay local unless `brakepush` is on and a push permission you recorded covers the push.

### 6. Read the brief

When the run stops, the Lead writes the brief at `.aether/autonomy/<run id>/brief.md` and shows it in the chat. Its first line is `**Resultado:**` with `cumplida`, `parcial` or `no terminada`, and the ceiling reached, if any. Read «Espera tu sí» first, then «Supuestos». [Read the brief](read-the-brief.md) goes through all of it.

### 7. Answer what still waits for your yes

The permission to work for hours does not cover irreversible actions: a push, a merge to `main`, a publish, a deploy, a delete, a credentials command or a paid call. Unless you authorized that class in general words, they wait in «Espera tu sí», each with how to undo it and the exact command. By default `aeth` also refuses such a command when no grant covers it, instead of only recording it. Everything local and reversible goes ahead without asking.

## Check that it worked

- A folder `.aether/autonomy/<run id>/` exists in your project, with `diary.md`.
- When the run ends, `brief.md` is there and starts with `**Resultado:**`.
- The brief's «Tiempo y costo» section says how long the Lead worked, against the ceiling, and how many times it consulted you.
- If the quota brake acted, the diary says so: the pause, the hour of the reset and the saved units.

## Next

- [Read the brief](read-the-brief.md): «Espera tu sí», «Supuestos» and the RADAR lines.
- [See the spend](see-the-spend.md): the list-price cost of the session, apart from the ceiling.
- [Other harnesses](other-harnesses.md): send work to the plans you already pay for.
- [Autonomy](../guide/autonomy.md#autonomy-1): the full contract, the grants and the guard.
- [Options](../guide/options.md#options): `quotabrake`, `brakepush` and the rest.
