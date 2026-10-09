# Aether, a Claude Code plugin anyone can install: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Aether mode.** Every task suits the swarm. The waves are:
> 1. Tasks 1–7, the independent code and the probe kit;
> 2. Tasks 8–9, the session-start hook and the guard, which use Tasks 1 and 2;
> 3. Task 10, the README, the records, version 0.7.0 and the retired installer, which pin what the code produces;
> 4. Tasks 11–16, acceptance A1–A6 of the spec.
>
> This is a contract plan (A10): each code task gives the interfaces, the failing tests in full and the acceptance, and the implementer writes the code. Where the text is the requirement (messages, README sections, the agent file), the task gives it in full. **No task runs an irreversible step.** Merging to `main`, tagging the release, the owner's switch (spec §10) and any push wait for the owner, in the Lead's brief.

**Goal:** Aether installs with Claude Code's own plugin commands and starts with `claude --agent aether:lead --effort xhigh`. In every other session the plugin is dormant. Its data lives in the plugin's data directory, lanes are an option that is off by default, and the installer and fish launcher are retired.

**Architecture:**
- **Distribution:** a marketplace file at the repository root lists `plugins/aether`. The manifest declares superpowers and the `lanes` option.
- **Start:** a new agent file `agents/lead.md` (Sonnet, empty body) is the Lead.
- **The session gate:**
  - the session-start hook marks the session (`<data>/sessions/<id>.json`) only when `agent_type` is `aether:lead`;
  - the guard and the usage meter act only in marked sessions, and the meter withholds `aether:*` agents elsewhere.
- **Data:** one rule, `dataDir()`, finds the data directory from the plugin root.
- **Lanes:** they run only when the hook has passed `AETHER_LANES=on` to the session's commands, and only on Linux.

**Tech Stack:** Node.js 22, CommonJS and `node:test`, with no dependencies; the mod is an ES module tested with `claude plugin test`; git; Claude Code 2.1.294 or later (measured on 2.1.296).

**Spec:** `docs/superpowers/specs/2026-10-09-installable-plugin-design.md`

## Global Constraints

- **Code:**
  - Node.js 22, no dependencies. Bins and libraries are CommonJS, starting with `'use strict'`.
  - `plugins/aether/hooks/register.js` is an ES module that reaches Claude Code only through `$`.
- **Names:**
  - plugin `aether`, marketplace `aether-plugin`, plugin id `aether@aether-plugin`, Lead agent `aether:lead`;
  - version `0.7.0`, which only Task 10 sets.
- **Data directory** (spec R11):
  - `AETHER_DATA_DIR` when set and not empty;
  - otherwise the plugins root is `CLAUDE_CODE_PLUGIN_CACHE_DIR`, or `<CLAUDE_CONFIG_DIR or ~/.claude>/plugins`;
  - a plugin root at `<plugins root>/cache/<marketplace>/<plugin>/<version>` uses `<plugins root>/data/<id(plugin@marketplace)>`;
  - any other plugin root uses `<plugins root>/data/<id(aether@inline)>`;
  - `id()` replaces each character other than a letter, digit, `_` or `-` with `-`.
- **The session marker:** `<data dir>/sessions/<session_id>.json`, for ids matching `^[A-Za-z0-9-]+$`, written only by `aether-session-start`.
- **The environment line:** exactly `export AETHER_LANES=on\n` or `export AETHER_LANES=off\n`. It is `on` only when `CLAUDE_PLUGIN_OPTION_LANES` is exactly `true`.
- **Lanes are on only when** `AETHER_LANES === 'on'` and `process.platform === 'linux'`.
- **Exact messages:**
  - `Aether could not pass the lanes option to this session's commands, so lanes are off.`
  - `Aether could not mark this session (<reason>): the spec and plan guard and the usage meter are off in it.`
  - `aether-plan: lanes are off: the aether plugin's lanes option is not on`
  - `aether-plan: lanes are off: lanes need Linux`
  - `no usage recorded during the run: was the session started with claude --agent aether:lead?`
- **Test isolation:** a test that spawns a bin sets or removes `AETHER_DATA_DIR`, `AETHER_LANES`, `CLAUDE_ENV_FILE` and `CLAUDE_PLUGIN_OPTION_LANES` itself; it never inherits them from the session that runs it. Tests use no network and never touch `~/.claude` or `~/.local/share/aether-plugin`.
- **No irreversible step:**
  - no task pushes, merges to `main`, creates a tag in this repository, publishes, or changes anything under `~/.claude/`, `~/.local/share/aether-plugin/` or `~/.config/fish/`;
  - acceptance tasks work only in their own scratch directory, with `CLAUDE_CONFIG_DIR` inside it, a throwaway clone, and throwaway tags in that clone.
- **No model request leaves the machine:** acceptance sessions set `ANTHROPIC_BASE_URL` to the fake model of Task 7 on `127.0.0.1`. It binds port 0, so the system picks a free port; no fixed port is ever used.
- **Specs and plans:** no task owns a file under `docs/superpowers/`.
- **Language:** code and documents in English.
- **Final check, by the Lead after the swarm:** `npm run check`.

## Review Focus

1. **Bins and tests run inside an Aether session** inherit `AETHER_LANES`, `CLAUDE_ENV_FILE` or `CLAUDE_PLUGIN_OPTION_LANES`. Every spawning test sets them itself. Pinned in Tasks 3, 8 and 9.
2. **A session id with path characters** (`../x`, `a/b`, empty, not a string) must never become a path. The marker refuses it, the guard allows the call, and no file appears outside the data directory. Pinned in Tasks 2, 8 and 9.
3. **`CLAUDE_CONFIG_DIR` with a trailing slash, or reached through a symbolic link,** must still find the plugin's cache root. Pinned in Task 1, and the trailing slash in Task 4.
4. **Empty, unreadable or non-object JSON on a hook's stdin** gets nothing and exit 0. Pinned in Tasks 8 and 9.
5. **The meter loaded mid-session**, with no `classic.SessionStart`, still records in an Aether session through the marker. It records nothing when the marker check fails. Pinned in Task 4.

## Aether Execution
- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Acceptance kit (read by Tasks 11–15)

Tasks 11–15 each run spec acceptance checks in a scratch directory of their own. Their briefs point here. Read this section in `docs/superpowers/plans/2026-10-09-installable-plugin.md`, which is committed in your worktree.

**K0. Rules.**
- **Paths:** shell variables do not survive between Bash calls. Print the scratch path `<S>` once, and write it literally after that.
- **Running `claude`:** only through the wrappers of K4, never bare.
- **What stays untouched:** never push, merge or tag in this repository, and never write under `~/.claude`, `~/.local/share/aether-plugin` or `~/.config/fish`.
- **Before anything else,** record `stat -c '%n %Y' ~/.claude/settings.json ~/.claude/plugins/installed_plugins.json`. Record it again at the end; the two must match.
- **When a check fails:** record it with its evidence, end the evidence file with `Result: FAIL — <check>`, commit that file, and report the task as blocked, naming the check. Never change another file to make a check pass.

**K1. The scratch directory:** `S=$(mktemp -d -t aether-accept-<task letter and number>-XXXXXX); echo $S`, for example `aether-accept-a1-XXXXXX`.

**K2. A throwaway clone, with a throwaway tag in the clone only:**

```bash
git clone --quiet "$(git rev-parse --show-toplevel)" <S>/clone && git -C <S>/clone tag aether--v0.7.0
```

**K3. The fake model** of Task 7. When the task gives a script, write it to `<S>/script.json` first, and add `--script <S>/script.json`:

```bash
mkdir -p <S>/fake && (nohup node "$(git rev-parse --show-toplevel)/tests/fixtures/fake-model.js" --out <S>/fake > <S>/fake/stdout 2>&1 & echo $! > <S>/fake/pid)
```

Wait until `<S>/fake/port` exists. Check with `ss -ltnp | grep ":$(cat <S>/fake/port) "` that the listener is that `node` process. It bound port 0, so the system chose a free port.

**K4. The wrappers.** `<S>/c` is the only way to run `claude` against `<S>/cfg` (`chmod +x` it):

```sh
#!/bin/sh
# Every claude call of this task: the scratch configuration and the fake model, nothing else.
unset ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_MODEL CLAUDE_CODE_EFFORT_LEVEL AETHER_DATA_DIR AETHER_LANES CLAUDE_CODE_PLUGIN_CACHE_DIR CLAUDE_ENV_FILE CLAUDE_PLUGIN_OPTION_LANES
export CLAUDE_CONFIG_DIR="<S>/cfg"
export ANTHROPIC_API_KEY="sk-ant-fake-acceptance"
export ANTHROPIC_BASE_URL="http://127.0.0.1:$(cat <S>/fake/port)"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
exec claude "$@"
```

`<S>/c-net` is the same without the `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` line. Use it only where a step names it: adding the official marketplace, and a session that must clone a declared marketplace. A task with a second configuration makes `<S>/c2` and `<S>/c2-net` the same way, with `<S>/cfg2`.

**K5. The pinned install** into a configuration `<cfg>` (with its wrappers `<c>` and `<c-net>`):
1. Write `<cfg>/settings.json`:

   ```json
   { "enableWorkflows": true, "extraKnownMarketplaces": { "aether-plugin": { "source": { "source": "git", "url": "file://<S>/clone", "ref": "aether--v0.7.0" } } } }
   ```

2. Run `<c-net> plugin marketplace add anthropics/claude-plugins-official`.
3. Run one session, from `<S>`: `<c> -p hi`. Whether it ends with the fake model's error or with its text reply does not matter.
4. Wait up to 30 seconds for `<cfg>/plugins/known_marketplaces.json` to list `aether-plugin`. If it does not, run that session once more with `<c-net>`, and record that it needed that.
5. Run `<c> plugin install aether@aether-plugin`, adding `--config lanes=true` only where the task says.
6. Expect:
   - `<c> plugin list` shows `aether@aether-plugin`, version 0.7.0, enabled, and `superpowers@claude-plugins-official`, enabled;
   - `<cfg>/plugins/installed_plugins.json` gives the plugin an `installPath` of `<cfg>/plugins/cache/aether-plugin/aether/0.7.0`.

**K6. Stop the fake model** at the end: `kill $(cat <S>/fake/pid)`.

**K7. The evidence file**, `docs/evaluations/2026-10-09-installable/<file>.md`:
- a title;
- the date, `claude --version`, `git -C <S>/clone rev-parse --short HEAD`, the scratch path, and both K0 `stat` records;
- one section per check, with the commands and the relevant output lines, each check ending `PASS`, `FAIL` or, where the task allows it, `SKIPPED`;
- a last line, `Result: PASS` or `Result: FAIL — <check>`.

## Tasks

### Task 1: `dataDir()`, the data directory rule

**Aether:**
- Tier: haiku high — one pure function in one file, pinned by exact tests
- Area: data
- Owns: `plugins/aether/lib/run.js`, `tests/run.test.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/lib/run.js` (`dataDir`)
- Test: `tests/run.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `dataDir(env = process.env, root = path.join(__dirname, '..')) → string` in `plugins/aether/lib/run.js`, still exported under the same name.
  - Every existing caller (`run.dataDir()`) keeps working with no argument.
  - The rule is the one in Global Constraints.
  - The prefix test compares `fs.realpathSync` of the plugin root with `fs.realpathSync` of the plugins root, each falling back to the path as given when it does not exist.
  - The result is built from the plugins root as given, not its real path.
  - The part after `<plugins root>/cache/` must be exactly three path segments.
  - The inline name is the constant `'aether'`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/run.test.js`:

