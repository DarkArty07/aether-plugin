---
title: See the spend
description: Read what a session cost at list price with the /spend panel and aether-report, and what the Asequible line of the brief adds
order: 107
---

# See the spend

At the end of this guide you can say what a session cost, which models and roles spent it, and how much went to other harnesses. It takes about five minutes, in a session that has already done some work.

## Before you start

- You have an Aether session that has done some work, or you are about to start one with `aeth`. The panel exists only in an Aether session; in a plain `claude` session `/spend` is not offered, on purpose.
- Know that the dollars are list price. They are not a percentage of your quota, and not what your subscription charges you.

## Steps

### 1. Open the panel

Inside the Aether session, type:

```
/spend
```

What you see: a pane with the list-price spend of this session. The total is the Lead's turns and the agents', split by model, by effort and by role, plus the calls to other harnesses and their dollars. It calls no model and writes nothing to the chat. `Esc` or `x` closes it.

If the session has spent nothing yet, the pane says `No spend recorded yet`. It never shows US$ 0.00 or another session's figure.

### 2. Read the numbers

- **A model with no price** is listed, but it is not added to the total.
- **`incomplete`** means part of the record could not be read. The total is what was read.
- **The count of resumptions** is approximate. A resumption is a gap of more than an hour between two events of the session, and the pane labels the count `approximate`.
- **A session keeps one figure.** The same id keeps adding when you resume it with `/resume`, `/compact` or `aeth --resume`. `/clear` and `--fork-session` start a new id, and the earlier one stays its own session.

### 3. Get the same figure from a shell

`aether-report --spend` prints it as one JSON object: `usd` is the total, with `leadUsd`, `agentsUsd`, `byModel`, `byEffort`, `byRole` and `harness` (its `calls` and `usd`). Inside a session, ask the Lead to run it, because the `aether-*` commands are on the Bash tool's `PATH` there. In a plain shell, run its file by path, where `<version>` is the one `claude plugin list` shows:

```
node ~/.claude/plugins/cache/aether-plugin/aether/<version>/bin/aether-report --spend --session <id>
```

Without `--session` it reports the session that wrote last, which may be another one if you run several at once. The panel always uses its own session.

### 4. See the quota apart from the dollars

List price says what the tokens would cost. The quota says how much of a plan you have left, and `/harnesses` shows it for each harness (see [Other harnesses](other-harnesses.md)). To see the delegate tasks, where each ran and how it climbed from Haiku, use `aether-report --delegates`.

### 5. Find the same figures in the brief

Every closing report carries a line for the session:

```
Sesión <id>: US$ <total> a precio de lista (Lead US$ <lead>, agentes US$ <agentes>). El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>).
```

The RADAR line **Asequible** of the brief gives the dollars, the quota used, and the model and effort of each delegated task. A task you placed on Sonnet or Opus in your own words is counted there too. Its neighbour **Delegación** gives the calls and tokens that ran on other harnesses, and the quota left at the start and at the end.

A run has a second figure, its ceiling (US$ 50 unless you named another). It covers the swarm, the calls to other harnesses and the external design seats, and it leaves out the Lead's own turns. The line of the session says it is not that figure («y no es la cifra del tope»). For the meaning of each RADAR line, see [Read the brief](read-the-brief.md).

## Check that it worked

- `/spend` opens and shows a total above zero after the session has worked.
- The total is split by model, effort and role, and with superdelegation on it shows the calls to other harnesses.
- `aether-report --spend --session <id>` prints `"recorded":true`.
- The closing report has the line «Sesión …» with the same total.

If `/spend` is not offered, read [The /harnesses panel is not offered](../guide/troubleshooting.md#the-harnesses-panel-is-not-offered); it covers `/spend` too.

## Next

- [Read the brief](read-the-brief.md): the RADAR lines and the rest of the brief.
- [Work for hours](work-for-hours.md): the ceilings of a run and the quota brake.
- [Other harnesses](other-harnesses.md): the quota of each plan.
- [The /spend panel](../guide/lanes.md#the-spend-panel) and [Delegates](../guide/delegates.md#reading-the-log): the reference for both figures.
