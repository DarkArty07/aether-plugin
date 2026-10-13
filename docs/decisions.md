# Decisions

The decisions D1–D15 were taken in the design session of 2026-10-05. The design spec of 2026-10-07 updated several of them, as each one's **Update** says, and added A1–A10 (at the end). The [Lead and Designer spec](superpowers/specs/2026-10-08-lead-and-designer-design.md) of 2026-10-08 updated A4, A5 and A8, and added A11–A17. The [effort per task spec](superpowers/specs/2026-10-08-effort-per-task-design.md) of 2026-10-08 updated D5 and added A18. The [lanes spec](superpowers/specs/2026-10-08-lanes-design.md) of 2026-10-08 updated D5, A4, A12 and A14, and added A20–A22. The [autonomy spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) of 2026-10-09 updated D2, A2, A13, A14 and A22, and added A23–A25. The [separation spec](superpowers/specs/2026-10-09-separation-design.md) of 2026-10-09 updated A8 and added A26. The [RADAR roadmap](roadmap/2026-10-10-radar.md) of 2026-10-10 updated D2, D5, D8, D14 and several A decisions, as their status says, and added A31–A38; A30 is the decision of the ops mod, in its own pull request. Each decision has a status:

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

**Update (2026-10-10, RADAR).** Spec Kit is the method again: its layout, and an Aether preset shipped in the plugin, without its CLI. superpowers is no longer a dependency; its gates could not be switched off, and Aether needs autonomy instead. The Lead writes the spec, the Writer writes the plan and the tasks, and the Judge reviews them. See A31–A33.

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

**Update (2026-10-10, RADAR).** The final review no longer always runs on Opus: its model and effort follow the run's risk. Lanes may run on several harnesses. See A36 and A37.

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

**Update (2026-10-10, RADAR).** A unit also stops when the same failure repeats, instead of climbing the whole ladder. See A36.

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

