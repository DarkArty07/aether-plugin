'use strict'

// Spec 024 R10 and R11: aether-doctor checks that Aether can run (Claude Code, Node, git, the installed release, the
// command that starts Aether mode, dynamic workflows, the other harnesses and the folder), writes nothing, and says how to
// fix what cannot; the skill doctor has Claude run it and report. The checks run in lib/doctor.js over an injected
// environment, working directory and command runner, so nothing here needs the network, a model or the real `claude`.
// The bin tests run it with stub `claude` and `git` scripts on a PATH of their own, and HOME and CLAUDE_CONFIG_DIR in
// throwaway directories.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const doctor = require('../plugins/aether/lib/doctor.js')

const ROOT = path.join(__dirname, '..')
const BIN = path.join(ROOT, 'plugins', 'aether', 'bin', 'aether-doctor')
const MARKER = '# aether-first-setup stub'
const IDS = ['claude', 'node', 'git', 'aether', 'command', 'workflows', 'harnesses', 'project']
const KEYS = ['checks', 'command', 'harnesses', 'installed', 'ok', 'options', 'version']
const STATUSES = ['ok', 'info', 'warn', 'error']
const INSTALL_FIX = 'claude plugin install aether --marketplace DarkArty07/aether-plugin'

// Five fresh directories: a home, a config dir, the project (the working directory), and two for the PATH.
function sandbox(t) {
  const root = tempDir(t, 'aether-doctor-')
  const make = (...parts) => {
    const dir = path.join(root, ...parts)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }
  const home = make('home')
  return { root, home, config: make('config'), project: make('project'), bin: make('bin'), other: make('other'), local: make('home', '.local', 'bin') }
}

function put(dir, name, text, mode = 0o755) {
  const file = path.join(dir, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text, { mode })
  fs.chmodSync(file, mode)
  return file
}

const stub = (extra = '') => `#!/bin/sh\n${MARKER}\n${extra}`

function addRelease(config, version, market = 'aether-plugin') {
  const launcher = path.join(config, 'plugins', 'cache', market, 'aether', version, 'launcher', 'aether-lead')
  put(path.dirname(launcher), 'aether-lead', '#!/bin/sh\nexit 0\n')
  return launcher
}

const settings = (dir, name, value) => put(dir, name, typeof value === 'string' ? value : JSON.stringify(value), 0o644)

// A runner of commands that answers like claude and git, and records what it was asked.
function fakeExec({ claude = '2.1.316 (Claude Code)', git = 'git version 2.43.0', repo = true } = {}) {
  const calls = []
  const exec = (command, args) => {
    calls.push([command, ...args])
    const answer = command === 'claude' ? claude : git
    if (command === 'git' && args.includes('rev-parse')) return repo ? { status: 0, stdout: 'true\n' } : { status: 128, stdout: '' }
    if (answer instanceof Error) throw answer
    if (answer === null) return { status: null, stdout: '' }
    if (typeof answer === 'number') return { status: answer, stdout: '' }
    return { status: 0, stdout: `${answer}\n` }
  }
  exec.calls = calls
  return exec
}

// The report of run() for a sandbox: its own HOME, CLAUDE_CONFIG_DIR and PATH (an empty directory), its project as the
// working directory, a good claude and git, and Node 22.
function report(box, { env = {}, exec = fakeExec(), nodeVersion = '22.4.0', name, cwd = box.project } = {}) {
  const full = { HOME: box.home, CLAUDE_CONFIG_DIR: box.config, PATH: box.bin, ...env }
  for (const key of Object.keys(full)) if (full[key] === undefined) delete full[key]
  return doctor.run({ ...(name === undefined ? {} : { name }), env: full, cwd, exec, nodeVersion })
}

const byId = (r, id) => r.checks.find((entry) => entry.id === id)

// Runs the bin with HOME, CLAUDE_CONFIG_DIR and PATH, and nothing else of the test runner's environment.
function bin(box, args, { pathDirs = [box.bin], cwd = box.project, env = {} } = {}) {
  const full = { HOME: box.home, CLAUDE_CONFIG_DIR: box.config, PATH: pathDirs.join(path.delimiter), ...env }
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: full })
  assert.equal(r.error, undefined)
  let json = null
  try {
    json = JSON.parse(r.stdout)
  } catch {
    json = null
  }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

// The stubs of `claude` and `git` that the bin finds on its PATH.
function stubTools(box, { claude = '2.1.316 (Claude Code)', git = '2.43.0' } = {}) {
  if (claude !== null) put(box.bin, 'claude', `#!/bin/sh\necho "${claude}"\n`)
  if (git !== null) put(box.bin, 'git', `#!/bin/sh\ncase "$*" in\n  *--version*) echo "git version ${git}" ;;\n  *rev-parse*) echo true ;;\n  *) exit 1 ;;\nesac\n`)
}

// A copy of everything in a tree that a write would change: names, kinds, modes, times, contents and link targets.
function snapshot(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, entry)
      const stat = fs.lstatSync(full)
      const relative = path.relative(root, full)
      if (stat.isSymbolicLink()) out.push(`${relative} link ${fs.readlinkSync(full)}`)
      else if (stat.isDirectory()) {
        out.push(`${relative} dir ${stat.mode} ${stat.mtimeMs}`)
        walk(full)
      } else out.push(`${relative} file ${stat.mode} ${stat.mtimeMs} ${fs.readFileSync(full).toString('base64')}`)
    }
  }
  walk(root)
  return out
}

