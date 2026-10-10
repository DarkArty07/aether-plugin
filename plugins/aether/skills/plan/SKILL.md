---
name: plan
description: "Aether mode: Write plan.md for an approved spec: the design, the files, and how it will be verified and deployed."
---

## User Input

```text
$ARGUMENTS
```

## Outline

Never stop to ask. Where a choice is open, pick a reasonable default and record it under Assumptions.

1. **Find the feature folder.** Read `.specify/feature.json` for it. If the input names a folder, use that one instead.

2. **Load the context:**
   - `.specify/memory/constitution.md`, when it exists;
   - `<folder>/spec.md`. Do not change the spec. If it is wrong, say so under Risks.

3. Write `<folder>/plan.md` in this order, in the language of the spec:
   - `## Technical context`: the stack, the dependencies and the project structure.
   - `## Design`: the decisions. For each one, give its reason and the criteria it serves, such as `Serves: C2`.
   - `## Files`: each file the work creates or changes, and why.
   - `## Verification`: the test command, and what proves each criterion.
   - `## Deployment`: write this section only when the project deploys. Give the deploy command and the check that proves the deployment worked. A deployment is an irreversible action. Say so here, and check that the spec lists it under Irreversible actions.
   - `## Assumptions`: each default the plan chose.
   - `## Risks`: what could go wrong, and what the plan does about it.

   Do not repeat the spec: point to its sections.

4. Commit `plan.md` with a message such as `docs(specs): add the NNN-<topic> plan`.
