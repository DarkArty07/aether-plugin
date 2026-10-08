# Aether: the Lead and the Designer (design spec)

- **Date:** 2026-10-08
- **Status:** Draft for the owner's review.
- **Method:** superpowers brainstorming, architectural path, in Aether mode. The design was agreed with the owner in conversation on 2026-10-08.
- **Amends:** the [v0.1 spec](2026-10-07-aether-plugin-design.md): decisions A4, A5 and A8, and §1, §4 and §5.
- **Branch:** `feature/lead-designer`, in the worktree `.worktrees/lead-designer`.

## 1. Summary

Today the main session, the Designer, runs on Opus and carries the whole conversation. Every step it takes re-reads that conversation, and with the 1M context window the conversation grows to hundreds of thousands of tokens. So the owner pays Opus prices to re-read hours of chat and tool output, even for the work that needs no Opus.

This change splits the main session's work between two contexts:
- **The Lead** is the main session, on Sonnet 5.5 at `xhigh`, with the 1M window. It talks with the owner, explores, runs the process (route, swarm, reports) and does short tool work.
- **The Designer** is a plugin agent, `aether:designer`, on Opus 5.5 at `max`, in its own context. It does the real design work: the approaches, the design, the spec and the plan. It never re-reads the Lead's conversation. It gets the understanding the owner confirmed and the owner's own words.

For the owner it is still one conversation, with no model switching by hand. The swarm is unchanged.

## 2. Problem and evidence

Session `641da36f`, the session that built Aether v0.1, ran on Opus at `max`. Its main session alone, without subagents or workflow agents, came to:

| Measure | Value |
|---|---|
| Cost at the plugin's prices (`config/prices.json`) | **$111.22** for 558 requests and 43 owner messages |
| Re-reading the context (cache reads) | $65.14 (59 %) |
| Output, thinking included | $23.49 (21 %) |
| Cache writes | $22.59 (20 %) |
| Context per request | median 651K tokens, p90 887K |
| Tool calls | 501 Bash, 78 Edit, 62 Write |

- Every request re-reads the whole context. At 650K tokens that is $0.13 per step on Opus and $0.065 on Sonnet.
- Most steps were tool work done inside that long context: about 13 requests per owner message.
- The same tokens at Sonnet prices cost $55.61.

## 3. The owner's requirements (2026-10-08)

- **R1.** No manual model switching.
- **R2.** Sonnet converses and explores. When the owner confirms Sonnet's understanding ("cuando digo 'a, es buena idea', entra un designer"), Opus takes over the design: the spec, how the work will be solved, the plan.
- **R3.** Quality must not drop. If it does, the change is undone: "si la calidad baja entonces vemos que hablar siempre con Opus tiene sus beneficios".
- **R4.** The conversation keeps the 1M context window. Continuity over long sessions and tasks is the point; shrinking the window is not an option.
- **R5.** The system is autonomous: it routes by itself.
- **R6.** Short tool work stays with the Lead. Long tool loops (implementing, debugging, long verifications) go to a subagent or the swarm, each in a small context of its own. The owner accepted this option (c) on 2026-10-08.
- **R7.** The Designer runs Opus at `max` and the Lead runs Sonnet at `xhigh`.

## 4. Decisions

| ID | Decision | Amends |
|---|---|---|
| A11 | The main session is the **Lead**: Sonnet 5.5 at `xhigh`, with the 1M window. It holds the conversation, explores, chooses the route, runs the execution and reports. It may design and implement spikes and bounded work. | A4, A5 |
| A12 | The **Designer** is the plugin agent `aether:designer`: Opus 5.5 at `max`, in its own context, with a 1-hour prompt cache. It does the architectural design: approaches, design, spec and plan. Among agents it has the final word on design; the Lead has it on route and process. | A4 |
| A13 | The hand-off happens when the owner confirms the Lead's written understanding, the "write back your understanding" step of superpowers brainstorming, on the architectural path. From then on the Lead relays both ways and does not design. | |
| A14 | Only the Designer writes specs and plans. A PreToolUse hook (`aether-guard`) refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every other agent, the main session included. | |
| A15 | Long tool loops leave the Lead's context (R6): the swarm, superpowers subagent-driven development, or one subagent with a self-contained brief. | A5 |
| A16 | `aether-mode` launches the Lead with `--model sonnet --effort xhigh` and turns the advisor tool off. | A8 |
| A17 | The split is kept only if a design trial shows lower cost at equal quality (§11). If quality drops, the split is not merged. | |

