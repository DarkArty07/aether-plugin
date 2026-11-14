'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const idle = require('../plugins/aether/lib/skill-idle.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

const NOW = Date.parse('2026-11-07T12:00:00Z')
const DAY = 86400000
const lines = (file, entries) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
}

function world(t) {
  const data = tempDir(t, 'aether-data-')
  const skills = tempDir(t, 'aether-skills-')
  const dir = (name) => {
    const d = path.join(skills, name)
    fs.mkdirSync(d, { recursive: true })
    return d
  }
  return { data, dir, created: (e) => lines(path.join(data, 'skills', 'created.jsonl'), e), installs: (e) => lines(path.join(data, 'skills', 'installs.jsonl'), e), uses: (e) => lines(path.join(data, 'skills', 'uses.jsonl'), e) }
}

test('a skill the Lead created or downloaded, older than 30 days and used by no task in 30 days, is idle; the rest is not (R33, A9, H3 scenario 25)', (t) => {
  const w = world(t)
  const old = NOW - 40 * DAY
  w.created([
    { time: old, session: 's', repo: '/r', name: 'unused', path: w.dir('unused'), type: 'project' },
    { time: old, session: 's', repo: '/r', name: 'used-lately', path: w.dir('used-lately'), type: 'project' },
    { time: NOW - 5 * DAY, session: 's', repo: '/r', name: 'young', path: w.dir('young'), type: 'project' },
    { time: old, session: 's', repo: '/other', name: 'elsewhere', path: w.dir('elsewhere'), type: 'project' },
    { time: old, session: 's', repo: '/r', name: 'gone', path: path.join(w.dir('x'), 'gone'), type: 'project' },
    { time: old, session: 's', repo: null, name: 'permanent', path: w.dir('permanent'), type: 'owner' },
  ])
  w.installs([{ time: old, session: 's', source: 'a/b', scope: 'project', repo: '/r', name: 'fetched', path: w.dir('fetched'), hash: 'h' }, { time: old, session: 's', source: 'a/c', scope: 'global', repo: null, name: 'global-fetched', path: w.dir('global-fetched'), hash: 'h' }])
  w.uses([{ time: NOW - 10 * DAY, session: 's', kind: 'delegate', run: null, task: 't', skills: ['used-lately'] }, { time: NOW - 50 * DAY, session: 's', kind: 'run', run: 'x', task: 'task-1', skills: ['unused'] }])
  assert.deepEqual(idle.idleSkills(w.data, { repo: '/r', now: NOW }).map((s) => s.name), ['fetched', 'global-fetched', 'permanent', 'unused'])
  assert.equal(idle.idleSkills(w.data, { repo: '/r', now: NOW })[0].path.endsWith('fetched'), true)
})

test('no records, unreadable lines and a missing data folder give nothing and never throw (R33)', (t) => {
  const w = world(t)
  assert.deepEqual(idle.idleSkills(w.data, { repo: '/r', now: NOW }), [])
  fs.mkdirSync(path.join(w.data, 'skills'), { recursive: true })
  fs.writeFileSync(path.join(w.data, 'skills', 'created.jsonl'), 'not json\n')
  assert.deepEqual(idle.idleSkills(w.data, { repo: '/r', now: NOW }), [])
  assert.deepEqual(idle.idleSkills(path.join(w.data, 'missing'), { repo: '/r', now: NOW }), [])
})

test('idleLine names the skills in English and in Spanish, and says nothing for none (R33)', () => {
  assert.equal(idle.idleLine(['a', 'b'], { spanish: false }), "Skills nobody used in 30 days: a, b. Consider removing them, with the owner's yes (aether:skills).")
  assert.equal(idle.idleLine(['a'], { spanish: true }), 'Skills que nadie usó en 30 días: a. Considera quitarlas, con el sí del dueño (aether:skills).')
  assert.equal(idle.idleLine([], { spanish: false }), '')
})

test('idleSkills excludes skills loaded by the Lead in the last 30 days, with or without the aether: prefix, and reads readCreatedDeduplicated (R4, R7, C2)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-idle-lead-')
  const now = Date.now()
  const skillDir = path.join(repo.dir, '.agents', 'skills', 'criterio-del-dueno')
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: criterio-del-dueno\ndescription: d\n---\nbody\n')
  const wt = path.join(repo.dir, '.aether', 'work', 'delegates', 'd1', 'wt')
  reg.recordCreated(data, { time: now - 45 * 86400000, session: 's0', repo: wt, name: 'criterio-del-dueno', path: path.join(wt, '.agents', 'skills', 'criterio-del-dueno'), type: 'project' })
  assert.deepEqual(idle.idleSkills(data, { repo: repo.dir, now }).map((s) => s.name), ['criterio-del-dueno'], 'the worktree is gone, the skill in the main repo is found')

  reg.recordUse(data, { time: now - 5 * 86400000, session: 's1', repo: repo.dir, kind: 'lead', skills: ['aether:criterio-del-dueno'] })
  assert.deepEqual(idle.idleSkills(data, { repo: repo.dir, now }), [])
})
