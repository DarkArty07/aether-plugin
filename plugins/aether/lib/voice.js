'use strict'

// The owner's own words: the messages the owner typed in a session transcript.
// Transcripts are JSONL files under <configDir>/projects/<folder>/<sessionId>.jsonl.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DEFAULT_MAX_CHARS = 8000

function isOwnerRecord(record) {
  if (record.type !== 'user' || record.isSidechain === true) return false
  // Skill loads, compaction summaries and tool results are never the owner, whatever their origin says.
  if (record.isMeta || record.isCompactSummary || record.toolUseResult !== undefined) return false
  if ('origin' in record) return Boolean(record.origin) && record.origin.kind === 'human'
  return true
}

function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (block && block.type === 'image') parts.push('[image]')
  }
  return parts.join('\n\n')
}

function cut(text, maxChars) {
  const chars = Array.from(text)
  if (chars.length <= maxChars) return text
  return `${chars.slice(0, maxChars).join('')}\n[… ${chars.length - maxChars} more characters cut]`
}

function parseLine(line) {
  if (!line.trim()) return null
  try {
    const record = JSON.parse(line)
    return record && typeof record === 'object' ? record : null
  } catch {
    return null
  }
}

// A message the owner types while a turn is running is absorbed mid-turn: it is
// not a `user` record but an attachment queued_command with commandMode
// "prompt" (issue 014). Other queued commands (task notifications and the
// like) are not the owner's words, so anything but "prompt" stays out.
function queuedPrompt(record) {
  if (record.type !== 'attachment' || record.isSidechain === true) return null
  const a = record.attachment
  if (!a || a.type !== 'queued_command' || a.commandMode !== 'prompt') return null
  return a
}

function ownerMessages(lines, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const messages = []
  for (const line of lines) {
    const record = parseLine(line)
    if (!record) continue
    const queued = queuedPrompt(record)
    if (queued) {
      const text = textOf(queued.prompt)
      if (!text.trim()) continue
      const time = typeof record.timestamp === 'string' ? record.timestamp : typeof queued.timestamp === 'string' ? queued.timestamp : ''
      messages.push({ time, text: cut(text, maxChars) })
      continue
    }
    if (!isOwnerRecord(record)) continue
    const text = textOf(record.message && record.message.content)
    if (!text.trim()) continue
    // Without an origin, a "<..." text is a command or a notification, not the owner speaking.
    if (!('origin' in record) && text.startsWith('<')) continue
    messages.push({
      time: typeof record.timestamp === 'string' ? record.timestamp : '',
      text: cut(text, maxChars),
    })
  }
  return messages
}

function findTranscript(sessionId, { configDir } = {}) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.includes('/') || sessionId.includes('..')) return null
  const base = configDir || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const projects = path.join(base, 'projects')
  let folders
  try {
    folders = fs.readdirSync(projects).sort()
  } catch {
    return null
  }
  for (const folder of folders) {
    const candidate = path.join(projects, folder, `${sessionId}.jsonl`)
    // A folder that cannot be read is skipped, not fatal.
    try {
      if (fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate
    } catch {
      continue
    }
  }
  return null
}

function render(sessionId, messages) {
  const heading = `# The owner's messages (session ${sessionId})\n\n`
  if (messages.length === 0) return `${heading}No messages from the owner yet.\n`
  return heading + messages.map((m, i) => `## ${i + 1}. ${m.time}\n\n${m.text}\n`).join('\n')
}

module.exports = { ownerMessages, findTranscript, render }