```js
// ---- dataDir (installable spec R11) ----
const os = require('node:os')
const { dataDir } = require('../plugins/aether/lib/run.js')

// A plugin root laid out as Claude Code's plugin cache lays it out, under a plugins root.
function cacheRoot(plugins, marketplace = 'aether-plugin', plugin = 'aether', version = '0.7.0') {
  const root = path.join(plugins, 'cache', marketplace, plugin, version)
  fs.mkdirSync(root, { recursive: true })
  return root
}

test('dataDir: AETHER_DATA_DIR wins over everything', (t) => {
  const cfg = tempDir(t)
  const root = cacheRoot(path.join(cfg, 'plugins'))
  assert.equal(dataDir({ AETHER_DATA_DIR: '/somewhere/data', CLAUDE_CONFIG_DIR: cfg }, root), '/somewhere/data')
})

test('dataDir: an installed copy uses the data directory Claude Code gives the plugin', (t) => {
  const cfg = tempDir(t)
  const root = cacheRoot(path.join(cfg, 'plugins'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg }, root), path.join(cfg, 'plugins', 'data', 'aether-aether-plugin'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg + '/' }, root), path.join(cfg, 'plugins', 'data', 'aether-aether-plugin'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg, AETHER_DATA_DIR: '' }, root), path.join(cfg, 'plugins', 'data', 'aether-aether-plugin'))
})

test('dataDir: CLAUDE_CODE_PLUGIN_CACHE_DIR moves the plugins root, and the id replaces other characters with -', (t) => {
  const base = tempDir(t)
  const plugins = path.join(base, 'plugin cache')
  const root = cacheRoot(plugins, 'my.market', 'aether', '1.0.0')
  const env = { CLAUDE_CODE_PLUGIN_CACHE_DIR: plugins, CLAUDE_CONFIG_DIR: path.join(base, 'cfg') }
  assert.equal(dataDir(env, root), path.join(plugins, 'data', 'aether-my-market'))
})

test('dataDir: a copy loaded in place uses aether-inline, even under a directory merely named cache', (t) => {
  const base = tempDir(t)
  const cfg = path.join(base, 'cfg')
  const inline = path.join(base, 'repo', 'plugins', 'aether')
  fs.mkdirSync(inline, { recursive: true })
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg }, inline), path.join(cfg, 'plugins', 'data', 'aether-inline'))
  const lookalike = cacheRoot(path.join(base, 'work'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg }, lookalike), path.join(cfg, 'plugins', 'data', 'aether-inline'))
  const tooDeep = path.join(cfg, 'plugins', 'cache', 'aether-plugin', 'aether', '0.7.0', 'bin')
  fs.mkdirSync(tooDeep, { recursive: true })
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg }, tooDeep), path.join(cfg, 'plugins', 'data', 'aether-inline'))
})

test('dataDir: a config directory reached through a symbolic link still finds the cache root', (t) => {
  const base = tempDir(t)
  const cfg = path.join(base, 'real-config')
  const root = cacheRoot(path.join(cfg, 'plugins'))
  const link = path.join(base, 'link-config')
  fs.symlinkSync(cfg, link)
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: link }, root), path.join(link, 'plugins', 'data', 'aether-aether-plugin'))
})

test('dataDir: without CLAUDE_CONFIG_DIR the plugins root is ~/.claude/plugins, and the default root is this plugin', () => {
  assert.equal(dataDir({}, '/nowhere/plugins/aether'), path.join(os.homedir(), '.claude', 'plugins', 'data', 'aether-inline'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: '/cfg' }), path.join('/cfg', 'plugins', 'data', 'aether-inline'))
})
```

- [ ] **Step 2: Run them and see them fail.** `node --test tests/run.test.js`. Expected: the new tests fail, because `dataDir` takes no arguments and returns `~/.local/share/aether-plugin`.
- [ ] **Step 3: Implement `dataDir`** in `plugins/aether/lib/run.js` as the Interfaces block says. Remove the `.local/share` path: no file under `plugins/aether/` may contain it after this task.
- [ ] **Step 4: Check the callers.** `grep -rn "dataDir()" plugins tests` shows only callers that need no argument. `npm test` passes; a test that relied on the old default without `AETHER_DATA_DIR` must now set it (`useDataDir(t)`).
- [ ] **Step 5: Commit.** `git add plugins/aether/lib/run.js tests/run.test.js && git commit -m "feat(aether): dataDir finds the plugin's own data directory from the plugin root"`

**Acceptance:** the six new tests and the whole `npm test` pass; `grep -rn ".local/share" plugins/aether/lib/run.js` prints nothing.

### Task 2: `lib/session.js`, the Aether-session marker

**Aether:**
- Tier: haiku high — a small new module of four functions, pinned by exact tests
- Review: xhigh — path handling of untrusted session ids, beyond the listed cases
- Area: session
- Owns: `plugins/aether/lib/session.js`, `tests/session.test.js`
- Depends on: none

**Files:**
- Create: `plugins/aether/lib/session.js`
- Test: `tests/session.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, in `plugins/aether/lib/session.js`:

```js
const LEAD_AGENT = 'aether:lead'
// <dataDir>/sessions/<sessionId>.json. Throws Error('invalid session id: <id>') unless sessionId is a string matching /^[A-Za-z0-9-]+$/.
function markerFile(dataDir, sessionId) // → string
// Writes {"session": sessionId, "startedAt": now} to the marker file, creating its directory. Throws on a bad id (before writing anything) or a failed write.
function markSession(dataDir, sessionId, now = Date.now()) // → void
// True when the marker file exists. False for an invalid or missing id; never throws.
function isAetherSession(dataDir, sessionId) // → boolean
// Deletes <dataDir>/sessions/*.json whose modification time is more than `days` days before `now`. Returns the deleted ids; [] when the directory does not exist. Other files stay.
function pruneSessions(dataDir, { days = 30, now = Date.now() } = {}) // → string[]
module.exports = { LEAD_AGENT, markerFile, markSession, isAetherSession, pruneSessions }
```

- [ ] **Step 1: Write the failing tests.** Create `tests/session.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { LEAD_AGENT, markerFile, markSession, isAetherSession, pruneSessions } = require('../plugins/aether/lib/session.js')

test('the Lead agent is aether:lead', () => {
  assert.equal(LEAD_AGENT, 'aether:lead')
})

test('markerFile is <data>/sessions/<id>.json, and refuses an id that could leave that directory', (t) => {
  const data = tempDir(t)
  const id = '6dd2c6ca-aa04-4bf0-8c52-d2ccb5494905'
  assert.equal(markerFile(data, id), path.join(data, 'sessions', `${id}.json`))
  for (const bad of ['', '../x', 'a/b', 'a\\b', '.', 'x.json', ' s1', null, undefined, 42]) {
    assert.throws(() => markerFile(data, bad), /invalid session id/, String(bad))
  }
})

test('markSession writes the marker, creating its directory, and isAetherSession finds it', (t) => {
  const data = path.join(tempDir(t), 'not yet')
  assert.equal(isAetherSession(data, 's1'), false)
  markSession(data, 's1', 1234)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'sessions', 's1.json'), 'utf8')), { session: 's1', startedAt: 1234 })
  assert.equal(isAetherSession(data, 's1'), true)
  assert.equal(isAetherSession(data, 's2'), false)
})

test('isAetherSession is false for an invalid or missing id, and never throws', (t) => {
  const data = tempDir(t)
  markSession(data, 's1')
  for (const bad of ['', '../sessions/s1', 'a/b', null, undefined, {}]) assert.equal(isAetherSession(data, bad), false, String(bad))
})

test('markSession refuses an invalid id and writes nothing', (t) => {
  const data = tempDir(t)
  assert.throws(() => markSession(data, '../x'), /invalid session id/)
  assert.deepEqual(fs.readdirSync(data), [])
})

test('pruneSessions deletes markers not written to for the given days, and only markers', (t) => {
  const data = tempDir(t)
  markSession(data, 'old')
  markSession(data, 'new')
  fs.writeFileSync(path.join(data, 'sessions', 'notes.txt'), 'keep')
  const now = Date.now()
  const old = new Date(now - 31 * 24 * 3600 * 1000)
  fs.utimesSync(path.join(data, 'sessions', 'old.json'), old, old)
  fs.utimesSync(path.join(data, 'sessions', 'notes.txt'), old, old)
  assert.deepEqual(pruneSessions(data, { days: 30, now }), ['old'])
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')).sort(), ['new.json', 'notes.txt'])
})

test('pruneSessions with no sessions directory deletes nothing', (t) => {
  assert.deepEqual(pruneSessions(path.join(tempDir(t), 'none')), [])
})
```

- [ ] **Step 2: Run them and see them fail.** `node --test tests/session.test.js`. Expected: `Cannot find module '../plugins/aether/lib/session.js'`.
- [ ] **Step 3: Implement `plugins/aether/lib/session.js`** as the Interfaces block says, with `node:fs` and `node:path` only.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git add plugins/aether/lib/session.js tests/session.test.js && git commit -m "feat(aether): a marker per Aether session"`

**Acceptance:** the seven tests pass, and `npm test` passes.

### Task 3: the lanes switch

**Aether:**
- Tier: sonnet high — wiring across a bin, two libraries and the shared test helpers, pinned by exact tests
- Area: lanes
- Owns: `plugins/aether/lib/lanes.js`, `plugins/aether/bin/aether-plan`, `plugins/aether/lib/lane-design.js`, `tests/lanes.test.js`, `tests/aether-plan.test.js`, `tests/lane-design.test.js`, `tests/helpers.js`, `tests/lane-fixtures.js`
- Depends on: none

**Files:**
- Modify:
  - `plugins/aether/lib/lanes.js`: add and export `lanesEnabled`;
  - `plugins/aether/bin/aether-plan`: the compile command;
  - `plugins/aether/lib/lane-design.js`: `start`;
  - `tests/helpers.js`: `run()`'s default environment;
  - `tests/lane-fixtures.js`: `laneEnv`.
- Test: `tests/lanes.test.js`, `tests/aether-plan.test.js`, `tests/lane-design.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `lanesEnabled(env = process.env, platform = process.platform) → { on: boolean, reason: null | 'option' | 'platform' }` in `lib/lanes.js`. It returns:
    - `{ on: true, reason: null }` when `env.AETHER_LANES === 'on'` and `platform === 'linux'`;
    - else `{ on: false, reason: 'platform' }` when `env.AETHER_LANES === 'on'`;
    - else `{ on: false, reason: 'option' }`.
  - **`aether-plan compile`:**
    - when `--no-lanes` is absent and `lanesEnabled()` is off, it behaves as with `--no-lanes`: `lanes: null`, and the lane table is not read;
    - it then writes exactly one line to stderr: for `option`, `aether-plan: lanes are off: the aether plugin's lanes option is not on\n`; for `platform`, `aether-plan: lanes are off: lanes need Linux\n`;
    - with `--no-lanes` nothing changes, and no such line is written.
  - **`aether-lane design start`:** right after its usage check, and before any other check, when `lanesEnabled()` is off it answers exit 3 with `{"unavailable":"off"}` for `option`, or `{"unavailable":"platform"}` for `platform`. Use the file's existing `unavailable()` helper.
  - **The test helpers:**
    - `tests/helpers.js` `run()` gets the default environment `{ ...process.env, AETHER_LANES_CONFIG: NO_LANES_CONFIG, AETHER_LANES: 'on', ...env }`;
    - `tests/lane-fixtures.js` `laneEnv()` adds `AETHER_LANES: 'on'` to the environment it returns;
    - so in existing tests the lane table and the harness still decide, as before.

- [ ] **Step 1: Write the failing tests.**

Append to `tests/lanes.test.js`:

```js
test('lanesEnabled: lanes are on only when AETHER_LANES is on, and only on Linux', () => {
  assert.deepEqual(lanes.lanesEnabled({ AETHER_LANES: 'on' }, 'linux'), { on: true, reason: null })
  assert.deepEqual(lanes.lanesEnabled({ AETHER_LANES: 'on' }, 'darwin'), { on: false, reason: 'platform' })
  assert.deepEqual(lanes.lanesEnabled({ AETHER_LANES: 'on' }, 'win32'), { on: false, reason: 'platform' })
  for (const value of [undefined, '', 'off', 'ON', 'true', '1']) {
    assert.deepEqual(lanes.lanesEnabled({ AETHER_LANES: value }, 'linux'), { on: false, reason: 'option' }, String(value))
  }
  assert.deepEqual(lanes.lanesEnabled({}, 'darwin'), { on: false, reason: 'option' })
})
```

Append to `tests/aether-plan.test.js` (it already defines `laneTable` and `executable`):

```js
test('compile runs native, and says why on stderr, when the lanes option is off', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = laneTable(t, executable)
  for (const value of ['off', '']) {
    const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_LANES: value })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.json.lanes, null)
    assert.ok(r.stderr.includes("aether-plan: lanes are off: the aether plugin's lanes option is not on\n"), r.stderr)
  }
  const quiet = runBin(PLAN_BIN, ['compile', md, '--no-lanes'], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_LANES: 'off' })
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr)
  assert.equal(quiet.json.lanes, null)
  assert.ok(!quiet.stderr.includes('lanes are off'), quiet.stderr)
})

test('with the lanes option off, a broken lane table is not even read', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, '{')
  const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_LANES: 'off' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.lanes, null)
})
```

Append to `tests/lane-design.test.js`:

```js
test('design start answers unavailable "off", before anything else, when the lanes option is off', (t) => {
  const { repo, env } = designSetup(t)
  env.AETHER_LANES = 'off'
  const r = design(repo, env, ['start', '--session', 'lead-1', '--cwd', repo.dir], 'FAKE-AGY: answer {}')
  assert.equal(r.status, 3, r.stdout + r.stderr)
  assert.deepEqual(lastJson(r.stdout), { unavailable: 'off' })
  assert.equal(fs.existsSync(env.AETHER_FAKE_AGY_LOG), false)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'design')), false)
})
```

- [ ] **Step 2: Run them and see them fail.** `node --test tests/lanes.test.js tests/aether-plan.test.js tests/lane-design.test.js`. Expected: `lanes.lanesEnabled is not a function`; compile still gives lanes; design start reaches agy.
- [ ] **Step 3: Implement** `lanesEnabled`, the compile change, the design-start check, and the two helper defaults, as the Interfaces block says.
- [ ] **Step 4: Run `npm test`.** Expected: all pass, including the existing lane, compile, workflow and design tests, now running with `AETHER_LANES: 'on'` from the helpers.
- [ ] **Step 5: Commit.** `git add plugins/aether/lib/lanes.js plugins/aether/bin/aether-plan plugins/aether/lib/lane-design.js tests/lanes.test.js tests/aether-plan.test.js tests/lane-design.test.js tests/helpers.js tests/lane-fixtures.js && git commit -m "feat(aether): lanes run only with the plugin's lanes option on, and only on Linux"`

