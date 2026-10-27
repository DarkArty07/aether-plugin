'use strict'

// First setup: a small stub, `aeth` by default, that starts Aether mode with the launcher of the newest installed
// release. The stub looks for the launcher each time it runs, so it never goes stale, and it carries a marker line,
// which is how this module knows a file is its own: it replaces a stub and refuses anything else of the same name.
// It writes only inside the directory it is given, and never edits a shell file.
// Family: none.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { isExecutableFile } = require('./common.js')

const MARKER = '# aether-first-setup stub'
const DEFAULT_NAME = 'aeth'
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_NAME_LENGTH = 64
// The launcher runs `claude`, so a stub of that name would run itself.
const FORBIDDEN_NAME = 'claude'
// A version directory of the plugin cache: 0.12.3, not a commit hash. The stub's glob is the same rule.
const RELEASE_DIRECTORY = /^\d+\.\d+\.\d+/
const EXIT_USAGE = 2
const EXIT_TAKEN = 3
const STUB_MODE = 0o755
// A stub is a few lines; a file larger than this is not one, and is not read.
const MAX_STUB_BYTES = 64 * 1024

// A failure with the exit code the bin gives: 2 for a usage mistake, 3 for a name that is taken.
class SetupError extends Error {
  constructor(message, exitCode) {
    super(message)
    this.exitCode = exitCode
  }
}

const usageError = (message) => new SetupError(message, EXIT_USAGE)

// The stub is POSIX sh. It lists the launchers of the installed releases, as `<version> <path>` lines, takes the
// highest version by `sort -V` and runs it with every argument. The glob is the plugin cache's layout:
// <config dir>/plugins/cache/<marketplace>/aether/<version>/launcher/aether-lead, and only a version directory shaped
// like 0.12.3 counts, so the hash of a commit never wins. A launcher counts if it is a file that can be run.
// newestLauncher below is the same rule in JavaScript, and the two have to change together.
function stubText() {
  return `#!/bin/sh
${MARKER}
# Starts Aether mode with the launcher of the newest installed release. aether-first-setup wrote it and replaces it when
# it runs again; a file without the marker line above is never touched.
config="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
newest=$(
  for launcher in "$config"/plugins/cache/*/aether/[0-9]*.[0-9]*.[0-9]*/launcher/aether-lead; do
    [ -f "$launcher" ] && [ -x "$launcher" ] || continue
    release=\${launcher%/launcher/aether-lead}
    printf '%s %s\\n' "\${release##*/}" "$launcher"
  done | LC_ALL=C sort -V | tail -n 1
)
if [ -z "$newest" ]; then
  echo "\${0##*/}: no Aether release is installed; install it with: claude plugin install aether --marketplace DarkArty07/aether-plugin" >&2
  exit 1
fi
exec "\${newest#* }" "$@"
`
}

const homeOf = (env) => env.HOME || os.homedir()
const configDirOf = (env) => env.CLAUDE_CONFIG_DIR || path.join(homeOf(env), '.claude')

function expandHome(dir, home) {
  if (dir === '~') return home
  return dir.startsWith('~/') ? path.join(home, dir.slice(2)) : dir
}

// The path with its links resolved as far as it exists, so that a directory not made yet compares like one that is.
function canonical(target) {
  const rest = []
  let current = path.resolve(target)
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest)
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return path.resolve(target)
      rest.unshift(path.basename(current))
      current = parent
    }
  }
}

function statOrNull(file, follow = true) {
  try {
    return follow ? fs.statSync(file) : fs.lstatSync(file)
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null
    throw err
  }
}

// Whether the file, followed through links, has the marker as a line of its own.
function hasMarker(file) {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > MAX_STUB_BYTES) return false
    return fs.readFileSync(file, 'utf8').split('\n').includes(MARKER)
  } catch {
    return false
  }
}

// What a path holds: nothing ('free'), a stub of this command ('own', a plain file with the marker) or something else
// ('foreign': another file, a link, a directory). A link is never its own, even when it leads to a stub.
function classify(file) {
  const stat = statOrNull(file, false)
  if (!stat) return 'free'
  return stat.isFile() && hasMarker(file) ? 'own' : 'foreign'
}

function pathEntries(env) {
  return (env.PATH || '').split(path.delimiter).filter(Boolean).map((entry) => path.resolve(entry))
}

// The first executable of that name on the PATH that is not a stub of this command, or null.
function foreignOnPath(name, env) {
  for (const entry of pathEntries(env)) {
    const candidate = path.join(entry, name)
    if (isExecutableFile(candidate) && !hasMarker(candidate)) return candidate
  }
  return null
}

function isOnPath(dir, env) {
  const wanted = canonical(dir)
  return pathEntries(env).some((entry) => canonical(entry) === wanted)
}

// Numbers compare as numbers and the rest as text, so 0.12.10 is above 0.12.3, as `sort -V` has it in the stub.
function compareVersions(a, b) {
  const [left, right] = [a, b].map((version) => version.match(/\d+|\D+/g) || [])
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] === right[i]) continue
    const numbers = /^\d+$/.test(left[i]) && /^\d+$/.test(right[i])
    if (numbers) return Number(left[i]) - Number(right[i])
    return left[i] < right[i] ? -1 : 1
  }
  return left.length - right.length
}

// The directories of a directory, without the hidden ones, as a glob has them. An entry that cannot be read, such as a
// link that loops, is left out by itself; a directory that cannot be listed has none.
function subdirectories(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  return entries.filter((entry) => {
    if (entry.startsWith('.')) return false
    try {
      return fs.statSync(path.join(dir, entry)).isDirectory()
    } catch {
      return false
    }
  })
}

