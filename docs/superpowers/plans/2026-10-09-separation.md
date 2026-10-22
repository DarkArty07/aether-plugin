# The project apart from the copy the owner runs: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Aether mode.** Every task suits the swarm, and all three run in one wave. Run it with `--no-lanes`: issue 007 (https://github.com/DarkArty07/aether-plugin/issues/7) makes a lane waste quota and money until it is fixed. This is a contract plan (A10): Tasks 1 and 3 give the interfaces, the failing tests in full and the acceptance, and the implementer writes the code. Task 2 gives the exact text, because the text is the requirement. After the swarm, the Lead runs the migration in "After the swarm", in order.

**Goal:** `aether-mode` loads a release installed apart from the project, so that work on the project never changes what the owner runs until an explicit, local install. Rollback is one command, `aether-mode --dev` loads the development tree on purpose, and the API key lives in the data directory.

**Architecture:**
- **`scripts/aether-install.js`** (new, a project script): `install [<version>]`, `rollback` and `status`. It extracts a tag's `plugins/aether` and `scripts/aether-mode.fish` with `git archive` into `<data>/installed/<version>-<commit>/` and keeps the `current` and `previous` links.
- **`scripts/aether-mode.fish`** gains `--dev`. Its `claude` line does not change: linked from the installed copy, it already loads the plugin beside it.
- **`scripts/refresh-lanes.js`** reads the key from `<data>/.env`.
- **Docs and version:** the README, decision A26, and version 0.6.0. Nothing else in `plugins/aether` changes. No new hook.

**Tech Stack:** Node.js 22, CommonJS, `node:test`, no dependencies; git and tar; fish 4 for the launcher.

**Spec:** `docs/superpowers/specs/2026-10-09-separation-design.md`

## Global Constraints

- **Code:** Node.js 22 with no dependencies. Scripts are CommonJS, start with `#!/usr/bin/env node` and then `'use strict'`. Only `node:` modules and `plugins/aether/lib/git.js` may be required.
- **No network**, anywhere.
- **Names:** the script is `scripts/aether-install.js`. Tags are `aether--v<major>.<minor>.<patch>`. A version directory is `<version>-<commit>`, where `<commit>` is the first 7 characters of the tag's full commit id. The links in `installed/` are `current` and `previous` (relative: their target is a version directory's name). Each version directory has `dev-tree`, whose target is the absolute path of the main checkout.
- **Data directory:** `AETHER_DATA_DIR` when set, or else `path.join(os.homedir(), '.local', 'share', 'aether-plugin')`. Installed copies go in `<data>/installed/`, and the key in `<data>/.env`.
- **The launcher's `claude` line stays byte-identical:** `env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv`.
- **Inside `plugins/aether`, only `"version": "0.6.0"` in `.claude-plugin/plugin.json` changes.** `hooks/hooks.json` does not change.
- **Never print the API key.**
- **Language:** code and documents in English.
- **Specs and plans:** no task owns a file under `docs/superpowers/`.
- **Final check, by the Lead after the swarm:** `npm run check`.

## Review Focus

1. **A crash in the middle of an install** must leave `current`, `previous` and every version directory as they were. Extraction goes to a `.tmp-` directory that is renamed into place, and links are replaced by renaming a new link over the old one. A failed extraction is pinned in Task 1; a crash is checked by inspection.
2. **A session running on a version** must never see its files change: an existing version directory is reused, never extracted again or deleted. Pinned in Task 1.
3. **Paths with spaces** (a data directory, a repository) must work in the installer and in the launcher. Pinned in Tasks 1 and 2: their temporary directories hold a space.
4. **The installer run from another directory, or from a linked worktree,** must read this project's tags and link `dev-tree` to the main checkout. The default `repoDir` is the script's own parent, never the current directory. The worktree case is pinned in Task 1; the current directory by inspection.
5. **`aether-mode --dev` with a development tree that is gone** must fail, and never fall back silently to the release. Pinned in Task 2.

## Aether Execution
- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 30

## Tasks

### Task 1: `scripts/aether-install.js`, the installer

**Aether:**
- Tier: sonnet high — git and file-system work that the exact tests pin, with atomic link swaps the tests cannot fully observe
- Review: xhigh — the file system, partial failures and the owner's installed copies, beyond what the tests list
- Area: install
- Owns: `scripts/aether-install.js`, `tests/aether-install.test.js`
- Depends on: none

**Files:**
- Create: `scripts/aether-install.js`
- Test: `tests/aether-install.test.js`

**Interfaces:**
- Consumes:
  - `git(args: string[], cwd: string, { allowFail = false } = {}): { status, stdout, stderr }` and `repoPaths(cwd: string): { worktree, gitCommonDir, mainRoot }` from `plugins/aether/lib/git.js`;
  - `tempDir(t, prefix)` and `makeRepo(t, { prefix })` from `tests/helpers.js`. `makeRepo` leaves a repository with one commit on `main`, switched to `feature/x`, and returns `{ dir, git }`.
- Produces: `module.exports = { main }`, where
  - `main(argv: string[], { env = process.env, repoDir = path.join(__dirname, '..') } = {}): { exitCode: 0 | 1 | 2, stdout: string }` is synchronous;
  - run as `node scripts/aether-install.js …`, the script writes `stdout` and sets `process.exitCode`.

**Behavior** (spec R1–R9):
- **`install [<version>]`**
  - With no version, it takes the highest tag of the form, by numeric version order; tags of other forms are ignored. It checks the tag's `plugins/aether/.claude-plugin/plugin.json` version.
  - When `installed/<version>-<commit>` does not exist, it extracts `plugins/aether` and `scripts/aether-mode.fish` at the tag into `installed/.tmp-…`, then renames that into place. On failure it removes the temporary directory.
  - It points the version's `dev-tree` at `repoPaths(repoDir).mainRoot`.
  - It then switches the links. When `current` names this directory already, neither link changes. Otherwise `previous` takes the old `current`, if there was one, and is written first; then `current` takes the new version.
- **`rollback`** swaps the two links, `previous` first. It needs both links, each naming a directory that exists.
- **`status`** treats a link whose directory is gone as `none`.

**Output lines, exactly** (each ends with `\n`):

