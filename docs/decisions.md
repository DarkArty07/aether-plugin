# Decisions

The decisions D1–D15 were taken in the design session of 2026-10-05. The design spec of 2026-10-07 updated several of them, as each one's **Update** says, and added A1–A10 (at the end). The [Lead and Designer spec](superpowers/specs/2026-10-08-lead-and-designer-design.md) of 2026-10-08 updated A4, A5 and A8, and added A11–A17. Each decision has a status:

- **Decided**: settled.
- **Direction**: agreed in principle; details still open.
- **Pending**: needs a prototype or more analysis.

The evidence behind the technical claims is in
[claude-code-research.md](claude-code-research.md), and the motivation is in
[aether-retrospective.md](aether-retrospective.md).

## D1. Build on Claude Code, not Hermes

**Decided.** Claude Code is a harness made for software, and as the most-used one it
has a plugin ecosystem that works out of the box: the owner uses ECC daily, Graphify
installs into it natively, and Spec Kit already runs as Claude Code skills. With
Hermes, every integration had to be built, patched and maintained. Claude Code cannot
be forked, but plugins, hooks, mods and workflows allow deep customization.

## D2. Keep the method

**Decided.** The method stays:
- spec-driven development with Spec Kit;
- Graphify for orientation;
- an expensive conversational model for design;
- independent review;
- saved learnings.

**Update (2026-10-07).** superpowers replaces Spec Kit as the method: brainstorming, specs, `writing-plans`, test-driven development, verification and reviews. It is the authority on engineering practice and on the owner's approval gates (A2).

## D3. A plugin plus the Aether Router, with no wrapper

**Decided.** The plugin holds the behavior and chooses the models; the router gives
access to the providers. The only setup outside the plugin is pointing
`ANTHROPIC_BASE_URL` at the router in the user's settings, which a plugin setup command
can write.

**Update (2026-10-07).** Phase 1 does not need the router. Aether Plugin v0.1 runs on Claude models alone, through the owner's own Claude Code login. The router and non-Anthropic models (D4, D9, D10) wait for a later phase.

## D4. Non-Anthropic models are required

**Decided.** The owner considers them vital. They run through the Aether Router. The
existing `claude-aether` wrapper only proved the mechanism and is not adopted.
Anthropic does not support non-Claude models behind a gateway, so the router has to
keep up with Claude Code releases.

## D5. The task chooses the model

**Direction.** Roles set defaults, and each unit's domain and risk choose its model:
- frontend and critical units get a strong model;
- mechanical units get a cheap one;
- a unit that fails review moves up a tier.

The tentative split is Opus for the design agent and Sonnet below it. The mechanism is
the `agent.spawn` mod, which is **Pending** until prototype step 1 confirms it.

**Update (2026-10-07, built 2026-10-08).** Each plan task carries a tier (`haiku`, `sonnet` or `opus`) with its reason. The workflow enforces an escalation ladder per unit: by default Haiku 2 attempts, Sonnet 2, Opus 1, then blocked. Haiku implements by default; a Sonnet supervisor reviews every attempt; Opus does the final review. The workflow passes each agent's model directly, so no mod is needed for routing.

## D6. Swarm for speed and quality

**Direction.**

- **Contracts first.** A short sequential phase fixes interfaces, data shapes and file
  ownership. Spec Kit's plan already produces `contracts/` and `data-model.md`. Parallel
  work then runs against them.
- **A strong model decomposes.** Decomposition is a single call, and it decides how
  well everything else parallelizes.
- **Independence is the default.** Every dependency needs a stated reason.
- **A deterministic chain check.** A plan that comes out as a chain is rejected, and the
  work is decomposed once more.
- **A quality swarm on a single unit.** Independent or adversarial reviewers. For
  critical or frontend units, several attempts run in parallel and the best one is kept.
- **The orchestrator.** A dynamic workflow script is the current direction. Agent teams
  still have to be evaluated (**Pending**).

**Update (2026-10-07, built 2026-10-08).** The orchestrator is the `/aether:run` dynamic workflow.
- `aether-plan` refuses chain-shaped plans, and tasks of a wave that own overlapping files.
- Waves run in order, and the units of a wave run in parallel, each in its own worktree.
- Merges are serialized, and a final review covers the whole run.
- Several parallel attempts per unit are deferred. Agent teams were not needed.

## D7. Mechanism in code, judgment in the model

**Decided.** Status, waking, retries and budgets are hooks or scripts, never prompt
instructions. The model decides only what needs judgment.

## D8. Bounded autonomy

**Decided.** Each objective carries a budget and a verifiable definition of done. When
the budget runs out, the system stops and reports. When a unit hits a genuine
question, it comes back as blocked: the design agent asks the owner and relaunches only
what is still pending.

## D9. Usage limits go through the router

**Decided.** The router's account rotation across providers is what makes a large swarm
affordable.

## D10. Claude models through the subscription pass-through