**Acceptance:** the new tests and the whole `npm test` pass. With `AETHER_LANES` unset, `aether-plan compile` prints the option line on stderr and `"lanes":null`.

### Task 4: the usage meter's session gate

**Aether:**
- Tier: sonnet high — the mods API and per-session state, where event order matters beyond what the tests can show
- Review: xhigh — recording or withholding in the wrong kind of session breaks the opt-in (C3); data paths
- Area: meter
- Owns: `plugins/aether/hooks/register.js`, `plugins/aether/hooks/usage.test.ts`
- Depends on: none

**Files:**
- Modify: `plugins/aether/hooks/register.js`, `plugins/aether/hooks/usage.test.ts`

**Interfaces:**
- Consumes:
  - the marker path `<data dir>/sessions/<session id>.json` (Global Constraints); the mod reads it with `$.fs.exists`, and never writes it;
  - `$.plugin.root` and `$.plugin.name` are properties, not functions. Read them inside `try`, and treat a missing value as `undefined`.
- Produces, in `register.js`:
  - **`export function dataDirFrom({ env, root, name })`**, the Global Constraints rule as a pure string function. Strip trailing slashes from the roots, and compare paths as given. The plugins root is `env.CLAUDE_CODE_PLUGIN_CACHE_DIR` when set; otherwise it is the directory `plugins` under `env.CLAUDE_CONFIG_DIR`, or under `<env.HOME>/.claude` when `CLAUDE_CONFIG_DIR` is unset. The inline name is `name` when it is a non-empty string, else `'aether'`.
  - **`export function register(on)`.** The meter reads its data directory as `dataDirFrom({ env: { AETHER_DATA_DIR, CLAUDE_CODE_PLUGIN_CACHE_DIR, CLAUDE_CONFIG_DIR, HOME }, root: $.plugin.root, name: $.plugin.name })`, with each value from `$.env.get`.
  - **Which sessions are Aether:**
    - a `classic.SessionStart` whose `e.agent_type === 'aether:lead'` and whose `e.session_id` is a string marks that session Aether;
    - otherwise, the first `turn.step`, `agent.spawn` or `agent.offer` of a session (`await $.session.id()`) checks `$.fs.exists(<data dir>/sessions/<id>.json)` and keeps the answer for that id;
    - a failed or refused check counts as not Aether.
  - **`turn.step`** records, and flushes as today, only in an Aether session.
  - **`agent.spawn`** saves the lane payload and records the agent only in an Aether session; in any other session it just passes the event on.
  - **`agent.offer`:**
    - returns `{ isOffered: false }` when `e.agent === 'aether:lead'`, or when the session is not Aether and `e.agent` starts with `aether:`;
    - otherwise it passes the event on.
  - **`.catch`:** `classic.SessionStart`, `agent.offer` and `agent.spawn` each keep `.catch(($, e, next) => next(e))`.
  - **Text:** no `.local/share` string remains anywhere in `register.js` or `usage.test.ts`.

- [ ] **Step 1: Write the failing tests** in `plugins/aether/hooks/usage.test.ts`.

1. Replace every `/home/u/.local/share/aether-plugin` in the file with `/home/u/aether-data`.
2. Change the head of `stubs` to:

```ts
function stubs(on, { env = { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' } as Record<string, string>, existing = [] as string[], failWrites = false, marked = true as boolean | 'deny' } = {}) {
```

3. Add these stubs inside it, before `return writes`:

```ts
  on('fs.exists', ($, e) => (marked === 'deny' ? { deny: 'no access' } : { value: marked === true && e.path.endsWith('/sessions/s1.json') }))
  on('agent.offer', () => ({ isOffered: true }))
  on('classic.SessionStart', () => ({}))
```

4. Add the import at the top: `import { dataDirFrom } from './register.js'`.
5. Append these tests:

```ts
test('a session that is not Aether records nothing and saves no lane payload', async ($, on) => {
  const writes = stubs(on, { marked: false })
  await step($)
  await spawnOps($, opsPrompt(MARKER(`${LANE_DIR}/prompt.md`), 'payload'))
  await endTurn($)
  await $.session.end({ reason: 'other' })
  expect(writes).toEqual([])
})

test('SessionStart from aether:lead makes the session Aether before its marker is read', async ($, on) => {
  const writes = stubs(on, { marked: false })
  await $.classic.SessionStart({ hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' })
  await step($)
  await endTurn($)
  expect(Object.keys(files(writes))).toEqual(['/home/u/aether-data/usage/s1/0.json'])
})

test('SessionStart from another agent leaves the session to its marker', async ($, on) => {
  const writes = stubs(on, { marked: false })
  await $.classic.SessionStart({ hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'Explore' })
  await step($)
  await endTurn($)
  expect(writes).toEqual([])
})

test('a meter loaded mid-session finds the marker and records', async ($, on) => {
  const writes = stubs(on)
  await step($)
  await endTurn($)
  expect(Object.keys(files(writes))).toEqual(['/home/u/aether-data/usage/s1/0.json'])
})

test('a marker check that fails counts as not Aether', async ($, on) => {
  const writes = stubs(on, { marked: 'deny' })
  await step($)
  await endTurn($)
  expect(writes).toEqual([])
})

const offer = ($, agent: string) => $.agent.offer({ agent, description: 'd', source: 'plugin' })

test('outside Aether every aether agent is withheld, and other agents are offered', async ($, on) => {
  stubs(on, { marked: false })
  expect(await offer($, 'aether:designer')).toEqual({ isOffered: false })
  expect(await offer($, 'aether:implementer')).toEqual({ isOffered: false })
  expect(await offer($, 'aether:lead')).toEqual({ isOffered: false })
  expect(await offer($, 'general-purpose')).toEqual({ isOffered: true })
})

test('in Aether only the Lead is withheld', async ($, on) => {
  stubs(on)
  expect(await offer($, 'aether:lead')).toEqual({ isOffered: false })
  expect(await offer($, 'aether:designer')).toEqual({ isOffered: true })
  expect(await offer($, 'Explore')).toEqual({ isOffered: true })
})

test('dataDirFrom follows the installable spec R11', () => {
  const cached = '/h/.claude/plugins/cache/aether-plugin/aether/0.7.0'
  expect(dataDirFrom({ env: { AETHER_DATA_DIR: '/d', HOME: '/h' }, root: cached, name: 'aether' })).toBe('/d')
  expect(dataDirFrom({ env: { HOME: '/h' }, root: cached, name: 'aether' })).toBe('/h/.claude/plugins/data/aether-aether-plugin')
  expect(dataDirFrom({ env: { HOME: '/h', CLAUDE_CONFIG_DIR: '/c/' }, root: '/c/plugins/cache/aether-plugin/aether/0.7.0/', name: 'aether' })).toBe('/c/plugins/data/aether-aether-plugin')
  expect(dataDirFrom({ env: { HOME: '/h', CLAUDE_CODE_PLUGIN_CACHE_DIR: '/p' }, root: '/p/cache/my.market/aether/1.0.0', name: 'aether' })).toBe('/p/data/aether-my-market')
  expect(dataDirFrom({ env: { HOME: '/h' }, root: '/repo/plugins/aether', name: 'aether' })).toBe('/h/.claude/plugins/data/aether-inline')
  expect(dataDirFrom({ env: { HOME: '/h' }, root: '/work/cache/aether-plugin/aether/0.7.0', name: 'aether' })).toBe('/h/.claude/plugins/data/aether-inline')
  expect(dataDirFrom({ env: { HOME: '/h' }, root: `${cached}/bin`, name: 'aether' })).toBe('/h/.claude/plugins/data/aether-inline')
  expect(dataDirFrom({ env: { HOME: '/h' }, root: undefined, name: undefined })).toBe('/h/.claude/plugins/data/aether-inline')
})
```

- [ ] **Step 2: Run them and see them fail.** `claude plugin test plugins/aether`. Expected: the gate and offer tests fail, and `dataDirFrom` is not exported.
- [ ] **Step 3: Implement** the gate, the offer rule and `dataDirFrom` in `register.js`, as the Interfaces block says.
- [ ] **Step 4: Run the mod's tests and validation.** `npm run test:mod && claude plugin validate plugins/aether --strict`. Expected: every test passes, and validation passes.
  - If validation refuses the named export `dataDirFrom`, keep the function in `register.js` without the export, and test it through the meter's writes: a test with `AETHER_DATA_DIR` unset, which works only when `$.plugin.root` is a cache-shaped path, records which path the kit gives.
  - Say in the report which way it went.
- [ ] **Step 5: Commit.** `git add plugins/aether/hooks/register.js plugins/aether/hooks/usage.test.ts && git commit -m "feat(aether): the usage meter records and offers Aether's agents only in Aether sessions"`

**Acceptance:**
- `npm run test:mod` passes, with every old test and the eight new ones;
- `claude plugin validate plugins/aether --strict` passes;
- `grep -n "local/share" plugins/aether/hooks/*` prints nothing.

### Task 5: the marketplace, the manifest and the Lead agent

**Aether:**
- Tier: haiku medium — exact JSON and Markdown content that the tests pin completely
- Area: manifest
- Owns: `.claude-plugin/marketplace.json`, `plugins/aether/.claude-plugin/plugin.json`, `plugins/aether/agents/lead.md`, `package.json`, `tests/manifest.test.js`
- Depends on: none

**Files:**
- Create: `.claude-plugin/marketplace.json`, `plugins/aether/agents/lead.md`, `tests/manifest.test.js`
- Modify: `plugins/aether/.claude-plugin/plugin.json`, which keeps `"version": "0.6.0"` (Task 10 bumps it); `package.json` (`scripts.validate`)

**Interfaces:**
- Consumes: nothing.
- Produces: the exact contents the test below pins. These are spec R1, R2 (without the version), R3 and R4.

- [ ] **Step 1: Write the failing test.** Create `tests/manifest.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'))

test('the repository is a marketplace that lists the aether plugin and lets it depend on the official marketplace', () => {
  assert.deepEqual(json(ROOT, '.claude-plugin', 'marketplace.json'), {
    name: 'aether-plugin',
    owner: { name: 'DarkArty07' },
    description: 'Aether Plugin: an opt-in Aether mode for Claude Code, a Lead, a Designer and a supervised swarm.',
    allowCrossMarketplaceDependenciesOn: ['claude-plugins-official'],
    plugins: [
      {
        name: 'aether',
        source: './plugins/aether',
        description:
          'Aether mode: the Lead on Sonnet, the Designer on Opus, and a parallel swarm that implements approved plans. Start it with claude --agent aether:lead --effort xhigh.',
      },
    ],
  })
})

test('the manifest declares superpowers and the lanes option, off by default', () => {
  const manifest = json(PLUGIN, '.claude-plugin', 'plugin.json')
  assert.equal(manifest.name, 'aether')
  assert.deepEqual(manifest.dependencies, [{ name: 'superpowers', marketplace: 'claude-plugins-official' }])
  assert.deepEqual(manifest.userConfig, {
    lanes: {
      type: 'boolean',
      title: 'Lanes',
      description:
        "Run Aether's calls on agy while its quota lasts. Off by default: agy runs with --dangerously-skip-permissions and spends another plan's quota. Linux only.",
      default: false,
    },
  })
})

test("the Lead agent runs on Sonnet, with no body, so Claude Code's own system prompt stays", () => {
  assert.equal(
    fs.readFileSync(path.join(PLUGIN, 'agents', 'lead.md'), 'utf8'),
    '---\nname: lead\ndescription: "Aether Lead: the main session of Aether mode, started with claude --agent aether:lead --effort xhigh. It is not a subagent."\nmodel: sonnet\n---\n',
  )
})

test('validate checks the plugin and the marketplace', () => {
  assert.equal(json(ROOT, 'package.json').scripts.validate, 'claude plugin validate plugins/aether --strict && claude plugin validate . --strict')
})
```

- [ ] **Step 2: Run it and see it fail.** `node --test tests/manifest.test.js`. Expected: `ENOENT` for `marketplace.json`.
- [ ] **Step 3: Write the files.**
  - Write `.claude-plugin/marketplace.json` and `agents/lead.md` with exactly the contents the test pins: two-space JSON indentation, and a final newline.
  - In `plugin.json`, add `dependencies` and `userConfig` after `"homepage"`, and change nothing else.
  - Set `scripts.validate` in `package.json`.
- [ ] **Step 4: Run the checks.** `npm test && npm run validate`. Expected: all pass, and both validations print `Validation passed`.
- [ ] **Step 5: Commit.** `git add .claude-plugin/marketplace.json plugins/aether/.claude-plugin/plugin.json plugins/aether/agents/lead.md package.json tests/manifest.test.js && git commit -m "feat(aether): a marketplace at the repository root, superpowers as a dependency, the lanes option, and the aether:lead agent"`

**Acceptance:** `npm test` and `npm run validate` pass.

### Task 6: the swarm skill's two bullets, and the report's note

