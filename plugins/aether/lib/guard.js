'use strict'

// PreToolUse decisions and irreversible command classification for Aether sessions.
// Protects specs, plans, tasks (specs/NNN-<topic>/), the constitution (.specify/memory/constitution.md),
// and the intent card (specs/NNN-<topic>/intent.md). Protection of docs/superpowers/specs/ and
// docs/superpowers/plans/ stays in force even though that folder is not in the tree.
// Records irreversible Bash commands across the classes: merge-main, push, publish, deploy, delete,
// and credentials. The paid-call class is in CLASSES of autonomy.js, but the guard does not detect it;
// it is only granted and checked with aether-autonomy. Redacts secret values from logged commands.
// Family: none.

const path = require('node:path')
const { isObject } = require('./common.js')

const CHECKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const PROTECTED = [
  /(^|\/)docs\/superpowers\/(specs|plans)\//,
  /(^|\/)specs\/\d{3}-[^/]+\/(spec|plan|tasks)\.md$/,
  /(^|\/)\.specify\/memory\/constitution\.md$/,
]
const AUTONOMY_PROTECTED = /(^|\/)\.aether\/autonomy\/(grants\.json|[^/]+\/run\.json)$/
const LEAD = 'aether:lead'
const WRITER = 'aether:writer'
const EXAMINER = 'aether:examiner'
const EXAM_PATH = /(^|\/)\.aether-exam\//
const INTENT_CARD = /(^|\/)specs\/\d{3}-[^/]+\/intent\.md$/

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

  // The Examiner's exam must stay out of the repository and of the swarm's sight, so it writes nothing else.
  if (input.agent_type === EXAMINER && !EXAM_PATH.test(normalized)) {
    return {
      reason: `In Aether mode the Examiner writes only its exam, under .aether-exam/ at the repository root. Write ${path.basename(resolved)} there instead of ${resolved}.`,
    }
  }

  // The owner's own words in the intent card are the Lead's to write, and no one else's.
  if (INTENT_CARD.test(normalized)) {
    if (isLeadOrMainSession(input)) return null
    return {
      reason: `In Aether mode only the Lead writes the intent card (intent.md): it holds the owner's own words. Hand a change to the Lead instead of editing ${resolved} yourself.`,
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
  return input.agent_type === WRITER || isLeadOrMainSession(input)
}

// The Lead, or the main session: an input that names no agent at all.
function isLeadOrMainSession(input) {
  if (input.agent_type === LEAD) return true
  return isBlank(input.agent_id) && isBlank(input.agent_type)
}

function isBlank(value) {
  return value === undefined || value === null || value === ''
}

// The Bash classes. A segment is in a class when its words start with one of these subcommands.
// A plain git merge is merge-main only when it lands on main or master: see landsOnMain.
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

// A command's name: the last part of a path such as /usr/bin/git, or the word itself.
function nameOf(word) {
  return word.includes('/') ? path.posix.basename(word) : word
}

// The words that the wrappers in front of a command leave: sudo, env, timeout, nice, exec and the plain
// wrappers, each with its options, and NAME=value assignments. timeout also takes its duration.
function dropWrappers(words) {
  let i = 0
  while (i < words.length) {
    // An assignment is read as it is written; a wrapper by its name, so /usr/bin/sudo is sudo.
    const word = nameOf(words[i])
    if (ASSIGNMENT.test(words[i])) i++
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

// What a command line leaves for the merge-main class, read segment by segment in order: here, the directory
// the next segment runs in (null when it is not known), and branches, the branch that a git checkout or switch
// left current in each directory. A directory not in branches is read from git once, when a merge needs it.
function sequenceOf(cwd) {
  return { here: typeof cwd === 'string' && cwd !== '' ? path.resolve(cwd) : null, branches: new Map() }
}

// The directory that dir names when run from base, or null when that cannot be told: "~", "$" and "-" paths,
// and a relative path with no base.
function resolveDir(base, dir) {
  if (/^[-~$]/.test(dir)) return null
  if (path.isAbsolute(dir)) return dir
  return base === null ? null : path.resolve(base, dir)
}

// The directory a git command runs in: the cwd of the line, moved by each of its -C options in turn.
function gitDirOf(sequence, dirs) {
  return dirs.reduce((base, dir) => resolveDir(base, dir), sequence.here)
}

// The branch current in dir, or null when there is none: detached, not a repository, or not known.
function branchOf(sequence, dir) {
  if (!sequence.branches.has(dir)) {
    const { currentBranch } = require('./git.js')
    let branch = null
    try {
      branch = dir === null ? null : currentBranch(dir) || null
    } catch {
      branch = null
    }
    sequence.branches.set(dir, branch)
  }
  return sequence.branches.get(dir)
}

// A git command's -C directories, its subcommand and the words after it, or null when the words are not git.
function gitCall(words) {
  if (words[0] !== 'git') return null
  const dirs = []
  let i = 1
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C') dirs.push(words[i + 1] ?? '')
    i += GIT_VALUED.includes(words[i]) ? 2 : 1
  }
  return { dirs, sub: words[i], args: words.slice(i + 1) }
}

const MAIN_BRANCHES = new Set(['main', 'master'])
// The options of git checkout and git switch that create a branch and make it current, with its name after them.
const NEW_BRANCH = ['-b', '-B', '-c', '-C']
// The merge options that do not merge: they abort, continue or quit a merge in progress.
const MERGE_CONTROL = ['--abort', '--continue', '--quit']

// The branch that a git checkout or switch leaves current: its name; null when it is not known (detached, "-",
// or a commit that is no branch, or a directory that cannot be read); or undefined when it leaves the branch as
// it is (a path checkout).
function switchedTo(args, dir) {
  const created = args.findIndex((a) => NEW_BRANCH.includes(a))
  if (created !== -1) return args[created + 1] ?? null
  if (args.some((a) => a === '--detach' || a === '-d')) return null
  const target = args.find((a) => !a.startsWith('-'))
  if (target === undefined) return undefined
  if (MAIN_BRANCHES.has(target)) return target
  if (target === '-' || dir === null) return null
  const { git } = require('./git.js')
  if (git(['show-ref', '--verify', '--quiet', `refs/heads/${target}`], dir, { allowFail: true }).status === 0) return target
  if (git(['rev-parse', '--verify', '--quiet', `${target}^{commit}`], dir, { allowFail: true }).status === 0) return null
  return undefined
}

// Moves the sequence past one segment: cd changes the directory of the rest of the line, and git checkout or
// git switch changes the branch of the directory it runs in. Any other segment leaves the sequence as it is.
function followSegment(words, sequence) {
  if (words[0] === 'cd') {
    sequence.here = words.length > 1 ? resolveDir(sequence.here, words[1]) : null
    return
  }
  const git = gitCall(words)
  if (git === null || (git.sub !== 'checkout' && git.sub !== 'switch')) return
  const dir = gitDirOf(sequence, git.dirs)
  let branch
  try {
    branch = switchedTo(git.args, dir)
  } catch {
    branch = null
  }
  if (branch !== undefined) sequence.branches.set(dir, branch)
}

// Whether a git merge lands on main or master: the branch of its directory, after the switches before it in the
// line. A merge that aborts, continues or quits is not one.
function landsOnMain(git, sequence) {
  if (git.sub !== 'merge' || git.args.some((a) => MERGE_CONTROL.includes(a))) return false
  return MAIN_BRANCHES.has(branchOf(sequence, gitDirOf(sequence, git.dirs)))
}

// The match of one command's words: its class and the words of its subcommand, or null. A shell or eval
// is matched by the script it runs, one level deeper. When wanted is given, only that class matches.
function matchWords(words, depth, wanted, sequence) {
  const unwrapped = dropWrappers(words)
  // A command run by its path, such as /usr/bin/git, is matched by its name.
  const named = unwrapped.length > 0 ? [nameOf(unwrapped[0]), ...unwrapped.slice(1)] : unwrapped
  followSegment(named, sequence)
  const command = dropGitOptions(named)
  const script = scriptOf(command)
  if (script !== null) return depth < MAX_NESTING ? matchCommand(script, depth + 1, wanted, sequence) : null
  const git = gitCall(named)
  const mergesToMain = git !== null && landsOnMain(git, sequence)
  const found = mergesToMain ? { cls: 'merge-main', head: ['git', 'merge'] } : subcommandOf(command)
  return found !== null && (wanted === null || found.cls === wanted) ? found : null
}

// The first match among a command's segments, or the first of class wanted when it is given.
function matchCommand(command, depth, wanted = null, sequence = sequenceOf()) {
  if (typeof command !== 'string') return null
  for (const words of segmentsOf(command)) {
    const found = matchWords(words, depth, wanted, sequence)
    if (found !== null) return found
  }
  return null
}

// Reads the delimiter of a heredoc whose "<<" ends just before start, and queues it. Its quotes come off,
// a "-" before it means the body's leading tabs are ignored, and a quoted delimiter (a quote or a backslash
// in it) keeps the body from expanding. Returns the index of the last character read.
function readHeredoc(command, start, heredocs) {
  let i = start
  const strip = command[i] === '-'
  if (strip) i++
  while (command[i] === ' ' || command[i] === '\t') i++
  let word = ''
  let quoted = false
  while (i < command.length && !/[\s;&|()<>]/.test(command[i])) {
    const ch = command[i]
    if (ch === "'" || ch === '"') {
      quoted = true
      const close = command.indexOf(ch, i + 1)
      const stop = close === -1 ? command.length : close
      word += command.slice(i + 1, stop)
      i = stop + 1
    } else if (ch === '\\' && i + 1 < command.length) {
      quoted = true
      word += command[i + 1]
      i += 2
    } else {
      word += ch
      i++
    }
  }
  if (word === '') return start - 1
  heredocs.push({ word, strip, quoted })
  return i - 1
}

// The bodies of the heredocs that a command line started, from start, the index after its newline. Each
// body runs up to the line equal to its delimiter. Gives the bodies and the index of the last character read.
function heredocBodies(command, start, heredocs) {
  let pos = start
  const bodies = []
  for (const { word, strip, quoted } of heredocs) {
    const from = pos
    let upto = command.length
    while (pos < command.length) {
      const lineFrom = pos
      const end = command.indexOf('\n', pos)
      const line = command.slice(pos, end === -1 ? command.length : end)
      pos = end === -1 ? command.length : end + 1
      if ((strip ? line.replace(/^\t+/, '') : line) === word) {
        upto = lineFrom
        break
      }
    }
    bodies.push({ text: command.slice(from, upto), quoted })
  }
  return { bodies, end: pos - 1 }
}

// The index just after the "))" that closes the arithmetic expansion whose "$" is at start, or -1 when it
// has none. The parentheses of the expression itself balance first: a ")" of the expression that is not
// followed by ")" is no closing, so "$((cmd); (cmd))" is a substitution of subshells, not arithmetic.
function arithmeticEnd(command, start) {
  let depth = 0
  let quote = null
  for (let i = start + 3; i < command.length; i++) {
    const ch = command[i]
    const next = command[i + 1]
    if (quote === "'") {
      if (ch === "'") quote = null
    } else if (ch === '\\' && i + 1 < command.length) {
      i++
    } else if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '$' && next === '(') {
        const sub = readSubstitution(command, i + 2)
        i = sub.end
      } else if (ch === '`') {
        const sub = readBacktick(command, i + 1)
        i = sub.end
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch
    } else if (ch === '$' && next === '(') {
      const sub = readSubstitution(command, i + 2)
      i = sub.end
    } else if (ch === '`') {
      const sub = readBacktick(command, i + 1)
      i = sub.end
    } else if (ch === '(') depth++
    else if (ch === ')') {
      if (depth > 0) depth--
      else return next === ')' ? i + 2 : -1
    }
  }
  return -1
}

// The inside of a command substitution whose "$(" ends just before start, with the index of its matching
// ")" and whether it had one. Quotes restart inside it, backslashes take the next character, nested "$("
// and loose parentheses balance, backquotes hold their own code, and a heredoc body inside it is text up
// to its delimiter, so neither a quote nor a ")" of the body closes anything outside it.
function readSubstitution(command, start) {
  let depth = 1
  // The contexts opened inside: a quote, a backquote, or, as a number, the depth a substitution opened
  // inside double quotes or backquotes brings back when it closes, which returns to the context below it.
  const stack = []
  const heredocs = []
  for (let i = start; i < command.length; i++) {
    const ch = command[i]
    const next = command[i + 1]
    const top = stack[stack.length - 1]
    if (top === "'") {
      if (ch === "'") stack.pop()
    } else if (ch === '\\' && i + 1 < command.length) {
      i++
    } else if (top === '"') {
      if (ch === '"') stack.pop()
      else if (ch === '$' && next === '(') {
        stack.push(depth)
        depth++
        i++
      } else if (ch === '`') stack.push('`')
    } else if (top === '`') {
      if (ch === '`') stack.pop()
      else if (ch === "'" || ch === '"') stack.push(ch)
      else if (ch === '$' && next === '(') {
        stack.push(depth)
        depth++
        i++
      }
    } else if (ch === "'" || ch === '"' || ch === '`') {
      stack.push(ch)
    } else if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) return { inner: command.slice(start, i), end: i, terminated: true }
      if (typeof top === 'number' && depth === top) stack.pop()
    } else if (ch === '\n' && heredocs.length > 0) {
      i = heredocBodies(command, i + 1, heredocs.splice(0)).end
    } else if (ch === '<' && next === '<' && command[i + 2] === '<') {
      i += 2
    } else if (ch === '<' && next === '<') {
      i = readHeredoc(command, i + 2, heredocs)
    }
  }
  return { inner: command.slice(start), end: command.length, terminated: false }
}

