'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { fixedLists } = require('./harness-literals.js')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const SKILL = read('.claude/skills/new-harness/SKILL.md')

function listedBlock() {
  const match = SKILL.match(/<!-- lists:start -->\n([\s\S]*?)\n<!-- lists:end -->/)
  assert.ok(match, 'the skill has its lists block')
  return match[1].split('\n').filter((line) => line.trim() !== '').map((line) => {
    const [file, name] = line.split(' — ')[0].trim().split(/\s+/)
    return { file, name }
  })
}

test('the description loads the skill when a new harness is asked for, and the steps come in the order of the method (R23)', () => {
  const description = SKILL.match(/^description: (.*)$/m)[1]
  assert.ok(/new harness/i.test(description) && /added to Aether/i.test(description))
  const order = ['List everything the CLI gives', 'Read Artificial Analysis once', 'Decide what stays out', 'Map the tiers', 'Get a cost per task', 'free, live reading', 'personal setup', 'The Lead makes the real calls', 'Touch every list', 'Release']
  const positions = order.map((phrase) => SKILL.indexOf(phrase))
  assert.ok(positions.every((position) => position > -1), `a step is missing: ${order.filter((_, i) => positions[i] === -1)}`)
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'the steps are in order')
})

test('the skill names the mistakes of Muse it avoids', () => {
  assert.ok(SKILL.includes('issue #108'))
  for (const mistake of ['2 of the 4 models', 'No pair existed below', 'balance came from a call made hours earlier', 'no cost per task', 'one by one']) assert.ok(SKILL.includes(mistake) || SKILL.toLowerCase().includes(mistake.toLowerCase()), mistake)
})

