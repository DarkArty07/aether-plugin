'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const sb = require('../plugins/aether/lib/skill-brief.js')

function skill(root, name, { body = 5, description = 'Use for the work.', frontName = name, where = '.agents/skills' } = {}) {
  const dir = path.join(root, where, name)
  fs.mkdirSync(dir, { recursive: true })
  const front = ['---', `name: ${frontName}`, ...(description === null ? [] : [`description: ${description}`]), '---']
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [...front, ...Array.from({ length: body }, (_, i) => `rule ${i + 1} of ${name}`)].join('\n') + '\n')
  return dir
}
function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const plugin = tempDir(t, 'aether-plugin-')
  return { repo, home, plugin, opts: { cwd: repo.dir, home, pluginRoot: plugin } }
}

test('parseSkillNames reads commas or spaces, drops repeats and the label (R27)', () => {
  assert.deepEqual(sb.parseSkillNames('AETHER-SKILLS: erebus-ui, patron-api'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames('Skills: erebus-ui patron-api erebus-ui'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames('erebus-ui,patron-api'), ['erebus-ui', 'patron-api'])
  assert.deepEqual(sb.parseSkillNames(''), [])
  assert.deepEqual(sb.parseSkillNames('AETHER-SKILLS:'), [])
})

test('resolveSkill looks in the project, then the personal folders, then Aether, and refuses a name that leaves the folder (R27)', (t) => {
  const w = world(t)
  skill(w.repo.dir, 'both', { body: 1 })
  skill(w.repo.dir, 'both', { body: 2, where: '.claude/skills' })
  skill(w.home, 'both', { body: 3 })
  skill(w.home, 'personal', { where: '.claude/skills' })
  skill(w.plugin, 'tidy', { where: 'skills' })
  assert.equal(sb.resolveSkill('both', w.opts).dir, path.join(w.repo.dir, '.agents', 'skills', 'both'))
  assert.equal(sb.resolveSkill('personal', w.opts).dir, path.join(w.home, '.claude', 'skills', 'personal'))
  assert.equal(sb.resolveSkill('aether:tidy', w.opts).dir, path.join(w.plugin, 'skills', 'tidy'))
  assert.equal(sb.resolveSkill('tidy', w.opts).dir, path.join(w.plugin, 'skills', 'tidy'))
  for (const bad of ['nope', '../x', 'a/b', '', '..']) assert.equal(sb.resolveSkill(bad, w.opts), null, bad)
})

test('loadSkills gives the content of 0, 1 and 3 skills, and says the problem of 4, of one that does not exist and of one that is too big (C10, H3 scenario 23)', (t) => {
  const w = world(t)
  for (const name of ['one', 'two', 'three', 'four']) skill(w.repo.dir, name)
  skill(w.repo.dir, 'big', { body: 600 })
  assert.deepEqual(sb.loadSkills([], w.opts), { ok: true, skills: [] })
  const one = sb.loadSkills(['one'], w.opts)
  assert.equal(one.ok, true)
  assert.ok(one.skills[0].text.includes('rule 1 of one') && one.skills[0].lines >= 6)
  assert.equal(sb.loadSkills(['one', 'two', 'three'], w.opts).skills.length, 3)
  assert.deepEqual(sb.loadSkills(['one', 'two', 'three', 'four'], w.opts), { ok: false, error: 'too many skills: 4 (at most 3)' })
  assert.deepEqual(sb.loadSkills(['one', 'ghost'], w.opts), { ok: false, error: 'skill "ghost" does not exist' })
  const big = sb.loadSkills(['big'], w.opts)
  assert.equal(big.ok, false)
  assert.match(big.error, /^skill "big" is invalid: SKILL\.md has 60\d lines \(at most 500\)$/)
})

test('three skills of 500 lines are over the total that is pasted, and an invalid name or description is refused, never cut (A7, C10)', (t) => {
  const w = world(t)
  for (const name of ['a1', 'a2', 'a3']) skill(w.repo.dir, name, { body: 496 })
  const over = sb.loadSkills(['a1', 'a2', 'a3'], w.opts)
  assert.equal(over.ok, false)
  assert.match(over.error, /^the skills total \d+ lines \(at most 1500\)$/)
  for (const name of ['b1', 'b2', 'b3']) skill(w.repo.dir, name, { body: 480 })
  assert.equal(sb.loadSkills(['b1', 'b2', 'b3'], w.opts).ok, true)
  skill(w.repo.dir, 'Bad_Name', { frontName: 'Bad_Name' })
  assert.match(sb.loadSkills(['Bad_Name'], w.opts).error, /is invalid: the name "Bad_Name" is not lowercase letters, digits and dashes of at most 64 characters/)
  skill(w.repo.dir, 'wrong', { frontName: 'other-name' })
  assert.match(sb.loadSkills(['wrong'], w.opts).error, /is invalid: the name "other-name" is not the name of its folder "wrong"/)
  skill(w.repo.dir, 'nodesc', { description: null })
  assert.match(sb.loadSkills(['nodesc'], w.opts).error, /is invalid: no description/)
  skill(w.repo.dir, 'longdesc', { description: 'd'.repeat(1025) })
  assert.match(sb.loadSkills(['longdesc'], w.opts).error, /is invalid: the description has 1025 characters \(at most 1024\)/)
})

test('checkSkillFile lists every problem of a skill, and nothing for a good one (R32)', (t) => {
  const w = world(t)
  assert.deepEqual(sb.checkSkillFile(skill(w.repo.dir, 'good')), [])
  const bad = sb.checkSkillFile(skill(w.repo.dir, 'bad', { body: 600, description: null, frontName: 'Other' }))
  assert.equal(bad.length, 4)
})

test('skillsSection pastes each skill under its own heading, and nothing without skills (R27)', () => {
  assert.equal(sb.skillsSection([]), '')
  const text = sb.skillsSection([{ name: 'erebus-ui', text: 'RULES A\n' }, { name: 'patron-api', text: 'RULES B' }])
  assert.equal(text, '## Skills for this task\n\n### erebus-ui\n\nRULES A\n\n### patron-api\n\nRULES B\n\n')
})

test('recordUse only appends one line with the time, the session, the kind, the run, the task and the skills (R29)', (t) => {
  const data = tempDir(t, 'aether-data-')
  assert.equal(sb.recordUse(data, { session: 's1', kind: 'run', run: '20261107-120000-abcd', task: 'task-3', skills: ['erebus-ui'], time: 7 }), true)
  assert.equal(sb.recordUse(data, { session: 's1', kind: 'delegate', task: 't1', skills: ['a', 'b'], time: 8 }), true)
  const lines = fs.readFileSync(sb.usesFile(data), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(lines, [
    { time: 7, session: 's1', kind: 'run', run: '20261107-120000-abcd', task: 'task-3', skills: ['erebus-ui'], repo: null },
    { time: 8, session: 's1', kind: 'delegate', run: null, task: 't1', skills: ['a', 'b'], repo: null },
  ])
})

test('listProjectSkills, formatProjectSkills and matchDelegateSkills discover and match project skills without a model (R8, R15, C4, C7)', (t) => {
  const dir = tempDir(t, 'aether-proj-skills-')
  const a = path.join(dir, '.agents', 'skills', 'diseno-de-juego')
  const b = path.join(dir, '.claude', 'skills', 'direccion-de-arte')
  fs.mkdirSync(a, { recursive: true })
  fs.mkdirSync(b, { recursive: true })
  fs.writeFileSync(path.join(a, 'SKILL.md'), '---\nname: diseno-de-juego\ndescription: Balance de economia, niveles y combate del juego\n---\nbody\n')
  fs.writeFileSync(path.join(b, 'SKILL.md'), '---\nname: direccion-de-arte\ndescription: Paleta, tipografia y composicion visual\n---\nbody\n')

  const skills = sb.listProjectSkills(dir)
  assert.deepEqual(skills.map((s) => s.name), ['direccion-de-arte', 'diseno-de-juego'])
  assert.equal(
    sb.formatProjectSkills(skills),
    [
      '## Project skills',
      '',
      'Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):',
      '- `direccion-de-arte`: Paleta, tipografia y composicion visual',
      '- `diseno-de-juego`: Balance de economia, niveles y combate del juego',
    ].join('\n'),
  )
  assert.equal(sb.formatProjectSkills([]), '')
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Ajusta el balance de economia y combate del juego', description: 'balance', owns: ['src/game.js'] }),
    ['diseno-de-juego'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Actualiza el parser de JSON', description: 'parser', owns: ['src/json.js'] }),
    [],
  )
})

test('listProjectSkills prefers .agents over .claude and falls back to the directory name', (t) => {
  const dir = tempDir(t, 'aether-proj-list-')
  assert.deepEqual(sb.listProjectSkills(dir), [])
  skill(dir, 'shared-skill', { body: 1, description: 'Desde agents' })
  skill(dir, 'shared-skill', { body: 1, description: 'Desde claude', where: '.claude/skills' })
  skill(dir, 'solo-claude', { body: 1, description: 'Solo en claude', where: '.claude/skills' })
  const fallback = path.join(dir, '.agents', 'skills', 'folder-name')
  fs.mkdirSync(fallback, { recursive: true })
  fs.writeFileSync(path.join(fallback, 'SKILL.md'), '---\ndescription: Sin nombre en el frente\n---\nbody\n')
  fs.writeFileSync(path.join(dir, '.agents', 'skills', 'not-a-skill.txt'), 'nope\n')
  fs.mkdirSync(path.join(dir, '.agents', 'skills', 'empty-dir'), { recursive: true })

  assert.deepEqual(sb.listProjectSkills(dir), [
    { name: 'folder-name', description: 'Sin nombre en el frente' },
    { name: 'shared-skill', description: 'Desde agents' },
    { name: 'solo-claude', description: 'Solo en claude' },
  ])
})

test('matchDelegateSkills matches the full name, every long kebab part, and owns paths', (t) => {
  const dir = tempDir(t, 'aether-proj-match-')
  skill(dir, 'ui-kit', { body: 1, description: 'Hud' })
  skill(dir, 'audio-fx', { body: 1, description: 'Volumen' })
  skill(dir, 'save-game', { body: 1, description: 'Persistencia' })

  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Monta ui-kit en el menu', description: '', owns: [] }),
    ['ui-kit'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Ajusta el audio del trailer', description: '', owns: [] }),
    [],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Ajusta el audio y los fx del trailer', description: '', owns: [] }),
    ['audio-fx'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Ajusta el volumen', description: '', owns: [] }),
    [],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Revisa el modulo', description: 'modulo', owns: ['src/save-game/store.js'] }),
    ['save-game'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Revisa el modulo', description: 'modulo', owns: ['src/save/game/store.js'] }),
    ['save-game'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Revisa el modulo', description: 'modulo', owns: ['src/save/store.js'] }),
    [],
  )
})

test('matchDelegateSkills matches accented kebab names the same way as the brief words', (t) => {
  const dir = tempDir(t, 'aether-proj-accent-')
  skill(dir, 'diseño-web', { body: 1, description: 'Maquetas' })

  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Actualiza el diseño web de la portada', description: '', owns: [] }),
    ['diseño-web'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Usa diseno-web hoy', description: '', owns: [] }),
    ['diseño-web'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Revisa el modulo', description: 'modulo', owns: ['src/diseño/paginas/web.js'] }),
    ['diseño-web'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Revisa la web', description: '', owns: [] }),
    [],
  )
})

test('project skills read quoted and block frontmatter values for discovery, formatting and matching', (t) => {
  const dir = tempDir(t, 'aether-proj-frontmatter-')
  function write(folder, name, front) {
    const target = path.join(dir, folder, 'skills', name)
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'SKILL.md'), `---\n${front}\n---\nbody\n`)
  }
  write('.agents', 'ui-kit', 'name: "ui-kit"\ndescription: "Build \\"visual\\" components"')
  write('.claude', 'duplicate', 'name: ui-kit\ndescription: Wrong duplicate')
  write('.claude', 'game-design', "name: 'game-design'\ndescription: >-\n  Balance the economy\n  and combat systems")
  write('.agents', 'notes', "name: 'notes'\ndescription: 'Owner''s notes: useful # text'")
  write('.agents', 'literal', 'name: literal\ndescription: |2-\n  First line\n  Second line')
  write('.agents', 'paragraphs', 'name: paragraphs\ndescription: >-\n  First paragraph\n\n  Second paragraph')
  const skills = sb.listProjectSkills(dir)
  assert.deepEqual(skills, [
    { name: 'game-design', description: 'Balance the economy and combat systems' },
    { name: 'literal', description: 'First line\nSecond line' },
    { name: 'notes', description: "Owner's notes: useful # text" },
    { name: 'paragraphs', description: 'First paragraph\nSecond paragraph' },
    { name: 'ui-kit', description: 'Build "visual" components' },
  ])
  assert.equal(sb.formatProjectSkills(skills), [
    '## Project skills', '',
    'Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):',
    '- `game-design`: Balance the economy and combat systems',
    '- `literal`: First line Second line',
    "- `notes`: Owner's notes: useful # text",
    '- `paragraphs`: First paragraph Second paragraph',
    '- `ui-kit`: Build "visual" components',
  ].join('\n'))
  assert.deepEqual(sb.matchDelegateSkills(dir, { prompt: 'Use ui-kit' }), ['ui-kit'])
  assert.deepEqual(sb.matchDelegateSkills(dir, { prompt: 'Improve economy and combat' }), ['game-design'])
})

for (const [label, quote] of [['single', "'"], ['double', '"']]) {
  test(`project skills read multiline ${label}-quoted descriptions for discovery, formatting and matching`, (t) => {
    const dir = tempDir(t, 'aether-proj-multiline-')
    skill(dir, 'guide', {
      frontName: `${quote}guide${quote}`,
      description: `${quote}Balance the\n  economy and combat\n  systems${quote} # project description`,
    })
    skill(dir, 'duplicate', { frontName: 'guide', description: 'Wrong duplicate', where: '.claude/skills' })

    const skills = sb.listProjectSkills(dir)
    assert.deepEqual(skills, [{ name: 'guide', description: 'Balance the economy and combat systems' }])
    assert.equal(sb.formatProjectSkills(skills), [
      '## Project skills', '',
      'Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):',
      '- `guide`: Balance the economy and combat systems',
    ].join('\n'))
    assert.deepEqual(sb.matchDelegateSkills(dir, { prompt: 'Adjust economy and combat' }), ['guide'])
    assert.deepEqual(sb.matchDelegateSkills(dir, { description: 'economy combat' }), ['guide'])
    assert.deepEqual(sb.matchDelegateSkills(dir, { owns: ['src/economy/combat.js'] }), ['guide'])
    assert.deepEqual(sb.matchDelegateSkills(dir, { prompt: 'Adjust economy' }), [])
  })
}

test('multiline quoted frontmatter folds whitespace and blank lines and preserves escapes', (t) => {
  const dir = tempDir(t, 'aether-proj-quoted-folding-')
  skill(dir, 'single-flow', { description: "'Owner''s \t\n  economy and combat\n\n   systems: # retained' # comment" })
  skill(dir, 'double-flow', { description: '"Balance the \t\n  \\"economy\\" and combat\n\n   systems" # comment' })
  skill(dir, 'escaped-flow', {
    frontName: ['"escaped-\\', '  flow"'].join('\n'),
    description: ['"Balance the econo\\', '  my and com\\', '  bat systems"'].join('\n'),
  })
  skill(dir, 'backslash-flow', { description: ['"Path \\\\', '  economy and combat"'].join('\n') })
  skill(dir, 'space-flow', { description: ['"Balance\\ ', '  economy and combat"'].join('\n') })

  assert.deepEqual(sb.listProjectSkills(dir), [
    { name: 'backslash-flow', description: 'Path \\ economy and combat' },
    { name: 'double-flow', description: 'Balance the "economy" and combat\nsystems' },
    { name: 'escaped-flow', description: 'Balance the economy and combat systems' },
    { name: 'single-flow', description: "Owner's economy and combat\nsystems: # retained" },
    { name: 'space-flow', description: 'Balance  economy and combat' },
  ])
  assert.deepEqual(sb.matchDelegateSkills(dir, { prompt: 'Adjust economy and combat' }), [
    'backslash-flow', 'double-flow', 'escaped-flow', 'single-flow', 'space-flow',
  ])
})

test('function words of skill descriptions do not make a skill match an unrelated brief', (t) => {
  const dir = tempDir(t, 'aether-proj-stopwords-')
  skill(dir, 'writing-node-tests', { body: 1, description: 'Use when writing tests with node:test in this repository' })
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Fix the parser so it handles empty input with this format', description: '', owns: [] }),
    [],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Write node tests for the parser', description: '', owns: [] }),
    ['writing-node-tests'],
  )
})

test('a skill still matches a brief that shares two real topic words with it', (t) => {
  const dir = tempDir(t, 'aether-proj-topic-')
  skill(dir, 'godot-scenes', { body: 1, description: 'Build Godot scenes and signals for the player' })
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Add a jump signal to the Godot player scene', description: '', owns: [] }),
    ['godot-scenes'],
  )
})

test('the stop words are data: a word listed in the config that AETHER_SKILLS_CONFIG names is ignored', (t) => {
  const dir = tempDir(t, 'aether-proj-stopcfg-')
  const cfgDir = tempDir(t, 'aether-skills-stopcfg-')
  const file = path.join(cfgDir, 'skills.json')
  const bundled = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'skills.json'), 'utf8'))
  fs.writeFileSync(file, JSON.stringify({ ...bundled, stopWords: ['godot'] }))
  skill(dir, 'godot-scenes', { body: 1, description: 'Build Godot scenes and signals for the player' })
  const previous = process.env.AETHER_SKILLS_CONFIG
  process.env.AETHER_SKILLS_CONFIG = file
  t.after(() => {
    if (previous === undefined) delete process.env.AETHER_SKILLS_CONFIG
    else process.env.AETHER_SKILLS_CONFIG = previous
  })
  assert.deepEqual(
    sb.matchDelegateSkills(dir, { prompt: 'Add a jump signal to the Godot player scene', description: '', owns: [] }),
    [],
  )
})

test('project skills with real descriptions do not match unrelated briefs and do match relevant briefs', (t) => {
  const dir = tempDir(t, 'aether-proj-real-')
  const realSkillsDir = path.join(__dirname, '..', '.agents', 'skills')
  for (const name of ['artificial-analysis', 'new-harness', 'pxl']) {
    const src = path.join(realSkillsDir, name, 'SKILL.md')
    const destDir = path.join(dir, '.agents', 'skills', name)
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(src, path.join(destDir, 'SKILL.md'))
  }
  skill(dir, 'art', { body: 1, description: 'Draw vector art assets' })

  assert.deepEqual(
    sb.matchDelegateSkills(dir, {
      prompt: 'AETHER-TASK: t-approve\nImplement aether-delegate approve check in plugins/aether/lib/delegate-approve.js.',
      description: 'delegate approve',
      owns: ['plugins/aether/lib/delegate-approve.js'],
    }),
    [],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, {
      prompt: 'AETHER-TASK: t-ceiling\nEnforce the dollar ceiling of a run in plugins/aether/lib/autonomy-command.js.',
      description: 'dollar ceiling',
      owns: ['plugins/aether/lib/autonomy-command.js'],
    }),
    [],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, {
      prompt: 'AETHER-TASK: t-quota\nClear expired quota marks in plugins/aether/lib/router-marks.js.',
      description: 'quota mark',
      owns: ['plugins/aether/lib/router-marks.js'],
    }),
    [],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, {
      prompt: 'AETHER-TASK: t-start\nStart the article parser in src/article.js.',
      description: 'start article',
      owns: ['src/article.js'],
    }),
    [],
  )

  assert.deepEqual(
    sb.matchDelegateSkills(dir, {
      prompt: 'Compare model intelligence, cost per task, and benchmark figures from Artificial Analysis pages.',
      description: 'artificial analysis figures',
      owns: ['scripts/aa-pages.js'],
    }),
    ['artificial-analysis'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, {
      prompt: 'Add a new external coding CLI harness, map its tiers, cost per task, and quota.',
      description: 'new harness',
      owns: ['plugins/aether/lib/harness/grok.js'],
    }),
    ['new-harness'],
  )
  assert.deepEqual(
    sb.matchDelegateSkills(dir, {
      prompt: 'Edit the animation in walk.px.js and build the GIF for the landing page.',
      description: 'pxl animation',
      owns: ['assets/brand/gifs/walk.px.js'],
    }),
    ['pxl'],
  )
  // The Lead's stop-word decision (spec 045): codex, models, quota, harness,
  // muse and grok name the plugin's own vocabulary, so a brief that shares
  // only those words with new-harness (here just tiers remains) does not match.
  assert.deepEqual(
    sb.matchDelegateSkills(dir, {
      prompt: 'Map the Codex CLI models, tiers and quota.',
      description: 'codex models',
      owns: ['src/codex.js'],
    }),
    [],
  )
})

