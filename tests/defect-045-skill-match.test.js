'use strict'
// R20: the automatic project-skill matcher with the closed stopWords rule (spec 045, scenario 8).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const sb = require('../plugins/aether/lib/skill-brief.js')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const REAL = ['pxl', 'new-harness', 'artificial-analysis']

function project(t) {
  const dir = tempDir(t, 'aether-defect-045-match-')
  for (const name of REAL) {
    const src = path.join(__dirname, '..', '.agents', 'skills', name, 'SKILL.md')
    const destDir = path.join(dir, '.agents', 'skills', name)
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(src, path.join(destDir, 'SKILL.md'))
  }
  return dir
}

function skill(root, name, { body = 5, description = 'Use for the work.', frontName = name, where = '.agents/skills' } = {}) {
  const dir = path.join(root, where, name)
  fs.mkdirSync(dir, { recursive: true })
  const front = ['---', `name: ${frontName}`, ...(description === null ? [] : [`description: ${description}`]), '---']
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [...front, ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n')
  return dir
}

const match = (dir, task) => sb.matchDelegateSkills(dir, { prompt: '', description: '', owns: [], ...task })

test('R20: pxl matches a task that edits a .px.js file without naming pxl', (t) => {
  assert.deepEqual(match(project(t), { description: 'Adjust the walk cycle', owns: ['assets/brand/gifs/walk.px.js'] }), ['pxl'])
})
test('R20: pxl matches by name and by pixel-art animation and GIF export', (t) => {
  const dir = project(t)
  assert.deepEqual(match(dir, { prompt: 'Rebuild the pxl sheet' }), ['pxl'])
  assert.deepEqual(match(dir, { prompt: 'Export the pixel-art animation as a GIF' }), ['pxl'])
})
for (const task of [
  { description: 'Update README.md and the landing page', owns: ['README.md', 'site/index.html'] },
  { description: 'Tune the CSS animation of the hero on the landing page', owns: ['site/styles.css'] },
  { description: 'Refactor the parser and add tests', owns: ['plugins/aether/lib/plan.js', 'tests/plan.test.js'] },
  { description: 'Fix the harness adapter parse bug', owns: ['plugins/aether/lib/harness/agy.js'] },
  { prompt: 'These are one of the tasks, and they are out of the picture, not here' },
  { description: 'Show cost and tokens in aether-report', owns: ['plugins/aether/lib/report.js'] },
  { description: 'Pick the model and effort of the delegate in delegate-task', owns: ['plugins/aether/lib/delegate-task.js'] },
]) {
  test(`R20: ${JSON.stringify(task).slice(0, 60)} gets none of the three real skills`, (t) => {
    assert.deepEqual(match(project(t), task), [])
  })
}
test('R20: a short word of 3 letters (are, one, out, for, how, per) is never a domain word', (t) => {
  const dir = tempDir(t, 'aether-defect-045-short-')
  skill(dir, 'shorty', { description: 'Handle are one out for how per with gim' })
  // Every word of the description is shorter than 4 letters, so the skill
  // has no domain word at all and never matches, even on its own words.
  assert.deepEqual(match(dir, { description: 'are one out for how per' }), [])
  assert.deepEqual(match(dir, { description: 'Handle are one out for how per with gim' }), [])
})
test('R20: new-harness needs more than harness or new + harness (one remaining part is not enough)', (t) => {
  const dir = project(t)
  assert.deepEqual(match(dir, { description: 'Fix the harness adapter parse bug', owns: ['plugins/aether/lib/harness/agy.js'] }), [])
  // Even naming both words is not enough: new is a stop word, so harness is
  // the only remaining part and one part never matches a compound name.
  assert.deepEqual(match(dir, { description: 'Add harness lists tests for the new harness', owns: ['tests/harness-lists.test.js'] }), [])
})
test('R20: audio-fx needs audio-fx or both audio and fx (replaces the old audio-only case)', (t) => {
  const dir = tempDir(t, 'aether-defect-045-audio-')
  skill(dir, 'audio-fx', { body: 1, description: 'Volumen' })
  assert.deepEqual(match(dir, { prompt: 'Monta audio-fx en el menu' }), ['audio-fx'])
  assert.deepEqual(match(dir, { prompt: 'Ajusta el audio y los fx del trailer' }), ['audio-fx'])
  assert.deepEqual(match(dir, { prompt: 'Ajusta el audio del trailer' }), [])
  assert.deepEqual(match(dir, { prompt: 'Ajusta los fx del trailer' }), [])
})
test('R20: ui-kit, save-game and diseno-web still match their cases', (t) => {
  const dir = tempDir(t, 'aether-defect-045-compound-')
  skill(dir, 'ui-kit', { body: 1, description: 'Hud' })
  skill(dir, 'save-game', { body: 1, description: 'Persistencia' })
  skill(dir, 'diseño-web', { body: 1, description: 'Maquetas' })
  assert.deepEqual(match(dir, { prompt: 'Monta ui-kit en el menu' }), ['ui-kit'])
  assert.deepEqual(match(dir, { prompt: 'Revisa el modulo', owns: ['src/save-game/store.js'] }), ['save-game'])
  assert.deepEqual(match(dir, { prompt: 'Revisa el modulo', owns: ['src/save/game/store.js'] }), ['save-game'])
  assert.deepEqual(match(dir, { prompt: 'Actualiza el diseño web de la portada' }), ['diseño-web'])
})
test('R20: the dot-pattern extraction accepts .ipynb and (.ipynb) and ignores landing page. and e.g.', (t) => {
  const dir = tempDir(t, 'aether-defect-045-dots-')
  skill(dir, 'notebooks', { description: 'Notebooks (.ipynb) and files such as .gd are covered.' })
  // a skill whose description is 'Notebooks (.ipynb) and files such as .gd are covered.' matches owns 'a/b.ipynb' and 'x.gd'
  assert.deepEqual(match(dir, { owns: ['a/b.ipynb'] }), ['notebooks'])
  assert.deepEqual(match(dir, { owns: ['x.gd'] }), ['notebooks'])
  // a skill whose description ends 'for the landing page.' with a task that mentions 'e.g.' matches nothing
  const plain = tempDir(t, 'aether-defect-045-dots-none-')
  skill(plain, 'pages', { description: 'Build the site for the landing page.' })
  assert.deepEqual(match(plain, { description: 'Fix e.g. the header' }), [])
})
test('R20: the order is exact name, dot pattern, compound name, domain words, then alphabetical', (t) => {
  const dir = tempDir(t, 'aether-defect-045-order-')
  skill(dir, 'alpha-exact', { description: 'Zebra quixotic vault jigsaw.' })
  skill(dir, 'beta-dot', { description: 'Files like .qxw are covered here.' })
  skill(dir, 'charlie-compound', { description: 'Zebra quixotic vault jigsaw.' })
  skill(dir, 'delta-words', { description: 'Balance the economy and combat systems kindly' })
  skill(dir, 'mike-words', { description: 'Peaceful economy combat loans' })
  skill(dir, 'zulu-words', { description: 'Quiet economy combat loans' })
  assert.deepEqual(
    match(dir, {
      prompt: 'Use alpha-exact on charlie compound files, balance economy and combat in a/b.qxw',
      owns: ['a/b.qxw'],
    }),
    ['alpha-exact', 'beta-dot', 'charlie-compound', 'delta-words', 'mike-words', 'zulu-words'],
  )
})
test('R20: stopWords adds exactly the closed list and not test or tests', () => {
  const stop = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'skills.json'), 'utf8')).stopWords
  for (const w of ['readme', 'landing', 'docs', 'documentation', 'documentacion', 'guide', 'guia', 'spec', 'plan', 'config', 'json', 'new', 'harness', 'codex', 'muse', 'grok', 'quota', 'models']) assert.ok(stop.includes(w), w)
  assert.equal(stop.includes('test') || stop.includes('tests'), false)
})

test('R20: a task that only fixes an existing harness adapter does not get new-harness', (t) => {
  const dir = project(t)
  assert.deepEqual(match(dir, { description: 'Fix the quota parse of the codex harness adapter', owns: ['plugins/aether/lib/harness/codex.js'] }), [])
  assert.deepEqual(match(dir, { description: 'Fix the quota parse of the grok harness adapter, as the codex and muse adapters do', owns: ['plugins/aether/lib/harness/grok.js'] }), [])
})

test('R20: new-harness still matches a task that names it or describes adding one in its own terms', (t) => {
  const dir = project(t)
  assert.deepEqual(match(dir, { description: 'Follow new-harness to add a harness' }), ['new-harness'])
  assert.deepEqual(match(dir, { description: 'Add an external coding harness with native tiers, cost and isolation', owns: ['plugins/aether/lib/harness/grok.js'] }), ['new-harness'])
})
