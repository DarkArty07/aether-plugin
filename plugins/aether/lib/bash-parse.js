'use strict'

// The home of the Bash parser (spec 036 R12): the segmenter and the small readers
// that split a command line into words. guard.js requires this module and re-exports
// its four public functions, and continuity-posttool.js requires it directly, so the
// parser no longer lives inside the guard. The four public functions are
// commandSegments, dropWrappers, nameOf and redirectTargets; the rest is shared
// with guard.js, which classifies the segments this module reads.
// Family: none.

const path = require('node:path')

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
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

// Whether a shell's words after its name read the script from stdin: the shell has -s, or it has
// neither -c nor a script file. The words are already past dropWrappers and nameOf, so "env bash"
// reads as ["bash"]. A lone "-" reads stdin too, while "--" ends the options.
function shellReadsStdin(args) {
  let hasC = false
  let hasS = false
  let file = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (/^[0-9]+[<>]/.test(a)) continue
    // Options that take their value in the next word: -o/+o (set -o name), -O/+O (shopt name), also inside a
    // cluster such as -euo, and --rcfile/--init-file. The value is not a script file.
    if ((a === '--rcfile' || a === '--init-file') && i + 1 < args.length) {
      i += 1
      continue
    }
    if (a.startsWith('--')) continue
    if ((a.startsWith('-') || a.startsWith('+')) && a.length > 1) {
      if (a.startsWith('-') && /^-[^-]*c/.test(a)) hasC = true
      if (a.startsWith('-') && /^-[^-]*s/.test(a)) hasS = true
      if (/^[-+][^-+]*[oO]/.test(a) && i + 1 < args.length) i += 1
    } else if (a !== '' && a !== '-') {
      file = true
    }
  }
  return hasS || (!hasC && !file)
}

