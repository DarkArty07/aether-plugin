---
name: specify
description: "Aether mode: Write a feature's spec.md from the intent the owner confirmed, without stopping to ask."
---

## User Input

```text
$ARGUMENTS
```

## Outline

Never stop to ask. Where the intent is silent, choose a reasonable default and record it under Assumptions. Only a choice that is hard to reverse, surprising, or a real trade-off goes to the owner: mark it for the owner under Assumptions or Irreversible actions, and keep writing.

1. **Choose the feature folder yourself.** Never ask the owner for it.
   - List the folders under `specs/` whose names start with a three-digit number. `NNN` is the next free number: one more than the highest number in use. Use `001` when no number is in use. Keep three digits.
   - Choose `<topic>`: a short kebab-case name for the feature, such as `user-login`.
   - The folder is `specs/NNN-<topic>/`. Create it.

2. Write `.specify/feature.json` with that folder:
   ```json
   { "feature_directory": "specs/NNN-<topic>" }
   ```

3. Load `.specify/memory/constitution.md` when it exists. Follow its principles in every choice the spec makes.

4. Write `spec.md` in the folder, in this order:
   - A title with the feature's name. Then a metadata list:
     - `Date:` the day you write it, as YYYY-MM-DD.
     - `Status: Draft`
     - `Intent:` the intent, quoted as the owner confirmed it.
   - `## Criteria`: the owner's success criteria, C1 to Cn. Take them from the confirmed intent and the owner's own words. For each one, name the evidence that will prove it. For example: `- C1: A user can log in with a valid password. Evidence: a test logs in and sees the account page.`
   - `## User scenarios`: acceptance scenarios, each one as Given, When and Then.
   - `## Requirements`: one line per requirement, numbered R1 to Rn. Each requirement is testable. End it with the criteria it serves, such as `Serves: C2`. A requirement that serves no criterion goes to `## Proposals` instead.
   - `## Proposals`: the requirements that serve no criterion. They are not built. Write "None." when there are none.
   - `## Assumptions`: each default you chose where the intent is silent. Give its basis, and say whether the owner can reverse it.
   - `## Irreversible actions`: each action the work will need that cannot be undone, such as a merge to main, a push, a publication, a deployment, deleting data, using credentials or a paid call. For each one, give its class and the exact command. Write "None." when there are none.
   - `## Out of scope`: what the work will not do.

   Write the criteria, scenarios and requirements in the owner's language. Keep the headings as written here. For an owner who speaks Spanish, each requirement's tag reads `Sirve a: C2` in place of `Serves: C2`.

5. Commit `spec.md` and `.specify/feature.json` with a message such as `docs(specs): add the NNN-<topic> spec`.