**Aether:**
- Tier: haiku medium — exact text in two files, pinned by exact tests
- Area: skills
- Owns: `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/lib/report.js`, `tests/roles.test.js`, `tests/report.test.js`
- Depends on: none

**Files:**
- Modify:
  - `plugins/aether/skills/swarm/SKILL.md`, §1 Prepare: add the "Workflows" bullet before "Lanes", and replace the "Lanes" bullet;
  - `plugins/aether/lib/report.js`: one note.
- Test: `tests/roles.test.js`, `tests/report.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - the exact bullets below (spec R18);
  - the note `no usage recorded during the run: was the session started with claude --agent aether:lead?` (spec R23), in place of today's note.

- [ ] **Step 1: Write the failing tests.**

Append to `tests/roles.test.js`:

```js
test('the swarm checks for the Workflow tool, and runs lanes only with the option on', () => {
  const swarm = read('skills', 'swarm', 'SKILL.md')
  const workflows =
    "- **Workflows.** The run is a dynamic workflow. When this session has no `Workflow` tool, workflows are off: tell the owner to turn on Dynamic workflows in `/config` and to start a new session, and offer superpowers' execution methods meanwhile.\n"
  const lanes =
    "- **Lanes.** When the owner turned on the plugin's `lanes` option, on Linux, with `agy` installed, the run sends calls to it while its quota lasts (`plugins/aether/config/lanes.json`). agy runs with `--dangerously-skip-permissions` in the unit's worktree. Otherwise every call is native, and `aether-plan compile` says why on stderr. `aether-plan compile <plan.md> --no-lanes` runs everything native.\n"
  assert.ok(swarm.includes(workflows))
  assert.ok(swarm.includes(lanes))
  assert.ok(swarm.indexOf(workflows) < swarm.indexOf(lanes))
  assert.ok(!swarm.includes('the owner accepted that risk for 0.4.0'))
})
```

Append to `tests/report.test.js`:

```js
test('the note for a run with no usage tells how to start an Aether session', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t, { result: false, testCommand: 'false' })
  const r = report(repo.dir, args.runId)
  assert.ok(r.notes.includes('no usage recorded during the run: was the session started with claude --agent aether:lead?'), r.notes.join('\n'))
})
```

- [ ] **Step 2: Run them and see them fail.** `node --test tests/roles.test.js tests/report.test.js`. Expected: both new tests fail.
- [ ] **Step 3: Change the two files** to the exact texts above. In `SKILL.md`, the "Workflows" bullet goes on the line before the "Lanes" bullet, at the same indentation.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git add plugins/aether/skills/swarm/SKILL.md plugins/aether/lib/report.js tests/roles.test.js tests/report.test.js && git commit -m "docs(aether): the swarm checks for workflows and the lanes option; the report's note names the new start"`

**Acceptance:** `npm test` passes; `grep -rn "aether-mode" plugins/aether` prints nothing.

### Task 7: the fake model, the acceptance probe kit

**Aether:**
- Tier: sonnet high — a small HTTP server whose streaming frames must match what Claude Code parses, which the tests pin only in part
- Area: probe
- Owns: `tests/fixtures/fake-model.js`, `tests/fake-model.test.js`
- Depends on: none

**Files:**
- Create: `tests/fixtures/fake-model.js`, `tests/fake-model.test.js`

**Interfaces:**
- Consumes: nothing.
- **The command line:** `node tests/fixtures/fake-model.js --out <dir> [--script <file.json>]`, a CommonJS script that requires only `node:` modules.
  - It binds `127.0.0.1` on port 0, so the system picks a free port.
  - It writes `<dir>/port` as `<port>\n`, then prints `listening <port>\n` on stdout.
  - It exits 0 on SIGTERM.
- **The requests:**
  - **A POST whose path starts with `/v1/messages` and contains `count_tokens`:** 200 and `{"input_tokens":100}`. It is not saved and not counted.
  - **Any other POST whose path starts with `/v1/messages`:**
    - it takes the next number `n`, counting from 1;
    - it saves `<dir>/req-<n>.json` as `{"url": <path with query>, "body": <parsed body, or the raw string when it is not JSON>}`;
    - it appends one JSON line to `<dir>/fake.log` with `n`, `model`, `effort` (`body.output_config.effort` or null), `first`, `k` and `reply` (the tool name, or `"text"`);
    - **with no `--script`,** it answers 400 with `{"type":"error","error":{"type":"invalid_request_error","message":"fake model"}}`;
    - **with `--script`,** the script is a JSON array of rules `{ "match": "<text>", "replies": [<block>, ...] }`, and the answer is a block:
      - **No tools:** when `body.tools` is missing or empty, the block is `{ "text": "ok" }`.
      - **`first`:** the text of the first message, a string content or its text blocks joined with `\n`, with every `<system-reminder>…</system-reminder>` removed.
      - **`k`:** the number of `user` messages whose content holds a `tool_result` block.
      - **The rule:** the first rule whose `match` is a substring of `first` answers `replies[k]`, or `{ "text": "done" }` when there is none. With no matching rule, the block is `{ "text": "ok" }`.
      - **Block kinds:** `{ "text": "..." }`; `{ "bash": "<command>" }`, which is the tool `Bash` with input `{"command": <command>, "description": "fake model"}`; and `{ "tool": "<Name>", "input": {...} }`.
  - **Any other path:** 404 `{}`.
- **The answer format:**
  - **When `body.stream` is true:** `content-type: text/event-stream`, and exactly these six frames, each written as `event: <name>\ndata: <json>\n\n`:
    1. `message_start`: `{"type":"message_start","message":{"id":"msg_<n>","type":"message","role":"assistant","model":<body.model>,"content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":1,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}`;
    2. `content_block_start`: `{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_<n>","name":<name>,"input":{}}}` for a tool, or `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}` for text;
    3. `content_block_delta`: `{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":<JSON.stringify(input)>}}`, or `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":<text>}}`;
    4. `content_block_stop`: `{"type":"content_block_stop","index":0}`;
    5. `message_delta`: `{"type":"message_delta","delta":{"stop_reason":"tool_use"|"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}`;
    6. `message_stop`: `{"type":"message_stop"}`.
  - **Otherwise:** 200 JSON `{"id":"msg_<n>","type":"message","role":"assistant","model":<body.model>,"content":[<block>],"stop_reason":…,"stop_sequence":null,"usage":{…as above}}`. The content block is `{"type":"tool_use","id":"toolu_<n>","name":…,"input":…}` or `{"type":"text","text":…}`.

- [ ] **Step 1: Write the failing tests.** Create `tests/fake-model.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tempDir } = require('./helpers.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-model.js')

// Starts the fake model and resolves with its port once it prints "listening <port>".
function startFake(t, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [FAKE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    t.after(() => child.kill('SIGTERM'))
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
      const m = /^listening (\d+)\n/.exec(out)
      if (m) resolve(Number(m[1]))
    })
    child.once('exit', (code) => reject(new Error(`the fake model exited with ${code}: ${out}`)))
  })
}

const post = (port, url, body) =>
  fetch(`http://127.0.0.1:${port}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// The frames of an event-stream body, as [{ event, data }].
function frames(text) {
  return text
    .trim()
    .split('\n\n')
    .map((frame) => {
      const [eventLine, dataLine] = frame.split('\n')
      return { event: eventLine.replace(/^event: /, ''), data: JSON.parse(dataLine.replace(/^data: /, '')) }
    })
}

const TOOLS = [{ name: 'Bash', input_schema: { type: 'object' } }]
const user = (text) => ({ role: 'user', content: [{ type: 'text', text }] })
const toolResult = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] }

test('record mode binds a free port, writes it, saves each request and answers 400', async (t) => {
  const out = tempDir(t)
  const port = await startFake(t, ['--out', out])
  assert.ok(port > 0)
  assert.equal(fs.readFileSync(path.join(out, 'port'), 'utf8'), `${port}\n`)
  const r = await post(port, '/v1/messages?beta=true', { model: 'claude-sonnet-5-5', stream: true, tools: TOOLS, messages: [user('hi')] })
  assert.equal(r.status, 400)
  assert.deepEqual(await r.json(), { type: 'error', error: { type: 'invalid_request_error', message: 'fake model' } })
  const saved = JSON.parse(fs.readFileSync(path.join(out, 'req-1.json'), 'utf8'))
  assert.equal(saved.url, '/v1/messages?beta=true')
  assert.equal(saved.body.model, 'claude-sonnet-5-5')
})

test('count_tokens answers a fixed count and is not saved, and other paths get 404', async (t) => {
  const out = tempDir(t)
  const port = await startFake(t, ['--out', out])
  const r = await post(port, '/v1/messages/count_tokens?beta=true', { model: 'm', messages: [] })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { input_tokens: 100 })
  assert.equal((await post(port, '/v1/other', {})).status, 404)
  assert.equal(fs.existsSync(path.join(out, 'req-1.json')), false)
})

test('script mode streams the scripted tool call, then the next reply after a tool result', async (t) => {
  const out = tempDir(t)
  const script = path.join(out, 'script.json')
  fs.writeFileSync(script, JSON.stringify([{ match: 'HELLO', replies: [{ bash: 'echo hi' }, { text: 'bye' }] }]))
  const port = await startFake(t, ['--out', out, '--script', script])
  const first = await post(port, '/v1/messages', { model: 'claude-haiku-5-5', stream: true, tools: TOOLS, messages: [user('say HELLO')] })
  assert.equal(first.status, 200)
  assert.match(first.headers.get('content-type'), /text\/event-stream/)
  const f = frames(await first.text())
  assert.deepEqual(
    f.map((x) => x.event),
    ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'],
  )
  assert.equal(f[0].data.message.model, 'claude-haiku-5-5')
  assert.deepEqual(f[1].data.content_block, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} })
  assert.deepEqual(JSON.parse(f[2].data.delta.partial_json), { command: 'echo hi', description: 'fake model' })
  assert.equal(f[4].data.delta.stop_reason, 'tool_use')
  const second = await post(port, '/v1/messages', {
    model: 'claude-haiku-5-5',
    stream: true,
    tools: TOOLS,
    messages: [user('say HELLO'), { role: 'assistant', content: [] }, toolResult],
  })
  const g = frames(await second.text())
  assert.deepEqual(g[1].data.content_block, { type: 'text', text: '' })
  assert.deepEqual(g[2].data.delta, { type: 'text_delta', text: 'bye' })
  assert.equal(g[4].data.delta.stop_reason, 'end_turn')
  const log = fs.readFileSync(path.join(out, 'fake.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(log.map((l) => [l.n, l.k, l.reply]), [[1, 0, 'Bash'], [2, 1, 'text']])
})

test('no tools, a match hidden in a system reminder, and a missing reply give text; a tool block comes back whole', async (t) => {
  const out = tempDir(t)
  const script = path.join(out, 'script.json')
  fs.writeFileSync(script, JSON.stringify([{ match: 'HELLO', replies: [{ tool: 'Write', input: { file_path: '/x', content: 'y' } }] }]))
  const port = await startFake(t, ['--out', out, '--script', script])
  const noTools = await post(port, '/v1/messages', { model: 'm', messages: [user('HELLO')] })
  assert.deepEqual((await noTools.json()).content, [{ type: 'text', text: 'ok' }])
  const hidden = await post(port, '/v1/messages', {
    model: 'm',
    tools: TOOLS,
    messages: [{ role: 'user', content: [{ type: 'text', text: '<system-reminder>HELLO</system-reminder>' }, { type: 'text', text: 'other' }] }],
  })
  const body = await hidden.json()
  assert.equal(body.stop_reason, 'end_turn')
  assert.deepEqual(body.content, [{ type: 'text', text: 'ok' }])
  const tool = await post(port, '/v1/messages', { model: 'm', tools: TOOLS, messages: [user('HELLO')] })
  const call = await tool.json()
  assert.equal(call.stop_reason, 'tool_use')
  assert.deepEqual(call.content, [{ type: 'tool_use', id: 'toolu_3', name: 'Write', input: { file_path: '/x', content: 'y' } }])
  const after = await post(port, '/v1/messages', { model: 'm', tools: TOOLS, messages: [user('HELLO'), { role: 'assistant', content: [] }, toolResult] })
  assert.deepEqual((await after.json()).content, [{ type: 'text', text: 'done' }])
})
```

- [ ] **Step 2: Run them and see them fail.** `node --test tests/fake-model.test.js`. Expected: the fake model exits with an error, because `tests/fixtures/fake-model.js` does not exist.
- [ ] **Step 3: Implement `tests/fixtures/fake-model.js`** as the Interfaces block says.
- [ ] **Step 4: Run `npm test`.** Expected: all pass, with no process left listening after the tests (`ss -ltnp | grep fake-model` prints nothing).
- [ ] **Step 5: Commit.** `git add tests/fixtures/fake-model.js tests/fake-model.test.js && git commit -m "test(aether): a fake model on a free local port, for the acceptance probes"`

**Acceptance:** the four tests and the whole `npm test` pass.

### Task 8: the session-start hook's gate

**Aether:**
- Tier: sonnet high — a hook that reads stdin and writes the marker and the environment file, where the file system and the session's environment go beyond the tests
- Review: xhigh — the opt-in (C3): a normal session must get nothing, and the file system
- Area: session
- Owns: `plugins/aether/bin/aether-session-start`, `tests/session-start.test.js`, `tests/session-start-autonomy.test.js`
- Depends on: Task 1 — the hook finds the data directory with `dataDir()`
- Depends on: Task 2 — the hook marks and prunes sessions with `lib/session.js`

**Files:**
- Modify: `plugins/aether/bin/aether-session-start`
- Test: `tests/session-start.test.js`, `tests/session-start-autonomy.test.js`

**Interfaces:**
- Consumes:
  - `dataDir()` from `lib/run.js`, called with no argument;
  - `LEAD_AGENT`, `markSession(dataDir, id)` and `pruneSessions(dataDir, { days: 30 })` from `lib/session.js`.
- Produces: the behavior of spec R7.
  1. **Read and gate.** Read stdin whole (`fs.readFileSync(0, 'utf8')`) and parse it as JSON. When it is unreadable, not an object, or its `agent_type` is not `aether:lead`, print nothing, write nothing, read no other file, and exit 0.
  2. **Mark.** Call `markSession(dataDir(), input.session_id)`. If it throws, remember the reason as the Error's message, and keep going.
  3. **The lanes line.** When `CLAUDE_ENV_FILE` is set, append the environment line (Global Constraints) to that file. When it is unset, or the append fails, remember to add the lanes sentence.
  4. **When `source` is `resume`, or any value other than `startup`, `clear` or `compact`** (an absent source counts as `startup`): print nothing, and exit 0.
  5. **Otherwise:**
     - prune as today, adding `pruneSessions` to the pruning;
     - sweep;
     - print the SessionStart JSON. Its `additionalContext` joins, with blank lines and leaving out the empty ones: `Aether mode is active.`, the bootstrap, the lanes sentence (if any), the marker sentence (if any, with its reason), the sweep note, and the autonomy note.
     - The sweep and autonomy notes stay last, as the existing tests expect.

- [ ] **Step 1: Write the failing tests.**

In `tests/session-start.test.js`:

1. Add `const { markSession } = require('../plugins/aether/lib/session.js')` to the requires.
2. Replace `start` with:

```js
const AETHER = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }

