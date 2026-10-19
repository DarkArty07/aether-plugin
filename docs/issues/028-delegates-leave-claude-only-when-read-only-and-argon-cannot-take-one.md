# A delegate task leaves Claude only when it is read-only, and Gemini 4 Argon cannot take one

**Type:** improvement (router, lanes)
**Date:** 2026-10-19
**Found in:** the owner's questions about why the router did not use other harnesses, in the Lead's session e591573c
**Status:** open
**GitHub:** not filed

## What happened

- The owner's intent: «lo que quiero es poder gastar las cuotas de los otros planes incluso con delegate y el swarm y el swarm de diseño, es decir incluir a los otros harnesses en los ciclos agénticos que sean externos al principal. El principal eres tú, los procesos que no hace el agente principal los puede tomar otro harness».
- The swarm and the design seats already can (A20, A39). A delegate task can when `route.js` finds all of these: the decider calls it read-only (`edits_files` under 0.5, confidence 0.5 or more), `lanes` is on, the call has no `isolation`, and the agent is a plain one (`general-purpose` or `Explore`).
- That is the scope of spec 006, not a defect: R19 and the Lead's assumption 3 of its card (reversible) put delegates that edit out, and its «Out of scope» lists «Delegados que editan en agy o grok y su worktree propio».
- A rung is eligible only if its model has the role `implementer` in the lane table. `gemini-4-argon` has `judge`, `writer` and `examiner`, so `agy/gemini-4-argon/high` (measured: general C, code C) is `eligible: false`. It would be the only external rung of level C. `config/lanes.json` notes that Argon is not yet measured against the native agent.
- Grok: on 2026-10-19 the owner had `grok` added to the `harnesses` option (`agy,grok`) of the installed plugin. Grok reports no quota and is used until a call fails for quota.

## Impact

- The owner's plans other than Claude are spent only by the swarm, the seats and read-only delegates of level A or B. Delegates of level C, and every delegate that edits, run on Claude.

## Proposals

1. A role for read-only delegates, apart from `implementer`, so Argon can take them without being a swarm implementer that replaces a native model. Eligibility would follow that role. Measure Argon first (`docs/evaluations/seats`).
2. Delegates that edit, on another harness, in their own worktree: its own spec. It needs the result back as a branch to verify and merge, the credentials kept out of the CLI's environment (as the lanes do), and a decision on who supervises, because a delegate has no supervisor.
3. Keep the Lead's reading of the three paths as it is: the swarm is not the answer to a single bounded task.

## Acceptance

- A read-only delegate of level C can land on Argon while its quota lasts, and runs on Claude when it does not.
- The rule that a delegate which edits stays on Claude is either kept on purpose or replaced by proposal 2.

## Environment

Claude Code 2.1.303, Aether plugin 0.12.2 installed, Sonnet 5.5 as the Lead, agy 1.4.2, grok 1.0.60, Linux (WSL2).