// The inside of a backquoted substitution whose opening "`" is just before start, with the index of its
// closing "`" and whether it had one. Quotes inside it restart, a backslash takes the next character,
// and a "$(" inside it holds its own closing ")".
function readBacktick(command, start) {
  let quote = null
  for (let i = start; i < command.length; i++) {
    const ch = command[i]
    const next = command[i + 1]
    if (quote === "'") {
      if (ch === "'") quote = null
    } else if (ch === '\\' && i + 1 < command.length) {
      i++
    } else if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '$' && next === '(') i = readSubstitution(command, i + 2).end
    } else if (ch === "'" || ch === '"') {
      quote = ch
    } else if (ch === '$' && next === '(') {
      i = readSubstitution(command, i + 2).end
    } else if (ch === '`') {
      return { inner: command.slice(start, i), end: i, terminated: true }
    }
  }
  return { inner: command.slice(start), end: command.length, terminated: false }
}

// The segments of the substitutions and backquotes that a heredoc body with an unquoted delimiter
// expands. The rest of the body is text, and an escaped "$" or "`" expands nothing.
function heredocSegments(body, depth) {
  const segments = []
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    const next = body[i + 1]
    if (ch === '\\' && i + 1 < body.length && '$`\\'.includes(next)) {
      i++
    } else if (ch === '$' && next === '(' && body[i + 2] === '(' && arithmeticEnd(body, i) !== -1) {
      i += 2
    } else if (ch === '$' && next === '(') {
      const sub = readSubstitution(body, i + 2)
      if (depth < MAX_NESTING) segments.push(...segmentsOf(sub.inner, depth + 1))
      i = sub.end
    } else if (ch === '`') {
      const sub = readBacktick(body, i + 1)
      if (depth < MAX_NESTING) segments.push(...segmentsOf(sub.inner, depth + 1))
      i = sub.end
    }
  }
  return segments
}

