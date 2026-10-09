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