## 5. Roles

| Role | Model and effort | Context | Does | Does not |
|---|---|---|---|---|
| Owner | — | — | Approves the understanding, the design, the spec, the plan and anything irreversible | — |
| **Lead** (main session) | Sonnet 5.5, `xhigh` | The whole conversation, up to 1M | Converses, explores, writes back its understanding, hands off, relays, chooses the route, runs the execution and the swarm, reports, does short tool work | Write or edit specs and plans; answer design questions after the hand-off; run long tool loops in its own context |
| **Designer** (`aether:designer`) | Opus 5.5, `max` | Its own: the confirmed understanding, the owner's words, the code it reads | Proposes approaches, presents the design, writes and commits the spec and the plan, answers design questions | Talk to the owner directly (subagents cannot); implement product code; run the execution handoff |
| Swarm (unchanged) | Haiku, Sonnet or Opus | One per unit | As in the v0.1 spec | — |

When the Lead disagrees with the Designer on design, it tells the owner. It never overrides the Designer.

## 6. Flow

### 6.1 Architectural path

1. **The Lead runs brainstorming up to the shared understanding.** It explores the context, classifies the path, asks its questions one at a time, and writes back its understanding: what the owner said, separate from what it assumes.
2. **The owner confirms**, with corrections or without. That confirmed note is the design brief, and its confirmation triggers the hand-off (A13).
   - Corrections that leave the intent as it was go into the note, and the Lead hands off.
   - Corrections that change the intent mean a new note, written back once more before the hand-off.
3. **Hand-off.** The Lead starts `aether:designer` with the hand-off message (§7.4). The Designer runs in the background. The Lead tells the owner the Designer is working, and keeps the agent's id.
4. **Rounds.** The Designer follows brainstorming from "Propose 2-3 approaches" onward. Wherever brainstorming says to ask, present or get approval, the Designer ends its turn with a reply in the format of §7.4. The Lead shows it to the owner as written, and sends the owner's answer back with `SendMessage` to the same Designer, which keeps its context and its cache. The stages are:
   - **approaches:** two or three, with a recommendation;
   - **design:** the sections, one or more rounds;
   - **spec:** written, self-reviewed and committed, then the owner's review;
   - **plan:** written with superpowers `writing-plans` and the Aether fields, passing `aether-plan check`, committed, then the owner's review.
5. **Execution.** Once the owner approves the plan, the Lead runs the execution handoff, with the swarm as the third option, and the execution.
6. **After execution**, the Lead handles the results. It fixes small findings itself or relaunches units, and sends design-level findings, and any change to a spec or a plan, to the Designer.

### 6.2 Spikes and bounded work

- **Spikes:** the Lead.
- **Bounded work:** the Lead writes the short design in chat and gets the owner's yes. When the change meets the `opus` tier criteria (security or auth, data migrations or destructive operations, concurrency, core architecture), the Designer writes that short design instead, in one round with no spec file. The implementation follows R6.

### 6.3 Losing the Designer

The files are the source of truth, and resuming is only a saving. If the Lead no longer has the Designer's id, for example after compaction or in a new session, it starts a new Designer with the spec and plan paths and the latest decision of the owner.

## 7. Components

### 7.1 `aether-mode` (launcher)

    env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir <repo>/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv

- The owner's arguments come last, so `aether-mode --model opus --effort max` still gives today's Opus main session. The design trial uses it as its baseline.
- **Advisor off.** Each advisor call reads the whole conversation uncached, at the advisor's input price: about $2.60 per call at 650K tokens on Opus. The Designer is the way to Opus in this mode. The owner's transcripts record an `advisorModel` of `claude-opus-5-5`, though no settings file sets it.

### 7.2 `using-aether`, the Lead's bootstrap

