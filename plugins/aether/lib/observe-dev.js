'use strict'

// The development install's fragment (R11): on a failure event, the last few records of the session's
// transcript, each cut short and redacted, saved under <data dir>/observe/dev/<session>/. This is the only
// observation file that reads a conversation, in the development installation; the standard install never calls it.
// Family: observe.

const fs = require('node:fs')
const path = require('node:path')
const { isObject } = require('./common.js')
const { devDir, loadObserveConfig } = require('./observe.js')
const { redact } = require('./observe-redact.js')
const { ownerMessages } = require('./voice.js')

const MAX_FILES_PER_SESSION = 50
// Only the tail of a long transcript is read: the fragment wants its last records, not the whole session.
const TAIL_BYTES = 4 * 1024 * 1024
const SESSION = /^[A-Za-z0-9._-]{1,128}$/
const EVENT = /^[A-Za-z0-9]{1,64}$/
const FRAGMENT_FILE = /^\d+-[A-Za-z0-9]+\.json$/

function parseLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

// The text of a tool_result's content: a string, or the text blocks of an array.
function resultText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((block) => isObject(block) && typeof block.text === 'string').map((block) => block.text).join('\n')
}

// The entries of one record: { role, kind, text } per text, tool_use or tool_result block, text uncut.
function entriesOf(record) {
  if (!isObject(record) || (record.type !== 'user' && record.type !== 'assistant')) return []
  const message = record.message
  if (!isObject(message)) return []
  const role = message.role === 'user' || message.role === 'assistant' ? message.role : record.type
  const content = message.content
  if (typeof content === 'string') return content ? [{ role, kind: 'text', text: content }] : []
  if (!Array.isArray(content)) return []
  const entries = []
  for (const block of content) {
    if (!isObject(block)) continue
    if (block.type === 'text' && typeof block.text === 'string') entries.push({ role, kind: 'text', text: block.text })
    else if (block.type === 'tool_use') entries.push({ role, kind: 'tool_use', text: `${block.name ?? ''} ${JSON.stringify(block.input ?? {})}` })
    else if (block.type === 'tool_result') entries.push({ role, kind: 'tool_result', text: resultText(block.content) })
  }
  return entries
}

// Redacted before it is cut, so a cut never leaves a piece of a secret too short for its pattern; the text
// handed to redact is bounded first so a huge tool result costs a bounded scan.
function cutAndRedact(text, maxChars) {
  return redact(String(text).slice(0, maxChars * 64)).slice(0, maxChars)
}

function fragmentFrom(transcriptText, { records = 6, maxChars = 400 } = {}) {
  const count = Number.isFinite(records) ? Math.trunc(records) : 0
  if (typeof transcriptText !== 'string' || count < 1) return []
  const withContent = []
  for (const line of transcriptText.split('\n')) {
    if (!line.trim()) continue
    const entries = entriesOf(parseLine(line))
    if (entries.length) withContent.push(entries)
  }
  // The last `records` records, and never more than `records` entries even when a record has several blocks.
  const entries = withContent.slice(-count).flat().slice(-count)
  return entries.map((entry) => ({ role: entry.role, kind: entry.kind, text: cutAndRedact(entry.text, maxChars) }))
}

// The tail of the file; when it starts mid-file, its first, partial line is dropped.
function readTail(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - TAIL_BYTES)
    const buffer = Buffer.alloc(size - start)
    let read = 0
    while (read < buffer.length) {
      const n = fs.readSync(fd, buffer, read, buffer.length - read, start + read)
      if (n === 0) break
      read += n
    }
    const text = buffer.subarray(0, read).toString('utf8')
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1)
  } finally {
    fs.closeSync(fd)
  }
}

function captureFragment({ dataDir, session, event, input, now } = {}) {
  try {
    if (!isObject(input) || typeof input.transcript_path !== 'string' || !input.transcript_path) return null
    if (typeof dataDir !== 'string' || !dataDir) return null
    if (typeof session !== 'string' || !SESSION.test(session) || session === '.' || session === '..') return null
    if (typeof event !== 'string' || !EVENT.test(event)) return null
    const time = typeof now === 'number' && Number.isFinite(now) && now >= 0 ? Math.trunc(now) : Date.now()
    let text
    try {
      text = readTail(input.transcript_path)
    } catch {
      return null
    }
    const dir = path.join(devDir(dataDir), session)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.chmodSync(dir, 0o700)
    const saved = fs.readdirSync(dir).filter((name) => FRAGMENT_FILE.test(name)).length
    if (saved >= MAX_FILES_PER_SESSION) return null
    const file = path.join(dir, `${time}-${event}.json`)
    const body = { session, event, time, fragment: fragmentFrom(text) }
    fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
    fs.chmodSync(file, 0o600)
    return file
  } catch {
    return null
  }
}

// ---- The owner's corrections (R18): the one place that reads what the owner typed, for the development install.

const CORRECTIONS_SESSION = /^[A-Za-z0-9-]+$/
const CHUNK_BYTES = 64 * 1024
const SIDE_CHARS = 400
const LEAD_TAIL_CHARS = 2000
const NEWLINE = 0x0a

const NONE = () => ({ count: 0, items: [] })
const positive = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback)

