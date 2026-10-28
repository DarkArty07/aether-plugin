'use strict'

// Path patterns for task ownership. Supported syntax: `*` (within one
// segment), `**` (any depth) and `?` (one character). A pattern without
// wildcards names a file or a directory.
// Family: none.

const WILDCARD = /[*?]/

function normalizePattern(pattern) {
  let p = String(pattern).trim()
  if (p.length >= 2 && p.startsWith('`') && p.endsWith('`')) p = p.slice(1, -1).trim()
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '')
}

function isGlob(pattern) {
  return WILDCARD.test(normalizePattern(pattern))
}

// The literal part of a pattern, before its first wildcard segment.
function staticPrefix(pattern) {
  const kept = []
  for (const segment of normalizePattern(pattern).split('/')) {
    if (WILDCARD.test(segment)) break
    kept.push(segment)
  }
  return kept.join('/')
}

function within(p, dir) {
  return dir === '' || p === dir || p.startsWith(dir + '/')
}

function segmentsOf(pattern) {
  return pattern === '' ? [] : pattern.split('/')
}

// A literal names a file or a folder, and a folder holds every path under it.
function alternatives(pattern) {
  const segments = segmentsOf(normalizePattern(pattern))
  return isGlob(pattern) ? [segments] : [segments, [...segments, '**']]
}

// Whether some path through the pairs (i, j) reaches the end of both lists.
// `step(i, j, from)` decides (i, j) from the memoized `from` of the next pairs.
function reachesEnd(step) {
  const memo = new Map()
  const from = (i, j) => {
    const key = `${i},${j}`
    if (!memo.has(key)) memo.set(key, step(i, j, from))
    return memo.get(key)
  }
  return from(0, 0)
}

// Whether two names (one segment, no slash) can be the same name: `*` takes
// any run of characters, `?` one character, anything else itself.
function namesOverlap(x, y) {
  if (x.includes('**') || y.includes('**')) return true
  return reachesEnd((i, j, from) => {
    if (i === x.length && j === y.length) return true
    if (x[i] === '*' && from(i + 1, j)) return true
    if (y[j] === '*' && from(i, j + 1)) return true
    if (i === x.length || j === y.length) return false
    if (x[i] === '*') return y[j] !== '*' && from(i, j + 1)
    if (y[j] === '*') return from(i + 1, j)
    return (x[i] === '?' || y[j] === '?' || x[i] === y[j]) && from(i + 1, j + 1)
  })
}

// Whether two lists of segments can match one path. `**` takes any run of
// segments, zero or more; the other segments are compared with namesOverlap.
function segmentsOverlap(a, b) {
  return reachesEnd((i, j, from) => {
    if (i === a.length && j === b.length) return true
    if (a[i] === '**' && from(i + 1, j)) return true
    if (b[j] === '**' && from(i, j + 1)) return true
    if (i === a.length || j === b.length) return false
    if (a[i] === '**') return b[j] !== '**' && from(i, j + 1)
    if (b[j] === '**') return from(i + 1, j)
    return namesOverlap(a[i], b[j]) && from(i + 1, j + 1)
  })
}

// Conservative: true whenever the two patterns could match a common path.
function patternsOverlap(a, b) {
  // A `**` that is not a whole segment (`src/a**`) crosses folders inside a name, which the segment rules do not model.
  const insideName = (pattern) => segmentsOf(normalizePattern(pattern)).some((segment) => segment !== '**' && segment.includes('**'))
  if (insideName(a) || insideName(b)) return true
  const xs = alternatives(a)
  const ys = alternatives(b)
  return xs.some((x) => ys.some((y) => segmentsOverlap(x, y)))
}

function globToRegExp(pattern) {
  const p = normalizePattern(pattern)
  let out = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        out += '(?:.*/)?'
        i += 2
      } else {
        out += '.*'
        i += 1
      }
    } else if (c === '*') {
      out += '[^/]*'
    } else if (c === '?') {
      out += '[^/]'
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp('^' + out + '$')
}

function matchesAny(filePath, patterns) {
  const f = normalizePattern(filePath)
  return patterns.some((pattern) => {
    const p = normalizePattern(pattern)
    return isGlob(p) ? globToRegExp(p).test(f) : within(f, p)
  })
}

module.exports = { normalizePattern, isGlob, staticPrefix, patternsOverlap, globToRegExp, matchesAny }
