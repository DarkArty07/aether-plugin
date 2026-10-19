'use strict'

// Spec 007: aether-first-setup installs a small stub, `aeth` by default, that runs the launcher of the newest installed
// release, and the skill first-setup has Claude run it once. Nothing here uses a model or the network, and nothing
// touches the real home: every test builds its own --dir, HOME, CLAUDE_CONFIG_DIR and PATH in throwaway directories, and
// the bin runs with only those three variables.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const BIN = path.join(ROOT, 'plugins', 'aether', 'bin', 'aether-first-setup')
const MARKER = '# aether-first-setup stub'
const KEYS = ['installed', 'launcher', 'launcherVersion', 'name', 'onPath', 'path', 'replaced', 'shellHint']
// What a stub needs of the system: sh, sort and tail.
const SYSTEM_PATH = '/usr/bin:/bin'

// Four fresh directories: the one the stub goes in (not created yet), a home, a config dir and a directory on the PATH.
function sandbox(t) {
  const root = tempDir(t, 'aether-first-setup-')
  const make = (name) => {
    const dir = path.join(root, name)
    fs.mkdirSync(dir)
    return dir
  }
  return { root, dir: path.join(root, 'target', 'bin'), home: make('home'), config: make('config'), onPath: make('on-path') }
}

// A release in the fake plugin cache, with or without a launcher. Its launcher says which release it is and prints its
// arguments, one per line, and the AETHER_IRREVERSIBLE it was given.
function addRelease(config, version, { market = 'aether-plugin', launcher = true, mode = 0o755 } = {}) {
  const release = path.join(config, 'plugins', 'cache', market, 'aether', version)
  fs.mkdirSync(path.join(release, 'launcher'), { recursive: true })
  const file = path.join(release, 'launcher', 'aether-lead')
  if (launcher) {
    const script = `#!/bin/sh\necho "launcher ${version}"\nfor a in "$@"; do printf '%s\\n' "$a"; done\nexit \${EXIT_WITH:-0}\n`
    fs.writeFileSync(file, script)
    fs.chmodSync(file, mode)
  }
  return file
}

// Runs the bin with HOME, CLAUDE_CONFIG_DIR and PATH, and nothing else of the test runner's environment.
function setup(box, args, { pathDirs = [], config = box.config, home = box.home } = {}) {
  const env = { HOME: home, PATH: pathDirs.join(path.delimiter) }
  if (config !== null) env.CLAUDE_CONFIG_DIR = config
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: box.root, encoding: 'utf8', env })
  assert.equal(r.error, undefined)
  let json = null
  try {
    json = JSON.parse(r.stdout)
  } catch {
    json = null
  }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

// The stub, run by its path with the system's own tools on the PATH.
function runStub(file, args, { config, home, extra = {} } = {}) {
  const env = { PATH: SYSTEM_PATH, ...extra }
  if (home !== undefined) env.HOME = home
  if (config !== undefined) env.CLAUDE_CONFIG_DIR = config
  return spawnSync(file, args, { encoding: 'utf8', env })
}

const lines = (text) => text.split('\n').slice(0, -1)

// ---- the bin
test('it installs a stub of mode 0755 with the marker, named aeth by default, and says so in one JSON object', (t) => {
  const box = sandbox(t)
  const r = setup(box, ['--dir', box.dir])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.split('\n').length, 2, 'one line of JSON')
  assert.deepEqual(Object.keys(r.json).sort(), KEYS)
  const file = path.join(box.dir, 'aeth')
  assert.equal(r.json.installed, true)
  assert.equal(r.json.name, 'aeth')
  assert.equal(r.json.path, file)
  assert.equal(r.json.replaced, false)
  assert.equal(fs.statSync(file).mode & 0o777, 0o755)
  const text = fs.readFileSync(file, 'utf8')
  assert.ok(text.startsWith('#!/bin/sh\n'), 'the stub is POSIX sh')
  assert.ok(lines(text).includes(MARKER), 'the stub carries its marker line')
  assert.deepEqual(fs.readdirSync(box.dir), ['aeth'])
})

