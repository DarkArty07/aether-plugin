'use strict'

// The aether-guard decisions. decide: only the main session, the Lead and the Writer write specs,
// plans and tasks, and autonomy files are kept to aether-autonomy. Protected: docs/superpowers/specs/
// and plans/ (the old place), specs/NNN-<topic>/ spec.md, plan.md and tasks.md (Spec Kit), and
// .specify/memory/constitution.md. irreversibleClass: the irreversible class of a Bash command, and
// redactCommand: the command as the owner's list keeps it, without its secret values.
// All are pure: they read a PreToolUse hook's JSON and never touch the file system.

const path = require('node:path')

const CHECKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const PROTECTED = [
  /(^|\/)docs\/superpowers\/(specs|plans)\//,
  /(^|\/)specs\/\d{3}-[^/]+\/(spec|plan|tasks)\.md$/,
  /(^|\/)\.specify\/memory\/constitution\.md$/,
]
const AUTONOMY_PROTECTED = /(^|\/)\.aether\/autonomy\/(grants\.json|[^/]+\/run\.json)$/
const LEAD = 'aether:lead'
const WRITER = 'aether:writer'

// decide(input) gives null to allow, or { reason } to deny.
function decide(input) {
  if (!isObject(input) || !CHECKED_TOOLS.has(input.tool_name) || !isObject(input.tool_input)) return null

  const target = input.tool_name === 'NotebookEdit' ? input.tool_input.notebook_path : input.tool_input.file_path
  if (typeof target !== 'string') return null

  const base = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd()
  const resolved = path.resolve(base, target)
  const normalized = resolved.split(path.sep).join('/')

  if (AUTONOMY_PROTECTED.test(normalized)) {
    return {
      reason: `Aether's autonomy registry and run states are written only by aether-autonomy. Use \`aether-autonomy\` (grant, revoke, start, spend, end) instead of editing ${resolved}.`,
    }
  }

  if (!PROTECTED.some((re) => re.test(normalized))) return null
  if (mayWriteDocs(input)) return null

  return {
    reason: `In Aether mode only the Lead and the Writer write specs, plans and tasks. Hand this change to the Lead, or to the aether:writer agent, instead of editing ${resolved} yourself.`,
  }
}

// The main session's hook input names no agent. An input that names one, by agent_id or agent_type,
// may write only when its agent_type is the Lead's or the Writer's.
function mayWriteDocs(input) {
  if (input.agent_type === LEAD || input.agent_type === WRITER) return true
  return isBlank(input.agent_id) && isBlank(input.agent_type)
}