// ---- the report
test('the report is one object with ok, version, installed, harnesses, options, command and the checks in order', (t) => {
  const box = sandbox(t)
  const r = report(box)
  assert.deepEqual(Object.keys(r).sort(), KEYS)
  assert.deepEqual(r.checks.map((entry) => entry.id), IDS)
  for (const entry of r.checks) {
    assert.deepEqual(Object.keys(entry).sort(), ['detail', 'fix', 'id', 'status'])
    assert.ok(STATUSES.includes(entry.status), `${entry.id}: ${entry.status}`)
    assert.equal(typeof entry.detail, 'string')
    assert.ok(entry.detail.length > 0)
    assert.ok(entry.fix === null || (typeof entry.fix === 'string' && entry.fix.length > 0), entry.id)
  }
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'aether', '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(r.version, plugin.version, "version is this plugin's own")
  assert.equal(r.installed, null)
  assert.deepEqual(r.harnesses, [])
  assert.equal(r.options, null)
  assert.deepEqual(Object.keys(r.command).sort(), ['name', 'onPath', 'own', 'path'])
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r, 'it is plain JSON')
})

test('ok is true when no check is an error, with warnings and notes allowed, and false when one is', (t) => {
  const box = sandbox(t)
  const warned = report(box)
  assert.ok(warned.checks.some((entry) => entry.status === 'warn'), 'a bare machine has warnings')
  assert.ok(!warned.checks.some((entry) => entry.status === 'error'))
  assert.equal(warned.ok, true)
  const failed = report(box, { exec: fakeExec({ claude: null }) })
  assert.equal(byId(failed, 'claude').status, 'error')
  assert.equal(failed.ok, false)
})

test('a fully set up machine has no problem: every check is ok or info', (t) => {
  const box = sandbox(t)
  addRelease(box.config, '0.29.0')
  put(box.local, 'aeth', stub())
  put(box.other, 'codex', '#!/bin/sh\n')
  settings(box.config, 'settings.json', { enableWorkflows: true })
  const r = report(box, { env: { PATH: [box.bin, box.local, box.other].join(path.delimiter) } })
  assert.deepEqual(r.checks.map((entry) => `${entry.id} ${entry.status}`), [
    'claude ok', 'node ok', 'git ok', 'aether ok', 'command ok', 'workflows ok', 'harnesses info', 'project ok',
  ])
  assert.equal(r.installed, '0.29.0')
  assert.deepEqual(r.harnesses, ['codex'])
  assert.deepEqual(r.command, { name: 'aeth', path: path.join(box.local, 'aeth'), own: true, onPath: true })
})

// ---- claude
test('claude: 2.1.294 and newer are ok, whatever else the version line says', (t) => {
  const box = sandbox(t)
  for (const [line, version] of [['2.1.294', '2.1.294'], ['2.1.316 (Claude Code)', '2.1.316'], ['Claude Code v2.2.0', '2.2.0'], ['2.1.1000', '2.1.1000'], ['3.0.0', '3.0.0']]) {
    const entry = byId(report(box, { exec: fakeExec({ claude: line }) }), 'claude')
    assert.equal(entry.status, 'ok', line)
    assert.ok(entry.detail.includes(version), entry.detail)
    assert.equal(entry.fix, null)
  }
})

test('claude: older than 2.1.294 is an error with the update as the fix', (t) => {
  const box = sandbox(t)
  for (const line of ['2.1.293', '2.0.999', '1.9.9', '2.1.9 (Claude Code)']) {
    const entry = byId(report(box, { exec: fakeExec({ claude: line }) }), 'claude')
    assert.equal(entry.status, 'error', line)
    assert.ok(entry.detail.includes(line.split(' ')[0]) && entry.detail.includes('2.1.294'), entry.detail)
    assert.equal(entry.fix, 'claude update')
  }
})

test('claude: not found is an error, however the runner says it: no status, a non-zero status, or a throw', (t) => {
  const box = sandbox(t)
  const missing = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })
  for (const claude of [null, 127, 1, missing]) {
    const entry = byId(report(box, { exec: fakeExec({ claude }) }), 'claude')
    assert.equal(entry.status, 'error', String(claude))
    assert.ok(entry.detail.includes('not found'), entry.detail)
    assert.ok(entry.fix && entry.fix.includes('Install Claude Code'), entry.fix)
  }
  // It ran but printed no version: also an error, with the same update as the fix.
  const blank = byId(report(box, { exec: fakeExec({ claude: 'hello' }) }), 'claude')
  assert.equal(blank.status, 'error')
  assert.equal(blank.fix, 'claude update')
})

test('claude and git are asked for their version, with arguments and no shell string', (t) => {
  const box = sandbox(t)
  const exec = fakeExec()
  report(box, { exec })
  assert.deepEqual(exec.calls[0], ['claude', '--version'])
  assert.deepEqual(exec.calls[1], ['git', '--version'])
  for (const call of exec.calls) assert.ok(!/\s/.test(call[0]), `the command is a name, not a line: ${call[0]}`)
})