// The hook's environment, without what a surrounding session may have set.
function hookEnv(data, extra = {}) {
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_LANES', 'AETHER_LANES']) delete env[key]
  return { ...env, ...extra }
}

function start(cwd, data, { input = AETHER, env = {} } = {}) {
  const r = spawnSync(process.execPath, [SESSION_BIN], {
    cwd,
    encoding: 'utf8',
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: hookEnv(data, env),
  })
  return { status: r.status, stdout: r.stdout, out: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr }
}
```

3. Append:

```js
test('a session that is not Aether gets nothing: no output, no file, no environment line, no sweep', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  ageRun(args, 48)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const inputs = [
    { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup' },
    { ...AETHER, agent_type: 'Explore' },
    { ...AETHER, agent_type: 'claude' },
    'not json',
    '',
    'null',
    '[]',
    '"aether:lead"',
  ]
  for (const input of inputs) {
    const r = start(repo.dir, data, { input, env: { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_LANES: 'true' } })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', JSON.stringify(input))
  }
  assert.deepEqual(fs.readdirSync(data), [])
  assert.equal(fs.existsSync(envFile), false)
  assert.equal(fs.existsSync(unit.path), true, 'the stale run is not swept')
})

test('an Aether session is marked, gets the lanes line, and gets the context', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const r = start(repo.dir, data, { env: { CLAUDE_ENV_FILE: envFile } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.out.hookSpecificOutput.additionalContext, /^Aether mode is active\./)
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'sessions', 's1.json'), 'utf8')).session, 's1')
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_LANES=off\n')
})

test('the lanes line is on only when the lanes option is exactly true, and is appended', (t) => {
  const repo = makeRepo(t)
  for (const [value, line] of [['true', 'export AETHER_LANES=on\n'], ['false', 'export AETHER_LANES=off\n'], ['TRUE', 'export AETHER_LANES=off\n'], ['', 'export AETHER_LANES=off\n']]) {
    const envFile = path.join(tempDir(t), 'env.sh')
    fs.writeFileSync(envFile, 'export OTHER=1\n')
    start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_LANES: value } })
    assert.equal(fs.readFileSync(envFile, 'utf8'), `export OTHER=1\n${line}`, value)
  }
})

test('a resumed Aether session is marked and gets the lanes line, with no output', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const r = start(repo.dir, data, { input: { ...AETHER, source: 'resume' }, env: { CLAUDE_ENV_FILE: envFile } })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(path.join(data, 'sessions', 's1.json')), true)
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_LANES=off\n')
})

test('without CLAUDE_ENV_FILE the context says the lanes are off', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.ok(r.out.hookSpecificOutput.additionalContext.includes("Aether could not pass the lanes option to this session's commands, so lanes are off."))
})

test('an invalid or missing session id is said in the context, and writes no marker', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  for (const id of ['../x', undefined]) {
    const r = start(repo.dir, data, { input: { ...AETHER, session_id: id }, env: { CLAUDE_ENV_FILE: path.join(tempDir(t), 'env.sh') } })
    assert.equal(r.status, 0, r.stderr)
    const context = r.out.hookSpecificOutput.additionalContext
    assert.match(context, /^Aether mode is active\./)
    assert.match(context, /Aether could not mark this session \(.+\): the spec and plan guard and the usage meter are off in it\./)
  }
  assert.equal(fs.existsSync(path.join(data, 'sessions')), false)
  assert.equal(fs.existsSync(path.join(data, 'x.json')), false)
})

test('session start prunes session markers not written to for 30 days', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  markSession(data, 'old')
  const old = new Date(Date.now() - 31 * 24 * 3600 * 1000)
  fs.utimesSync(path.join(data, 'sessions', 'old.json'), old, old)
  start(repo.dir, data)
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')).sort(), ['s1.json'])
})
```

In `tests/session-start-autonomy.test.js`, replace `start` with:

```js
const AETHER = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }

function start(cwd, data, input = AETHER) {
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_LANES', 'AETHER_LANES']) delete env[key]
  const r = spawnSync(process.execPath, [SESSION_BIN], { cwd, encoding: 'utf8', input: JSON.stringify(input), env })
  return { status: r.status, stdout: r.stdout, context: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : null, stderr: r.stderr }
}
```

and append:

```js
test('a session that is not Aether gets no note about an open run', (t) => {
  const repo = makeRepo(t)
  writeRun(repo.dir, ID, null)
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
})
```

- [ ] **Step 2: Run them and see them fail.** `node --test tests/session-start.test.js tests/session-start-autonomy.test.js`. Expected: the new tests fail. The old ones still pass, because they now send an Aether session's input.
- [ ] **Step 3: Implement the gate** in `plugins/aether/bin/aether-session-start`, as the Interfaces block says.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git add plugins/aether/bin/aether-session-start tests/session-start.test.js tests/session-start-autonomy.test.js && git commit -m "feat(aether): session start acts only for aether:lead: marker, lanes line, context"`

**Acceptance:** `npm test` passes. A normal session's input gives empty stdout and leaves the data directory and `CLAUDE_ENV_FILE` untouched.

### Task 9: the guard's gate, and the SessionStart matcher

**Aether:**
- Tier: haiku xhigh — a few lines in one bin and one JSON value, pinned by exact tests
- Review: xhigh — a security hook: it must refuse in Aether sessions as before and allow everywhere else, including on odd session ids
- Area: hooks
- Owns: `plugins/aether/bin/aether-guard`, `plugins/aether/hooks/hooks.json`, `tests/guard.test.js`
- Depends on: Task 1 — the guard finds the data directory with `dataDir()`
- Depends on: Task 2 — the guard reads the marker with `isAetherSession`, and its tests write one with `markSession`

**Files:**
- Modify:
  - `plugins/aether/bin/aether-guard`;
  - `plugins/aether/hooks/hooks.json`: the SessionStart matcher becomes `startup|resume|clear|compact`, and nothing else changes.
- Test: `tests/guard.test.js`

**Interfaces:**
- Consumes: `dataDir()` from `lib/run.js`; `isAetherSession(dataDir, id)` and `markSession(dataDir, id)` from `lib/session.js`; `decide(input)` from `lib/guard.js`, unchanged.
- Produces: `aether-guard`, after parsing stdin into an object, allows the call (prints nothing) unless `isAetherSession(dataDir(), input.session_id)` is true. In a marked session it applies `decide` as today. Unreadable input still allows.

- [ ] **Step 1: Write the failing tests** in `tests/guard.test.js`.

1. Add to the requires:

```js
const { tempDir } = require('./helpers.js')
const { markSession } = require('../plugins/aether/lib/session.js')
```

2. Replace the `guard` helper with:

```js
// Runs the bin in a data directory where session s1 is an Aether session, unless marked is false.
function guard(t, stdin, { marked = true } = {}) {
  const data = tempDir(t, 'aether-data-')
  if (marked) markSession(data, 's1')
  const env = { ...process.env, AETHER_DATA_DIR: data }
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8', env })
}
const inSession = (input) => ({ session_id: 's1', ...input })
```

3. In the two existing bin tests, take `(t)`, call `guard(t, …)`, and wrap each input in `inSession(…)`. For example: `guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }))))`.
4. In the hooks.json test, change `'startup|clear|compact'` to `'startup|resume|clear|compact'`.
5. Append:

```js
test('outside an Aether session the guard allows what it would refuse, autonomy files included', (t) => {
  for (const input of [
    call('Write', { file_path: SPEC, content: 'x' }),
    call('Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }, { agent_id: 'a2', agent_type: 'general-purpose' }),
    call('Write', { file_path: '/repo/.aether/autonomy/grants.json', content: '{}' }),
  ]) {
    const r = guard(t, JSON.stringify(inSession(input)), { marked: false })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('in an Aether session every agent but the Designer is refused, general-purpose and workflow agents included', (t) => {
  const whos = [
    {},
    { agent_type: 'aether:lead' },
    { agent_id: 'a2', agent_type: 'general-purpose' },
    { agent_id: 'a3', agent_type: 'workflow-subagent' },
    { agent_id: 'a4', agent_type: 'aether:implementer' },
  ]
  for (const who of whos) {
    const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, who))))
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny', JSON.stringify(who))
  }
  assert.equal(guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, designer)))).stdout, '')
})

test('a session id that is missing or could leave the data directory counts as no Aether session', (t) => {
  for (const id of [undefined, '', '../s1', 'a/b', 42]) {
    const r = guard(t, JSON.stringify({ ...call('Write', { file_path: SPEC, content: 'x' }), session_id: id }))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', String(id))
  }
})
```

- [ ] **Step 2: Run them and see them fail.** `node --test tests/guard.test.js`. Expected: the "outside an Aether session" test fails because the guard refuses, and the hooks.json test fails on the matcher.
- [ ] **Step 3: Implement** the marker check in `aether-guard`, and change the matcher in `hooks.json`.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git add plugins/aether/bin/aether-guard plugins/aether/hooks/hooks.json tests/guard.test.js && git commit -m "feat(aether): the guard acts only in Aether sessions; session start also runs on resume"`

**Acceptance:** `npm test` passes.

### Task 10: the README guide, the records, version 0.7.0, and the retired installer

**Aether:**
- Tier: sonnet high — long documents whose facts must match the code and the measurements, pinned by the rewritten launcher test
- Area: docs
- Owns: `README.md`, `docs/decisions.md`, `docs/claude-code-research.md`, `plugins/aether/.claude-plugin/plugin.json`, `tests/launcher.test.js`, `scripts/aether-install.js`, `scripts/aether-mode.fish`, `tests/aether-install.test.js`
- Depends on: Task 1 — the test requires that no plugin file names `.local/share`, which Task 1 removes from `lib/run.js`
- Depends on: Task 3 — the README's Options and Lanes text describe the lanes switch
- Depends on: Task 4 — the test requires that no plugin file names `.local/share`, which Task 4 removes from the mod
- Depends on: Task 5 — it bumps the version in the `plugin.json` that Task 5 rewrites
- Depends on: Task 6 — the test requires that no plugin file names `aether-mode`, which Task 6 removes from `lib/report.js`
- Depends on: Task 8 — the README describes the session-start gate
- Depends on: Task 9 — the README describes the guard's gate

**Files:**
- Delete: `scripts/aether-install.js`, `scripts/aether-mode.fish`, `tests/aether-install.test.js`
- Modify:
  - `plugins/aether/.claude-plugin/plugin.json`: `"version": "0.7.0"`, and nothing else;
  - `README.md`, `docs/decisions.md`, `docs/claude-code-research.md`.
- Test: `tests/launcher.test.js`, rewritten

**Interfaces:**
- Consumes: the facts of the spec (§2 F1–F23, R16, R17, R20–R22, R24, R25) and of Tasks 1–9.
- Produces: README headings, which acceptance Task 13 relies on: `## Use Aether mode`, then `### Requirements`, `### Install`, `### Start`, `### Options`, `### What you set yourself`, `### Platforms`, `### Update, pin, roll back and uninstall`, `### Data`, `### Upgrading from 0.6`, then `## Development` with `### Release`. Task 13 later inserts `### What Aether adds to a normal session` between `### Start` and `### Options`.

