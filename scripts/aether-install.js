#!/usr/bin/env node
'use strict'

// Usage: node scripts/aether-install.js install [<version>] | rollback | status
//
// Installs a tagged release of the plugin apart from the project, so a session that loads the
// installed copy is not disturbed by work in the project's checkout. Each release lives in
// <data>/installed/<version>-<commit>; the links `current` and `previous` name two of them.
// No network: everything comes from the repository's own tags.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { git, repoPaths } = require('../plugins/aether/lib/git.js')

const USAGE = 'usage: node scripts/aether-install.js install [<version>] | rollback | status'
const TAG_PREFIX = 'aether--v'
const MANIFEST = 'plugins/aether/.claude-plugin/plugin.json'
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const DIR_NAME = /^(.+)-([0-9a-f]{7})$/

// A refusal: its message is the whole output line, and the exit code is 1.
class Refusal extends Error {}

function dataDir(env) {
  return env.AETHER_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'aether-plugin')
}

function compareVersions(a, b) {
  const [pa, pb] = [a.split('.').map(Number), b.split('.').map(Number)]
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

// The tag's full commit id, or null when the tag does not exist.
function tagCommit(version, repoDir) {
  const r = git(['rev-parse', '--verify', '--quiet', `refs/tags/${TAG_PREFIX}${version}^{commit}`], repoDir, { allowFail: true })
  return r.status === 0 && r.stdout ? r.stdout : null
}

// The highest version among the tags of the form aether--v<major>.<minor>.<patch>, or null.
function latestVersion(repoDir) {
  const tags = git(['tag', '--list', `${TAG_PREFIX}*`], repoDir).stdout.split('\n')
  const versions = tags.filter((tag) => tag.startsWith(TAG_PREFIX) && VERSION.test(tag.slice(TAG_PREFIX.length))).map((tag) => tag.slice(TAG_PREFIX.length))
  return versions.length === 0 ? null : versions.sort(compareVersions).pop()
}

// The plugin version the manifest holds at the commit, or null when it is missing or unreadable.
function manifestVersion(commit, repoDir) {
  const r = git(['show', `${commit}:${MANIFEST}`], repoDir, { allowFail: true })
  if (r.status !== 0) return null
  try {
    const version = JSON.parse(r.stdout).version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

const dirName = (version, commit) => `${version}-${commit.slice(0, 7)}`
const describe = (name) => {
  const m = DIR_NAME.exec(name)
  return `${m[1]} (${m[2]})`
}

// What a link names, when it names a version directory that exists; otherwise null.
function readLink(installed, link) {
  let target
  try {
    target = fs.readlinkSync(path.join(installed, link))
  } catch {
    return null
  }
  if (!DIR_NAME.test(target) || target.includes('/')) return null
  return fs.existsSync(path.join(installed, target)) ? target : null
}

// Creates the link under a temporary name beside the old one, then renames it into place, so the
// link names either the old target or the new one and never nothing.
function setLink(linkPath, target) {
  const staging = `${linkPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  try {
    fs.symlinkSync(target, staging)
    fs.renameSync(staging, linkPath)
  } catch (error) {
    fs.rmSync(staging, { force: true })
    throw error
  }
}

function errorLines(text) {
  return text.trim().split('\n').map((line) => line.trim()).filter(Boolean).join('; ')
}

// Extracts the plugin and the launcher at the commit into `dir`. Only tracked files, as committed.
function extract(commit, version, repoDir, dir) {
  const fail = (text) => new Refusal(`cannot extract ${TAG_PREFIX}${version}: ${errorLines(text) || 'unknown error'}`)
  const archive = spawnSync('git', ['archive', '--format=tar', commit, 'plugins/aether', 'scripts/aether-mode.fish'], { cwd: repoDir, maxBuffer: 1024 * 1024 * 1024 })
  if (archive.error) throw fail(archive.error.message)
  if (archive.status !== 0) throw fail(archive.stderr.toString('utf8'))
  const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout })
  if (untar.error) throw fail(untar.error.message)
  if (untar.status !== 0) throw fail(untar.stderr.toString('utf8'))
}

// Makes sure installed/<name> exists and has dev-tree pointing at the main checkout.
function ensureVersionDir(installed, name, version, commit, repoDir, mainRoot) {
  const finalDir = path.join(installed, name)
  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(installed, { recursive: true })
    const tmp = path.join(installed, `.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`)
    fs.mkdirSync(tmp)
    try {
      extract(commit, version, repoDir, tmp)
      fs.symlinkSync(mainRoot, path.join(tmp, 'dev-tree'))
      fs.renameSync(tmp, finalDir)
    } catch (error) {
      fs.rmSync(tmp, { recursive: true, force: true })
      throw error
    }
    return
  }
  const devTree = path.join(finalDir, 'dev-tree')
  let current = null
  try {
    current = fs.readlinkSync(devTree)
  } catch {
    current = null
  }
  if (current !== mainRoot) setLink(devTree, mainRoot)
}

function switched(installed) {
  const current = readLink(installed, 'current')
  const previous = readLink(installed, 'previous')
  return `aether ${describe(current)} is now current; previous: ${previous ? `${describe(previous)}.` : 'none.'} It loads in the next aether-mode session.\n`
}

function install(version, installed, repoDir) {
  const { mainRoot } = repoPaths(repoDir)
  const wanted = version || latestVersion(repoDir)
  if (!wanted) throw new Refusal(`no ${TAG_PREFIX}* tag in ${mainRoot}.`)
  const commit = tagCommit(wanted, repoDir)
  if (!commit) throw new Refusal(`no tag ${TAG_PREFIX}${wanted}.`)
  const found = manifestVersion(commit, repoDir)
  if (found !== wanted) throw new Refusal(`${TAG_PREFIX}${wanted} holds plugin version ${found === null ? 'none' : found}, not ${wanted}.`)

  const name = dirName(wanted, commit)
  ensureVersionDir(installed, name, wanted, commit, repoDir, mainRoot)

  const old = readLink(installed, 'current')
  if (old === name) return `aether ${describe(name)} is already current.\n`
  if (old) setLink(path.join(installed, 'previous'), old)
  setLink(path.join(installed, 'current'), name)
  return switched(installed)
}

function rollback(installed) {
  const current = readLink(installed, 'current')
  const previous = readLink(installed, 'previous')
  if (!current || !previous) throw new Refusal('no previous version to roll back to.')
  setLink(path.join(installed, 'previous'), current)
  setLink(path.join(installed, 'current'), previous)
  return switched(installed)
}

function status(installed, repoDir) {
  const show = (name) => (name ? describe(name) : 'none')
  const latest = latestVersion(repoDir)
  const latestCommit = latest && tagCommit(latest, repoDir)
  return [
    `current: ${show(readLink(installed, 'current'))}`,
    `previous: ${show(readLink(installed, 'previous'))}`,
    `latest tag: ${latestCommit ? describe(dirName(latest, latestCommit)) : 'none'}`,
  ].join('\n') + '\n'
}

function main(argv, { env = process.env, repoDir = path.join(__dirname, '..') } = {}) {
  const [command, version, ...rest] = argv
  const valid =
    (command === 'install' && rest.length === 0 && (version === undefined || VERSION.test(version))) ||
    ((command === 'rollback' || command === 'status') && version === undefined)
  if (!valid) return { exitCode: 2, stdout: `${USAGE}\n` }
  const installed = path.join(dataDir(env), 'installed')
  try {
    if (command === 'install') return { exitCode: 0, stdout: install(version, installed, repoDir) }
    if (command === 'rollback') return { exitCode: 0, stdout: rollback(installed) }
    return { exitCode: 0, stdout: status(installed, repoDir) }
  } catch (error) {
    const message = error instanceof Refusal ? error.message : `aether-install: ${error.message}`
    return { exitCode: 1, stdout: `${message}\n` }
  }
}

if (require.main === module) {
  const result = main(process.argv.slice(2))
  process.stdout.write(result.stdout)
  process.exitCode = result.exitCode
}

module.exports = { main }