| Case | stdout | exit |
|---|---|---|
| install or rollback switched | `aether <v> (<c>) is now current; previous: <pv> (<pc>). It loads in the next aether-mode session.` (`previous: none.` when there is none) | 0 |
| install of the current one | `aether <v> (<c>) is already current.` | 0 |
| status | `current: <v> (<c>)`, `previous: <v> (<c>)`, `latest tag: <v> (<c>)`, one per line, `none` when absent | 0 |
| no tag of the form | `no aether--v* tag in <mainRoot>.` | 1 |
| the named tag is missing | `no tag aether--v<v>.` | 1 |
| the manifest disagrees | `aether--v<v> holds plugin version <found>, not <v>.` (`none` when missing) | 1 |
| extraction failed | `cannot extract aether--v<v>: <git's or tar's error, trimmed, its lines joined by "; ">` | 1 |
| rollback without both links | `no previous version to roll back to.` | 1 |
| any other error | `aether-install: <message>` | 1 |
| other arguments | `usage: node scripts/aether-install.js install [<version>] \| rollback \| status` | 2 |

(In the usage line, `\|` is a plain `|`: the backslash only escapes the table.)

**Notes for the implementer:**
- `git archive --format=tar <commit> plugins/aether scripts/aether-mode.fish` (run with `spawnSync` to a buffer, and check its status before running `tar -x -C <dir>` with that buffer as input) keeps the executable bits and copies only tracked files.
- Create a link under a temporary name in `installed/`, then `fs.renameSync` it over the old one.

- [ ] **Step 1: Write the failing tests** in `tests/aether-install.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo } = require('./helpers.js')
const { main } = require('../scripts/aether-install.js')

const SCRIPT = path.join(__dirname, '..', 'scripts', 'aether-install.js')
const USAGE = 'usage: node scripts/aether-install.js install [<version>] | rollback | status\n'
const LOADS = 'It loads in the next aether-mode session.\n'
const now = (version, commit) => `aether ${version} (${commit}) is now current;`

function write(dir, file, content, mode) {
  const full = path.join(dir, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
  if (mode) fs.chmodSync(full, mode)
}

// A repository shaped like the project, on main: the plugin's manifest, an executable bin, the
// launcher, and a file outside both that an install must not copy. One commit and one annotated
// tag per version, in the order given. `commits` maps each version to its commit's first 7 characters.
function makeProject(t, versions) {
  const repo = makeRepo(t, { prefix: 'aether install repo ' })
  repo.git('config', 'tag.gpgsign', 'false')
  repo.git('switch', '-q', 'main')
  const commits = {}
  for (const version of versions) {
    write(repo.dir, 'plugins/aether/.claude-plugin/plugin.json', JSON.stringify({ name: 'aether', version }) + '\n')
    write(repo.dir, 'plugins/aether/bin/aether-x', `#!/bin/sh\necho ${version}\n`, 0o755)
    write(repo.dir, 'scripts/aether-mode.fish', `# launcher ${version}\n`)
    write(repo.dir, 'docs/notes.md', `notes ${version}\n`)
    repo.git('add', '-A')
    repo.git('commit', '-q', '-m', `release ${version}`)
    repo.git('tag', '-a', `aether--v${version}`, '-m', `aether ${version}`)
    commits[version] = repo.git('rev-parse', 'HEAD').slice(0, 7)
  }
  return { ...repo, commits }
}

// A data directory whose path holds a space, and readers for what the installer left in it.
function makeData(t) {
  const data = tempDir(t, 'aether install data ')
  const installed = path.join(data, 'installed')
  return {
    env: { AETHER_DATA_DIR: data },
    installed,
    link(name) {
      try {
        return fs.readlinkSync(path.join(installed, name))
      } catch {
        return null
      }
    },
    entries: () => (fs.existsSync(installed) ? fs.readdirSync(installed).sort() : []),
  }
}

test('install takes the highest tag by version order and extracts only the plugin and the launcher, from the tag', (t) => {
  const repo = makeProject(t, ['0.2.0', '0.10.0', '0.9.0'])
  const data = makeData(t)
  const c = repo.commits['0.10.0']
  assert.deepEqual(main(['install'], { env: data.env, repoDir: repo.dir }), { exitCode: 0, stdout: `${now('0.10.0', c)} previous: none. ${LOADS}` })
  const name = `0.10.0-${c}`
  const dir = path.join(data.installed, name)
  assert.deepEqual(data.entries(), [name, 'current'])
  assert.equal(data.link('current'), name)
  assert.equal(data.link('previous'), null)
  assert.deepEqual(fs.readdirSync(dir).sort(), ['dev-tree', 'plugins', 'scripts'])
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'plugins', 'aether', '.claude-plugin', 'plugin.json'), 'utf8')).version, '0.10.0')
  assert.equal(fs.readFileSync(path.join(dir, 'scripts', 'aether-mode.fish'), 'utf8'), '# launcher 0.10.0\n')
  assert.equal(fs.statSync(path.join(dir, 'plugins', 'aether', 'bin', 'aether-x')).mode & 0o111, 0o111)
  assert.equal(fs.readlinkSync(path.join(dir, 'dev-tree')), repo.dir)
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.equal(repo.git('branch', '--show-current'), 'main')
})

test('installed from a linked worktree, dev-tree still names the main checkout', (t) => {
  const repo = makeProject(t, ['0.1.0'])
  const wt = path.join(tempDir(t, 'aether install wt '), 'wt')
  repo.git('worktree', 'add', '-q', wt, 'feature/x')
  const data = makeData(t)
  assert.equal(main(['install'], { env: data.env, repoDir: wt }).exitCode, 0)
  assert.equal(fs.readlinkSync(path.join(data.installed, `0.1.0-${repo.commits['0.1.0']}`, 'dev-tree')), repo.dir)
})

test('a second install keeps the first as previous, and rollback swaps the two, both ways', (t) => {
  const repo = makeProject(t, ['0.4.0', '0.5.0'])
  const data = makeData(t)
  const opts = { env: data.env, repoDir: repo.dir }
  const [c4, c5] = [repo.commits['0.4.0'], repo.commits['0.5.0']]
  assert.deepEqual(main(['install', '0.4.0'], opts), { exitCode: 0, stdout: `${now('0.4.0', c4)} previous: none. ${LOADS}` })
  assert.deepEqual(main(['install'], opts), { exitCode: 0, stdout: `${now('0.5.0', c5)} previous: 0.4.0 (${c4}). ${LOADS}` })
  assert.equal(data.link('current'), `0.5.0-${c5}`)
  assert.equal(data.link('previous'), `0.4.0-${c4}`)
  assert.deepEqual(main(['rollback'], opts), { exitCode: 0, stdout: `${now('0.4.0', c4)} previous: 0.5.0 (${c5}). ${LOADS}` })
  assert.equal(data.link('current'), `0.4.0-${c4}`)
  assert.equal(data.link('previous'), `0.5.0-${c5}`)
  assert.deepEqual(main(['rollback'], opts), { exitCode: 0, stdout: `${now('0.5.0', c5)} previous: 0.4.0 (${c4}). ${LOADS}` })
  assert.deepEqual(data.entries(), [`0.4.0-${c4}`, `0.5.0-${c5}`, 'current', 'previous'])
})