// ---- node
test('node: 22 and newer are ok, older is an error that says what to install', (t) => {
  const box = sandbox(t)
  for (const version of ['22.0.0', '22.4.1', '24.1.0', '30.0.0']) {
    const entry = byId(report(box, { nodeVersion: version }), 'node')
    assert.equal(entry.status, 'ok', version)
    assert.ok(entry.detail.includes(version))
  }
  for (const version of ['21.9.9', '20.19.0', '18.0.0', '9.0.0']) {
    const entry = byId(report(box, { nodeVersion: version }), 'node')
    assert.equal(entry.status, 'error', version)
    assert.ok(entry.detail.includes(version) && entry.detail.includes('22'), entry.detail)
    assert.ok(entry.fix.includes('Node 22'), entry.fix)
  }
  // Without an injected value it reads the running Node, which this suite needs to be 22 or newer.
  assert.equal(byId(doctor.run({ env: { HOME: box.home, CLAUDE_CONFIG_DIR: box.config, PATH: box.bin }, cwd: box.project, exec: fakeExec() }), 'node').status, 'ok')
})

// ---- git
test('git: 2.36 and newer are ok, in any of the shapes of its version line', (t) => {
  const box = sandbox(t)
  for (const [line, version] of [['git version 2.36.0', '2.36.0'], ['git version 2.36', '2.36'], ['git version 2.43.0', '2.43.0'], ['git version 2.39.5 (Apple Git-154)', '2.39.5'], ['git version 3.0.0', '3.0.0'], ['git version 2.100.1', '2.100.1']]) {
    const entry = byId(report(box, { exec: fakeExec({ git: line }) }), 'git')
    assert.equal(entry.status, 'ok', line)
    assert.ok(entry.detail.includes(version), entry.detail)
    assert.equal(entry.fix, null)
  }
})

test('git: older than 2.36, not found or with no version are errors with a fix', (t) => {
  const box = sandbox(t)
  for (const line of ['git version 2.35.9', 'git version 2.30.2', 'git version 1.9.1']) {
    const entry = byId(report(box, { exec: fakeExec({ git: line }) }), 'git')
    assert.equal(entry.status, 'error', line)
    assert.ok(entry.detail.includes('2.36'), entry.detail)
    assert.ok(entry.fix.includes('2.36'), entry.fix)
  }
  for (const git of [null, 127, new Error('spawn git ENOENT')]) {
    const entry = byId(report(box, { exec: fakeExec({ git }) }), 'git')
    assert.equal(entry.status, 'error')
    assert.ok(entry.detail.includes('not found'), entry.detail)
    assert.ok(entry.fix.includes('Install git'), entry.fix)
  }
  assert.equal(byId(report(box, { exec: fakeExec({ git: 'not a version' }) }), 'git').status, 'error')
})

// ---- aether
test('aether: no installed release is a warning with the install command, and a release is ok with its version', (t) => {
  const box = sandbox(t)
  const none = report(box)
  assert.equal(byId(none, 'aether').status, 'warn')
  assert.equal(byId(none, 'aether').fix, INSTALL_FIX)
  assert.equal(none.installed, null)
  addRelease(box.config, '0.9.0')
  addRelease(box.config, '0.12.10')
  addRelease(box.config, '0.12.3')
  const some = report(box)
  assert.equal(byId(some, 'aether').status, 'ok')
  assert.ok(byId(some, 'aether').detail.includes('0.12.10'), 'the newest, by version and not by name')
  assert.equal(byId(some, 'aether').fix, null)
  assert.equal(some.installed, '0.12.10')
  addRelease(box.config, '0.13.0', 'my-fork')
  assert.equal(report(box).installed, '0.13.0', 'the cache of another marketplace counts')
})

test('aether: the release is looked up in CLAUDE_CONFIG_DIR, and in ~/.claude without it', (t) => {
  const box = sandbox(t)
  addRelease(path.join(box.home, '.claude'), '0.12.3')
  addRelease(box.config, '0.12.4')
  assert.equal(report(box).installed, '0.12.4')
  assert.equal(report(box, { env: { CLAUDE_CONFIG_DIR: undefined } }).installed, '0.12.3')
  assert.equal(report(box, { env: { CLAUDE_CONFIG_DIR: '' } }).installed, '0.12.3')
})

// ---- command
test('command: a stub of Aether first on the PATH is ok, and the report names it', (t) => {
  const box = sandbox(t)
  const file = put(box.local, 'aeth', stub('exec true\n'))
  const r = report(box, { env: { PATH: [box.bin, box.local].join(path.delimiter) } })
  assert.equal(byId(r, 'command').status, 'ok')
  assert.ok(byId(r, 'command').detail.includes('aeth runs Aether'), byId(r, 'command').detail)
  assert.equal(byId(r, 'command').fix, null)
  assert.deepEqual(r.command, { name: 'aeth', path: file, own: true, onPath: true })
})

