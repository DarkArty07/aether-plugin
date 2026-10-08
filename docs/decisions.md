# Decisions

All decisions were taken in the design session of 2026-10-05. Each one has a status:

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

## D3. A plugin plus the Aether Router, with no wrapper

**Decided.** The plugin holds the behavior and chooses the models; the router gives
access to the providers. The only setup outside the plugin is pointing
`ANTHROPIC_BASE_URL` at the router in the user's settings, which a plugin setup command
can write.

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

**Pending.** When only `ANTHROPIC_BASE_URL` is set, Claude Code keeps sending the
user's claude.ai login, and the gateway forwards Claude requests unchanged. That keeps
Claude traffic on the official client and the user's own subscription. It needs two
router changes:
- a pass-through lane for `claude-*` model IDs;
- authentication of the local client through a custom header
  (`ANTHROPIC_CUSTOM_HEADERS`).

Prototype step 2 tests it.

## D11. Our own Telegram layer

**Decided**; scope pending. Nothing is inherited from Hermes. A small layer handles
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

## D15. Name and identity

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
