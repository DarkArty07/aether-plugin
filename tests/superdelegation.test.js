'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { choose, enabled, resolveOption, runArgs, idleHarnesses, TOLERANCE_POINTS } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const { pairs } = loadPairs()
const DAY = 24 * 3600 * 1000
const at = (days) => new Date(Date.UTC(2026, 9, 20) + days * DAY).toISOString()
const open = (days) => ({ usable: true, unknown: false, mark: null, resetsAt: days === null ? null : at(days) })
const dry = { usable: false, unknown: false, mark: null, resetsAt: at(1) }
// agy's Argon and Flash read the one «Gemini Models» window, so `gemini` sets both keys; `argon` or `flash` sets one.
const world = ({ gemini = open(2), argon = gemini, flash = gemini, claude = open(3), grok = open(1) } = {}) => ({
  agy: { installed: true, groups: { argon, flash, claude } },
  grok: { installed: true, groups: { grok } },
})
const ask = (model, effort, more = {}) => choose({ pairs, reference: { model, effort }, harnesses: world(), ...more })
const why = (decision, id) => decision.candidates.find((c) => c.id === id).why
const pickedId = (decision) => (decision.picked ? decision.picked.id : null)

// A small table for the borders: native haiku, sonnet and opus at high, and the externals a test adds.
const row = (id, over = {}) => {
  const [harness, rest] = id.split('/')
  const [model, effort] = rest.split('@')
  return { id, harness, model, family: over.family ?? model, effort, group: harness === 'claude' ? null : (over.group ?? harness), intelligence: 40, costPerTaskUsd: 1, outputTokensPerSecond: 100, timeToFirstTokenS: 1, ...over }
}
const natives = (haiku = 37.8, sonnet = 46.8, opus = 53.6) => [
  row('claude/haiku@high', { family: 'claude-haiku-5-5', intelligence: haiku, costPerTaskUsd: 0.08 }),
  row('claude/sonnet@high', { family: 'claude-sonnet-5-5', intelligence: sonnet, costPerTaskUsd: 0.88 }),
  row('claude/opus@high', { family: 'claude-opus-5-5', intelligence: opus, costPerTaskUsd: 1.82 }),
]
const only = (...names) => Object.fromEntries(names.map((name) => [name, { installed: true, groups: { [name]: open(1) } }]))

const MUSE = 'muse/muse-wonder-full-1.0@high'
const onlyMuse = (days = 2) => ({ muse: { installed: true, groups: { muse: open(days) } } })
const withMuse = (days, base = world()) => ({ ...base, ...onlyMuse(days) })

test('C4: a call asks for the points of its reference pair, never for a model name alone', () => {
  assert.equal(ask('sonnet', 'xhigh').requested, 51.9)
  assert.equal(ask('sonnet', 'high').requested, 46.8)
  assert.equal(ask('haiku', 'high').reference.id, 'claude/haiku@high')
  assert.equal(ask('opus', 'max').requested, 57.6)
  assert.throws(() => choose({ pairs, reference: { model: 'gpt', effort: 'high' }, harnesses: world() }), /no reference pair/)
  assert.equal(TOLERANCE_POINTS, 1)
})

test('E2: a Haiku high call takes the cheapest pair of the quota that renews first', () => {
  const d = ask('haiku', 'high')
  assert.equal(pickedId(d), 'grok/grok-4.7@low')
  assert.equal(d.candidates[0].id, 'grok/grok-4.7@low')
  assert.deepEqual([d.candidates[0].outcome, d.candidates[0].rank], ['picked', 1])
  assert.match(d.reason, /grok\/grok-4\.7@low/)
  assert.equal(d.native.id, 'claude/haiku@high')
  // With grok dry, the next quota to renew is gemini, and its cheapest pair that reaches 36.8 is Flash medium (39.8).
  const next = ask('haiku', 'high', { harnesses: world({ grok: dry }) })
  assert.equal(pickedId(next), 'agy/gemini-3.8-flash@medium')
  assert.equal(why(next, 'grok/grok-4.7@low'), 'dry')
})

