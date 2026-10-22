import { expect, mock, test } from 'claude-code/testing'

// Tests for the /spend panel (spend-panel.jsx, with spend-view.mjs). Run them with `claude plugin test plugins/aether`.
// The pure parts are also tested with node, in tests/spend-view.test.js.

const PANE_ID = 'spend'
const NOW = 1792169230000
const DESCRIPTION = 'Show the list-price spend of this Aether session'
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const REPORT = {"session":"s1","recorded":true,"complete":true,"basis":"test table, S1","currency":"USD","usd":30.5,"leadUsd":20,"agentsUsd":8.25,"byModel":{"claude-opus-5-5":{"usd":25.5,"requests":7},"claude-haiku-5-5":{"usd":5,"requests":12}},"byEffort":{"claude-opus-5-5 xhigh":{"usd":25.5,"requests":7},"claude-haiku-5-5 unknown":{"usd":5,"requests":12}},"byRole":{"main":{"usd":20,"requests":5},"aether:implementer":{"usd":8.25,"requests":14}},"harness":{"calls":3,"usd":2.25,"byModel":{"claude-haiku-5-5":{"usd":2.25,"calls":2}}},"unpriced":["x-free"],"firstRequest":"2026-09-01T10:00:00.000Z","lastRequest":"2026-09-03T10:00:00.000Z","resumptions":4,"resumptionsApproximate":true}
const NOT_RECORDED = { ...REPORT, session: 's1', recorded: false, usd: null, leadUsd: null, agentsUsd: null, byModel: {}, byEffort: {}, byRole: {}, harness: { calls: 0, usd: 0, byModel: {} }, unpriced: [], firstRequest: null, lastRequest: null, resumptions: null }

type Answer = { exitCode: number; stdout: string; stderr?: string } | { deny: string }
type Run = { argv: string[]; init: Record<string, any> }
const printed = (value: unknown): Answer => ({ exitCode: 0, stdout: `${JSON.stringify(value)}\n` })

// Answers what the mod asks Claude Code for, and keeps what it did. `calls` counts the model and the prompt: a
// /spend must leave both at zero.
function stubs(on, { marked = (() => true) as () => boolean, answer = (run: Run): Answer | Promise<Answer> => printed(REPORT), placed = true, reason = 'out of room' } = {}) {
  const runs: Run[] = []
  const registered: Array<Record<string, any>> = []
  const opened: Array<Record<string, unknown>> = []
  const closed: Array<Record<string, unknown>> = []
  const toasts: string[] = []
  const calls = { model: 0, prompt: 0 }
  mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  on('session.id', () => ({ value: 's1' }))
  on('fs.exists', ($, e) => ({ value: marked() && e.path.endsWith('/sessions/s1.json') }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('command.register', ($, e) => {
    registered.push(e as Record<string, any>)
    return { value: { command: (e as { name: string }).name } }
  })
  on('command.run', () => ({ text: 'the engine ran its own command' }))
  on('model.complete', () => {
    calls.model++
    return { value: { isAnswered: false, reason: 'none' } }
  })
  on('prompt.submit', ($, e) => {
    calls.prompt++
    return { text: (e as { text: string }).text }
  })
  on('ui.toast', ($, e) => {
    toasts.push(typeof e === 'string' ? e : (e as any).message ?? (e as any).text ?? String(e))
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    opened.push(e as Record<string, unknown>)
    return { value: { isPlaced: placed, reason } }
  })
  on('ui.close', ($, e) => {
    closed.push(e as Record<string, unknown>)
    return { value: undefined }
  })
  on('process.run', async ($, e) => {
    const run: Run = { argv: [...e.argv], init: { ...(e.init || {}) } }
    runs.push(run)
    const done = await answer(run)
    if ('deny' in done) return { deny: done.deny }
    return { value: { stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...done } }
  })
  return { runs, registered, opened, closed, calls, toasts }
}

function gate() {
  let open: () => void = () => {}
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { wait, open }
}
async function settled() {
  for (let i = 0; i < 400; i++) await Promise.resolve()
}

type Props = { title: string; isFocused: boolean; bodyColumns: number; placement: 'inline'; scroll: { offset: number; bodyRows: number }; view: object }
const pane = (bodyColumns = 76, bodyRows = 60): Props => ({ title: 'Spend', isFocused: true, bodyColumns, placement: 'inline', scroll: { offset: 0, bodyRows }, view: {} })
const mount = ($, surface, props = pane()) => $.ui.mount({ plugin: 'aether', surface, component: 'Pane', props, requestId: PANE_ID })
const textOf = (node): string => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''))
async function paneRows(ui): Promise<string[]> {
  const tree = await ui.drawn()
  return (tree.children || []).map((child) => (typeof child !== 'string' && child.type === 'Box' ? '[buttons]' : textOf(child)))
}
const startSession = ($) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

