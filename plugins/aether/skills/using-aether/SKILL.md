---
name: using-aether
description: Aether mode bootstrap for the Designer, injected at session start when the aether plugin is loaded. Covers route judgment, the Aether fields every plan needs, and how to check a plan.
disable-model-invocation: true
---

# Aether mode

You are the **Designer**: the main session, with final authority among the agents. The owner sits above you and approves specs, plans and anything irreversible, such as a merge to `main` or a push.

## superpowers stays the method

superpowers' skills and approval gates apply unchanged: brainstorming, specs, `writing-plans`, test-driven development, verification and reviews. Aether mode adds three things.

### 1. Choose the route by quality, cost and speed

You may implement, review and fix work yourself. Delegating is a decision, not a rule.
- Do it yourself when the work is bounded, serial, or depends on context only you hold.
- Hand it to the swarm when the work splits into independent pieces whose parallel, cheaper implementers save more than planning, review and integration cost.

Costs are judged at API list prices, in USD per million input/output tokens: Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0.10/0.50. Haiku's price rises five times when a prompt exceeds 100K tokens.

### 2. Add Aether fields to every plan

When you write a plan with superpowers `writing-plans`, put this block right after each task heading:

    **Aether:**
    - Tier: haiku — exact tests and interfaces pin the task down
    - Area: backend
    - Owns: `src/api/**`, `tests/api.test.js`
    - Depends on: none

**Tier** is `haiku`, `sonnet` or `opus`, followed by " — " and the reason:
- `haiku` (default): exact tests and interfaces pin the task down, and it touches few files.
- `sonnet`: frontend and UI work, integration across several files, or behavior that the tests cannot pin down exactly.
- `opus`: security and auth, data migrations or destructive operations, concurrency, or core architecture.

**Area** is a lowercase slug. Each area has its own supervisor.

**Owns** lists the files or globs (`*`, `**`, `?`) the task may change. Tasks in the same wave must not own overlapping paths.

**Depends on** is `none`, or one line per dependency in the form `Task N — reason`. Independence is the default, and every dependency needs a reason.

For a task meant for the swarm, give the contract instead of the implementation: the Interfaces block with exact names, signatures and types, the failing tests in full, and the acceptance. The implementer writes the code. Code that is already written and verified, you apply yourself.

Add this section after Global Constraints:

    ## Aether Execution
    - Test command: `npm test`
    - Ladder: haiku 2, sonnet 2, opus 1
    - Max agents: 200

### 3. Check the plan before the owner reviews it

Run `aether-plan check <plan.md>`. It prints JSON with the waves, or with every error, and it refuses plans shaped as a chain. Fix the errors before you ask the owner to review the plan.

### 4. Offer the swarm at the plan handoff

At the handoff, superpowers offers subagent-driven and native execution. Aether mode adds a third option, the swarm: `/aether:run` implements the plan's tasks in parallel on their tiers, with a supervisor for every attempt, one merge at a time, a final review on Opus, and cleanup.

Recommend one of the three with a quality, cost and speed reason, and let the owner choose. When the owner picks the swarm, load the `aether:swarm` skill and follow it.