// One regular expression for every phrase of both lists, built once per scan: a phrase is a whole word when no
// letter, digit or underscore comes before or after it; its spaces match any run of spaces, and the typographic
// apostrophe counts as the straight one (the message is normalised the same way).
function phraseMatcher(patterns) {
  if (!isObject(patterns)) return null
  const phrases = []
  for (const list of Object.values(patterns)) {
    if (!Array.isArray(list)) continue
    for (const phrase of list) {
      if (typeof phrase !== 'string' || !phrase.trim()) continue
      const words = phrase.toLowerCase().replace(/\u2019/g, "'").trim().split(/\s+/)
      phrases.push(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'))
    }
  }
  if (!phrases.length) return null
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${phrases.join('|')})(?![\\p{L}\\p{N}_])`, 'iu')
}

// The text blocks of an assistant record of the main chain, joined; '' for any other record.
function leadTextOf(line) {
  if (!line.includes('"assistant"')) return ''
  const record = parseLine(line)
  if (!isObject(record) || record.type !== 'assistant' || record.isSidechain === true || !isObject(record.message)) return ''
  const content = record.message.content
  if (typeof content === 'string') return content.trim() ? content : ''
  if (!Array.isArray(content)) return ''
  const text = content.filter((block) => isObject(block) && block.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n')
  return text.trim() ? text : ''
}

// Calls onLine(text) for each complete line that ends, newline included, within the first maxBytes bytes of the
// file, reading it once in chunks; onLine returns true to stop. Nothing past maxBytes is read.
function eachLine(file, maxBytes, onLine) {
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(CHUNK_BYTES)
    let pending = []
    let total = 0
    for (;;) {
      // One byte more than the limit tells a file that ends there from one that goes on.
      const wanted = Math.min(CHUNK_BYTES, maxBytes - total + 1)
      const n = fs.readSync(fd, buffer, 0, wanted, total)
      if (n === 0) break
      const usable = Math.min(n, maxBytes - total)
      const chunk = buffer.subarray(0, usable)
      total += usable
      let start = 0
      for (let at = chunk.indexOf(NEWLINE); at !== -1; at = chunk.indexOf(NEWLINE, start)) {
        pending.push(Buffer.from(chunk.subarray(start, at)))
        start = at + 1
        if (onLine(Buffer.concat(pending).toString('utf8'))) return
        pending = []
      }
      pending.push(Buffer.from(chunk.subarray(start)))
      if (n > usable) return
    }
    // The end of the file, a last line without its newline, still ends within the limit.
    onLine(Buffer.concat(pending).toString('utf8'))
  } finally {
    fs.closeSync(fd)
  }
}

function scanCorrections(transcriptPath, cfg) {
  const items = []
  try {
    if (typeof transcriptPath !== 'string' || !transcriptPath || !isObject(cfg)) return NONE()
    const matcher = phraseMatcher(cfg.correctionPatterns)
    const maxPerSession = positive(isObject(cfg.corrections) ? cfg.corrections.maxPerSession : undefined, 0)
    const maxBytes = positive(isObject(cfg.corrections) ? cfg.corrections.maxScanBytes : undefined, 0)
    if (!matcher || !maxPerSession || !maxBytes) return NONE()
    let lastLead = ''
    eachLine(transcriptPath, maxBytes, (line) => {
      if (!line.trim()) return false
      const leadText = leadTextOf(line)
      if (leadText) {
        lastLead = leadText
        return false
      }
      const [message] = ownerMessages([line])
      if (!message || !matcher.test(message.text.replace(/\u2019/g, "'"))) return false
      // Redacted before it is cut, so the cut never leaves half a key that no pattern recognises.
      items.push({
        time: message.time,
        owner: redact(message.text).slice(0, SIDE_CHARS),
        before: lastLead ? redact(lastLead.slice(-LEAD_TAIL_CHARS)).slice(-SIDE_CHARS) : '',
      })
      return items.length >= maxPerSession
    })
  } catch {
    // What was found until the error is kept.
  }
  return { count: items.length, items }
}

// Writes through a temporary file of the same folder and a rename, so a reader never sees half a file.
function writePrivateAtomic(file, text) {
  const temp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temp, text, { mode: 0o600 })
    fs.chmodSync(temp, 0o600)
    fs.renameSync(temp, file)
  } catch (err) {
    fs.rmSync(temp, { force: true })
    throw err
  }
}

function captureCorrections({ dataDir, session, input, now, cfg } = {}) {
  try {
    if (typeof dataDir !== 'string' || !dataDir) return null
    if (typeof session !== 'string' || !CORRECTIONS_SESSION.test(session)) return null
    if (!isObject(input) || typeof input.transcript_path !== 'string' || !input.transcript_path) return null
    const { count, items } = scanCorrections(input.transcript_path, cfg === undefined ? loadObserveConfig() : cfg)
    if (count === 0) return null
    const dir = path.join(devDir(dataDir), session)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.chmodSync(dir, 0o700)
    const file = path.join(dir, 'corrections.json')
    writePrivateAtomic(file, `${JSON.stringify({ session, time: now, count, items }, null, 2)}\n`)
    return file
  } catch {
    return null
  }
}

module.exports = { fragmentFrom, captureFragment, scanCorrections, captureCorrections }
