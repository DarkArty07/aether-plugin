import { expect, mock, test } from 'claude-code/testing'
import { crossingsOf, initialBrakeState } from './quota-brake.mjs'

// Tests for the quota brake in quota-brake.mjs + register.js. Run with `claude plugin test plugins/aether`.

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 }
const NOW = Date.parse('2026-10-21T10:00:00.000Z')
const RESET = '2026-10-21T12:00:00.000Z'
const RESUME = '2026-10-21T12:02:00.000Z'
const RUN = 'auto-20261021-095000-aaaa'
const SETTINGS = { threshold: 95, push: false, openRun: RUN, brakeOff: false, paused: null, notified: { five_hour: null, seven_day: null } }
const PAUSED = { recorded: true, paused: true, run: RUN, resetsAt: RESET, resumeAt: RESUME }

type Run = { argv: string[] }

// Answers what the brake asks Claude Code for: settings and crossings come from `aether-autonomy` by process,
// the windows from `session.usage`, and every side effect is kept.
function stubs(on, { marked = true, settings = SETTINGS as any, crossing = PAUSED as any, notifyFails = false } = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  const writes: { path: string; text: string }[] = []
  const runs: Run[] = []
  const notes: { text: string; opts: any }[] = []
  const prompts: any[] = []
  let sessionUsage: any = { rateLimits: [] }
  on('session.id', () => ({ value: 's1' }))
  on('session.version', () => ({ value: { version: '2.1.296', base: '2.1.296', builtAt: '2026-10-09T00:00:00Z' } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', ($, e) => ({ value: marked === true && e.path.endsWith('/sessions/s1.json') }))
  on('fs.write', ($, e) => { writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  on('classic.SessionStart', () => ({}))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('agent.offer', () => ({ isOffered: true }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { ...USAGE, model: e.model } }
  })
  on('process.run', ($, e) => {
    runs.push({ argv: [...e.argv] })
    const verb = e.argv[2]
    return { value: { exitCode: 0, stdout: JSON.stringify(verb === 'brake-settings' ? settings : crossing) + '\n', stderr: '' } }
  })
  on('session.usage', () => ({ value: sessionUsage }))
  on('ui.notify', ($, e) => { notes.push({ text: e.text, opts: e.opts ?? e.init ?? e }); return { value: notifyFails ? { isSent: false, reason: 'disabled' } : { isSent: true, channel: 'test' } } })
  on('prompt.submit', ($, e) => { prompts.push(e); return { value: undefined } })
  return {
    clock, writes, runs, notes, prompts,
    setLimits(rateLimits: any) { sessionUsage = { rateLimits } },
    crossingRuns: () => runs.filter((r) => r.argv[2] === 'brake-crossing'),
  }
}

async function step($, fields: Record<string, unknown> = {}) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, ...fields })
  let s = await stream.next()
  while (s.done !== true) s = await stream.next()
  return s.value
}

test('a five-hour crossing warns once, records the pause and wakes the Lead after the reset', async ($, on) => {
  const s = stubs(on)
  s.setLimits([{ kind: 'five_hour', percentUsed: 96.5, resetsAt: RESET }])
  await step($)
  expect(s.notes.map((n) => n.text)).toEqual(['La ventana de 5 horas de Claude llegó al 96.5% (umbral 95%) y se reinicia a las ' + RESET + '.'])
  expect(s.notes[0].opts).toMatchObject({ title: 'Aether: freno de cuota' })
  expect(s.crossingRuns().map((r) => r.argv)).toEqual([
    ['node', expect.stringContaining('/bin/aether-autonomy'), 'brake-crossing', '--kind', 'five_hour', '--percent', '96.5', '--resets-at', RESET, '--threshold', '95', '--notify', 'sent', '--session', 's1'],
  ])
  expect(s.prompts.map((p) => p.text)).toEqual([
    `Aether quota brake: the five_hour window is at 96.5% (threshold 95%) and resets at ${RESET}. Autonomous run ${RUN} is now paused by the quota brake until ${RESUME}. Stop every running workflow, delegate task and lane call of this run now (TaskStop, aether-lane stop), save each swarm unit with aether-wt save and record it with aether-autonomy quota-saved, and start nothing new. Do not end the run: it resumes by itself after the reset.`,
  ])
  expect(s.prompts.every((p) => p.asUser === undefined)).toBe(true)
  // The same reading, and one just under the threshold after it: no second warning, no second recording.
  await step($)
  s.setLimits([{ kind: 'five_hour', percentUsed: 94.9, resetsAt: RESET }])
  await step($)
  expect(s.notes).toHaveLength(1)
  expect(s.crossingRuns()).toHaveLength(1)
  // The resume hour comes: the plugin's own message, once.
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts.map((p) => p.text)).toContain(
    `Aether quota brake: the five_hour window has reset and autonomous run ${RUN} was paused until ${RESUME}. Read the run's diary, run aether-autonomy status, and when its stop is no longer quota, relaunch the same swarm run from the saved branches (aether-plan compile --run with the same id, as the diary's Estado says) and continue the run.`,
  )
})