// The launcher of the newest installed release, or null: { launcher, version }. It reads the same layout, and applies
// the same rule, as the glob of the stub, so the result says what the stub would run now. It is information for the
// result and never throws: every entry that cannot be read is skipped by itself.
function newestLauncher(configDir) {
  const cache = path.join(configDir, 'plugins', 'cache')
  const found = []
  for (const market of subdirectories(cache)) {
    const plugin = path.join(cache, market, 'aether')
    for (const version of subdirectories(plugin).filter((entry) => RELEASE_DIRECTORY.test(entry))) {
      const launcher = path.join(plugin, version, 'launcher', 'aether-lead')
      if (isExecutableFile(launcher)) found.push({ launcher, version })
    }
  }
  found.sort((a, b) => compareVersions(a.version, b.version) || (a.launcher < b.launcher ? -1 : a.launcher > b.launcher ? 1 : 0))
  return found.length ? found[found.length - 1] : null
}

const SAFE_PATH = /^[A-Za-z0-9_./+~-]+$/
const singleQuoted = (text) => `'${text.replace(/'/g, `'\\''`)}'`

// The line to add so that the directory is on the PATH, for each shell. It is only printed.
function shellHint(dir) {
  const safe = SAFE_PATH.test(dir)
  const bash = safe ? `export PATH="${dir}:$PATH"` : `export PATH=${singleQuoted(dir)}":$PATH"`
  return [
    `${dir} is not on your PATH. Add it with one line:`,
    `  bash, in ~/.bashrc: ${bash}`,
    `  zsh, in ~/.zshrc: ${bash}`,
    `  fish, once: fish_add_path ${safe ? dir : singleQuoted(dir)}`,
  ].join('\n')
}

function validateName(name) {
  if (typeof name === 'string' && name.length > MAX_NAME_LENGTH) {
    throw usageError(`invalid name of ${name.length} characters: at most ${MAX_NAME_LENGTH}`)
  }
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw usageError(`invalid name ${JSON.stringify(name)}: use letters, digits, "." , "_" and "-", and start with a letter or a digit`)
  }
  if (name === FORBIDDEN_NAME) {
    throw usageError(`invalid name "${name}": the launcher runs \`claude\`, so a stub of that name would call itself in a loop`)
  }
}

function taken(what, name) {
  return new SetupError(`${what} Nothing was written. Pick another name with --name <name>, such as --name ${name}2.`, EXIT_TAKEN)
}

function makeDirectory(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'ENOTDIR') throw usageError(`--dir ${dir} is not a directory, and one cannot be made there`)
    throw err
  }
}

function writeNew(file, text, name) {
  let fd
  try {
    fd = fs.openSync(file, 'wx', STUB_MODE)
  } catch (err) {
    if (err.code === 'EEXIST') throw taken(`${file} appeared while this ran, and it is not a stub of this command.`, name)
    throw err
  }
  try {
    fs.fchmodSync(fd, STUB_MODE)
    fs.writeFileSync(fd, text)
  } catch (err) {
    fs.rmSync(file, { force: true })
    throw err
  } finally {
    fs.closeSync(fd)
  }
}

// A stub replaced in place: written whole to a temporary file of the same directory, then renamed over, so a reader of
// the old stub never sees half of the new one. Known limit: a process that creates a file of that name between the last
// check and the rename is overwritten by it. The window is microseconds and needs a writer in the person's own directory.
function replaceOwn(file, text, name) {
  const temporary = path.join(path.dirname(file), `.${name}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`)
  writeNew(temporary, text, name)
  try {
    // The check was made a moment ago; make it once more before the rename, which would overwrite anything.
    if (classify(file) !== 'own') throw taken(`${file} changed while this ran, and it is not a stub of this command.`, name)
    fs.renameSync(temporary, file)
  } catch (err) {
    fs.rmSync(temporary, { force: true })
    throw err
  }
}

// Installs the stub, or with `check` says what would happen and writes nothing. The result is the one JSON object of
// the bin; with `check`, `installed` is false and `replaced` says whether an own stub would be replaced.
function run({ name = DEFAULT_NAME, dir, check = false, env = process.env, cwd = process.cwd() } = {}) {
  validateName(name)
  const home = homeOf(env)
  if (dir !== undefined && (typeof dir !== 'string' || dir === '')) throw usageError('--dir needs a directory')
  const target = path.resolve(cwd, expandHome(dir ?? path.join(home, '.local', 'bin'), home))
  const stat = statOrNull(target)
  if (stat && !stat.isDirectory()) throw usageError(`--dir ${target} is not a directory`)

  const file = path.join(target, name)
  const state = classify(file)
  if (state === 'foreign') throw taken(`${file} exists and is not a stub of this command.`, name)
  const other = foreignOnPath(name, env)
  if (other) throw taken(`${other} is already a command on your PATH, and it is not a stub of this command.`, name)

  if (!check) {
    makeDirectory(target)
    if (state === 'own') replaceOwn(file, stubText(), name)
    else writeNew(file, stubText(), name)
  }
  const release = newestLauncher(configDirOf(env))
  const onPath = isOnPath(target, env)
  return {
    installed: !check,
    name,
    path: file,
    launcher: release ? release.launcher : null,
    launcherVersion: release ? release.version : null,
    onPath,
    replaced: state === 'own',
    shellHint: onPath ? null : shellHint(target),
  }
}

module.exports = { run, usageError, SetupError, MARKER, DEFAULT_NAME, stubText, newestLauncher, compareVersions }
