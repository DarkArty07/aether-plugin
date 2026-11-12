'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, tempDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { loadSwarmConfig } = require('../plugins/aether/lib/wt-config.js')
const run = require('../plugins/aether/lib/run.js')

const ROOT = path.join(__dirname, '..')
const CONFIG = path.join(ROOT, 'plugins', 'aether', 'config', 'swarm.json')
const RUN = '20261112-010203-ab12'

test('swarm.json holds the wait and the watch cap, and loadSwarmConfig returns them', () => {
  const file = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  assert.deepEqual(Object.keys(file).sort(), ['stuckWaitSeconds', 'watchSilenceSeconds'])
  assert.equal(file.stuckWaitSeconds, 1800)
  assert.equal(file.watchSilenceSeconds, 2400)
  assert.deepEqual(loadSwarmConfig(), file)
})

test('no code file repeats the default wait: it is read from the configuration', () => {
  for (const rel of ['plugins/aether/workflows/run.workflow.js', 'plugins/aether/lib/wt-stuck.js', 'plugins/aether/lib/wt-watch.js']) {
    const file = path.join(ROOT, rel)
    if (fs.existsSync(file)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\b1800\b/, rel)
  }
})

test('loadSwarmConfig reads the numbers of the file it is given, and refuses a bad file', (t) => {
  const dir = tempDir(t)
  const write = (value) => {
    const file = path.join(dir, 'swarm.json')
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
    return file
  }
  assert.deepEqual(loadSwarmConfig(write({ stuckWaitSeconds: 60, watchSilenceSeconds: 90 })), { stuckWaitSeconds: 60, watchSilenceSeconds: 90 })
  assert.equal(loadSwarmConfig(write({ stuckWaitSeconds: 0, watchSilenceSeconds: 90 })).stuckWaitSeconds, 0)
  // Without a cap of its own the watch waits the stuck wait plus 600 s.
  assert.deepEqual(loadSwarmConfig(write({ stuckWaitSeconds: 100 })), { stuckWaitSeconds: 100, watchSilenceSeconds: 700 })
  const bad = [{ stuckWaitSeconds: -1 }, { stuckWaitSeconds: 1.5 }, { stuckWaitSeconds: '60' }, { stuckWaitSeconds: 60, watchSilenceSeconds: 0 }, {}, [], 'not json']
  for (const value of bad) assert.throws(() => loadSwarmConfig(write(value)), /^Error: swarm config/, JSON.stringify(value))
  assert.throws(() => loadSwarmConfig(path.join(dir, 'missing.json')), /^Error: swarm config/)
})

test('run.js names the files of a wait under the run directory', () => {
  const dir = `/repo/.aether/runs/${RUN}`
  assert.equal(run.stuckDir('/repo', RUN), `${dir}/stuck`)
  assert.equal(run.stuckFile('/repo', RUN, 'task-1'), `${dir}/stuck/task-1.json`)
  assert.equal(run.heartbeatFile('/repo', RUN), `${dir}/heartbeat.json`)
  assert.equal(run.launchEndFile('/repo', RUN), `${dir}/launch-end.json`)
  assert.equal(run.stuckPayloadFile('/repo', RUN, 'task-1'), `${dir}/ladder/task-1-stuck.json`)
})

test('compile puts the configured wait in the args, right after maxAgents and before lanes', (t) => {
  const args = compile(makeRepo(t), plan([task(1)]))
  assert.equal(args.stuckWaitSeconds, loadSwarmConfig().stuckWaitSeconds)
  const keys = Object.keys(args)
  assert.equal(keys.indexOf('stuckWaitSeconds'), keys.indexOf('maxAgents') + 1)
  assert.equal(keys.pop(), 'lanes')
})

test('a compile of the same run clears the wait records, the heartbeat and the end mark of the launch before', (t) => {
  const repo = makeRepo(t)
  const markdown = plan([task(1)])
  const first = compile(repo, markdown)
  fs.mkdirSync(run.stuckDir(repo.dir, first.runId), { recursive: true })
  fs.writeFileSync(run.stuckFile(repo.dir, first.runId, 'task-1'), '{}\n')
  fs.writeFileSync(run.heartbeatFile(repo.dir, first.runId), '{}\n')
  fs.writeFileSync(run.launchEndFile(repo.dir, first.runId), '{}\n')
  const again = compile(repo, markdown, ['--run', first.runId])
  assert.equal(again.runId, first.runId)
  assert.equal(fs.existsSync(run.stuckDir(repo.dir, first.runId)), false)
  assert.equal(fs.existsSync(run.heartbeatFile(repo.dir, first.runId)), false)
  assert.equal(fs.existsSync(run.launchEndFile(repo.dir, first.runId)), false)
})