test('plain multi-line frontmatter values are read completely', (t) => {
  const dir = tempDir(t, 'aether-proj-plain-multiline-')
  skill(dir, 'plain-multi', {
    description: 'First line of plain\n  second line with economy and combat\n  third line',
  })
  const skills = sb.listProjectSkills(dir)
  assert.deepEqual(skills, [
    { name: 'plain-multi', description: 'First line of plain second line with economy and combat third line' },
  ])
  assert.deepEqual(sb.matchDelegateSkills(dir, { prompt: 'Adjust economy and combat' }), ['plain-multi'])
})

test('listProjectSkills looks in the same project roots as resolveSkill and handles symlinks once', (t) => {
  const repo = makeRepo(t)
  skill(repo.dir, 'shared-skill', { body: 1, description: 'From agents' })
  const claudeDir = path.join(repo.dir, '.claude', 'skills')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'shared-skill'), path.join(claudeDir, 'shared-skill'))
  const external = tempDir(t, 'aether-ext-skill-')
  fs.writeFileSync(path.join(external, 'SKILL.md'), '---\nname: linked-only\ndescription: Linked into claude\n---\nbody\n')
  fs.symlinkSync(external, path.join(claudeDir, 'linked-only'))
  repo.git('add', '.agents', '.claude')
  repo.git('commit', '-qm', 'skills')

  const sub = path.join(repo.dir, 'src', 'nested')
  fs.mkdirSync(sub, { recursive: true })
  assert.deepEqual(sb.listProjectSkills(sub).map((s) => s.name), ['linked-only', 'shared-skill'])

  const wt = path.join(repo.dir, '.aether', 'worktrees', 'wt-skills')
  repo.git('worktree', 'add', '-qb', 'wt-skills', wt)
  assert.deepEqual(sb.listProjectSkills(wt).map((s) => s.name), ['linked-only', 'shared-skill'])
})

test('checkSkillFile accepts valid multi-line frontmatter and refuses invalid descriptions', (t) => {
  const dir = tempDir(t, 'aether-check-front-')
  const good = skill(dir, 'valid-multi', {
    description: 'First line\n  second line with details',
  })
  assert.deepEqual(sb.checkSkillFile(good), [])

  const tooLong = skill(dir, 'too-long', {
    description: 'a '.repeat(300) + '\n  ' + 'b '.repeat(300),
  })
  const problems = sb.checkSkillFile(tooLong)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /the description has \d+ characters \(at most 1024\)/)

  const commentOnly = skill(dir, 'comment-only', { description: '# just a comment' })
  assert.deepEqual(sb.checkSkillFile(commentOnly), ['no description'])
})