test('command: an executable of that name that is not Aether\'s is a warning that says to pick another name', (t) => {
  const box = sandbox(t)
  const other = put(box.other, 'aeth', '#!/bin/sh\necho another project\n')
  const r = report(box, { env: { PATH: [box.bin, box.other].join(path.delimiter) } })
  const entry = byId(r, 'command')
  assert.equal(entry.status, 'warn')
  assert.ok(entry.detail.includes(other) && entry.detail.includes('not Aether'), entry.detail)
  assert.ok(entry.fix.includes('/aether:setup') && entry.fix.includes('another name'), entry.fix)
  assert.deepEqual(r.command, { name: 'aeth', path: other, own: false, onPath: true })
  // A file that only mentions the marker is not a stub: the marker is a line of its own.
  put(box.other, 'aeth', `#!/bin/sh\necho '${MARKER}'\n`)
  assert.equal(byId(report(box, { env: { PATH: [box.bin, box.other].join(path.delimiter) } }), 'command').status, 'warn')
})

test('command: the first executable of that name on the PATH wins, ours or not', (t) => {
  const box = sandbox(t)
  put(box.local, 'aeth', stub())
  put(box.other, 'aeth', '#!/bin/sh\necho another project\n')
  const ours = report(box, { env: { PATH: [box.local, box.other].join(path.delimiter) } })
  assert.equal(byId(ours, 'command').status, 'ok')
  assert.equal(ours.command.path, path.join(box.local, 'aeth'))
  const theirs = report(box, { env: { PATH: [box.other, box.local].join(path.delimiter) } })
  assert.equal(byId(theirs, 'command').status, 'warn')
  assert.equal(theirs.command.own, false)
  assert.equal(theirs.command.path, path.join(box.other, 'aeth'))
})

test('command: a file that cannot be run, or is a directory, does not count as the command', (t) => {
  const box = sandbox(t)
  put(box.other, 'aeth', stub(), 0o644)
  fs.mkdirSync(path.join(box.bin, 'aeth'))
  const r = report(box, { env: { PATH: [box.bin, box.other].join(path.delimiter) } })
  assert.equal(byId(r, 'command').status, 'warn')
  assert.equal(byId(r, 'command').fix, 'Run /aether:setup')
  assert.deepEqual(r.command, { name: 'aeth', path: null, own: false, onPath: false })
})

test('command: a stub in ~/.local/bin that is not on the PATH is a warning that says to add the directory', (t) => {
  const box = sandbox(t)
  const file = put(box.local, 'aeth', stub())
  const r = report(box)
  const entry = byId(r, 'command')
  assert.equal(entry.status, 'warn')
  assert.ok(entry.detail.includes(file) && entry.detail.includes('not on the PATH'), entry.detail)
  assert.ok(entry.fix.includes(box.local) && entry.fix.includes('PATH'), entry.fix)
  assert.deepEqual(r.command, { name: 'aeth', path: file, own: true, onPath: false })
  // A file of that name there that is not a stub is not ours: nothing is installed.
  put(box.local, 'aeth', '#!/bin/sh\necho mine\n')
  assert.deepEqual(report(box).command, { name: 'aeth', path: null, own: false, onPath: false })
})

test('command: nothing of that name anywhere is a warning that says to run /aether:setup', (t) => {
  const box = sandbox(t)
  const r = report(box)
  assert.equal(byId(r, 'command').status, 'warn')
  assert.equal(byId(r, 'command').fix, 'Run /aether:setup')
  assert.ok(byId(r, 'command').detail.includes('aeth'))
  assert.deepEqual(r.command, { name: 'aeth', path: null, own: false, onPath: false })
})

test('command: a file larger than 64 KiB is not a stub even if its first lines are', (t) => {
  const box = sandbox(t)
  put(box.other, 'aeth', `${stub()}${'#'.repeat(70 * 1024)}\n`)
  const r = report(box, { env: { PATH: box.other } })
  assert.equal(byId(r, 'command').status, 'warn')
  assert.equal(r.command.own, false)
  assert.equal(r.command.onPath, true)
  // One just under the limit, with the marker, is.
  put(box.other, 'aeth', `${stub()}${'#'.repeat(60 * 1024)}\n`)
  assert.equal(byId(report(box, { env: { PATH: box.other } }), 'command').status, 'ok')
})

test('command: a link to a stub counts, a CRLF stub counts, and --name looks for another name', (t) => {
  const box = sandbox(t)
  const real = put(box.local, 'real', stub())
  fs.symlinkSync(real, path.join(box.other, 'aeth'))
  put(box.other, 'mine', `#!/bin/sh\r\n${MARKER}\r\n`)
  const env = { PATH: box.other }
  assert.equal(byId(report(box, { env }), 'command').status, 'ok')
  const named = report(box, { env, name: 'mine' })
  assert.equal(byId(named, 'command').status, 'ok')
  assert.equal(named.command.name, 'mine')
  assert.ok(byId(named, 'command').detail.includes('mine runs Aether'))
  assert.equal(byId(report(box, { env, name: 'nope' }), 'command').status, 'warn')
  assert.equal(report(box).command.name, 'aeth', 'aeth by default')
})