- [ ] **Step 1: Rewrite `tests/launcher.test.js`.**
  - Keep, unchanged, the tests `the documents record the autonomy: decisions, the README, and no per-stage gates`, and `the documents record the lanes: decisions, facts, and the skills that use them` (in it, change `/^Version 0\.6: /m` to `/^Version 0\.7: /m`).
  - Delete every other test, the fish helpers (`NO_FISH`, `FLAGS`, `FAKE_CLAUDE`, `layout`, `aetherMode`), and the now-unused requires.
  - Add:

```js
const README = () => read('README.md')

// A README section: from its heading to the next heading of level 2 or 3.
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`)
  assert.ok(start >= 0, `the README has ${heading}`)
  const rest = text.slice(start + heading.length + 2)
  const end = rest.search(/\n##+ /)
  return end < 0 ? rest : rest.slice(0, end)
}

test('the README installs Aether with Claude Code, and starts it with one native command', () => {
  const readme = README()
  const lines = [
    'claude plugin install aether --marketplace DarkArty07/aether-plugin',
    '/plugin install aether --marketplace DarkArty07/aether-plugin',
    'claude plugin marketplace add anthropics/claude-plugins-official',
    '--config lanes=true',
    'claude --agent aether:lead --effort xhigh',
    '{ "agent": "aether:lead", "effortLevel": "xhigh" }',
    'claude --agent claude',
    'Plain `claude` stays normal mode: the plugin is dormant there.',
    'claude plugin update aether@aether-plugin',
    'claude plugin uninstall aether@aether-plugin',
    '--keep-data',
    'claude plugin configure aether@aether-plugin',
    '~/.claude/plugins/data/aether-aether-plugin/',
    '/advisor off',
    'Dynamic workflows',
    'Not verified on a Mac',
    'Never remove the marketplace to change versions',
    'claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh',
    'claude plugin tag plugins/aether',
    'docs/superpowers/specs/2026-10-09-installable-plugin-design.md',
  ]
  for (const line of lines) assert.ok(readme.includes(line), line)
})

test('the guide has its parts in order', () => {
  const readme = README()
  const headings = [
    '## Use Aether mode', '### Requirements', '### Install', '### Start', '### Options', '### What you set yourself',
    '### Platforms', '### Update, pin, roll back and uninstall', '### Data', '### Upgrading from 0.6', '## Development', '### Release',
  ]
  let at = -1
  for (const h of headings) {
    const i = readme.indexOf(`\n${h}\n`)
    assert.ok(i > at, `${h} comes after the part before it`)
    at = i
  }
})

test('only "Upgrading from 0.6" names the old launcher, installer and data directory', () => {
  const readme = README()
  const upgrading = section(readme, '### Upgrading from 0.6')
  const rest = readme.replace(upgrading, '')
  for (const old of ['aether-mode', 'aether-install', '.local/share/aether-plugin']) assert.ok(!rest.includes(old), old)
  for (const text of ['"source": "git"', '"url": "file://', '"ref": "aether--v0.7.0"', 'claude plugin install aether@aether-plugin --config lanes=true', '/advisor off']) {
    assert.ok(upgrading.includes(text), text)
  }
})

test('the installer and the fish launcher are gone', () => {
  for (const file of ['scripts/aether-install.js', 'scripts/aether-mode.fish', 'tests/aether-install.test.js']) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), false, file)
  }
})

test('the manifest is version 0.7.0, and the README says so', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.version, '0.7.0')
  assert.match(manifest.description, /the Lead on Sonnet/)
  assert.match(manifest.description, /the Designer on Opus/)
  assert.match(manifest.description, /Lanes run its calls on other coding plans/)
  assert.match(manifest.description, /decides as the owner's delegate/)
  assert.match(README(), /^Version 0\.7: /m)
})

test('no file of the plugin names a machine path, the old launcher or a shell', () => {
  const files = fs.readdirSync(PLUGIN, { recursive: true }).filter((f) => fs.statSync(path.join(PLUGIN, f)).isFile())
  for (const f of files) {
    const text = fs.readFileSync(path.join(PLUGIN, f), 'utf8')
    for (const word of ['.local/share', 'aether-mode', 'fish']) assert.ok(!text.includes(word), `${f} names ${word}`)
  }
})

test('the documents record the decisions and the verified facts', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A26', 'A27', 'A28', 'A29']) {
    assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  }
  assert.ok(decisions.includes('Since 0.7.0 (A27), the plugin is installed from the `aether-plugin` marketplace'))
  assert.ok(decisions.includes('Since 0.7.0, the Lead is the agent `aether:lead`'))
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lead and Designer findings \(2026-10-08\)$/m)
  assert.match(research, /^## Installable plugin findings \(2026-10-09\)$/m)
  for (const fact of ['agent_id', 'agent_type', 'cacheTtl', 'autoCompactWindow', 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL', 'CLAUDE_ENV_FILE', 'allowCrossMarketplaceDependenciesOn', 'extraKnownMarketplaces', 'agent.offer', 'port 0']) {
    assert.ok(research.includes(fact), fact)
  }
  const v01 = read('docs', 'superpowers', 'specs', '2026-10-07-aether-plugin-design.md')
  const status = v01.split('\n').find((line) => line.startsWith('- **Status:**'))
  assert.match(status, /2026-10-08-lead-and-designer-design\.md/)
})
```

  The file keeps `ROOT`, `read` and `PLUGIN` as today.

- [ ] **Step 2: Run it and see it fail.** `node --test tests/launcher.test.js`. Expected: the README, version, deletion and documents tests fail.
- [ ] **Step 3: Delete the installer and the launcher.** `git rm scripts/aether-install.js scripts/aether-mode.fish tests/aether-install.test.js`.
- [ ] **Step 4: Bump the version.** In `plugins/aether/.claude-plugin/plugin.json`, set `"version": "0.7.0"`.
- [ ] **Step 5: Rewrite the README.**
  - In `## Status`, change `Version 0.6:` to `Version 0.7:`. Replace the paragraph's last sentence, which begins "The copy the owner runs is an installed release", with:

```markdown
Since 0.7, Aether installs with Claude Code's own plugin commands and starts with `claude --agent aether:lead --effort xhigh`; plain `claude` stays normal mode ([installable plugin spec](docs/superpowers/specs/2026-10-09-installable-plugin-design.md)).
```

  - In the `## How it works` table, replace the rows that begin `` | `aether-guard` | ``, `| Usage meter |` and `| SessionStart hook |` with these three rows, in the same places:

```markdown
| `aether-guard` | A PreToolUse hook that, in an Aether session, refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every agent but the Designer, and on the autonomy registry and run states to every agent. In any other session it allows everything |
| Usage meter | A mod that records every model request of an Aether session: agent, model, tokens and time. In any other session it records nothing and does not offer Aether's agents |
| SessionStart hook | In an Aether session: marks the session, passes the lanes option to its commands, injects the bootstrap, sweeps runs left untouched for 24 hours, deletes usage files not written to for 30 days, and points a new Lead to an open autonomous run. In any other session it does nothing |
```

  - In `### Lanes`, add this bullet before the one that begins `- **Linux only.**`:

```markdown
- **Off by default.** Lanes run only when the plugin's `lanes` option is on (see Options).
```

  - Replace everything from `## Use Aether mode` up to `## Documentation` with the text below, verbatim. The `<<KEEP …>>` line marks where today's README paragraph and list go, unchanged: the one that starts "Then work as you would with superpowers." and ends with the permissions bullet.

```markdown
## Use Aether mode

### Requirements

- Claude Code 2.1.294 or later;
- Node.js 22;
- git 2.36 or later;
- superpowers, which Claude Code installs with Aether from its official marketplace.

### Install

    claude plugin install aether --marketplace DarkArty07/aether-plugin

Add `--config lanes=true` to turn the lanes on (see Options). In a session, `/plugin install aether --marketplace DarkArty07/aether-plugin` does the same and lets you choose the scope.

If Claude Code says that `superpowers@claude-plugins-official` is not installed, add Claude Code's official marketplace, which it adds by itself at your first interactive session, and install again:

    claude plugin marketplace add anthropics/claude-plugins-official

### Start

Aether mode is chosen per session:

    claude --agent aether:lead --effort xhigh

The Lead is the agent `aether:lead`, on Sonnet. `--effort xhigh` sets its effort, because a plugin cannot. The command is the same in every shell.

To make Aether mode the default in one repository, put this in its `.claude/settings.local.json`:

    { "agent": "aether:lead", "effortLevel": "xhigh" }

Plain `claude` then starts Aether mode there, and `claude --agent claude` starts normal mode, with the repository's `effortLevel`.

Plain `claude` stays normal mode: the plugin is dormant there. Its hooks do nothing, its usage meter records nothing, and its agents are not offered.

<<KEEP: the paragraph "Then work as you would with superpowers. …" and its list, through the permissions bullet>>

### Options

`lanes`, off by default, runs Aether's calls on agy while its quota lasts. agy runs with `--dangerously-skip-permissions` and spends another plan's quota, so you turn it on yourself. Lanes run only on Linux. Turn it on at install with `--config lanes=true`, or later in `/plugin` → Installed → aether → Configure options. `claude plugin configure aether@aether-plugin` shows the options and which are unset.

### What you set yourself

A plugin cannot set these, so you do:

| Need | Step |
|---|---|
| The Lead at `xhigh` | `--effort xhigh` in the start command, or `effortLevel` in the repository's settings |
| Dynamic workflows, for the swarm | Nothing on most paid plans. On Pro, turn on Dynamic workflows in `/config` once |
| No advisor in Aether mode (each call rereads the whole conversation, uncached) | Nothing unless you configured one. If you did, run `/advisor off` |
| Permissions for the swarm | Allow rules for `git`, `aether-wt`, `aether-lane` and the test command, and edits under `.aether/worktrees/` |
| superpowers | Nothing when Claude Code's official marketplace is added, as it is after your first interactive session. Otherwise: `claude plugin marketplace add anthropics/claude-plugins-official` |

### Platforms

| Platform | Status | What degrades |
|---|---|---|
| Linux, WSL included | Supported, verified | Nothing. Lanes run when the option is on and `agy` is installed |
| macOS | Supported by design: Aether needs only Node.js 22 and git. Not verified on a Mac | Lanes stay off: they read `/proc` |
| Windows, native | Not verified, not claimed. Hooks run through Git Bash | Lanes stay off |

### Update, pin, roll back and uninstall

- **Update:** `claude plugin update aether@aether-plugin`, then start a new session. To update on its own, turn on auto-update for the `aether-plugin` marketplace in `/plugin` → Marketplaces.
- **Pin a release, or roll back:** in `~/.claude/settings.json`, give the marketplace's source a `ref`, a release tag:

      "extraKnownMarketplaces": {
        "aether-plugin": { "source": { "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v0.7.0" } }
      }

  Then start any session, which fetches that tag, and run `claude plugin update aether@aether-plugin`. Set the `ref` to a newer tag, or remove it, to move forward again.
- **Never remove the marketplace to change versions:** removing it uninstalls Aether and deletes its data.
- **Uninstall:** `claude plugin uninstall aether@aether-plugin` also deletes Aether's data directory. Add `--keep-data` to keep it.

### Data

Aether keeps its data in `~/.claude/plugins/data/aether-aether-plugin/`. Set `AETHER_DATA_DIR` to use another directory.
- `usage/<session>/` holds the usage meter's files, kept for 30 days;
- `runs.jsonl` holds one record per finalized or abandoned run;
- the lane log is kept for 30 days;
- `sessions/` marks the Aether sessions, kept for 30 days.

The autonomy registry and run states live in the repository itself, under `.aether/autonomy/` in its main checkout.

### Upgrading from 0.6

Version 0.6 ran from `aether-mode`, a fish function that loaded a copy installed by `scripts/aether-install.js` under `~/.local/share/aether-plugin/installed/`. Both are gone from the repository, and your installed 0.6 copy keeps working until you remove it.

- **Installing from your clone's path works, but is not a release:** `claude plugin marketplace add <clone>` loads the working tree in place. Every edit or branch switch changes Aether at the next session, and a path cannot be pinned to a tag.
- **A pinned copy from your clone, with no push:** once the release is merged and tagged locally (`claude plugin tag plugins/aether`), add to `~/.claude/settings.json`:

      "extraKnownMarketplaces": {
        "aether-plugin": {
          "source": { "source": "git", "url": "file:///path/to/aether-plugin", "ref": "aether--v0.7.0" }
        }
      }

  Start any `claude` session, which clones it, then run:

      claude plugin install aether@aether-plugin --config lanes=true

  Move between releases by changing `ref`, as in "Update, pin, roll back and uninstall". Once the repository is pushed, the source may become `{ "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v<version>" }`.
- **Meanwhile `aether-mode` keeps loading 0.6:** it passes `--plugin-dir`, which replaces the installed plugin for that session.
- **Your history stays in `~/.local/share/aether-plugin/`:** `runs.jsonl`, `usage/` and the lane log. Move them into `~/.claude/plugins/data/aether-aether-plugin/` to keep one history.
- **Removing the old copy is your call:** delete `~/.config/fish/functions/aether-mode.fish` and `~/.local/share/aether-plugin/installed/` when you no longer need them.
- **The advisor:** `aether-mode` turned it off for Aether sessions. If you configured an advisor, run `/advisor off`.

## Development

The plugin is `plugins/aether/`, and the repository's `.claude-plugin/marketplace.json` lists it. An installed release is a copy in Claude Code's plugin cache, so work in the repository never changes it until you update. To try a branch:

    claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh

That loads the tree for one session, in place of the installed release. Its data goes to `~/.claude/plugins/data/aether-inline/`, and its options are set apart, under `pluginConfigs["aether@inline"]` in your settings. The bins of a branch run by path: `node <worktree>/plugins/aether/bin/aether-plan check <plan>`.

    npm test              # node --test "tests/*.test.js": bins, libraries, workflow scenarios and the fake model
    npm run test:mod      # claude plugin test plugins/aether: the usage meter mod
    npm run validate      # claude plugin validate, on the plugin and on the marketplace
    npm run check         # all three

Node.js 22 with no dependencies. The workflow's tests run its script in a harness with stubbed agents, so they spend no tokens. `scripts/refresh-lanes.js` updates the lane table from Artificial Analysis; it reads `ARTIFICIAL_ANALYSIS_API_KEY`, or else the `.env` file its header comment names.

### Release

1. bump `"version"` in `plugins/aether/.claude-plugin/plugin.json`, the version that `tests/launcher.test.js` pins, and the `Version 0.x` status line of this README;
2. run `npm run check`;
3. merge to `main`;
4. in the main checkout, run `claude plugin tag plugins/aether`, which creates the tag `aether--v<version>`;
5. push `main` and the tag;
6. users update with `claude plugin update aether@aether-plugin`.
```