test('the Lead\'s SessionStart declares /spend every time, as one that may run mid-turn', async ($, on) => {
  const { registered } = stubs(on)
  for (const source of ['startup', 'clear', 'compact']) await $.classic.SessionStart({ source, agent_type: 'aether:lead' })
  const spend = registered.filter((spec) => spec.name === 'spend')
  expect(spend.length).toBe(3)
  expect(spend.every((spec) => spec.immediate === true && spec.description === DESCRIPTION)).toBe(true)
})

test('no other SessionStart declares it', async ($, on) => {
  const { registered } = stubs(on)
  await startSession($)
  await $.classic.SessionStart({ source: 'startup' })
  await $.classic.SessionStart({ source: 'startup', agent_type: 'general-purpose' })
  await $.classic.SessionStart({ source: 'resume', agent_type: 'aether:implementer' })
  expect(registered.filter((spec) => spec.name === 'spend')).toEqual([])
})

test('/spend opens the pane and runs aether-report for this session, with no model and no prompt', async ($, on) => {
  const { runs, opened, calls } = stubs(on)
  const result = await $.command.run({ command: 'spend' })
  expect(result.text).toBeUndefined()
  expect(opened.length).toBe(1)
  expect(opened[0]?.id).toBe(PANE_ID)
  expect(opened[0]?.focus).toBe(true)
  expect(opened[0]?.closeOnEscape).toBe(true)
  await settled()
  expect(runs.map((run) => [run.argv[0], run.argv[1].split('/').slice(-2).join('/'), ...run.argv.slice(2)])).toEqual([['node', 'bin/aether-report', '--spend', '--session', 's1']])
  expect(calls).toEqual({ model: 0, prompt: 0 })
})

test('the pane says Reading… until the bin returns, and no model is called meanwhile', async ($, on) => {
  const held = gate()
  const { calls } = stubs(on, { answer: async () => { await held.wait; return printed(REPORT) } })
  await $.command.run({ command: 'spend' })
  const ui = await mount($, 'terminal')
  expect((await paneRows(ui))).toContain('Reading…')
  expect(calls).toEqual({ model: 0, prompt: 0 })
  held.open()
  await settled()
  const rows = await paneRows(ui)
  expect(rows).not.toContain('Reading…')
  expect(rows).toContain('Total US$ 30.50')
  expect(calls).toEqual({ model: 0, prompt: 0 })
  await ui.unmount()
})

test('every surface draws the figure of this session', async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'spend' })
  await settled()
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const rows = await paneRows(ui)
    expect(rows[0]).toBe('Aether · session spend')
    expect(rows).toContain('Session s1 · list prices · test table, S1')
    expect(rows).toContain('Total US$ 30.50')
    expect(rows).toContain('Lead US$ 20.00 · Agents US$ 8.25 · Other harnesses US$ 2.25')
    expect(rows).toContain('  aether:implementer  US$ 8.25  14 requests')
    expect(rows).toContain('No price: x-free')
    expect(rows).toContain('Resumptions 4 (approximate)')
    expect(rows).toContain('[buttons]')
    await ui.unmount()
  }
})

test('an incomplete figure says incomplete next to the total', async ($, on) => {
  stubs(on, { answer: () => printed({ ...REPORT, complete: false }) })
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  expect(await paneRows(ui)).toContain('Total US$ 30.50 incomplete')
  await ui.unmount()
})

test('nothing recorded says so, with no total of zero', async ($, on) => {
  stubs(on, { answer: () => printed(NOT_RECORDED) })
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  const rows = await paneRows(ui)
  expect(rows).toContain('No spend recorded yet')
  expect(rows.join('\n')).not.toMatch(/US\$/)
  await ui.unmount()
})