test('crossingsOf crosses exactly at the threshold, ignores spend_limit and a missing reading, and crosses again after a dip', async () => {
  let state = initialBrakeState(null)
  assertBounds(state)
  let out = crossingsOf([], 95, state)
  expect(out.crossings).toEqual([])
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 94.9, resetsAt: RESET }], 95, state)
  expect(out.crossings).toEqual([])
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 95, resetsAt: RESET }, { kind: 'spend_limit', percentUsed: 100, resetsAt: RESET }], 95, out.state)
  expect(out.crossings).toEqual([{ kind: 'five_hour', percentUsed: 95, resetsAt: RESET }])
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 99, resetsAt: RESET }], 95, out.state)
  expect(out.crossings).toEqual([])
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 50, resetsAt: RESET }], 95, out.state)
  out = crossingsOf([{ kind: 'five_hour', percentUsed: 98, resetsAt: RESET }], 95, out.state)
  expect(out.crossings).toHaveLength(1)
  // Already warned in an earlier session with the same reset does not warn again. The pause is not this function's decision.
  state = initialBrakeState({ notified: { five_hour: RESET, seven_day: null } })
  expect(crossingsOf([{ kind: 'five_hour', percentUsed: 99, resetsAt: RESET }], 95, state).crossings).toEqual([])

  function assertBounds(value: any) {
    expect(value).toEqual({ five_hour: { above: false, resetsAt: null }, seven_day: { above: false, resetsAt: null } })
  }
})

test('a run opened while the five-hour window is already over the threshold pauses without a second warning', async ($, on) => {
  const settings = { ...SETTINGS, openRun: null, paused: null, notified: { five_hour: null, seven_day: null } }
  const crossing: any = { recorded: false, paused: false, reason: 'no-run' }
  const s = stubs(on, { settings, crossing })
  s.setLimits([{ kind: 'five_hour', percentUsed: 96, resetsAt: RESET }])
  await step($)
  expect(s.notes).toHaveLength(1)
  expect(s.prompts).toEqual([])
  const settingsCalls = () => s.runs.filter((r) => r.argv[2] === 'brake-settings').length
  expect(settingsCalls()).toBe(1)
  expect(s.crossingRuns()).toHaveLength(1)
  settings.openRun = RUN
  Object.assign(crossing, { recorded: true, paused: true, run: RUN, resetsAt: RESET, resumeAt: RESUME })
  delete crossing.reason
  await s.clock.advance(60_000)
  await step($)
  expect(s.notes).toHaveLength(1)
  expect(settingsCalls()).toBe(2)
  expect(s.crossingRuns()).toHaveLength(2)
  expect(s.prompts).toHaveLength(1)
  expect(s.prompts[0].text).toContain(`Autonomous run ${RUN} is now paused by the quota brake until ${RESUME}`)
  expect(s.prompts[0].asUser).toBeUndefined()
  await step($)
  expect(s.notes).toHaveLength(1)
  expect(settingsCalls()).toBe(2)
  expect(s.crossingRuns()).toHaveLength(2)
})

