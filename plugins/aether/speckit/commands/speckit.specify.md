---
description: "Write a feature's spec.md from the intent the owner confirmed, without stopping to ask."
---

## User Input

```text
$ARGUMENTS
```

## Outline

Never stop to ask. Where the intent is silent, choose a reversible default, one the owner can undo at little cost, and record it under Assumptions. Only a choice that is hard to reverse, surprising, or a real trade-off is marked `[NEEDS CLARIFICATION: <question>]`, without guessing, and you keep writing.

The input is the intent card, `intent.md`, in the feature folder: the owner's own words, the understanding the owner confirmed, the criteria, what is out of scope, and the answers to the clarifying questions. If the message names a folder that has an `intent.md`, use that folder, skip steps 1 and 2 (do not write `.specify/feature.json`), and write only `spec.md` there. Otherwise follow every step.

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
     - `Intent:` the intent, quoted as the owner confirmed it, or a pointer to `intent.md` when the card is the input.
   - `## Criteria`: the owner's success criteria, C1 to Cn. Take them from the confirmed intent and the owner's own words. Each criterion quotes the owner's words from the card that it comes from. For each one, name the evidence that will prove it. For example: `- C1: A user can log in with a valid password. «I want to log in.» Evidence: a test logs in and sees the account page.`
   - `## User scenarios`: acceptance scenarios, each one as Given, When and Then.
   - `## Requirements`: one line per requirement, numbered R1 to Rn. Each requirement is testable. End it with the criteria it serves, such as `Serves: C2`. A requirement that serves no criterion goes to `## Proposals` instead.
   - `## Proposals`: the requirements that serve no criterion. They are not built. Write "None." when there are none.
   - `## Assumptions`: each default you chose where the intent is silent, as a reversible default. Give its basis, and say that the owner can reverse it. A choice that is hard to reverse, surprising, or a real trade-off is not a default: mark it `[NEEDS CLARIFICATION: <question>]` instead.
   - `## Irreversible actions`: each action the work will need that cannot be undone, such as a merge to main, a push, a publication, a deployment, deleting data, using credentials or a paid call. For each one, give its class and the exact command. Write "None." when there are none.
   - `## Out of scope`: what the work will not do.

   Criteria and requirements say what and why, never how. The evidence of a criterion may say how the result is checked. A tool or a test suite that does not exist yet is a requirement of its own, and it serves a criterion that comes from the owner's words.

   Write the criteria, scenarios and requirements in the owner's language. Keep the headings as written here. For an owner who speaks Spanish, each requirement's tag reads `Sirve a: C2` in place of `Serves: C2`.

5. Commit `spec.md` and `.specify/feature.json` with a message such as `docs(specs): add the NNN-<topic> spec`. When the card was the input, commit only `spec.md`.