test('without --dir the stub goes in ~/.local/bin, and --name sets its name', (t) => {
  const box = sandbox(t)
  const r = setup(box, ['--name', 'mi-aether.2'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.path, path.join(box.home, '.local', 'bin', 'mi-aether.2'))
  assert.ok(fs.existsSync(r.json.path))
})

test('--check says what would happen and writes nothing, not even the directory', (t) => {
  const box = sandbox(t)
  const r = setup(box, ['--dir', box.dir, '--check'])
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(Object.keys(r.json).sort(), KEYS)
  assert.equal(r.json.installed, false)
  assert.equal(r.json.replaced, false)
  assert.equal(r.json.path, path.join(box.dir, 'aeth'))
  assert.ok(!fs.existsSync(path.join(box.root, 'target')), 'the directory was not created')
  // With a stub of its own there, --check says it would replace it, and leaves it as it was.
  assert.equal(setup(box, ['--dir', box.dir]).status, 0)
  const file = path.join(box.dir, 'aeth')
  fs.writeFileSync(file, `#!/bin/sh\n${MARKER}\nold\n`, { mode: 0o755 })
  const before = fs.readFileSync(file)
  const again = setup(box, ['--dir', box.dir, '--check'])
  assert.equal(again.status, 0, again.stderr)
  assert.equal(again.json.installed, false)
  assert.equal(again.json.replaced, true)
  assert.deepEqual(fs.readFileSync(file), before)
})

test('a re-run replaces its own stub in place, says replaced, and leaves no temporary file', (t) => {
  const box = sandbox(t)
  setup(box, ['--dir', box.dir])
  const file = path.join(box.dir, 'aeth')
  const fresh = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, `#!/bin/sh\n${MARKER}\n# an older stub\nexit 9\n`, { mode: 0o700 })
  const r = setup(box, ['--dir', box.dir])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.installed, true)
  assert.equal(r.json.replaced, true)
  assert.equal(fs.readFileSync(file, 'utf8'), fresh)
  assert.equal(fs.statSync(file).mode & 0o777, 0o755)
  assert.deepEqual(fs.readdirSync(box.dir), ['aeth'])
})

test('a foreign file of that name is left byte-identical and the exit is 3, naming it and suggesting --name', (t) => {
  const box = sandbox(t)
  fs.mkdirSync(box.dir, { recursive: true })
  const file = path.join(box.dir, 'aeth')
  const bytes = Buffer.from([0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e, 0x2f, 0x73, 0x68, 0x0a, 0xff, 0x00, 0x41])
  fs.writeFileSync(file, bytes, { mode: 0o640 })
  for (const args of [['--dir', box.dir], ['--dir', box.dir, '--check']]) {
    const r = setup(box, args)
    assert.equal(r.status, 3, r.stderr)
    assert.ok(r.json.error.includes(file), r.json.error)
    assert.ok(r.json.error.includes('--name'), r.json.error)
    assert.deepEqual(fs.readFileSync(file), bytes)
    assert.equal(fs.statSync(file).mode & 0o777, 0o640)
    assert.deepEqual(fs.readdirSync(box.dir), ['aeth'])
  }
  // A file that only mentions the marker is not a stub of its own: the marker is a line of its own.
  fs.writeFileSync(file, `echo '${MARKER}'\n`)
  assert.equal(setup(box, ['--dir', box.dir]).status, 3)
})

test('a symbolic link, a broken link or a directory of that name is not its own, even when the link leads to a stub', (t) => {
  const box = sandbox(t)
  fs.mkdirSync(box.dir, { recursive: true })
  const real = path.join(box.root, 'real-stub')
  fs.writeFileSync(real, `#!/bin/sh\n${MARKER}\n`, { mode: 0o755 })
  fs.symlinkSync(real, path.join(box.dir, 'linked'))
  fs.symlinkSync(path.join(box.root, 'nowhere'), path.join(box.dir, 'broken'))
  fs.mkdirSync(path.join(box.dir, 'folder'))
  for (const name of ['linked', 'broken', 'folder']) {
    const r = setup(box, ['--dir', box.dir, '--name', name])
    assert.equal(r.status, 3, `${name}: ${r.stderr}`)
  }
  assert.equal(fs.readFileSync(real, 'utf8'), `#!/bin/sh\n${MARKER}\n`)
  assert.equal(fs.lstatSync(path.join(box.dir, 'linked')).isSymbolicLink(), true)
})