- [ ] **Step 6: Update the records.**
  - **`docs/decisions.md`:**
    - At the end of row A8's last cell, before its closing `|`, append one space and then:

```markdown
Since 0.7.0 (A27), the plugin is installed from the `aether-plugin` marketplace, and Aether mode is the session agent `aether:lead`; `--plugin-dir` is for development only.
```

    - At the end of row A16's last cell, before its closing `|`, append one space and then:

```markdown
Since 0.7.0, the Lead is the agent `aether:lead` (`model: sonnet`), started with `--effort xhigh`. No plugin can turn the advisor off: the user runs `/advisor off` if one is configured.
```

    - After row A26, add:

```markdown
| A27 | **Aether mode is the session agent `aether:lead`.** The plugin installs with Claude Code's own commands from the `aether-plugin` marketplace and stays enabled. In any other session it is dormant: a marker per session, written by the session-start hook for `aether:lead`, gates the guard and the usage meter, and the meter withholds Aether's agents. | Decided 2026-10-09; built in 0.7.0 |
| A28 | **Lanes are a plugin option,** `lanes`, off by default, and Linux only. The session-start hook passes it to the session's commands as `AETHER_LANES`. | Decided 2026-10-09; built in 0.7.0 |
| A29 | **Data lives in the plugin's own data directory,** `~/.claude/plugins/data/aether-aether-plugin/` for an install from the marketplace, resolved by one rule in `dataDir()` and in the mod. `AETHER_DATA_DIR` overrides it. | Decided 2026-10-09; built in 0.7.0 |
```

  - **`docs/claude-code-research.md`:**
    - Add a section `## Installable plugin findings (2026-10-09)` before `## OpenRouter prices`.
    - It opens with this paragraph:

```markdown
Measured on Claude Code 2.1.296 with throwaway plugins, an isolated `CLAUDE_CONFIG_DIR`, and a local fake model (`tests/fixtures/fake-model.js`) that binds port 0, so the system picks a free port; no fixed port is ever used, and no model request reaches Anthropic. Check that a port is free before binding any other local server.
```

    - It then holds the table of facts F1–F23, copied verbatim from §2 of `docs/superpowers/specs/2026-10-09-installable-plugin-design.md`.

- [ ] **Step 7: Run the checks.** `npm test`. Expected: all pass. Then `grep -n "aether-mode\|aether-install\|local/share/aether-plugin" README.md`: every line it prints is inside "Upgrading from 0.6".
- [ ] **Step 8: Commit.** `git add -A README.md docs/decisions.md docs/claude-code-research.md plugins/aether/.claude-plugin/plugin.json tests/launcher.test.js scripts tests/aether-install.test.js && git commit -m "docs(aether): 0.7.0, the install guide, the records, and the installer and fish launcher retired"`

**Acceptance:** `npm test` passes, with the rewritten `tests/launcher.test.js`.

### Task 11: acceptance A1, the native install

**Aether:**
- Tier: sonnet — a probe of many steps whose outcomes need judgment and an honest record
- Review: xhigh — it runs `claude` against scratch configuration only; a slip would touch the owner's real `~/.claude`
- Area: acceptance
- Owns: `docs/evaluations/2026-10-09-installable/A1-install.md`
- Depends on: Task 10 — it installs the finished tree at version 0.7.0
- Depends on: Task 7 — its sessions use the fake model

**Files:**
- Create: `docs/evaluations/2026-10-09-installable/A1-install.md`

**Interfaces:**
- Consumes:
  - the plan's "Acceptance kit" section, K0–K7;
  - the fake model (Task 7);
  - the marketplace `aether-plugin` and the plugin `aether` (Task 5).
- Produces: the evidence file, in the K7 format.

**Set-up:**
- K0 and K1 (`aether-accept-a1-XXXXXX`), K2, K3 without a script, and K4.
- Also make `<S>/c2` and `<S>/c2-net`, for `<S>/cfg2`.

**Checks:**
1. **The marketplace validates:** `claude plugin validate <S>/clone --strict` passes. This command reads files only, and needs no wrapper.
2. **Install from the clone's path, without the official marketplace.**
   - Run `<S>/c plugin marketplace add <S>/clone`, then `<S>/c plugin install aether@aether-plugin`.
   - Expect `<S>/c plugin list` to show `aether@aether-plugin` failing to load, with the error naming `superpowers@claude-plugins-official` (spec F12).
3. **Add the official marketplace.**
   - Run `<S>/c-net plugin marketplace add anthropics/claude-plugins-official`. If `aether` still does not load, run `<S>/c plugin install aether@aether-plugin` again.
   - Expect `<S>/c plugin list` to show `aether@aether-plugin` and `superpowers@claude-plugins-official`, both enabled.
4. **The pinned copy, with lanes on:** K5 into `<S>/cfg2` with `<S>/c2` and `<S>/c2-net`, and `--config lanes=true`. Expect, besides K5's expectations, `<S>/cfg2/settings.json` to hold `pluginConfigs["aether@aether-plugin"].options.lanes === true`.
5. **The GitHub form** (`claude plugin install aether --marketplace DarkArty07/aether-plugin`) is not run: the repository is private and unpushed. Record it as "documented (spec F15), to verify after the owner's push", marked `SKIPPED`.
6. **Stop:** K6.

- [ ] **Step 1:** Do the set-up.
- [ ] **Step 2:** Run checks 1–6, recording as you go.
- [ ] **Step 3:** Write `docs/evaluations/2026-10-09-installable/A1-install.md` in the K7 format.
- [ ] **Step 4:** Commit. `git add docs/evaluations/2026-10-09-installable/A1-install.md && git commit -m "test(aether): acceptance A1, the native install"`

**Acceptance:** the evidence file ends with `Result: PASS`, and the two K0 `stat` records match.

### Task 12: acceptance A2, the native start

**Aether:**
- Tier: sonnet — a scripted session probe whose observations need judgment
- Review: xhigh — scratch configuration only, and a session that runs scripted tools
- Area: acceptance
- Owns: `docs/evaluations/2026-10-09-installable/A2-start.md`
- Depends on: Task 10 — it starts the finished tree at version 0.7.0
- Depends on: Task 7 — its sessions use the fake model

**Files:**
- Create: `docs/evaluations/2026-10-09-installable/A2-start.md`

**Interfaces:**
- Consumes:
  - the plan's "Acceptance kit" section, K0–K7;
  - the fake model in script mode (Task 7);
  - the `aether:lead` agent (Task 5) and the session-start gate (Task 8).
- Produces: the evidence file, in the K7 format.

**Set-up:**
- K0 and K1 (`aether-accept-a2-XXXXXX`), K2, K3 with this script (`<S>` written out literally), K4, and K5 into `<S>/cfg` without `--config`:

```json
[
  { "match": "ACCEPT-MAIN", "replies": [
    { "bash": "echo \"main lanes=${AETHER_LANES:-unset} plan=$(command -v aether-plan >/dev/null && echo yes || echo no)\" >> <S>/bash.txt" },
    { "tool": "Agent", "input": { "description": "acceptance subagent", "prompt": "ACCEPT-SUB", "subagent_type": "general-purpose" } },
    { "tool": "Workflow", "input": { "script": "export const meta = { name: 'acceptwf', description: 'acceptance', phases: [] }\nawait agent('ACCEPT-WF', { label: 'w' })\nreturn 'ok'" } },
    { "text": "main done" } ] },
  { "match": "ACCEPT-SUB", "replies": [ { "bash": "echo \"sub lanes=${AETHER_LANES:-unset}\" >> <S>/bash.txt" }, { "text": "sub done" } ] },
  { "match": "ACCEPT-WF", "replies": [ { "bash": "echo \"wf lanes=${AETHER_LANES:-unset}\" >> <S>/bash.txt" }, { "text": "wf done" } ] }
]
```

**Checks:**
1. **From bash:** from `<S>`, run `bash -c '<S>/c --agent aether:lead --effort xhigh -p ACCEPT-MAIN --allowedTools "Bash Agent Workflow"'`. If a needed tool is denied, rerun with `--dangerously-skip-permissions` in place of `--allowedTools …`, and record it.
2. **From fish:** the same command line, run with `fish -c '…'`.
3. **The Lead's first request:** the first saved request of the bash session, the one whose first message holds `ACCEPT-MAIN`, has:
   - `model` `claude-sonnet-5-5`, and `output_config.effort` `xhigh`;
   - `Aether mode is active` in its messages, directly or in a persisted-output preview.
4. **The system prompt and the tools.** Run a plain session, `<S>/c -p ACCEPT-PLAIN` from `<S>`. Its first request has:
   - the same `system` text as the Lead's first request;
   - the same set of tool names, 20 of them, `Agent`, `Workflow`, `SendMessage` and `Skill` among them.
5. **The marker:** `<S>/cfg/plugins/data/aether-aether-plugin/sessions/` holds one `.json` file per Aether session: two, after checks 1 and 2.
6. **The lanes line reaches every agent:** `<S>/bash.txt` holds, for each of the two sessions:
   - `main lanes=off plan=yes`;
   - `sub lanes=off`;
   - `wf lanes=off`.
   If the workflow line is missing, read `<S>/fake/fake.log` for the workflow agent's requests, and record what happened.
7. **Stop:** K6.

- [ ] **Step 1:** Do the set-up.
- [ ] **Step 2:** Run checks 1–7, recording as you go.
- [ ] **Step 3:** Write `docs/evaluations/2026-10-09-installable/A2-start.md` in the K7 format.
- [ ] **Step 4:** Commit. `git add docs/evaluations/2026-10-09-installable/A2-start.md && git commit -m "test(aether): acceptance A2, the native start"`

**Acceptance:** the evidence file ends with `Result: PASS`, and the two K0 `stat` records match.

### Task 13: acceptance A3, the dormant normal session, and its footprint in the README

**Aether:**
- Tier: sonnet — a comparison probe, then documentation written from what it measured
- Review: xhigh — scratch configuration only, and the numbers written must be the ones measured
- Area: acceptance
- Owns: `docs/evaluations/2026-10-09-installable/A3-dormant.md`, `README.md`, `docs/claude-code-research.md`
- Depends on: Task 10 — it inserts a README section between headings Task 10 writes, and appends to Task 10's research section
- Depends on: Task 7 — its sessions use the fake model

**Files:**
- Create: `docs/evaluations/2026-10-09-installable/A3-dormant.md`
- Modify: `README.md` (one new section), `docs/claude-code-research.md` (one new subsection)

**Interfaces:**
- Consumes:
  - the plan's "Acceptance kit" section, K0–K7;
  - the fake model (Task 7);
  - the README headings `### Start` and `### Options`, and the research section `## Installable plugin findings (2026-10-09)` (Task 10).
- Produces: the README section `### What Aether adds to a normal session`, and the research subsection `### Dormant footprint of 0.7.0`.

**Set-up:**
- K0 and K1 (`aether-accept-a3-XXXXXX`), K2, K3 with this script, K4, `git init -q <S>/work`, and K5 into `<S>/cfg` without `--config`:

```json
[ { "match": "ACCEPT-NORMAL", "replies": [ { "tool": "Write", "input": { "file_path": "<S>/work/docs/superpowers/specs/x.md", "content": "x\n" } }, { "text": "done" } ] } ]
```