function isBlank(value) {
  return value === undefined || value === null || value === ''
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// The Bash classes. A segment is in a class when its words start with one of these subcommands.
const SUBCOMMANDS = [
  ['merge-main', ['gh pr merge']],
  [
    'publish',
    [
      'npm publish',
      'pnpm publish',
      'yarn publish',
      'yarn npm publish',
      'cargo publish',
      'twine upload',
      'gem push',
      'docker push',
      'gh release create',
    ],
  ],
  [
    'deploy',
    [
      'kubectl apply',
      'kubectl delete',
      'terraform apply',
      'terraform destroy',
      'helm install',
      'helm upgrade',
      'fly deploy',
      'flyctl deploy',
      'firebase deploy',
      'serverless deploy',
      'sls deploy',
      'gcloud app deploy',
      'gcloud run deploy',
    ],
  ],
  [
    'credentials',
    [
      'gh auth login',
      'gh auth refresh',
      'gh auth token',
      'gh secret set',
      'gh secret delete',
      'npm token create',
      'aws configure',
      'aws iam create-access-key',
    ],
  ],
]

// A dry run of a publish or a deploy changes nothing, so it is not irreversible.
const DRY_RUN_CLASSES = new Set(['publish', 'deploy'])

// The subcommands that also depend on the arguments after them.
const WITH_ARGS = [
  // A dry run changes nothing, so it is not a push.
  ['push', 'git push', (args) => !args.includes('--dry-run') && !args.includes('-n')],
  ['deploy', 'netlify deploy', (args) => hasFlag(args, '', '--prod')],
  ['deploy', 'vercel', (args) => hasFlag(args, '', '--prod')],
  ['delete', 'git branch', (args) => hasFlag(args, 'D')],
  ['delete', 'git reset', (args) => hasFlag(args, '', '--hard')],
  ['delete', 'git clean', (args) => hasFlag(args, 'f', '--force')],
  ['delete', 'rm', isForcedRemoval],
]

const SHORT_FLAGS = /^-[A-Za-z]+$/
// Targets that reach the root, the home directory, a parent or the current directory, and nothing deeper:
// "/", an absolute path with one component, "~" or $HOME with at most one component below it, only ".."
// components, and "." or "*". Each may end in "/" or "/*".
const RISKY_TARGET = /^(\/\*?|\/[^/]+(\/|\/\*)?|(~|\$HOME|\$\{HOME\})(\/|\/\*|\/[^/]+(\/|\/\*)?)?|\.\.(\/\.\.)*(\/|\/\*)?|\.(\/\*?)?|\*)$/
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

// The long flag, or a short-flag cluster such as -rf that holds one of the letters.
function hasFlag(args, letters, long = null) {
  return args.some((a) => a === long || (SHORT_FLAGS.test(a) && [...letters].some((letter) => a.includes(letter))))
}

function isForcedRemoval(args) {
  if (!hasFlag(args, 'rR', '--recursive') || !hasFlag(args, 'f', '--force')) return false
  return args.some((a) => !a.startsWith('-') && RISKY_TARGET.test(a))
}

// The words after `subcommand`, or null when the words do not start with it.
function argsAfter(words, subcommand) {
  const head = subcommand.split(' ')
  return head.every((word, i) => words[i] === word) ? words.slice(head.length) : null
}

// The options that take the next word as their value when they are written without "=". Every other
// word that starts with "-" is one option.
const GIT_VALUED = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env']
const SUDO_VALUED = ['-u', '-g', '-h', '-p', '-C', '-D']
const ENV_VALUED = ['-u']
const TIMEOUT_VALUED = ['-s', '--signal', '-k', '--kill-after']
const NICE_VALUED = ['-n']
const EXEC_VALUED = ['-a']
// The wrappers whose only options take no value.
const PLAIN_WRAPPERS = new Set(['nohup', 'time', 'command'])
// The shells that run the script after -c, and eval, which runs its words joined by spaces.
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash'])
// A script that a shell or eval runs is classed this many levels deep, the command itself being level 0.
const MAX_NESTING = 3

// The index of the first word after the options that start at i. A valued option takes the word after it.
function skipOptions(words, i, valued) {
  let at = i
  while (at < words.length && words[at].startsWith('-')) at += valued.includes(words[at]) ? 2 : 1
  return at
}

// The words that the wrappers in front of a command leave: sudo, env, timeout, nice, exec and the plain
// wrappers, each with its options, and NAME=value assignments. timeout also takes its duration.
function dropWrappers(words) {
  let i = 0
  while (i < words.length) {
    const word = words[i]
    if (ASSIGNMENT.test(word)) i++
    else if (word === 'sudo') i = skipOptions(words, i + 1, SUDO_VALUED)
    else if (word === 'env') i = skipOptions(words, i + 1, ENV_VALUED)
    else if (word === 'timeout') i = skipOptions(words, i + 1, TIMEOUT_VALUED) + 1
    else if (word === 'nice') i = skipOptions(words, i + 1, NICE_VALUED)
    else if (word === 'exec') i = skipOptions(words, i + 1, EXEC_VALUED)
    else if (PLAIN_WRAPPERS.has(word)) i = skipOptions(words, i + 1, [])
    else break
  }
  return words.slice(i)
}

// git's options before the subcommand are dropped, so that git -C dir push reads as git push.
function dropGitOptions(words) {
  if (words[0] !== 'git') return words
  return ['git', ...words.slice(skipOptions(words, 1, GIT_VALUED))]
}

// The script that a shell or eval runs, or null. A shell runs the word after its first single-dash
// option that holds a c, as in bash -lc SCRIPT; eval runs the words after it.
function scriptOf(words) {
  if (words[0] === 'eval') return words.slice(1).join(' ')
  if (!SHELLS.has(words[0])) return null
  for (let i = 1; i < words.length && words[i].startsWith('-'); i++) {
    if (/^-[^-]*c/.test(words[i])) return words[i + 1] ?? null
  }
  return null
}

// Whether a class's command is a dry run, by its arguments: --dry-run, or --dry-run= with a value.
function isDryRun(cls, args) {
  return DRY_RUN_CLASSES.has(cls) && args.some((a) => a === '--dry-run' || a.startsWith('--dry-run='))
}

// The class of the first subcommand that the words start with, with the words of that subcommand. A dry
// run does not match, and the search goes on.
function subcommandOf(words) {
  for (const [cls, subcommands] of SUBCOMMANDS) {
    for (const sub of subcommands) {
      const args = argsAfter(words, sub)
      if (args !== null && !isDryRun(cls, args)) return { cls, head: sub.split(' ') }
    }
  }
  for (const [cls, subcommand, test] of WITH_ARGS) {
    const args = argsAfter(words, subcommand)
    if (args !== null && test(args) && !isDryRun(cls, args)) return { cls, head: subcommand.split(' ') }
  }
  return null
}

// The match of one command's words: its class and the words of its subcommand, or null. A shell or eval
// is matched by the script it runs, one level deeper. When wanted is given, only that class matches.
function matchWords(words, depth, wanted) {
  const command = dropGitOptions(dropWrappers(words))
  const script = scriptOf(command)
  if (script !== null) return depth < MAX_NESTING ? matchCommand(script, depth + 1, wanted) : null
  const found = subcommandOf(command)
  return found !== null && (wanted === null || found.cls === wanted) ? found : null
}

// The first match among a command's segments, or the first of class wanted when it is given.
function matchCommand(command, depth, wanted = null) {
  if (typeof command !== 'string') return null
  for (const words of segmentsOf(command)) {
    const found = matchWords(words, depth, wanted)
    if (found !== null) return found
  }
  return null
}

// Reads the delimiter of a heredoc whose "<<" ends just before start, and queues it. Its quotes come off,
// and a "-" before it means the body's leading tabs are ignored. Returns the index of the last character read.
function readHeredoc(command, start, heredocs) {
  let i = start
  const strip = command[i] === '-'
  if (strip) i++
  while (command[i] === ' ' || command[i] === '\t') i++
  let word = ''
  while (i < command.length && !/[\s;&|()<>]/.test(command[i])) {
    const ch = command[i]
    if (ch === "'" || ch === '"') {
      const close = command.indexOf(ch, i + 1)
      const stop = close === -1 ? command.length : close
      word += command.slice(i + 1, stop)
      i = stop + 1
    } else if (ch === '\\' && i + 1 < command.length) {
      word += command[i + 1]
      i += 2
    } else {
      word += ch
      i++
    }
  }
  if (word === '') return start - 1
  heredocs.push({ word, strip })
  return i - 1
}

// Skips the bodies of the heredocs that a command line started, from start, the index after its newline.
// Each body runs up to the line equal to its delimiter. Returns the index of the last character skipped.
function skipHeredocBodies(command, start, heredocs) {
  let pos = start
  for (const { word, strip } of heredocs) {
    while (pos < command.length) {
      const end = command.indexOf('\n', pos)
      const line = command.slice(pos, end === -1 ? command.length : end)
      pos = end === -1 ? command.length : end + 1
      if ((strip ? line.replace(/^\t+/, '') : line) === word) break
    }
  }
  return pos - 1
}

// The segments of a command, each a list of shell words. Separators are && || ; | & newlines, ( ) and
// backquotes, and a { or } that stands alone as a word, none of them inside quotes. A backslash takes
// the next character literally, and quotes come off the words. A heredoc body is text: it runs from the
// line after the command line that starts it, up to its delimiter.
function segmentsOf(command) {
  const segments = []
  let words = []
  // null between words; a quoted empty string is still a word.
  let word = null
  let quote = null
  // The heredocs that the current command line started, whose bodies follow its newline.
  const heredocs = []
  const endWord = () => {
    if (word !== null) words.push(word)
    word = null
  }
  const endSegment = () => {
    endWord()
    if (words.length > 0) segments.push(words)
    words = []
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    const next = command[i + 1]
    if (quote === "'") {
      if (ch === "'") quote = null
      else word += ch
    } else if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '\\' && i + 1 < command.length && '"\\$`'.includes(command[i + 1])) word += command[++i]
      else word += ch
    } else if (ch === '\\' && i + 1 < command.length) {
      // A backslash-newline continues the line; any other escaped character is taken literally.
      i++
      if (command[i] !== '\n') word = (word ?? '') + command[i]
    } else if (ch === "'" || ch === '"') {
      quote = ch
      word = word ?? ''
    } else if (ch === ' ' || ch === '\t' || ch === '\r') {
      endWord()
    } else if (ch === '\n') {
      endSegment()
      if (heredocs.length > 0) i = skipHeredocBodies(command, i + 1, heredocs.splice(0))
    } else if (ch === ';' || ch === '(' || ch === ')' || ch === '`') {
      endSegment()
    } else if (ch === '|' || ch === '&') {
      // A doubled operator, || && or |&, is one separator.
      endSegment()
      if (next === ch || (ch === '|' && next === '&')) i++
    } else if ((ch === '{' || ch === '}') && word === null && (next === undefined || /[\s;&|()]/.test(next))) {
      // A brace that stands alone as a word is a group, which the segment ends at.
      endSegment()
    } else if (ch === '<' && next === '<' && command[i + 2] === '<') {
      // A here-string: the word after it is read as a word, and it has no body.
      endWord()
      i += 2
    } else if (ch === '<' && next === '<') {
      endWord()
      i = readHeredoc(command, i + 2, heredocs)
    } else {
      word = (word ?? '') + ch
    }
  }
  endSegment()
  return segments
}

