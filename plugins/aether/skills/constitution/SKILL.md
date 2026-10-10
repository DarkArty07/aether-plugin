---
name: constitution
description: "Aether mode: Create or update the project's constitution: the principles every spec, plan and task follows."
---

## User Input

```text
$ARGUMENTS
```

## Outline

Never stop to ask. Where the owner's words are silent, choose a reasonable principle and record it under Assumptions.

1. **Read the current constitution.** Read `.specify/memory/constitution.md` when it exists. Keep its principles, unless the owner's words change one.

2. Write `.specify/memory/constitution.md` from the owner's words. Create the folders when they do not exist. The file has these parts:
   - A title with the project's name.
   - `## Principles`: a short list of principles. Each principle is one bullet: the principle in bold, then `Rationale:` and one line of reason. Keep the existing principles unless the owner changed them.
   - `## Assumptions`: each thing you assumed while you wrote the file, and why.

3. Commit `.specify/memory/constitution.md` with a message such as `docs: update the project constitution`.
