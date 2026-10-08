'use strict'

// Path patterns for task ownership. Supported syntax: `*` (within one
// segment), `**` (any depth) and `?` (one character). A pattern without
// wildcards names a file or a directory.

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

function anchor(pattern) {
  const p = normalizePattern(pattern)
  return isGlob(p) ? staticPrefix(p) : p
}

function within(p, dir) {
  return dir === '' || p === dir || p.startsWith(dir + '/')
}

// Conservative: true whenever the two patterns could match a common path.
function patternsOverlap(a, b) {
  const x = anchor(a)
  const y = anchor(b)
  return within(x, y) || within(y, x)
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
