'use strict'

// Secret removal for the development fragments (R11): every key, token and secret-named value becomes
// [redacted] and the rest of the text is kept as it was. The rules run in order, the specific shapes first,
// so a later, broader rule only sees what an earlier one left; each rule leaves [redacted] as it found it,
// so redact(redact(x)) === redact(x).
// Family: observe.

const MASK = '[redacted]'

// A value after `name=` or `name:`: an escaped quoted string (inside a JSON string), a quoted string, or a
// bare run up to a space, a quote, a backslash or a separator. An unclosed quote still masks its bare run.
const VALUE = String.raw`(?:\\"[^\n]*?\\"|"(?:[^"\\\n]|\\.)*"|'[^'\n]*'|(?:\\?["'])?[^\s"'\\,;&]+)`
// A name that contains one of the secret words; the runs around the word are bounded so a long identifier
// cannot make the scan quadratic.
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]{0,64}(?:key|token|secret|password|passwd)[A-Za-z0-9_.-]{0,64}`

const RULES = [
  // -----BEGIN … PRIVATE KEY----- … -----END … PRIVATE KEY-----; a block whose end was cut off runs to the end.
  [/-----BEGIN[A-Z0-9 ]*PRIVATE KEY-----(?:[\s\S]*?-----END[A-Z0-9 ]*PRIVATE KEY-----|[\s\S]*$)/g, MASK],
  // The password of a URL: scheme://user:password@host.
  [/(\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:/@"']+:)[^\s@/"']+(@)/g, `$1${MASK}$2`],
  // Authorization: Bearer|Basic|Token|Digest <value>, and a bare Authorization: <value>.
  [new RegExp(String.raw`(authorization\\?["']?[ \t]*[:=][ \t]*(?:(?:bearer|basic|token|digest)[ \t]+)?)${VALUE}`, 'gi'), `$1${MASK}`],
  // A bearer token anywhere else, such as a custom header; eight characters or more, so prose stays.
  [/(\bbearer[ \t]+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${MASK}`],
  // Keys and tokens by their prefix.
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{17,}/g, MASK],
  [/(?<![A-Za-z0-9])(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+/g, MASK],
  [/(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]+/g, MASK],
  [/(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]+/g, MASK],
  [/(?<![A-Za-z0-9])glpat-[A-Za-z0-9_-]+/g, MASK],
  [/(?<![A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]+/g, MASK],
  [/(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}/g, MASK],
  [/(?<![A-Za-z0-9])AIza[A-Za-z0-9_-]{35}/g, MASK],
  // A JWT: eyJ<header>.<payload>.<signature>, the signature possibly empty.
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, MASK],
  // name=value and name: value, with the name possibly quoted, as in JSON.
  [new RegExp(String.raw`(${SECRET_NAME}\\?["']?[ \t]*[:=][ \t]*)${VALUE}`, 'gi'), `$1${MASK}`],
  // --name value and -name value on a command line.
  [new RegExp(String.raw`((?<![A-Za-z0-9_-])--?${SECRET_NAME}[ \t]+)(?!-)${VALUE}`, 'gi'), `$1${MASK}`],
  // Any run of 32 or more characters of [A-Za-z0-9+/=_-] with at least one digit.
  [/[A-Za-z0-9+/=_-]{32,}/g, (run) => (/[0-9]/.test(run) ? MASK : run)],
]

function redact(text) {
  if (typeof text !== 'string') return ''
  let out = text
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement)
  return out
}

module.exports = { redact }
