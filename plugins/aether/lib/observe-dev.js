'use strict'

// The development install's fragment (R11): on a failure event, the last few records of the session's
// transcript, each cut short and redacted, saved under <data dir>/observe/dev/<session>/. This is the one
// observation file that reads the transcript; the standard install never calls it.

const fs = require('node:fs')
const path = require('node:path')
const { devDir } = require('./observe.js')
const { redact } = require('./observe-redact.js')

const MAX_FILES_PER_SESSION = 50
// Only the tail of a long transcript is read: the fragment wants its last records, not the whole session.
const TAIL_BYTES = 4 * 1024 * 1024
const SESSION = /^[A-Za-z0-9._-]{1,128}$/
const EVENT = /^[A-Za-z0-9]{1,64}$/
const FRAGMENT_FILE = /^\d+-[A-Za-z0-9]+\.json$/

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

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
    else if (block.type === 'tool_use') entries.push({ role, kind: 'tool_use', text: `${block.name} ${JSON.stringify(block.input ?? {})}` })
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
  if (typeof transcriptText !== 'string') return []
  const withContent = []
  for (const line of transcriptText.split('\n')) {
    if (!line.trim()) continue
    const entries = entriesOf(parseLine(line))
    if (entries.length) withContent.push(entries)
  }
  // The last `records` records, and never more than `records` entries even when a record has several blocks.
  const entries = withContent.slice(-records).flat().slice(-records)
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
    const time = typeof now === 'number' && Number.isFinite(now) ? Math.trunc(now) : Date.now()
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

module.exports = { fragmentFrom, captureFragment }