// The segments of a command, each a list of shell words. Separators are && || ; | & newlines, ( ) and
// backquotes, and a { or } that stands alone as a word, none of them inside quotes. A backslash takes
// the next character literally, and quotes come off the words. Inside double quotes a substitution or a
// backquote still runs: its segments, read one level deeper, sit where it appears, an arithmetic
// expansion runs nothing, and a "\$" or "\`" is literal. Single quotes are text throughout. A heredoc
// body is text, from the line after the command line that starts it up to its delimiter, except the
// substitutions and backquotes that a body with an unquoted delimiter expands.
function segmentsOf(command, depth = 0) {
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
      else if (ch === '$' && next === '(' && command[i + 2] === '(' && arithmeticEnd(command, i) !== -1) {
        const end = arithmeticEnd(command, i)
        const inner = command.slice(i + 3, end - 2)
        const subs = depth < MAX_NESTING ? heredocSegments(inner, depth) : []
        if (subs.length > 0) {
          endSegment()
          segments.push(...subs)
          word = ''
        } else {
          word = (word ?? '') + command.slice(i, end)
        }
        i = end - 1
      } else if (ch === '$' && next === '(') {
        if (depth >= MAX_NESTING) {
          endSegment()
          quote = null
          word = ''
          continue
        }
        const sub = readSubstitution(command, i + 2)
        endSegment()
        segments.push(...segmentsOf(sub.inner, depth + 1))
        word = ''
        i = sub.end
      } else if (ch === '`') {
        if (depth >= MAX_NESTING) {
          endSegment()
          quote = null
          word = ''
          continue
        }
        const sub = readBacktick(command, i + 1)
        endSegment()
        segments.push(...segmentsOf(sub.inner, depth + 1))
        word = ''
        i = sub.end
      } else word += ch
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
      if (heredocs.length > 0) {
        const bodies = heredocBodies(command, i + 1, heredocs.splice(0))
        i = bodies.end
        for (const body of bodies.bodies) {
          if (!body.quoted && depth < MAX_NESTING) segments.push(...heredocSegments(body.text, depth))
        }
      }
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

// The irreversible class of a Bash command: push, merge-main, publish, deploy, delete, credentials or
// paid-call (other paid calls are not detected),
// or null. The first segment that matches decides. A git merge needs cwd, the directory the command runs in,
// to know its branch: without it, only a checkout or switch to main earlier in the line makes it merge-main.
function irreversibleClass(command, cwd) {
  const found = matchCommand(command, 0, null, sequenceOf(cwd))
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

// The command as the owner's list keeps it. A command with a credentials segment keeps only that segment's
// subcommand, whatever the command's class, since the arguments of a credentials command are the secret.
// Any other command keeps its spelling, with its secret values redacted.
function redactCommand(command, cls) {
  if (typeof command !== 'string') return ''
  const credentials = matchCommand(command, 0, 'credentials')
  if (credentials !== null) return [...credentials.head, '[arguments redacted]'].join(' ')
  return cls === 'credentials' ? '[redacted]' : redactValues(command)
}

// A Bash call: null to allow, or { reason } to deny. Any error allows the command. The guard runs on
// every Bash call, so the modules that read git and the grants load only for an irreversible command.
function decideBash(input, env = process.env) {
  try {
    const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd()
    const cls = irreversibleClass(input.tool_input?.command, cwd)
    if (cls === null) return null
    const { repoPaths } = require('./git.js')
    const { check } = require('./autonomy.js')
    const { appendPending } = require('./pending.js')
    const { ensureExcluded } = require('./run.js')
    // Outside a git repository this throws, and the command is allowed unrecorded.
    const { mainRoot, gitCommonDir } = repoPaths(cwd)
    if (check(mainRoot, cls, { session: input.session_id }) !== null) return null
    const mode = env.AETHER_IRREVERSIBLE === 'enforce' ? 'enforce' : 'log'
    const entry = { time: Date.now(), session: input.session_id, class: cls, command: redactCommand(input.tool_input.command, cls), cwd: input.cwd, mode }
    // The list holds the command, so git must ignore its directory before the first line is written.
    ensureExcluded(gitCommonDir)
    // A command that cannot be recorded is allowed: a refusal the owner cannot see is not kept.
    if (!appendPending(mainRoot, entry)) return null
    if (mode === 'log') return null
    return {
      reason: `Aether added this ${cls} command to the owner's list (.aether/pending.jsonl): it is irreversible and no grant covers it. Go on with the work that does not depend on it, and put it in your brief's "Espera tu sí".`,
    }
  } catch {
    // Outside a git repository, or a grant registry that cannot be read: the command is allowed.
    return null
  }
}

module.exports = { decide, decideBash, irreversibleClass, redactCommand }