test('issue 038: a refusal of Argon leaves Flash usable in the choice, and a refusal of Flash leaves Argon, with the pairs of the shipped table', () => {
  const held = { usable: false, unknown: false, mark: { reason: 'quota refusal' }, resetsAt: at(2) }
  const alone = { grok: dry, claude: dry }
  const states = (decision, name) => decision.candidates.filter((c) => c.id.startsWith(`agy/${name}`)).map((c) => c.outcome === 'picked' ? 'picked' : c.why)

  // Only the Gemini window is healthy. Argon is held: Flash medium, the cheapest pair that reaches Haiku high, takes the call.
  const argonHeld = ask('haiku', 'high', { harnesses: world({ ...alone, argon: held }) })
  assert.equal(pickedId(argonHeld), 'agy/gemini-3.8-flash@medium')
  assert.deepEqual(states(argonHeld, 'gemini-4-argon'), ['dry'])
  assert.ok(!states(argonHeld, 'gemini-3.8-flash').includes('dry'))

  // Flash is held: no Flash pair is a candidate, and Argon takes a call that Flash could not reach anyway.
  const flashHeld = ask('sonnet', 'xhigh', { harnesses: world({ ...alone, flash: held }) })
  assert.equal(pickedId(flashHeld), 'agy/gemini-4-argon@high')
  assert.ok(states(flashHeld, 'gemini-3.8-flash').every((why) => why === 'dry'))
  assert.equal(pickedId(ask('haiku', 'high', { harnesses: world({ ...alone, flash: held }) })), 'agy/gemini-4-argon@high', 'Flash medium is out, so the cheapest that reaches Haiku high is Argon')

  // Both held: the window is out for both, and with the rest dry nothing leaves Claude.
  assert.equal(ask('haiku', 'high', { harnesses: world({ ...alone, argon: held, flash: held }) }).picked, null)
})

test('E3: with only Grok healthy, a Sonnet xhigh call runs native and nothing is asked of the owner', () => {
  const d = ask('sonnet', 'xhigh', { harnesses: world({ gemini: dry, claude: dry }) })
  assert.equal(d.picked, null)
  assert.equal(d.native.id, 'claude/sonnet@xhigh')
  assert.equal(why(d, 'grok/grok-4.7@high'), 'below')
  assert.equal(why(d, 'grok/grok-4.7@xhigh'), 'below')
  assert.match(d.reason, /native/)
})

test('E4 and C6: the quota that renews first takes the call, at the cheapest pair of that quota, even when the other has a cheaper pair', () => {
  assert.equal(pickedId(ask('sonnet', 'xhigh')), 'agy/gemini-4-argon@high')
  assert.equal(pickedId(ask('sonnet', 'xhigh', { harnesses: world({ claude: open(1) }) })), 'agy/claude-opus-5-5@medium')
  // gemini renews first: Argon (1.99) wins although Opus medium of the other quota costs 1.34.
  assert.equal(pickedId(ask('sonnet', 'xhigh', { harnesses: world({ gemini: open(0), claude: open(1) }) })), 'agy/gemini-4-argon@high')
})

test('C6: Grok, which reaches 46.4, never receives a Sonnet xhigh or an Opus call, even when its quota renews first', () => {
  const harnesses = world({ grok: open(-5) })
  for (const [model, effort] of [['sonnet', 'xhigh'], ['sonnet', 'max'], ['opus', 'high'], ['opus', 'xhigh'], ['opus', 'max']]) {
    const d = ask(model, effort, { harnesses })
    assert.notEqual(d.picked && d.picked.harness, 'grok', `${model} ${effort}`)
    for (const c of d.candidates.filter((x) => x.harness === 'grok')) assert.ok(['below', 'dominated'].includes(c.why), `${model} ${effort} ${c.id}`)
  }
})

test('C5: a pair reaches a call at the points asked minus 1, inclusive, and not 0.1 below', () => {
  const table = [...natives(), row('x/a@high', { intelligence: 45.8, costPerTaskUsd: 3 }), row('y/b@high', { intelligence: 45.7, costPerTaskUsd: 0.5 })]
  const d = choose({ pairs: table, reference: { model: 'sonnet', effort: 'high' }, harnesses: only('x', 'y') })
  assert.equal(pickedId(d), 'x/a@high')
  assert.equal(why(d, 'y/b@high'), 'below')
})

test('C5: a pair with no cost per task is never a candidate, and Flash low is one of them', () => {
  const real = ask('haiku', 'low')
  assert.equal(why(real, 'agy/gemini-3.8-flash@low'), 'no-cost')
  const table = [...natives(), row('a/flash@high', { intelligence: 40, costPerTaskUsd: null })]
  const d = choose({ pairs: table, reference: { model: 'haiku', effort: 'high' }, harnesses: only('a') })
  assert.equal(d.picked, null)
  assert.equal(why(d, 'a/flash@high'), 'no-cost')
})

