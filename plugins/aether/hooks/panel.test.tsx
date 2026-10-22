import { expect, mock, test } from 'claude-code/testing'
import { cells } from './panel-view.mjs'

// Tests for the /harnesses panel (panel.jsx, with panel-view.mjs and panel-layout.mjs). Run them with
// `claude plugin test plugins/aether`. The pure parts are also tested with node, in tests/panel-view.test.js and
// tests/panel-layout.test.js, and the options against the libs in tests/panel-conformance.test.js.

// What the bins printed on a machine with the harnesses, as captured: `aether-lane quota --json <name>` for each
// name (tests/fixtures/panel/quota-<name>.json), the same for missing CLIs (quota-missing.json), and
// `aether-report --delegates` over the router log of a run with Jev and agy (delegates.json).
const REAL = {
  agy: {"time":"2026-10-17T02:14:36.782Z","reserve":0.05,"harnesses":{"agy":{"command":"agy","path":"/home/darkarty/.local/bin/agy","installed":true,"version":"1.4.0","groups":{"gemini":{"label":"Gemini Models","unknown":false,"usable":false,"priority":0.005952,"remaining":1,"resetsAt":"2026-10-24T02:14:35.000Z","usedPercentAbsent":false,"mark":{"harness":"agy","group":"gemini","at":1792131450120,"until":1792712790120,"confirmed":false,"resetsAt":null,"usedPercentAbsent":false},"windows":{"weekly":{"remaining":1,"resetsAt":"2026-10-24T02:14:35.000Z","hoursLeft":168,"priority":0.005952,"resetsLocal":"2026-10-23 20:14 UTC-6"},"5h":{"remaining":1,"resetsAt":"2026-10-17T07:14:35.000Z","hoursLeft":5,"priority":0.199954,"resetsLocal":"2026-10-17 01:14 UTC-6"}},"source":{"command":"agy","ts":"2026-10-17T02:14:30.852Z","ageMinutes":0,"stale":false}},"claude":{"label":"Claude and GPT models","unknown":false,"usable":true,"priority":0.002248,"remaining":0.3292155861854553,"resetsAt":"2026-10-23T04:41:07.000Z","usedPercentAbsent":false,"mark":null,"windows":{"weekly":{"remaining":0.3292155861854553,"resetsAt":"2026-10-23T04:41:07.000Z","hoursLeft":146.4,"priority":0.002248,"resetsLocal":"2026-10-22 22:41 UTC-6"},"5h":{"remaining":1,"resetsAt":"2026-10-17T07:14:35.000Z","hoursLeft":5,"priority":0.199954,"resetsLocal":"2026-10-17 01:14 UTC-6"}},"source":{"command":"agy","ts":"2026-10-17T02:14:30.852Z","ageMinutes":0,"stale":false}}}}}},
  codex: {"time":"2026-10-17T02:14:36.952Z","reserve":0.05,"harnesses":{"codex":{"command":"codex","path":"/home/darkarty/.local/bin/codex","installed":true,"version":"codex-cli 0.162.1","groups":{"codex":{"label":"Codex plan","unknown":true,"usable":true,"priority":null,"remaining":null,"resetsAt":null,"usedPercentAbsent":false,"mark":null,"windows":{},"source":null}}}}},
  grok: {"time":"2026-10-17T02:14:37.078Z","reserve":0.05,"harnesses":{"grok":{"command":"grok","path":"/home/darkarty/.local/bin/grok","installed":true,"version":"grok 1.0.60 (01a8e1c591c0) [stable]","groups":{"grok":{"label":"Grok plan","unknown":false,"usable":true,"priority":0.137599,"remaining":0.95,"resetsAt":"2026-10-17T09:08:51.805Z","usedPercentAbsent":false,"mark":null,"windows":{"weekly":{"remaining":0.95,"resetsAt":"2026-10-17T09:08:51.805Z","hoursLeft":6.9,"priority":0.137599,"resetsLocal":"2026-10-17 03:08 UTC-6"}},"source":{"log":"/home/darkarty/.grok/logs/unified.jsonl","ts":"2026-10-17T02:05:00.006Z","pid":2487262,"version":"1.0.60","ageMinutes":9,"stale":false,"usedPercent":5,"usedPercentAbsent":false}}}}}},
  cursor: {"time":"2026-10-17T02:14:37.854Z","reserve":0.05,"harnesses":{"cursor":{"command":"cursor-agent","path":"/home/darkarty/.local/bin/cursor-agent","installed":true,"version":"2026.09.28-64d2043","groups":{"cursor":{"label":"Cursor plan","unknown":true,"usable":true,"priority":null,"remaining":null,"resetsAt":null,"usedPercentAbsent":false,"mark":null,"windows":{},"source":null}}}}},
  muse: {"time":"2026-10-19T20:00:00.000Z","reserve":0.05,"harnesses":{"muse":{"command":"muse","path":"/home/darkarty/.local/bin/muse","installed":true,"version":"1.4.11","groups":{"muse":{"label":"Muse subscription","unknown":false,"usable":true,"priority":0.002,"remaining":0.28,"resetsAt":"2026-10-19T23:00:00.000Z","usedPercentAbsent":false,"mark":null,"windows":{"5h":{"remaining":0.28,"resetsAt":"2026-10-19T23:00:00.000Z","hoursLeft":3,"priority":0.002,"resetsLocal":"2026-10-19 17:00 UTC-6"},"weekly":{"remaining":0.6,"resetsAt":"2026-10-24T20:00:00.000Z","hoursLeft":120,"priority":0.002,"resetsLocal":"2026-10-24 14:00 UTC-6"}},"source":{"command":"muse exec --json","ts":"2026-10-19T19:56:00.000Z","ageMinutes":4,"stale":false}}}}}},
}
const MISSING = {"time":"2026-10-17T02:14:37.940Z","reserve":0.05,"harnesses":{"agy":{"command":"agy","path":null,"installed":false,"version":null,"groups":{}},"grok":{"command":"grok","path":null,"installed":false,"version":null,"groups":{}},"codex":{"command":"codex","path":null,"installed":false,"version":null,"groups":{}},"cursor":{"command":"cursor-agent","path":null,"installed":false,"version":null,"groups":{}},"muse":{"command":"muse","path":null,"installed":false,"version":null,"groups":{}}}}
const DELEGATES = {"delegations":[{"id":"r-mvb76f11-601c","time":1792169047189,"session":"735cdd24-3d94-4e7a-a057-38bbe366d36b","description":"formatMoney 1234 cents","mode":"command","decider":"haiku","requested":null,"override":null,"decision":{"harness":"claude","model":"claude-haiku-5-5","alias":"haiku","effort":"low","level":"A","axis":"general","reason":"shape lookup (0.85); stakes 0; base A","confidence":0.85,"status":"measured","readOnly":true},"reason":"shape lookup (0.85); stakes 0; base A","confidence":0.85,"applied":"rewritten","fallback":null,"ranOn":{"harness":"claude","model":"claude-haiku-5-5","effort":"low"},"agentId":"af6345dee0e062a9b","costUsd":0.003301475,"quotaSpent":null,"durationMs":null},{"id":"r-mvb76fl2-0049","time":1792169047910,"session":"735cdd24-3d94-4e7a-a057-38bbe366d36b","description":"slug with spaces","mode":"command","decider":"haiku","requested":null,"override":null,"decision":{"harness":"claude","model":"claude-haiku-5-5","alias":"haiku","effort":"high","level":"B","axis":"general","reason":"shape explore (0.6); stakes 0; base B","confidence":0.6,"status":"measured","readOnly":true},"reason":"shape explore (0.6); stakes 0; base B","confidence":0.6,"applied":"rewritten","fallback":null,"ranOn":{"harness":"claude","model":"claude-haiku-5-5","effort":"high"},"agentId":"a24e2741c60ac9ac8","costUsd":0.0033644649999999996,"quotaSpent":null,"durationMs":null},{"id":"r-mvb76g64-34f8","time":1792169048668,"session":"735cdd24-3d94-4e7a-a057-38bbe366d36b","description":"clamp below lo","mode":"command","decider":"haiku","requested":null,"override":null,"decision":{"harness":"claude","model":"claude-haiku-5-5","alias":"haiku","effort":"high","level":"B","axis":"general","reason":"shape explore (0.6); stakes 0; base B","confidence":0.6,"status":"measured","readOnly":true},"reason":"shape explore (0.6); stakes 0; base B","confidence":0.6,"applied":"rewritten","fallback":null,"ranOn":{"harness":"claude","model":"claude-haiku-5-5","effort":"high"},"agentId":"a8b9f4ffbd7ee6c38","costUsd":0.00255804,"quotaSpent":null,"durationMs":null},{"id":"r-mvb76gro-f4d9","time":1792169049445,"session":"735cdd24-3d94-4e7a-a057-38bbe366d36b","description":"api get return","mode":"command","decider":"haiku","requested":null,"override":null,"decision":{"harness":"claude","model":"claude-haiku-5-5","alias":"haiku","effort":"high","level":"B","axis":"general","reason":"shape explore (0.5); stakes 0; base B","confidence":0.5,"status":"measured","readOnly":true},"reason":"shape explore (0.5); stakes 0; base B","confidence":0.5,"applied":"rewritten","fallback":null,"ranOn":{"harness":"claude","model":"claude-haiku-5-5","effort":"high"},"agentId":"a70b4aca2247fbaa8","costUsd":0.002527795,"quotaSpent":null,"durationMs":null},{"id":"r-mvb76hbv-6c82","time":1792169050172,"session":"735cdd24-3d94-4e7a-a057-38bbe366d36b","description":"package name and version","mode":"command","decider":"haiku","requested":null,"override":null,"decision":{"harness":"agy","model":"gemini-3.8-flash","alias":null,"effort":"low","level":"A","axis":"general","reason":"shape lookup (0.95); stakes 0; base A","confidence":0.9,"status":"measured","readOnly":true},"reason":"shape lookup (0.95); stakes 0; base A","confidence":0.9,"applied":"external","fallback":null,"ranOn":{"harness":"agy","model":"gemini-3.8-flash-low","effort":"low"},"agentId":"a1347e69828191210","costUsd":null,"quotaSpent":[{"window":"weekly","fraction":0.0069},{"window":"5h","fraction":0.0059}],"durationMs":13004},{"id":"r-mvb76izp-f90f","time":1792169052325,"session":"735cdd24-3d94-4e7a-a057-38bbe366d36b","description":"list files under src","mode":"command","decider":"haiku","requested":null,"override":null,"decision":{"harness":"agy","model":"gemini-3.8-flash","alias":null,"effort":"low","level":"A","axis":"general","reason":"shape lookup (0.8); stakes 0; base A","confidence":0.8,"status":"measured","readOnly":true},"reason":"shape lookup (0.8); stakes 0; base A","confidence":0.8,"applied":"external","fallback":null,"ranOn":{"harness":"agy","model":"gemini-3.8-flash-low","effort":"low"},"agentId":"abf679147e85ce684","costUsd":null,"quotaSpent":[{"window":"weekly","fraction":0.007},{"window":"5h","fraction":0.0062}],"durationMs":19278},{"id":"r-mvb76hx6-920f","time":1792169050938,"session":"735cdd24-3d94-4e7a-a057-38bbe366d36b","description":"count util tests","mode":"command","decider":"haiku","requested":null,"override":null,"decision":{"harness":"agy","model":"gemini-3.8-flash","alias":null,"effort":"low","level":"A","axis":"general","reason":"shape lookup (0.85); stakes 0; base A","confidence":0.85,"status":"measured","readOnly":true},"reason":"shape lookup (0.85); stakes 0; base A","confidence":0.85,"applied":"external","fallback":null,"ranOn":{"harness":"agy","model":"gemini-3.8-flash-low","effort":"low"},"agentId":"a947c9f167c3c8b4a","costUsd":null,"quotaSpent":[{"window":"weekly","fraction":0.0076},{"window":"5h","fraction":0.012}],"durationMs":14720},{"id":"r-mvb76ihm-5148","time":1792169051674,"session":"735cdd24-3d94-4e7a-a057-38bbe366d36b","description":"README first line","mode":"command","decider":"haiku","requested":null,"override":null,"decision":{"harness":"agy","model":"gemini-3.8-flash","alias":null,"effort":"low","level":"A","axis":"general","reason":"shape lookup (0.9); stakes 0; base A","confidence":0.9,"status":"measured","readOnly":true},"reason":"shape lookup (0.9); stakes 0; base A","confidence":0.9,"applied":"external","fallback":null,"ranOn":{"harness":"agy","model":"gemini-3.8-flash-low","effort":"low"},"agentId":"a898a7fa5b1fe6ca6","costUsd":null,"quotaSpent":[{"window":"weekly","fraction":0.007},{"window":"5h","fraction":0.0062}],"durationMs":14347}],"totals":{"delegations":8,"decided":8,"overridden":0,"fallback":0,"inherited":0,"recorded":0,"costUsd":0.011751774999999999}}

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const PANE_ID = 'harnesses'
const MIN = 60000
// A little after the newest of the delegations in the fixture.
const NOW = 1792169230000
const WEEK = 7 * 24 * 60 * 60 * 1000
// How long each read may run, written out here so that a change of the numbers in the mod fails a test.
const TIMEOUTS = { agy: 75000, grok: 45000, codex: 20000, cursor: 20000, muse: 20000 }
const NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse'] as const
const ESC = String.fromCharCode(0x1b)
const UNSAFE = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}-${String.fromCharCode(0x9f)}${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200f)}${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}${String.fromCharCode(0x202a)}-${String.fromCharCode(0x202e)}${String.fromCharCode(0x2060)}-${String.fromCharCode(0x2064)}${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}${String.fromCharCode(0xfeff)}]`)

type Props = { title: string; isFocused: boolean; bodyColumns: number; placement: 'inline'; scroll: { offset: number; bodyRows: number }; view: object }
const pane = (bodyColumns = 76, bodyRows = 60, isFocused = true): Props => ({ title: 'Harnesses', isFocused, bodyColumns, placement: 'inline', scroll: { offset: 0, bodyRows }, view: {} })

const clone = (value) => JSON.parse(JSON.stringify(value))
// What `aether-lane quota --json <name>` printed for one harness.
const real = (name: string) => clone(REAL[name])
const printed = (value: unknown, extra: Record<string, unknown> = {}) => ({ exitCode: 0, stdout: `${JSON.stringify(value)}\n`, ...extra })
type Answer = { exitCode: number; stdout: string; stderr?: string; isStdoutTruncated?: boolean } | { deny: string }
type Run = { argv: string[]; init: Record<string, any>; bin: string; args: string[]; name: string | undefined }

// Answers what the mod asks Claude Code for. `marked` is whether the session carries the Aether marker (a function, to
// write it later); `answer` is what each bin prints, and may wait on a gate. It keeps what the mod did.
function stubs(on, { marked = (() => true) as () => boolean, answer = (run: Run): Answer | Promise<Answer> => (run.bin === 'aether-lane' ? printed(real(run.name as string)) : printed(DELEGATES)) } = {}) {
  const runs: Run[] = []
  const registered: Array<Record<string, any>> = []
  const opened: Array<Record<string, unknown>> = []
  const closed: Array<Record<string, unknown>> = []
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
  on('ui.open', ($, e) => {
    opened.push(e as Record<string, unknown>)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    closed.push(e as Record<string, unknown>)
    return { value: undefined }
  })
  on('process.run', async ($, e) => {
    const args = e.argv.slice(2)
    const run: Run = { argv: [...e.argv], init: { ...(e.init || {}) }, bin: String(e.argv[1]).split('/').pop() as string, args, name: args.find((a) => (NAMES as readonly string[]).includes(a)) }
    runs.push(run)
    const done = await answer(run)
    if ('deny' in done) return { deny: done.deny }
    return { value: { stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...done } }
  })
  return { runs, registered, opened, closed }
}

const lane = (runs: Run[]) => runs.filter((run) => run.bin === 'aether-lane')
const refreshes = (runs: Run[]) => lane(runs).filter((run) => run.args.includes('--refresh'))

// A promise the test opens when it wants a bin to answer.
function gate() {
  let open: () => void = () => {}
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { wait, open }
}

// Lets what the mod left running settle: its reads, one after another.
async function settled() {
  for (let i = 0; i < 400; i++) await Promise.resolve()
}

const startSession = ($) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
const mount = ($, surface, props = pane()) => $.ui.mount({ plugin: 'aether', surface, component: 'Pane', props, requestId: PANE_ID })

// The text of a node and of the nodes in it.
const textOf = (node): string => (typeof node === 'string' ? node : (node.children || []).map(textOf).join(''))
// The text of each row of the pane, from its drawn tree: a row is a Text, and its parts are the Texts inside it. The row of the buttons is a Box.
function rows(tree): string[] {
  return (tree.children || []).map((child) => (typeof child !== 'string' && child.type === 'Box' ? '[buttons]' : textOf(child)))
}
async function paneRows(ui): Promise<string[]> {
  return rows(await ui.drawn())
}
// Every string anywhere in the tree.
function strings(node, found: string[] = []): string[] {
  if (typeof node === 'string') found.push(node)
  else for (const child of node.children || []) strings(child, found)
  return found
}
const cellsOf = (text: string) => cells(text)
const has = (lines: string[], pattern: RegExp) => lines.some((line) => pattern.test(line))

// Sections that are not loading, renewing or not read: nothing in the pane says it is still at work.
const SETTLED = [/Reading quota…/, /Renewing…/, /^Reading…$/, /Not read yet/]
const expectSettled = (lines: string[]) => {
  for (const pattern of SETTLED) expect(has(lines, pattern)).toBe(false)
}

const LANES_ON = { options: { superdelegation: true, harnesses: 'agy,grok' } }

test('the pane draws every section on every surface, with the buttons under the options and above the quota', LANES_ON, async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'harnesses' })
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'Aether · other harnesses' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'superdelegation ON' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Gemini Models/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /dry until Oct \d+ \d\d:\d\d UTC/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Recent delegates' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /list files under src/ })).toBeDefined()
    const renew = await ui.find({ type: 'Button', key: 'renew' })
    const close = await ui.find({ type: 'Button', key: 'close' })
    expect([renew?.props.label, renew?.props.hotkey]).toEqual(['Renew readings', 'r'])
    expect([close?.props.label, close?.props.hotkey]).toEqual(['Close', 'x'])
    const lines = await paneRows(ui)
    expect(lines[0]).toBe('Aether · other harnesses')
    expect(lines[1]).toMatch(/^superdelegation ON · router command/)
    expect(lines.indexOf('[buttons]')).toBeGreaterThan(1)
    expect(lines.indexOf('[buttons]')).toBeLessThan(lines.findIndex((line) => /^agy 1\.4\.0/.test(line)))
    await ui.unmount()
  }
})

test('the key hint is shown only while the pane has the keyboard', LANES_ON, async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'harnesses' })
  const focused = await mount($, 'terminal', pane(76, 60, true))
  expect((await paneRows(focused)).at(-1)).toBe('r renews · x closes · Esc leaves')
  const idle = await mount($, 'desktop', pane(76, 60, false))
  expect(has(await paneRows(idle), /Esc leaves/)).toBe(false)
})

test('the options shown are the ones the session uses, not the ones typed', { options: { superdelegation: true, router: 'command', decider: 'jev', harnesses: ' Gork, AGY ,grok,agy' } }, async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'harnesses' })
  const ui = await mount($, 'terminal', pane(120))
  expect((await paneRows(ui))[1]).toBe('superdelegation ON · router command · decider jev · harnesses agy, grok')
})

test('with superdelegation off the pane says that nothing leaves Claude', async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'harnesses' })
  const lines = await paneRows(await mount($, 'terminal'))
  expect(lines[1]).toMatch(/^superdelegation OFF · router record/)
  expect(has(lines, /Superdelegation is OFF: nothing leaves Claude/)).toBe(true)
  expect(has(lines, /Gemini Models/)).toBe(true)
})

test('the tone of a part reaches the style of its Text, as a theme key', LANES_ON, async ($, on) => {
  const low = (name: string) => {
    const doc = real(name)
    const group = Object.values(doc.harnesses[name].groups)[0] as any
    for (const w of Object.values(group.windows) as any[]) w.remaining = 0.01
    group.source = { ageMinutes: 517, stale: true }
    return doc
  }
  stubs(on, { answer: (run) => (run.bin === 'aether-lane' ? printed(run.name === 'grok' ? low('grok') : real(run.name as string)) : printed(DELEGATES)) })
  await $.command.run({ command: 'harnesses' })
  await settled()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mount($, surface)
    // A row is a Text with a Text for each part; the style is the part's.
    const style = async (query) => (await ui.findAll({ type: 'Text', ...query })).find((found) => found.props.wrap === undefined)?.props
    expect((await style({ text: 'Aether · other harnesses' }))?.bold).toBe(true)
    expect((await style({ text: 'superdelegation ON' }))?.color).toBe('success')
    expect((await style({ text: 'usable' }))?.color).toBe('success')
    expect((await style({ text: /dry until/ }))?.color).toBe('warning')
    expect((await style({ text: /resets in 168 h/ }))?.dimColor).toBe(true)
    expect((await style({ text: /^█{30}$/ }))?.color).toBe('success')
    expect((await style({ text: /^█░{29}$/ }))?.color).toBe('error')
    expect((await style({ text: ' 1%' }))?.color).toBe('error')
    expect((await style({ text: /· stale/ }))?.color).toBe('warning')
    expect((await style({ text: 'Recent delegates' }))?.bold).toBe(true)
    await ui.unmount()
  }
})

test('a control character in any text of the pane does not take the pane away', LANES_ON, async ($, on) => {
  const dirty = (text: string) => `${ESC}[31m${text}${String.fromCharCode(7, 0x7f, 0x9b, 0x202e, 0x200b)}${String.fromCharCode(0)}`
  const delegates = clone(DELEGATES)
  for (const d of delegates.delegations) {
    d.description = dirty(`paint ${d.description}`)
    d.fallback = dirty('decider: timeout')
    d.ranOn = { harness: dirty('agy'), model: dirty('gemini-3.8-flash'), effort: dirty('low') }
  }
  stubs(on, {
    answer: (run) => {
      if (run.bin !== 'aether-lane') return printed(delegates)
      const doc = real(run.name as string)
      const h = doc.harnesses[run.name as string]
      h.version = dirty(h.version)
      h.error = dirty('boom')
      for (const [key, group] of Object.entries(h.groups) as Array<[string, any]>) {
        group.label = dirty(group.label)
        for (const [wname, w] of Object.entries(group.windows) as Array<[string, any]>) {
          delete group.windows[wname]
          group.windows[dirty(wname)] = w
        }
        h.groups[dirty(key)] = group
        delete h.groups[key]
      }
      return printed(doc)
    },
  })
  await $.command.run({ command: 'harnesses' })
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'Aether · other harnesses' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'renew' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'close' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Gemini Models/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\[31mpa/ })).toBeDefined()
    for (const text of strings(await ui.drawn())) expect(UNSAFE.test(text)).toBe(false)
    await ui.unmount()
  }
})

test('every harness is read on its own, with its own timeout, and the delegates only as far back as a week', LANES_ON, async ($, on) => {
  const { runs } = stubs(on)
  await $.command.run({ command: 'harnesses' })
  await settled()
  const argv = (run: Run) => [run.argv[0], run.argv[1].split('/').slice(-2).join('/')]
  expect(runs.every((run) => run.argv[0] === 'node')).toBe(true)
  expect(runs.map((run) => argv(run)[1]).sort()).toEqual(['bin/aether-lane', 'bin/aether-lane', 'bin/aether-lane', 'bin/aether-lane', 'bin/aether-lane', 'bin/aether-report'])
  const lanes = lane(runs)
  expect(lanes.map((run) => run.args).sort()).toEqual([['quota', '--json', 'agy'], ['quota', '--json', 'codex'], ['quota', '--json', 'cursor'], ['quota', '--json', 'grok'], ['quota', '--json', 'muse']])
  for (const run of lanes) expect(run.init.timeoutMs).toBe(TIMEOUTS[run.name as string])
  const report = runs.find((run) => run.bin === 'aether-report') as Run
  expect(report.args).toEqual(['--delegates', '--since', String(NOW - WEEK)])
  expect(report.init.timeoutMs).toBe(15000)
})

test('Renew readings reads every harness again with --refresh, with the same timeouts', LANES_ON, async ($, on) => {
  const { runs } = stubs(on)
  await $.command.run({ command: 'harnesses' })
  await settled()
  const before = runs.length
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'renew' })
  await settled()
  const more = runs.slice(before)
  expect(lane(more).map((run) => run.args).sort()).toEqual([['quota', '--json', 'agy', '--refresh'], ['quota', '--json', 'codex', '--refresh'], ['quota', '--json', 'cursor', '--refresh'], ['quota', '--json', 'grok', '--refresh'], ['quota', '--json', 'muse', '--refresh']])
  for (const run of lane(more)) expect(run.init.timeoutMs).toBe(TIMEOUTS[run.name as string])
  expect(more.find((run) => run.bin === 'aether-report')?.args).toEqual(['--delegates', '--since', String(NOW - WEEK)])
  expectSettled(await paneRows(ui))
})

test('the pane opens at once and each harness fills in when its own read returns', LANES_ON, async ($, on) => {
  const held = { agy: gate(), grok: gate() }
  const { opened } = stubs(on, { answer: async (run) => (run.bin === 'aether-lane' ? (held[run.name as string] && (await held[run.name as string].wait), printed(real(run.name as string))) : printed(DELEGATES)) })
  await $.command.run({ command: 'harnesses' })
  await settled()
  expect(opened.length).toBe(1)
  const ui = await mount($, 'terminal')
  let lines = await paneRows(ui)
  expect(lines).toContain('agy  Reading quota…')
  expect(lines).toContain('grok  Reading quota…')
  expect(has(lines, /^codex 0\.162\.1/) || has(lines, /Not enabled, no quota reading: codex, cursor/)).toBe(true)
  expect(has(lines, /Task|list files under src/)).toBe(true)
  held.grok.open()
  await settled()
  lines = await paneRows(ui)
  expect(lines).toContain('agy  Reading quota…')
  expect(has(lines, /Grok plan/)).toBe(true)
  held.agy.open()
  await settled()
  lines = await paneRows(ui)
  expect(has(lines, /Gemini Models/)).toBe(true)
  expectSettled(lines)
})

test('one harness that fails, or is slow, takes only its own section with it', LANES_ON, async ($, on) => {
  stubs(on, { answer: (run) => (run.bin === 'aether-report' ? printed(DELEGATES) : run.name === 'agy' ? { exitCode: 1, stdout: '{"error":"agy exploded"}\n' } : printed(real(run.name as string))) })
  await $.command.run({ command: 'harnesses' })
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const lines = await paneRows(ui)
    expect(lines).toContain('agy')
    expect(lines).toContain('  Quota unavailable: agy exploded')
    expect(has(lines, /Grok plan/)).toBe(true)
    expect(has(lines, /list files under src/)).toBe(true)
    expectSettled(lines)
    await ui.unmount()
  }
})

test('an enabled harness that is not installed says so, and the ones that are not enabled are named', LANES_ON, async ($, on) => {
  stubs(on, { answer: (run) => (run.bin === 'aether-lane' ? printed({ ...MISSING, harnesses: { [run.name as string]: MISSING.harnesses[run.name as string] } }) : printed(DELEGATES)) })
  await $.command.run({ command: 'harnesses' })
  for (const surface of SURFACES) {
    const lines = await paneRows(await mount($, surface))
    expect(lines).toContain('agy  enabled, not installed')
    expect(lines).toContain('grok  enabled, not installed')
    expect(lines).toContain('Not installed: codex, cursor, muse')
  }
})

test('/harnesses opens the pane, focused and closing on Escape, prints nothing and calls no model', async ($, on) => {
  const { opened } = stubs(on)
  let modelCalls = 0
  on('model.complete', () => {
    modelCalls++
    return { value: { isAnswered: false, reason: 'none' } }
  })
  const result = await $.command.run({ command: 'harnesses' })
  expect(result.text).toBeUndefined()
  expect(opened.length).toBe(1)
  expect(opened[0]?.id).toBe(PANE_ID)
  expect(opened[0]?.focus).toBe(true)
  expect(opened[0]?.closeOnEscape).toBe(true)
  expect(modelCalls).toBe(0)
})

test('Renew readings says Renewing… on the sections while it runs, and draws the new readings', LANES_ON, async ($, on) => {
  // Each surface renews from the old readings again, so each gets a gate of its own.
  let held = gate()
  const { runs } = stubs(on, {
    answer: async (run) => {
      if (run.bin !== 'aether-lane') return printed(DELEGATES)
      const doc = real(run.name as string)
      if (run.args.includes('--refresh')) {
        await held.wait
        const group = Object.values(doc.harnesses[run.name as string].groups)[0] as any
        if (group) group.label = `${group.label} renewed`
      }
      return printed(doc)
    },
  })
  for (const surface of SURFACES) {
    held = gate()
    await $.command.run({ command: 'harnesses' })
    await settled()
    const ui = await mount($, surface)
    expect(has(await paneRows(ui), /renewed/)).toBe(false)
    const before = refreshes(runs).length
    const pressed = ui.press({ key: 'renew' })
    await settled()
    const lines = await paneRows(ui)
    expect(lines).toContain('agy 1.4.0  Renewing…')
    expect(has(lines, /Gemini Models/)).toBe(true)
    expect(refreshes(runs).length - before).toBe(5)
    held.open()
    await pressed
    await settled()
    const after = await paneRows(ui)
    expect(has(after, /Grok plan renewed/)).toBe(true)
    expectSettled(after)
    await ui.unmount()
  }
})

test('Close closes the pane', async ($, on) => {
  const { closed } = stubs(on)
  await $.command.run({ command: 'harnesses' })
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'close' })
  expect(closed.map((close) => close.id)).toEqual([PANE_ID])
})

const FAILURES: Array<[string, Answer, RegExp]> = [
  ['exits 1 with an error line', { exitCode: 1, stdout: '{"error":"no lane table"}\n' }, /^ {2}Quota unavailable: no lane table$/],
  ['is refused after its timeout', { deny: '$.process.run(node) aborted: still running after 75000ms' }, /^ {2}Quota unavailable: aether-lane did not answer in (75|45|20) s$/],
  ['prints text that is not JSON', { exitCode: 0, stdout: 'Lane quota at 2026-10-17\n' }, /^ {2}Quota unavailable: aether-lane quota printed no JSON$/],
  ['is cut at 4 MiB', { exitCode: 0, stdout: '{"harnesses":{', isStdoutTruncated: true }, /^ {2}Quota unavailable: aether-lane quota printed over 4 MiB, too long to read$/],
]
for (const [what, answered, pattern] of FAILURES) {
  test(`a bin that ${what} is one line in the pane, never a throw`, async ($, on) => {
    stubs(on, { answer: (run) => (run.bin === 'aether-lane' ? answered : { deny: '$.process.run(node) aborted: still running after 15000ms' }) })
    await $.command.run({ command: 'harnesses' })
    for (const surface of SURFACES) {
      const ui = await mount($, surface)
      const lines = await paneRows(ui)
      expect(has(lines, pattern)).toBe(true)
      expect(lines).toContain('Delegates unavailable: aether-report did not answer in 15 s')
      expect((await ui.find({ type: 'Button', key: 'renew' }))?.props.label).toBe('Renew readings')
      await ui.unmount()
    }
  })
}

test('a report cut at 4 MiB is a readable line, not an empty pane for ever', async ($, on) => {
  stubs(on, { answer: (run) => (run.bin === 'aether-lane' ? printed(real(run.name as string)) : { exitCode: 0, stdout: '{"delegations":[{"id":"x"', isStdoutTruncated: true }) })
  await $.command.run({ command: 'harnesses' })
  const lines = await paneRows(await mount($, 'terminal'))
  expect(lines).toContain('Delegates unavailable: aether-report printed over 4 MiB, too long to read')
  expect(has(lines, /Gemini Models|Grok plan/)).toBe(true)
})

test('a long error wraps onto up to three lines of the pane', async ($, on) => {
  const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
  stubs(on, { answer: (run) => (run.bin === 'aether-lane' ? { exitCode: 1, stdout: `${JSON.stringify({ error: words })}\n` } : { exitCode: 1, stdout: `${JSON.stringify({ error: words })}\n` }) })
  await $.command.run({ command: 'harnesses' })
  const lines = await paneRows(await mount($, 'terminal', pane(40)))
  const after = lines.slice(lines.indexOf('Recent delegates') + 1, -1)
  expect(lines.at(-1)).toBe('r renews · x closes · Esc leaves')
  expect(after.length).toBe(3)
  expect(after[0]).toMatch(/^Delegates unavailable: word0 word1/)
  expect(after[2]).toMatch(/…$/)
  for (const line of lines) expect(cellsOf(line) <= 40).toBe(true)
})

test('wide characters count in cells: no row is wider than the pane', LANES_ON, async ($, on) => {
  const delegates = clone(DELEGATES)
  const emoji = String.fromCodePoint(0x1f916)
  const texts = ['日本語のとても長い説明文がここに入りますので切り詰められます', `${emoji}${emoji} robots ${emoji}${emoji} everywhere in the world ${emoji}`, '한국어로 된 아주 긴 설명이 여기에 들어갑니다']
  delegates.delegations.forEach((d, i) => {
    d.description = texts[i % texts.length]
  })
  stubs(on, { answer: (run) => (run.bin === 'aether-lane' ? printed(real(run.name as string)) : printed(delegates)) })
  await $.command.run({ command: 'harnesses' })
  for (const columns of [40, 60, 76]) {
    for (const surface of SURFACES) {
      const ui = await mount($, surface, pane(columns, 60))
      for (const line of await paneRows(ui)) expect(cellsOf(line) <= columns).toBe(true)
      await ui.unmount()
    }
  }
})

test('whatever the room, the title, the options, the buttons and a line for each enabled group are in the rows the pane shows', LANES_ON, async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'harnesses' })
  await settled()
  for (const columns of [40, 60, 76, 120]) {
    for (const bodyRows of [10, 13, 19, 30, 46]) {
      const ui = await mount($, 'terminal', pane(columns, bodyRows))
      const lines = await paneRows(ui)
      const shown = lines.slice(0, bodyRows)
      expect(shown[0]).toBe('Aether · other harnesses')
      expect(has(shown, /^superdelegation ON/)).toBe(true)
      expect(shown).toContain('[buttons]')
      for (const label of ['Gemini Models', 'Claude and GPT models', 'Grok plan']) expect(has(shown, new RegExp(label))).toBe(true)
      for (const line of lines) expect(cellsOf(line) <= columns).toBe(true)
      if (bodyRows >= 46) expect(lines.length <= bodyRows).toBe(true)
      await ui.unmount()
    }
  }
})

test('the quota block gives way to the delegates and the buttons in a small pane, and says how many rows follow', LANES_ON, async ($, on) => {
  stubs(on)
  await $.command.run({ command: 'harnesses' })
  await settled()
  const ui = await mount($, 'terminal', pane(60, 10))
  const lines = await paneRows(ui)
  const marker = lines.findIndex((line) => /^… \d+ more rows \(↓ scrolls\)$/.test(line))
  expect(marker).toBe(9)
  expect(Number(/\d+/.exec(lines[marker])?.[0])).toBe(lines.length - marker - 1)
  const first = lines.findIndex((line) => /^agy {2}Gemini Models {2}dry until /.test(line))
  expect(first).toBeGreaterThan(3)
  expect(lines[first + 1]).toMatch(/^agy {2}Claude and GPT models {2}usable · weekly 33%/)
  expect(lines[first + 2]).toMatch(/^grok {2}Grok plan {2}usable · weekly 95%/)
  await ui.unmount()
  const roomy = await paneRows(await mount($, 'terminal', pane(76, 60)))
  expect(has(roomy, /more rows/)).toBe(false)
  expect(has(roomy, /^ {4}weekly {2}█/)).toBe(true)
})

test('reopening while the first reads are still out leaves no section stuck, and the late answers do not overwrite the new ones', LANES_ON, async ($, on) => {
  const first = gate()
  let calls = 0
  const { runs } = stubs(on, {
    answer: async (run) => {
      calls += 1
      const mine = calls <= 6
      if (mine) await first.wait
      if (run.bin !== 'aether-lane') return printed(DELEGATES)
      const doc = real(run.name as string)
      const group = Object.values(doc.harnesses[run.name as string].groups)[0] as any
      if (group) group.label = mine ? 'OLD LABEL' : group.label
      return printed(doc)
    },
  })
  await $.command.run({ command: 'harnesses' })
  await $.command.run({ command: 'harnesses' })
  await settled()
  const ui = await mount($, 'terminal')
  let lines = await paneRows(ui)
  expect(runs.length).toBe(12)
  expect(has(lines, /Gemini Models/)).toBe(true)
  expectSettled(lines)
  first.open()
  await settled()
  lines = await paneRows(ui)
  expect(has(lines, /OLD LABEL/)).toBe(false)
  expect(has(lines, /Gemini Models/)).toBe(true)
  expect(has(lines, /Grok plan/)).toBe(true)
  expectSettled(lines)
})

test('reopening while the new reads are out keeps the old readings on show, as Renewing…, and blanks nothing', LANES_ON, async ($, on) => {
  const second = gate()
  let calls = 0
  stubs(on, {
    answer: async (run) => {
      calls += 1
      if (calls > 6) await second.wait
      return run.bin === 'aether-lane' ? printed(real(run.name as string)) : printed(DELEGATES)
    },
  })
  await $.command.run({ command: 'harnesses' })
  await settled()
  await $.command.run({ command: 'harnesses' })
  await settled()
  const ui = await mount($, 'terminal')
  const lines = await paneRows(ui)
  expect(has(lines, /Gemini Models/)).toBe(true)
  expect(has(lines, /Grok plan/)).toBe(true)
  expect(has(lines, /list files under src/)).toBe(true)
  expect(lines).toContain('agy 1.4.0  Renewing…')
  expect(has(lines, /Reading quota…|^Reading…$/)).toBe(false)
  second.open()
  await settled()
  expectSettled(await paneRows(ui))
})

test('a Renew pressed while the first reads are out is not lost: one refresh of every harness runs when they return', LANES_ON, async ($, on) => {
  const first = gate()
  const { runs } = stubs(on, { answer: async (run) => (await (run.args.includes('--refresh') ? undefined : first.wait), run.bin === 'aether-lane' ? printed(real(run.name as string)) : printed(DELEGATES)) })
  await $.command.run({ command: 'harnesses' })
  await settled()
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'renew' })
  await ui.press({ key: 'renew' })
  await settled()
  expect(refreshes(runs).length).toBe(0)
  first.open()
  await settled()
  expect(refreshes(runs).map((run) => run.name).sort()).toEqual(['agy', 'codex', 'cursor', 'grok', 'muse'])
  expect(runs.filter((run) => run.bin === 'aether-report').length).toBe(2)
  expectSettled(await paneRows(ui))
})

test('a Renew pressed while a Renew runs is one more refresh after it, not many, and not none', LANES_ON, async ($, on) => {
  const held = gate()
  const { runs } = stubs(on, { answer: async (run) => (run.args.includes('--refresh') ? (await held.wait, run.bin === 'aether-lane' ? printed(real(run.name as string)) : printed(DELEGATES)) : run.bin === 'aether-lane' ? printed(real(run.name as string)) : printed(DELEGATES)) })
  await $.command.run({ command: 'harnesses' })
  await settled()
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'renew' })
  await settled()
  expect(refreshes(runs).length).toBe(5)
  await ui.press({ key: 'renew' })
  await ui.press({ key: 'renew' })
  await ui.press({ key: 'renew' })
  held.open()
  await settled()
  expect(refreshes(runs).length).toBe(10)
  expectSettled(await paneRows(ui))
})

test('a stale reading is renewed once, for that harness alone, with Renewing… on its section only', LANES_ON, async ($, on) => {
  const held = gate()
  const stale = (name: string) => {
    const doc = real(name)
    const group = Object.values(doc.harnesses[name].groups)[0] as any
    group.source = { ...group.source, ageMinutes: 517, stale: true }
    return doc
  }
  const { runs } = stubs(on, {
    answer: async (run) => {
      if (run.bin !== 'aether-lane') return printed(DELEGATES)
      if (run.name !== 'grok') return printed(real(run.name as string))
      if (run.args.includes('--refresh')) {
        await held.wait
        return printed(real('grok'))
      }
      return printed(stale('grok'))
    },
  })
  await $.command.run({ command: 'harnesses' })
  await settled()
  expect(refreshes(runs).map((run) => run.args)).toEqual([['quota', '--json', 'grok', '--refresh']])
  expect(refreshes(runs)[0].init.timeoutMs).toBe(45000)
  const ui = await mount($, 'terminal')
  const meanwhile = await paneRows(ui)
  expect(meanwhile.filter((line) => /Renewing…/.test(line))).toEqual(['grok 1.0.60  Renewing…'])
  expect(has(meanwhile, /read 9 h ago · stale/)).toBe(true)
  held.open()
  await settled()
  const after = await paneRows(ui)
  expectSettled(after)
  expect(has(after, /read 9 h ago/)).toBe(false)
  expect(refreshes(runs).length).toBe(1)
  // Once per open: the next open reads it stale again and renews it again, once.
  await $.command.run({ command: 'harnesses' })
  await settled()
  expect(refreshes(runs).length).toBe(2)
})

test('a reading that is still stale after its renewal is not renewed again', LANES_ON, async ($, on) => {
  const doc = (name: string) => {
    const d = real(name)
    const group = Object.values(d.harnesses[name].groups)[0] as any
    group.source = { ...group.source, ageMinutes: 517, stale: true }
    return d
  }
  const { runs } = stubs(on, { answer: (run) => (run.bin === 'aether-lane' ? printed(run.name === 'grok' ? doc('grok') : real(run.name as string)) : printed(DELEGATES)) })
  await $.command.run({ command: 'harnesses' })
  await settled()
  expect(refreshes(runs).length).toBe(1)
  expect(refreshes(runs).map((run) => run.name)).toEqual(['grok'])
})

test('nothing is renewed on its own when no reading is stale', LANES_ON, async ($, on) => {
  const { runs } = stubs(on)
  await $.command.run({ command: 'harnesses' })
  await settled()
  expect(refreshes(runs).length).toBe(0)
})

test('the Lead\'s SessionStart declares the command every time, as one that may run mid-turn', async ($, on) => {
  const { registered } = stubs(on)
  await $.classic.SessionStart({ source: 'startup', agent_type: 'aether:lead' })
  await $.classic.SessionStart({ source: 'clear', agent_type: 'aether:lead' })
  await $.classic.SessionStart({ source: 'compact', agent_type: 'aether:lead' })
  // /spend is declared on this same SessionStart. This test is about /harnesses.
  const harnesses = registered.filter((spec) => spec.name === 'harnesses')
  expect(harnesses.map((spec) => spec.name)).toEqual(['harnesses', 'harnesses', 'harnesses'])
  expect(harnesses.every((spec) => spec.immediate === true)).toBe(true)
  expect(String(harnesses[0]?.description)).toMatch(/quota/)
})

test('no other SessionStart declares it, and the session start event does not', async ($, on) => {
  const { registered } = stubs(on)
  await startSession($)
  await $.classic.SessionStart({ source: 'startup' })
  await $.classic.SessionStart({ source: 'startup', agent_type: 'general-purpose' })
  await $.classic.SessionStart({ source: 'resume', agent_type: 'aether:implementer' })
  expect(registered).toEqual([])
})

test('the panel is never the first to ask whether the session is Aether\'s: the marker written after the session starts still counts', async ($, on) => {
  let written = false
  const { registered, opened } = stubs(on, { marked: () => written })
  await startSession($)
  written = true
  await $.classic.SessionStart({ source: 'startup', agent_type: 'aether:lead' })
  expect(registered.filter((spec) => spec.name === 'harnesses').map((spec) => spec.name)).toEqual(['harnesses'])
  const result = await $.command.run({ command: 'harnesses' })
  expect(result.text).toBeUndefined()
  expect(opened.length).toBe(1)
})

test('a plain session has no /harnesses: nothing is declared, opened, run or drawn', async ($, on) => {
  const { runs, registered, opened } = stubs(on, { marked: () => false })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the engine drew its own</Text>
  })
  await startSession($)
  await $.classic.SessionStart({ source: 'startup' })
  expect(registered).toEqual([])
  const result = await $.command.run({ command: 'harnesses' })
  expect(result.text).toBe('the engine ran its own command')
  expect(opened).toEqual([])
  expect(runs).toEqual([])
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'the engine drew its own' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Aether/ })).toBeUndefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  }
  expect(runs).toEqual([])
})