test('every list the skill tells to touch exists in the tree, and every fixed list of the code is named in the skill (R23)', () => {
  const named = listedBlock()
  for (const { file, name } of named) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} does not exist`)
    assert.ok(new RegExp(`(const|let|var)\\s+${name}\\s*=`).test(read(file)), `${file} has no ${name}`)
  }
  const found = fixedLists(ROOT).map(({ file, name }) => `${file} ${name}`)
  const have = named.map(({ file, name }) => `${file} ${name}`)
  assert.deepEqual(found.filter((entry) => !have.includes(entry)), [], 'a fixed list of the code the skill does not name')
  assert.deepEqual(have.filter((entry) => !found.includes(entry)), [], 'a list of the skill the code does not have')
})

test('the one list of the harnesses is named in the skill, harness-names.js derives from it, and its five copies read harness-names.js (R23; spec 036 R23)', () => {
  const have = listedBlock().map(({ file, name }) => `${file} ${name}`)
  assert.ok(have.includes('plugins/aether/lib/harness/index.js ADAPTER_NAMES'))
  assert.ok(read('plugins/aether/lib/harness-names.js').includes("require('./harness/index.js')"))
  const copies = { 'delegate-calls.js': 'HARNESSES', 'router-pick.js': 'DELEGATE_HARNESSES', 'router-quota.js': 'EXTERNAL', 'router-renewal.js': 'RENEWABLE', 'lane-delegate.js': 'ALLOWED_HARNESSES' }
  for (const [file, name] of Object.entries(copies)) {
    const text = read(`plugins/aether/lib/${file}`)
    assert.ok(text.includes("require('./harness-names.js')"), `${file} reads harness-names.js`)
    assert.ok(SKILL.includes(`${name} (${file})`), `the skill names ${name} as a copy`)
  }
})

test('the skill new-harness holds the rule of the top tier and the trap of the scales in their own sections (R24)', () => {
  const text = read('.claude/skills/new-harness/SKILL.md')
  assert.ok(text.includes('The top tier waits for its next generation') && text.includes('The scales move'), 'the two sections')
  for (const phrase of ['Fable 5.1', 'GPT-6 Astra', 'GPT-6.1 Astra', '2026-10-26', '2026-10-29', 'a new row']) assert.ok(text.includes(phrase), phrase)
  assert.ok(/waits for|next generation/i.test(text))
})

test('a new model of a harness that is already in: read its pages, show the ladder, draft the rows, wait for the owner (spec 043 C2)', () => {
  const at = SKILL.indexOf('## A new model of a harness that is already in')
  assert.ok(at >= 0, 'the skill has the new-model section')
  const section = SKILL.slice(at)
  const order = ['aa-pages.js read', 'refresh-lanes.js', '.aether/model-drafts/', 'before touching `config/`']
  const positions = order.map((phrase) => section.indexOf(phrase))
  assert.ok(positions.every((position) => position > -1), `a step is missing: ${order.filter((_, i) => positions[i] === -1)}`)
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'the steps are in order')
  assert.ok(section.includes('node scripts/aa-pages.js read <slug> --harness <name>'), 'the read command with slug and harness')
  assert.ok(section.includes('node scripts/refresh-lanes.js'), 'the ladder preview without --write')
  for (const line of section.split('\n')) {
    if (line.includes('aa-pages.js read')) assert.ok(!line.includes('--write'), `the read command runs with no --write: ${line}`)
  }
  assert.ok(section.includes('aa-pages.json'), 'the section names the snapshot aa-pages.json as the one file the read updates')
  assert.match(section, /owner's own words|owner's yes/i, 'the draft waits for the owner')
})

test('the new-model step compares figures with the ladder rungs, checks dominance, and never shows the model in refresh-lanes (spec 043 C2)', () => {
  const at = SKILL.indexOf('## A new model of a harness that is already in')
  assert.ok(at >= 0, 'the skill has the new-model section')
  const section = SKILL.slice(at)
  assert.match(section, /Claude rows of `config\/pairs\.json` named by `config\/ladder\.json`/i, 'rungs are the Claude rows ladder.json names')
  assert.match(section, /reaches the rung's points minus 1/i, 'an external pair serves a rung at points minus 1')
  assert.match(section, /supervisor or reviewer needs the exact points/i, 'supervisor and reviewer need exact points')
  assert.match(section, /cheaper pair of the same harness/i, 'dominance is checked within the quota group')
  assert.match(section, /dominated and never chosen/i, 'a dominated pair is never chosen')
  assert.match(section, /only the Claude ladder itself/i, 'refresh-lanes without --write shows only the Claude ladder')
  assert.match(section, /config\/prices\.json.*config\/models\/harness-models\.json|config\/models\/harness-models\.json.*config\/prices\.json/, 'no write to the tables without the owner')
})

test('the repository skills live in .agents/skills/ with relative symlinks in .claude/skills/ and pass plugin review', (t) => {
  const { reviewSkill, posttool } = require('../plugins/aether/lib/skill-review.js')
  const { classifySkillPath } = require('../plugins/aether/lib/skill-rules.js')

  // Isolate from the unmerged main checkout (repoPaths().mainRoot) when running inside a worktree.
  fs.mkdirSync(path.join(ROOT, '.aether', 'tmp'), { recursive: true })
  const isolated = fs.mkdtempSync(path.join(ROOT, '.aether', 'tmp', 'skills-layout-'))
  t.after(() => fs.rmSync(isolated, { recursive: true, force: true }))
  require('node:child_process').execFileSync('git', ['init', '--quiet', isolated])
  fs.cpSync(path.join(ROOT, '.agents'), path.join(isolated, '.agents'), { recursive: true, verbatimSymlinks: true })
  fs.mkdirSync(path.join(isolated, '.claude'))
  fs.cpSync(path.join(ROOT, '.claude', 'skills'), path.join(isolated, '.claude', 'skills'), { recursive: true, verbatimSymlinks: true })

  for (const name of ['artificial-analysis', 'new-harness', 'pxl']) {
    const linkPath = path.join(ROOT, '.claude', 'skills', name)
    const realPath = path.join(ROOT, '.agents', 'skills', name)
    assert.ok(fs.lstatSync(linkPath).isSymbolicLink(), `${name} in .claude/skills/ is a symlink`)
    assert.equal(fs.readlinkSync(linkPath), path.join('..', '..', '.agents', 'skills', name))
    assert.ok(fs.statSync(realPath).isDirectory(), `${name} in .agents/skills/ is a directory`)

    const info = classifySkillPath(path.join(linkPath, 'SKILL.md'), { cwd: ROOT })
    assert.equal(info?.type, 'project')
    assert.equal(info?.dir, fs.realpathSync(realPath))

    assert.deepEqual(reviewSkill(path.join(isolated, '.agents', 'skills', name), { cwd: isolated }), [])
    assert.deepEqual(reviewSkill(path.join(isolated, '.claude', 'skills', name), { cwd: isolated }), [])
    const notice = posttool({
      tool_name: 'Edit',
      tool_input: { file_path: path.join(isolated, '.claude', 'skills', name, 'SKILL.md') },
      cwd: isolated,
      session_id: `layout-${name}`,
    })
    assert.equal(notice, null, `unexpected notice for ${name}: ${notice}`)
  }
})