test('C5 and R9: within a quota a pair that gives no more points than a cheaper candidate of the same call is never used: Grok xhigh against Grok high', () => {
  assert.equal(why(ask('sonnet', 'high'), 'grok/grok-4.7@xhigh'), 'dominated')
  // haiku asks 46.8, sonnet 47.4, opus 50.9 in this table.
  const table = [
    ...natives(46.8, 47.4, 50.9),
    row('g/m@high', { intelligence: 46.3, costPerTaskUsd: 2.73 }),
    row('g/m@xhigh', { intelligence: 46.4, costPerTaskUsd: 3.74 }),
    row('g/m@max', { intelligence: 50, costPerTaskUsd: 9 }),
  ]
  const reach = (model, more = {}) => choose({ pairs: table, reference: { model, effort: 'high' }, harnesses: only('g'), ...more })
  // haiku asks 46.8: high (46.3) and xhigh (46.4) are both candidates, high is cheaper and gives at least 46.4 - 1, so it dominates xhigh and wins.
  const haiku = reach('haiku')
  assert.equal(pickedId(haiku), 'g/m@high')
  assert.equal(why(haiku, 'g/m@xhigh'), 'dominated')
  // max gives clearly more points than high, so the cheaper high does not dominate it: it stays as the next candidate.
  assert.equal(why(haiku, 'g/m@max'), null)
  assert.equal(haiku.candidates.find((c) => c.id === 'g/m@max').outcome, 'next')
  // sonnet asks 47.4: only xhigh (46.4) reaches 46.4. High is not a candidate of this call, so it does not dominate xhigh, and xhigh is picked.
  const sonnet = reach('sonnet')
  assert.equal(pickedId(sonnet), 'g/m@xhigh')
  assert.equal(why(sonnet, 'g/m@high'), 'below')
  // opus asks 50.9: only max reaches 49.9.
  assert.equal(pickedId(reach('opus')), 'g/m@max')
  // a retry that excluded high: it no longer dominates, so xhigh is picked for the call that asked 46.8.
  const retry = reach('haiku', { exclude: ['g/m@high'] })
  assert.equal(pickedId(retry), 'g/m@xhigh')
  assert.equal(why(retry, 'g/m@high'), 'excluded')
})

test('C7: changing the speeds of the table changes no choice', () => {
  const faster = pairs.map((p, i) => ({ ...p, outputTokensPerSecond: i % 2 ? 1 : 1000, timeToFirstTokenS: i % 3 ? 300 : 0.1 }))
  for (const model of ['haiku', 'sonnet', 'opus']) {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const a = choose({ pairs, reference: { model, effort }, harnesses: world() })
      const b = choose({ pairs: faster, reference: { model, effort }, harnesses: world() })
      assert.deepEqual([pickedId(a), a.candidates.map((c) => c.id)], [pickedId(b), b.candidates.map((c) => c.id)], `${model} ${effort}`)
    }
  }
})

test('C8: no pair is ever picked below the points asked minus 1, and a Sonnet xhigh call never lands on high', () => {
  const worlds = [world(), world({ gemini: dry }), world({ claude: dry }), world({ grok: dry }), world({ gemini: dry, claude: dry, grok: dry }), world({ gemini: open(null) })]
  for (const harnesses of worlds) {
    for (const model of ['haiku', 'sonnet', 'opus']) {
      for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
        const d = choose({ pairs, reference: { model, effort }, harnesses })
        if (d.picked) assert.ok(Math.round(d.picked.intelligence * 10) >= Math.round(d.requested * 10) - 10, `${model} ${effort} -> ${d.picked.id}`)
        assert.equal(d.native.id, d.reference.id)
      }
    }
  }
  const xhigh = ask('sonnet', 'xhigh')
  assert.ok(xhigh.picked.intelligence >= 50.9)
  assert.equal(ask('opus', 'max').picked, null)
  assert.equal(ask('sonnet', 'max').picked, null)
})

