'use strict'

// Thin wrapper around the git CLI.
// Family: none.

const path = require('node:path')
const { spawnSync } = require('node:child_process')

// stdout and stderr come back trimmed. With raw: true, stdout is returned untrimmed, because
// leading spaces (porcelain status) and trailing newlines (patches) are part of the data, and
// `bytes` holds the exact bytes, which decoding them as text could alter.
function git(args, cwd, { allowFail = false, raw = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: raw ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  const stdout = raw ? r.stdout.toString('utf8') : r.stdout.trim()
  const stderr = (raw ? r.stderr.toString('utf8') : r.stderr).trim()
  const result = { status: r.status, stdout, stderr }
  if (raw) result.bytes = r.stdout
  if (r.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${stderr || stdout.trim()}`)
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
