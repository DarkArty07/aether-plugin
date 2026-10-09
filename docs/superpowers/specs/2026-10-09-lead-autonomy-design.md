# Aether: the Lead's autonomy (design spec)

- **Date:** 2026-10-09
- **Status:** Written from the design the owner was shown on 2026-10-09 (approach A, six sections, amendments a–e). Sub-project 1 of 4.
- **Method:** superpowers brainstorming, architectural path, in Aether mode. The Lead's session is `7081714f-a148-4285-9b89-ad41d50a98f3`.
- **Amends:** the [Lead and Designer spec](2026-10-08-lead-and-designer-design.md) (the relay and the reply format) and the [lanes spec](2026-10-08-lanes-design.md) (the Designer's structured output). It updates decisions A2, A13, A14 and A22, and adds A23–A25.
- **Branch:** `feature/autonomy`, in the worktree `.worktrees/autonomy`. Plugin version 0.5.0.

## 0. Criterios del dueño

Estos criterios salen de la nota que el dueño confirmó («si entendiste bien») y de sus mensajes de esta sesión. Cada requisito de este spec dice a cuál sirve. Lo que no sirve a ninguno está en §9, Propuestas, y no se construye.

| | Criterio | Evidencia que lo prueba |
|---|---|---|
| **C1** | **Lo que autorizaste no se vuelve a preguntar.** Si autorizaste en general una clase de acción irreversible («todos los merges a main»), ningún Lead de ese repositorio vuelve a preguntarla: ni después de una compactación o un reinicio, ni en otra sesión, ni desde otra worktree. Si la limitaste a una sesión, vale en esa sesión. | Tests de `grant` y `check` (permanente, de sesión, desde una worktree enlazada); la regla del skill de correr `check` antes de lo irreversible. |
| **C2** | **El Lead orquesta, no pasa mensajes.** El Lead decide las rondas del Designer con tu intención y le contesta él. Solo te llega lo que tu intención no cubre, lo que choca con ella o lo irreversible que no autorizaste. | El formato `Decide` en `agents/designer.md` y en el esquema de lanes (tests); las reglas «Deciding with the Designer» del skill. |
| **C3** | **Con tu permiso de trabajar por horas, trabaja sin preguntarte y al final te da un brief:** hice, decidí, descubrí, espera tu sí, no terminé, propuestas, tiempo y costo. | Tests de `start`, `status`, `end` y del esqueleto del diario; la regla de seguir trabajando y la plantilla del brief en el skill. |
| **C4** | **Tus revisiones son las mínimas:** tu permiso al inicio y el brief al final. Lo irreversible que no autorizaste espera en el brief con el comando exacto, y el agente lo ejecuta cuando confirmas. Las fallas que ya tienen fallback nunca te llegan. | El skill (Espera tu sí, «Fallbacks never reach the owner»); el swarm skill §5 y §6. |
| **C5** | **Calidad y sin sobreingeniería.** «Terminado» es cumplir la intención: cada criterio con evidencia, los tests en verde y la revisión final sin hallazgos críticos ni importantes. Lo que rebasa tu intención va a Propuestas y no se trabaja; la repetición sin avance se corta; los topes de tiempo y costo detienen la corrida; si no termina, lo dice. | Tests de `status` (tope de tiempo y de costo); las reglas Done, Scope, Repetition y Honest stop del skill; este spec (cada requisito con «Sirve a»). |
| **C6** | **Las autorizaciones son verificables.** Cada una cita tus palabras; se comprueba contra lo que escribiste en esa sesión al registrarla y otra vez al leerla, y ningún agente la edita a mano. Un Lead hijo (subproyecto 4) podrá comprobarla igual. | Tests de citas (exacta, con otros espacios o mayúsculas, corta, de otro emisor, de otra sesión), de reverificación y del guard. |
| **C7** | **La autonomía se puede medir.** Cada brief dice cuánto tiempo trabajó solo, cuántas veces te consultó y cuánto costó, y qué cubre esa cifra. | La plantilla del brief en el skill; el brief de la primera corrida autónoma. |

## 1. Summary

Today the Lead relays: it tells the Designer what the owner wants, the Designer answers "tell them there is this option and that one", and the Lead passes it on. The owner approves every stage and every irreversible step, and is asked again for what they already authorized. Long work stops at each gate.

This change makes the Lead the owner's delegate:
- **It decides the Designer's rounds** with the owner's intent. The Designer keeps the final word on design, and its reply says who must close each round.
- **Standing authorizations** are recorded from the owner's quoted words, in a per-repository registry that any Lead can verify.
- **An autonomous run** starts from the owner's permission to work for hours, keeps a diary, stops at ceilings of time and cost, and ends with a brief.

The mechanism is one small command (`aether-autonomy`), one library, one config file, two more protected paths in the existing guard, one line in the session-start hook, and text in the skills and the Designer's prompt. No new hook.

## 2. Scope

**In:** sub-project 1, the Lead's autonomy: the orchestrator with the owner's intent, recorded standing authorizations, the brief and the ceilings.

**Out, and not closed off:**
- sub-project 2, the swarm that does not stop on its own (issues 002–005);
- sub-project 3, Telegram: the brief (R22), and the session waiting with a run open (R14), are what it will report;
- sub-project 4, parallel Leads across projects: a child Lead reads the same registry with `check` and `list`, and verifies the quotes against the parent's transcript (§4.3).

## 3. Deciding with the Designer

**R1. The reply format.** The Designer ends every round with:

    ## Decision
    <in the owner's language: what the round produced, the options, the recommendation, and what must be decided>

    ## For the Lead
    - Stage: approaches | design | spec | plan | question | blocked
    - Decide: lead — <reason> | owner — uncovered | conflict | irreversible: <reason>
    - Files: <paths and commits, or none>

- **Stage** says what the round produced; **Decide** says who closes it. They are independent.
- **Decide** is `lead` by default. The Designer writes `owner` for one of three reasons only:
  - `uncovered`: the owner's words and the confirmed understanding do not cover the decision, and no default can be defended from them;
  - `conflict`: the decision conflicts with the owner's words or with the confirmed understanding (this replaces the old rule "reply with Stage `question`" for a contradicting answer);
  - `irreversible`: the round needs an irreversible action (§4.1).
- **"Decision"** is in the owner's language and stands alone, so the Lead can act on it, show it as written, or copy it into the diary.

Sirve a: C2.

**R2. The Lead's rules.**
1. `Decide: lead`: the Lead decides. It takes the Designer's recommendation, unless the owner's words point to another of its options; then it takes that one and writes down why. At a spec or a plan, it reads the document against the criteria C1..Cn and sends back any addition that serves none, to be moved to Proposals. It never writes a design option of its own. When no option fits, it answers "none fits", with the owner's words that rule them out, and the Designer makes a new round.
2. The Lead's answer starts with `LEAD DECISION`: each point gives the choice and its grounds (a quote of the owner or a criterion). An escalated point comes back as `OWNER ANSWER`, with the owner's words unchanged.
3. The Lead may raise a `lead` to `owner` when it sees a gap or a conflict. It may lower an `owner` to `lead` only for `irreversible`, when `aether-autonomy check <class>` covers the action, and it cites the grant.
4. `Decide: owner` goes to the owner: shown as written outside a run; in a run it waits in the diary (R13, R18) and the work that does not depend on it goes on. When everything left depends on it, that is an honest stop (R19).
5. When the Lead disagrees with the recommendation and the owner's words do not settle it, it takes the recommendation and writes its disagreement in the diary. The design stays the Designer's.

Sirve a: C2, C4.

**R3. The spec carries the owner's criteria.** The Designer opens each spec with C1..Cn, taken from the confirmed understanding and the owner's words, each with its evidence. Every requirement ends with the criteria it serves, in the owner's language (`Sirve a: C2`). A requirement that serves none goes to the spec's Proposals.

Sirve a: C5.

**R4. The lane Designer.** The structured output of a Designer on a lane becomes `{ decision, stage, decide, files }`, rendered as the reply of R1 with its `- Lane:` line.

Sirve a: C2.

## 4. Standing authorizations

### 4.1 The irreversible classes

Everything local and reversible proceeds without asking. These classes need the owner's authorization:

| Class | Covers |
|---|---|
| `merge-main` | a merge or fast-forward into `main` or `master`, including merging a pull request into it |
| `push` | sending commits to any remote, or opening a pull request |
| `publish` | publishing a package or a release, or making a repository public |
| `deploy` | deploying, restarting or stopping services |
| `delete` | deleting data, or files and branches outside the run's worktrees |
| `credentials` | creating, copying, widening or rotating credentials and tokens |
| `paid-call` | real, paid model calls outside the swarm |

Sirve a: C1, C4.

### 4.2 The registry

**R5. Where.** `<main checkout>/.aether/autonomy/grants.json`: one per repository, shared by every worktree, and outside git. `aether-autonomy` adds `/.aether/` to the repository's `info/exclude` on every write, as the other Aether commands do, because a repository that never ran one is not excluded yet. The stale-run sweep never touches `.aether/autonomy/` (it sweeps `runs/`, `worktrees/`, `lanes/` and `design/`).

    { "grants":  [ { "class", "scope", "quote", "session", "time", "added" } ],
      "revoked": [ { "class", "quote", "session", "time", "added", "removed" } ] }

`time` is the timestamp of the owner's message that holds the quote; `added` is when it was written; `removed` is how many grants the revocation took away. Writes are atomic (a temporary file, then a rename). A registry that cannot be parsed is an error, never an empty registry.

Sirve a: C1.

**R6. Scope.** A grant is `repo` (the default: valid in this repository until revoked) or `session` (valid only in the Claude Code session whose transcript holds the quote). The owner's words decide which: general words that name the action ("todos los merges a main", "siempre") are `repo`; words limited to the session ("en esta sesión") are `session`. A specific action ("fusiona el del router") or a bare "sí" authorizes that one action once: it goes in the diary, not in the registry.

Sirve a: C1.

**R7. Verifying a quote.** `grant`, `revoke` and `start` find the transcript of the named session with `voice.findTranscript` and read its owner messages with `voice.ownerMessages(lines, { maxChars: Infinity })`, the same rules `aether-voice` uses, without its cut. Only messages of human origin count: not the agent's, not tool results, not subagents' (sidechains), not compaction summaries. The quote:
- is compared after normalizing both texts: Unicode NFC, runs of whitespace folded to one space, trimmed, lower case;
- must have at least 12 characters after normalizing;
- must appear whole inside one owner message.

A quote that fails writes nothing and exits with 2.

Sirve a: C6.

**R8. Verifying again on read.** `check` and `list` verify each grant's quote again:
- the transcript exists and holds the quote: `verified`;
- the transcript exists and does not hold it: `invalid`, and the grant is ignored;
- the transcript is gone (Claude Code deletes old transcripts, after 30 days by default): `transcript-gone`, and the grant still counts, as verified when it was written.

Each transcript is read at most once per command. This is what lets another Lead, a child Lead included, check a grant it did not write.

Sirve a: C1, C6.

**R9. Who writes.** `grants.json` and every `run.json` are written only by `aether-autonomy`. The existing guard refuses Write, Edit, MultiEdit and NotebookEdit on `.aether/autonomy/grants.json` and `.aether/autonomy/<id>/run.json` to every agent, the Designer included, with the reason "use aether-autonomy". The Lead writes the diary and the brief. The Designer and the swarm do not touch `.aether/autonomy/`.

It protects against honest mistakes and against an agent granting itself an authorization with its edit tools. It does not stop an agent that forges the file through Bash, as with specs today; a forged grant whose session has a transcript is caught as `invalid` on read.

Sirve a: C6.

### 4.3 Commands

    aether-autonomy grant  --class <class> --quote <text> [--session <id>] [--scope repo|session]
    aether-autonomy revoke --class <class> --quote <text> [--session <id>]
    aether-autonomy check  <class> [--session <id>]
    aether-autonomy list

- `--session` defaults to `CLAUDE_CODE_SESSION_ID`. `grant` and `revoke` need one.
- `check` exits 0 and prints the grant when a `repo` grant, or a `session` grant of the given session, covers the class; it exits 2 when none does. The most recent covering grant wins.
- `revoke` removes every grant of the class, of both scopes, and records the revocation, with `removed: 0` when there was none. It needs a quote of the owner too («ya no fusiones a main sin preguntarme»).
- `list` prints every grant with its status, and the revocations.

Sirve a: C1, C6.

## 5. The autonomous run

### 5.1 Starting

**R10. The permission is the confirmation.** The owner's permission to work for hours, in their own words, confirms the intent and the ceilings. The Lead writes the intent (the owner's quotes and C1..Cn) in the diary, runs `start`, and begins. It asks the owner only when the intent is materially ambiguous and no default can be defended. Without that permission there is no run: the Lead decides the design rounds and stops at the plan with a short brief (§5.5).

