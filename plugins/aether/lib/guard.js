'use strict'

// PreToolUse decisions and irreversible command classification for Aether sessions.
// Protects specs, plans, tasks (specs/NNN-<topic>/), the constitution (.specify/memory/constitution.md),
// and the intent card (specs/NNN-<topic>/intent.md). Protection of docs/superpowers/specs/ and
// docs/superpowers/plans/ stays in force even though that folder is not in the tree.
// Records irreversible Bash commands across the classes: merge-main, push, publish, deploy, delete,
// credentials, and skill-install (spec 030 R25 R30). The delete class also holds the removals and renames that
// aether:tidy orders, and a Write that empties CLAUDE.md or AGENTS.md (spec 030 R38). The paid-call class is in
// CLASSES of autonomy.js, but the guard does not detect it; it is only granted and checked with aether-autonomy.
// Redacts secret values from logged commands. Refuses writes to Aether skills, downloaded skills (spec 030 R23),
// trusted.json (spec 030 R47), and Claude Code's settings and hooks (spec 030 R21), and confines the
// Examiner to .aether/exam/ (and the old .aether-exam/).
// Family: none.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
// The Bash parser lives in bash-parse.js; guard.js requires and re-exports its
// four public functions, and uses its shared readers to classify segments.
const {
  commandSegments,
  dropWrappers,
  nameOf,
  redirectTargets,
  segmentsOf,
  unquotedRedirection,
  scriptOf,
  shellReadsStdin,
  skipOptions,
  SHELLS,
  MAX_NESTING,
} = require('./bash-parse.js')
const { isObject } = require('./common.js')
const { dataDir: getDataDir } = require('./run.js')
const { classifySkillPath, copyAdvice, installClass, trustedFile } = require('./skill-rules.js')
const { classifyClaudePath } = require('./tree-paths.js')
const { OLD_CLI_NAMES, OLD_CLI_PATTERNS } = require('./tidy-detect.js')

const CHECKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const PROTECTED = [
  /(^|\/)docs\/superpowers\/(specs|plans)\//,
  /(^|\/)specs\/\d{3}-[^/]+\/(spec|plan|tasks)\.md$/,
  /(^|\/)\.specify\/memory\/constitution\.md$/,
]
const AUTONOMY_PROTECTED = /(^|\/)\.aether\/autonomy\/(grants\.json|[^/]+\/run\.json)$/
const AUTONOMY_DOC = /(^|\/)\.aether\/autonomy\/[^/]+\/(diary|brief)\.md$/
const LEAD = 'aether:lead'
const WRITER = 'aether:writer'
const EXAMINER = 'aether:examiner'
const EXAM_PATH = /(^|\/)(\.aether-exam|\.aether\/exam)\//
// Claude Code's settings and hooks by their text alone (spec 030 R21). Used only when git cannot classify the path.
const CLAUDE_CONFIG_TEXT = /(^|\/)\.claude\/(settings\.json|settings\.local\.json|hooks(\/|$))/
const INTENT_CARD = /(^|\/)specs\/\d{3}-[^/]+\/intent\.md$/

// decide(input, env = process.env) gives null to allow, or { reason } to deny.
function decide(input, env = process.env) {
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

  // A Write that empties CLAUDE.md or AGENTS.md is a delete (spec 030 R38). A refusal ends it; otherwise the
  // checks below still apply to the write.
  if (emptiesTidyFile(input)) {
    const refused = recordAndDecide([{ cls: 'delete', command: `Write ${target}` }], { cwd: base, session: input.session_id, env })
    if (refused) return refused
  }

  if (isTrustedTarget(target, base, env)) {
    return {
      reason: `The list of trusted skill authors is written only by aether-autonomy trust. Use \`aether-autonomy trust\` instead of editing ${resolved}.`,
    }
  }

  if (isClaudeConfigTarget(target, base, normalized)) {
    return {
      reason: `In Aether mode no agent writes Claude Code's settings or hooks (${target}).`,
    }
  }

  // The Examiner's exam must stay out of the repository and of the swarm's sight, so it writes nothing else.
  if (input.agent_type === EXAMINER && !EXAM_PATH.test(normalized)) {
    return {
      reason: `In Aether mode the Examiner writes only its exam, under .aether/exam/ at the repository root. Write ${path.basename(resolved)} there instead of ${resolved}.`,
    }
  }

  // The owner's own words in the intent card are the Lead's to write, and no one else's.
  if (INTENT_CARD.test(normalized)) {
    if (isLeadOrMainSession(input)) return null
    return {
      reason: `In Aether mode only the Lead writes the intent card (intent.md): it holds the owner's own words. Hand a change to the Lead instead of editing ${resolved} yourself.`,
    }
  }

  const home = (env && env.HOME) || os.homedir()
  const dataDir = getDataDir(env)
  let skillInfo = null
  try {
    skillInfo = classifySkillPath(target, { cwd: base, home, dataDir })
  } catch {
    skillInfo = ownerSkillByText(normalized, home)
  }
  if (skillInfo) {
    if ((skillInfo.type === 'aether' || skillInfo.type === 'downloaded') && !skillInfo.editable) {
      return { reason: copyAdvice(skillInfo) }
    }
    if (skillInfo.grant) {
      const items = [{ cls: skillInfo.grant, command: `Write ${target}` }]
      return recordAndDecide(items, { cwd: base, session: input.session_id, env })
    }
    return null
  }

  if (!PROTECTED.some((re) => re.test(normalized))) return null
  if (mayWriteDocs(input)) return null

  return {
    reason: `In Aether mode only the Lead and the Writer write specs, plans and tasks. Hand this change to the Lead, or to the aether:writer agent, instead of editing ${resolved} yourself.`,
  }
}

