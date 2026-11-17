'use strict'

// The plugin's skills against the rules by which Claude Code loads and lists a skill.
//
// The rules come from the Claude Code profile of NVIDIA SkillEvaluator
// (src/skillevaluator/harness/profiles/claude-code.yaml, commit cbda65c), which its authors verified on Claude Code
// 2.1.316 on 2026-11-01 with captured canary probes. Only the rules that a static read of plugins/aether/skills/ can
// hold are here, each with its id in that profile:
//   CC-CASING        the file is SKILL.md in exactly that casing; another casing loads on macOS and not on Linux.
//   CC-DESC-MISSING  the frontmatter has a non-empty string description; without one Claude Code lists body text.
//   CC-DESC-CUT      description and when_to_use together are at most 1,536 characters; the listing cuts the rest.
//   CC-LIST-BUDGET   the descriptions of the skills of one folder fit 8,000 characters, the budget of the skill list
//                    when the context window is unknown; past it every description is shortened.
//   CC-DOLLAR-N      no $ followed by a digit in the body: Claude Code reads $N as the Nth argument of an invocation,
//                    so $4.00 becomes the fifth argument followed by .00 when the skill is invoked with five or more.
//   CC-DUP-KEY       no frontmatter key twice; Claude Code keeps the last value and other harnesses drop the skill.
//   CC-PRECEDENCE    no two skills with the same name; only one of them is used.
// The name is also the folder's name: Claude Code invokes a plugin skill by its folder (aether:<folder>).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SKILLS = path.join(__dirname, '..', 'plugins', 'aether', 'skills')
const DESCRIPTION_CUT = 1536
const LIST_BUDGET = 8000

// The frontmatter as Claude Code needs it here: top-level keys, plain or quoted scalars and folded or literal blocks.
// Every skill of the plugin keeps to that subset; a key in another form is read as its raw text.
function frontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { keys: [], fields: {}, body: text, bodyStart: 1 }
  const lines = match[1].split(/\r?\n/)
  const keys = []
  const fields = {}
  for (let i = 0; i < lines.length; i++) {
    const field = lines[i].match(/^([A-Za-z_][\w-]*):(?:\s+(.*))?$/)
    if (!field) continue
    const key = field[1]
    let value = (field[2] || '').trim()
    keys.push(key)
    if (/^[|>][+-]?$/.test(value)) {
      const block = []
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].trim())
      value = value[0] === '|' ? block.join('\n') : block.filter(Boolean).join(' ')
    } else if (/^"(?:[^"\\]|\\.)*"$/.test(value)) {
      value = JSON.parse(value)
    } else if (/^'(?:[^']|'')*'$/.test(value)) {
      value = value.slice(1, -1).replace(/''/g, "'")
    }
    fields[key] = value
  }
  return { keys, fields, body: text.slice(match[0].length), bodyStart: match[0].split('\n').length }
}

function skills() {
  return fs.readdirSync(SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(SKILLS, entry.name)
      const files = fs.readdirSync(dir)
      const file = files.find((name) => name.toLowerCase() === 'skill.md')
      const text = file ? fs.readFileSync(path.join(dir, file), 'utf8') : ''
      return { folder: entry.name, file, ...frontMatter(text) }
    })
}

const chars = (text) => [...text].length

test('every skill folder holds SKILL.md in exactly that casing (CC-CASING)', () => {
  const all = skills()
  assert.ok(all.length > 0, 'plugins/aether/skills/ has skills')
  for (const skill of all) assert.equal(skill.file, 'SKILL.md', `${skill.folder}/ holds ${skill.file || 'no SKILL.md'}`)
})

test('every skill has a non-empty string description and its folder as its name (CC-DESC-MISSING)', () => {
  for (const skill of skills()) {
    assert.equal(typeof skill.fields.description, 'string', `${skill.folder}: description`)
    assert.ok(skill.fields.description.trim().length > 0, `${skill.folder}: the description is empty`)
    assert.equal(skill.fields.name, skill.folder, `${skill.folder}: name`)
  }
})

test('description and when_to_use together stay within the 1,536 characters of the listing (CC-DESC-CUT)', () => {
  for (const skill of skills()) {
    const listed = [skill.fields.description, skill.fields.when_to_use].filter(Boolean).join(' ')
    assert.ok(chars(listed) <= DESCRIPTION_CUT, `${skill.folder}: ${chars(listed)} characters, over ${DESCRIPTION_CUT}`)
  }
})

test('the descriptions of all the skills fit the 8,000 characters of the skill list (CC-LIST-BUDGET)', () => {
  const total = skills().reduce((sum, skill) => sum + chars(skill.fields.description || ''), 0)
  assert.ok(total <= LIST_BUDGET, `${total} description characters, over ${LIST_BUDGET}`)
})

test('no body has a $ followed by a digit, which Claude Code reads as an argument (CC-DOLLAR-N)', () => {
  const found = []
  for (const skill of skills()) {
    skill.body.split('\n').forEach((line, index) => {
      if (/\$\d/.test(line)) found.push(`skills/${skill.folder}/SKILL.md:${skill.bodyStart + index}: ${line.trim()}`)
    })
  }
  assert.deepEqual(found, [], 'write an amount as USD 4.00, not with a dollar sign')
})

test('no frontmatter repeats a key (CC-DUP-KEY)', () => {
  for (const skill of skills()) {
    const repeated = skill.keys.filter((key, index) => skill.keys.indexOf(key) !== index)
    assert.deepEqual(repeated, [], `${skill.folder}: repeated keys`)
  }
})

test('no two skills share a name (CC-PRECEDENCE)', () => {
  const names = skills().map((skill) => skill.fields.name)
  assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), [])
})

test('the frontmatter reader reads the forms the skills use', () => {
  const read = frontMatter([
    '---',
    'name: one',
    'description: "Quoted: with a colon"',
    "when_to_use: 'it''s single'",
    'folded: >',
    '  first',
    '  second',
    'name: two',
    '---',
    'body $1',
  ].join('\n'))
  assert.deepEqual(read.keys, ['name', 'description', 'when_to_use', 'folded', 'name'])
  assert.equal(read.fields.description, 'Quoted: with a colon')
  assert.equal(read.fields.when_to_use, "it's single")
  assert.equal(read.fields.folded, 'first second')
  assert.equal(read.fields.name, 'two')
  assert.equal(read.body, 'body $1')
  assert.equal(read.bodyStart, 10)
})