Sirve a: C3, C4.

**R11. Run state.**

    aether-autonomy start  --quote <the owner's permission> [--session <id>] [--hours N] [--usd N]
    aether-autonomy spend  <usd> --source <label>
    aether-autonomy status
    aether-autonomy end    --outcome done | ceiling | incomplete

- `start` verifies the quote as `grant` does, so the Lead cannot give itself a run. It refuses while another run is open in the repository (one open run per repository; parallel Leads are sub-project 4). It creates `.aether/autonomy/<id>/run.json` and the diary skeleton, with the id `auto-YYYYMMDD-HHMMSS-xxxx`.
- **Ceilings:** `config/autonomy.json` holds `{ "hours": 8, "usd": 50 }`. A number the owner said overrides its default, and the run records the source of each (`owner` or `default`).
- `status` prints the id, the diary, the hours elapsed and their ceiling, the spend and its ceiling, and `stop`: `null`, `"time"` or `"cost"` (time first when both). With no open run it prints `{ "open": false }`.
- `spend` records a figure (R12) and prints the status.
- `end` closes the run with its outcome.

    { "id", "session", "quote", "quoteTime", "started",
      "ceilings": { "hours", "usd", "source": { "hours", "usd" } },
      "spend": [ { "source", "usd", "at" } ], "ended": null, "outcome": null }