test('an executable of that name on the PATH that is not its own gives exit 3 and writes nothing', (t) => {
  const box = sandbox(t)
  const other = path.join(box.onPath, 'aeth')
  fs.writeFileSync(other, '#!/bin/sh\necho another project\n', { mode: 0o755 })
  const r = setup(box, ['--dir', box.dir], { pathDirs: [box.onPath] })
  assert.equal(r.status, 3, r.stderr)
  assert.ok(r.json.error.includes(other), r.json.error)
  assert.ok(r.json.error.includes('--name'), r.json.error)
  assert.ok(!fs.existsSync(path.join(box.root, 'target')), 'nothing was written, not even the directory')
  assert.equal(setup(box, ['--dir', box.dir, '--check'], { pathDirs: [box.onPath] }).status, 3)
  // Another name is free, and the PATH holds no executable of it.
  const named = setup(box, ['--dir', box.dir, '--name', 'aeth2'], { pathDirs: [box.onPath] })
  assert.equal(named.status, 0, named.stderr)
})

test('a file of that name on the PATH that is not executable, or a stub of its own elsewhere, does not block', (t) => {
  const box = sandbox(t)
  fs.writeFileSync(path.join(box.onPath, 'aeth'), 'not a program\n', { mode: 0o644 })
  const first = setup(box, ['--dir', box.dir], { pathDirs: [box.onPath] })
  assert.equal(first.status, 0, first.stderr)
  const elsewhere = path.join(box.root, 'elsewhere')
  const second = setup(box, ['--dir', elsewhere], { pathDirs: [box.dir] })
  assert.equal(second.status, 0, second.stderr)
  assert.equal(second.json.replaced, false)
})

test('the stub of its own on the PATH in --dir itself is replaced, not refused', (t) => {
  const box = sandbox(t)
  assert.equal(setup(box, ['--dir', box.dir], { pathDirs: [box.dir] }).status, 0)
  const r = setup(box, ['--dir', box.dir], { pathDirs: [box.dir] })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.replaced, true)
})

test('an invalid name gives exit 2 and writes nothing', (t) => {
  const box = sandbox(t)
  for (const name of ['../x', '-x', 'a b', '', '.hidden', 'a/b', '..', 'ñ', 'a\nb']) {
    const r = setup(box, ['--dir', box.dir, '--name', name])
    assert.equal(r.status, 2, `${JSON.stringify(name)}: ${r.stdout}${r.stderr}`)
    assert.ok(r.json && typeof r.json.error === 'string', JSON.stringify(name))
  }
  assert.ok(!fs.existsSync(path.join(box.root, 'target')))
  assert.ok(!fs.existsSync(path.join(box.root, 'x')), '../x did not write outside --dir')
})

test('a name of letters, digits, dot, dash and underscore is valid', (t) => {
  const box = sandbox(t)
  for (const name of ['aeth', 'A1', '9lives', 'a.b', 'a_b', 'a-b-c']) {
    const r = setup(box, ['--dir', box.dir, '--name', name])
    assert.equal(r.status, 0, `${name}: ${r.stdout}${r.stderr}`)
  }
})