It is injected at SessionStart, as in v0.1, and becomes the Lead's rules:
- **Roles:** you are the Lead; the Designer and the owner.
- **superpowers stays the method;** only who does each step changes.
- **The route by path** (§6.1, §6.2).
- **The hand-off and relay protocol** (§7.4).
- **Your own tool work (R6).** Short work stays inline: reading a few files, a check, `git status`, a one-line fix, the swarm skill's commands. Work that needs more than about five tool calls, or any edit-test-fix loop, goes to the swarm, to superpowers subagent-driven development, or to one subagent with a self-contained brief, on Sonnet by default. The reason is stated: each step of yours re-reads the whole conversation.
- **Prices,** with cache reads: Opus 5.5 4/20 (cache read 0.20), Sonnet 5.5 2/10 (0.10), Haiku 5.5 0.10/0.50 (0.01).
- **The swarm at the plan handoff,** as in v0.1, run by the Lead with the `swarm` skill.
- **The Aether plan fields** move to the Designer's prompt; the bootstrap keeps one line pointing to them.

### 7.3 `aether:designer` (agent)

- **Frontmatter:**
  - `model: opus`, `effort: max`, `maxTurns: 80`;
  - `experimental: { cacheTtl: 1h }`, so its cache survives while the owner reads;
  - `tools: Read, Write, Edit, Bash, Grep, Glob, Skill, WebFetch, WebSearch`. There is no `Agent` tool: the Designer does its own reading.
- **The prompt covers:**
  - its role and authority (§5);
  - its inputs: the hand-off message, and the owner's words through `aether-voice`;
  - that it cannot talk to the owner, so it works in rounds with the reply format of §7.4;
  - the superpowers skills to load: `superpowers:brainstorming`, from "Propose 2-3 approaches" onward, and `superpowers:writing-plans`;
  - the Aether plan rules moved from the bootstrap: the fields, the tier rubric, the `## Aether Execution` section, contract tasks (A10) and `aether-plan check`;
  - to stop when the plan is committed, because the Lead runs the execution handoff;
  - never to implement product code.

### 7.4 The hand-off message and the Designer's reply

**Hand-off** (from the Lead, which reads its own session id from `$CLAUDE_CODE_SESSION_ID`):

    You are the Designer for <topic>.
    Path: architectural. Working directory: <path>.
    The owner's own words: run `aether-voice --session <session id>`.
    The understanding the owner confirmed, with their corrections:
    <the note exactly as confirmed>
    This round: <propose 2-3 approaches with your recommendation | ...>

**The Designer's reply**, at the end of every round:

    ## For the owner
    <what the Lead shows the owner, as written>

    ## For the Lead
    - Stage: approaches | design | spec | plan | question | blocked
    - Waiting for: <what the owner must decide>
    - Files: <paths and commits, or none>

**Relay rules for the Lead:**
1. Show "For the owner" as written. One line of framing is allowed; a paraphrase of the design is not.
2. Send the owner's answer with `SendMessage`, verbatim. Add context only when the owner refers to something the Designer cannot see.
3. After the hand-off, design questions go to the Designer. The Lead answers questions about process, cost and status itself.
4. The Lead never writes or edits a spec or a plan; the guard refuses it (A14).

### 7.5 `aether-voice` (bin)

`aether-voice [--session <id>]` prints the owner's messages from a main session's transcript, in order, as Markdown.
- **Session:** `--session`, or else `CLAUDE_CODE_SESSION_ID`.
- **Transcript:** `<config dir>/projects/*/<session>.jsonl`, where the config dir is `CLAUDE_CONFIG_DIR` or `~/.claude`.
- **An owner message** is a `user` record that is not a sidechain and whose `origin.kind` is `human`. A record with no `origin` field qualifies when it is not `isMeta`, not `isCompactSummary`, has no `toolUseResult`, and its text does not start with `<`. Task notifications (`origin.kind` `task-notification`), tool results, skill loads and compaction summaries are excluded.
- **Text:** a string content, or the text blocks joined by a blank line, with an image block shown as `[image]`. A message over 8,000 characters is cut, with a note of how much was cut.
- **Output:** a heading with the session id, then one numbered section per message with its timestamp. With no messages, it says so.
- It prints to stdout, so no file is left behind (A7). It exits with 1 and a message on stderr when it has no session id or finds no transcript.

