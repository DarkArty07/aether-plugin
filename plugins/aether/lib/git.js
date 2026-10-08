'use strict'

// Thin wrapper around the git CLI.

const path = require('node:path')
const { spawnSync } = require('node:child_process')

function git(args, cwd, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  const result = { status: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() }
  if (r.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  }
  return result
}

// worktree: top of the current worktree; mainRoot: the main checkout, which holds .aether/
function repoPaths(cwd) {
  const worktree = git(['rev-parse', '--show-toplevel'], cwd).stdout
  const gitCommonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).stdout
  return { worktree, gitCommonDir, mainRoot: path.dirname(gitCommonDir) }
}

function currentBranch(cwd) {
  return git(['branch', '--show-current'], cwd).stdout
}

function head(cwd) {
  return git(['rev-parse', 'HEAD'], cwd).stdout
}

module.exports = { git, repoPaths, currentBranch, head }