**Checks:**
1. **Before:** record the listing of `<S>/cfg/plugins/data/aether-aether-plugin/`. It may not exist yet.
2. **A normal session with Aether enabled.** From `<S>/work`, run `<S>/c -p ACCEPT-NORMAL --allowedTools Write`. Then:
   - `<S>/work/docs/superpowers/specs/x.md` exists: the guard allowed it;
   - the data directory's listing is unchanged, with no `sessions/` and no `usage/`;
   - the session's first request has no `Aether mode is active`, and no line for `aether:designer`, `aether:implementer`, `aether:ops`, `aether:reviewer`, `aether:supervisor` or `aether:lead`.
3. **The same session with Aether disabled for one session.** Remove `x.md`, then run `<S>/c -p ACCEPT-NORMAL --allowedTools Write --settings '{"enabledPlugins":{"aether@aether-plugin":false}}'`. Compare the two sessions' first requests:
   - the character counts of `system`, `tools` and `messages`;
   - the lines present only with Aether enabled.
4. **The static estimate:** `<S>/c plugin details aether@aether-plugin`. Record its `Always-on` line.
5. **The commands on `PATH`:** `ls <S>/cfg/plugins/cache/aether-plugin/aether/0.7.0/bin | wc -l` gives 8.
6. **Stop:** K6.
7. **Write the README section.** Insert it between the end of `### Start` (after its kept paragraph and list) and `### Options`, with the measured values:

```markdown
### What Aether adds to a normal session

Measured on Claude Code <version> with Aether 0.7.0, in a session started without `--agent aether:lead`, against the same session with Aether disabled:
- the first request grows by <N> characters, all in the first message: <the lines, such as the `aether:run` and `aether:swarm` entries>;
- the system prompt and the tools are unchanged;
- `claude plugin details` estimates <T> tokens always on;
- the eight commands of `bin/` are on the Bash tool's `PATH`;
- each session start, and each `Write`, `Edit`, `MultiEdit` or `NotebookEdit` call, runs one short `node` process that finds no Aether session and exits.

Nothing is injected, refused, recorded or written.
```

   If a measurement contradicts a line of this text, for example the system prompt changed, write what was measured instead, and fail the check that measured it.
8. **Write the research subsection:** at the end of `## Installable plugin findings (2026-10-09)` in `docs/claude-code-research.md`, add `### Dormant footprint of 0.7.0`, with the same numbers, the commands of checks 2–5, and the Claude Code version.
9. **Run `npm test`.** It passes: `tests/launcher.test.js` still finds the guide's parts in order.

- [ ] **Step 1:** Do the set-up.
- [ ] **Step 2:** Run checks 1–6, recording as you go.
- [ ] **Step 3:** Do checks 7–9.
- [ ] **Step 4:** Write `docs/evaluations/2026-10-09-installable/A3-dormant.md` in the K7 format.
- [ ] **Step 5:** Commit. `git add docs/evaluations/2026-10-09-installable/A3-dormant.md README.md docs/claude-code-research.md && git commit -m "test(aether): acceptance A3, the dormant normal session and its measured footprint"`

**Acceptance:** the evidence file ends with `Result: PASS`, the README and the research doc hold the measured numbers, `npm test` passes, and the two K0 `stat` records match.

### Task 14: acceptance A4, an Aether session's guard, meter and resume

**Aether:**
- Tier: sonnet — a scripted session probe with several observations
- Review: xhigh — scratch configuration only, and a guard check
- Area: acceptance
- Owns: `docs/evaluations/2026-10-09-installable/A4-aether-session.md`
- Depends on: Task 10 — it runs the finished tree at version 0.7.0
- Depends on: Task 7 — its sessions use the fake model

**Files:**
- Create: `docs/evaluations/2026-10-09-installable/A4-aether-session.md`

**Interfaces:**
- Consumes:
  - the plan's "Acceptance kit" section, K0–K7;
  - the fake model (Task 7);
  - the guard's and the meter's gates (Tasks 4 and 9), and `dataDir()` (Task 1).
- Produces: the evidence file, in the K7 format.

**Set-up:**
1. K0 and K1 (`aether-accept-a4-XXXXXX`), K2, K3 with the script below, K4, `git init -q <S>/work`, and K5 into `<S>/cfg` without `--config`:

```json
[
  { "match": "ACCEPT-GUARD", "replies": [ { "tool": "Agent", "input": { "description": "write a spec", "prompt": "ACCEPT-SPEC", "subagent_type": "general-purpose" } }, { "text": "done" } ] },
  { "match": "ACCEPT-SPEC", "replies": [ { "tool": "Write", "input": { "file_path": "<S>/work/docs/superpowers/specs/y.md", "content": "y\n" } }, { "text": "sub done" } ] },
  { "match": "ACCEPT-RESUME", "replies": [ { "bash": "echo \"resume lanes=${AETHER_LANES:-unset}\" >> <S>/bash.txt" }, { "text": "done" } ] }
]
```

2. Add to `<S>/cfg/settings.json` a user-level SessionStart hook that records every SessionStart input:

```json
"hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "cat >> '<S>/session-start.jsonl'; echo >> '<S>/session-start.jsonl'" } ] } ] }
```

**Checks:**
1. **The guard in an Aether session.** From `<S>/work`, run `<S>/c --agent aether:lead --effort xhigh -p ACCEPT-GUARD --allowedTools "Agent Write"`. Then:
   - `<S>/work/docs/superpowers/specs/y.md` does not exist;
   - a saved request of the subagent holds a `tool_result` that contains `only the Designer writes specs and plans`.
2. **The meter:**
   - `<S>/cfg/plugins/data/aether-aether-plugin/usage/<session id>/0.json` exists, with at least one entry. The session id is the one in `<S>/session-start.jsonl`.
   - `CLAUDE_CONFIG_DIR=<S>/cfg node -e "console.log(require('<S>/cfg/plugins/cache/aether-plugin/aether/0.7.0/lib/run.js').dataDir())"` prints `<S>/cfg/plugins/data/aether-aether-plugin`.
3. **Resume.** Run `<S>/c --resume <session id> --agent aether:lead --effort xhigh -p ACCEPT-RESUME --allowedTools Bash`. Then:
   - `<S>/session-start.jsonl` has a line with `"source":"resume"` and `"agent_type":"aether:lead"`;
   - `<S>/bash.txt` holds `resume lanes=off`;
   - the marker of that session id still exists.
4. **`/clear`, headless.** Run `<S>/c --resume <session id> --agent aether:lead --effort xhigh -p /clear`.
   - If `<S>/session-start.jsonl` then has a line with `"source":"clear"` and `"agent_type":"aether:lead"`, check that a marker exists for that line's session id.
   - If headless mode does not run `/clear`, record "not verifiable headless", and mark the check `SKIPPED`, which does not fail the task.
5. **Stop:** K6.

- [ ] **Step 1:** Do the set-up.
- [ ] **Step 2:** Run checks 1–5, recording as you go.
- [ ] **Step 3:** Write `docs/evaluations/2026-10-09-installable/A4-aether-session.md` in the K7 format.
- [ ] **Step 4:** Commit. `git add docs/evaluations/2026-10-09-installable/A4-aether-session.md && git commit -m "test(aether): acceptance A4, an Aether session's guard, meter and resume"`

**Acceptance:** the evidence file ends with `Result: PASS`, with check 4 `PASS` or `SKIPPED`, and the two K0 `stat` records match.

### Task 15: acceptance A5, pin and roll back

**Aether:**
- Tier: sonnet — a probe that moves an install between versions, and checks the data survives
- Review: xhigh — scratch configuration only; these are the steps a user will follow to roll back
- Area: acceptance
- Owns: `docs/evaluations/2026-10-09-installable/A5-pin-rollback.md`
- Depends on: Task 10 — it pins the finished tree at version 0.7.0
- Depends on: Task 7 — the sessions that fetch the marketplace use the fake model

**Files:**
- Create: `docs/evaluations/2026-10-09-installable/A5-pin-rollback.md`

**Interfaces:**
- Consumes:
  - the plan's "Acceptance kit" section, K0–K7;
  - the fake model in record mode (Task 7);
  - the marketplace and the manifest (Task 5).
- Produces: the evidence file, in the K7 format.

**Set-up:**
1. K0 and K1 (`aether-accept-a5-XXXXXX`), K2, K3 without a script, and K4.
2. In the clone only, make a second release:
   - set `"version": "0.7.1"` in `<S>/clone/plugins/aether/.claude-plugin/plugin.json`;
   - `git -C <S>/clone -c user.name=acceptance -c user.email=acceptance@example.invalid commit -qam "throwaway 0.7.1"`;
   - `git -C <S>/clone tag aether--v0.7.1`.
3. K5 into `<S>/cfg`, without `--config`, pinned at `aether--v0.7.0`.

**Checks:**
1. **Installed at 0.7.0:** `<S>/c plugin list` shows `aether@aether-plugin` version 0.7.0. Then write `keep` into `<S>/cfg/plugins/data/aether-aether-plugin/keep.txt`, creating the directory.
2. **Move forward.**
   - Set the `ref` in `<S>/cfg/settings.json` to `aether--v0.7.1`, editing the JSON with `node -e`.
   - Run one session, `<S>/c -p hi` from `<S>`.
   - Wait up to 30 seconds for `<S>/cfg/plugins/known_marketplaces.json` to show `"ref":"aether--v0.7.1"`. If it does not, run the session again with `<S>/c-net`.
   - Expect:
     - `<S>/c plugin update aether@aether-plugin` reports the update to 0.7.1;
     - `<S>/c plugin list` shows 0.7.1;
     - `keep.txt` still holds `keep`.
3. **Roll back:** the same steps with `aether--v0.7.0`. Expect 0.7.0, with `keep.txt` intact.
4. **Stop:** K6.

- [ ] **Step 1:** Do the set-up.
- [ ] **Step 2:** Run checks 1–4, recording as you go.
- [ ] **Step 3:** Write `docs/evaluations/2026-10-09-installable/A5-pin-rollback.md` in the K7 format.
- [ ] **Step 4:** Commit. `git add docs/evaluations/2026-10-09-installable/A5-pin-rollback.md && git commit -m "test(aether): acceptance A5, pin and roll back"`

**Acceptance:** the evidence file ends with `Result: PASS`, and the two K0 `stat` records match.

### Task 16: acceptance A6, nothing published, and the owner's 0.6.0 intact

**Aether:**
- Tier: haiku high — read-only checks against exact expected values
- Review: xhigh — it reads the owner's real repository and installed copy, and must change neither
- Area: acceptance
- Owns: `docs/evaluations/2026-10-09-installable/A6-owner-copy.md`
- Depends on: Task 10 — it checks the repository after every code and docs task has merged

**Files:**
- Create: `docs/evaluations/2026-10-09-installable/A6-owner-copy.md`

**Interfaces:**
- Consumes: the repository's refs, read with git from this unit's worktree, and the owner's installed 0.6.0 copy, read only.
- Produces: an evidence file with a title, the date, one section per check (the command, its output, the expected value, `PASS` or `FAIL`), and a last line, `Result: PASS` or `Result: FAIL — <check>`.

**Rules:**
- Read only: run no `claude` command, and no `git push`, `git tag`, `git fetch` or `git merge`.
- Write nothing outside this unit's worktree.

**Expected values, recorded when this plan was written.** In the table, `\|` stands for a plain `|` in the command you run.

| Command | Expected output |
|---|---|
| `git tag --list 'aether--v*'` | exactly `aether--v0.1.0`, `aether--v0.2.0`, `aether--v0.3.0`, `aether--v0.4.0`, `aether--v0.5.0` and `aether--v0.6.0`, one per line |
| `git rev-parse 'aether--v0.6.0^{commit}'` | `0d2dd38d49448f871d8b03c6414a050962bc7090` |
| `git rev-parse refs/remotes/origin/main` | `4130f868357dcca13aadea594fc78eb765d6df49` |
| `readlink ~/.local/share/aether-plugin/installed/current` | `0.6.0-0d2dd38` |
| `readlink ~/.local/share/aether-plugin/installed/previous` | `0.5.0-4130f86` |
| `(cd ~/.local/share/aether-plugin/installed/0.6.0-0d2dd38 && find . -type f \| LC_ALL=C sort \| xargs sha256sum \| sha256sum)` | `976dd3fdb212b5d107c137dca1648b691e0fddb29396f4891327f80b2b2bf166  -` |
| `readlink ~/.config/fish/functions/aether-mode.fish` | `/home/darkarty/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish` |

**Checks:** run each command, and compare its output with the expected value.
- A difference fails that check. Record both values, plus `git log --oneline -3` for context, and do not try to fix anything.
- A path that does not exist on this machine also fails its check; say so.

- [ ] **Step 1:** Run the checks.
- [ ] **Step 2:** Write `docs/evaluations/2026-10-09-installable/A6-owner-copy.md`.
- [ ] **Step 3:** Commit. `git add docs/evaluations/2026-10-09-installable/A6-owner-copy.md && git commit -m "test(aether): acceptance A6, nothing published and the owner's 0.6.0 intact"`

**Acceptance:** the evidence file ends with `Result: PASS`.