### 7.6 `aether-guard` (PreToolUse hook)

- **Registration:** in `hooks/hooks.json`, with the matcher `Write|Edit|MultiEdit|NotebookEdit`, running `node "${CLAUDE_PLUGIN_ROOT}/bin/aether-guard"`.
- **Input:** the hook's JSON on stdin. The target is `tool_input.file_path`, or `tool_input.notebook_path` for NotebookEdit, resolved against `cwd`.
- **Protected:** a target inside a `docs/superpowers/specs/` or `docs/superpowers/plans/` directory.
- **Allowed writer:** only `agent_type` `aether:designer`. The hook's input carries `agent_id` and `agent_type` only inside a subagent, so the main session has neither.
- **Denial:** a `permissionDecision` of `deny`, whose reason tells the agent to hand the change to the Designer. Anything else prints nothing, which lets the normal permission flow decide.
- **Fails open:** malformed input prints nothing and exits with 0. The guard protects a route, not a security boundary.
- **Not covered:** Bash commands that write those files. The bootstrap forbids it, and the trial checks for it.

### 7.7 Smaller changes

- **`swarm` skill:** "You stay the Designer" becomes the Lead. A blocked unit whose plan task needs fixing goes to the Designer.
- **`supervisor`, `reviewer` and `run.workflow.js`:** the texts that name "the Designer" as the one who receives results and blocked questions now name the Lead.
- **`plugin.json`:** version 0.2.0 and a new description.

## 8. Cost model

The price of one step is roughly the size of the context the step re-reads, times the cache-read price.

| Who works | Re-reads | Per step |
|---|---|---|
| Opus main session (v0.1) | ~650K | $0.13 |
| Lead (Sonnet) | ~650K | $0.065 |
| Designer (Opus, own context) | ~50–200K | $0.01–0.04 |

**Expected:**
- the conversation costs about half of today, from the model price alone;
- R6 lowers it further by cutting the Lead's steps;
- the Designer adds its own cost, in a small context.

The trial measures all three.

## 9. Alternatives considered

1. **Switch the main session to Opus for design turns,** with a skill that sets `model: opus` or a mod on `turn.step`. Opus would then re-read the whole conversation at every step. Each switch also re-writes the cache at Opus prices: $3.25–5.20 at 650K. Rejected.
2. **`opusplan`.** It uses Opus only in plan mode, which superpowers does not use, and one effort level for both models. Rejected.
3. **Sonnet with an Opus advisor.** Every consultation reads the whole conversation uncached, about $2.60 at 650K. The model decides when to consult, and the advisor advises but does not write the spec. Rejected, and turned off (A16).
4. **The Lead as a `--agent` main session.** Its prompt would replace Claude Code's system prompt. The launcher's flags are enough.
5. **A smaller context window** (`autoCompactWindow`). Cheaper, but R4 keeps 1M.
6. **Haiku as the Lead.** Cheaper still, but weaker: an Intelligence Index of 41.2 at `xhigh` against Sonnet's 51.9. The owner chose Sonnet.

## 10. Error handling

| Case | Handling |
|---|---|
| The Designer fails, or returns without the reply format | The Lead tells the owner and starts it again with the same hand-off. A Designer that stopped at `maxTurns` is resumed |
| The Designer needs an answer | Stage `question`: the Lead asks the owner and relays the answer |
| The Designer cannot continue | Stage `blocked`, with the reason. The Lead brings it to the owner |
| The Lead lost the Designer's id | A new Designer, from the files (§6.3) |
| The Lead tries to write a spec or a plan | The guard refuses it, with a reason that points to the Designer |
| `aether-voice` finds no transcript | It exits with 1. The Designer works from the confirmed understanding and says so in its reply |
| The Designer's cache expired during a long review | Its next request re-writes its context: $0.40–1.60 at 50–200K |
| The owner asks the Lead a design question after the hand-off | The Lead sends it to the Designer |

## 11. Testing and acceptance

**Unit tests** (`node --test`):
- `aether-voice`: the rules of §7.5, on transcript fixtures shaped like real records.
- `aether-guard`: the allow and deny cases of §7.6, and its registration in `hooks.json`.
- The Designer's frontmatter, and the key rules in its prompt.
- The Lead's bootstrap in the SessionStart output.
- The launcher's flags.

