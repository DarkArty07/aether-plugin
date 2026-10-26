'use strict'

// Generic helpers shared across the library modules without creating circular dependencies.
// Family: none.

const fs = require('node:fs')
const path = require('node:path')
const { git } = require('./git.js')

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

const numberOrZero = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const isText = (value) => typeof value === 'string' && value.trim() !== ''

const messageOf = (err) => (err && typeof err.message === 'string' && err.message ? err.message : String(err))

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function readTextOrEmpty(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function writeAtomic(targetPath, content) {
  const dir = path.dirname(targetPath)
  fs.mkdirSync(dir, { recursive: true })
  const base = path.basename(targetPath)
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`)
  try {
    fs.writeFileSync(tmp, content)
    fs.renameSync(tmp, targetPath)
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {}
  }
}

function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temp, text)
    fs.renameSync(temp, file)
  } catch (err) {
    fs.rmSync(temp, { force: true })
    throw err
  }
}

function exists(target) {
  try {
    fs.lstatSync(target)
    return true
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false
    throw err
  }
}

function isExecutableFile(file) {
  try {
    if (!fs.statSync(file).isFile()) return false
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

function killGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // The group is already empty.
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function nulEntries(text) {
  return text.split('\0').filter((entry) => entry !== '')
}

function removeWorktree(mainRoot, worktree) {
  git(['worktree', 'remove', '--force', worktree], mainRoot, { allowFail: true })
  fs.rmSync(worktree, { recursive: true, force: true })
  git(['worktree', 'prune'], mainRoot, { allowFail: true })
}

module.exports = {
  exists,
  isExecutableFile,
  isNumber,
  isObject,
  isText,
  killGroup,
  messageOf,
  nulEntries,
  numberOrZero,
  parseJson,
  pidAlive,
  readJson,
  readJsonOrNull,
  readTextOrEmpty,
  removeWorktree,
  sleep,
  sleepSync,
  writeAtomic,
  writeFileAtomic,
}