const FAILURES: Array<[string, Answer, RegExp]> = [
  ['exits 1 with an error line', { exitCode: 1, stdout: '{"error":"bad session id"}\n' }, /^ {2}Spend unavailable: bad session id$/],
  ['is refused after its timeout', { deny: '$.process.run(node) aborted: still running after 120000ms' }, /^ {2}Spend unavailable: aether-report did not answer in 120 s$/],
  ['prints text that is not JSON', { exitCode: 0, stdout: 'spend\n' }, /^ {2}Spend unavailable: aether-report printed no JSON$/],
]
for (const [what, answered, pattern] of FAILURES) {
  test(`a bin that ${what} is one line in the pane, with no model`, async ($, on) => {
    const { calls } = stubs(on, { answer: () => answered })
    await $.command.run({ command: 'spend' })
    await settled()
    const ui = await mount($, 'terminal')
    const rows = await paneRows(ui)
    expect(rows.some((row) => pattern.test(row))).toBe(true)
    expect(calls).toEqual({ model: 0, prompt: 0 })
    await ui.unmount()
  })
}

test('Close closes the pane', async ($, on) => {
  const { closed } = stubs(on)
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'close' })
  expect(closed.map((close) => close.id)).toEqual([PANE_ID])
})

test('text from the report that holds a control character does not take the pane away', async ($, on) => {
  stubs(on, { answer: () => printed({ ...REPORT, byModel: { 'bad\u001b[31mmodel': { usd: 1, requests: 1 } } }) })
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  const rows = await paneRows(ui)
  // Joined on '' : the newline between rows is U+000A, which this class rejects, and it is not part of a row.
  expect(rows.join('')).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
  expect(rows.some((row) => row.includes('badmodel') || row.includes('bad[31mmodel'))).toBe(true)
  await ui.unmount()
})

test('a plain session has no /spend: nothing is declared, opened, run or drawn', async ($, on) => {
  const { runs, registered, opened } = stubs(on, { marked: () => false })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the engine drew its own</Text>
  })
  await startSession($)
  await $.classic.SessionStart({ source: 'startup' })
  expect(registered.filter((spec) => spec.name === 'spend')).toEqual([])
  const result = await $.command.run({ command: 'spend' })
  expect(result.text).toBe('the engine ran its own command')
  expect(opened).toEqual([])
  expect(runs).toEqual([])
  const ui = await mount($, 'terminal')
  expect(await ui.find({ type: 'Text', text: 'the engine drew its own' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /session spend/ })).toBeUndefined()
  await ui.unmount()
  expect(runs).toEqual([])
})

test('a new /spend discards the late answer of the previous one', async ($, on) => {
  const first = gate()
  let count = 0
  stubs(on, {
    answer: async () => {
      count++
      if (count === 1) {
        await first.wait
        return printed({ ...REPORT, usd: 999.99 })
      }
      return printed(REPORT)
    },
  })
  await $.command.run({ command: 'spend' })
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal')
  let rows = await paneRows(ui)
  expect(rows).toContain('Total US$ 30.50')
  first.open()
  await settled()
  rows = await paneRows(ui)
  expect(rows).toContain('Total US$ 30.50')
  expect(rows.join('\n')).not.toContain('999.99')
  await ui.unmount()
})

test('a toast is shown when the pane is not placed', async ($, on) => {
  const { toasts } = stubs(on, { placed: false, reason: 'terminal too small' })
  await $.command.run({ command: 'spend' })
  expect(toasts).toEqual(['spend: terminal too small'])
})

test('aether-report is run with timeoutMs 120000', async ($, on) => {
  const { runs } = stubs(on)
  await $.command.run({ command: 'spend' })
  await settled()
  expect(runs.length).toBe(1)
  expect(runs[0]?.init.timeoutMs).toBe(120000)
})

test('a plain session draws no button on any surface', async ($, on) => {
  const { runs } = stubs(on, { marked: () => false })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the engine drew its own</Text>
  })
  await startSession($)
  await $.classic.SessionStart({ source: 'startup' })
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'the engine drew its own' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /session spend/ })).toBeUndefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  }
  expect(runs).toEqual([])
})

test('a long figure shows how many rows follow in a small pane and keeps Close near the top', async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'spend' })
  await settled()
  const ui = await mount($, 'terminal', pane(76, 10))
  const rows = await paneRows(ui)
  const marker = rows.findIndex((line) => /^… \d+ more rows \(↓ scrolls\)$/.test(line))
  expect(marker).toBe(9)
  expect(Number(/\d+/.exec(rows[marker])?.[0])).toBe(rows.length - marker - 1)
  expect(rows.indexOf('[buttons]')).toBe(2)
  await ui.unmount()
})
