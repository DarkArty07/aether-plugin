import { expect, mock, test } from 'claude-code/testing'

// R1: a failure the meter used to swallow leaves a record, and the request is not changed by it.

type Write = { path: string; text: string }

function stubs(on, { failAll = false } = {}) {
  const writes: Write[] = []
  mock.clock(on, { now: 2000 })
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  on('session.id', () => ({ value: 's1' }))
  on('session.version', () => ({ value: { version: '2.1.309', base: '2.1.309', builtAt: '2026-10-20T00:00:00Z' } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.write', ($, e) => {
    if (failAll || e.path.includes('/usage/')) return { deny: 'disk full' }
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: e.path.endsWith('/sessions/s1.json') }))
  on('agent.offer', () => ({ isOffered: true }))
  on('classic.SessionStart', () => ({}))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: e.model } }
  })
  return writes
}

async function oneTurn($) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  let s = await stream.next()
  while (s.done !== true) s = await stream.next()
  await $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 5, isAborted: false, usage: null })
  await new Promise((resolve) => setTimeout(resolve, 0))
  return s.value
}

test('a failed usage write leaves a fault record and the request still answers (R1)', async ($, on) => {
  const writes = stubs(on)
  const result = await oneTurn($)
  expect(result.answer).toBe('ok')
  // The record is named by the session and by the clock at the copy's first write (issue 93).
  const fault = writes.find((w) => w.path === '/home/u/aether-data/observe/faults/s1-2000.json')
  expect(fault).toBeTruthy()
  expect(JSON.parse(fault.text)).toEqual({ session: 's1', count: 1, faults: [{ time: 2000, source: 'register.flush', class: 'write-failed' }] })
  expect(writes.some((w) => w.text.includes('disk full'))).toBe(false)
})

test('when the fault record cannot be written either, nothing changes for the request (R1)', async ($, on) => {
  const writes = stubs(on, { failAll: true })
  const result = await oneTurn($)
  expect(result.answer).toBe('ok')
  expect(writes).toEqual([])
})