// Whether a target path names the trusted skill authors file (spec 030 R47).
function isTrustedTarget(str, cwd, env = process.env) {
  if (typeof str !== 'string' || !str) return false
  const clean = str.replace(/^['"]|['"]$/g, '').trim()
  if (!/(^|[^A-Za-z0-9_.-])trusted\.json(?![A-Za-z0-9_.-])/.test(clean)) return false
  const dataDir = getDataDir(env)
  const expected = dataDir ? path.resolve(trustedFile(dataDir)) : null
  const base = cwd || process.cwd()
  const resolved = path.isAbsolute(clean) ? path.resolve(clean) : path.resolve(base, clean)
  if (expected && resolved === expected) return true
  const normalized = resolved.split(path.sep).join('/')
  return /(^|\/)skills\/trusted\.json$/.test(normalized)
}

// Whether a file-tool target is Claude Code's settings or hooks (spec 030 R21). classifyClaudePath throws on a
// broken repository or an ELOOP path. Then the text decides: a path that names the settings or the hooks stays
// refused, so an unreadable repository cannot open them, and any other path passes, so ordinary writes still work.
function isClaudeConfigTarget(target, base, normalized) {
  try {
    const claude = classifyClaudePath(target, { cwd: base })
    return Boolean(claude && claude.kind === 'config')
  } catch {
    return CLAUDE_CONFIG_TEXT.test(normalized)
  }
}

// The owner's skill for a path that classifySkillPath cannot resolve (it throws on ELOOP and EACCES), judged by its
// text as isClaudeConfigTarget judges the settings: a path under the home folder's .agents/skills or .claude/skills
// is an owner's skill that waits for the owner (spec 030 R30). Any other path is no skill here, so it passes.
function ownerSkillByText(normalized, home) {
  const homeFolder = home.split(path.sep).join('/').replace(/\/+$/, '')
  const owned = ['.agents', '.claude'].some((dir) => normalized.startsWith(`${homeFolder}/${dir}/skills/`))
  return owned ? { type: 'owner', editable: true, grant: 'skill-install' } : null
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

// git's options before the subcommand are dropped, so that git -C dir push reads as git push.
function dropGitOptions(words) {
  if (words[0] !== 'git') return words
  return ['git', ...words.slice(skipOptions(words, 1, GIT_VALUED))]
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

// What a command line leaves, read segment by segment in order: here, the directory the next segment runs in
// (null when it is not known); branches, the branch that a git checkout or switch left current in each directory
// (a directory not in branches is read from git once, when a merge needs it); home, the folder that ~ and $HOME
// name; and targets, the tidy targets named so far (spec 030 R38, read by tidyTargetsIn).
function sequenceOf(cwd, home = null) {
  return { here: typeof cwd === 'string' && cwd !== '' ? path.resolve(cwd) : null, branches: new Map(), home, targets: [] }
}

// The word with a leading ~, $HOME or ${HOME} replaced by the home folder, when the home folder is known.
function expandHome(word, home) {
  return home ? word.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, () => home) : word
}

// The directory that dir names when run from base, or null when that cannot be told: "$" and "-" paths, "~" paths
// without a home folder, and a relative path with no base.
function resolveDir(base, dir, home = null) {
  const expanded = expandHome(dir, home)
  if (/^[-~$]/.test(expanded)) return null
  if (path.isAbsolute(expanded)) return expanded
  return base === null ? null : path.resolve(base, expanded)
}

// The directory a git command runs in: the cwd of the line, moved by each of its -C options in turn.
function gitDirOf(sequence, dirs) {
  return dirs.reduce((base, dir) => resolveDir(base, dir, sequence.home), sequence.here)
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
    sequence.here = words.length > 1 ? resolveDir(sequence.here, words[1], sequence.home) : null
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

// The matches of one command's words, appended to out: at most one per class, in reading order. A
// shell or eval is matched by the script it runs, one level deeper, and a shell that takes its
// script from a heredoc is matched the same way by each heredoc body it started. A heredoc to any
// other command stays text. When wanted is given, only that class is appended.
function collectWords(words, depth, wanted, sequence, out, env = process.env) {
  const unwrapped = dropWrappers(words)
  // A command run by its path, such as /usr/bin/git, is matched by its name.
  const named = unwrapped.length > 0 ? [nameOf(unwrapped[0]), ...unwrapped.slice(1)] : unwrapped
  followSegment(named, sequence)
  const started = Array.isArray(words.heredocs) ? words.heredocs : []
  if (started.length > 0 && SHELLS.has(named[0]) && shellReadsStdin(named.slice(1)) && depth < MAX_NESTING) {
    for (const body of started) collectCommand(body.text, depth + 1, wanted, sequence, out, env)
  }
  const command = dropGitOptions(named)
  const script = scriptOf(command)
  if (script !== null) {
    if (depth < MAX_NESTING) collectCommand(script, depth + 1, wanted, sequence, out, env)
    return
  }
  const git = gitCall(named)
  const mergesToMain = git !== null && landsOnMain(git, sequence)
  const found = mergesToMain ? { cls: 'merge-main', head: ['git', 'merge'] } : subcommandOf(command)
  const install = isSkillInstallSegment(words, named, sequence.here, env) ? { cls: 'skill-install', head: named.slice(0, 2) } : null
  // The tidy targets of this segment, read in the directory it runs in (spec 030 R38). Its first one makes the delete class.
  const tidy = tidyTargetsOf(command, git !== null ? gitDirOf(sequence, git.dirs) : sequence.here, sequence.home)
  sequence.targets.push(...tidy)
  const removal = tidy.length > 0 ? { cls: 'delete', head: command.slice(0, command[0] === 'git' ? 2 : 1) } : null
  // A segment can be two classes at once, such as a push that names the personal skills folder: each is kept once.
  for (const match of [found, install, removal]) {
    if (match !== null && (wanted === null || match.cls === wanted) && !out.some((f) => f.cls === match.cls)) out.push(match)
  }
}

// The matches among a command's segments, appended to out in reading order.
function collectCommand(command, depth, wanted, sequence, out, env = process.env) {
  if (typeof command !== 'string') return
  for (const words of segmentsOf(command)) collectWords(words, depth, wanted, sequence, out, env)
}

// The first match among a command's segments, or the first of class wanted when it is given.
function matchCommand(command, depth, wanted = null, sequence = sequenceOf(), env = process.env) {
  const out = []
  collectCommand(command, depth, wanted, sequence, out, env)
  return out.length === 0 ? null : out[0]
}

// The distinct irreversible classes of a Bash command, in order of appearance: 'merge-main', 'push',
// 'publish', 'deploy', 'delete', 'credentials', and 'skill-install' (spec 030 R25 R30; the guard does
// not detect paid calls). The delete class also comes from the removals and renames that aether:tidy
// orders (spec 030 R38, tidyTargetsOf), at the place of the segment that names the first one. Every
// segment counts, including sequences, pipes, subshells, substitutions and nested scripts, in the order
// they run. A git merge needs cwd, the directory the command runs in, to know its branch: without it,
// only a checkout or switch to main earlier in the line makes it merge-main.
function irreversibleClasses(command, cwd, env = process.env) {
  const out = []
  collectCommand(command, 0, null, sequenceOf(cwd, (env && env.HOME) || os.homedir()), out, env)
  return out.map((found) => found.cls)
}

// The irreversible class of a Bash command, or null. The first class of the line decides.
function irreversibleClass(command, cwd, env = process.env) {
  return irreversibleClasses(command, cwd, env)[0] ?? null
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

// These checks are a tripwire, not a shell interpreter. They cannot see names built at runtime,
// relative names after cd, names assembled across commands, unlisted programs deleting directories,
// whole-tree commands without operands, or functions and aliases retained by a shell.
const READ_COMMANDS = new Set('echo printf cat more head tail grep egrep fgrep ls stat wc diff cmp jq test ['.split(' '))
const WRITE_COMMANDS = new Set('rm rmdir unlink mv cp rsync install ln chmod chown chgrp truncate shred dd tar unzip patch'.split(' '))

function lineShape(command) {
  let plain = true
  let quote = null
  let word = ''
  let active = false
  let words = []
  const commands = []
  const endWord = () => { if (active) words.push(word); word = ''; active = false }
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = [] }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i], next = command[i + 1]
    if (ch === '\\' && quote !== "'") { active = true; if (next !== undefined) word += command[++i]; continue }
    if (quote) {
      if (ch === quote) { quote = null; continue }
      // A `>` inside quotes is text, not a redirection (issue 180): it keeps a read plain.
      // Every other shell character there still ends it, as does a quote left unbalanced.
      if (';&<'.includes(ch) || (quote !== "'" && (ch === '`' || (ch === '$' && next === '(')))) plain = false
      word += ch; active = true; continue
    }
    if (ch === "'" || ch === '"') { quote = ch; active = true; continue }
    if (ch === '`' || (ch === '$' && next === '(') || ch === ';' || ch === '&' || ch === '>' || (ch === '<' && next === '(')) plain = false
    if (ch === '\n') { if (command.slice(i + 1).trim()) plain = false; endCommand(); continue }
    if (ch === '|' && next === '|') { plain = false; endCommand(); i++; continue }
    if (ch === '|') { endCommand(); if (next === '&') i++; continue }
    if (/\s/.test(ch)) { endWord(); continue }
    word += ch; active = true
  }
  if (quote) plain = false
  endCommand()
  return { plain, commands }
}

function normalizeMention(word) {
  return word.replace(/\/+/g, '/').replace(/(^|\/)\.\//g, '$1').replace(/(?:\/\.?|\/\*)+$/, '')
}

function directoryMention(word, agentType) {
  const w = normalizeMention(word)
  // A run's diary.md and brief.md are writable through Bash exactly as Write allows them: never for the Examiner,
  // which Write confines to .aether/exam/ (issue 239).
  if (AUTONOMY_DOC.test(w)) return agentType === EXAMINER
  return /(?:^|\/)\.aether(?:\/autonomy)?$/.test(w) || w === 'autonomy' || w.includes('.aether/autonomy/') || /^auto-\d{8}-\d{6}-[a-z0-9]{4}$/.test(w) || /(?:=|-[^-]*t)\.aether\/autonomy$/.test(w)
}

// The paths a wildcard word must not reach: the directory, the registry and a run state.
const PATTERN_TARGETS = ['.aether/autonomy', '.aether/autonomy/grants.json', '.aether/autonomy/auto-20261009-200000-ab12/run.json']

// A glob component as a regular expression: * and ** (any run), ? (one character), [...] with ranges and ! or ^
// negation, everything else literal. It does not expand classes, so its cost does not grow with their number.
function globPart(part) {
  let re = ''
  for (let i = 0; i < part.length; i++) {
    const c = part[i]
    if (c === '*') {
      if (part[i + 1] === '*') {
        while (part[i + 1] === '*') i++
        re += '.*'
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if (c === '[') {
      const close = part.indexOf(']', i + 2)
      if (close < 0) {
        re += '\\['
      } else {
        let cls = part.slice(i + 1, close).replace(/\\/g, '\\\\')
        if (cls[0] === '!') cls = '^' + cls.slice(1)
        re += '[' + cls + ']'
        i = close
      }
    } else {
      re += c.replace(/[.+^${}()|\\\]]/g, '\\$&')
    }
  }
  return re
}

// The word with its first {a,b} group replaced by each alternative, until none is left (at most 64 words).
function braceAlternatives(word) {
  const found = word.match(/\{([^{}]*,[^{}]*)\}/)
  if (!found) return [word]
  const out = []
  for (const alternative of found[1].split(',')) {
    for (const expanded of braceAlternatives(word.replace(found[0], alternative))) {
      if (out.length < 64) out.push(expanded)
    }
  }
  return out
}

// A word with a wildcard that can reach a protected path. A pattern carries its own prefix (an absolute path, ../,
// $PWD/), so every suffix of the pattern, from each /, is tested against the paths: the end is anchored and any
// prefix is allowed.
function patternMention(word) {
  const w = word.replace(/\/+/g, '/').replace(/(^|\/)\.\//g, '$1')
  if (!/[*?[{]/.test(w) || !/(?:\.aether|autonomy)/.test(w)) return false
  return braceAlternatives(w).some((alternative) => {
    const parts = alternative.split('/')
    for (let k = 0; k < parts.length; k++) {
      const re = new RegExp('^' + parts.slice(k).map(globPart).join('/') + '$')
      if (PATTERN_TARGETS.some((target) => re.test(target))) return true
    }
    return false
  })
}

function protectedMention(command, cwd = process.cwd(), agentType) {
  const shape = lineShape(command)
  const single = shape.commands.length === 1 ? shape.commands[0] : []
  const authorized = single[0] === 'aether-autonomy' || (single[0] === 'node' && single[1] && path.resolve(cwd, single[1]) === path.resolve(__dirname, '../bin/aether-autonomy'))
  const exempt = shape.plain && (shape.commands.length > 0 && shape.commands.every((c) => READ_COMMANDS.has(c[0])) || (authorized && !command.includes('<<')))
  const segments = commandSegments(command)
  const words = segments.flat()
  const name = (w) => /(^|[^A-Za-z0-9_.-])(grants\.json|run\.json)(?![A-Za-z0-9_.-])/.test(w)
  // Output redirections also protect other files and directories beneath autonomy. A `>` inside
  // quotes is text, not a redirection (issue 180): only an unquoted one counts. The text after a
  // `>` read inside an unterminated quote starts with its space, which the matchers must not see.
  for (const segment of segments) {
    for (let i = 0; i < segment.length; i++) {
      const after = unquotedRedirection(segment[i], segment.masks && segment.masks[i])
      if (after !== null) {
        const target = (after || segment[i + 1] || '').trim()
        if (name(target) || patternMention(target) || directoryMention(target, agentType)) return target
      }
    }
  }
  if (exempt) return null
  const direct = words.find((w) => name(w) || patternMention(w))
  if (direct) return direct
  const writer = words.some((w) => WRITE_COMMANDS.has(nameOf(w))) || (words.some((w) => nameOf(w) === 'find') && words.some((w) => ['-delete', '-exec', '-execdir'].includes(w)))
  return writer ? words.find((w) => directoryMention(w, agentType)) || null : null
}

const CLAUDE_CONFIG = /(?:^|[\s'"`;|&()=,<>])((?:[^\s'"`;|&()=,<>]+\/)?\.claude\/(?:settings\.json|settings\.local\.json|hooks(?:\/[^\s'"`;|&()<>]*)?))(?=$|[\s'"`;|&()=,<>])/

function claudeConfigPath(str) {
  const m = typeof str === 'string' && str.match(CLAUDE_CONFIG)
  return m ? m[1] : null
}

// The words of a segment that a write can name: its redirection targets, then, unless the command is read-only
// (READ_COMMANDS, by its name after the wrappers), every word of the segment.
function writeTargets(segment) {
  const unwrapped = dropWrappers(segment)
  const cmd = unwrapped.length ? nameOf(unwrapped[0]) : ''
  return READ_COMMANDS.has(cmd) ? redirectTargets(segment) : [...redirectTargets(segment), ...segment]
}

// Limit A14 (spec 030): commands that assemble the path at runtime (e.g. a script building .claude/ dynamically) cannot be detected.
function claudeConfigWrite(command) {
  if (typeof command !== 'string') return null
  for (const segment of commandSegments(command)) {
    for (const target of writeTargets(segment)) {
      const configTarget = claudeConfigPath(target)
      if (configTarget) return configTarget
    }
  }
  return null
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isPersonalSkillPath(str, home) {
  if (typeof str !== 'string' || !str) return false
  const homes = new Set()
  if (home) {
    homes.add(home.replace(/\/+$/, ''))
    try {
      const real = fs.realpathSync(home)
      if (real) homes.add(real.replace(/\/+$/, ''))
    } catch { /* ignore */ }
  }
  const alts = ['~', '\\$HOME', '\\$\\{HOME\\}']
  for (const h of homes) {
    alts.push(escapeRegex(h))
  }
  const re = new RegExp(`(^|[\\s'"=])(?:${alts.join('|')})/\\.(?:agents|claude)/skills(?:/|$|[\\s'"\`;|&()])`)
  return re.test(str)
}

// The path of this plugin's aether-autonomy bin. A call to it names the folders its grants allow without writing there.
const AUTONOMY_BIN = path.resolve(__dirname, '../bin/aether-autonomy')

// Whether a segment calls aether-autonomy: by its bare name, or as node runs that file from the working folder here.
function isAutonomyCall(words, here) {
  if (words[0] === 'aether-autonomy') return true
  return words[0] === 'node' && typeof words[1] === 'string' && here !== null && path.resolve(here, words[1]) === AUTONOMY_BIN
}

// A word spelled so that installClass reads it back as one word. An empty word has no spelling the parser keeps, so it
// becomes a dot: a source that names no author, which holds the install instead of shifting the words after it.
function spelledWord(word) {
  if (word === '') return '.'
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `"${word.replace(/["\\]/g, '\\$&')}"`
}

// Limit A14 (spec 030): commands that assemble the personal skills path or an install at runtime (e.g. a script building
// ~/.agents/skills/ dynamically, or $X skills add) cannot be detected.
// Whether a segment is a skill install or writes into the owner's skill folders (spec 030 R25 R30). The install is read from
// the words after the wrappers (named), so `CI=1 npx skills add`, `sudo npx ...` and `/usr/bin/npx ...` are the install of
// `npx skills add`. A call to aether-autonomy names the folders in its quotes without writing there: only its redirections count.
function isSkillInstallSegment(words, named, here, env) {
  const home = (env && env.HOME) || os.homedir()
  const naming = isAutonomyCall(words, here) ? redirectTargets(words) : writeTargets(words)
  if (naming.some((target) => isPersonalSkillPath(target, home))) return true
  return installClass(named.map(spelledWord).join(' '), { dataDir: getDataDir(env) }) === 'skill-install'
}

// Tidy deletions (spec 030 R38). aether:tidy orders these removals and renames: the old CLI's leftovers directly
// inside .aether/, any CLAUDE.md or AGENTS.md, and what is in the skills folders. collectWords reads each segment
// with the same wrappers, scripts and substitutions as every other class, so a wrapper's options or a shell's -c
// do not hide them.
const TIDY_COMMANDS = new Set(['rm', 'mv', 'rmdir', 'unlink'])
const TIDY_GIT_COMMANDS = new Set(['rm', 'mv'])
const TIDY_FILES = new Set(['CLAUDE.md', 'AGENTS.md'])
const TARGET_DIR_FLAGS = ['-t', '--target-directory']
const XARGS_VALUED = ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter',
  '--max-lines', '--max-args', '--max-procs', '--max-chars', '--process-slot-var']
const SKILLS_FOLDER = /(?:^|\/)\.(?:claude|agents)\/skills(?:\/|$)/
const SKILLS_PARENT = /(?:^|\/)\.(?:claude|agents)$/
// The arbitrary-prefix suffixes recognized by OLD_CLI_PATTERNS in tidy-detect.js.
const OLD_CLI_SUFFIXES = ['.draft.md', '.lock']

function isOldCliName(name) {
  return OLD_CLI_NAMES.includes(name) || OLD_CLI_PATTERNS.some((pattern) => pattern.test(name))
}

// Whether a filename glob can end with an old CLI suffix. Each leading component of the glob can be part of the
// arbitrary prefix; a character class stays one component. This avoids relying on one invented draft or lock name.
function oldCliPattern(name) {
  for (let i = 0; i < name.length; i++) {
    const re = new RegExp('^' + globPart(name.slice(i)) + '$')
    if (OLD_CLI_SUFFIXES.some((suffix) => re.test(suffix))) return true
    if (name[i] === '[') {
      const close = name.indexOf(']', i + 2)
      if (close >= 0) i = close
    }
  }
  return false
}

// Whether a candidate path relative to repository root or home matches a tidy target pattern.
function matchesTidyRelative(candidate) {
  const parts = candidate.split('/')
  // 1. Root tidy files: CLAUDE.md or AGENTS.md in repo root, or .claude / .agents parent
  if (parts.length === 1) {
    try {
      const re = new RegExp('^' + globPart(parts[0]) + '$')
      if (['CLAUDE.md', 'AGENTS.md', '.claude', '.agents'].some((t) => re.test(t))) return true
    } catch { return false }
    return false
  }
  // 2. Parents and skills under .claude or .agents
  try {
    const folderRe = new RegExp('^' + globPart(parts[0]) + '$')
    if (['.claude', '.agents'].some((t) => folderRe.test(t))) {
      if (parts.length === 2 && parts[1] === '*') return true
      const skillsRe = new RegExp('^' + globPart(parts[1]) + '$')
      if (skillsRe.test('skills')) return true
      return false
    }
  } catch { return false }
  // 3. Old CLI files directly under .aether
  try {
    const aetherRe = new RegExp('^' + globPart(parts[0]) + '$')
    if (parts.length === 2 && aetherRe.test('.aether')) {
      const fileRe = new RegExp('^' + globPart(parts[1]) + '$')
      if (OLD_CLI_NAMES.some((name) => fileRe.test(name))) return true
      if (oldCliPattern(parts[1])) return true
      return false
    }
  } catch { return false }
  return false
}

// Whether a path that a command names can reach one that aether:tidy orders removed or moved. Brace alternatives
// are normalized and resolved from cwd when known; glob components use the registry's pattern matcher.
function isTidyTarget(word, cwd, home) {
  const alternatives = braceAlternatives(word)
  if (alternatives.length !== 1 || alternatives[0] !== word) {
    return alternatives.some((alternative) => isTidyTarget(alternative, cwd, home))
  }
  const text = expandHome(word, home).replace(/\\/g, '/')
  const full = (cwd ? path.resolve(cwd, text) : path.posix.normalize(text)).split(path.sep).join('/')
  const name = path.posix.basename(full)
  const parent = path.posix.basename(path.posix.dirname(full))
  if (TIDY_FILES.has(name) || (parent === '.aether' && isOldCliName(name)) || SKILLS_FOLDER.test(full) || SKILLS_PARENT.test(full)) return true
  if (!/[*?[{]/.test(text)) return false

  const clean = text.replace(/\/+/g, '/').replace(/(^|\/)\.\//g, '$1')
  const candidates = []
  if (!path.posix.isAbsolute(clean)) {
    const rel = clean.replace(/^\.\//, '')
    candidates.push(rel)
    if (cwd && path.posix.basename(cwd) === '.aether' && !rel.startsWith('.aether')) {
      candidates.push(`.aether/${rel}`)
    }
    if (cwd && ['.claude', '.agents'].includes(path.posix.basename(cwd))) {
      candidates.push(`${path.posix.basename(cwd)}/${rel}`)
    }
  } else {
    if (cwd) {
      const relCwd = path.posix.relative(cwd.split(path.sep).join('/'), clean)
      if (!relCwd.startsWith('..')) candidates.push(relCwd)
    }
    if (home) {
      const relHome = path.posix.relative(home.split(path.sep).join('/'), clean)
      if (!relHome.startsWith('..')) candidates.push(relHome)
    }
    for (const prefix of ['.aether', '.agents', '.claude']) {
      const idx = clean.indexOf('/' + prefix + '/')
      if (idx !== -1) candidates.push(clean.slice(idx + 1))
      if (clean.endsWith('/' + prefix)) candidates.push(prefix)
    }
  }

  return candidates.some((candidate) => matchesTidyRelative(candidate))
}

// The operands of a command after its options. A "--" ends the options, and -t or --target-directory names its
// directory as an operand too, so that mv -t dir CLAUDE.md still names CLAUDE.md.
function operandsOf(args) {
  const operands = []
  let inOptions = true
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (inOptions && arg === '--') inOptions = false
    else if (inOptions && TARGET_DIR_FLAGS.includes(arg)) {
      if (i + 1 < args.length) operands.push(args[++i])
    } else if (inOptions && arg.startsWith('--target-directory=')) operands.push(arg.slice('--target-directory='.length))
    else if (!inOptions || !arg.startsWith('-')) operands.push(arg)
  }
  return operands.filter((arg) => arg !== '')
}

// The tidy targets among the operands of one command segment, in order. The words are past the wrappers and
// git's options, as collectWords leaves them; a git command counts only as git rm or git mv. find and xargs
// count only when their action removes or moves paths.
function tidyTargetsOf(command, cwd, home) {
  if (command[0] === 'find') {
    const deleting = command.includes('-delete') || command.some((word, i) =>
      (word === '-exec' || word === '-execdir') && TIDY_COMMANDS.has(nameOf(command[i + 1] || '')))
    if (!deleting) return []
    const targets = operandsOf(command.slice(1)).filter((word) => word !== '{}' && isTidyTarget(word, cwd, home))
    // A -name may match at any depth below a search root, including inside .aether or at a skills folder.
    const roots = []
    let index = 1
    while (index < command.length && ['-H', '-L', '-P'].includes(command[index])) index++
    while (index < command.length && !command[index].startsWith('-') && !['(', '!'].includes(command[index])) {
      roots.push(command[index++])
    }
    if (roots.length === 0) roots.push('.')
    for (; index < command.length; index++) {
      if (command[index] !== '-name' || index + 1 >= command.length) continue
      const name = command[++index]
      for (const root of roots) {
        const paths = [`${root}/${name}`, `${root}/.aether/${name}`, `${root}/.agents/${name}`]
        if (!targets.includes(name) && paths.some((candidate) => isTidyTarget(candidate, cwd, home))) targets.push(name)
      }
    }
    return targets
  }
  if (command[0] === 'xargs') {
    // Only the command xargs runs is a verb; an option value or an echo argument named rm is not.
    let index = 1
    while (index < command.length && command[index].startsWith('-')) {
      const option = command[index++]
      if (option === '--') break
      if (XARGS_VALUED.includes(option)) index++
    }
    if (!TIDY_COMMANDS.has(nameOf(command[index] || ''))) return []
    // Without a named operand, the input is a runtime-built path (A14), as with other guard classes.
    return operandsOf(command.slice(index + 1)).filter((word) => isTidyTarget(word, cwd, home))
  }
  const git = command[0] === 'git'
  const verb = git ? command[1] : command[0]
  if (!(git ? TIDY_GIT_COMMANDS.has(verb) : TIDY_COMMANDS.has(verb))) return []
  return operandsOf(command.slice(git ? 2 : 1)).filter((word) => isTidyTarget(word, cwd, home))
}

// Whether a Write leaves CLAUDE.md or AGENTS.md empty: its base name is one of them and its content is blank.
function emptiesTidyFile(input) {
  if (!input || input.tool_name !== 'Write' || !input.tool_input) return false
  const filePath = input.tool_input.file_path
  if (typeof filePath !== 'string') return false
  if (!TIDY_FILES.has(path.posix.basename(filePath.replace(/\\/g, '/')))) return false
  const content = input.tool_input.content
  return typeof content === 'string' && content.trim() === ''
}

// The tidy targets that a whole command line names, in order: the walk that irreversibleClasses makes.
function tidyTargetsIn(command, cwd, env = process.env) {
  const sequence = sequenceOf(cwd, (env && env.HOME) || os.homedir())
  collectCommand(command, 0, null, sequence, [], env)
  return sequence.targets
}

function trustedWrite(command, cwd = process.cwd(), env = process.env) {
  if (typeof command !== 'string') return null
  const shape = lineShape(command)
  const single = shape.commands.length === 1 ? shape.commands[0] : []
  const authorized = single[0] === 'aether-autonomy' || (single[0] === 'node' && single[1] && path.resolve(cwd, single[1]) === path.resolve(__dirname, '../bin/aether-autonomy'))
  const exempt = shape.plain && (shape.commands.length > 0 && shape.commands.every((c) => READ_COMMANDS.has(c[0])) || (authorized && !command.includes('<<')))
  if (exempt) return null

  for (const segment of commandSegments(command)) {
    for (const target of writeTargets(segment)) {
      if (isTrustedTarget(target, cwd, env)) return target
    }
  }
  return null
}

function recordAndDecide(items, { cwd, session, env = process.env }) {
  const { repoPaths } = require('./git.js')
  let paths
  try { paths = repoPaths(cwd) } catch { return null }
  const { check } = require('./autonomy.js')
  const { appendPending } = require('./pending.js')
  const { ensureExcluded } = require('./run.js')
  const mode = env.AETHER_IRREVERSIBLE === 'enforce' ? 'enforce' : 'log'
  let first = null
  for (const { cls, command } of items) {
    let granted = false
    try { granted = check(paths.mainRoot, cls, { session }) !== null } catch { /* malformed registry fails closed */ }
    if (granted) continue
    const entry = { time: Date.now(), session, class: cls, command, cwd, mode }
    ensureExcluded(paths.gitCommonDir)
    if (!appendPending(paths.mainRoot, entry)) return null
    if (first === null) first = cls
  }
  if (mode === 'log' || first === null) return null
  return { reason: `Aether added this ${first} command to the owner's list (.aether/pending.jsonl): it is irreversible and no grant covers it. Go on with the work that does not depend on it, and put it in your brief's "Espera tu sí".` }
}

// A Bash call: null to allow, or { reason } to deny.
function decideBash(input, env = process.env) {
  const command = input.tool_input?.command
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd()
  let mention
  try { mention = module.exports.protectedMention(command, cwd, input.agent_type) } catch { mention = 'the protected files' }
  if (mention) return { reason: `Aether's autonomy registry and run states are written only by aether-autonomy. Use \`aether-autonomy\` (grant, revoke, start, spend, end, quarantine) instead of editing ${mention}.` }
  const claudeConfig = claudeConfigWrite(command)
  if (claudeConfig) return { reason: `In Aether mode no agent writes Claude Code's settings or hooks (${claudeConfig}).` }
  const trustedMention = trustedWrite(command, cwd, env)
  if (trustedMention) return { reason: `The list of trusted skill authors is written only by aether-autonomy trust. Use \`aether-autonomy trust\` instead of editing ${trustedMention}.` }
  try {
    const classes = irreversibleClasses(command, cwd, env)
    if (!classes.length) return null
    const items = classes.map((cls) => ({ cls, command: redactCommand(command, cls) }))
    return recordAndDecide(items, { cwd, session: input.session_id, env })
  } catch { return null }
}

module.exports = { commandSegments, dropWrappers, nameOf, redirectTargets, decide, decideBash, emptiesTidyFile, irreversibleClass, irreversibleClasses, redactCommand, protectedMention, lineShape, tidyTargetsIn }