`npm run check` passes: the node tests, the mod tests and `claude plugin validate --strict`.

**Smoke run.** Real headless sessions on a throwaway fixture check the platform facts this design rests on:
- **S7.** The Lead runs on `claude-sonnet-5-5` at `xhigh`.
- **S8.** The Designer runs as `aether:designer` on `claude-opus-5-5` at `max`, with 1-hour cache writes.
- **S9.** The guard refuses the Lead's write to a spec and allows the Designer's. The hook sees the `agent_type` `aether:designer`.
- **S10.** `SendMessage` resumes the Designer with its history.
- **S11.** `aether-voice`, run by the Designer, finds the Lead's transcript.
- **S12.** No advisor call happens.
- **S13.** The hand-off happens when the owner confirms the understanding, and not before.

**Design trial (the gate, A17):**
- **The request:** design "effort per tier in the swarm", the owner's next sub-project, on a clone of this repository at `main`. The trial thus also produces two candidate designs for it.
- **The hidden owner brief:** written before the runs from the owner's statements of 2026-10-08. It holds the intent and about ten items that can be checked.
- **The simulated owner:** a Sonnet session that sees only what the owner would see, plus the brief. It answers questions, confirms or corrects the understanding, and approves at the gates, within 30 turns.
- **Two configurations:**
  - **baseline:** the plugin at `main` with `--model opus --effort max`;
  - **new:** this branch, through the launcher's flags.

  Both run headless, with superpowers on, MCP connectors off, bypassed permissions, the advisor off, `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` and a $40 cap.
- **Measures:**
  - cost, by model;
  - model time;
  - owner turns, and the Lead's steps per owner message;
  - **q1:** `aether-plan check` passes;
  - **q2:** a blind Opus judge marks each brief item as captured, missed or contradicted;
  - **q3:** a blind pairwise rubric judgment by an Opus judge, in both orders;
  - **q4:** the owner's blind preference between the two spec-and-plan sets.
- **Gate:** the new configuration costs less, and its quality is not lower:
  - q1 passes;
  - q2 is at least the baseline's coverage minus one item, with no contradiction;
  - the owner does not prefer the baseline in q4. If the owner abstains, q3 decides: the baseline must not win in both orders.

## 12. Out of scope

- Effort per tier in the swarm: its own spec, though the trial uses it as the design request.
- Guarding Bash writes to specs and plans.
- A Designer that talks to the owner directly: subagents cannot.
- Haiku as the Lead, and changes to the context window.
- Everything the v0.1 spec leaves out.

## 13. Risks

- **The relay loses nuance.** Mitigations: verbatim relay both ways, and the owner's own words through `aether-voice`. The trial's q2 and q4 measure it.
- **The Lead designs in chat instead of handing off.** The guard covers files only. The bootstrap's rule holds the rest, and S13 and the trial check it.
- **Latency.** Artificial Analysis measures Opus 5.5's median time to the first answer token at 561 s at `max`, against 78 s at `xhigh`, on their prompt. Each Designer round may take minutes. The effort is one line in the agent file, and the trial records time per round.
- **Prompt cache:**
  - the Designer's 1-hour cache can expire during long reviews (§10);
  - a subscription that runs on usage credits ignores the 1-hour lifetime.
- **The Lead still re-reads its long context** at Sonnet prices. R6 keeps its steps few, and the trial reports them.
- **superpowers updates** can rename the brainstorming steps that the trigger refers to.
- **Pasted secrets.** Whatever the owner pastes reaches the Designer through `aether-voice`, on the same machine and account.

## 14. Documents to update

- **README:** roles, the diagram, the launcher, the status.
- **`docs/decisions.md`:** updates to A4, A5 and A8, and the new A11–A17.
- **`docs/claude-code-research.md`:** the facts verified for this design:
  - hooks' `agent_id` and `agent_type`;
  - the Designer's `skills` and `experimental.cacheTtl` fields, and its Skill tool;
  - a skill's `model` field lasting one turn;
  - `context: fork` running in a fresh context;
  - the `autoCompactWindow` setting;
  - the advisor's uncached reads.
- **The v0.1 spec:** a status line that points here.