test('C11: with every eligible quota dry the call runs native, in its reference pair; with one dry and one healthy it goes to the healthy', () => {
  const none = ask('sonnet', 'xhigh', { harnesses: world({ gemini: dry, claude: dry, grok: dry }) })
  assert.equal(none.picked, null)
  assert.equal(none.native.id, 'claude/sonnet@xhigh')
  assert.match(none.reason, /dry/)
  assert.equal(pickedId(ask('sonnet', 'xhigh', { harnesses: world({ gemini: dry }) })), 'agy/claude-opus-5-5@medium')
  // a live mark holds a quota as a dry reading does
  const marked = ask('sonnet', 'xhigh', { harnesses: world({ gemini: { usable: true, unknown: false, mark: { until: at(1) }, resetsAt: at(0) } }) })
  assert.equal(why(marked, 'agy/gemini-4-argon@high'), 'dry')
})

test('C16: Muse as the only healthy harness takes a call up to Opus high by the owner decision, and nothing above it', () => {
  const high = ask('opus', 'high', { harnesses: onlyMuse() })
  assert.equal(pickedId(high), MUSE)
  assert.equal(high.requested, 53.6)
  // Sonnet xhigh asks 51.9 (at least 50.9): Wonder 1.0 at max (52.4, US$ 4.54) is enough and has a cost, so it ranks ahead of Wonder Full, which has none.
  assert.equal(pickedId(ask('sonnet', 'xhigh', { harnesses: onlyMuse() })), 'muse/muse-wonder-1.0@max')
  // The estimated @medium carries an estimated cost only so the router can rank it: a Haiku high call
  // (floor 36.8) takes @medium (38.0) as the cheapest pair that is enough, ahead of the measured @xhigh.
  assert.equal(pickedId(ask('haiku', 'high', { harnesses: onlyMuse() })), 'muse/muse-spark-1.3@medium')
  for (const [model, effort] of [['opus', 'xhigh'], ['opus', 'max'], ['sonnet', 'max']]) {
    const d = ask(model, effort, { harnesses: onlyMuse() })
    assert.equal(d.picked, null, `${model} ${effort}`)
    assert.equal(why(d, MUSE), 'below')
    assert.equal(d.native.id, `claude/${model}@${effort}`)
  }
})

test('C16: the quota of Muse competes by its window like any other, and a dry or missing one does not', () => {
  assert.equal(pickedId(ask('opus', 'high', { harnesses: withMuse(-5) })), MUSE)
  assert.notEqual(pickedId(ask('opus', 'high', { harnesses: withMuse(5) })), MUSE)
  assert.notEqual(pickedId(ask('opus', 'high', { harnesses: withMuse(null) })), MUSE)
  assert.equal(why(ask('opus', 'high', { harnesses: { ...world(), muse: { installed: true, groups: { muse: dry } } } }), MUSE), 'dry')
  assert.equal(why(ask('opus', 'high', { harnesses: { ...world(), muse: { installed: false, groups: {} } } }), MUSE), 'not-installed')
})

test('C5 and C16: without the owner decision a pair with no cost does not enter; with it, it goes last within its quota and neither dominates nor is dominated', () => {
  const bare = pairs.map((p) => {
    if (p.id !== MUSE) return p
    const { ownerDecision, ...rest } = p
    return rest
  })
  const d = choose({ pairs: bare, reference: { model: 'opus', effort: 'high' }, harnesses: onlyMuse() })
  assert.equal(d.picked, null)
  assert.equal(why(d, MUSE), 'no-cost')
  const table = [
    ...natives(),
    row('m/a@high', { intelligence: 53.6, costPerTaskUsd: null, ownerDecision: 'the owner said so' }),
    row('m/b@high', { intelligence: 56, costPerTaskUsd: 9 }),
    row('m/c@high', { intelligence: 53.6, costPerTaskUsd: 2 }),
  ]
  const ordered = choose({ pairs: table, reference: { model: 'opus', effort: 'high' }, harnesses: only('m') })
  assert.deepEqual(ordered.candidates.filter((c) => c.rank !== null).map((c) => c.id), ['m/c@high', 'm/b@high', 'm/a@high'])
})

test('a quota whose window cannot be read competes after the ones that can, and one that is known dry does not compete', () => {
  const table = [...natives(), row('x/a@high', { intelligence: 47, costPerTaskUsd: 0.1 }), row('y/b@high', { intelligence: 47, costPerTaskUsd: 5 })]
  const harnesses = { x: { installed: true, groups: { x: open(null) } }, y: { installed: true, groups: { y: open(4) } } }
  const ref = { model: 'sonnet', effort: 'high' }
  assert.equal(pickedId(choose({ pairs: table, reference: ref, harnesses })), 'y/b@high')
  assert.equal(pickedId(choose({ pairs: table, reference: ref, harnesses: { ...harnesses, y: { installed: true, groups: { y: dry } } } })), 'x/a@high')
})