test('installing the current version again changes nothing', (t) => {
  const repo = makeProject(t, ['0.4.0', '0.5.0'])
  const data = makeData(t)
  const opts = { env: data.env, repoDir: repo.dir }
  main(['install', '0.4.0'], opts)
  main(['install', '0.5.0'], opts)
  const c5 = repo.commits['0.5.0']
  assert.deepEqual(main(['install', '0.5.0'], opts), { exitCode: 0, stdout: `aether 0.5.0 (${c5}) is already current.\n` })
  assert.equal(data.link('current'), `0.5.0-${c5}`)
  assert.equal(data.link('previous'), `0.4.0-${repo.commits['0.4.0']}`)
})

test('a version directory that exists is reused as it is, never extracted again', (t) => {
  const repo = makeProject(t, ['0.4.0', '0.5.0'])
  const data = makeData(t)
  const opts = { env: data.env, repoDir: repo.dir }
  main(['install', '0.4.0'], opts)
  const marker = path.join(data.installed, `0.4.0-${repo.commits['0.4.0']}`, 'plugins', 'aether', 'marker')
  fs.writeFileSync(marker, 'left by a running session\n')
  main(['install', '0.5.0'], opts)
  assert.equal(main(['install', '0.4.0'], opts).exitCode, 0)
  assert.equal(data.link('current'), `0.4.0-${repo.commits['0.4.0']}`)
  assert.equal(fs.readFileSync(marker, 'utf8'), 'left by a running session\n')
})

test('a tag moved to another commit installs as a new directory beside the old one', (t) => {
  const repo = makeProject(t, ['0.5.0'])
  const data = makeData(t)
  const opts = { env: data.env, repoDir: repo.dir }
  const old = repo.commits['0.5.0']
  main(['install'], opts)
  write(repo.dir, 'plugins/aether/bin/aether-x', '#!/bin/sh\necho moved\n', 0o755)
  repo.git('commit', '-q', '-am', 'fix after the tag')
  repo.git('tag', '-f', '-a', 'aether--v0.5.0', '-m', 'moved')
  const moved = repo.git('rev-parse', 'HEAD').slice(0, 7)
  assert.deepEqual(main(['install'], opts), { exitCode: 0, stdout: `${now('0.5.0', moved)} previous: 0.5.0 (${old}). ${LOADS}` })
  assert.deepEqual(data.entries(), [`0.5.0-${moved}`, `0.5.0-${old}`, 'current', 'previous'].sort())
})

test('each refusal prints one line, exits 1, and leaves installed/ as it was', (t) => {
  const data = makeData(t)
  const bare = makeRepo(t, { prefix: 'aether install bare ' })
  assert.deepEqual(main(['install'], { env: data.env, repoDir: bare.dir }), { exitCode: 1, stdout: `no aether--v* tag in ${bare.dir}.\n` })
  assert.deepEqual(data.entries(), [])

  const repo = makeProject(t, ['0.6.9'])
  const opts = { env: data.env, repoDir: repo.dir }
  repo.git('tag', '-a', 'aether--v0.7.0', '-m', 'a tag whose manifest says 0.6.9')
  assert.deepEqual(main(['install'], opts), { exitCode: 1, stdout: 'aether--v0.7.0 holds plugin version 0.6.9, not 0.7.0.\n' })
  assert.deepEqual(data.entries(), [])
  assert.deepEqual(main(['install', '0.9.9'], opts), { exitCode: 1, stdout: 'no tag aether--v0.9.9.\n' })
  assert.deepEqual(main(['rollback'], opts), { exitCode: 1, stdout: 'no previous version to roll back to.\n' })

  const c = repo.commits['0.6.9']
  assert.equal(main(['install', '0.6.9'], opts).exitCode, 0)
  assert.deepEqual(main(['rollback'], opts), { exitCode: 1, stdout: 'no previous version to roll back to.\n' })
  assert.deepEqual(data.entries(), [`0.6.9-${c}`, 'current'])
})

test('a failed extraction leaves no partial directory and keeps the links', (t) => {
  const repo = makeProject(t, ['0.7.0'])
  const data = makeData(t)
  const opts = { env: data.env, repoDir: repo.dir }
  const c7 = repo.commits['0.7.0']
  main(['install'], opts)
  repo.git('rm', '-q', 'scripts/aether-mode.fish')
  write(repo.dir, 'plugins/aether/.claude-plugin/plugin.json', JSON.stringify({ name: 'aether', version: '0.8.0' }) + '\n')
  repo.git('commit', '-q', '-am', 'release 0.8.0 without a launcher')
  repo.git('tag', '-a', 'aether--v0.8.0', '-m', 'aether 0.8.0')
  const r = main(['install'], opts)
  assert.equal(r.exitCode, 1)
  assert.ok(r.stdout.startsWith('cannot extract aether--v0.8.0: '), r.stdout)
  assert.ok(r.stdout.endsWith('\n'))
  assert.deepEqual(data.entries(), [`0.7.0-${c7}`, 'current'])
  assert.equal(data.link('current'), `0.7.0-${c7}`)
})

test('status shows the current and the previous release and the latest tag', (t) => {
  const repo = makeProject(t, ['0.4.0', '0.5.0'])
  const data = makeData(t)
  const opts = { env: data.env, repoDir: repo.dir }
  const [c4, c5] = [repo.commits['0.4.0'], repo.commits['0.5.0']]
  assert.deepEqual(main(['status'], opts), { exitCode: 0, stdout: `current: none\nprevious: none\nlatest tag: 0.5.0 (${c5})\n` })
  main(['install', '0.4.0'], opts)
  main(['install', '0.5.0'], opts)
  assert.deepEqual(main(['status'], opts), { exitCode: 0, stdout: `current: 0.5.0 (${c5})\nprevious: 0.4.0 (${c4})\nlatest tag: 0.5.0 (${c5})\n` })
  fs.rmSync(path.join(data.installed, `0.4.0-${c4}`), { recursive: true })
  assert.deepEqual(main(['status'], opts), { exitCode: 0, stdout: `current: 0.5.0 (${c5})\nprevious: none\nlatest tag: 0.5.0 (${c5})\n` })
  assert.deepEqual(main(['rollback'], opts), { exitCode: 1, stdout: 'no previous version to roll back to.\n' })
})