Sirve a: C3, C5.

**R12. What the cost covers.** The figure is what Aether already prices, recorded by the Lead with `spend`:
- after each swarm launch, `lanes.totals.run.totalUsd` from `aether-report --run <runId>`, with the swarm run id as the source. That figure is the native cost the usage meter recorded inside the run's window (the swarm's agents, and the Lead's own turns while it waited) plus the run's lane calls;
- after each Designer round on a lane, the dollars of its `- Lane:` line, with `<design id>/<round number>` as the source. A line that says `$?` records nothing.

A new figure for a source already recorded replaces the old one, because a swarm report adds up every launch of its run. The figure does not cover the Lead's turns or a native Designer's rounds outside a swarm launch: the usage meter records them, but no command adds them up yet (§9). The brief says what the figure covers, and the 8-hour ceiling is the real guard.

Sirve a: C5, C7.

**R13. The diary.** `.aether/autonomy/<id>/diary.md`, in the owner's language, written by the Lead after every decision. `start` writes its skeleton:

    # Corrida <id>

    ## Intención

    > <the quote>
    — permiso del dueño, <quoteTime>

    ## Topes

    - Horas: <hours> (<del dueño | por defecto>)
    - USD: <usd> (<del dueño | por defecto>)

    ## Decisiones

    ## Descubrimientos

    ## Espera tu sí

    ## Propuestas

    ## Estado

