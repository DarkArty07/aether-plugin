'use strict'

// Generic helpers shared across the library modules without creating circular dependencies.
// Family: none.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
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

// The last maxBuffer bytes of a file as text, and whether the file held more. A file that cannot be read is empty.
function readTail(file, maxBuffer) {
  try {
    const size = fs.statSync(file).size
    const length = Math.min(size, maxBuffer)
    const fd = fs.openSync(file, 'r')
    try {
      const buffer = Buffer.alloc(length)
      fs.readSync(fd, buffer, 0, length, size - length)
      return { text: buffer.toString('utf8'), overflow: size > maxBuffer }
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return { text: '', overflow: false }
  }
}

// Runs sh -c <command> as a process-group leader with stdout and stderr to temporary files, so a grandchild
// that inherits them cannot keep the call hanging on a pipe. Returns a spawnSync-shaped object with stdout and
// stderr as text, and never throws. On timeoutMs spawnSync kills the shell itself with SIGKILL (killSignal, so a
// shell that traps or ignores SIGTERM cannot hold the call), then the rest of the group is killed with
// killGroup(pid); then status is null and error.code is 'ETIMEDOUT'.
function runShell(command, { cwd, timeoutMs, env = process.env, maxBuffer = 64 * 1024 * 1024 } = {}) {
  let tmpDir = null
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-runShell-'))
    const outFile = path.join(tmpDir, 'stdout')
    const errFile = path.join(tmpDir, 'stderr')
    const outFd = fs.openSync(outFile, 'w')
    let errFd = null
    try {
      errFd = fs.openSync(errFile, 'w')
    } catch (err) {
      try {
        fs.closeSync(outFd)
      } catch {}
      throw err
    }
    let result = null
    try {
      const options = { cwd, env, detached: true, stdio: ['ignore', outFd, errFd], killSignal: 'SIGKILL' }
      if (timeoutMs !== undefined && timeoutMs !== null) options.timeout = timeoutMs
      result = spawnSync('sh', ['-c', command], options)
    } finally {
      try {
        fs.closeSync(outFd)
      } catch {}
      if (errFd !== null) {
        try {
          fs.closeSync(errFd)
        } catch {}
      }
    }
    if (result.error && result.error.code === 'ETIMEDOUT' && typeof result.pid === 'number') {
      // The shell is already dead: spawnSync killed it with SIGKILL at the deadline. Only the rest of the
      // group (background children, grandchildren) still needs killing.
      killGroup(result.pid)
    }
    // At most maxBuffer bytes of each file, the last ones (every caller keeps the tail). More than that is what
    // spawnSync calls ENOBUFS: the call did not finish as far as the caller can tell, so status is null.
    const out = readTail(outFile, maxBuffer)
    const err = readTail(errFile, maxBuffer)
    let error = result.error
    if (!error && (out.overflow || err.overflow)) {
      error = new Error(`${out.overflow ? 'stdout' : 'stderr'} maxBuffer length exceeded`)
      error.code = 'ENOBUFS'
    }
    const status = error && error.code === 'ENOBUFS' ? null : result.status
    return { status, signal: result.signal, stdout: out.text, stderr: err.text, error, pid: result.pid }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (error.code === undefined) error.code = 'SPAWN'
    return { status: null, signal: null, stdout: '', stderr: '', error, pid: undefined }
  } finally {
    if (tmpDir !== null) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  }
}

// Runs fn while holding an exclusive lock file next to the target, so that two processes ending together do not
// each read the target, compare, and let the shorter write come last. The lock never fails a call: a lock older
// than staleMs belongs to a process that died inside it and is broken; when the lock cannot be taken within
// waitMs, fn runs without it. Not reentrant.
function withLock(target, fn, { waitMs = 2000, staleMs = 10000 } = {}) {
  const lock = `${target}.lock`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const deadline = Date.now() + waitMs
  let held = false
  while (!held && Date.now() < deadline) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'))
      held = true
    } catch (err) {
      if (err.code !== 'EEXIST') break
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > staleMs) fs.unlinkSync(lock)
        else sleepSync(5)
      } catch {}
    }
  }
  try {
    return fn()
  } finally {
    if (held) {
      try {
        fs.unlinkSync(lock)
      } catch {}
    }
  }
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
  runShell,
  sleep,
  sleepSync,
  withLock,
  writeAtomic,
  writeFileAtomic,
}
