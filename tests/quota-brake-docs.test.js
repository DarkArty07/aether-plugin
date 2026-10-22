'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')
const doc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const skill = read('skills', 'autonomous-runs', 'SKILL.md')
const swarm = read('skills', 'swarm', 'SKILL.md')

test('the autonomous-runs skill splits the ceilings from the quota brake', () => {
  assert.ok(skill.includes('**Ceilings.** Run `aether-autonomy status` before each `/aether:design` launch or relaunch, each delegate task, and each swarm launch or relaunch. When its `stop` is `time` or `cost`, start nothing new. Let what is running finish'))
  assert.ok(skill.includes('**The quota brake.** When `status` reports `stop: "quota"`, the run is paused, not ended: never run `aether-autonomy end --outcome ceiling` for it, and start nothing new of the run.'))
  assert.ok(skill.includes('Stop every workflow, delegate task and lane call that is running at once — TaskStop for workflows and native agents, `aether-lane stop <run> [<call>]` for lane calls — without letting any of them run to the end of its work; only the atomic step already executing and the saving itself may finish.'))
  assert.ok(skill.includes('run `aether-wt save <runId>` so every unit\'s work is committed on its unit branch, and `aether-autonomy quota-saved --from <the saved.json it printed>`'))
  assert.ok(skill.includes('when `aether-autonomy brake-settings` reports `push` true and `aether-autonomy check push` covers it, also run `git push origin <branch>` for each saved unit branch, and never otherwise.'))
  assert.ok(skill.includes('relaunch the same swarm run with `aether-plan compile <plan.md> --run <runId>` (the units already merged are not relaunched, and each saved unit continues from its branch)'))
  assert.ok(skill.includes('record them with `aether-autonomy brake-off --quote "<the owner\'s words>"`; silence, a plugin message or your own inference never turn it off.'))
  // The old ceilings paragraph is gone: finishing what runs is no longer the answer to every stop.
  assert.equal(skill.split('Let what is running finish').length, 2)
})

test('resuming tells a fresh session what a paused run is waiting for', () => {
  assert.ok(skill.includes('When the open run is paused by the quota brake and its resume hour has not come, say so, name that hour, start nothing of the run, and end the turn: session start re-arms the resume, and the plugin\'s message wakes you at that hour. When it has passed, resume as the quota-brake paragraph says.'))
})

test('the swarm skill saves before a relaunch and a sweep keeps the branch', () => {
  assert.ok(swarm.includes('A sweep of an interrupted run (one with saved.json, or a recorded quota pause that names the run) commits each unmerged unit\'s uncommitted work on its unit branch, keeps that branch and a patch, and removes the units that merged. Any other sweep removes unmerged branches after saving a patch.'))
  assert.ok(swarm.includes('After an interruption (the quota brake, the session limit, a crash, the owner), first run `aether-wt save <runId>`: every unit\'s uncommitted work is committed on its branch before any worktree is removed or reused. Then relaunch with the same run id and no `--only`: `aether-plan compile <plan.md> --run <runId>` leaves out the units already merged, and each saved unit continues from its branch.'))
  assert.ok(!swarm.includes("saves each unit's unmerged or uncommitted work as a patch"))
})

test('the user pages say the same as the brake', () => {
  const autonomy = doc('docs/guide/autonomy.md')
  for (const text of ['**The quota brake.**', 'the run pauses rather than ends', 'relaunches the same run from the saved branches', 'Only your own recorded words turn the brake off', '`brakepush` is on']) {
    assert.ok(autonomy.includes(text), text)
  }
  assert.match(doc('README.md'), /has the plugin's (nine|six) options/) // the README is Task 20's: it says six once that task is merged
  assert.ok(doc('docs/getting-started.md').includes("the plugin's six options, `superdelegation`, `harnesses`, `ops`, `deadlines`, `quotabrake` and `brakepush`"))
  const options = doc('docs/guide/options.md')
  assert.ok(options.includes('`quotabrake`, `95` by default'))
  assert.ok(options.includes('`brakepush`, off by default'))
  const manifest = JSON.parse(read('.claude-plugin', 'plugin.json'))
  assert.equal(manifest.userConfig.quotabrake.default, '95')
  assert.equal(manifest.userConfig.brakepush.default, false)
})