The Lead fills in: Intención (the quotes and C1..Cn), Decisiones (`D<n>: qué se decidía · opciones · elección · fundamento (cita o Cn) · quién`), Descubrimientos, Espera tu sí (`acción · clase · el comando exacto`), Propuestas (outside the intent; not worked), Estado (current step · the Designer's id or lane design id · spec and plan · swarm runs · next step).

Sirve a: C3.

### 5.2 Rules of the run

**R14. Keep going.** While a run is open, the Lead never ends a turn unless something pending will wake it (a Designer on a lane or a native Designer in the background, a swarm workflow, a background command) or the run has ended. If nothing is pending and work remains, it does the next step in the same turn. An open run with nothing pending is the session waiting for the owner; sub-project 3 will report it. No new mechanism and no hook.

Sirve a: C3.

**R15. Permission prompts.** A Claude Code permission prompt stops a run like a question. An autonomous run assumes the owner started the session so that its tools do not prompt (a permission mode or allow rules of the owner's choice); otherwise it waits at the first prompt. The skill and the README say so; the plugin never turns permissions off. A Lead whose session has prompted writes in the diary that the run will wait at the next prompt.

Sirve a: C3.

**R16. Fallbacks never reach the owner.** A failure that already has a defined fallback is handled at once, recorded in the diary, and never asked about nor listed in "Espera tu sí": a lane that is missing, out of quota or failing (the call runs native); a lane Designer round that fails or cannot run (the native Designer continues from the files); a Designer that fails, replies without the format, stops at `maxTurns` or is lost (resumed or started again from the files); a swarm unit blocked by a merge failure or a spent ladder, or skipped (the swarm skill §5); a command that leaves a worktree dirty (its changes kept in a stash). The owner said it twice: «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño». When the same fallback fails twice on the same step, R19 applies.

Sirve a: C4.

**R17. Scope and ceilings.** The Lead compares everything new with the intent; what goes beyond it goes to Propuestas and is not worked, and minor final-review findings are deferred. It runs `status` before each Designer round and before each swarm launch or relaunch. When `stop` is not null it starts nothing new: what is running finishes or is saved as patches (never a merge left half done), then `end --outcome ceiling` and the brief.

Sirve a: C5.

**R18. Irreversible steps.** Before an action of §4.1 the Lead runs `check <class>`. Covered: it acts and cites the grant in the diary. Not covered and no one-time authorization: the action, its class and the exact command go to "Espera tu sí", and the work that does not depend on it goes on. The swarm skill's finish follows the same rule: the Lead picks the `finishing-a-development-branch` option itself, and merges to main or pushes only when `check merge-main` or `check push` passes or the owner authorized that one action in their own words.

Sirve a: C1, C4.

**R19. Done, repetition and the honest stop.**
- **Done:** every criterion has its evidence in the diary (a test, an output or a file), the test command passes on the integration branch, and the final review leaves no open critical or important finding. The Lead then applies the irreversible steps the registry covers, leaves the rest in "Espera tu sí", runs `end --outcome done` and gives the brief.
- **Repetition:** the same task redesigned twice, the same unit relaunched twice without success, or a third correction round on the same finding. The Lead stops that line, notes the defect in the diary, takes the smallest reversible path (defers that task) and goes on with the rest.
- **Honest stop:** when everything left waits for the owner, or every remaining line fell under the repetition rule: `end --outcome incomplete`, and the brief says what is missing and why.

Sirve a: C5.

**R20. Resuming.** The SessionStart hook adds, when the session's repository has an open run: `Autonomous run <id> is open: read <diary> and run \`aether-autonomy status\` before anything else.` The new Lead continues from "Estado"; a lost Designer is started again from the spec and plan files.

Sirve a: C3.

### 5.3 Execution method

**R21.** In a run, the Lead chooses the execution method itself (the swarm by default when the plan has Aether fields) and notes it in the diary. Outside a run, it recommends one in the short brief, and the owner's yes starts it.

Sirve a: C3, C4.

### 5.4 The brief

**R22.** The brief goes to `.aether/autonomy/<id>/brief.md`, in the owner's language, and the Lead shows it in chat. It is also what sub-project 3 will send.

    # Brief: <id>
    **Resultado:** cumplida | parcial | no terminada — <el tope alcanzado, si lo hubo>
    ## Criterios
    - C1 <criterio>: cumplido | parcial | no — <evidencia>
    ## Hice
    ## Decidí
    ## Descubrí
    ## Espera tu sí
    - <acción> — <clase> — se ejecutará: `<comando exacto>`
    ## No terminé
    ## Propuestas
    ## Tiempo y costo
    - Trabajó solo <h> h de <tope> h, y te consultó <n> veces.
    - US$ <gasto> de US$ <tope>. La cifra cubre el swarm y las lanes; no cubre los turnos del Lead ni los del Designer nativo fuera del swarm.

The owner's "sí" to an item of "Espera tu sí" authorizes that action once, and the agent runs it; if the owner's words are general, the Lead also records a grant.

**R23. The short brief,** when there was no permission for hours: the intent, the spec and the plan (paths and about five lines each), the decisions, the proposals, and in "Espera tu sí" the plan's execution with the recommended method.

Sirve a: C3, C4, C7.

## 6. What changes in the plugin

| File | Change | Sirve a |
|---|---|---|
| `lib/autonomy.js` (new) | The classes, quote verification, the registry, the run state, `status` with an injectable `now`. Pure apart from its own files and the transcripts. | C1, C3, C5, C6 |
| `bin/aether-autonomy` (new) | The CLI of §4.3 and §5.1. Exit 0 ok or covered, 2 quote not verified or not covered, 1 error. One JSON line on stdout. | C1, C3, C5, C6 |
| `config/autonomy.json` (new) | `{ "hours": 8, "usd": 50 }` | C5 |
| `lib/guard.js` | The two protected paths of R9, for every agent. Same hook, same matcher. | C6 |
| `bin/aether-session-start` | The open-run note of R20. | C3 |
| `lib/lane-schemas.js`, `lib/lane-design.js` | R4: the schema, the render, and the external-harness note. | C2 |
| `agents/designer.md` | R1, R3, the resumed answers (`LEAD DECISION`, `OWNER ANSWER`). | C2, C5 |
| `skills/using-aether/SKILL.md` | The Lead as the owner's delegate; "The relay" becomes "Deciding with the Designer"; "Fallbacks never reach the owner"; "Autonomous runs"; the execution method. | C1–C5, C7 |
| `skills/swarm/SKILL.md` | §1 the plan approved by the delegate, permissions in the diary; §3 `status` before a launch; §4 `spend` and the report to the diary; §5 questions answered from the intent, the rest to "Espera tu sí", minor findings deferred; §6 the finish of R18. | C1, C4, C5 |
| `hooks/hooks.json` | None. | — |
| README, `docs/decisions.md`, `plugin.json` | The relay and the owner's per-stage gates are gone from the docs; A23–A25; version 0.5.0. | C2, C4 |

## 7. Error handling

- An unknown class, scope or outcome, a ceiling or spend that is not a positive finite number (a spend may be 0), a missing value after a flag, or a missing session id: exit 1 with `{ "error": "<message>" }`.
- A quote that fails verification: exit 2 with `{ "verified": false, "reason": "<why>" }`, and nothing written.
- A registry or a `run.json` that cannot be parsed: exit 1, naming the file. Nothing is treated as empty.
- `start` with a run open, and `spend` or `end` with none: exit 1.
- The session-start note never blocks a session: any error leaves the note out.

## 8. Testing

- `tests/autonomy.test.js` (new): the quotes (exact, other spacing or case, too short, not the owner's: the agent, a tool result, a subagent; another session; no transcript); `grant`, `revoke`, `check` and `list`; the session scope; re-verification when the transcript is gone and when it no longer holds the quote; `start` with the defaults, with the owner's numbers, with an open run and with an unverified quote; the diary skeleton; `status` with `stop` by time and by cost; `spend` replacing per source; `end`; a corrupt registry.
- `tests/aether-autonomy.test.js` (new): exit codes and JSON; a grant read from a linked worktree; `.aether/` kept out of `git status`; the bin is executable.
- `tests/guard.test.js`: the two files refused to every agent, the Designer included; the diary, the brief and lookalike paths allowed.
- `tests/session-start-autonomy.test.js` (new): the note with an open run only.
- `tests/session-start.test.js`, `tests/agents.test.js`, `tests/aether-lane.test.js`, `tests/lane-design.test.js`, `tests/roles.test.js`, `tests/launcher.test.js`: the new format, schema, skill text, version and decisions.

## 9. Proposals (outside the criteria; not built)

- **Measuring the whole session's cost.** The usage meter already records every request of the session, the Lead's and a native Designer's included, and the lane log records lane calls by session. `status` could add them up since the run's start instead of relying on `spend`. It needs a rule for a run that spans several sessions (a restart), so it is left for later.
- **Grants across repositories** («todos los merges a main» for every project): sub-project 4.
- **Enforcing the classes in a hook** (approach B, issue 006): not wanted; the owner's complaint is being asked too much.

## 10. Verified against the code (2026-10-09)

- `lib/voice.js` exports `ownerMessages(lines, { maxChars = 8000 })`, `findTranscript(sessionId, { configDir })` and `render`. `ownerMessages` cuts long messages, so autonomy passes `maxChars: Infinity`. `findTranscript` searches every project folder, so a Lead in another repository can verify a quote.
- `lib/guard.js` is pure and checks the resolved path against one pattern, exempting `aether:designer`; the autonomy paths get no exemption.
- `bin/aether-session-start` builds its context from the bootstrap, the sweep note and nothing else; the note is one more part.
- `lib/lane-schemas.js` `DESIGNER_SCHEMA` requires `forOwner, stage, waitingFor, files`, and `lib/harness/agy.js` rejects a structured output that lacks a required key, so the schema and the render change together.
- `aether-report` returns `lanes.totals.run.totalUsd` (native in the run's window plus the run's lanes) and `lanes.totals.session`. The usage meter (`hooks/register.js`) records the main session's requests too, so the design's "the Lead's session is not measured" is corrected in R12 to "measured, not added up". The report is cumulative over relaunches, so `spend` replaces per source (the design said it adds each launch).
- `.aether/` is excluded from git only after an Aether command calls `run.ensureExcluded`, so `aether-autonomy` calls it too (the design assumed it was always ignored).
- The sweep also clears `.aether/design/`; none of its four directories is `autonomy/`.
- The run id reuses `run.newRunId` (`auto-YYYYMMDD-HHMMSS-xxxx`) instead of the design's `auto-AAAAMMDD-HHMM`, so two runs in one minute cannot collide.

## 11. Decisions

| ID | Decision |
|---|---|
| A23 | **The Lead decides as the owner's delegate.** It holds superpowers' approval gates with the owner's intent, chooses among the Designer's options and answers its questions. The Designer keeps the final word on design, and its reply's `Decide` line says who closes each round. Only what the intent does not cover, what conflicts with it, and unauthorized irreversible actions reach the owner. Failures with a defined fallback never do. Updates A2, A13 and A22. |
| A24 | **Standing authorizations** are recorded per repository, from the owner's quoted words verified against their transcript, by `aether-autonomy` alone; aether-guard refuses edits to the registry and the run state. Seven irreversible classes; everything local and reversible proceeds. Updates A14. |
| A25 | **Autonomous runs.** The owner's permission to work for hours confirms the intent and the ceilings (8 hours and US$ 50 by default; the owner's numbers override them). The run keeps a diary, keeps going while work remains, stops at a ceiling, at done or honestly, and ends with a brief. Without the permission, the Lead stops at the plan with a short brief. |
