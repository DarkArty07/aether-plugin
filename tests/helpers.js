'use strict'

// Shared test fixtures: throwaway git repositories and CLI runners.
// Every temporary directory is removed when its test ends.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const PLAN_BIN = path.join(PLUGIN, 'bin', 'aether-plan')
const WT_BIN = path.join(PLUGIN, 'bin', 'aether-wt')
const SESSION_BIN = path.join(PLUGIN, 'bin', 'aether-session-start')
// A lane table that does not exist, so a bin run by a test sees no lanes unless the test names a table.
const NO_LANES_CONFIG = path.join(os.tmpdir(), 'aether-no-lanes', 'lanes.json')

function tempDir(t, prefix = 'aether-test-') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function run(command, args, cwd, env = {}) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AETHER_LANES_CONFIG: NO_LANES_CONFIG, AETHER_SUPERDELEGATION: 'on', ...env },
  })
  if (r.error) throw r.error
  return r
}

function makeRepo(t, { prefix = 'aether-test-' } = {}) {
  const dir = tempDir(t, prefix)
  const git = (...args) => {
    const r = run('git', args, dir)
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`)
    return r.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Aether Test')
  git('config', 'user.email', 'aether-test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n')
  git('add', 'README.md')
  git('commit', '-q', '-m', 'base')
  git('switch', '-q', '-c', 'feature/x')
  return { dir, git }
}

function writePlan(dir, markdown) {
  const file = path.join(dir, 'plan.md')
  fs.writeFileSync(file, markdown)
  return file
}

function runBin(bin, args, cwd, env = {}) {
  const r = run(process.execPath, [bin, ...args], cwd, env)
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    json = null
  }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

function compile(repo, markdown, extra = []) {
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, markdown), ...extra], repo.dir)
  if (r.status !== 0) throw new Error(`compile failed: ${r.stdout}${r.stderr}`)
  return r.json
}

function commitIn(repo, dir, file, content, message) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), content)
  repo.git('-C', dir, 'add', file)
  repo.git('-C', dir, 'commit', '-q', '-m', message)
}

function useDataDir(t) {
  const dir = tempDir(t, 'aether-data-')
  const previous = process.env.AETHER_DATA_DIR
  process.env.AETHER_DATA_DIR = dir
  t.after(() => {
    if (previous === undefined) delete process.env.AETHER_DATA_DIR
    else process.env.AETHER_DATA_DIR = previous
  })
  return dir
}

function age(dir, hours) {
  const when = new Date(Date.now() - hours * 3600 * 1000)
  for (const entry of fs.readdirSync(dir, { recursive: true })) fs.utimesSync(path.join(dir, entry), when, when)
  fs.utimesSync(dir, when, when)
}

// Ages a run's directory and, when it has unit worktrees, those too.
function ageRun(args, hours) {
  age(args.runDir, hours)
  const worktrees = path.join(args.repoRoot, '.aether', 'worktrees', args.runId)
  if (fs.existsSync(worktrees)) age(worktrees, hours)
}

module.exports = {
  PLUGIN,
  PLAN_BIN,
  WT_BIN,
  SESSION_BIN,
  NO_LANES_CONFIG,
  tempDir,
  makeRepo,
  writePlan,
  runBin,
  compile,
  commitIn,
  useDataDir,
  age,
  ageRun,
}