test('a usage mistake gives exit 2 with the usage: an unknown flag, a stray word, a flag without its value, --dir that is a file', (t) => {
  const box = sandbox(t)
  const file = path.join(box.root, 'a-file')
  fs.writeFileSync(file, 'x')
  for (const args of [['--nope'], ['stray'], ['--name'], ['--dir'], ['--dir', '--check'], ['--dir', file], ['--name', 'a', '--name', 'b']]) {
    const r = setup(box, args)
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`)
    assert.ok(r.json.error.length > 0)
  }
  assert.equal(fs.readFileSync(file, 'utf8'), 'x')
  assert.ok(setup(box, ['--nope']).json.error.includes('usage: aether-first-setup'))
})

test('a --dir that is missing is created, with its parents', (t) => {
  const box = sandbox(t)
  const deep = path.join(box.root, 'a', 'b', 'c')
  const r = setup(box, ['--dir', deep])
  assert.equal(r.status, 0, r.stderr)
  assert.ok(fs.statSync(deep).isDirectory())
  assert.ok(fs.existsSync(path.join(deep, 'aeth')))
})

test('onPath is true when --dir is on the PATH, and the hint is given only when it is not', (t) => {
  const box = sandbox(t)
  fs.mkdirSync(box.dir, { recursive: true })
  // The PATH names it with a trailing slash, among others, and an empty entry.
  const on = setup(box, ['--dir', box.dir], { pathDirs: [box.onPath, `${box.dir}${path.sep}`, ''] })
  assert.equal(on.status, 0, on.stderr)
  assert.equal(on.json.onPath, true)
  assert.equal(on.json.shellHint, null)

  const off = setup(box, ['--dir', box.dir], { pathDirs: [box.onPath] })
  assert.equal(off.json.onPath, false)
  assert.equal(typeof off.json.shellHint, 'string')
  for (const text of [box.dir, 'bash', 'zsh', 'fish', 'export PATH=', 'fish_add_path']) assert.ok(off.json.shellHint.includes(text), `the hint has ${text}`)
  // It is the same for --check, and for a directory that does not exist yet.
  const check = setup(box, ['--dir', path.join(box.root, 'later'), '--check'], { pathDirs: [box.onPath] })
  assert.equal(check.json.onPath, false)
  assert.ok(check.json.shellHint.includes(path.join(box.root, 'later')))
})

test('onPath follows a PATH entry that reaches --dir through a symbolic link', (t) => {
  const box = sandbox(t)
  fs.mkdirSync(box.dir, { recursive: true })
  const link = path.join(box.root, 'link-to-bin')
  fs.symlinkSync(box.dir, link)
  const r = setup(box, ['--dir', box.dir], { pathDirs: [link] })
  assert.equal(r.json.onPath, true)
})

test('it edits no shell file and touches nothing outside --dir', (t) => {
  const box = sandbox(t)
  const rcs = ['.bashrc', '.zshrc', '.profile'].map((name) => path.join(box.home, name))
  for (const rc of rcs) fs.writeFileSync(rc, 'export A=1\n')
  fs.mkdirSync(path.join(box.home, '.config', 'fish'), { recursive: true })
  fs.writeFileSync(path.join(box.home, '.config', 'fish', 'config.fish'), 'set -x A 1\n')
  const snapshot = () => fs.readdirSync(box.root, { recursive: true }).sort().map((entry) => {
    const full = path.join(box.root, entry)
    return `${entry} ${fs.statSync(full).isFile() ? fs.readFileSync(full, 'utf8') : 'dir'}`
  })
  const before = snapshot()
  assert.equal(setup(box, ['--dir', box.dir]).status, 0)
  const added = snapshot().filter((entry) => !before.includes(entry))
  assert.deepEqual(added.map((entry) => entry.split(' ')[0]).sort(), ['target', path.join('target', 'bin'), path.join('target', 'bin', 'aeth')].sort())
  for (const rc of rcs) assert.equal(fs.readFileSync(rc, 'utf8'), 'export A=1\n')
})

test('it reports the launcher of the newest release, by version and not by name, and none when there is none', (t) => {
  const box = sandbox(t)
  const none = setup(box, ['--dir', box.dir])
  assert.equal(none.status, 0, none.stderr)
  assert.equal(none.json.launcher, null)
  assert.equal(none.json.launcherVersion, null)
  assert.equal(none.json.installed, true, 'the stub is installed anyway: it finds the release when there is one')

  addRelease(box.config, '0.9.0')
  addRelease(box.config, '0.12.3')
  const newest = addRelease(box.config, '0.12.10')
  addRelease(box.config, '0.99.0', { launcher: false })
  const r = setup(box, ['--dir', box.dir])
  assert.equal(r.json.launcher, newest)
  assert.equal(r.json.launcherVersion, '0.12.10')
  // The cache of another marketplace counts, and with the highest version wins.
  const other = addRelease(box.config, '0.13.0', { market: 'my-fork' })
  const across = setup(box, ['--dir', box.dir])
  assert.equal(across.json.launcher, other)
  assert.equal(across.json.launcherVersion, '0.13.0')
})

test('the launcher is looked up in the CLAUDE_CONFIG_DIR, and in ~/.claude without it', (t) => {
  const box = sandbox(t)
  const inHome = addRelease(path.join(box.home, '.claude'), '0.12.3')
  const inConfig = addRelease(box.config, '0.12.4')
  assert.equal(setup(box, ['--dir', box.dir]).json.launcher, inConfig)
  assert.equal(setup(box, ['--dir', box.dir], { config: null }).json.launcher, inHome)
})

// The name is the file the stub is written to, and the launcher runs `claude`.
test('a name of more than 64 characters gives exit 2, and 64 is the most', (t) => {
  const box = sandbox(t)
  const long = setup(box, ['--dir', box.dir, '--name', 'a'.repeat(65)])
  assert.equal(long.status, 2, `${long.stdout}${long.stderr}`)
  assert.ok(long.json.error.includes('64'), long.json.error)
  assert.ok(!fs.existsSync(path.join(box.root, 'target')), 'nothing was written')
  assert.equal(setup(box, ['--dir', box.dir, '--name', 'a'.repeat(64), '--check']).status, 0)
  const ok = setup(box, ['--dir', box.dir, '--name', 'a'.repeat(64)])
  assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`)
  assert.deepEqual(fs.readdirSync(box.dir), ['a'.repeat(64)])
})