test('command: a name that is not valid is a usage error, with exit code 2, and nothing is looked up', (t) => {
  const box = sandbox(t)
  for (const name of ['../x', '-x', 'a b', '', '.hidden', 'a/b', 'claude', 'a'.repeat(65), 'ñ']) {
    assert.throws(() => report(box, { name }), (err) => err instanceof doctor.DoctorError && err.exitCode === 2, JSON.stringify(name))
  }
  for (const name of ['aeth', 'A1', 'a.b', 'a_b', 'a-b', 'a'.repeat(64), 'claude-aether']) assert.doesNotThrow(() => report(box, { name }), name)
})

// ---- workflows
test('workflows: CLAUDE_CODE_DISABLE_WORKFLOWS set to a value other than 0 or false is an error', (t) => {
  const box = sandbox(t)
  for (const value of ['1', 'true', 'yes', 'TRUE', 'on']) {
    const entry = byId(report(box, { env: { CLAUDE_CODE_DISABLE_WORKFLOWS: value } }), 'workflows')
    assert.equal(entry.status, 'error', value)
    assert.ok(entry.detail.includes('CLAUDE_CODE_DISABLE_WORKFLOWS'), entry.detail)
    assert.ok(entry.fix.includes('/config') && entry.fix.includes('Dynamic workflows') && entry.fix.includes('unset CLAUDE_CODE_DISABLE_WORKFLOWS'), entry.fix)
  }
  for (const value of ['0', 'false', 'FALSE', '', ' ', undefined]) {
    assert.equal(byId(report(box, { env: { CLAUDE_CODE_DISABLE_WORKFLOWS: value } }), 'workflows').status, 'info', JSON.stringify(value))
  }
})

test('workflows: disableWorkflows true or enableWorkflows false in the user, project or local settings is an error that names the setting and the file', (t) => {
  const box = sandbox(t)
  const claude = path.join(box.project, '.claude')
  const cases = [
    [box.config, 'settings.json', { disableWorkflows: true }, 'disableWorkflows'],
    [box.config, 'settings.json', { enableWorkflows: false }, 'enableWorkflows: false'],
    [claude, 'settings.json', { disableWorkflows: true }, 'disableWorkflows'],
    [claude, 'settings.json', { enableWorkflows: false }, 'enableWorkflows: false'],
    [claude, 'settings.local.json', { disableWorkflows: true }, 'disableWorkflows'],
    [claude, 'settings.local.json', { enableWorkflows: false }, 'enableWorkflows: false'],
  ]
  for (const [dir, name, value, setting] of cases) {
    const file = settings(dir, name, value)
    const entry = byId(report(box), 'workflows')
    assert.equal(entry.status, 'error', `${name} ${setting}`)
    assert.ok(entry.detail.includes(setting) && entry.detail.includes(file), entry.detail)
    assert.ok(entry.fix.includes('/config') && entry.fix.includes(`remove ${setting.split(':')[0]}`) && entry.fix.includes(file), entry.fix)
    fs.rmSync(file)
  }
  assert.equal(byId(report(box), 'workflows').status, 'info', 'with the files gone it is not set')
})

test('workflows: a setting that turns them on is not an error, and one that turns them off wins over it', (t) => {
  const box = sandbox(t)
  const claude = path.join(box.project, '.claude')
  // A disableWorkflows that is false, or a string, is not "true".
  settings(box.config, 'settings.json', { disableWorkflows: false, enableWorkflows: true })
  assert.equal(byId(report(box), 'workflows').status, 'ok')
  settings(claude, 'settings.json', { disableWorkflows: 'true' })
  assert.equal(byId(report(box), 'workflows').status, 'ok', 'only the boolean counts')
  // The project turns them off, the user turns them on: off wins, whichever file says it.
  settings(claude, 'settings.local.json', { enableWorkflows: false })
  const off = byId(report(box), 'workflows')
  assert.equal(off.status, 'error')
  assert.ok(off.detail.includes(path.join(claude, 'settings.local.json')))
  assert.ok(!off.detail.includes(path.join(box.config, 'settings.json')), 'the file that turns them on is not blamed')
  // Every source that turns them off is named.
  settings(claude, 'settings.json', { disableWorkflows: true })
  const both = byId(report(box), 'workflows')
  assert.ok(both.detail.includes(path.join(claude, 'settings.json')) && both.detail.includes(path.join(claude, 'settings.local.json')), both.detail)
  // The environment variable wins over a setting that turns them on.
  const env = byId(report(box, { env: { CLAUDE_CODE_DISABLE_WORKFLOWS: '1' } }), 'workflows')
  assert.ok(env.detail.includes('CLAUDE_CODE_DISABLE_WORKFLOWS') && env.detail.includes('disableWorkflows'), env.detail)
})

test('workflows: enableWorkflows true with nothing against it is ok and names the file', (t) => {
  const box = sandbox(t)
  const file = settings(path.join(box.project, '.claude'), 'settings.local.json', { enableWorkflows: true })
  const entry = byId(report(box), 'workflows')
  assert.equal(entry.status, 'ok')
  assert.ok(entry.detail.includes('enableWorkflows: true') && entry.detail.includes(file), entry.detail)
  assert.equal(entry.fix, null)
})

test('workflows: nothing set is a note that says they depend on the plan, with the Pro fix', (t) => {
  const box = sandbox(t)
  settings(box.config, 'settings.json', { theme: 'dark', enableWorkflows: 'yes' })
  const entry = byId(report(box), 'workflows')
  assert.equal(entry.status, 'info')
  assert.ok(entry.detail.includes('not set') && entry.detail.includes('Pro'), entry.detail)
  assert.equal(entry.fix, 'On the Pro plan: /config → Dynamic workflows')
})