test('any other arguments print the usage and exit 2, in the module and on the command line', (t) => {
  const data = makeData(t)
  const repo = makeProject(t, ['0.1.0'])
  const cases = [[], ['upgrade'], ['install', 'v0.1.0'], ['install', 'aether--v0.1.0'], ['install', '0.1'], ['install', '0.1.0', 'extra'], ['rollback', '0.1.0'], ['status', '--json']]
  for (const argv of cases) {
    assert.deepEqual(main(argv, { env: data.env, repoDir: repo.dir }), { exitCode: 2, stdout: USAGE }, argv.join(' '))
  }
  assert.deepEqual(data.entries(), [])
  const cli = spawnSync(process.execPath, [SCRIPT, 'upgrade'], { encoding: 'utf8', env: { ...process.env, ...data.env } })
  assert.equal(cli.status, 2)
  assert.equal(cli.stdout, USAGE)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/aether-install.test.js`
Expected: FAIL with `Cannot find module '../scripts/aether-install.js'`.

- [ ] **Step 3: Write `scripts/aether-install.js`** to the Interfaces, the Behavior and the output table above.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/aether-install.test.js && npm test`
Expected: PASS, with nothing else broken.

- [ ] **Step 5: Commit**

```bash
git add scripts/aether-install.js tests/aether-install.test.js
git commit -m "feat(aether): install a tagged release apart from the project, with rollback and status"
```

**Acceptance:** the ten tests pass, and `npm test` is green.

---

### Task 2: the launcher's `--dev`, the README, the decision and the version

**Aether:**
- Tier: haiku high — every file's text is given in full or as exact replacements, and the tests are given in full
- Review: xhigh — the owner's daily launcher: arguments, quoting and the `--dev` refusal, beyond what the tests list
- Area: launcher
- Owns: `scripts/aether-mode.fish`, `tests/launcher.test.js`, `README.md`, `docs/decisions.md`, `plugins/aether/.claude-plugin/plugin.json`
- Depends on: none

**Files:**
- Modify: `scripts/aether-mode.fish`, `README.md`, `docs/decisions.md`, `plugins/aether/.claude-plugin/plugin.json`
- Test: `tests/launcher.test.js`

**Interfaces:**
- Consumes: `PLUGIN` and `tempDir(t, prefix)` from `tests/helpers.js`. `tempDir` returns a real path, already resolved.
- Produces: the launcher text, version 0.6.0, and decision A26. The README names `node scripts/aether-install.js` and its three commands, which Task 1 builds. This task's tests do not run the installer: they lay the installed copy out by hand.

- [ ] **Step 1: Change `tests/launcher.test.js`.**
  1. Replace

     ```js
     const { PLUGIN } = require('./helpers.js')
     ```

     with

     ```js
     const { spawnSync } = require('node:child_process')
     const { PLUGIN, tempDir } = require('./helpers.js')
     ```

  2. In the test "the README shows the same launch for bash and zsh", replace the `LINE` constant with:

     ```js
       const LINE = `aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir "$(realpath ~/.local/share/aether-plugin/installed/current)/plugins/aether" --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }`
     ```

  3. Replace

     ```js
     test('the manifest is version 0.5.0 and names the Lead, the Designer, the lanes and the autonomy', () => {
       const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
       assert.equal(manifest.version, '0.5.0')
     ```

     with

     ```js
     test('the manifest is version 0.6.0 and names the Lead, the Designer, the lanes and the autonomy', () => {
       const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
       assert.equal(manifest.version, '0.6.0')
     ```

  4. Replace

     ```js
       assert.match(read('README.md'), /^Version 0\.5: /m)
     ```

     with

     ```js
       assert.match(read('README.md'), /^Version 0\.6: /m)
     ```

  5. Add at the end of the file:

     ```js
     test('the documents record the separation: the README, the decision and the launcher', () => {
       const readme = read('README.md')
       const texts = [
         'node scripts/aether-install.js install',
         'ln -sfn ~/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish ~/.config/fish/functions/aether-mode.fish',
         '`aether-mode --dev`',
         'The main checkout no longer feeds `aether-mode`',
         '### Release',
         'claude plugin tag plugins/aether',
         'docs/superpowers/specs/2026-10-09-separation-design.md',
       ]
       for (const text of texts) assert.ok(readme.includes(text), text)
       assert.ok(!readme.includes('ln -s (realpath scripts/aether-mode.fish)'))
       const decisions = read('docs', 'decisions.md')
       assert.match(decisions, /^\| A26 \|/m)
       assert.ok(decisions.includes('updated A8 and added A26.'))
       assert.ok(read('scripts', 'aether-mode.fish').includes('if test "$argv[1]" = --dev'))
     })

     const NO_FISH = spawnSync('fish', ['--version']).status === 0 ? false : 'fish is not installed'
     const FLAGS = ['--settings', '{"enableWorkflows": true}', '--model', 'sonnet', '--effort', 'xhigh']
     const FAKE_CLAUDE = '#!/usr/bin/env node\nconsole.log(JSON.stringify({ argv: process.argv.slice(2), advisor: process.env.CLAUDE_CODE_DISABLE_ADVISOR_TOOL }))\n'

     // An installed copy laid out as scripts/aether-install.js leaves it, a development tree, a fish
     // function directory that links the launcher through `current`, and a fake claude that prints
     // what it was given. The paths hold a space, as a data directory may.
     function layout(t) {
       const base = tempDir(t, 'aether launcher ')
       const installed = path.join(base, 'installed')
       const version = path.join(installed, '0.6.0-abcdef0')
       const dev = path.join(base, 'dev')
       const fn = path.join(base, 'fn')
       const bin = path.join(base, 'bin')
       for (const dir of [path.join(version, 'plugins', 'aether'), path.join(version, 'scripts'), path.join(dev, 'plugins', 'aether'), fn, bin]) {
         fs.mkdirSync(dir, { recursive: true })
       }
       fs.copyFileSync(path.join(ROOT, 'scripts', 'aether-mode.fish'), path.join(version, 'scripts', 'aether-mode.fish'))
       fs.symlinkSync(dev, path.join(version, 'dev-tree'))
       fs.symlinkSync('0.6.0-abcdef0', path.join(installed, 'current'))
       fs.symlinkSync(path.join(installed, 'current', 'scripts', 'aether-mode.fish'), path.join(fn, 'aether-mode.fish'))
       fs.writeFileSync(path.join(bin, 'claude'), FAKE_CLAUDE, { mode: 0o755 })
       return { version, dev, fn, bin }
     }

     // Runs `aether-mode <args>` in a fish without the user's configuration, which finds the
     // function in `fn` and claude in `bin`. Returns the status, stderr, and what claude printed.
     function aetherMode({ fn, bin }, args) {
       const script = 'set -g fish_function_path $argv[1] $fish_function_path; set -gx PATH $argv[2] $PATH; aether-mode $argv[3..-1]'
       const r = spawnSync('fish', ['--no-config', '-c', script, fn, bin, ...args], { encoding: 'utf8' })
       if (r.error) throw r.error
       return { status: r.status, stderr: r.stderr, claude: r.stdout.trim() === '' ? null : JSON.parse(r.stdout) }
     }

     test('aether-mode loads the installed release that current names, resolved, with the same flags', { skip: NO_FISH }, (t) => {
       const l = layout(t)
       const r = aetherMode(l, ['-p', 'hello world'])
       assert.equal(r.status, 0)
       assert.deepEqual(r.claude, { argv: ['--plugin-dir', path.join(l.version, 'plugins', 'aether'), ...FLAGS, '-p', 'hello world'], advisor: '1' })
     })

     test('aether-mode --dev loads the tree that dev-tree names, and passes the rest on', { skip: NO_FISH }, (t) => {
       const l = layout(t)
       const r = aetherMode(l, ['--dev', '-p', 'hi'])
       assert.equal(r.status, 0)
       assert.deepEqual(r.claude.argv, ['--plugin-dir', path.join(l.dev, 'plugins', 'aether'), ...FLAGS, '-p', 'hi'])
     })

     test('--dev counts only as the first argument', { skip: NO_FISH }, (t) => {
       const l = layout(t)
       assert.deepEqual(aetherMode(l, ['-p', '--dev']).claude.argv, ['--plugin-dir', path.join(l.version, 'plugins', 'aether'), ...FLAGS, '-p', '--dev'])
     })

     test('aether-mode --dev refuses a development tree that is gone, and never falls back to the release', { skip: NO_FISH }, (t) => {
       const l = layout(t)
       fs.rmSync(l.dev, { recursive: true })
       const r = aetherMode(l, ['--dev', '-p', 'hi'])
       assert.equal(r.status, 1)
       assert.equal(r.claude, null)
       assert.match(r.stderr, /^aether-mode: the development tree that .*dev-tree points to is gone$/m)
     })

     test('run from the repository, aether-mode loads its plugins/aether, with or without --dev', { skip: NO_FISH }, (t) => {
       const l = layout(t)
       fs.rmSync(path.join(l.fn, 'aether-mode.fish'))
       fs.symlinkSync(path.join(ROOT, 'scripts', 'aether-mode.fish'), path.join(l.fn, 'aether-mode.fish'))
       const plugin = path.join(fs.realpathSync(ROOT), 'plugins', 'aether')
       assert.deepEqual(aetherMode(l, ['x']).claude.argv, ['--plugin-dir', plugin, ...FLAGS, 'x'])
       assert.deepEqual(aetherMode(l, ['--dev', 'x']).claude.argv, ['--plugin-dir', plugin, ...FLAGS, 'x'])
     })
     ```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/launcher.test.js`
Expected: FAIL: the version (`0.5.0`), the README line, the separation documents, and the `--dev` tests (`--dev` reaches `claude`).

- [ ] **Step 3: Replace `scripts/aether-mode.fish`** with exactly:

```fish
# Aether mode: Claude Code with the aether plugin and dynamic workflows.
# Install the latest release, then link this function from the installed copy:
#   node scripts/aether-install.js install
#   ln -sfn ~/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish ~/.config/fish/functions/aether-mode.fish
# aether-mode --dev loads the repository's development tree instead of the installed release.
function aether-mode --description 'Claude Code in Aether mode'
    set -l repo (path dirname (path dirname (realpath (functions --details aether-mode))))
    if test "$argv[1]" = --dev
        set -e argv[1]
        if test -L $repo/dev-tree
            set -l tree (realpath $repo/dev-tree 2>/dev/null)
            if not test -d "$tree/plugins/aether"
                echo "aether-mode: the development tree that $repo/dev-tree points to is gone" >&2
                return 1
            end
            set repo $tree
        end
    end
    env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv
end
```

- [ ] **Step 4: In `plugins/aether/.claude-plugin/plugin.json`,** set `"version": "0.6.0"`. Change nothing else in that file.

- [ ] **Step 5: Change `README.md`** with these exact replacements.
  1. Replace

     ```text
     Version 0.5: the Lead on Sonnet holds the conversation and decides as the owner's delegate, the Designer on Opus writes specs and plans, each plan task sets its implementer's effort, and lanes run the swarm's calls and the Designer's rounds on other coding plans while their quota lasts. With the owner's permission, the Lead works for hours within ceilings of time and cost and ends with a brief, and it never asks again for what the owner authorized ([autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md)).
     ```

     with

     ```text
     Version 0.6: the Lead on Sonnet holds the conversation and decides as the owner's delegate, the Designer on Opus writes specs and plans, each plan task sets its implementer's effort, and lanes run the swarm's calls and the Designer's rounds on other coding plans while their quota lasts. With the owner's permission, the Lead works for hours within ceilings of time and cost and ends with a brief, and it never asks again for what the owner authorized ([autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md)). The copy the owner runs is an installed release, apart from the project: work on the plugin never changes it until the next install ([separation spec](docs/superpowers/specs/2026-10-09-separation-design.md)).
     ```

  2. Replace this block (from `Aether mode is chosen per session.` through the bash line):

     ```text
     Aether mode is chosen per session. `aether-mode` loads the plugin, turns on dynamic workflows, starts the Lead on Sonnet at `xhigh`, and turns the advisor tool off. `claude` stays in normal mode.

     In fish:

         ln -s (realpath scripts/aether-mode.fish) ~/.config/fish/functions/aether-mode.fish

     In bash or zsh:

         aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir /path/to/aether-plugin/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }
     ```

     with

     ```text
     Aether mode is chosen per session. `aether-mode` loads the installed release of the plugin, turns on dynamic workflows, starts the Lead on Sonnet at `xhigh`, and turns the advisor tool off. `claude` stays in normal mode.

     The copy you run is a release, installed apart from the project: work in the repository, merges to `main` included, never changes it until you install another release. From a clone, install the latest release from its tags, with no network, then link the launcher from the installed copy. In fish:

         node scripts/aether-install.js install
         ln -sfn ~/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish ~/.config/fish/functions/aether-mode.fish

     In bash or zsh, after the same `install`:

         aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir "$(realpath ~/.local/share/aether-plugin/installed/current)/plugins/aether" --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }

     `node scripts/aether-install.js` has three commands:
     - `install [<version>]` installs the release tagged `aether--v<version>`, or the latest one, and makes it current. The release that was current becomes the previous one. The next `aether-mode` session loads it; a running session keeps the release it started with.
     - `rollback` swaps the current and the previous release.
     - `status` shows the current and the previous release, and the latest tag.

     `aether-mode --dev`, in fish, loads the repository's development tree instead of the installed release, to try the plugin itself on purpose.
     ```

  3. Replace

     ```text
     - `runs.jsonl` holds one record per finalized or abandoned run.
     ```

     with

     ```text
     - `runs.jsonl` holds one record per finalized or abandoned run;
     - `installed/` holds the installed releases, one directory per version, and the `current` and `previous` links;
     - `.env` holds the Artificial Analysis API key that `scripts/refresh-lanes.js` reads when `ARTIFICIAL_ANALYSIS_API_KEY` is not set.
     ```

  4. Replace

     ```text
     The plugin is `plugins/aether/`; nothing outside it is loaded. To try a change, point `--plugin-dir` at a worktree's `plugins/aether`.
     ```

     with

     ```text
     The plugin is `plugins/aether/`; nothing outside it is loaded. The main checkout no longer feeds `aether-mode`: a session loads the installed release, and the `bin/` on its `PATH` is that release's. To try a branch, run its bins by path (`node <worktree>/plugins/aether/bin/aether-plan check <plan>`), point `--plugin-dir` at the worktree's `plugins/aether`, or start the session with `aether-mode --dev`, which loads the main checkout.
     ```

  5. Right after the line `Node.js 22 with no dependencies. The workflow's tests run its script in a harness with stubbed agents, so they spend no tokens.`, insert a blank line and:

     ```text
     ### Release

     A release reaches `aether-mode` only when it is installed:
     1. bump `"version"` in `plugins/aether/.claude-plugin/plugin.json`;
     2. run `npm run check`;
     3. merge to `main`;
     4. in the main checkout, run `claude plugin tag plugins/aether`, which creates the tag `aether--v<version>`;
     5. run `node scripts/aether-install.js install`.

     `node scripts/aether-install.js rollback` goes back to the previous release. If the script cannot run, swap the links by hand: in `~/.local/share/aether-plugin/installed/`, point `current` at the directory `previous` names, and `previous` at the one `current` named.
     ```

