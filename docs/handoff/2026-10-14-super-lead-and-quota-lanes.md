# Handoff: the super Lead orchestrator, its three paths, and quota-aware lanes

- **Date:** 2026-10-14
- **From:** the Lead (Claude Code, an Aether session that ran on Sonnet 5.5 and then on Opus 5.5) and the owner, DarkArty07. The owner writes Spanish; code and documents in this repository are English.
- **To:** the next agent that continues this work. If it runs on the owner's machine, it also loads the Lead's memory for this project (`~/.claude/projects/-home-darkarty-Desktop-03-PROYECTOS-01-ACTIVOS-aether-plugin/memory/`). If it is a cloud agent, it sees only GitHub, and the branch below must be pushed first (the owner's call).
- **Repository state:** local branch **`feat/grok-lane`**, clean, nothing pushed. It sits on `fix/open-issues-0.9.1` (the 0.9.1 fixes for issues #2–#5, also local only), which sits on `origin/main` at `e3e85b8` (0.9.0). `plugins/aether/.claude-plugin/plugin.json` says **0.9.1**. Checks: `npm test` 705 pass, `npm run test:mod` 35 pass, both manifests validate.
- **Installed plugin:** **0.9.0**, from `origin/main` (`~/.claude/plugins/cache/aether-plugin/aether/0.9.0`). Nothing on these branches reaches Claude Code until it is merged to `main` and the plugin updates.

## 1. What the owner wants from the main agent

The owner's words, 2026-10-14:

> «El agente principal, o sea tú, se tiene que comportar como un super lead orchestrator. Tiene que operar el sistema Aether, pero además tiene que ver qué modelo es mejor para cada tarea en base a costos, calidad y velocidad, como ya lo venía haciendo, pero tiene que aplicar también para los agentes delegate task. El sistema necesita tres caminos. El camino directo: el lead orchestrator hace el trabajo porque es un cambio muy acotado. El camino delegate task: porque es un trabajo acotado pero sigue siendo una tarea manejable. Y el camino swarm: porque es una tarea larga y costosa o compleja.»

And earlier, the same day:
- «todo esto debería de venir cargado en el plugin […] hay algunas cosas que están anotadas en memory.md que SÍ deberían de ser comportamientos nativos del plugin»: rules learned in a session belong in the plugin when they are Aether's behavior, not in one agent's memory.
- «un orquestador debe saber siempre qué modelo está usando».
- «te aconsejo que delegues para que dejes libre esta CLI y podamos seguir conversando»: long work runs in the background, so the conversation stays free.

### 1.1 The three paths

| Path | When | Who does it | Model |
|---|---|---|---|
| **Direct** | A very bounded change: a few files, a few tool calls (the plugin's own line is "about five"), no edit-test-fix loop | The Lead, inline | The Lead's own |
| **Delegate task** | Bounded work that is still a real task: an edit-test-fix loop, a cleanup, a reader with its tests, a research sweep | One background subagent with a self-contained brief | **Chosen by the Lead on purpose, passed as `model` on every Agent call, and said to the owner with the reason** |
| **Swarm** | Long, costly or complex work: a spec with a plan of several tasks | `/aether:run` on an approved plan | Per task, by the plan's Tier and effort, with the ladder and the supervisor |

The plugin today has a design-depth table (`plugins/aether/skills/using-aether/SKILL.md`, "The route by size and risk": Direct, Short design, Spec and plan) and a rule on tool work ("Your own tool work", lines ~239–248: "more than about five tool calls […] goes to the swarm or one subagent with a self-contained brief, on Sonnet unless the tier rubric says otherwise"). The three paths are the execution side of that: make them explicit, and make the model choice of the delegate path as deliberate as the swarm's.

### 1.2 Choosing the model for a delegate task (a starting rubric; the figures are in `docs/models/models.json`)

| Model | Price $/M in/out | Speed | What its maker says | Use it for |
|---|---|---|---|---|
| Haiku 5.5 | 0.10 / 0.50 | fastest | "high-volume, latency-sensitive tasks such as classification, extraction, and routing" | listings, lookups, explorers, mechanical edits |
| Sonnet 5.5 | 2 / 10 | fast | "the best combination of speed and intelligence" | bounded coding with tests and a precise brief, cleanups, docs; **the default for a delegate task** |
| Opus 5.5 | 4 / 20 | moderate | "long-running agentic coding and knowledge work" | the Judge, the final reviewer, hard debugging, or a task Sonnet already failed |
| Fable 5.1 | 10 / 50 | slower | "demanding reasoning and long-horizon agentic work" | not used: the owner keeps Fable out until Fable 5.5 (spec 001's intent) |

Rules that go with it: start at the cheapest model that can do the task and escalate only on a failure, as the swarm's ladder does; say the model and why when launching; agents whose definition fixes a model (`aether:judge`, `aether:writer`, `aether:examiner`) keep it. **Open question for the design:** whether a delegate task may also run on an external lane (grok, agy) when its quota is the one most at risk (spec 002's rule), and how effort is passed (the Agent tool's `effort` may be set only when a skill or the owner says so, so the skill must say it).

### 1.3 How the Lead must behave (learned the hard way in this session)

- **Never let a subagent inherit the model.** The Lead launched a delegate without `model`; the owner had switched the session to Opus with `/model`, so the delegate ran on Opus for a bounded coding task. The plugin's "on Sonnet" assumes the Lead is on Sonnet; the session's model can change.
- **Never infer a model's purpose, tier or price from its name.** The Lead put `grok-4.7-build-fast` in the lane table as a cheap Haiku-tier lane; it is the same Grok 4.7 on faster infrastructure at twice the price (xAI's docs). Read the maker's page; keep it in `docs/models/profiles.json`.
- **Quote scores only at efforts the harness takes.** agy takes Claude only at low, medium and high; the Lead first quoted Sonnet's `max` score (0.636), which agy cannot reach (0.439 at high).
- **Do long loops elsewhere.** The Lead ran long edit-test loops inline because a stale memory ("do it all yourself", 2026-10-08) overrode the plugin's rule. That memory is now retired; the plugin's rule wins.
- **Verify a delegate's claims before relaying them**, and **edit nothing a delegate in the same checkout may touch**: one delegate reverted `.specify/feature.json` (the Lead's change) thinking a test had made it.
- **Opening a CLI's UI can update it.** The Lead opened grok's UI without `GROK_DISABLE_AUTOUPDATER`, and grok updated itself from 1.0.41 to 1.0.52.
- **The permission classifier blocks launching grok with `--always-approve`** ("Create Unsafe Agents"). Do not route around it; give the owner the command to run with `!`.

## 2. The owner's standing rules from this session

**Models** (`docs/models/README.md`, enforced by `scripts/build-models-index.js` and `tests/models-index.test.js`):
1. Only the **newest generation** of each line (Sonnet 5.5, not 5; Grok 4.7, not 4.6).
2. Only models the **harness's own CLI lists** (`agy models`, `grok models`); harnesses in scope: **agy and grok**. codex and cursor come in later.
3. **Always know what each model is for:** a profile from the maker's pages in `profiles.json`; the builder exits 1 and a test fails when a model in use has none.

**Quota:** spend first the plan quota most at risk of being wasted: «La cuenta que se debe de usar primero es la más próxima a vencerse […] se tiene que usar la que podría desperdiciar cómputo». Priority = remaining weekly share ÷ hours to its reset. Shares of different plans compare as equal («porcentajes iguales sí»). Aether reads quotas itself; it never asks the owner («tú mismo respóndete»).

**Irreversible actions are the owner's yes:** push, pull request, merge, tag, release, paid calls. Local commits on a feature branch are fine.

## 3. What was done (commits on `feat/grok-lane`)

| Commit | What |
|---|---|
| `9c47535`, `dbebacc` | **The models index.** One generated list, `docs/models/models.json`: the four models in use with their efforts, scores only at the efforts the harness takes, lane role and tier, and profile. Also `notOffered` (Gemini 4 Argon: agy does not list it on the owner's Pro plan; Antigravity gates it to Ultra; expected soon), `withoutFigures` (`grok-4.7-build-fast`), `superseded` (grok 4.6, 4.5) and `outOfScope` (gpt-oss-120b, from 2025). `harness-models.json` is the CLIs' listing snapshot; `profiles.json` is written by hand. |
| `172fa5c` … `42d558a` | **Spec 002, quota-aware lanes** (`specs/002-quota-aware-lanes/spec.md`), approved by the Judge at revision 4, after three rounds of `revise`. One item is open for the owner: **A3** (below). |
| `f06ba00` | **The grok lane** and an **interim grok quota reader.** `grok-4.7` replaces Haiku as implementer; Aether's `xhigh` maps to grok's `high` (AA: 46.3 against 46.4). grok passes the level as `--reasoning-effort` and reports reasoning and cache tokens. `aether-lane quota [<harness>…] [--refresh] [--json]` reads each harness's quota without a run. grok's reading comes from the line its UI writes to `~/.grok/logs/unified.jsonl`; `--refresh` opens the UI for at most 20 s, in an empty temp directory, with no prompt. A `quota:` reason now ends a call as quota for any harness (`lane-calls.js`, `judge`). `scripts/lane-smoke.js` makes one real lane-style call to a harness. |

Readings on 2026-10-14 ~06:08 UTC (`aether-lane quota`): **grok** 100% left, resets 2026-10-17 09:08 UTC, priority 0.0133; **agy Gemini** 100%, resets 2026-10-21 03:35 UTC, priority ≈0.006; **agy Claude and GPT** 0.2%, resets 2026-10-16 04:41 UTC, not usable. So this week: Haiku-tier calls to Grok first, then Gemini; Sonnet and Opus tiers native until the 16th.

## 4. What is left, in order

1. **Make the super Lead native in the plugin** (the owner's request of §1). Suggested route: a short design the Judge reviews, since it changes the Lead's core behavior. Contents:
   - in `plugins/aether/skills/using-aether/SKILL.md`: the three paths of §1.1 next to "The route by size and risk"; a **Models** section with the rubric of §1.2, the explicit `model` on every Agent call with its reason, the three model rules, and "read `models.json` before naming a model for a role";
   - move `docs/models/models.json` and `profiles.json` into `plugins/aether/config/` (or have the builder write there), because `docs/` does not ship with the plugin; the builder stays in `scripts/`;
   - a test that what the bootstrap names exists (the config files, the command names);
   - check `agents/lead.md` (it fixes `model: sonnet`) and the swarm skill for anything that contradicts the paths.
2. **Spec 002: plan and tasks.** Start the Writer (`aether:writer`, Sonnet) on the approved spec, then the Judge on the plan. The plan must account for what `f06ba00` already built (R3–R7 in part: the reader, the refresh, `aether-lane quota`) and for what remains: candidates per role and tier at compile, the workflow walking them in priority order (R11–R13), dry marks on disk (R14), status, diary, report and brief (R15–R18). Build it with the swarm, or with delegate tasks if the plan is small.
3. **Check A3.** grok 1.0.41 and 1.0.52 billing lines carry no `creditUsagePercent`; the reader takes that as 0% used. Confirm it with a reading taken after Grok quota is really spent: the owner runs `! node scripts/lane-smoke.js grok grok-4.7`, then `node plugins/aether/bin/aether-lane quota grok --refresh`. If the field still does not appear, the reader must treat grok's share as unknown (spec 002, A3).
4. **Small fixes** found on the way: each `--refresh` leaves a session folder `~/.grok/sessions/%2Ftmp%2Faether-grok-quota-*`, which the refresh should remove; look for a way to read grok's quota without opening its UI (spec 002, Proposals: ACP `grok agent stdio`, `initialize` or an `x.ai/*` method).
5. **Release** (the owner's yes): push `fix/open-issues-0.9.1` and `feat/grok-lane`, open the pull requests, merge, tag. The owner's `~/.claude/settings.json` installs the marketplace at `ref: main`.

Later, not now: codex and cursor in the index and the lanes (their listings are not captured), Gemini 4 Argon when agy offers it, the open GitHub issues #1 and #6 (cross-session parallelism, an autonomy contract).

## 5. How to run things

```
npm run check                                                  # unit, mod tests, both manifests
node plugins/aether/bin/aether-lane quota grok agy [--refresh] # quota without a run
node scripts/build-models-index.js --write                     # rebuild docs/models (AA key: ARTIFICIAL_ANALYSIS_API_KEY or ~/.local/share/aether-plugin/.env; never print it)
agy models ; grok models                                       # listing commands, no model call
node scripts/lane-smoke.js grok grok-4.7                       # one real call (spends plan quota): the owner runs it with !
```

Never run a prompt through grok, agy, codex or cursor-agent with an approval flag from the agent's own shell; never read `~/.grok/auth.json`.

## 6. Context that is not in the code

- **The owner's grok config** has `permission_mode = "always-approve"` (`~/.grok/config.toml`), so `grok -p` runs tools unprompted on this machine with or without the flag.
- **Grok's weekly period** is anchored on Saturday 09:08:51 UTC (since 2026-09-05). Its billing line appears only when the UI starts. `grok -p /usage` sends the text to the model, and costs about $0.02.
- **The Artificial Analysis API** (`/api/v2/data/llms/models`, about 700 models) names the bare slug after its top effort: `claude-sonnet-5-5` is Max, `claude-sonnet-5-5-high` is High. AA has no entry for `grok-4.7-build-fast`.
- **Gemini 4 Argon** (Gemini API: "flagship reasoning model", 1M context): developer price $2/$10 through 2026-11-30, reported to double on 2026-12-01.
- **The Lead's memory for this project** holds these rules as well: `models-and-quota-rules.md`, `research-model-before-assuming.md`, `choose-subagent-model.md`, and `no-delegation-when-direct.md`, which is retired and points here. Once §4.1 is built, the plugin should carry them, and those memories can shrink to a pointer.
