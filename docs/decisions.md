# Decisions

The decisions D1–D15 were taken in the design session of 2026-10-05. The design spec of 2026-10-07 updated several of them, as each one's **Update** says, and added A1–A10 (at the end). The [Lead and Designer spec](superpowers/specs/2026-10-08-lead-and-designer-design.md) of 2026-10-08 updated A4, A5 and A8, and added A11–A17. The [effort per task spec](superpowers/specs/2026-10-08-effort-per-task-design.md) of 2026-10-08 updated D5 and added A18. The [lanes spec](superpowers/specs/2026-10-08-lanes-design.md) of 2026-10-08 updated D5, A4, A12 and A14, and added A20–A22. The [autonomy spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) of 2026-10-09 updated D2, A2, A13, A14 and A22, and added A23–A25. The [separation spec](superpowers/specs/2026-10-09-separation-design.md) of 2026-10-09 updated A8 and added A26. Each decision has a status:

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

**Update (2026-10-09, autonomy).** The Lead holds superpowers' approval gates as the owner's delegate. The owner's reviews are the permission to work at the start and the brief at the end. See A23.

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

**Update (2026-10-08, effort per task).** The task also chooses its implementer's effort, on its Tier line: `xhigh` by default on every model, lowered where the tests pin the work, and `max` only with a reason. A failed attempt runs again at `xhigh`, and an escalation runs the next model at `xhigh`. A task's Review line can raise its supervisor's effort from `high`. See A18.