- [ ] **Step 6: Change `docs/decisions.md`** with these exact edits.
  1. In the opening paragraph, replace `and added A23–A25. Each decision has a status:` with `and added A23–A25. The [separation spec](superpowers/specs/2026-10-09-separation-design.md) of 2026-10-09 updated A8 and added A26. Each decision has a status:`.
  2. In the A8 row, replace `| Decided; built; updated by A11–A16 (2026-10-08) |` with `| Decided; built; updated by A11–A16 (2026-10-08) and by A26 (2026-10-09): it loads the installed release |`.
  3. Add this row right after the A25 row, at the end of the file:

     ```text
     | A26 | **The installed release.** `aether-mode` loads a release installed apart from the project. `scripts/aether-install.js` extracts a tagged version from the local clone, with no network, into `installed/<version>-<commit>/` in the data directory, launcher included, and keeps `current` and `previous` links. Work on the project, merges to `main` included, never changes what the owner runs until the next install; `rollback` swaps the two links, and `aether-mode --dev` loads the development tree on purpose. The Artificial Analysis key lives in the data directory. `.aether/` stays in the main checkout of each project Aether works on. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-separation-design.md) |
     ```

- [ ] **Step 7: Run the tests**

Run: `node --test tests/launcher.test.js && npm test`
Expected: PASS. Where fish is missing, the five fish tests show as skipped.