test('workflows: a settings file that is missing, not valid JSON, not an object or a directory adds nothing and never throws', (t) => {
  const box = sandbox(t)
  const claude = path.join(box.project, '.claude')
  settings(box.config, 'settings.json', '{ "disableWorkflows": true,')
  settings(claude, 'settings.json', '[{"disableWorkflows": true}]')
  fs.mkdirSync(path.join(claude, 'settings.local.json'))
  assert.equal(byId(report(box), 'workflows').status, 'info')
  for (const text of ['null', '"disableWorkflows"', '42', '', '\u0000\u0001', '{"disableWorkflows": true}garbage']) {
    settings(claude, 'settings.json', text)
    assert.equal(byId(report(box), 'workflows').status, 'info', JSON.stringify(text))
  }
  // A good file beside a broken one still counts.
  settings(box.config, 'settings.json', '{ broken')
  settings(claude, 'settings.json', { disableWorkflows: true })
  assert.equal(byId(report(box), 'workflows').status, 'error')
})

test('workflows: the same settings file is read once when the project is the home', (t) => {
  const box = sandbox(t)
  const file = settings(path.join(box.home, '.claude'), 'settings.json', { disableWorkflows: true })
  const entry = byId(report(box, { env: { CLAUDE_CONFIG_DIR: path.join(box.home, '.claude') }, cwd: box.home }), 'workflows')
  assert.equal(entry.status, 'error')
  assert.equal(entry.detail.split(file).length - 1, 1, `named once: ${entry.detail}`)
})

// ---- harnesses and the saved options
test('harnesses: the CLIs found on the PATH are listed in a fixed order, and only the ones that can run', (t) => {
  const box = sandbox(t)
  const none = report(box)
  assert.deepEqual(none.harnesses, [])
  assert.equal(byId(none, 'harnesses').status, 'info')
  assert.ok(byId(none, 'harnesses').detail.includes('no other harness'), byId(none, 'harnesses').detail)
  assert.equal(byId(none, 'harnesses').fix, null)
  for (const cli of ['muse', 'grok', 'agy']) put(box.other, cli, '#!/bin/sh\n')
  put(box.bin, 'cursor-agent', '#!/bin/sh\n')
  put(box.bin, 'codex', '#!/bin/sh\n', 0o644)
  const r = report(box, { env: { PATH: [box.bin, box.other].join(path.delimiter) } })
  assert.deepEqual(r.harnesses, ['agy', 'grok', 'cursor', 'muse'], 'the option names: cursor-agent is the CLI of cursor')
  assert.equal(byId(r, 'harnesses').status, 'info')
  for (const cli of r.harnesses) assert.ok(byId(r, 'harnesses').detail.includes(cli), byId(r, 'harnesses').detail)
  assert.ok(!byId(r, 'harnesses').detail.includes('codex'), 'a file without the exec bit is not installed')
})

test('harnesses: superdelegation on with a harness that is not installed is a warning that names it', (t) => {
  const box = sandbox(t)
  put(box.other, 'agy', '#!/bin/sh\n')
  const env = { PATH: [box.bin, box.other].join(path.delimiter) }
  const options = (superdelegation, harnesses) => settings(box.config, 'settings.json', { pluginConfigs: { 'aether@aether-plugin': { options: { superdelegation, harnesses } } } })

  options(true, 'codex,agy')
  const one = byId(report(box, { env }), 'harnesses')
  assert.equal(one.status, 'warn')
  assert.ok(one.detail.includes('codex') && !one.detail.includes('agy'), one.detail)
  assert.ok(one.fix.includes('codex'), one.fix)

  options('true', ' grok , codex ,agy')
  const two = byId(report(box, { env }), 'harnesses')
  assert.equal(two.status, 'warn')
  assert.ok(two.detail.includes('grok') && two.detail.includes('codex'), two.detail)

  options(true, 'cursor')
  assert.ok(byId(report(box, { env }), 'harnesses').detail.includes('cursor'), 'the option calls it cursor; its CLI is cursor-agent')
  put(box.other, 'cursor-agent', '#!/bin/sh\n')
  assert.equal(byId(report(box, { env }), 'harnesses').status, 'info', 'cursor is found as cursor-agent')

  options(true, 'agy,cursor')
  assert.equal(byId(report(box, { env }), 'harnesses').status, 'info', 'all installed')
  options(true, ['codex'])
  assert.equal(byId(report(box, { env }), 'harnesses').status, 'warn', 'a list is read like a comma-separated string')
  options(true, '')
  assert.equal(byId(report(box, { env }), 'harnesses').status, 'info', 'none listed, none missing')
})

test('harnesses: a missing harness is no warning while superdelegation is off, false or unset', (t) => {
  const box = sandbox(t)
  for (const superdelegation of [false, 'false', 'off', null, undefined]) {
    settings(box.config, 'settings.json', { pluginConfigs: { 'aether@aether-plugin': { options: { superdelegation, harnesses: 'codex' } } } })
    assert.equal(byId(report(box), 'harnesses').status, 'info', String(superdelegation))
  }
})