**Update (2026-10-08, lanes).** A rung's attempt may run on a lane: the external model the lane table names for that model and role, while its quota lasts. The ladder itself does not change. See A20 and A21.

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
| A2 | superpowers is the base and the authority on practice and approval gates. Aether adds only the multi-agent organization. The exceptions are parallel implementation and contract plans (A10). | Decided; updated by A23 (2026-10-09) |
| A3 | ECC is out for now. | Decided |
| A4 | Roles, top down: the owner; the Designer (the main session, on Opus); supervisors (Sonnet); implementers (Haiku by default, Sonnet or Opus when escalated); and the Opus final reviewer. | Decided; built 2026-10-08; updated by A11–A16 (2026-10-08); updated by A20 (2026-10-08) |
| A5 | The Designer may implement, review and fix work itself. Handing work to the swarm is a quality, cost and speed decision. | Decided; updated by A11–A16 (2026-10-08) |
| A6 | Cost is judged at API list prices from OpenRouter. | Decided; `config/prices.json` |
| A7 | Unit worktrees, unit branches and temporary files are deleted as soon as they stop being used, in code. | Decided; built and tested, including after a killed run. Trial 2 found a gap: the Designer's own scratch files are not swept yet. See [trial 2](evaluations/2026-10-08-trial-2.md#other-follow-ups), other follow-ups, item 2 |
| A8 | Aether mode is chosen per session with the `aether-mode` shell function, which loads the plugin and turns on dynamic workflows. | Decided; built; updated by A11–A16 (2026-10-08) and by A26 (2026-10-09): it loads the installed release Since 0.7.0 (A27), the plugin is installed from the `aether-plugin` marketplace, and Aether mode is the session agent `aether:lead`; `--plugin-dir` is for development only. |
| A9 | The prototype becomes the published project only if a trial shows lower cost and lower wall-clock time than normal mode, at equal quality. | Decided. Trial 1 (2026-10-08) passed the gate: 3.9 times faster and 2.8 times cheaper at equal quality. See [the evaluation](evaluations/2026-10-08-trial-1.md). Trial 2 (2026-10-08), a three.js game judged on graphics, creativity, playability and 3D: 7.6 times faster and 5.3 times cheaper, but graded 23/40 against normal mode's 32/40, so not at equal quality. See [trial 2](evaluations/2026-10-08-trial-2.md). **The owner's ruling (2026-10-08):** the normal build's extra quality does not justify its time and cost. The next work raises Aether's quality with techniques that keep its time and cost. See [trial 2's next steps](evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost) |
| A10 | Swarm plans state each task's contract (Interfaces, exact failing tests, acceptance), not its implementation code. | Decided. Trial 2: on work judged by taste, a brief that holds only the contract is one of two candidate causes of a quality gap. The other is the implementers' fixed effort. See [trial 2's next steps](evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost) |
| A11 | The main session is the **Lead**: Sonnet 5.5 at `xhigh`, with the 1M window. It holds the conversation, explores, chooses the route, runs the execution and reports. It may design and implement spikes and bounded work. | Decided; built 2026-10-08 |
| A12 | The **Designer** is the plugin agent `aether:designer`: Opus 5.5 at `max`, in its own context, with a 1-hour prompt cache. It does the architectural design: approaches, design, spec and plan. Among agents it has the final word on design; the Lead has it on route and process. | Decided; built 2026-10-08; updated by A22 (2026-10-08) |
| A13 | The hand-off happens when the owner confirms the Lead's written understanding, the "write back your understanding" step of superpowers brainstorming, on the architectural path. From then on the Lead relays both ways and does not design. | Decided; built 2026-10-08; updated by A23 (2026-10-09): the Lead decides as the owner's delegate instead of relaying |
| A14 | Only the Designer writes specs and plans. A PreToolUse hook (`aether-guard`) refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every other agent, the main session included. | Decided; built 2026-10-08; updated by A22 (2026-10-08) and A24 (2026-10-09) |
| A15 | Long tool loops leave the Lead's context (R6): the swarm, superpowers subagent-driven development, or one subagent with a self-contained brief. | Decided; built 2026-10-08 |
| A16 | `aether-mode` launches the Lead with `--model sonnet --effort xhigh` and turns the advisor tool off. | Decided; built 2026-10-08 Since 0.7.0, the Lead is the agent `aether:lead` (`model: sonnet`), started with `--effort xhigh`. No plugin can turn the advisor off: the user runs `/advisor off` if one is configured. |
| A17 | The split is kept only if a design trial shows lower cost at equal quality (§11). If quality drops, the split is not merged. | Decided. Trial 3 (2026-10-08) found no quality drop: 10 of 10 intent items against 9, and a tie in the blind pairwise judgment. In that short design session the split cost the same: $10.67 against $10.23. The owner kept the split. See [the evaluation](evaluations/2026-10-08-trial-3.md) |
| A18 | **Effort per task.** Each plan task sets its implementer's effort by its complexity, `xhigh` by default on every model. Sonnet and Opus never run below `high`, and `max` needs a reason. Every later attempt runs at `xhigh`, or stays at a declared `max`. The supervisor reviews at `high`, raised per task by a Review line; ops stays at `low`, and the final reviewer at `high`. The workflow passes the effort on every call, and `aether-report` measures cost and time by effort. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-effort-per-task-design.md) |
| A19 | **The Designer runs at `xhigh`, not `max`.** The first long design session on version 0.3.0 (2026-10-08) cost $18.92 at list prices, and the Designer was 70% of it ($13.33, 324K output tokens) and 46 of the 82 minutes. Artificial Analysis rates Opus 5.5 at `xhigh` 1.6 index points below `max`, with a median first-token time of 78 s against 561 s. This changes A12's effort only; the rest of A12 stands. Going back to `max` is one line in `agents/designer.md`. | Decided 2026-10-08; to be measured on the next design session with `aether-report`'s cost by effort |
| A20 | **Lanes.** An external harness may run any call of the swarm, and the Designer's rounds, in place of the native agent. The call is the same attempt, with the same budget and the same effort; a lane adds no rung and no attempt. An infrastructure failure or exhausted quota moves the same call to the native agent, without spending the ladder. Containment is the worktree plus checks from outside: agy runs with `--dangerously-skip-permissions` and without `--sandbox`, and the owner accepted the residual risk for 0.4.0. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-lanes-design.md) |
| A21 | **Who takes a call.** `config/lanes.json` names, for each native model and role, the one external model that may replace it: Gemini 3.8 Flash replaces Haiku as implementer only, and Sonnet 5.5 and Opus 5.5 in agy replace their native selves. agy's `high` runs Claude's `high` and `xhigh`; calls at `max` are always native. A quota group is used while both its windows stay above a 5% reserve. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-lanes-design.md) |
| A22 | **The Designer may run on agy,** on Opus 5.5 `high`, in rounds relayed by the Lead as today. Each round is a transaction that may change only specs and plans. When agy cannot run a round, the Lead starts the native Designer from the files, and that design stays native. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-lanes-design.md); updated by A23 (2026-10-09): the Lead decides the rounds instead of relaying them |
| A23 | **The Lead decides as the owner's delegate.** It holds superpowers' approval gates with the owner's intent, chooses among the Designer's options and answers its questions. The Designer keeps the final word on design, and its reply's `Decide` line says who closes each round. Only what the intent does not cover, what conflicts with it, and unauthorized irreversible actions reach the owner. Failures with a defined fallback never do. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) |
| A24 | **Standing authorizations** are recorded per repository, from the owner's quoted words verified against their transcript, by `aether-autonomy` alone; aether-guard refuses edits to the registry and the run states. Seven irreversible classes; everything local and reversible proceeds. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) |
| A25 | **Autonomous runs.** The owner's permission to work for hours confirms the intent and the ceilings (8 hours and US$ 50 by default; the owner's numbers override them). The run keeps a diary, keeps going while work remains, stops at a ceiling, when done or honestly, and ends with a brief. Without the permission, the Lead stops at the plan with a short brief. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) |
| A26 | **The installed release.** `aether-mode` loads a release installed apart from the project. `scripts/aether-install.js` extracts a tagged version from the local clone, with no network, into `installed/<version>-<commit>/` in the data directory, launcher included, and keeps `current` and `previous` links. Work on the project, merges to `main` included, never changes what the owner runs until the next install; `rollback` swaps the two links, and `aether-mode --dev` loads the development tree on purpose. The Artificial Analysis key lives in the data directory. `.aether/` stays in the main checkout of each project Aether works on. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-separation-design.md) |
| A27 | **Aether mode is the session agent `aether:lead`.** The plugin installs with Claude Code's own commands from the `aether-plugin` marketplace and stays enabled. In any other session it is dormant: a marker per session, written by the session-start hook for `aether:lead`, gates the guard and the usage meter, and the meter withholds Aether's agents. | Decided 2026-10-09; built in 0.7.0 |
| A28 | **Lanes are a plugin option,** `lanes`, off by default, and Linux only. The session-start hook passes it to the session's commands as `AETHER_LANES`. | Decided 2026-10-09; built in 0.7.0 |
| A29 | **Data lives in the plugin's own data directory,** `~/.claude/plugins/data/aether-aether-plugin/` for an install from the marketplace, resolved by one rule in `dataDir()` and in the mod. `AETHER_DATA_DIR` overrides it. | Decided 2026-10-09; built in 0.7.0 |
| A30 | **The mod runs the swarm's `aether-wt` and `aether-lane` commands, without a model.** When `aether:run` spawns `aether:ops` in an Aether session, and `hooks/ops-command.js` accepts its prompt, the mod's `turn.step` answers the agent's first step itself: it runs the bin with `$.process.run`, with no shell and a 10-minute timeout, and ends the agent with the `StructuredOutput` call the workflow expects. The parser accepts only the exact text `opsPrompt` writes and the nine command forms the workflow sends, with every argument checked. Any other prompt, an agent no workflow spawned, and a `$.process.run` that is refused or cannot start go to the Haiku `ops` agent, as before. A command still running at the timeout is reported as stopped, with exit 124, and is never run again. For the accepted commands the harness's "no user authority" safeguard no longer applies; the controls are the closed list, the Aether session's mark, and the owner's start of the run. | Decided 2026-10-10 (handoff §6, approved in principle by the owner); see [the evaluation](evaluations/2026-10-10-ops-in-mod.md) |
