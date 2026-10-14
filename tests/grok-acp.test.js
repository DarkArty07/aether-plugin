'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const { ACP_TIMEOUT_MS, readBillingViaAcp } = require('../plugins/aether/lib/harness/grok-acp.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-grok-acp.js')
const [, , BILLING_LINE] = fs.readFileSync(path.join(__dirname, 'fixtures', 'grok-acp-billing.jsonl'), 'utf8').trim().split('\n')
const CONFIG = JSON.parse(BILLING_LINE).result.config

// The fake agent as the `grok` command, in the mode given, with a log of what it saw. Returns the options for
// readBillingViaAcp and a function that reads the log.
function fakeAgent(t, mode = 'answer') {
  fs.chmodSync(FAKE, 0o755)
  const dir = tempDir(t)
  const logFile = path.join(dir, 'acp.log')
  const env = { HOME: dir, PATH: process.env.PATH, XAI_API_KEY: 'secret-key', AETHER_FAKE_ACP_MODE: mode, AETHER_FAKE_ACP_LOG: logFile }
  const entries = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [])
  return { options: { command: FAKE, env }, entries }
}

// Whether a process is gone, or a zombie its new parent has not reaped yet.
function gone(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] === 'Z'
  } catch {
    return true
  }
}

async function goneSoon(pid) {
  for (let i = 0; i < 40 && !gone(pid); i++) await new Promise((resolve) => setTimeout(resolve, 50))
  return gone(pid)
}

test('the timeout is ten seconds', () => {
  assert.equal(ACP_TIMEOUT_MS, 10000)
})

test('it starts the agent in an empty temporary directory with the lane environment, asks initialize and then _x.ai/billing, and gives the config', async (t) => {
  const { options, entries } = fakeAgent(t)
  const before = Date.now()
  const answer = await readBillingViaAcp(options)
  const after = Date.now()
  assert.deepEqual(answer.config, CONFIG)
  assert.deepEqual([answer.subscriptionTier, answer.version], ['SuperGrok', '1.0.52'])
  assert.ok(answer.at >= before && answer.at <= after, 'the time of the answer is the clock at that moment')
  assert.ok(after - before < 5000, `took ${after - before} ms`)

  const [started, ...requests] = entries()
  assert.deepEqual(started.argv, ['agent', '--no-leader', 'stdio'])
  assert.equal(started.cwd.startsWith(path.join(fs.realpathSync(os.tmpdir()), 'aether-grok-acp-')) || started.cwd.startsWith(path.join(os.tmpdir(), 'aether-grok-acp-')), true, started.cwd)
  assert.deepEqual(started.cwdFiles, [])
  assert.equal(started.updater, '1')
  assert.match(started.marker, /^grok-acp\//)
  assert.equal(started.secret, null, 'a variable named like a secret does not reach the agent')
  assert.deepEqual(requests.map((r) => [r.request, r.params, r.id]), [
    ['initialize', { protocolVersion: 1, clientCapabilities: {} }, 1],
    ['_x.ai/billing', {}, 2],
  ])
  assert.equal(fs.existsSync(started.cwd), false, 'the temporary directory is removed')
  assert.equal(await goneSoon(started.pid), true, 'the agent is ended')
})

test('a line that is not JSON, and a notification, are not answers', async (t) => {
  const { options } = fakeAgent(t, 'garbage')
  const answer = await readBillingViaAcp(options)
  assert.deepEqual(answer.config, CONFIG)
})

test('an agent that never answers _x.ai/billing gives null inside the timeout, and is ended', async (t) => {
  const { options, entries } = fakeAgent(t, 'silent')
  const started = Date.now()
  assert.equal(await readBillingViaAcp({ ...options, timeoutMs: 2600 }), null)
  const elapsed = Date.now() - started
  assert.ok(elapsed >= 500 && elapsed < 2600, `took ${elapsed} ms`)
  const [first] = entries()
  assert.equal(await goneSoon(first.pid), true)
  assert.equal(fs.existsSync(first.cwd), false)
})

test('an error, an answer without a config, and an agent that exits give null at once', async (t) => {
  for (const mode of ['error', 'no-config', 'exit-after-initialize']) {
    const { options, entries } = fakeAgent(t, mode)
    const started = Date.now()
    assert.equal(await readBillingViaAcp({ ...options, timeoutMs: 6000 }), null, mode)
    assert.ok(Date.now() - started < 3000, `${mode} took ${Date.now() - started} ms`)
    const [first] = entries()
    assert.equal(await goneSoon(first.pid), true, mode)
    assert.equal(fs.existsSync(first.cwd), false, mode)
  }
})

test('grok that is not installed, or cannot start, gives null and never throws', async (t) => {
  const dir = tempDir(t)
  assert.equal(await readBillingViaAcp({ command: 'no-such-grok-anywhere', env: { HOME: dir, PATH: dir } }), null)
  const notExecutable = path.join(dir, 'grok')
  fs.writeFileSync(notExecutable, '#!/nonexistent/interpreter\n')
  fs.chmodSync(notExecutable, 0o755)
  assert.equal(await readBillingViaAcp({ command: notExecutable, env: { HOME: dir, PATH: dir }, timeoutMs: 4000 }), null)
})

test('for a test that needs a running period, the fake answers with the end it is told and leaves grok\'s log line behind', async (t) => {
  const { options } = fakeAgent(t)
  const logLines = path.join(tempDir(t), 'logs', 'unified.jsonl')
  const before = Date.now()
  const answer = await readBillingViaAcp({ ...options, env: { ...options.env, AETHER_FAKE_ACP_END_IN_HOURS: '48', AETHER_FAKE_ACP_LOG_LINES: logLines } })
  const end = Date.parse(answer.config.currentPeriod.end)
  assert.ok(end > before + 47 * 3600 * 1000 && end < Date.now() + 49 * 3600 * 1000, answer.config.currentPeriod.end)
  assert.equal(answer.config.billingPeriodEnd, answer.config.currentPeriod.end)
  const [line] = fs.readFileSync(logLines, 'utf8').trim().split('\n').map((text) => JSON.parse(text))
  assert.deepEqual([line.msg, line.ver, line.ctx.config.currentPeriod.end], ['billing: fetched credits config', '1.0.52', answer.config.currentPeriod.end])
  assert.ok(Math.abs(Date.parse(line.ts) - Date.now()) < 5000)
})

// The group of process pid, from /proc.
const groupOf = (pid) => Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[2])