test('the same cost within a quota goes to the pair with more points, then to the table order', () => {
  const table = [...natives(), row('x/a@high', { intelligence: 47, costPerTaskUsd: 1 }), row('x/b@high', { intelligence: 49, costPerTaskUsd: 1 }), row('x/c@high', { intelligence: 49, costPerTaskUsd: 1 })]
  const d = choose({ pairs: table, reference: { model: 'sonnet', effort: 'high' }, harnesses: only('x') })
  assert.deepEqual(d.candidates.filter((c) => c.rank !== null).map((c) => c.id), ['x/b@high', 'x/c@high', 'x/a@high'])
})

test('a retry excludes the pair that failed, and a harness that is off or not installed is never a candidate', () => {
  const d = ask('sonnet', 'xhigh', { exclude: ['agy/gemini-4-argon@high'] })
  assert.equal(pickedId(d), 'agy/claude-opus-5-5@medium')
  assert.equal(why(d, 'agy/gemini-4-argon@high'), 'excluded')
  const off = choose({ pairs, reference: { model: 'haiku', effort: 'high' }, harnesses: { agy: world().agy } })
  assert.equal(why(off, 'grok/grok-4.7@low'), 'harness-off')
  const missing = choose({ pairs, reference: { model: 'haiku', effort: 'high' }, harnesses: { agy: { installed: false, groups: {} }, grok: world().grok } })
  assert.equal(why(missing, 'agy/gemini-3.8-flash@medium'), 'not-installed')
})

test('issue 64: authorRule reserve takes another family first, then the author family; the default stays a bar', () => {
  const table = [
    ...natives(),
    row('muse/muse@high', { family: 'muse-wonder-full-1.0', intelligence: 53.6, costPerTaskUsd: 0.1, group: 'muse' }),
    row('agy/argon@high', { family: 'gemini-4-argon', intelligence: 52.6, costPerTaskUsd: 9, group: 'argon' }),
  ]
  const harnesses = {
    muse: { installed: true, groups: { muse: open(1) } },
    agy: { installed: true, groups: { argon: open(5) } },
  }
  const base = { pairs: table, reference: { model: 'opus', effort: 'high' }, harnesses, authors: ['muse-wonder-full-1.0'], nativeDiffers: true }
  // Muse renews sooner and costs less, so with no author it takes the call. Reserve still picks the other family.
  assert.equal(pickedId(choose({ ...base, authors: [] })), 'muse/muse@high')
  const reserved = choose({ ...base, authorRule: 'reserve' })
  assert.equal(pickedId(reserved), 'agy/argon@high')
  assert.equal(why(reserved, 'muse/muse@high'), null)
  assert.equal(reserved.candidates.find((c) => c.id === 'muse/muse@high').outcome, 'next')
  // The default, which the swarm and delegates use, still bars the author's family.
  const barred = choose(base)
  assert.equal(pickedId(barred), 'agy/argon@high')
  assert.equal(why(barred, 'muse/muse@high'), 'author')
  // Every other pair that reaches the points is dry: reserve takes the author's family, the bar falls to native.
  const museOnly = { muse: harnesses.muse, agy: { installed: true, groups: { argon: dry } } }
  assert.equal(pickedId(choose({ ...base, harnesses: museOnly, authorRule: 'reserve' })), 'muse/muse@high')
  const fallen = choose({ ...base, harnesses: museOnly })
  assert.equal(fallen.picked, null)
  assert.equal(fallen.native.model, 'opus')
  assert.throws(() => choose({ ...base, authorRule: 'later' }), /authorRule must be bar or reserve/)
})