**Update (2026-10-10, RADAR).** New specs, plans and tasks live in `specs/NNN-<topic>/`, as Spec Kit lays them out, and a project's principles in `.specify/memory/constitution.md`. `docs/superpowers/` stays as history and is not migrated. See A33.

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
| A2 | superpowers is the base and the authority on practice and approval gates. Aether adds only the multi-agent organization. The exceptions are parallel implementation and contract plans (A10). | Decided; updated by A23 (2026-10-09); superseded by A33 (2026-10-10) |
| A3 | ECC is out for now. | Decided |
| A4 | Roles, top down: the owner; the Designer (the main session, on Opus); supervisors (Sonnet); implementers (Haiku by default, Sonnet or Opus when escalated); and the Opus final reviewer. | Decided; built 2026-10-08; updated by A11–A16 (2026-10-08); updated by A20 (2026-10-08); updated by A31, A32 and A36 (2026-10-10) |
| A5 | The Designer may implement, review and fix work itself. Handing work to the swarm is a quality, cost and speed decision. | Decided; updated by A11–A16 (2026-10-08) |
| A6 | Cost is judged at API list prices from OpenRouter. | Decided; `config/prices.json` |
| A7 | Unit worktrees, unit branches and temporary files are deleted as soon as they stop being used, in code. | Decided; built and tested, including after a killed run. Trial 2 found a gap: the Designer's own scratch files are not swept yet. See [trial 2](evaluations/2026-10-08-trial-2.md#other-follow-ups), other follow-ups, item 2 |
| A8 | Aether mode is chosen per session with the `aether-mode` shell function, which loads the plugin and turns on dynamic workflows. | Decided; built; updated by A11–A16 (2026-10-08) and by A26 (2026-10-09): it loads the installed release Since 0.7.0 (A27), the plugin is installed from the `aether-plugin` marketplace, and Aether mode is the session agent `aether:lead`; `--plugin-dir` is for development only. |
| A9 | The prototype becomes the published project only if a trial shows lower cost and lower wall-clock time than normal mode, at equal quality. | Decided. Trial 1 (2026-10-08) passed the gate: 3.9 times faster and 2.8 times cheaper at equal quality. See [the evaluation](evaluations/2026-10-08-trial-1.md). Trial 2 (2026-10-08), a three.js game judged on graphics, creativity, playability and 3D: 7.6 times faster and 5.3 times cheaper, but graded 23/40 against normal mode's 32/40, so not at equal quality. See [trial 2](evaluations/2026-10-08-trial-2.md). **The owner's ruling (2026-10-08):** the normal build's extra quality does not justify its time and cost. The next work raises Aether's quality with techniques that keep its time and cost. See [trial 2's next steps](evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost) |
| A10 | Swarm plans state each task's contract (Interfaces, exact failing tests, acceptance), not its implementation code. | Decided. Trial 2: on work judged by taste, a brief that holds only the contract is one of two candidate causes of a quality gap. The other is the implementers' fixed effort. See [trial 2's next steps](evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost) |
| A11 | The main session is the **Lead**: Sonnet 5.5 at `xhigh`, with the 1M window. It holds the conversation, explores, chooses the route, runs the execution and reports. It may design and implement spikes and bounded work. | Decided; built 2026-10-08; updated by A31 (2026-10-10) |
| A12 | The **Designer** is the plugin agent `aether:designer`: Opus 5.5 at `max`, in its own context, with a 1-hour prompt cache. It does the architectural design: approaches, design, spec and plan. Among agents it has the final word on design; the Lead has it on route and process. | Decided; built 2026-10-08; updated by A22 (2026-10-08); superseded by A32 (2026-10-10): the Writer and the Judge replace the Designer |
| A13 | The hand-off happens when the owner confirms the Lead's written understanding, the "write back your understanding" step of superpowers brainstorming, on the architectural path. From then on the Lead relays both ways and does not design. | Decided; built 2026-10-08; updated by A23 (2026-10-09): the Lead decides as the owner's delegate instead of relaying; superseded by A31 and A32 (2026-10-10) |
| A14 | Only the Designer writes specs and plans. A PreToolUse hook (`aether-guard`) refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every other agent, the main session included. | Decided; built 2026-10-08; updated by A22 (2026-10-08) and A24 (2026-10-09); updated by A33 (2026-10-10): the Lead and the Writer write specs, plans and tasks |
| A15 | Long tool loops leave the Lead's context (R6): the swarm, superpowers subagent-driven development, or one subagent with a self-contained brief. | Decided; built 2026-10-08 |
| A16 | `aether-mode` launches the Lead with `--model sonnet --effort xhigh` and turns the advisor tool off. | Decided; built 2026-10-08 Since 0.7.0, the Lead is the agent `aether:lead` (`model: sonnet`), started with `--effort xhigh`. No plugin can turn the advisor off: the user runs `/advisor off` if one is configured. |
| A17 | The split is kept only if a design trial shows lower cost at equal quality (§11). If quality drops, the split is not merged. | Decided; the Writer and the Judge replace the split's Designer (A32), and a measured design session is on the owner's list. Trial 3 (2026-10-08) found no quality drop: 10 of 10 intent items against 9, and a tie in the blind pairwise judgment. In that short design session the split cost the same: $10.67 against $10.23. The owner kept the split. See [the evaluation](evaluations/2026-10-08-trial-3.md) |
| A18 | **Effort per task.** Each plan task sets its implementer's effort by its complexity, `xhigh` by default on every model. Sonnet and Opus never run below `high`, and `max` needs a reason. Every later attempt runs at `xhigh`, or stays at a declared `max`. The supervisor reviews at `high`, raised per task by a Review line; ops stays at `low`, and the final reviewer at `high`. The workflow passes the effort on every call, and `aether-report` measures cost and time by effort. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-effort-per-task-design.md); updated by A36 (2026-10-10): the final reviewer's model and effort follow the run's risk |
| A19 | **The Designer runs at `xhigh`, not `max`.** The first long design session on version 0.3.0 (2026-10-08) cost $18.92 at list prices, and the Designer was 70% of it ($13.33, 324K output tokens) and 46 of the 82 minutes. Artificial Analysis rates Opus 5.5 at `xhigh` 1.6 index points below `max`, with a median first-token time of 78 s against 561 s. This changes A12's effort only; the rest of A12 stands. Going back to `max` is one line in `agents/designer.md`. | Decided 2026-10-08; superseded by A32 (2026-10-10) |
| A20 | **Lanes.** An external harness may run any call of the swarm, and the Designer's rounds, in place of the native agent. The call is the same attempt, with the same budget and the same effort; a lane adds no rung and no attempt. An infrastructure failure or exhausted quota moves the same call to the native agent, without spending the ladder. Containment is the worktree plus checks from outside: agy runs with `--dangerously-skip-permissions` and without `--sandbox`, and the owner accepted the residual risk for 0.4.0. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-lanes-design.md); updated by A37 (2026-10-10) |
| A21 | **Who takes a call.** `config/lanes.json` names, for each native model and role, the one external model that may replace it: Gemini 3.8 Flash replaces Haiku as implementer only, and Sonnet 5.5 and Opus 5.5 in agy replace their native selves. agy's `high` runs Claude's `high` and `xhigh`; calls at `max` are always native. A quota group is used while both its windows stay above a 5% reserve. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-lanes-design.md); updated by A37 (2026-10-10): a table entry per harness |
| A22 | **The Designer may run on agy,** on Opus 5.5 `high`, in rounds relayed by the Lead as today. Each round is a transaction that may change only specs and plans. When agy cannot run a round, the Lead starts the native Designer from the files, and that design stays native. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-lanes-design.md); updated by A23 (2026-10-09): the Lead decides the rounds instead of relaying them; superseded by A32 (2026-10-10): the Designer's lane rounds are gone |
| A23 | **The Lead decides as the owner's delegate.** It holds superpowers' approval gates with the owner's intent, chooses among the Designer's options and answers its questions. The Designer keeps the final word on design, and its reply's `Decide` line says who closes each round. Only what the intent does not cover, what conflicts with it, and unauthorized irreversible actions reach the owner. Failures with a defined fallback never do. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) |
| A24 | **Standing authorizations** are recorded per repository, from the owner's quoted words verified against their transcript, by `aether-autonomy` alone; aether-guard refuses edits to the registry and the run states. Seven irreversible classes; everything local and reversible proceeds. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md); updated by A34 (2026-10-10) |
| A25 | **Autonomous runs.** The owner's permission to work for hours confirms the intent and the ceilings (8 hours and US$ 50 by default; the owner's numbers override them). The run keeps a diary, keeps going while work remains, stops at a ceiling, when done or honestly, and ends with a brief. Without the permission, the Lead stops at the plan with a short brief. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) |
| A26 | **The installed release.** `aether-mode` loads a release installed apart from the project. `scripts/aether-install.js` extracts a tagged version from the local clone, with no network, into `installed/<version>-<commit>/` in the data directory, launcher included, and keeps `current` and `previous` links. Work on the project, merges to `main` included, never changes what the owner runs until the next install; `rollback` swaps the two links, and `aether-mode --dev` loads the development tree on purpose. The Artificial Analysis key lives in the data directory. `.aether/` stays in the main checkout of each project Aether works on. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-separation-design.md) |
| A27 | **Aether mode is the session agent `aether:lead`.** The plugin installs with Claude Code's own commands from the `aether-plugin` marketplace and stays enabled. In any other session it is dormant: a marker per session, written by the session-start hook for `aether:lead`, gates the guard and the usage meter, and the meter withholds Aether's agents. | Decided 2026-10-09; built in 0.7.0 |
| A28 | **Lanes are a plugin option,** `lanes`, off by default, and Linux only. The session-start hook passes it to the session's commands as `AETHER_LANES`. | Decided 2026-10-09; built in 0.7.0; updated by A37 (2026-10-10): the `harnesses` option |
| A29 | **Data lives in the plugin's own data directory,** `~/.claude/plugins/data/aether-aether-plugin/` for an install from the marketplace, resolved by one rule in `dataDir()` and in the mod. `AETHER_DATA_DIR` overrides it. | Decided 2026-10-09; built in 0.7.0 |
| A30 | **The mod runs the workflow's own `aether-wt` and `aether-lane` commands, without a model.** When any workflow in an Aether session spawns `aether:ops`, and `hooks/ops-command.mjs` accepts its prompt, the mod's `turn.step` answers the agent's first step itself, for whatever repository and run the prompt names. It runs the bin with `node` and `$.process.run`, with no shell and a 10-minute timeout, and ends the agent with the `StructuredOutput` call that `aether:run`'s schema asks for. The parser accepts only prompts of `opsPrompt`'s shape and the nine command forms the workflow sends, with every argument checked. These go to the Haiku `ops` agent, as before: any other prompt, an agent no workflow spawned, a `$.process.run` that is refused or cannot start, and a bin that fails to load (node's `SyntaxError` or `Cannot find module`, with nothing on standard output). Otherwise, once the mod has run an agent's command, the agent's model never runs it: a command stopped at the timeout, or ended without its line, is reported as an error. The workflow's own retries of `remove` and `sweep` still apply. Where the commands now run differently:<br>- The harness's "no user authority" safeguard, the session's permission rules and mode, and Bash `PreToolUse` hooks no longer apply to them. The controls are the closed list and the Aether session's mark.<br>- They run in the Claude Code process's environment, not the Bash tool's. So does what they start: the plan's test command, inside `aether-wt merge`, and agy. Exports from `CLAUDE_ENV_FILE`, and `PATH` entries only the shell profile adds, do not reach them, and `aether-lane status` looks for agy on that `PATH`.<br>- A merge whose tests outlast 10 minutes is stopped after its merge commit and before its revert; the error says so.<br>- The ops agents still count toward `maxAgents`, but their steps leave no usage entries. | Decided 2026-10-10 (handoff §6, approved in principle by the owner); see [the evaluation](evaluations/2026-10-10-ops-in-mod.md) |
| A31 | **The Lead is the accountable orchestrator,** the owner's right hand and not a messenger. It owns the outcome: a good design, a correct implementation and a correct deployment. It confirms its understanding of the intent, writes the spec, decides as the owner's delegate, chooses whether to do the work itself or hand it to the system, and tells the owner of better options, scope and costs. The quality of its work is its briefs and reports. | Decided 2026-10-10; built in 0.8.0; see the [roadmap](roadmap/2026-10-10-radar.md) |
| A32 | **Sonnet writes, Opus decides.** The Writer (`aether:writer`, Sonnet at `xhigh`) writes the plan and the tasks; the Judge (`aether:judge`, Opus at `high`, read-only) reviews the spec, the plan and the tasks, and rules `approve`, `revise` or `reject`, with at most ten findings. A document gets at most two revisions; when a third review still does not approve, or the Lead thinks the Judge is wrong, both positions and their cost go to the owner's list. The Lead never silently overrides the Judge. The Designer, the most expensive link of 0.7, is retired, and its lane rounds with it. | Decided 2026-10-10; built in 0.8.0; a measured design session against the 0.7 Designer is on the owner's list; extended by A39 (2026-10-13): a stronger model of another harness may take the Judge's or the Writer's seat |
| A33 | **Spec Kit's layout with an Aether preset is the method.** Each feature gets `specs/NNN-<topic>/spec.md`, `plan.md` and `tasks.md`, and a project may keep `.specify/memory/constitution.md`. The preset ships in the plugin (`speckit/`), and its commands also ship as the skills `aether:specify`, `aether:plan`, `aether:tasks` and `aether:constitution`; Spec Kit's CLI is not required. superpowers is no longer a dependency. Only the Lead and the Writer write specs, plans, tasks and the constitution. | Decided 2026-10-10; built in 0.8.0 |
| A34 | **One list for the owner.** Irreversible actions, and the choices only the owner can make, reach the owner as one list at the top of every brief: action, class, why, what happens on a no, how it is undone, and the exact command. aether-guard reads every Bash command of an Aether session, and appends an irreversible one that no grant covers to `.aether/pending.jsonl`, with secrets redacted and the file kept out of git. It only records them until it is proven; `AETHER_IRREVERSIBLE=enforce` makes it refuse them too. | Decided 2026-10-10; built in 0.8.0, recording by default |
| A35 | **Merges judge new failures, and reviews judge evidence.** `aether-plan compile` runs the test command once and keeps the failing tests it names as the run's baseline; a merge whose failing tests are all in it passes. The final package covers the run from its first launch. Packages list added lines that look unfinished (`.only(`, `.skip(`, `TODO`, `FIXME`, stubs). The supervisor and the reviewer grade each criterion as VERIFIED, PARTIAL or MISSING from evidence. | Decided 2026-10-10; built in 0.8.0 |
| A36 | **Iteration is bounded by the failures themselves.** A unit stops when it ends twice in a row without a report, or gets the same blocking findings three times, and the reason asks for a split. The final review follows the run's risk: Opus at `xhigh` for an opus task or a review at `xhigh` or `max`, Sonnet at `high` for at most three haiku tasks that review at `high`, and Opus at `high` otherwise. | Decided 2026-10-10; built in 0.8.0 |
| A37 | **Lanes on several harnesses.** A registry builds each harness's adapter: agy, Codex, Grok and Cursor; the last three take the role's schema in their prompt, and their answer is validated. The `harnesses` option, `agy` by default, lists the ones lanes may use, in order; the run's compile records them, so the mod's environment reads them too. A lane's environment drops credential variables and points the usual CLIs away from their credentials, and a plain git command inside it cannot reach a remote; these prevent accidents, not an agent that overrides them. Codex, Grok and Cursor ship without models in the table: the owner adds them after one real call per harness and role, and turns each harness on. | Decided 2026-10-10; built in 0.8.0; the real calls are on the owner's list |
| A38 | **RADAR.** Aether's five goals are Rápido, Autónomo, Delegación, Asequible and Robusto; every change is weighed against them, and `aether-report` gives a figure for each. Aether ports the pieces it needs from oh-my-claudecode instead of forking it. | Decided 2026-10-10; see the [roadmap](roadmap/2026-10-10-radar.md) |
| A39 | **Design seats.** The Judge, the Writer and the Examiner are seats that a lane harness may take in place of the native agent, one round at a time. Each seat has a list of external models in order of preference, written `<harness>/<model>` in the lane table's `designSeats`; the native agent always comes last. A round runs in a disposable worktree of the current commit and keeps no conversation, so any harness can take any seat. Git decides what the round may change (the Judge nothing, the Writer `plan.md` and `tasks.md`, the Examiner `.aether-exam/`), and the answer must match the seat's schema; anything else undoes the round, keeps a breaking one in `refs/aether/seat/<id>/round-1`, and gives the same round to the native agent. An external Writer's plan is checked with `aether-plan check` and committed by Aether. This is superdelegation upward: C3 now counts the seats as well as the volume. | Decided 2026-10-13; built in 0.9.0; see [spec 001](../specs/001-design-seats/spec.md) |
| A40 | **The seats option,** `seats`: `native` (Aether's own agents, as in 0.8), `balanced` (Gemini 4 Argon on agy first in the Judge and the Examiner) or `robust` (Argon first in the Writer, and the Judge native on Opus); `balanced` by default. It reaches the session as `AETHER_SEATS`. It changes only the design seats: the swarm's models and efforts still follow each task's Tier and Review, the ladder and the run's risk. The key is one lowercase word, like `lanes`, whose environment name was measured (F11). | Decided 2026-10-13; built in 0.9.0 |
| A41 | **Whoever writes a document does not judge it.** A seat never takes the model that wrote what its round reviews or builds on (`--author`): the Judge passes over the Writer's model, and the Examiner over the plan's author. When only the native agent of that same model is left, it takes the seat, and the answer says so. | Decided 2026-10-13; built in 0.9.0 |
| A42 | **The Examiner and its exam.** With the plan approved, the Examiner writes acceptance tests from `spec.md` and the plan's public interfaces, never from `tasks.md`, one command per test. `aether-exam` keeps the exam in the plugin's data directory, outside the repository, its worktrees and the briefs, and runs it on a commit in a disposable worktree; a test that fails runs once more, and one that then passes is flaky. A failing test is a blocking finding of the brief. aether-guard lets the Examiner write only under `.aether-exam/`, which Aether keeps out of git. No hook guards reads of the exam: it would start a process on every Read of every session; the exam's protection is against accidents, as the lanes' is. | Decided 2026-10-13; built in 0.9.0 |
| A43 | **Fable stays out until Fable 5.5.** The owner's words: «actualmente opus es más capaz de fable a menos de la mitad del costo, cuando salga 5.5 fable si estará justificado». No shipped seat or lane uses Fable 5.1. Any new model, Fable 5.5 included, enters a seat after the measurement of [the seats evaluation](evaluations/seats/README.md). | Decided 2026-10-13 |