**Pending**; not needed for phase 1 (see D3's update). When only `ANTHROPIC_BASE_URL` is set, Claude Code keeps sending the
user's claude.ai login, and the gateway forwards Claude requests unchanged. That keeps
Claude traffic on the official client and the user's own subscription. It needs two
router changes:
- a pass-through lane for `claude-*` model IDs;
- authentication of the local client through a custom header
  (`ANTHROPIC_CUSTOM_HEADERS`).

Prototype step 2 tests it.

## D11. Our own Telegram layer

**Deferred (2026-10-07).** Notifications are out of scope for v0.1. The original decision: **Decided**; scope pending. Nothing is inherited from Hermes. A small layer handles
notices and monitors, driven by hooks so the model never chooses how to report. If
two-way chat is ever needed, there is an official two-way Telegram channel plugin, in
research preview.

## D12. Local runtime on WSL2

**Decided.** It runs locally, like any Claude Code session. "While the owner is away"
means away from the keyboard. The cloud features (Projects, Routines) are not needed.

## D13. A public portfolio project, documented in English

**Decided.** The project is public as part of the owner's portfolio, and its
documentation is in English. Distributing it as a plugin from a GitHub repository
should avoid Aether's release machinery.

## D14. One place per kind of knowledge

**Direction.** Each place has one purpose:
- `CLAUDE.md`: how to build and test;
- `specs/`: what to build;
- auto memory: learnings and preferences.

A dedicated MCP server is added only if structured state turns out to be necessary.

**Update (2026-10-07).** Specs and plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`, where superpowers writes them.

## D15. Name and identity

**Update (2026-10-07).** The project is named **Aether Plugin** (A1). The folder and the future repository are `aether-plugin`, and the plugin id is `aether`. The text below records the earlier working name.

**Decided** for now. The working name is "Multi-Agent Software Development for Claude
Code (Prototype)" and the repository is `multiagent-dev-prototype`. "Claude Code"
appears only in the description: Anthropic's branding guidance for third-party products
built on its agent tooling does not allow it in a product's name.

A real identity comes later, inspired by Isaac Asimov and retrofuturism. Ideas so far:
- Multivac as the name;
- Daneel as the design agent;
- the Three Laws as the constitution;
- "Minimum Necessary Change" (*The End of Eternity*) against over-engineering.

These names are already used by agent or developer projects: Weft, Plano, Tutti,
Plinth, Obra, Seldon, Positron, Trantor, Prime Radiant and `specswarm`.

## Decisions of the design spec (2026-10-07)

The owner took these with the [design spec](superpowers/specs/2026-10-07-aether-plugin-design.md), which states each one in full.

| ID | Decision | Status |
|---|---|---|
| A1 | Name **Aether Plugin**; plugin id `aether`; folder and repository slug `aether-plugin`. "Claude Code" stays out of the name. | Decided |
| A2 | superpowers is the base and the authority on practice and approval gates. Aether adds only the multi-agent organization. The exceptions are parallel implementation and contract plans (A10). | Decided |
| A3 | ECC is out for now. | Decided |
| A4 | Roles, top down: the owner; the Designer (the main session, on Opus); supervisors (Sonnet); implementers (Haiku by default, Sonnet or Opus when escalated); and the Opus final reviewer. | Decided; built 2026-10-08; updated by A11–A16 (2026-10-08) |
| A5 | The Designer may implement, review and fix work itself. Handing work to the swarm is a quality, cost and speed decision. | Decided; updated by A11–A16 (2026-10-08) |
| A6 | Cost is judged at API list prices from OpenRouter. | Decided; `config/prices.json` |
| A7 | Unit worktrees, unit branches and temporary files are deleted as soon as they stop being used, in code. | Decided; built and tested, including after a killed run |
| A8 | Aether mode is chosen per session with the `aether-mode` shell function, which loads the plugin and turns on dynamic workflows. | Decided; built; updated by A11–A16 (2026-10-08) |
| A9 | The prototype becomes the published project only if a trial shows lower cost and lower wall-clock time than normal mode, at equal quality. | Decided. Trial 1 (2026-10-08) passed the gate: 3.9 times faster and 2.8 times cheaper at equal quality. See [the evaluation](evaluations/2026-10-08-trial-1.md) |
| A10 | Swarm plans state each task's contract (Interfaces, exact failing tests, acceptance), not its implementation code. | Decided |
| A11 | The main session is the **Lead**: Sonnet 5.5 at `xhigh`, with the 1M window. It holds the conversation, explores, chooses the route, runs the execution and reports. It may design and implement spikes and bounded work. | Decided; built 2026-10-08 |
| A12 | The **Designer** is the plugin agent `aether:designer`: Opus 5.5 at `max`, in its own context, with a 1-hour prompt cache. It does the architectural design: approaches, design, spec and plan. Among agents it has the final word on design; the Lead has it on route and process. | Decided; built 2026-10-08 |
| A13 | The hand-off happens when the owner confirms the Lead's written understanding, the "write back your understanding" step of superpowers brainstorming, on the architectural path. From then on the Lead relays both ways and does not design. | Decided; built 2026-10-08 |
| A14 | Only the Designer writes specs and plans. A PreToolUse hook (`aether-guard`) refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every other agent, the main session included. | Decided; built 2026-10-08 |
| A15 | Long tool loops leave the Lead's context (R6): the swarm, superpowers subagent-driven development, or one subagent with a self-contained brief. | Decided; built 2026-10-08 |
| A16 | `aether-mode` launches the Lead with `--model sonnet --effort xhigh` and turns the advisor tool off. | Decided; built 2026-10-08 |
| A17 | The split is kept only if a design trial shows lower cost at equal quality (§11). If quality drops, the split is not merged. | Decided. Trial 3 (2026-10-08) found no quality drop: 10 of 10 intent items against 9, and a tie in the blind pairwise judgment. In that short design session the split cost the same: $10.67 against $10.23. The owner kept the split. See [the evaluation](evaluations/2026-10-08-trial-3.md) |