test('several steps with no open run ask for settings at most once per interval', async ($, on) => {
  const settings = { ...SETTINGS, openRun: null, paused: null }
  const s = stubs(on, { settings, crossing: { recorded: false, paused: false, reason: 'no-run' } })
  s.setLimits([{ kind: 'five_hour', percentUsed: 96, resetsAt: RESET }])
  const settingsCalls = () => s.runs.filter((r) => r.argv[2] === 'brake-settings').length
  await step($)
  await step($)
  await step($)
  expect(settingsCalls()).toBe(1)
  expect(s.prompts).toEqual([])
  await s.clock.advance(60_000)
  await step($)
  expect(settingsCalls()).toBe(2)
  await step($)
  expect(settingsCalls()).toBe(2)
})

test('a run already open in a window warned earlier still pauses, and does not warn again', async ($, on) => {
  const s = stubs(on, {
    settings: { ...SETTINGS, openRun: RUN, paused: null, notified: { five_hour: RESET, seven_day: null } },
  })
  s.setLimits([{ kind: 'five_hour', percentUsed: 96, resetsAt: RESET }])
  await step($)
  expect(s.notes).toEqual([])
  expect(s.crossingRuns()).toHaveLength(1)
  expect(s.prompts).toHaveLength(1)
  expect(s.prompts[0].asUser).toBeUndefined()
})

test('the weekly window and a Lead session with no open run only warn', async ($, on) => {
  const s = stubs(on, { crossing: { recorded: false, paused: false, reason: 'no-run' } })
  s.setLimits([{ kind: 'seven_day', percentUsed: 96, resetsAt: RESET }])
  await step($)
  expect(s.notes.map((n) => n.text)).toEqual([`La ventana semanal de Claude llegó al 96% (umbral 95%) y se reinicia a las ${RESET}. Es solo un aviso: nada se detiene.`])
  expect(s.crossingRuns()[0].argv).toContain('seven_day')
  expect(s.prompts).toEqual([])
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.notes).toHaveLength(2)
  expect(s.prompts).toEqual([])
})

test('a crossing with the brake off still warns once and stops nothing', async ($, on) => {
  const s = stubs(on, { crossing: { recorded: true, paused: false, brakeOff: true, run: RUN, quote: 'sigue hasta acabar aunque se acabe la cuota' } })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  await step($)
  expect(s.notes).toHaveLength(1)
  expect(s.crossingRuns()).toHaveLength(1)
  expect(s.prompts).toEqual([])
})

test('a refused notice still records the pause and the resume', async ($, on) => {
  const s = stubs(on, { notifyFails: true })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.crossingRuns()[0].argv.join(' ')).toContain('--notify failed --notify-reason disabled')
  expect(s.prompts).toHaveLength(1)
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts).toHaveLength(2)
})

test('a paused run from an earlier session rearms its resume on the first step', async ($, on) => {
  const s = stubs(on, { settings: { ...SETTINGS, paused: { run: RUN, resetsAt: RESET, resumeAt: RESUME, percentUsed: 97 } } })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.prompts).toEqual([])
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts).toHaveLength(1)
  expect(s.prompts[0].text).toContain('the five_hour window has reset')
})

test('a session that is not the Lead sees nothing of the brake', async ($, on) => {
  const s = stubs(on, { marked: false })
  s.setLimits([{ kind: 'five_hour', percentUsed: 99, resetsAt: RESET }])
  await step($)
  await $.turn.complete({ turnId: 't', answer: 'ok', durationMs: 1, isAborted: false, usage: null })
  expect(s.runs).toEqual([])
  expect(s.notes).toEqual([])
  expect(s.prompts).toEqual([])
  expect(s.writes).toEqual([])
})

test('a settings call that fails leaves the brake inert and the step untouched', async ($, on) => {
  const s = stubs(on, { settings: null })
  s.setLimits([{ kind: 'five_hour', percentUsed: 99, resetsAt: RESET }])
  const value = await step($)
  expect(value.answer).toBe('ok')
  expect(s.notes).toEqual([])
  expect(s.prompts).toEqual([])
  // One settings attempt only, never one per step.
  await step($)
  expect(s.runs.filter((r) => r.argv[2] === 'brake-settings')).toHaveLength(1)
})