test('options: the saved superdelegation and harnesses, as saved, or null when there are none', (t) => {
  const box = sandbox(t)
  assert.equal(report(box).options, null, 'no settings file')
  for (const value of [{}, { pluginConfigs: {} }, { pluginConfigs: { 'other@market': { options: { superdelegation: true } } } }, { pluginConfigs: { 'aether@aether-plugin': {} } }, { pluginConfigs: { 'aether@aether-plugin': { options: { ops: 'x' } } } }, { pluginConfigs: null }, { pluginConfigs: { 'aether@aether-plugin': { options: 'text' } } }]) {
    settings(box.config, 'settings.json', value)
    assert.equal(report(box).options, null, JSON.stringify(value))
  }
  const saved = (options) => settings(box.config, 'settings.json', { pluginConfigs: { 'aether@aether-plugin': { options, other: 1 } }, theme: 'dark' })
  saved({ superdelegation: true, harnesses: 'codex,agy', ops: 'ignored' })
  assert.deepEqual(report(box).options, { superdelegation: true, harnesses: 'codex,agy' })
  saved({ superdelegation: 'false', harnesses: 'agy' })
  assert.deepEqual(report(box).options, { superdelegation: 'false', harnesses: 'agy' }, 'strings stay strings')
  saved({ harnesses: 'grok' })
  assert.deepEqual(report(box).options, { superdelegation: null, harnesses: 'grok' })
  settings(box.config, 'settings.json', '{ not json')
  assert.equal(report(box).options, null)
})

// ---- project
test('project: a git work tree is ok and the folder is asked with -C, so the runner needs no working directory', (t) => {
  const box = sandbox(t)
  const exec = fakeExec()
  const entry = byId(report(box, { exec }), 'project')
  assert.equal(entry.status, 'ok')
  assert.ok(entry.detail.includes(box.project), entry.detail)
  assert.equal(entry.fix, null)
  assert.deepEqual(exec.calls.at(-1), ['git', '-C', box.project, 'rev-parse', '--is-inside-work-tree'])
})

test('project: a folder that is not a repository is a note that says to open Aether in the project, with the command name in the fix', (t) => {
  const box = sandbox(t)
  const entry = byId(report(box, { exec: fakeExec({ repo: false }) }), 'project')
  assert.equal(entry.status, 'info')
  assert.ok(entry.detail.includes('not a git repository'), entry.detail)
  assert.equal(entry.fix, 'cd <your project> && aeth')
  assert.equal(byId(report(box, { exec: fakeExec({ repo: false }), name: 'mine' }), 'project').fix, 'cd <your project> && mine')
  // A runner that says "false", or prints something else, is not a repository either.
  const odd = (stdout) => () => ({ status: 0, stdout })
  for (const stdout of ['false\n', '', 'fatal']) assert.equal(byId(report(box, { exec: odd(stdout) }), 'project').status, 'info')
})

// ---- the bin
test('the bin is an executable file with a node shebang, like the other bins', () => {
  const stat = fs.statSync(BIN)
  assert.ok(stat.isFile())
  assert.equal(stat.mode & 0o777, 0o755)
  assert.equal(fs.readFileSync(BIN, 'utf8').split('\n')[0], '#!/usr/bin/env node')
})

test('the bin prints one JSON object and exits 0 when no check is an error', (t) => {
  const box = sandbox(t)
  stubTools(box)
  addRelease(box.config, '0.29.0')
  put(box.local, 'aeth', stub())
  const r = bin(box, [], { pathDirs: [box.bin, box.local] })
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  assert.equal(r.stdout.split('\n').length, 2, 'one line of JSON')
  assert.deepEqual(Object.keys(r.json).sort(), KEYS)
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.checks.map((entry) => entry.id), IDS)
  assert.equal(byId(r.json, 'claude').status, 'ok')
  assert.equal(byId(r.json, 'git').status, 'ok')
  assert.equal(byId(r.json, 'node').status, 'ok', `this suite needs Node 22: ${process.version}`)
  assert.equal(byId(r.json, 'aether').status, 'ok')
  assert.equal(byId(r.json, 'command').status, 'ok')
  assert.equal(byId(r.json, 'project').status, 'ok')
  assert.equal(r.json.installed, '0.29.0')
  assert.equal(r.json.command.name, 'aeth')
})

test('the bin exits 0 with only warnings: nothing installed yet is not a failure', (t) => {
  const box = sandbox(t)
  stubTools(box)
  const r = bin(box, [])
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  assert.equal(r.json.ok, true)
  assert.equal(byId(r.json, 'aether').status, 'warn')
  assert.equal(byId(r.json, 'command').status, 'warn')
})