test('the name claude gives exit 2 and says the stub would call itself in a loop', (t) => {
  const box = sandbox(t)
  for (const args of [['--name', 'claude'], ['--name', 'claude', '--check']]) {
    const r = setup(box, ['--dir', box.dir, ...args])
    assert.equal(r.status, 2, `${r.stdout}${r.stderr}`)
    assert.ok(r.json.error.includes('claude') && r.json.error.includes('loop'), r.json.error)
    assert.ok(/launcher runs `claude`/.test(r.json.error), r.json.error)
  }
  assert.ok(!fs.existsSync(path.join(box.root, 'target')), 'nothing was written')
  // Only that exact name: a name that merely contains it is a name like any other.
  assert.equal(setup(box, ['--dir', box.dir, '--name', 'claude-aether']).status, 0)
})

// The stub and newestLauncher choose a launcher by the same rule. Only a directory shaped like a release counts, and a
// launcher must be a file with an exec bit: a commit hash of another marketplace, or a launcher that lost its bit, never wins.
test('a directory that is not shaped like a release never wins over a version, in the stub and in the report', (t) => {
  const box = sandbox(t)
  addRelease(box.config, '0.12.3')
  for (const name of ['abc1234', 'deadbeef', '1a2b3c4', 'main', 'v9.9.9', 'zzzzzzz']) addRelease(box.config, name, { market: 'a-fork' })
  const r = setup(box, ['--dir', box.dir])
  assert.equal(r.json.launcherVersion, '0.12.3')
  const out = runStub(r.json.path, [], { config: box.config, home: box.home })
  assert.equal(out.status, 0, out.stderr)
  assert.deepEqual(lines(out.stdout), ['launcher 0.12.3'])
  // With nothing but those, there is no release, in both.
  const bare = sandbox(t)
  for (const name of ['abc1234', 'deadbeef']) addRelease(bare.config, name)
  const none = setup(bare, ['--dir', bare.dir])
  assert.equal(none.json.launcher, null)
  const stub = runStub(none.json.path, [], { config: bare.config, home: bare.home })
  assert.equal(stub.status, 1)
  assert.equal(lines(stub.stderr).length, 1, stub.stderr)
})

test('a launcher without the exec bit is skipped, and the next highest runs', (t) => {
  const box = sandbox(t)
  const next = addRelease(box.config, '0.12.3')
  addRelease(box.config, '0.12.10', { mode: 0o644 })
  addRelease(box.config, '0.13.0', { market: 'my-fork', mode: 0o600 })
  const r = setup(box, ['--dir', box.dir])
  assert.equal(r.json.launcher, next)
  assert.equal(r.json.launcherVersion, '0.12.3')
  const out = runStub(r.json.path, ['x'], { config: box.config, home: box.home })
  assert.equal(out.status, 0, out.stderr)
  assert.deepEqual(lines(out.stdout), ['launcher 0.12.3', 'x'])
  // With no launcher that can run, there is none.
  fs.chmodSync(next, 0o644)
  assert.equal(setup(box, ['--dir', box.dir]).json.launcher, null)
  const stub = runStub(r.json.path, [], { config: box.config, home: box.home })
  assert.equal(stub.status, 1)
  assert.equal(lines(stub.stderr).length, 1, stub.stderr)
})