// Reads the delimiter of a heredoc whose "<<" ends just before start, and queues it with the words
// that started it, so the body can later be attached to that segment. Its quotes come off, a "-"
// before it means the body's leading tabs are ignored, and a quoted delimiter (a quote or a
// backslash in it) keeps the body from expanding. Returns the index of the last character read.
function readHeredoc(command, start, heredocs, owner) {
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
  heredocs.push({ word, strip, quoted, owner })
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
// substitutions and backquotes that a body with an unquoted delimiter expands. Each body is also
// attached to the words that started it, as their "heredocs" property, so the matcher can read a
// shell's script from it. A quote left unterminated fails closed: the masks after its opener read
// as unquoted, so a redirection hiding in it is still refused (issue 180).
function segmentsOf(command, depth = 0) {
  const segments = []
  let words = []
  // null between words; a quoted empty string is still a word.
  let word = null
  let quote = null
  // Where the currently open quote began, so an unterminated quote fails closed for redirection
  // purposes (issue 180): every character after its unmatched opener counts as unquoted.
  let openRef = null
  // Parallel to words and word: for each character, whether quotes held it. A `>` read inside
  // quotes is text (issue 180), not a redirection; the mention check reads the masks it needs.
  let wordMasks = []
  let marks = null
  // Appends text to the current word, remembering for each character whether quotes held it.
  const add = (text, wasQuoted) => {
    word = (word ?? '') + text
    marks = marks ?? []
    for (let k = 0; k < text.length; k++) marks.push(wasQuoted)
  }
  const resetWord = () => {
    word = ''
    marks = []
  }
  // The heredocs that the current command line started, whose bodies follow its newline.
  const heredocs = []
  const endWord = () => {
    if (word !== null) {
      words.push(word)
      wordMasks.push(marks ?? [])
    }
    word = null
    marks = null
  }
  const endSegment = () => {
    endWord()
    if (words.length > 0) {
      words.masks = wordMasks
      segments.push(words)
    }
    words = []
    wordMasks = []
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    const next = command[i + 1]
    if (quote === "'") {
      if (ch === "'") { quote = null; openRef = null }
      else add(ch, true)
    } else if (quote === '"') {
      if (ch === '"') { quote = null; openRef = null }
      else if (ch === '\\' && i + 1 < command.length && '"\\$`'.includes(command[i + 1])) add(command[++i], true)
      else if (ch === '$' && next === '(' && command[i + 2] === '(' && arithmeticEnd(command, i) !== -1) {
        const end = arithmeticEnd(command, i)
        const inner = command.slice(i + 3, end - 2)
        const subs = depth < MAX_NESTING ? heredocSegments(inner, depth) : []
        if (subs.length > 0) {
          endSegment()
          segments.push(...subs)
          resetWord()
        } else {
          add(command.slice(i, end), true)
        }
        i = end - 1
      } else if (ch === '$' && next === '(') {
        if (depth >= MAX_NESTING) {
          endSegment()
          quote = null
          openRef = null
          resetWord()
          continue
        }
        const sub = readSubstitution(command, i + 2)
        endSegment()
        // Nested segments carry their own level's balance: an unterminated outer quote
        // must not unmask them (issue 180).
        for (const nested of segmentsOf(sub.inner, depth + 1)) {
          nested.nested = true
          segments.push(nested)
        }
        resetWord()
        i = sub.end
      } else if (ch === '`') {
        if (depth >= MAX_NESTING) {
          endSegment()
          quote = null
          openRef = null
          resetWord()
          continue
        }
        const sub = readBacktick(command, i + 1)
        endSegment()
        for (const nested of segmentsOf(sub.inner, depth + 1)) {
          nested.nested = true
          segments.push(nested)
        }
        resetWord()
        i = sub.end
      } else add(ch, true)
    } else if (ch === '\\' && i + 1 < command.length) {
      // A backslash-newline continues the line; any other escaped character is taken literally.
      // An escaped `>` still counts as unquoted: when in doubt the guard refuses.
      i++
      if (command[i] !== '\n') add(command[i], false)
    } else if (ch === "'" || ch === '"') {
      quote = ch
      word = word ?? ''
      marks = marks ?? []
      openRef = { segCount: segments.length, words, masks: wordMasks, wordIdx: words.length, markLen: marks.length }
    } else if (ch === ' ' || ch === '\t' || ch === '\r') {
      endWord()
    } else if (ch === '\n') {
      endSegment()
      if (heredocs.length > 0) {
        const queued = heredocs.splice(0)
        const bodies = heredocBodies(command, i + 1, queued)
        i = bodies.end
        bodies.bodies.forEach((body, index) => {
          // Each body reaches the segment that started it, so the matcher can read a shell's
          // script from its heredoc; every other heredoc stays text but for its expansions.
          const owner = queued[index].owner
          if (owner !== null && owner !== undefined && segments.includes(owner)) {
            if (owner.heredocs === undefined) owner.heredocs = []
            owner.heredocs.push(body)
          }
          if (!body.quoted && depth < MAX_NESTING) segments.push(...heredocSegments(body.text, depth))
        })
      }
    } else if (ch === ';' || ch === '(' || ch === ')' || ch === '`') {
      endSegment()
    } else if (ch === '&' && i > 0 && '<>'.includes(command[i - 1])) {
      add(ch, false)
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
      i = readHeredoc(command, i + 2, heredocs, words)
    } else {
      add(ch, false)
    }
  }
  if (quote !== null && openRef !== null) {
    // An unterminated quote fails closed: a `>` read inside it counts as unquoted, so a
    // redirection to a protected target is still refused (issue 180). Only the characters
    // after the unmatched opener are unmasked; a balanced quoted `>` stays text.
    const unmaskFrom = (maskArr, from) => {
      for (let k = from; k < maskArr.length; k++) maskArr[k] = false
    }
    if (openRef.masks === wordMasks) {
      // No segment ended inside the unterminated quote.
      if (word !== null && words.length === openRef.wordIdx) {
        unmaskFrom(marks ?? [], openRef.markLen)
      } else {
        if (openRef.wordIdx < openRef.masks.length) unmaskFrom(openRef.masks[openRef.wordIdx], openRef.markLen)
        for (let k = openRef.wordIdx + 1; k < openRef.masks.length; k++) unmaskFrom(openRef.masks[k], 0)
        if (word !== null) unmaskFrom(marks ?? [], 0)
      }
    } else {
      // A segment ended inside the unterminated quote (a substitution in double quotes):
      // unmask the opener word's tail and everything after it.
      if (openRef.wordIdx < openRef.masks.length) unmaskFrom(openRef.masks[openRef.wordIdx], openRef.markLen)
      for (let k = openRef.wordIdx + 1; k < openRef.masks.length; k++) unmaskFrom(openRef.masks[k], 0)
      for (let s = openRef.segCount; s < segments.length; s++) {
        if (segments[s] !== openRef.words && !segments[s].nested && segments[s].masks) {
          for (const maskArr of segments[s].masks) unmaskFrom(maskArr, 0)
        }
      }
      for (const maskArr of wordMasks) unmaskFrom(maskArr, 0)
      if (word !== null) unmaskFrom(marks ?? [], 0)
    }
  }
  endSegment()
  return segments
}

// The text after the first unquoted `>` redirection of a shell word (`>>` and `>|` count as one
// operator), or null when the word holds none. A `>` read inside single or double quotes is text
// (issue 180), not a redirection; so is one with `<` before it (a heredoc or here-string), exactly
// as the match before it read them. `mask` marks each character that quotes held, as segmentsOf
// reads it. An escaped `>` outside quotes counts as unquoted: when in doubt the guard refuses.
function unquotedRedirection(word, mask) {
  for (let i = 0; i < word.length; i++) {
    if (word[i] !== '>' || (mask && mask[i])) continue
    if (i > 0 && word[i - 1] === '<') continue
    const pair = word[i + 1] === '>' || word[i + 1] === '|' ? word.slice(i, i + 2) : '>'
    return word.slice(i + pair.length)
  }
  return null
}

// Every simple command of a Bash line, including the commands a script or a shell heredoc runs, up to MAX_NESTING deep.
function commandSegments(command) {
  const segments = []
  const visit = (text, depth) => {
    for (const words of segmentsOf(text)) {
      segments.push(words)
      if (depth >= MAX_NESTING) continue
      const unwrapped = dropWrappers(words)
      const named = unwrapped.length ? [nameOf(unwrapped[0]), ...unwrapped.slice(1)] : unwrapped
      const script = scriptOf(named)
      if (script !== null) visit(script, depth + 1)
      if (SHELLS.has(named[0]) && shellReadsStdin(named.slice(1))) {
        for (const body of words.heredocs || []) visit(body.text, depth + 1)
      }
    }
  }
  visit(command, 0)
  return segments
}

// The redirection targets of a segment, in order: the word after each unquoted > operator, or the word after the
// operator when it stands alone. A > read inside quotes is text, and is no target.
function redirectTargets(segment) {
  const targets = []
  for (let i = 0; i < segment.length; i++) {
    const after = unquotedRedirection(segment[i], segment.masks && segment.masks[i])
    if (after !== null) targets.push((after || segment[i + 1] || '').trim())
  }
  return targets
}

module.exports = {
  commandSegments,
  dropWrappers,
  nameOf,
  redirectTargets,
  // Shared with guard.js, which classifies the segments this module reads.
  segmentsOf,
  unquotedRedirection,
  scriptOf,
  shellReadsStdin,
  skipOptions,
  SHELLS,
  MAX_NESTING,
}