test('the bin exits 1 when a check is an error, and still prints the whole report', (t) => {
  const box = sandbox(t)
  stubTools(box, { claude: null })
  const missing = bin(box, [])
  assert.equal(missing.status, 1, `${missing.stdout}${missing.stderr}`)
  assert.equal(missing.json.ok, false)
  assert.equal(missing.json.checks.length, IDS.length)
  assert.equal(byId(missing.json, 'claude').status, 'error')

  stubTools(box, { claude: '2.0.5' })
  const old = bin(box, [])
  assert.equal(old.status, 1)
  assert.equal(byId(old.json, 'claude').status, 'error')

  put(box.bin, 'claude', '#!/bin/sh\nexit 3\n')
  assert.equal(byId(bin(box, []).json, 'claude').status, 'error', 'a claude that fails is not found')

  stubTools(box, { git: '2.20.1' })
  assert.equal(byId(bin(box, []).json, 'git').status, 'error')

  stubTools(box)
  settings(box.config, 'settings.json', { disableWorkflows: true })
  const workflows = bin(box, [])
  assert.equal(workflows.status, 1)
  assert.equal(byId(workflows.json, 'workflows').status, 'error')
})

test('the bin reads the working directory it is run in, and --name sets the command it looks for', (t) => {
  const box = sandbox(t)
  stubTools(box)
  put(box.bin, 'mine', stub())
  const named = bin(box, ['--name', 'mine'])
  assert.equal(named.status, 0, named.stderr)
  assert.equal(named.json.command.name, 'mine')
  assert.equal(named.json.command.own, true)
  settings(path.join(box.project, '.claude'), 'settings.local.json', { enableWorkflows: false })
  assert.equal(byId(bin(box, []).json, 'workflows').status, 'error')
  assert.equal(byId(bin(box, [], { cwd: box.other }).json, 'workflows').status, 'info', 'another folder, other settings')
})

test('a usage mistake gives exit 2 and one JSON error with the usage: an unknown flag, a stray word, a flag without its value, a repeated flag, a bad name', (t) => {
  const box = sandbox(t)
  stubTools(box)
  for (const args of [['--nope'], ['stray'], ['--name'], ['--name', '--name'], ['--name', 'a', '--name', 'b'], ['--check'], ['--dir', 'x'], ['--name', '../x'], ['--name', 'claude'], ['--name', 'a b'], ['--name', 'a'.repeat(65)], ['--name', '']]) {
    const r = bin(box, args)
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`)
    assert.equal(r.stdout.split('\n').length, 2, 'one line of JSON')
    assert.deepEqual(Object.keys(r.json), ['error'])
    assert.ok(r.json.error.length > 0)
  }
  assert.ok(bin(box, ['--nope']).json.error.includes('usage: aether-doctor'))
})

test('the bin writes nothing: no file, no directory, no change of time or mode, in the home, the config dir, the project or the PATH', (t) => {
  const box = sandbox(t)
  stubTools(box)
  addRelease(box.config, '0.29.0')
  put(box.local, 'aeth', stub())
  put(box.other, 'codex', '#!/bin/sh\n')
  settings(box.config, 'settings.json', { pluginConfigs: { 'aether@aether-plugin': { options: { superdelegation: true, harnesses: 'codex,grok' } } } })
  settings(path.join(box.project, '.claude'), 'settings.local.json', { disableWorkflows: true })
  for (const rc of ['.bashrc', '.zshrc', '.profile']) put(box.home, rc, 'export A=1\n', 0o644)
  const before = snapshot(box.root)
  for (const args of [[], ['--name', 'mine'], ['--name', 'aeth'], ['--nope']]) {
    bin(box, args, { pathDirs: [box.bin, box.local, box.other] })
    assert.deepEqual(snapshot(box.root), before, `after: ${args.join(' ')}`)
  }
  // The same for the library, with a good and a failing runner.
  for (const exec of [fakeExec(), fakeExec({ claude: null, git: null, repo: false })]) {
    report(box, { exec })
    assert.deepEqual(snapshot(box.root), before)
  }
})

// ---- the skill
test('the skill doctor has a name, a one-line description and disable-model-invocation, and runs the command', () => {
  const text = fs.readFileSync(path.join(ROOT, 'plugins', 'aether', 'skills', 'doctor', 'SKILL.md'), 'utf8')
  const block = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(block, 'the skill starts with front matter')
  const front = Object.fromEntries(block[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]))
  assert.deepEqual(Object.keys(front), ['name', 'description', 'disable-model-invocation'])
  assert.equal(front.name, 'doctor')
  assert.ok(front.description && front.description.length > 0, 'it has a description')
  assert.ok(front.description.length <= 200, 'the description is short')
  assert.ok(!front.description.includes('\n'))
  assert.equal(front['disable-model-invocation'], 'true')
  const body = text.slice(block[0].length)
  assert.ok(body.split('\n').length <= 40, 'the skill is short')
  for (const need of [
    'aether-doctor', '--name',
    // the command is not found: the plugin is not enabled in this session
    'not found', 'not enabled', 'new session',
    // the fixed report: a summary, a line per check with its symbol, and the list of fixes
    'language', 'summary', '✓', '·', '!', '✗', 'To fix', 'exactly as given', '`ok`', '`info`', '`warn`', '`error`',
    // the exit codes
    'exit 2',
  ]) assert.ok(body.toLowerCase().includes(need.toLowerCase()), `the skill says ${need}`)
  // It changes nothing: it runs no fix, edits no file, writes no code.
  assert.match(body, /change nothing/i)
  assert.match(body, /run no fix|never run a fix/i)
  assert.match(body, /edit no file/i)
  assert.match(body, /write no code/i)
})
