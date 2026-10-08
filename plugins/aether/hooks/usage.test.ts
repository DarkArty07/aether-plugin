import { expect, mock, test } from 'claude-code/testing'

// Tests for the usage meter in register.js. Run them with `claude plugin test plugins/aether`.

type Write = { path: string; text: string }

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 }

// Answers what the meter asks Claude Code for, and keeps every file it writes.
function stubs(on, { env = { HOME: '/home/u' } as Record<string, string>, existing = [] as string[], failWrites = false } = {}) {
  const writes: Write[] = []
  mock.clock(on, { now: 1000 })
  mock.env(on, env)
  on('session.id', () => ({ value: 's1' }))
  on('session.version', () => ({ value: { version: '2.1.294', base: '2.1.294', builtAt: '2026-10-08T00:00:00Z' } }))
  on('fs.list', () => ({ value: existing.map((name) => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }))
  on('fs.write', ($, e) => {
    if (failWrites) return { deny: 'disk full' }
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'agent-1' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { ...USAGE, model: e.model } }
  })
  return writes
}

// Fires one request to the model and reads its stream to the end.
async function step($, fields: Record<string, unknown> = {}) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...fields })
  let s = await stream.next()
  while (s.done !== true) s = await stream.next()
  return s.value
}

const endTurn = ($) => $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 5, isAborted: false, usage: null })

// The newest content written to each path.
function files(writes: Write[]) {
  const latest: Record<string, any> = {}
  for (const w of writes) latest[w.path] = JSON.parse(w.text)
  return latest
}

test('records main and agent requests with the agent type, and writes part 0 when a turn ends', async ($, on) => {
  const writes = stubs(on)
  await $.agent.spawn({
    tool_use_id: 'tu1',
    prompt: 'p',
    description: 'task-1: implement on haiku (attempt 1)',
    subagentType: 'aether:implementer',
    model: 'haiku',
    background: true,
    fork: false,
  })
  await step($)
  await step($, { model: 'claude-haiku-5-5', agentId: 'agent-1' })
  await endTurn($)
  const part = files(writes)['/home/u/.local/share/aether-plugin/usage/s1/0.json']
  expect(part).toMatchObject({
    session: 's1',
    part: 0,
    claudeCode: '2.1.294',
    agents: { 'agent-1': { type: 'aether:implementer', description: 'task-1: implement on haiku (attempt 1)' } },
  })
  expect(part.entries).toEqual([
    { t: 1000, ms: 0, agent: null, model: 'claude-opus-5-5', input: 10, output: 5, cacheRead: 100, cacheWrite: 50 },
    { t: 1000, ms: 0, agent: 'agent-1', model: 'claude-haiku-5-5', input: 10, output: 5, cacheRead: 100, cacheWrite: 50 },
  ])
})

test('AETHER_DATA_DIR overrides the data directory, and session end writes what is pending', async ($, on) => {
  const writes = stubs(on, { env: { HOME: '/home/u', AETHER_DATA_DIR: '/data/aether' } })
  await step($)
  await $.session.end({ reason: 'other' })
  expect(Object.keys(files(writes))).toEqual(['/data/aether/usage/s1/0.json'])
})

test('parts already on disk are kept: this instance writes after them', async ($, on) => {
  const writes = stubs(on, { existing: ['0.json', '1.json', 'notes.txt'] })
  await step($)
  await endTurn($)
  const latest = files(writes)
  expect(Object.keys(latest)).toEqual(['/home/u/.local/share/aether-plugin/usage/s1/2.json'])
  expect(latest['/home/u/.local/share/aether-plugin/usage/s1/2.json'].part).toBe(2)
})

test('more than 1,000 entries roll over to a second part', { timeoutMs: 60000 }, async ($, on) => {
  const writes = stubs(on)
  for (let i = 0; i < 1001; i++) await step($, { index: i })
  await endTurn($)
  const latest = files(writes)
  expect(latest['/home/u/.local/share/aether-plugin/usage/s1/0.json'].entries.length).toBe(1000)
  expect(latest['/home/u/.local/share/aether-plugin/usage/s1/1.json'].entries.length).toBe(1)
  expect(latest['/home/u/.local/share/aether-plugin/usage/s1/1.json'].part).toBe(1)
})

test('a failing write changes nothing in the request', async ($, on) => {
  const writes = stubs(on, { failWrites: true })
  const result = await step($)
  expect(result.answer).toBe('ok')
  expect(result.usage.input_tokens).toBe(10)
  await endTurn($)
  expect(writes).toEqual([])
})