test('an agent that ignores SIGTERM, and the child it started in its group, are ended inside the timeout; the agent has a group of its own', async (t) => {
  const { options, entries } = fakeAgent(t, 'stubborn')
  const started = Date.now()
  assert.equal(await readBillingViaAcp({ ...options, timeoutMs: 6000 }), null)
  // The read ends at its timeout: it waits less 2 s, and ending an agent that ignores SIGTERM takes those 2 s.
  assert.ok(Date.now() - started < 6000 + 1500, `took ${Date.now() - started} ms`)
  const [first, ...rest] = entries()
  const child = rest.find((entry) => entry.child !== undefined).child
  assert.notEqual(first.pgid, groupOf(process.pid), 'the agent is not in the parent group')
  assert.equal(first.pgid, first.pid, 'the agent leads a group of its own')
  assert.equal(rest.some((entry) => entry.signal === 'SIGTERM'), true, 'SIGTERM comes before SIGKILL')
  assert.equal(await goneSoon(first.pid), true, 'the agent')
  assert.equal(await goneSoon(child), true, 'its child')
  assert.equal(fs.existsSync(first.cwd), false)
})

test('a child that stays in the group after the agent has exited is killed with the group', async (t) => {
  const { options, entries } = fakeAgent(t, 'leaver')
  assert.equal(await readBillingViaAcp({ ...options, timeoutMs: 6000 }), null)
  const [first, ...rest] = entries()
  const child = rest.find((entry) => entry.child !== undefined).child
  assert.equal(await goneSoon(first.pid), true, 'the agent')
  assert.equal(await goneSoon(child), true, 'its child, which carries no marker and ignores SIGTERM')
})

test('what the agent started in a session of its own is ended by its marker', async (t) => {
  const { options, entries } = fakeAgent(t, 'escaper')
  assert.equal(await readBillingViaAcp({ ...options, timeoutMs: 6000 }), null)
  const [first, ...rest] = entries()
  const child = rest.find((entry) => entry.child !== undefined).child
  assert.equal(await goneSoon(first.pid), true, 'the agent')
  assert.equal(await goneSoon(child), true, 'the child that left the group')
})

// readBillingViaAcp in a process of its own, as the bin runs it, and the process killed with signal while the agent runs.
async function killedMidRead(t, signal) {
  const { options, entries } = fakeAgent(t, 'stubborn')
  const tmp = tempDir(t)
  const script = `require(${JSON.stringify(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'harness', 'grok-acp.js'))}).readBillingViaAcp({ command: ${JSON.stringify(FAKE)}, env: process.env, timeoutMs: 30000 })`
  const parent = spawn(process.execPath, ['-e', script], { env: { ...options.env, TMPDIR: tmp }, stdio: 'ignore' })
  const exited = new Promise((resolve) => parent.on('exit', (code, sig) => resolve({ code, sig })))
  for (let i = 0; i < 100 && !entries().some((entry) => entry.child !== undefined); i++) await new Promise((resolve) => setTimeout(resolve, 50))
  const [first, ...rest] = entries()
  const child = rest.find((entry) => entry.child !== undefined).child
  assert.equal(fs.existsSync(first.cwd), true, 'the agent is running in its directory')
  parent.kill(signal)
  const result = await exited
  return { result, first, child, tmp }
}

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  test(`a parent ended by ${signal} while the agent runs ends the agent and its child and removes the directory`, async (t) => {
    const { result, first, child, tmp } = await killedMidRead(t, signal)
    assert.deepEqual(result, { code: 143, sig: null })
    assert.equal(await goneSoon(first.pid), true, 'the agent')
    assert.equal(await goneSoon(child), true, 'its child')
    assert.equal(fs.existsSync(first.cwd), false, 'the directory')
    assert.deepEqual(fs.readdirSync(tmp), [])
  })
}

test('the signal handlers are in place only while a read runs', async (t) => {
  const { options } = fakeAgent(t, 'silent')
  const count = () => ['SIGTERM', 'SIGINT', 'SIGHUP'].map((signal) => process.listenerCount(signal))
  const before = count()
  const reading = readBillingViaAcp({ ...options, timeoutMs: 2600 })
  assert.deepEqual(count(), before.map((n) => n + 1))
  await reading
  assert.deepEqual(count(), before)
})
