---
title: Read the brief
description: Read the brief that ends a job in the right order, and answer what waits for your yes
order: 104
---

# Read the brief

At the end of this guide you can read any brief in about five minutes, know which two sections to read first, and answer what waits for you.

## Before you start

- You have a brief to read. It comes at the end of every job: [Your first request](first-request.md) and [A whole feature](whole-feature.md) both end with one.
- The names of the brief's sections are in Spanish, so this guide names them in Spanish.

## Steps

### 1. Read the result

The brief of a run opens with the result under its title: `**Resultado:**` with `cumplida`, `parcial` or `no terminada`, and the ceiling that stopped it, if one did. Outside a run the brief is short and opens with the next section.

### 2. Read «Espera tu sí» first

This is your list: what only you can decide, and the irreversible actions nobody authorized. Every item has the same six parts:

```
acción · clase · por qué · si dices que no · cómo se revierte · el comando exacto
```

In words: what the Lead wants to do, which class of action it is (`push`, `merge-main`, `publish`, `deploy`, `delete` or `credentials`), why it is needed, what happens if you say no, how to undo it, and the exact command that will run. For example:

```
Subir la rama feature/descuentos · push · para abrir el PR · si dices que no: la rama queda solo en tu máquina · se revierte: borrando la rama remota · se ejecutará: git push origin feature/descuentos
```

When the Lead stopped at the plan, because you had not given permission to work for hours, the list also holds how to build it: the method the Lead recommends, and your yes starts the build. A failure that has a fallback, such as a harness out of quota, never reaches this list. The Lead handles it and records it.

### 3. Read «Supuestos»

These are the things your request did not cover and the Lead decided to assume. Each has its basis and says whether it can be reversed. They are ordered by how likely you are to veto them, the most likely first. Read from the top and stop when you agree with the rest.

### 4. Skim «Criterios» and the RADAR lines

«Criterios» are the criteria with their evidence. Then come five RADAR lines, one for each goal of Aether:
- **Rápido:** the time, the retries and the climbs to a stronger model.
- **Autónomo:** how many times the Lead interrupted you, and why.
- **Delegación:** the calls and tokens run on other harnesses, and the quota left.
- **Asequible:** the dollars, the quota used, and the model and effort of each delegated task.
- **Robusto:** the tests, the exam, the findings and the verdicts of the Judge.

### 5. Read «Qué no verifiqué»

This is what the Lead could not check, so it is where to be skeptical. Around it are what the Lead did («Hice») and decided («Decidí»), what it found («Descubrí»), what it did not finish («No terminé»), proposals beyond your intent («Propuestas», which the Lead does not work on) and the time and cost («Tiempo y costo»). The cost figure of a run covers the swarm and the calls on other harnesses, not the Lead's own turns.

### 6. Answer the list

Answer each item in plain words:
- **«Sí»** and the Lead runs that action, once.
- **A general yes,** such as «sí, todos los merges a main» or «siempre», also records a standing grant for that class of action, so the Lead does not ask again. Add «en esta sesión» and the grant lasts only for the session. The grant needs at least 12 characters of your words, which the Lead checks against your own messages.
- **«No»** and what the item's «si dices que no» says happens. The Lead goes on with whatever does not depend on it.

With `AETHER_IRREVERSIBLE=enforce`, which `aeth` sets unless your shell already did, the guard refuses the action even after your yes until a grant covers it. The Lead records your reply as a grant for the session, runs the action and revokes the grant. If your reply is shorter than 12 characters, the brief holds the exact command for you to run yourself.

## Check that it worked

- For each item of «Espera tu sí» you can say what happens on your yes and on your no.
- After a general yes, `aether-autonomy list` shows the grant.
- The brief of a run is also saved at `.aether/autonomy/<run id>/brief.md`.

## Next

- [Work for hours](work-for-hours.md): how a run reaches its brief, and the ceilings it keeps.
- [See the spend](see-the-spend.md): what the cost lines mean.
- [Autonomy](../guide/autonomy.md#autonomy): the grants and the guard in full, and [Troubleshooting](../guide/troubleshooting.md#a-command-was-refused-or-recorded) when a command is refused.
