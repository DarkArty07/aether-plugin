'use strict'

// The startup notices of the development installation (spec 020): a startup shows only the notices that fit its output, the rest
// wait for the next startup, and a file that is not a notice shows nothing and is removed.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const store = require(path.join(PLUGIN, 'lib', 'observe-notice.js'))
const { main, PART_LIMIT } = require(path.join(PLUGIN, 'lib', 'session-start.js'))

// The longest owner and repository GitHub allows, so that each notice is a long line and the budget is reached in a few notices.
const OWNER = 'o'.repeat(39)
const REPO = 'r'.repeat(100)
const url = (n) => `https://github.com/${OWNER}/${REPO}/issues/${n}`
const noticesDir = (dir) => path.join(dir, 'observe', 'notices')

// One startup of the Lead, as the SessionStart hook runs it: the whole standard output, as text.
function startup(dir) {
  let output = ''
  main({ input: { agent_type: 'aether:lead', source: 'startup', session_id: 'notices-test' }, env: { AETHER_DATA_DIR: dir }, cwd: dir, stdout: { write: (s) => { output += s } } })
  return output
}
const shownOf = (output) => [...JSON.parse(output).systemMessage.matchAll(/Aether opened issue #(\d+):/g)].map((m) => Number(m[1]))

test('a startup shows only the notices that fit its output, and the rest wait for the next startup', (t) => {
  const dir = tempDir(t)
  const total = 60
  for (let n = 1; n <= total; n++) assert.equal(store.saveNotice(dir, { number: n, url: url(n), id: 'rise-without-reason:t2:2' }), true)
  const batches = []
  for (let round = 0; round <= total; round++) {
    const output = startup(dir)
    assert.ok(output.length <= PART_LIMIT, `a startup writes ${output.length} characters, within ${PART_LIMIT}`)
    const shown = shownOf(output)
    if (shown.length === 0) break
    batches.push(shown)
  }
  assert.ok(batches.length >= 2, 'the notices did not all fit in one startup')
  assert.ok(batches[0].length < total)
  assert.deepEqual(batches.flat().sort((a, b) => a - b), Array.from({ length: total }, (_, i) => i + 1), 'every notice is shown exactly once')
  assert.deepEqual(fs.readdirSync(noticesDir(dir)), [], 'nothing is left in the folder')
})

test('a notice holds only its number, its issue URL and a general reason; a file that is not a notice shows nothing and is removed', (t) => {
  const dir = tempDir(t)
  assert.equal(store.saveNotice(dir, { number: 1, url: 'https://github.com/a/b/issues/2', id: 'fault:x' }), false, 'a number that is not the one of the URL')
  assert.equal(store.saveNotice(dir, { number: 3, url: `https://github.com/${'o'.repeat(40)}/b/issues/3`, id: 'fault:x' }), false, 'an owner longer than GitHub allows')
  assert.equal(store.saveNotice(dir, { number: 4, url: 'https://github.com/a/b/issues/4', id: 'fault:private-task-name' }), true)
  const [saved] = fs.readdirSync(noticesDir(dir))
  const text = fs.readFileSync(path.join(noticesDir(dir), saved), 'utf8')
  assert.equal(text.includes('private-task-name'), false, 'the finding id is not kept')
  assert.equal(JSON.parse(text).reason, 'silent faults')
  fs.writeFileSync(path.join(noticesDir(dir), '000000000000001-abcd.json'), '{ not json')
  fs.writeFileSync(path.join(noticesDir(dir), '000000000000002-ef01.json'), JSON.stringify({ number: 5, url: 'https://github.com/a/b/issues/5', reason: 'a reason nobody wrote' }))
  const taken = store.takeNotices(dir)
  assert.deepEqual(taken.map((n) => n.number), [4])
  assert.deepEqual(fs.readdirSync(noticesDir(dir)), [], 'the invalid files are removed and the valid one is claimed')
})

test('a notice that does not fit stays pending without holding back a smaller later one', (t) => {
  const dir = tempDir(t)
  for (let n = 1; n <= 3; n++) assert.equal(store.saveNotice(dir, { number: n, url: url(n), id: 'fault:x' }), true)
  const taken = store.takeNotices(dir, (list) => list.length <= 2)
  assert.equal(taken.length, 2)
  assert.equal(fs.readdirSync(noticesDir(dir)).length, 1, 'the third waits in the folder')
  assert.equal(store.takeNotices(dir).length, 1)
  assert.deepEqual(fs.readdirSync(noticesDir(dir)), [])
  assert.equal(store.saveNotice(dir, { number: 4, url: url(4), id: 'fault:x' }), true)
  const [oldest] = fs.readdirSync(noticesDir(dir))
  fs.renameSync(path.join(noticesDir(dir), oldest), path.join(noticesDir(dir), '000000000000000-ffffffff.json'))
  assert.equal(store.saveNotice(dir, { number: 5, url: 'https://github.com/o/r/issues/5', id: 'fault:x' }), true)
  const skipped = store.takeNotices(dir, (list) => list.every((notice) => notice.url.length < 100))
  assert.deepEqual(skipped.map((n) => n.number), [5], 'the oversized oldest one waits while the smaller one is shown')
  assert.deepEqual(store.takeNotices(dir).map((n) => n.number), [4])
})