- [ ] **Step 8: Commit**

```bash
git add scripts/aether-mode.fish tests/launcher.test.js README.md docs/decisions.md plugins/aether/.claude-plugin/plugin.json
git commit -m "feat(aether): load the installed release, add aether-mode --dev, and release 0.6.0"
```

**Acceptance:** the tests pass, the launcher's `claude` line is byte-identical to Global Constraints, and `claude plugin validate plugins/aether --strict` passes.

---

### Task 3: `refresh-lanes.js` reads the key from the data directory

**Aether:**
- Tier: haiku high — a path change that exact tests pin
- Area: tooling
- Owns: `scripts/refresh-lanes.js`, `tests/refresh-lanes.test.js`
- Depends on: none

**Files:**
- Modify: `scripts/refresh-lanes.js`
- Test: `tests/refresh-lanes.test.js`

**Interfaces:**
- Consumes: nothing new. Drop the `require` of `plugins/aether/lib/git.js`.
- Produces: `module.exports = { refresh, keyFrom, keyFile, main }`, where
  - `keyFile(env: object): string` returns `path.join(env.AETHER_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'aether-plugin'), '.env')`;
  - `main(argv, { env = process.env, fetch, now, envFile } = {})` keeps its signature. When `envFile` is `undefined` and `env` has no key, it reads `keyFile(env)`, and a missing file counts as no key. When no key is found, it returns exit code 1 and this stdout, where `<file>` is `keyFile(env)`, followed by a newline:

    ```text
    ARTIFICIAL_ANALYSIS_API_KEY is not set, and <file> does not have it.
    ```

  - The header comment says: `The API key comes from ARTIFICIAL_ANALYSIS_API_KEY, or else from .env in the data directory (AETHER_DATA_DIR, or ~/.local/share/aether-plugin), and is never printed.`
  - No comment or code may name the repository's checkout any more.