// The look for the launcher is information for the result: it runs after the stub is written, and it never fails the run.
test('a looping link or an unreadable entry in the cache skips only itself, and the run still exits 0', (t) => {
  const box = sandbox(t)
  const good = addRelease(box.config, '0.12.3')
  const cache = path.join(box.config, 'plugins', 'cache')
  // A marketplace that is a link to itself, beside the good one, and a version that is one.
  fs.symlinkSync(path.join(cache, 'a-loop'), path.join(cache, 'a-loop'))
  fs.symlinkSync(path.join(cache, 'z-loop'), path.join(cache, 'z-loop'))
  const plugin = path.join(cache, 'aether-plugin', 'aether')
  fs.symlinkSync(path.join(plugin, '0.20.0'), path.join(plugin, '0.20.0'))
  // A version whose launcher directory is a link to itself, and one whose launcher is.
  fs.mkdirSync(path.join(plugin, '0.21.0'))
  fs.symlinkSync(path.join(plugin, '0.21.0', 'launcher'), path.join(plugin, '0.21.0', 'launcher'))
  fs.mkdirSync(path.join(plugin, '0.22.0', 'launcher'), { recursive: true })
  fs.symlinkSync(path.join(plugin, '0.22.0', 'launcher', 'aether-lead'), path.join(plugin, '0.22.0', 'launcher', 'aether-lead'))
  const r = setup(box, ['--dir', box.dir])
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
  assert.equal(r.json.installed, true)
  assert.equal(r.json.launcher, good)
  assert.equal(runStub(r.json.path, [], { config: box.config, home: box.home }).status, 0)
})