test('C12: nobody reviews its own work, with an external pair and with the native fallback', () => {
  const sonnetAuthor = ask('sonnet', 'high', { authors: ['claude-sonnet-5-5'], nativeDiffers: true })
  assert.equal(why(sonnetAuthor, 'agy/claude-sonnet-5-5@high'), 'author')
  assert.notEqual(sonnetAuthor.picked && sonnetAuthor.picked.family, 'claude-sonnet-5-5')
  const allDry = world({ gemini: dry, claude: dry, grok: dry })
  const judge = ask('opus', 'high', { authors: ['claude-opus-5-5'], nativeDiffers: true, harnesses: allDry })
  assert.equal(judge.picked, null)
  assert.deepEqual([judge.native.model, judge.native.effort, judge.native.family], ['sonnet', 'high', 'claude-sonnet-5-5'])
  // not a review: the native pair is the reference whatever the authors
  assert.equal(ask('opus', 'high', { authors: ['claude-opus-5-5'], harnesses: allDry }).native.model, 'opus')
  // a tie in distance goes to the stronger model
  const tie = choose({ pairs: natives(45, 50, 55), reference: { model: 'sonnet', effort: 'high' }, harnesses: {}, authors: ['claude-sonnet-5-5'], nativeDiffers: true })
  assert.equal(tie.native.model, 'opus')
  // all three are authors: the reference stays and the decision says so
  const all = choose({ pairs: natives(), reference: { model: 'sonnet', effort: 'high' }, harnesses: {}, authors: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], nativeDiffers: true })
  assert.equal(all.native.model, 'sonnet')
  assert.match(all.reason, /no other Claude model/)
})

test('choose does not change what it is given', () => {
  const freeze = (value) => {
    if (value && typeof value === 'object') Object.values(value).forEach(freeze)
    return Object.freeze(value)
  }
  const frozenPairs = freeze(JSON.parse(JSON.stringify(pairs)))
  const harnesses = freeze(JSON.parse(JSON.stringify(world())))
  assert.doesNotThrow(() => choose({ pairs: frozenPairs, reference: { model: 'sonnet', effort: 'xhigh' }, harnesses, exclude: Object.freeze([]), authors: Object.freeze([]) }))
})

test('enabled: on only when the session exports on, on Linux', () => {
  assert.deepEqual(enabled({ AETHER_SUPERDELEGATION: 'on' }, 'linux'), { on: true, reason: null })
  assert.deepEqual(enabled({ AETHER_SUPERDELEGATION: 'on' }, 'darwin'), { on: false, reason: 'platform' })
  assert.deepEqual(enabled({ AETHER_SUPERDELEGATION: 'off' }, 'linux'), { on: false, reason: 'option' })
  assert.deepEqual(enabled({}, 'linux'), { on: false, reason: 'option' })
})

const OLD_LANES = 'CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES'
const OLD_SEATS = 'CLAUDE_PLUGIN_OPTION_' + 'SEA' + 'TS'