- [ ] **Step 1: Change `tests/refresh-lanes.test.js`.**
  1. Replace

     ```js
     const path = require('node:path')
     const { tempDir } = require('./helpers.js')
     const { refresh, keyFrom, main } = require('../scripts/refresh-lanes.js')
     ```

     with

     ```js
     const os = require('node:os')
     const path = require('node:path')
     const { tempDir } = require('./helpers.js')
     const { refresh, keyFrom, keyFile, main } = require('../scripts/refresh-lanes.js')
     ```

  2. Replace

     ```js
       const none = await main(['--config', file], { env: {}, fetch, now: NOW, envFile: null })
       assert.deepEqual(none, { exitCode: 1, stdout: "ARTIFICIAL_ANALYSIS_API_KEY is not set, and the main checkout's .env does not have it.\n" })
     ```

     with

     ```js
       const empty = tempDir(t, 'aether refresh data ')
       const none = await main(['--config', file], { env: { AETHER_DATA_DIR: empty }, fetch, now: NOW })
       assert.deepEqual(none, { exitCode: 1, stdout: `ARTIFICIAL_ANALYSIS_API_KEY is not set, and ${path.join(empty, '.env')} does not have it.\n` })
     ```

  3. Add at the end of the file:

     ```js
     test('keyFile is .env in the data directory: AETHER_DATA_DIR, or else ~/.local/share/aether-plugin', () => {
       assert.equal(keyFile({ AETHER_DATA_DIR: '/data/aether' }), path.join('/data/aether', '.env'))
       assert.equal(keyFile({}), path.join(os.homedir(), '.local', 'share', 'aether-plugin', '.env'))
     })

     test('main reads the key from the data directory when the environment has none, and never prints it', async (t) => {
       const file = path.join(tempDir(t), 'lanes.json')
       fs.writeFileSync(file, JSON.stringify(CONFIG))
       const data = tempDir(t, 'aether refresh data ')
       fs.writeFileSync(path.join(data, '.env'), '# Artificial Analysis\nARTIFICIAL_ANALYSIS_API_KEY="from-data-dir"\n', { mode: 0o600 })
       const seen = []
       const fetch = async (url, init) => {
         seen.push(init.headers['x-api-key'])
         return { ok: true, status: 200, json: async () => ({ data: AA }) }
       }
       const r = await main(['--config', file], { env: { AETHER_DATA_DIR: data }, fetch, now: NOW })
       assert.equal(r.exitCode, 0)
       assert.deepEqual(seen, ['from-data-dir'])
       assert.equal(r.stdout.includes('from-data-dir'), false)
     })

     test('the script no longer looks in the repository for the key', () => {
       const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'refresh-lanes.js'), 'utf8')
       assert.doesNotMatch(source, /repoPaths|mainRoot|main checkout/)
     })
     ```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/refresh-lanes.test.js`
Expected: FAIL: `keyFile` is not a function, and the message names the main checkout.

- [ ] **Step 3: Change `scripts/refresh-lanes.js`** to the Interfaces above.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/refresh-lanes.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-lanes.js tests/refresh-lanes.test.js
git commit -m "fix(aether): read the Artificial Analysis key from the data directory"
```

**Acceptance:** the tests pass, and the script reads no file inside the repository but the lane table it is given.

---

## After the swarm

The Lead runs this in order, with no question to the owner (spec §9). Each step gives its commands, the check that must pass before the next step, and its undo. The owner's fish link is switched only after M1 and M2's fake-`claude` check pass. Record each result in the run's diary.

**Every block starts with these lines.** The Bash tool keeps no variables between calls.

```bash
WT=<the integration worktree>                             # the path `git worktree list` shows for the integration branch
S=<the session's scratchpad>/separation                   # a fresh directory of the Lead's own
REPO=$(dirname "$(git -C "$WT" rev-parse --path-format=absolute --git-common-dir)")
DATA=$HOME/.local/share/aether-plugin
FN=$HOME/.config/fish/functions/aether-mode.fish
```

### F. Facts to re-check before the migration

```bash
readlink "$FN"                                         # F1: $REPO/scripts/aether-mode.fish
ls -la "$DATA/installed" 2>&1 | head -3                # F2: No such file or directory
for f in "$REPO/.env" "$DATA/.env"; do test -f "$f" && echo "key at $f"; done   # F3: key at $REPO/.env, only
echo "${AETHER_DATA_DIR:-unset}"                       # F4: unset
git -C "$REPO" branch --show-current; git -C "$REPO" status --porcelain; git -C "$REPO" rev-parse --short 'aether--v0.5.0^{commit}'
                                                       # F5: main, nothing listed, 4130f86
fish --version; claude --version                       # F6: fish 4.x; Claude Code 2.1.294 or later
```

If a fact differs, part of the migration has already run. If F1 points into `$DATA/installed/`, M2's switch is done. If F2 lists `current`, run `env -u AETHER_DATA_DIR node "$WT/scripts/aether-install.js" status`, and resume at the first step whose check fails. If F3 finds the key in `$DATA`, M4 is done. If F4 is set, prefix every real step with `env -u AETHER_DATA_DIR`, as the blocks below already do.

### M0. The branch passes

```bash
cd "$WT" && npm run check
```

Check: the tests, `claude plugin test` and `claude plugin validate --strict` all pass. Undo: nothing to undo.

### M1. Rehearsal: temporary folders, a fake `claude`, no tokens

```bash
rm -rf "$S"; mkdir -p "$S/bin" "$S/fn"
printf '#!/usr/bin/env node\nconsole.log(JSON.stringify({ argv: process.argv.slice(2), advisor: process.env.CLAUDE_CODE_DISABLE_ADVISOR_TOOL }))\n' > "$S/bin/claude"; chmod +x "$S/bin/claude"
git clone -q --no-hardlinks "$REPO" "$S/clone"     # --no-hardlinks: the scratchpad is on another filesystem, where --local fails
git -C "$S/clone" switch -q -c rehearsal "origin/$(git -C "$WT" branch --show-current)"
git -C "$S/clone" -c tag.gpgsign=false tag -a aether--v0.6.0 -m rehearsal
export AETHER_DATA_DIR="$S/data"
inst() { node "$S/clone/scripts/aether-install.js" "$@"; }
run() { fish --no-config -c 'set -g fish_function_path $argv[1] $fish_function_path; set -gx PATH $argv[2] $PATH; aether-mode $argv[3..-1]' "$S/fn" "$S/bin" "$@"; }
inst install 0.5.0          # aether 0.5.0 (4130f86) is now current; previous: none. It loads in the next aether-mode session.
inst install                # aether 0.6.0 (<c>) is now current; previous: 0.5.0 (4130f86). It loads in the next aether-mode session.
ln -s "$S/data/installed/current/scripts/aether-mode.fish" "$S/fn/aether-mode.fish"
run -p hi                   # {"argv":["--plugin-dir","<S>/data/installed/0.6.0-<c>/plugins/aether","--settings","{\"enableWorkflows\": true}","--model","sonnet","--effort","xhigh","-p","hi"],"advisor":"1"}
run --dev -p hi             # the same, with --plugin-dir <S>/clone/plugins/aether
inst rollback; run -p hi    # 0.5.0 is now current; --plugin-dir <S>/data/installed/0.5.0-4130f86/plugins/aether
inst rollback; inst status  # current: 0.6.0 (<c>) / previous: 0.5.0 (4130f86) / latest tag: 0.6.0 (<c>)
P="$(realpath "$S/data/installed/current")/plugins/aether"
claude plugin validate "$P" --strict                                              # ✔ Validation passed
cd "$S" && CLAUDE_PLUGIN_ROOT="$P" node "$P/bin/aether-session-start" < /dev/null | head -c 60   # {"hookSpecificOutput":{"hookEventName":"SessionStart"
```

