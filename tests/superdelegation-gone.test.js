'use strict'

// Spec 009, R20 and R19: what the plan lists as gone (plan.md, D14) is gone from the plugin and the scripts,
// and the swarm and the design reach the one choice function.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const FILES = (dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !e.parentPath.includes('node_modules')).map((e) => path.join(e.parentPath, e.name))
const SOURCE = [...FILES('plugins/aether'), ...FILES('scripts')].filter((file) => /\.(js|mjs|jsx|json|md)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file) && !file.includes(`${path.sep}.claude-plugin${path.sep}types`))
const text = new Map(SOURCE.map((file) => [file, fs.readFileSync(file, 'utf8')]))
const found = (pattern, keep = () => true) => [...text].filter(([file, body]) => keep(path.relative(ROOT, file)) && pattern.test(body)).map(([file]) => path.relative(ROOT, file))

// `aether-report --seats` stays: it is the report's own seats mode (it prices a design's seats), not the retired
// seats option. The flag is kept where a line names it after `aether-report `, and in the two files that are the
// bin and its lib. Every other `--seats`, and `AETHER_SEATS`, is the retired option and is still searched for.
const REPORT_SEATS_FILES = ['plugins/aether/bin/aether-report', 'plugins/aether/lib/report.js']
const SEATS_FLAG = /\bAETHER_SEATS\b|(?<!aether-report )--seats\b/
const notReportSeats = (file) => !REPORT_SEATS_FILES.includes(file)

// R20: what the plan lists as gone (plan.md, D14), by name. [pattern, what, which files to search].
const GONE = [
  [/\bEXTERNAL_EFFORT\b/, 'the hand-written effort of an external round'],
  [/\bdesignSeats\b/, 'the seat profiles of the lane table'],
  [/\bSEAT_CHOICES\b|\bDEFAULT_SEATS\b|\bseatsChoice\b|\bseatList\b|\bvalidateSeats\b/, 'the seat profiles in code'],
  [SEATS_FLAG, 'the seats variable and flag', notReportSeats],
  [/\bAETHER_LANES\b(?!_CONFIG)/, 'the old lanes variable'],
  [/\bnativeRevision\b|with no seat round/, 'the native correction by rule'],
  [/\bgroupViews\b|\breadQuota\b|\bexclusionOf\b|\bdryInRun\b|\bunavailableOutcome\b/, 'the second quota rule of the swarm'],
  [/\blaneWalk\b|effort === 'max'\) return null|!lanes \|\| effort === 'max'/, 'the fixed rule for max'],
  [/\blanesEnabled\b|\blanesArgs\b|\blaneFor\b|\borderCandidates\b|\bcandidatesOf\b/, 'the old lane arguments and order'],
  [/aether-lane choice\b/, 'the choice command'],
  [/\blogChoice\b|\bchoiceLogs\b|\bcandidatesFor\b|\bplannedLanes\b|\bnotInstalled\b/, 'the old workflow lane helpers'],
]

for (const [pattern, what, keep] of GONE) {
  test(`R20: ${what} is gone from the plugin and the scripts`, () => {
    assert.deepEqual(found(pattern, keep), [], `${pattern} is still in these files`)
  })
}

test('R20: the report keeps its seats mode, and only that, of the --seats flag', () => {
  assert.ok(found(/(?<=aether-report )--seats\b/).length > 0, 'aether-report --seats is named nowhere')
  for (const file of REPORT_SEATS_FILES) assert.ok(text.has(path.join(ROOT, file)) || fs.existsSync(path.join(ROOT, file)), `${file} is missing`)
})

test('R20: the retired seats profiles are not a value of the seats option', () => {
  // The plain word `robust` stays (the RADAR goal and the report's radar.robust key), and so do the sentences
  // that tell the owner the profiles no longer exist. What is gone is a profile given as a value of seats:
  // `seats: 'balanced'`, `AETHER_SEATS=robust`, `--seats robust`.
  const profile = /\b(?:seats|AETHER_SEATS|CLAUDE_PLUGIN_OPTION_SEATS|--seats)["']?\s*(?:[:=]|\s)\s*["']?(?:robust|balanced)\b/i
  assert.deepEqual(found(profile), [], 'a seats profile is still given as a value in these files')
})

test('R20: no file of the plugin config, lib or workflows, nor of scripts, names the replaces field of the lane table', () => {
  const field = /"replaces"\s*:|\.replaces\b|\breplaces\s*:/
  const scope = /^(plugins\/aether\/(config|lib|workflows)|scripts)\//
  assert.deepEqual(found(field).filter((file) => scope.test(file)), [], 'the replaces field is still in these files')
})

test('R20: the lane table has no hand-written level map', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/config/lanes.json'), 'utf8'))
  for (const harness of Object.values(config.harnesses)) for (const model of Object.values(harness.models)) for (const gone of ['levels', 'replaces']) assert.equal(Object.hasOwn(model, gone), false, gone)
  assert.equal(Object.hasOwn(config, 'designSeats'), false)
})

test('R19: the swarm, the design, the router and the editing delegates all reach the one choice function, and none has a rule of its own', () => {
  const lanePick = text.get(path.join(ROOT, 'plugins/aether/lib/lane-pick.js'))
  const seats = text.get(path.join(ROOT, 'plugins/aether/lib/seats.js'))
  assert.match(lanePick, /require\('\.\/superdelegation\.js'\)/)
  assert.match(seats, /require\('\.\/superdelegation\.js'\)/)
  assert.match(text.get(path.join(ROOT, 'plugins/aether/lib/router-pick.js')), /require\('\.\/superdelegation\.js'\)/)
  const callers = found(/\bchoose\(/).filter((file) => file.startsWith('plugins/'))
  assert.deepEqual(callers.sort(), ['plugins/aether/lib/lane-delegate.js', 'plugins/aether/lib/lane-pick.js', 'plugins/aether/lib/router-pick.js', 'plugins/aether/lib/seats.js', 'plugins/aether/lib/superdelegation.js'])
})