test('an entry of the cache that cannot be read skips only itself', (t) => {
  if (process.getuid && process.getuid() === 0) return t.skip('root reads every directory')
  const box = sandbox(t)
  const good = addRelease(box.config, '0.12.3')
  const locked = [
    path.dirname(addRelease(box.config, '0.30.0')),
    path.join(box.config, 'plugins', 'cache', 'aether-plugin', 'aether', '0.31.0', 'launcher'),
    path.join(box.config, 'plugins', 'cache', 'a-fork'),
  ]
  addRelease(box.config, '0.31.0')
  addRelease(box.config, '0.99.0', { market: 'a-fork' })
  try {
    for (const dir of locked) fs.chmodSync(dir, 0o000)
    const r = setup(box, ['--dir', box.dir])
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`)
    assert.equal(r.json.installed, true)
    assert.equal(r.json.launcher, good)
    assert.equal(r.json.launcherVersion, '0.12.3')
  } finally {
    for (const dir of locked) fs.chmodSync(dir, 0o755)
  }
})

// ---- the stub
// The stub of a sandbox, installed by the bin.
function installed(box) {
  const r = setup(box, ['--dir', box.dir])
  assert.equal(r.status, 0, r.stderr)
  return r.json.path
}

test('the stub runs the launcher of the newest release, 0.12.10 over 0.12.3 and 0.9.0, with its arguments whole', (t) => {
  const box = sandbox(t)
  for (const version of ['0.9.0', '0.12.3', '0.12.10']) addRelease(box.config, version)
  const stub = installed(box)
  const args = ['-p', 'two words', '', '--resume', '*', "it's", '$HOME', '--plugin-dir', '/some path/plugins/aether']
  const r = runStub(stub, args, { config: box.config, home: box.home })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(lines(r.stdout), ['launcher 0.12.10', ...args])
})

test('the stub looks at the cache when it runs, so a release installed later is the one it starts', (t) => {
  const box = sandbox(t)
  addRelease(box.config, '0.12.3')
  const stub = installed(box)
  assert.equal(lines(runStub(stub, [], { config: box.config, home: box.home }).stdout)[0], 'launcher 0.12.3')
  addRelease(box.config, '0.12.4')
  assert.equal(lines(runStub(stub, [], { config: box.config, home: box.home }).stdout)[0], 'launcher 0.12.4')
  addRelease(box.config, '0.13.0', { market: 'my-fork' })
  assert.equal(lines(runStub(stub, [], { config: box.config, home: box.home }).stdout)[0], 'launcher 0.13.0')
})

test('the stub ignores a release with no launcher and a launcher that is not a file', (t) => {
  const box = sandbox(t)
  addRelease(box.config, '0.12.3')
  addRelease(box.config, '0.20.0', { launcher: false })
  fs.mkdirSync(path.join(box.config, 'plugins', 'cache', 'aether-plugin', 'aether', '0.30.0', 'launcher', 'aether-lead'), { recursive: true })
  const r = runStub(installed(box), [], { config: box.config, home: box.home })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(lines(r.stdout), ['launcher 0.12.3'])
})

test('the stub honors CLAUDE_CONFIG_DIR, falls back to $HOME/.claude, and handles a path with spaces', (t) => {
  const box = sandbox(t)
  addRelease(path.join(box.home, '.claude'), '0.12.3')
  const spaced = path.join(box.root, 'a config dir')
  fs.mkdirSync(spaced)
  addRelease(spaced, '0.12.4')
  const stub = installed(box)
  assert.equal(lines(runStub(stub, [], { config: spaced, home: box.home }).stdout)[0], 'launcher 0.12.4')
  assert.equal(lines(runStub(stub, [], { home: box.home }).stdout)[0], 'launcher 0.12.3')
  // An empty CLAUDE_CONFIG_DIR is the same as none.
  assert.equal(lines(runStub(stub, [], { config: '', home: box.home }).stdout)[0], 'launcher 0.12.3')
  // The home may have spaces too.
  const home = path.join(box.root, 'my home')
  addRelease(path.join(home, '.claude'), '0.12.5')
  assert.equal(lines(runStub(stub, [], { home }).stdout)[0], 'launcher 0.12.5')
})

test('with no release installed the stub prints one line on stderr, says how to install the plugin, and exits 1', (t) => {
  const box = sandbox(t)
  const stub = installed(box)
  const r = runStub(stub, ['--resume'], { config: box.config, home: box.home })
  assert.equal(r.status, 1)
  assert.equal(r.stdout, '')
  assert.equal(lines(r.stderr).length, 1, r.stderr)
  assert.ok(r.stderr.includes('claude plugin install aether --marketplace DarkArty07/aether-plugin'), r.stderr)
  assert.ok(r.stderr.includes('aeth'), 'it names itself')
})

test('the stub gives the exit code of the launcher', (t) => {
  const box = sandbox(t)
  addRelease(box.config, '0.12.3')
  const r = runStub(installed(box), [], { config: box.config, home: box.home, extra: { EXIT_WITH: '7' } })
  assert.equal(r.status, 7)
})

test('the stub is POSIX sh: it runs under dash and bash --posix, and from fish', (t) => {
  const box = sandbox(t)
  addRelease(box.config, '0.12.3')
  const stub = installed(box)
  const env = { PATH: SYSTEM_PATH, HOME: box.home, CLAUDE_CONFIG_DIR: box.config }
  let ran = 0
  for (const [shell, flags] of [['dash', []], ['bash', ['--posix']], ['busybox', ['sh']]]) {
    if (spawnSync(shell, [...flags, '-c', 'exit 0'], { env }).error) continue
    const r = spawnSync(shell, [...flags, stub, 'a b'], { encoding: 'utf8', env })
    assert.equal(r.status, 0, `${shell}: ${r.stderr}`)
    assert.deepEqual(lines(r.stdout), ['launcher 0.12.3', 'a b'], shell)
    ran++
  }
  assert.ok(ran > 0, 'at least one POSIX shell ran the stub')
  if (spawnSync('fish', ['--version']).error) return
  const r = spawnSync('fish', ['--no-config', '-c', `${stub} 'a b'`], { encoding: 'utf8', env })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(lines(r.stdout), ['launcher 0.12.3', 'a b'])
})

// ---- the skill
test('the skill first-setup has a name, a one-line description and disable-model-invocation, and runs the command', () => {
  const text = fs.readFileSync(path.join(ROOT, 'plugins', 'aether', 'skills', 'first-setup', 'SKILL.md'), 'utf8')
  const block = text.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(block, 'the skill starts with front matter')
  const front = Object.fromEntries(block[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]))
  assert.equal(front.name, 'first-setup')
  assert.ok(front.description && front.description.length > 0, 'it has a description')
  assert.ok(front.description.length <= 200, 'the description is short')
  assert.equal(front['disable-model-invocation'], 'true')
  const body = text.slice(block[0].length)
  assert.ok(body.split('\n').length <= 40, 'the skill is short')
  for (const need of [
    'aether-first-setup --check', '--name', 'exit 3', 'PATH',
    // exit 1: give the error, and stop
    'exit 1', 'by hand', 'sudo', 'shell file',
    // the command is not found: the plugin is not enabled in this session
    'not found', 'not enabled', 'new session',
    // the PATH of the session is not the person's terminal
    'this session\'s `PATH`', 'new terminal', 'shellHint',
    // the name rules
    '64', '`claude`',
  ]) assert.ok(body.toLowerCase().includes(need.toLowerCase()), `the skill says ${need}`)
  assert.match(body, /not write (any )?code/i)
})