The hook runs from `$S`, which is not a repository, so its sweep touches no repository.

Check: every line prints what its comment says. Undo: `rm -rf "$S"`; nothing of the owner's was touched.

### M2. Pin the owner to 0.5.0, before the merge

```bash
env -u AETHER_DATA_DIR node "$WT/scripts/aether-install.js" install 0.5.0
    # aether 0.5.0 (4130f86) is now current; previous: none. It loads in the next aether-mode session.
mkdir -p "$S/fn-real" && ln -sfn "$DATA/installed/current/scripts/aether-mode.fish" "$S/fn-real/aether-mode.fish"
fish --no-config -c 'set -g fish_function_path $argv[1] $fish_function_path; set -gx PATH $argv[2] $PATH; aether-mode $argv[3..-1]' "$S/fn-real" "$S/bin" -p hi
    # --plugin-dir $HOME/.local/share/aether-plugin/installed/0.5.0-4130f86/plugins/aether, the same flags, -p hi, advisor "1"
claude plugin validate "$DATA/installed/0.5.0-4130f86/plugins/aether" --strict   # ✔ Validation passed
```

Only when those pass, switch:

```bash
ln -sfn "$DATA/installed/current/scripts/aether-mode.fish" "$FN"
readlink "$FN"                                                                    # $DATA/installed/current/scripts/aether-mode.fish
fish -c 'functions --details aether-mode'                                         # $FN
fish -c 'set -gx PATH $argv[1] $PATH; aether-mode $argv[2..-1]' "$S/bin" -p hi    # --plugin-dir …/installed/0.5.0-4130f86/plugins/aether, the same flags
```

Check: the owner's own function, with the fake `claude` first on `PATH`, loads the installed 0.5.0. Behavior is identical to today: 0.5.0 is today's `main`.

Undo: `ln -sfn "$REPO/scripts/aether-mode.fish" "$FN"`. Until M5, 0.5.0's launcher has no `--dev`; to load the development tree in that window, run `claude --plugin-dir "$REPO/plugins/aether" …` directly.

### M3. Merge to `main`

Run `aether-autonomy check merge-main` (the owner authorized merges to `main` in this session). Note `git -C "$REPO" rev-parse main` in the diary. Then merge the integration branch (`git -C "$WT" branch --show-current`) into `main` the way this repository does (superpowers finishing-a-development-branch).

```bash
git -C "$REPO" log -1 --oneline main                                              # the merge
cd "$REPO" && npm test                                                            # pass
fish -c 'set -gx PATH $argv[1] $PATH; aether-mode $argv[2..-1]' "$S/bin" -p hi    # still …/installed/0.5.0-4130f86/plugins/aether
```

Check: `main` moved and the owner's launcher did not. This is the first proof of C1.

Undo: before any push, `git -C "$REPO" reset --hard <the main noted in the diary>`. The owner's launcher is unaffected either way.

### M4. Move the key to the data directory

```bash
test -e "$DATA/.env" && echo "STOP: $DATA/.env exists" || mv "$REPO/.env" "$DATA/.env"
stat -c '%a' "$DATA/.env"                                                         # 600
grep -c '^ARTIFICIAL_ANALYSIS_API_KEY=' "$DATA/.env"                              # 1
test ! -e "$REPO/.env" && echo "gone from the repository"
env -u AETHER_DATA_DIR node -e 'const r = require(process.argv[1]); const fs = require("node:fs"); console.log(r.keyFrom({}, fs.readFileSync(r.keyFile(process.env), "utf8")) ? "found" : "missing")' "$REPO/scripts/refresh-lanes.js"   # found
```

Check: as the comments say. Never print the key. Leave the `/.env` line in `.git/info/exclude`.

Undo: `mv "$DATA/.env" "$REPO/.env"`. This is only useful with a `refresh-lanes.js` older than this change.

### M5. Release 0.6.0 and install it

```bash
cd "$REPO" && claude plugin tag plugins/aether
git -C "$REPO" tag --list 'aether--v0.6.0'                                       # aether--v0.6.0
git -C "$REPO" rev-parse 'aether--v0.6.0^{commit}' main                          # the same commit, twice
```

If the command failed, or named another tag: `git -C "$REPO" tag -a aether--v0.6.0 -m 'aether 0.6.0'`.

```bash
env -u AETHER_DATA_DIR node "$REPO/scripts/aether-install.js" install
    # aether 0.6.0 (<c>) is now current; previous: 0.5.0 (4130f86). It loads in the next aether-mode session.
env -u AETHER_DATA_DIR node "$REPO/scripts/aether-install.js" status
    # current: 0.6.0 (<c>) / previous: 0.5.0 (4130f86) / latest tag: 0.6.0 (<c>)
fish -c 'set -gx PATH $argv[1] $PATH; aether-mode $argv[2..-1]' "$S/bin" -p hi         # …/installed/0.6.0-<c>/plugins/aether
fish -c 'set -gx PATH $argv[1] $PATH; aether-mode $argv[2..-1]' "$S/bin" --dev -p hi   # $REPO/plugins/aether
claude plugin validate "$(realpath "$DATA/installed/current")/plugins/aether" --strict  # ✔ Validation passed
```

Check: as the comments say.

Undo: `env -u AETHER_DATA_DIR node "$REPO/scripts/aether-install.js" rollback`, which goes back to 0.5.0. If the tag was not pushed, also `git -C "$REPO" tag -d aether--v0.6.0`.

### M6. Close

- `rm -rf "$S"`.
- Push `main` and `aether--v0.6.0` only under a standing authorization (`aether-autonomy check push`). None of the steps above needs it.
- Update the Lead's memory notes:
  - `aether-plugin-location`: `aether-mode` loads the installed release; the release procedure below; `--dev`; the main checkout no longer feeds the owner's tool.
  - `artificial-analysis-api`: the key is in `~/.local/share/aether-plugin/.env`; source it from there.
- In the brief, tell the owner two things:
  - `.aether/` stays in each project, which differs from the earlier wording "las corridas dejan de vivir junto al codigo";
  - the first session of a new version may ask once to trust its plugin directory, and that is not a failure.

### The release procedure, from now on

1. Bump `"version"` in `plugins/aether/.claude-plugin/plugin.json`, and with it the version in `tests/launcher.test.js` and the README's status line.
2. `npm run check`.
3. Merge to `main`.
4. In the main checkout, run `claude plugin tag plugins/aether`. Fall back to `git tag -a aether--v<version> -m 'aether <version>'`.
5. `node scripts/aether-install.js install`, then `status`. A running session keeps its release; the next `aether-mode` loads the new one. To go back: `rollback`.