test('resolveOption reads only the superdelegation option', () => {
  assert.deepEqual(resolveOption({}), { on: false, source: 'default' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: '' }), { on: false, source: 'default' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }), { on: true, source: 'superdelegation' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false' }), { on: false, source: 'superdelegation' })
  assert.deepEqual(resolveOption({ [OLD_LANES]: 'true', [OLD_SEATS]: 'robust' }), { on: false, source: 'default' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', [OLD_LANES]: 'true' }), { on: false, source: 'superdelegation' })
  assert.deepEqual(resolveOption({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true', [OLD_SEATS]: 'robust' }), { on: true, source: 'superdelegation' })
})

test('the notes about the old options are gone from the module', () => {
  assert.equal(require('../plugins/aether/lib/superdelegation.js')['legacy' + 'Notes'], undefined)
})

const harness = () => ({ command: 'x', waitSeconds: 540, timeouts: { implementer: 2700, supervisor: 900, reviewer: 1200 }, groups: {}, models: { m: {} } })

test('runArgs: the harnesses that are enabled, installed and have pairs, and the waits', () => {
  const config = { harnesses: { agy: harness(), grok: harness(), codex: { ...harness(), models: {} }, cursor: harness(), muse: harness() } }
  const args = runArgs(config, pairs, { installed: (name) => name !== 'cursor', enabled: ['agy', 'grok', 'codex', 'cursor', 'muse'] })
  assert.deepEqual(args, {
    superdelegation: true,
    harnesses: ['agy', 'grok', 'muse'],
    waits: { implementer: 6, supervisor: 3, reviewer: 4 },
  })
  assert.equal(runArgs(config, pairs, { installed: () => false, enabled: ['agy'] }), null)
  assert.equal(runArgs(null, pairs, { installed: () => true, enabled: ['agy'] }), null)
})

test('idleHarnesses names why an enabled harness gives the run nothing', () => {
  const config = { harnesses: { agy: harness(), codex: { ...harness(), models: {} }, cursor: harness() } }
  const idle = idleHarnesses(config, pairs, { installed: (name) => name !== 'cursor', enabled: ['agy', 'codex', 'cursor', 'ghost'] })
  assert.deepEqual(idle, [
    { name: 'codex', reason: 'has no models in the lane table yet' },
    { name: 'cursor', reason: 'is not installed: x was not found' },
    { name: 'ghost', reason: 'has no entry in the lane table' },
  ])
})

const NATIVE = { id: 'claude/sonnet@high', harness: 'claude', model: 'sonnet', effort: 'high', family: 'claude-sonnet', group: null, intelligence: 50, costPerTaskUsd: 2 }
const EXT = (model, intelligence, cost) => ({ id: `agy/${model}@high`, harness: 'agy', model, effort: 'high', family: 'gemini', group: 'flash', intelligence, costPerTaskUsd: cost })
const VIEWS = { agy: { installed: true, groups: { flash: {} } } }
const TABLE = (roles) => ({ harnesses: { agy: { models: { 'gem-a': { group: 'flash', roles }, 'gem-b': { group: 'flash', roles: ['judge', 'writer', 'examiner'] } } } } })
const call = (role, roles) => choose({ pairs: [NATIVE, EXT('gem-a', 50, 1), EXT('gem-b', 50, 5)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, role, lanes: TABLE(roles) })

for (const role of ['implementer', 'supervisor', 'reviewer']) {
  test(`E3 (${role}): a model whose roles list lacks the role is not chosen and gets no call`, () => {
    const others = ['implementer', 'supervisor', 'reviewer'].filter((r) => r !== role)
    const decision = call(role, others)
    assert.equal(decision.picked, null)
    assert.equal(decision.native.id, 'claude/sonnet@high')
    assert.equal(decision.reason, 'native claude/sonnet@high: no external model allows the role ' + role)
    assert.ok(decision.candidates.filter((c) => c.outcome !== 'passed').length === 0)
    assert.equal(decision.candidates.find((c) => c.id === 'agy/gem-a@high').why, 'role')
  })
}
for (const role of ['judge', 'writer', 'examiner']) {
  test(`E3b (${role}): a seat takes no model whose roles list lacks it`, () => {
    const decision = call(role, ['implementer', 'supervisor', 'reviewer'])
    assert.equal(decision.picked.id, 'agy/gem-b@high')
    const none = choose({ pairs: [NATIVE, EXT('gem-a', 50, 1)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, role, lanes: TABLE(['implementer']) })
    assert.equal(none.picked, null)
    assert.match(none.reason, new RegExp(`no external model allows the role ${role}$`))
  })
}
test('a model whose list has the role is chosen as before', () => {
  assert.equal(call('implementer', ['implementer']).picked.id, 'agy/gem-a@high')
})
test('a pair with no entry in the lane table has no roles and is not chosen', () => {
  const decision = choose({ pairs: [NATIVE, EXT('unlisted', 50, 1)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, role: 'implementer', lanes: TABLE(['implementer']) })
  assert.equal(decision.picked, null)
  assert.equal(decision.candidates.find((c) => c.id === 'agy/unlisted@high').why, 'role')
})
test('a missing role does not throw and does not filter', () => {
  const decision = choose({ pairs: [NATIVE, EXT('gem-a', 50, 1)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, lanes: TABLE(['judge']) })
  assert.equal(decision.picked.id, 'agy/gem-a@high')
  assert.equal(decision.candidates.find((c) => c.id === 'agy/gem-a@high').why, null)
})
test('an unknown role does not throw: the native pair takes the call and the reason names the role', () => {
  const decision = call('nobody', ['implementer'])
  assert.equal(decision.picked, null)
  assert.equal(decision.native.id, 'claude/sonnet@high')
  assert.equal(decision.reason, 'native claude/sonnet@high: no external model allows the role nobody')
})
test('a set role with no lane table excludes every external pair for role', () => {
  const decision = choose({ pairs: [NATIVE, EXT('gem-a', 50, 1)], reference: { model: 'sonnet', effort: 'high' }, harnesses: VIEWS, role: 'implementer' })
  assert.equal(decision.picked, null)
  assert.equal(decision.candidates.find((c) => c.id === 'agy/gem-a@high').why, 'role')
})
