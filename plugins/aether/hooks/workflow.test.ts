import { expect, mock, test } from 'claude-code/testing'

// Issue 187, part 2: a Lead session whose first main request has no Workflow tool is told once, by a notice to the owner and a
// prompt to the Lead. With the tool, in a subagent's request, or in a session that is not a Lead's, nothing happens, and no
// tool list is asked for there. A failure of the check leaves the request as it was.

const NO_WORKFLOW = 'Aether: this session has no Workflow tool, so /aether:design and /aether:run cannot start. Turn on Dynamic workflows in /config (or set enableWorkflows: true in settings.json) and start a new session; an open run resumes from its diary. Run aether-doctor for the cause.'

function stubs(on, { marked = true, tools = ['Bash', 'Read'] as string[] | null, listThrows = false, notifyThrows = false } = {}) {
  mock.clock(on, { now: 2000 })
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  const writes: { path: string; text: string }[] = []
  const notes: any[] = []
  const prompts: any[] = []
  const lists = { count: 0 }
  on('session.id', () => ({ value: 's1' }))
  on('session.version', () => ({ value: { version: '2.1.322', base: '2.1.322', builtAt: '2026-11-11T00:00:00Z' } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', ($, e) => ({ value: marked === true && e.path.endsWith('/sessions/s1.json') }))
  on('fs.write', ($, e) => { writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  on('classic.SessionStart', () => ({}))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('agent.offer', () => ({ isOffered: true }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('tool.list', () => {
    lists.count += 1
    if (listThrows) throw new Error('tool list broke')
    if (tools === null) return { value: undefined }
    return { value: tools.map((name) => ({ name, description: '', mcp: false })) }
  })
  on('ui.notify', ($, e) => {
    if (notifyThrows) throw new Error('notify broke')
    notes.push(e)
    return { value: { isSent: true, channel: 'test' } }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e)
    return { text: e.text }
  })
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: e.model } }
  })
  return { writes, notes, prompts, lists }
}

async function step($, fields: Record<string, unknown> = {}) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, ...fields })
  let s = await stream.next()
  while (s.done !== true) s = await stream.next()
  await new Promise((resolve) => setTimeout(resolve, 0))
  return s.value
}

test('a Lead request without the Workflow tool tells the owner and the Lead, once (issue 187)', async ($, on) => {
  const s = stubs(on)
  const result = await step($)
  expect(result.answer).toBe('ok')
  expect(s.notes.length).toBe(1)
  expect(s.notes[0].text).toBe(NO_WORKFLOW)
  expect(s.prompts.map((p) => p.text)).toEqual([NO_WORKFLOW])
})

test('a second main request of the same session tells nothing and asks no tool list again', async ($, on) => {
  const s = stubs(on)
  await step($)
  await step($)
  await step($)
  expect(s.notes.length).toBe(1)
  expect(s.prompts.length).toBe(1)
  expect(s.lists.count).toBe(1)
})

test('a request whose tools include Workflow tells nothing, now or later', async ($, on) => {
  const s = stubs(on, { tools: ['Bash', 'Workflow', 'Read'] })
  await step($)
  await step($)
  expect(s.notes).toEqual([])
  expect(s.prompts).toEqual([])
  expect(s.lists.count).toBe(1)
})

test("a subagent's request tells nothing and asks no tool list", async ($, on) => {
  const s = stubs(on)
  await step($, { agentId: 'agent-7' })
  expect(s.notes).toEqual([])
  expect(s.prompts).toEqual([])
  expect(s.lists.count).toBe(0)
})

test('the first main request still decides after a subagent has run', async ($, on) => {
  const s = stubs(on)
  await step($, { agentId: 'agent-7' })
  await step($)
  expect(s.notes.length).toBe(1)
  expect(s.lists.count).toBe(1)
})

test("a session that is not a Lead's tells nothing and asks no tool list", async ($, on) => {
  const s = stubs(on, { marked: false })
  const result = await step($)
  expect(result.answer).toBe('ok')
  expect(s.notes).toEqual([])
  expect(s.prompts).toEqual([])
  expect(s.lists.count).toBe(0)
  expect(s.writes.some((w) => w.path.includes('/observe/faults/'))).toBe(false)
})

test('when the tool list is not available the check says nothing, and asks again at the next request', async ($, on) => {
  const s = stubs(on, { tools: null })
  await step($)
  expect(s.notes).toEqual([])
  expect(s.lists.count).toBe(1)
  await step($)
  expect(s.lists.count).toBe(2)
  expect(s.notes).toEqual([])
})

test('a failed tool list leaves the request as it was and leaves a fault record (R1)', async ($, on) => {
  const s = stubs(on, { listThrows: true })
  const result = await step($)
  expect(result.answer).toBe('ok')
  expect(s.notes).toEqual([])
  const fault = s.writes.find((w) => w.path === '/home/u/aether-data/observe/faults/s1-2000.json')
  expect(fault).toBeTruthy()
  expect(JSON.parse(fault!.text).faults).toEqual([{ time: 2000, source: 'register.workflow-check', class: 'handler-threw', kind: 'Error' }])
})

test('a failed notice leaves the request answered, leaves a fault record, and is not sent again', async ($, on) => {
  const s = stubs(on, { notifyThrows: true })
  const result = await step($)
  expect(result.answer).toBe('ok')
  const fault = s.writes.find((w) => w.path === '/home/u/aether-data/observe/faults/s1-2000.json')
  expect(fault).toBeTruthy()
  expect(JSON.parse(fault!.text).faults[0].source).toBe('register.workflow-check')
  await step($)
  expect(s.lists.count).toBe(1)
})