// The irreversible class of a Bash command: push, merge-main, publish, deploy, delete or credentials,
// or null. The first segment that matches decides.
function irreversibleClass(command) {
  const found = matchCommand(command, 0)
  return found === null ? null : found.cls
}

// The secret values that the owner's list must not keep: a NAME=value word whose name holds one of these,
// a value after a secret flag (as "--flag value" or "--flag=value"), and the user-info of a URL.
const SECRET_NAME = /TOKEN|KEY|SECRET|PASS|AUTH/i
const SECRET_ASSIGNMENT = /(^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|[^\s;&|()]*)/g
const SECRET_FLAG = /(^|\s)(--(?:token|password|passwd|secret|otp|api-key|auth|body))(=|\s+)("[^"]*"|'[^']*'|[^\s;&|()]*)/g
const URL_USER_INFO = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]+@/g

// The command with its secret values replaced, and the rest of it spelled as it was.
function redactValues(command) {
  return command
    .replace(SECRET_ASSIGNMENT, (match, lead, name) => (SECRET_NAME.test(name) ? `${lead}${name}=[redacted]` : match))
    .replace(SECRET_FLAG, (match, lead, flag, sep) => `${lead}${flag}${sep}[redacted]`)
    .replace(URL_USER_INFO, '$1[redacted]@')
}

// The command as the owner's list keeps it. A credentials command keeps only its subcommand, since its
// arguments are the secret; any other command keeps its spelling, with its secret values redacted.
function redactCommand(command, cls) {
  if (typeof command !== 'string') return ''
  if (cls !== 'credentials') return redactValues(command)
  const found = matchCommand(command, 0, cls)
  return found === null ? '[redacted]' : [...found.head, '[arguments redacted]'].join(' ')
}

module.exports = { decide, irreversibleClass, redactCommand }
