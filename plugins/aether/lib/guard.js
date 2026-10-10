'use strict'

// The aether-guard decisions. decide: only the main session, the Lead and the Writer write specs,
// plans and tasks, and autonomy files are kept to aether-autonomy. Protected: docs/superpowers/specs/
// and plans/ (the old place), specs/NNN-<topic>/ spec.md, plan.md and tasks.md (Spec Kit), and
// .specify/memory/constitution.md. irreversibleClass: the irreversible class of a Bash command.
// Both are pure: they read a PreToolUse hook's JSON and never touch the file system.

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
// Targets that would reach the home directory, the root, or a path above the work.
const RISKY_TARGET = /^(\/|~(\/|$)|\$HOME(\/|$)|\$\{HOME\}(\/|$)|\.\.(\/|$))/
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

// sudo, env and NAME=value run the command that follows them, so they are dropped first.
function dropWrappers(words) {
  let i = 0
  while (i < words.length && (words[i] === 'sudo' || words[i] === 'env' || ASSIGNMENT.test(words[i]))) i++
  return words.slice(i)
}

function classOf(words) {
  for (const [cls, subcommands] of SUBCOMMANDS) {
    if (subcommands.some((sub) => argsAfter(words, sub) !== null)) return cls
  }
  for (const [cls, subcommand, test] of WITH_ARGS) {
    const args = argsAfter(words, subcommand)
    if (args !== null && test(args)) return cls
  }
  return null
}

// The segments of a command, each a list of shell words. Separators are && || ; | and newlines, but
// not inside quotes. A backslash takes the next character literally, and quotes come off the words.
function segmentsOf(command) {
  const segments = []
  let words = []
  // null between words; a quoted empty string is still a word.
  let word = null
  let quote = null
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
    } else if (ch === '\n' || ch === ';') {
      endSegment()
    } else if (ch === '|') {
      endSegment()
      if (command[i + 1] === '&') i++
    } else if (ch === '&' && command[i + 1] === '&') {
      endSegment()
      i++
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
  if (typeof command !== 'string') return null
  for (const words of segmentsOf(command)) {
    const cls = classOf(dropWrappers(words))
    if (cls !== null) return cls
  }
  return null
}

module.exports = { decide, irreversibleClass }
