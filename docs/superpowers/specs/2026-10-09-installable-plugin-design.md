# Aether: a Claude Code plugin anyone can install (design spec)

- **Date:** 2026-10-09
- **Status:** Written from approach A, which the Lead approved as the owner's delegate on 2026-10-09, with five points and the criteria C1–C7 (round 1).
- **Method:** superpowers brainstorming, architectural path, in Aether mode. The Lead's session is `6dd2c6ca-aa04-4bf0-8c52-d2ccb5494905`.
- **Supersedes:** the install and launch parts of the [separation spec](2026-10-09-separation-design.md): `scripts/aether-install.js`, `scripts/aether-mode.fish` and `aether-mode --dev`.
- **Amends:** decisions A8 (how a session loads the plugin) and A16 (how the Lead's model, effort and advisor are set), and the README's "Use Aether mode", "Development" and "Release" sections.
- **Branch:** `feature/installable`, in the worktree `.worktrees/installable`, from `main` at `0d2dd38`. Plugin version 0.6.0 → 0.7.0.

## 0. Criterios del dueño

Salen de las palabras del dueño en esta sesión («ahora si lo quiero hacer un plugin de claude code, actualmente parece mas plugin como config que plugin natvio, ahora si lo quiero hacer un plugin instalable», «para cualquiera que lo instale») y del entendimiento que confirmó. Cada requisito de este spec dice a cuál sirve. Lo que no sirve a ninguno está en §16, Propuestas, y no se construye.

| | Criterio | Evidencia que lo prueba |
|---|---|---|
| **C1** | **Se instala con los comandos de Claude Code** (`marketplace add`, `plugin install`): sin función fish, sin `--plugin-dir`, sin instalador del proyecto. | Aceptación A1: en una configuración aislada, los comandos de `claude plugin` instalan Aether desde un clon del repositorio, y `claude plugin list` lo muestra activo. `claude plugin validate . --strict` pasa sobre el marketplace. El repositorio ya no tiene instalador ni launcher. |
| **C2** | **Arrancar el modo Aether es un comando nativo, el mismo en todo shell:** `claude --agent aether:lead --effort xhigh`. | Aceptación A2: ese comando, desde bash y desde fish, da una sesión en Sonnet a `xhigh`, con el system prompt de Claude Code intacto, todas sus herramientas y el bootstrap de Aether. El comando no lleva variables de entorno, comillas ni JSON. |
| **C3** | **Opt-in por sesión:** una sesión sin el agente es modo normal: nada inyectado, nada negado, nada registrado ni escrito. La huella dormida está medida y escrita. | Tests unitarios de la compuerta (hook de inicio, guard, medidor). Aceptación A3: una sesión normal con Aether instalado no recibe contexto, no ve agentes `aether:*` y no deja archivos. La huella dormida está en §5.5 y en el README. |
| **C4** | **Funciona para cualquiera:** sin supuestos de máquina (shell, ruta de datos, clave, lanes solo en Linux, superpowers), con una guía de instalación. | Tests de la regla del directorio de datos y de la compuerta de lanes. La comprobación de dependencia de A1. Una prueba de que el cuerpo del plugin no nombra `.local/share`, `aether-mode` ni fish. La guía del README. |
| **C5** | **El cuerpo del plugin no se reescribe;** solo cambian los puntos de §11. | El diff de la rama toca solo los archivos de §11. |
| **C6** | **Esta obra no publica, no empuja y no crea etiquetas, y el 0.6.0 instalado del dueño sigue funcionando.** | `git tag` y el remoto sin cambios. Sumas de verificación de `~/.local/share/aether-plugin/installed/` antes y después. `aether-mode` sigue resolviendo a la copia instalada. |
| **C7** | **Cada afirmación de soporte coincide con lo verificado.** | La tabla de §2 marca cada hecho como medido o documentado. La tabla de soporte del README coincide con ella. `docs/claude-code-research.md` registra las mediciones. |

## 1. Summary

Today Aether is "a plugin as config": the fish function `aether-mode` loads an installed copy with `--plugin-dir` and passes the settings, model, effort and environment the Lead needs. Installing means running the project's own script.

After this change:
- **Install:** anyone installs Aether with Claude Code's own commands, from a marketplace file at the repository's root. superpowers comes with it as a declared dependency.
- **Start:** Aether mode starts with one native command, `claude --agent aether:lead --effort xhigh`. A repository can make it the default with two settings in `.claude/settings.local.json`.
- **Opt-in:** the plugin stays installed and enabled, but every session that is not an Aether session finds it dormant. Its hooks do nothing, its meter records nothing, and its agents are not offered.
- **Data:** it lives in the plugin's own data directory, which `claude plugin uninstall` removes.
- **Lanes:** they are an option that is off unless the user turns it on, and they run only on Linux.
- **Retired:** the installer and the fish launcher. Updates and rollback use Claude Code's plugin commands.

The body of the plugin (agents, skills, workflow, `bin/`, libraries) keeps working as it does. The changes are the session gate, the data directory rule, the lanes switch, one new agent file and the manifests.

## 2. Verified platform facts (Claude Code 2.1.296)

**How the measurements were made.** The measured facts come from throwaway plugins in the session's scratchpad, with an isolated `CLAUDE_CONFIG_DIR`. A local script played the Messages API on a free random port, either recording requests or scripting tool calls. No request reached Anthropic, and nothing was billed. The documented facts come from code.claude.com: the plugins reference, plugin loading, marketplace reference, dependencies, install, hooks, sub-agents, workflows, mods reference and advisor pages.

| # | Fact | Source |
|---|---|---|
| F1 | `claude --agent <plugin>:<agent>` with an agent whose body is empty runs the main session on the agent's model, here Sonnet. Claude Code's system prompt stays unchanged (5,921 characters, as in a plain session), and the session keeps the same 20 tools, `Agent`, `Workflow`, `SendMessage` and `Skill` among them. | Measured |
| F2 | An agent with a body replaces the whole system prompt: 154 characters instead of 5,921. | Measured |
| F3 | An agent's `effort` frontmatter does not apply to the main session, which stays at `medium`, Sonnet 5.5's default. `--effort xhigh` sets the main session to `xhigh`, and subagents that set no effort of their own follow it. | Measured |
| F4 | `"agent": "<plugin>:lead"` and `"effortLevel": "xhigh"` in a repository's `.claude/settings.local.json` give the same session as the flags, `agent_type` included. | Measured |
| F5 | A SessionStart hook receives `agent_type: "<plugin>:lead"` when the session was started with `--agent`, and no `agent_type` without it. | Measured |
| F6 | Hooks that fire inside plugin subagents, `general-purpose` subagents and workflow agents (with an `agentType`, and without one as `workflow-subagent`) receive the session's own `session_id`. Their `agent_type` is the subagent's type. | Measured |
| F7 | `export` lines that a SessionStart hook appends to `CLAUDE_ENV_FILE` reach the Bash commands of the main session, of subagents and of workflow agents. | Measured |
| F8 | Hook processes receive `CLAUDE_PLUGIN_DATA`: `<plugins root>/data/<id>`, where `<id>` is the plugin id with each character other than a letter, digit, `_` or `-` replaced by `-`. That is `aether-aether-plugin` for `aether@aether-plugin`, and `aether-inline` for a `--plugin-dir` copy. Hooks also receive `CLAUDE_PLUGIN_OPTION_<KEY>`. Bash commands receive neither. | Measured (Bash: documented) |
| F9 | A mod loads from a copied marketplace install, as from `--plugin-dir`. In a mod:<br>- `$.env.get('CLAUDE_PLUGIN_DATA')` is `null`;<br>- `$.plugin.name` and `$.plugin.root` are properties, and the root of a marketplace install is its version directory in the plugin cache;<br>- `register(on, options)` receives the `userConfig` values;<br>- `classic.SessionStart` carries `agent_type`;<br>- `agent.offer` fires once for each agent offered, with `e.agent` such as `aether:designer`. | Measured |
| F10 | Returning `{ isOffered: false }` from `agent.offer` withholds that agent. | Documented |
| F11 | `claude plugin install <p> --config lanes=true` stores `pluginConfigs["<id>"].options.lanes = true` in user settings. Hooks then see `CLAUDE_PLUGIN_OPTION_LANES=true`, and the mod receives `{ lanes: true }`. | Measured |
| F12 | A dependency `{ "name": "superpowers", "marketplace": "claude-plugins-official" }` resolves when the root marketplace lists `claude-plugins-official` in `allowCrossMarketplaceDependenciesOn`.<br>- With the official marketplace added, the install works, and adding that marketplace even installed superpowers by itself.<br>- Without it, the install succeeds with a warning, and the plugin fails to load with `Dependency "superpowers@claude-plugins-official" is not installed — run claude plugin install superpowers@claude-plugins-official, or check that its marketplace is added`.<br>Claude Code adds the official marketplace at a user's first interactive session. | Measured (the last sentence: documented) |
| F13 | A marketplace added from a local path loads the plugin in place, from the working tree: no copy and no pin. `claude plugin marketplace add` refuses `<path>#<ref>` ("Path does not exist") and `file://…#<ref>` ("Invalid marketplace source format"). | Measured |
| F14 | A `git` marketplace with a `file://` URL and a `ref`, declared under `extraKnownMarketplaces` in user settings, is cloned at the next session start, and installs a copy of that tag into the plugin cache. Changing the `ref`, starting a session and running `claude plugin update` moved the plugin from 0.0.1 to 0.0.2 and back. The data directory survived each move. | Measured |
| F15 | `claude plugin marketplace add owner/repo#<ref>` pins a GitHub marketplace to a tag, and `claude plugin install <p> --marketplace owner/repo` adds the marketplace and installs in one command (2.1.292 or later). Removing a marketplace uninstalls its plugins and deletes their data. | Documented |
| F16 | A `--plugin-dir` copy replaces an installed plugin of the same name for that session: only the development copy's mod ran. | Measured |
| F17 | After an update, the previous version's directory stays for 14 days. A pinned `version` keeps users on it until the author changes it. Auto-update is off by default for third-party marketplaces. | Documented |
| F18 | Dynamic workflows are available on paid plans; on Pro they are turned on once, in `/config`. With `enableWorkflows: true` the `Workflow` tool is present. | Documented (the tool: measured) |
| F19 | A plugin's settings honor only `agent` and `subagentStatusLine`. A plugin cannot set environment variables, permissions, effort or the advisor. | Documented |
| F20 | The advisor is off unless the user configures it. `/advisor off` or `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` turns it off. | Documented |
| F21 | The 0.6.0 plugin, installed and enabled, in a plain session that is not Aether mode:<br>- the first message grows by 4,280 characters: "Aether mode is active", a 2 KB preview of the bootstrap (Claude Code saved the 19.8 KB context to a file), five agent lines, `aether:run` and `aether:swarm`;<br>- the system prompt and tools stay unchanged;<br>- `claude plugin details` estimates about 405 tokens always on: agents about 270, skills about 130;<br>- eight executables are on `PATH`. | Measured |
| F22 | An agent's `skills` frontmatter preloads nothing when the agent is the main session. | Measured |
| F23 | In a repository whose local settings set `"agent": "<plugin>:lead"`, the command `claude --agent claude` starts a default session: the default model, the plain system prompt, and `agent_type: "claude"`. The repository's `effortLevel` still applies. | Measured |

## 3. Architecture

```text
install    .claude-plugin/marketplace.json (repo root) ── claude plugin install ──▶ copy in the plugin cache
           plugin.json: dependency superpowers@claude-plugins-official, option `lanes` (off)

start      claude --agent aether:lead --effort xhigh
           agents/lead.md: model sonnet, empty body (Claude Code's system prompt stays)

session    SessionStart hook (every source)
  gate       agent_type == aether:lead ?
               yes: mark the session; export AETHER_LANES; on startup|clear|compact inject the bootstrap
               no:  nothing at all
           aether-guard (PreToolUse): marked session ? today's rules : allow
           usage meter mod:           marked session ? record, save lane payloads, offer agents but the Lead
                                                     : record nothing, withhold every aether:* agent

data       dataDir(): AETHER_DATA_DIR, else the plugin's own data directory, derived from the plugin root
lanes      AETHER_LANES=on and Linux ? today's lanes : native calls
```

## 4. Distribution

**R1. The marketplace.** A new file `.claude-plugin/marketplace.json` at the repository root holds exactly:

```json
{
  "name": "aether-plugin",
  "owner": { "name": "DarkArty07" },
  "description": "Aether Plugin: an opt-in Aether mode for Claude Code, a Lead, a Designer and a supervised swarm.",
  "allowCrossMarketplaceDependenciesOn": ["claude-plugins-official"],
  "plugins": [
    {
      "name": "aether",
      "source": "./plugins/aether",
      "description": "Aether mode: the Lead on Sonnet, the Designer on Opus, and a parallel swarm that implements approved plans. Start it with claude --agent aether:lead --effort xhigh."
    }
  ]
}
```

The entry sets no `version`, because `plugin.json` holds it and wins. It sets no `defaultEnabled`: the plugin is enabled once installed, and the session gate (§5) keeps it dormant. Sirve a: C1, C4.

**R2. The manifest.** `plugins/aether/.claude-plugin/plugin.json` changes in three places:
- `"version": "0.7.0"`;
- `"dependencies": [{ "name": "superpowers", "marketplace": "claude-plugins-official" }]`, with no version range, because superpowers' repository is not tagged by this convention;
- `"userConfig"`:

```json
"userConfig": {
  "lanes": {
    "type": "boolean",
    "title": "Lanes",
    "description": "Run Aether's calls on agy while its quota lasts. Off by default: agy runs with --dangerously-skip-permissions and spends another plan's quota. Linux only.",
    "default": false
  }
}
```

The `description` field stays as it is. Sirve a: C1, C4.

**R3. Validation.** `npm run validate` checks both manifests: `claude plugin validate plugins/aether --strict && claude plugin validate . --strict`. Sirve a: C1.

## 5. Starting Aether mode, and the session gate

### 5.1 The Lead agent

**R4.** A new file `plugins/aether/agents/lead.md` holds exactly this frontmatter and no body:

```markdown
---
name: lead
description: "Aether Lead: the main session of Aether mode, started with claude --agent aether:lead --effort xhigh. It is not a subagent."
model: sonnet
---
```

- The body must stay empty, with no `memory` field, so that Claude Code's own system prompt stays (F1, F2).
- It sets no `tools`, so the Lead keeps every main-session tool (F1).
- It sets no `effort`, which would not apply (F3). The effort comes from `--effort xhigh`, as the Lead decided (round 1, point 3).

Sirve a: C2.

**R5. The start commands**, as the guide gives them:
- per session: `claude --agent aether:lead --effort xhigh`;
- per repository: `.claude/settings.local.json` containing `{ "agent": "aether:lead", "effortLevel": "xhigh" }`, after which plain `claude` in that repository starts Aether mode (F4). Normal mode there is then `claude --agent claude`, which keeps the repository's `effortLevel` (F23).

Sirve a: C2, C3.

### 5.2 The session-start hook

**R6.** In `hooks/hooks.json`, the SessionStart matcher becomes `startup|resume|clear|compact`. The PreToolUse entry and `modules` stay. Sirve a: C3.

**R7.** `bin/aether-session-start` reads the hook's JSON from stdin, and acts by the session's agent and the source:

| `agent_type` | `source` | What it does | Output |
|---|---|---|---|
| not `aether:lead`, absent, or stdin unreadable | any | Nothing: no pruning, no sweep, no marker, no environment line, no file read or written beyond stdin | none; exit 0 |
| `aether:lead` | `resume` | Marks the session; appends the lanes line to `CLAUDE_ENV_FILE` | none; exit 0 |
| `aether:lead` | `startup`, `clear`, `compact`, or absent | Marks the session; appends the lanes line; prunes usage files, lane logs and session markers not written to for 30 days; sweeps stale runs; injects the context as today | the SessionStart JSON with `additionalContext` that starts with `Aether mode is active.`; exit 0 |

- **The lanes line** is exactly `export AETHER_LANES=on` when `CLAUDE_PLUGIN_OPTION_LANES` is exactly `true`, and `export AETHER_LANES=off` otherwise.
- **When `CLAUDE_ENV_FILE` is unset,** no line is written. The context then gets one more paragraph: `Aether could not pass the lanes option to this session's commands, so lanes are off.`
- **When the marker cannot be written,** or the input has no valid `session_id`, the context gets: `Aether could not mark this session (<reason>): the spec and plan guard and the usage meter are off in it.`

Sirve a: C3, C4.

### 5.3 The guard

**R8.** `bin/aether-guard` first checks the marker: when the input's `session_id` has no marker in the data directory, it allows the call and prints nothing. In a marked session, `lib/guard.js`'s `decide` applies as today, unchanged. The marker covers every agent of an Aether session, `general-purpose` and workflow agents included (F6). Sirve a: C3.

### 5.4 The usage meter

**R9.** `hooks/register.js` becomes `register(on)` with a session gate:
- **Which sessions are Aether:**
  - a `classic.SessionStart` event whose `agent_type` is `aether:lead` marks the current session as Aether;
  - otherwise, the first `turn.step`, `agent.offer` or `agent.spawn` of a session checks the marker file (`$.fs.exists`), and keeps the answer for that session id;
  - a new session id, after `/clear`, is checked again.
- **`turn.step`, `agent.spawn` and their writes** (usage parts, lane payloads, `spawn.json`) happen only in an Aether session. In any other session the meter records nothing and writes nothing.
- **`agent.offer`:**
  - in a session that is not Aether, every agent whose `e.agent` starts with `aether:` is withheld with `{ isOffered: false }`;
  - in an Aether session, only `aether:lead` is withheld, and every other agent is offered as today.
- **Every hook keeps a `.catch`** that passes the event on unchanged, so a failure only stops the observing.

Sirve a: C3.

### 5.5 The dormant footprint

What a session that is not Aether mode still carries, by design:
- the eight executables of `bin/` on the Bash tool's `PATH`, as for any enabled plugin;
- the plugin's listing in the first message:
  - measured today (F21): 4,280 characters, with the bootstrap preview and five agents, and about 405 tokens by `claude plugin details`;
  - after this change, the bootstrap and the agents are gone (R7, R9), and the `aether:run` and `aether:swarm` lines remain;
- one short `node` process per session start, and one per `Write`, `Edit`, `MultiEdit` or `NotebookEdit` call. Each reads its input, finds no marker, and exits.

**R10.** Acceptance A3 measures the footprint after the change: characters and the listed lines in the first request, `claude plugin details`, and the `bin/` count. It writes the result into the README's "What Aether adds to a normal session" and into `docs/claude-code-research.md`. Sirve a: C3, C7.

## 6. The data directory

**R11.** `lib/run.js`'s `dataDir(env = process.env, root = <the plugin root>)` resolves the data directory in this order:
1. `env.AETHER_DATA_DIR`, when set and not empty.
2. Otherwise it starts from the plugins root, which is:
   - `env.CLAUDE_CODE_PLUGIN_CACHE_DIR` when set;
   - else `<env.CLAUDE_CONFIG_DIR or ~/.claude>/plugins`.
3. When the plugin root is `<plugins root>/cache/<marketplace>/<plugin>/<version>`, the directory is `<plugins root>/data/<id(plugin@marketplace)>`. The paths are compared after resolving symbolic links, where the file system allows.
4. Otherwise, for a copy loaded in place (`--plugin-dir`, or a marketplace added from a local path), the directory is `<plugins root>/data/<id(aether@inline)>`.

`id(s)` replaces every character other than a letter, digit, `_` or `-` with `-`.

For an install from the `aether-plugin` marketplace, this is `~/.claude/plugins/data/aether-aether-plugin/`, the same directory Claude Code gives the plugin as `CLAUDE_PLUGIN_DATA` (F8). The bins and the hooks use `dataDir()`; none reads `CLAUDE_PLUGIN_DATA`. That keeps every part on one rule, and needs nothing from the environment file.

Sirve a: C4.

**R12.** The mod applies the same rule with `$.env.get('AETHER_DATA_DIR')`, `$.env.get('CLAUDE_CODE_PLUGIN_CACHE_DIR')`, `$.env.get('CLAUDE_CONFIG_DIR')`, `$.env.get('HOME')`, `$.plugin.root` and `$.plugin.name`. It compares paths as given, because a mod cannot resolve links. Sirve a: C4.

**What follows from R11:**
- `claude plugin uninstall aether@aether-plugin` deletes the data directory, unless the user passes `--keep-data`.
- A development session with `--plugin-dir` keeps its data apart, in `aether-inline`.
- The marker files live in `<data>/sessions/`.
- `scripts/refresh-lanes.js` is a maintainer's script outside the plugin. It keeps reading `ARTIFICIAL_ANALYSIS_API_KEY` or its own `.env`, unchanged. The plugin needs no key at run time.

## 7. Lanes and platforms

**R13.** `lib/lanes.js` gains `lanesEnabled(env = process.env, platform = process.platform)`. It returns:
- `{ on: true, reason: null }` when `env.AETHER_LANES === 'on'` and `platform === 'linux'`;
- else `{ on: false, reason: 'platform' }` when `env.AETHER_LANES === 'on'`;
- else `{ on: false, reason: 'option' }`.

Sirve a: C4.

**R14.** `aether-plan compile`, when `lanesEnabled()` is off, behaves as with `--no-lanes`, and writes one line to stderr:
- for reason `option`: `aether-plan: lanes are off: the aether plugin's lanes option is not on`;
- for reason `platform`: `aether-plan: lanes are off: lanes need Linux`.

`--no-lanes` keeps its meaning. Sirve a: C4.

**R15.** `aether-lane design start`, when `lanesEnabled()` is off, answers exit 3 before any other check: `{"unavailable":"off"}` for reason `option`, and `{"unavailable":"platform"}` for reason `platform`. The Lead's existing rule for exit 3 starts the native Designer. Sirve a: C4.

**R16. Platforms**, as the README states them:

| Platform | Status | What degrades |
|---|---|---|
| Linux, WSL included | Supported, verified | Nothing. Lanes run when the option is on and `agy` is installed |
| macOS | Supported by design: Aether needs only Node.js 22 and git. Not verified on a Mac in this work | Lanes stay off: they read `/proc` |
| Windows, native | Not verified, not claimed. Hooks run through Git Bash (documented) | Lanes stay off |

Sirve a: C4, C7.

## 8. What the plugin cannot carry: the user's honest steps

**R17.** The guide states each step a user takes, because no plugin can do it (F3, F18–F20):

| Need | Step |
|---|---|
| The Lead at `xhigh` | `--effort xhigh` in the start command, or `effortLevel` in the repository's settings |
| Dynamic workflows, for the swarm | Nothing on most paid plans. On Pro, turn on Dynamic workflows in `/config` once |
| No advisor in Aether mode (cost: each call rereads the whole conversation, uncached) | Nothing unless you configured one. If you did, run `/advisor off` |
| Permissions for the swarm | Allow rules for `git`, `aether-wt`, `aether-lane` and the test command, and edits under `.aether/worktrees/`, as today |
| superpowers | Nothing when Claude Code's official marketplace is added, as it is after your first interactive session. Otherwise: `claude plugin marketplace add anthropics/claude-plugins-official` |

Sirve a: C4, C7.

**R18.** `skills/swarm/SKILL.md`, §1 Prepare, gains this bullet before "Lanes":

> - **Workflows.** The run is a dynamic workflow. When this session has no `Workflow` tool, workflows are off: tell the owner to turn on Dynamic workflows in `/config` and to start a new session, and offer superpowers' execution methods meanwhile.

Its "Lanes" bullet becomes:

> - **Lanes.** When the owner turned on the plugin's `lanes` option, on Linux, with `agy` installed, the run sends calls to it while its quota lasts (`plugins/aether/config/lanes.json`). agy runs with `--dangerously-skip-permissions` in the unit's worktree. Otherwise every call is native, and `aether-plan compile` says why on stderr. `aether-plan compile <plan.md> --no-lanes` runs everything native.

Sirve a: C4.

## 9. Updates, rollback and releases

**R19.** The installer and the launcher are retired. Deleted:
- `scripts/aether-install.js` and `tests/aether-install.test.js`;
- `scripts/aether-mode.fish`.

`tests/launcher.test.js` is rewritten to pin the new facts (§14). Sirve a: C1.

**R20.** The guide describes updates and rollback with Claude Code's commands (F14, F15, F17):
- **Update:** `claude plugin update aether@aether-plugin`, then start a new session. Users may turn on auto-update for the `aether-plugin` marketplace in `/plugin` → Marketplaces.
- **Pin and roll back:** in `~/.claude/settings.json`, set `extraKnownMarketplaces["aether-plugin"].source.ref` to a release tag such as `aether--v0.7.0`. Then start any session, which fetches that tag, and run `claude plugin update aether@aether-plugin`. Setting the `ref` back to the newer tag, or removing it, moves forward again.
- **Never remove the marketplace to switch versions:** removing it uninstalls the plugin and deletes its data.

Sirve a: C1, C7.

**R21.** The README's release steps become:
1. bump `"version"` in `plugin.json`, the version that `tests/launcher.test.js` pins, and the README's status line;
2. `npm run check`;
3. merge to `main`;
4. `claude plugin tag plugins/aether`, which creates `aether--v<version>` locally;
5. push `main` and the tag, which is the owner's decision;
6. users update with `claude plugin update aether@aether-plugin`.

Sirve a: C1.

## 10. The owner's switch from 0.6.0

This is the answer to round 1, point 5, written into the README as "Upgrading from 0.6". The owner runs it after this work merges; this work runs none of it (C6).

- **Installing from the checkout's path works, but is not a release.** `claude plugin marketplace add <checkout>` loads the plugin in place from the working tree (F13). Every edit or branch switch in the checkout would change the running Aether at the next session, which undoes the 0.6.0 separation, and a path cannot be pinned to a tag.
- **A pinned copy without any push works** (F14). After the merge and a local tag (`claude plugin tag plugins/aether`), add to `~/.claude/settings.json`:

  ```json
  "extraKnownMarketplaces": {
    "aether-plugin": {
      "source": { "source": "git", "url": "file:///home/darkarty/Desktop/03_PROYECTOS/01_ACTIVOS/aether-plugin", "ref": "aether--v0.7.0" }
    }
  }
  ```

  Then start any `claude` session, which clones it, and run `claude plugin install aether@aether-plugin --config lanes=true`. Releases then move by changing `ref` (R20). After a push, the source may become `{ "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v<version>" }`.
- **Meanwhile 0.6.0 keeps working.** `aether-mode` loads the installed 0.6.0 copy with `--plugin-dir`, which replaces the marketplace copy for that session (F16). The repository's changes never touch `~/.local/share/aether-plugin/installed/`.
- **The old data stays where it is.** `runs.jsonl`, `usage/` and the lane log stay in `~/.local/share/aether-plugin/`. The owner may move them into `~/.claude/plugins/data/aether-aether-plugin/` to keep one history.
- **Deleting the old copy is the owner's call.** Removing the fish function and `installed/` is deletion, and waits for the owner.
- **The advisor:** the launcher turned it off for Aether sessions. Now the owner runs `/advisor off` if an advisor is configured (R17).

**R22.** The README's "Upgrading from 0.6" section gives these steps and facts. Sirve a: C1, C6.

## 11. Changes, file by file

These are the only files this work changes (C5):

| File | Change |
|---|---|
| `.claude-plugin/marketplace.json` | New (R1) |
| `plugins/aether/.claude-plugin/plugin.json` | Version, dependency, `userConfig` (R2) |
| `plugins/aether/agents/lead.md` | New (R4) |
| `plugins/aether/hooks/hooks.json` | SessionStart matcher (R6) |
| `plugins/aether/bin/aether-session-start` | The gate, the marker, the lanes line (R7) |
| `plugins/aether/bin/aether-guard` | The marker check (R8) |
| `plugins/aether/hooks/register.js`, `plugins/aether/hooks/usage.test.ts` | The gate, the offer rule, the data directory rule (R9, R12) |
| `plugins/aether/lib/run.js` | `dataDir` (R11) |
| `plugins/aether/lib/session.js` | New: the marker (§12) |
| `plugins/aether/lib/lanes.js`, `plugins/aether/bin/aether-plan`, `plugins/aether/lib/lane-design.js` | The lanes switch (R13–R15) |
| `plugins/aether/lib/report.js` | One note's text (R23) |
| `plugins/aether/skills/swarm/SKILL.md` | Two bullets (R18) |
| `scripts/aether-install.js`, `scripts/aether-mode.fish`, `tests/aether-install.test.js` | Deleted (R19) |
| `tests/launcher.test.js`, `tests/session-start.test.js`, `tests/session-start-autonomy.test.js`, `tests/guard.test.js`, `tests/run.test.js`, `tests/lanes.test.js`, `tests/aether-plan.test.js`, `tests/lane-design.test.js`, `tests/session.test.js` (new), `tests/helpers.js` | Tests (§14) |
| `package.json` | `validate` (R3) |
| `README.md` | The guide (R24) |
| `docs/claude-code-research.md`, `docs/decisions.md` | The facts of §2 and the decisions (R25) |

**R23.** `lib/report.js`'s note becomes: `no usage recorded during the run: was the session started with claude --agent aether:lead?`. Sirve a: C4.

**R24. The install guide.** The README's "Use Aether mode", "Development" and "Release" sections are rewritten. They keep the rest of the README, and its "How it works", "Lanes" and "Autonomy" sections, unchanged, except where those sections name `aether-mode`. The guide has these parts:
1. **Requirements:**
   - Claude Code 2.1.294 or later;
   - Node.js 22;
   - git 2.36 or later;
   - superpowers, installed with Aether from Claude Code's official marketplace.
2. **Install:**
   - `claude plugin install aether --marketplace DarkArty07/aether-plugin`, and `--config lanes=true` to turn the lanes on;
   - in a session: `/plugin install aether --marketplace DarkArty07/aether-plugin`.
3. **Start:** the two forms of R5, and the sentence: "Plain `claude` stays normal mode: the plugin is dormant there."
4. **What Aether adds to a normal session:** the footprint that A3 measured (R10).
5. **Options:** the `lanes` option, what it does and risks, as in its description in R2, and how to change it later: `claude plugin configure aether@aether-plugin`, or `/plugin` → Installed → aether → Configure options.
6. **What you set yourself:** the table of R17.
7. **Platforms:** the table of R16.
8. **Update, pin, roll back and uninstall:**
   - R20;
   - `claude plugin uninstall aether@aether-plugin` deletes the data directory, and `--keep-data` keeps it.
9. **Data:**
   - `~/.claude/plugins/data/aether-aether-plugin/` holds `usage/`, `runs.jsonl`, the lane log and `sessions/`;
   - `AETHER_DATA_DIR` overrides it;
   - the autonomy registry stays in the repository, under `.aether/autonomy/`.
10. **Upgrading from 0.6:** R22.
11. **Development:**
    - `claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh` loads a development tree for one session, in place of the installed copy (F16), with its data in `aether-inline`;
    - the lanes option of that copy is set apart, under `pluginConfigs["aether@inline"]`;
    - the bins of a branch run by path, as today;
    - `scripts/refresh-lanes.js` reads `ARTIFICIAL_ANALYSIS_API_KEY`, or its own `.env`, unchanged.
12. **Release:** R21.

No line of the guide names `aether-mode`, `scripts/aether-install.js` or `~/.local/share/aether-plugin` outside "Upgrading from 0.6". Sirve a: C1, C2, C3, C4, C7.

**R25. The project's records.**
- **`docs/claude-code-research.md`** gains a section "## Installable plugin findings (2026-10-09)". It records F1–F23 and the probe technique of §2, with its rule: check that a port is free before binding it, and never use a fixed port.
- **`docs/decisions.md`:**
  - A8 gets the update: "Since 0.7.0 (A27), the plugin is installed from the `aether-plugin` marketplace, and Aether mode is the session agent `aether:lead`; `--plugin-dir` is for development only."
  - A16 gets the update: "Since 0.7.0, the Lead is the agent `aether:lead` (`model: sonnet`), started with `--effort xhigh`. No plugin can turn the advisor off: the user runs `/advisor off` if one is configured."
  - New rows:
    - **A27:** Aether mode is the session agent `aether:lead`; in any other session the plugin is dormant, and a marker per session gates its hooks and meter.
    - **A28:** lanes are a plugin option, off by default, and Linux only.
    - **A29:** data lives in the plugin's own data directory, resolved by one rule in `dataDir()`.

Sirve a: C7.

## 12. Interfaces

```js
// plugins/aether/lib/run.js
// The data directory (R11). root defaults to the plugin directory (path.join(__dirname, '..')).
function dataDir(env = process.env, root = PLUGIN_ROOT) // → string, absolute

// plugins/aether/lib/session.js (new)
const LEAD_AGENT = 'aether:lead'
// <dataDir>/sessions/<sessionId>.json. Throws an Error for an id that is not [A-Za-z0-9-]+.
function markerFile(dataDir, sessionId) // → string
// Writes { "session": sessionId, "startedAt": now } to the marker file, creating the directory.
function markSession(dataDir, sessionId, now = Date.now()) // → void; throws on a bad id or a failed write
// True when the marker file exists; false for a missing, empty or invalid id.
function isAetherSession(dataDir, sessionId) // → boolean
// Deletes markers whose modification time is older than days. Returns the deleted session ids.
function pruneSessions(dataDir, { days = 30, now = Date.now() } = {}) // → string[]
module.exports = { LEAD_AGENT, markerFile, markSession, isAetherSession, pruneSessions }

// plugins/aether/lib/lanes.js (added export)
function lanesEnabled(env = process.env, platform = process.platform)
// → { on: boolean, reason: null | 'option' | 'platform' } (R13)
```

- **The environment line** (R7): exactly `export AETHER_LANES=on\n` or `export AETHER_LANES=off\n`, appended to the file `CLAUDE_ENV_FILE` names.
- **The marker** (R7–R9): `<dataDir>/sessions/<session_id>.json`, written only by `aether-session-start`. The mod reads it with `$.fs.exists`.

## 13. Error handling

- **The session-start hook** never fails the session.
  - Unreadable stdin means a normal session, and it prints nothing.
  - In an Aether session, a failed marker write or a missing `CLAUDE_ENV_FILE` is said in the context (R7), and the rest goes on.
  - Pruning and sweeping stay best-effort, as today.
- **The guard fails open,** as today. Unreadable input, or no marker, allows the call.
- **The meter only observes.** Any failure leaves the event unchanged (`.catch`), and a session whose marker check fails counts as not Aether: it records nothing.
- **A missing superpowers** is Claude Code's own error (F12), which names the command that fixes it.
- **Lanes off** is not an error. Compile says why on stderr (R14), and the Designer's lane answers exit 3 (R15).

## 14. Testing and acceptance

**Unit tests** (`npm test`; the existing tests keep passing with the changes these bullets name):
- `tests/session.test.js` (new):
  - marker path, write and read;
  - an invalid id refused;
  - pruning by age.
- `tests/session-start.test.js` and `tests/session-start-autonomy.test.js` pass the hook's JSON on stdin. Added cases:
  - no `agent_type`, or another agent: no output, no file in the data directory, no environment line, no sweep;
  - `aether:lead` on `startup`: marker, `export AETHER_LANES=off`, context;
  - with `CLAUDE_PLUGIN_OPTION_LANES=true`: `export AETHER_LANES=on`;
  - `resume`: marker and line, no output;
  - no `CLAUDE_ENV_FILE`: the context's sentence;
  - unreadable stdin: no output.
- `tests/guard.test.js`, through the bin:
  - a spec write in an unmarked session is allowed;
  - the same write in a marked session is denied as today, for `general-purpose`, `workflow-subagent` and `aether:implementer`;
  - it is allowed for `aether:designer`.
- `tests/run.test.js`: `dataDir` for each rule of R11:
  - the override;
  - a cache-shaped root under `CLAUDE_CONFIG_DIR`, giving `.../data/aether-aether-plugin`;
  - a cache-shaped root under `CLAUDE_CODE_PLUGIN_CACHE_DIR`;
  - a root elsewhere, giving `aether-inline`;
  - a root under a directory merely named `cache`, which is not the plugins root and gives `aether-inline`.
- `tests/lanes.test.js`: `lanesEnabled` in its three outcomes.
- `tests/aether-plan.test.js`: compile without `AETHER_LANES=on` has `lanes: null` and the stderr line; with it, on Linux, it has today's lanes.
- `tests/lane-design.test.js`: `design start` exits 3 with `off`, and with `platform`.
- `tests/launcher.test.js`, rewritten:
  - the README shows `claude --agent aether:lead --effort xhigh`, the install command and the "Upgrading from 0.6" steps;
  - `plugin.json` is 0.7.0, with the dependency and the `lanes` option;
  - `marketplace.json` has the R1 content;
  - `agents/lead.md` has an empty body and `model: sonnet`;
  - no file under `plugins/aether/` contains `.local/share`, `aether-mode` or `fish`;
  - the decisions and research checks stay.

**Mod tests** (`npm run test:mod`), in `hooks/usage.test.ts`:
- no record or write before the session is known to be Aether;
- recording after `classic.SessionStart` with `aether:lead`;
- recording after a marker is found;
- the offer rule in both kinds of session;
- the data directory rule for a cache root, an inline root and `AETHER_DATA_DIR`;
- lane payloads saved only in an Aether session.

**Validation:** `npm run validate`, with both manifests.

**Acceptance (the Lead, with the probe technique of §2).** A throwaway clone of the branch goes in a scratch directory, with a throwaway tag in that clone only. The checks use a scratch `CLAUDE_CONFIG_DIR` and a local fake model on a free random port, checked free before binding and never a fixed port. No request reaches Anthropic.

| | Check | Criterion |
|---|---|---|
| A1 | Two installs succeed, and `claude plugin list` shows `aether@aether-plugin` enabled with superpowers:<br>- `claude plugin marketplace add <clone>` then `claude plugin install aether@aether-plugin`;<br>- the pinned form of §10, with `file://` and the throwaway tag, then `claude plugin install aether@aether-plugin --config lanes=true`.<br>Without the official marketplace, the dependency error of F12 appears. | C1, C4 |
| A2 | `claude --agent aether:lead --effort xhigh`, run from bash and from fish, sends its first request with:<br>- model Sonnet and effort `xhigh`;<br>- the plain system prompt and all 20 tools;<br>- `Aether mode is active` in the context.<br>The marker exists, and the main session, a subagent and a workflow agent see `AETHER_LANES` in Bash. | C2, C3 |
| A3 | A plain `claude` session with Aether installed sends a first request with:<br>- no `Aether mode is active`;<br>- no `aether:` agent lines;<br>- no change to the data directory.<br>The guard allows a spec write. The footprint is measured (R10). | C3 |
| A4 | In an Aether session that writes a spec through a `general-purpose` subagent, the guard denies the write. Usage parts are written under `<scratch config>/plugins/data/aether-aether-plugin/usage/`, and `aether-report` reads them from there. A `/clear` in that session gives a SessionStart with `agent_type: "aether:lead"` and a new marker. | C3, C4 |
| A5 | Changing the pinned `ref` and running `claude plugin update` moves between two throwaway tags and back, and the data directory survives. | C1, C7 |
| A6 | `git tag`, `git ls-remote` and the checksums of `~/.local/share/aether-plugin/installed/` are as before. `fish -c 'functions aether-mode'` still points into the installed copy. | C6 |

## 15. Out of scope

- Making the repository public, pushing, tagging or publishing a release, which are the owner's decisions.
- Verifying macOS or Windows on those systems.
- Moving the owner's 0.6.0 data, or deleting the old installed copy.
- Any change to the agents' prompts, the workflow, `aether-plan`'s plan rules, autonomy or the lanes' mechanism beyond the switch.

## 16. Proposals (not built)

- **The bootstrap does not fit in the session context.** Claude Code 2.1.296 saved the 19.8 KB SessionStart context to a file and injected a 2 KB preview (F21), so the Lead reads its rules only if it opens that file. This predates this work and also happens in 0.6.0. A shorter bootstrap, or one split into a short injected part and skills, would fix it. An agent's `skills` frontmatter does not help (F22).
- **Warn when an advisor is configured.** The session-start hook could read `advisorModel` from the settings files and add one line to the context.
- **Hide `aether:run` and `aether:swarm` from normal sessions,** if a mod can (`command.describe` with `isHidden`), after measuring that it removes them from the model's listing.
- **A macOS run of the suite,** for example a CI job on a macOS runner once the repository is published.
- **A script that moves the 0.6.0 history** into the new data directory.

## 17. Assumptions

- **Plugin and marketplace names.** The plugin keeps its name `aether`, and the marketplace is `aether-plugin`, the repository's name. Both are in the plugin id `aether@aether-plugin` and in the data directory's name.
- **Effort when the user changes it.** The Lead's effort comes from the start command, and a user who changes `/effort` mid-session keeps their choice.
- **The listing lines that remain** (`aether:run`, `aether:swarm`) in a normal session are acceptable as dormant footprint, once measured and written (C3).
- **The marker files** are small, one per Aether session, and pruned after 30 days with the usage files.
