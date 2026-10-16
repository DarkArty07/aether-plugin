'use strict'

// How the router reads the Claude side of a delegation, shared by the router (route.js) and by the replay
// (router-replay.js), so that the replay decides as the router decides. Pure: it reads the table of rungs and
// the values it is given, nothing else.
//
// A call has a reference rung: the one the Lead asked for through `model` and `effort`, or the standard rung (the
// `fallback` option) when it named no Claude model. The floor is the level of that reference on the answers' axis;
// when the criterion decides exactly that level, the call keeps the reference rung, and otherwise it takes the
// cheapest Claude rung of the decided level.

const { levelOfRung, pickRung } = require('./router-rungs.js')

const CLAUDE_ALIASES = ['haiku', 'sonnet', 'opus']

function claudeRow(table, alias, effort) {
  return table.rungs.find((r) => r.harness === 'claude' && r.alias === alias && r.effort === effort) || null
}

// 'haiku' | 'sonnet' | 'opus' for an alias or a full Claude model id; null for anything else.
function aliasOf(table, model) {
  if (typeof model !== 'string' || !model) return null
  if (CLAUDE_ALIASES.includes(model)) return model
  const row = table.rungs.find((r) => r.harness === 'claude' && r.model === model && CLAUDE_ALIASES.includes(r.alias))
  return row ? row.alias : null
}

// The rung the Lead asked for, { alias, effort }, or null when the call names no Claude model. `request` is the
// Lead's own `model` and `effort`; an effort it left out is the criterion's inherited effort.
function askedOf(request, table, criterion) {
  const alias = aliasOf(table, request && request.model)
  if (!alias) return null
  const effort = request && typeof request.effort === 'string' && request.effort ? request.effort : criterion.inheritedEffort
  return { alias, effort }
}

function claudeLevel(table, rung, axis) {
  return levelOfRung(table, { harness: 'claude', model: rung.alias, effort: rung.effort }, axis)
}

function claudeId(table, alias) {
  const row = table.rungs.find((r) => r.harness === 'claude' && r.alias === alias)
  return row ? row.model : alias
}

// The reference rung and the floor of a call. `asked` is askedOf's result and `standard` the fallback option's rung,
// { alias, effort }. The asked rung is the reference when the table measures it; otherwise the standard one is, and
// its level may be null when the table does not measure it either.
function stanceOf(table, { asked, standard, axis }) {
  const askedLevel = asked ? claudeLevel(table, asked, axis) : null
  const reference = askedLevel ? asked : standard
  const floor = askedLevel || claudeLevel(table, reference, axis)
  return { reference, floor }
}

// The Claude rungs of a decided level: `claudeRung`, the one the call runs on (the reference rung itself at the floor,
// else the cheapest Claude rung of the level), and `sameLevel`, the cheapest Claude rung of the level, which is also
// the rung an external delegate falls back to.
function claudeRungAt(table, { reference, floor, level, axis }) {
  const sameLevel = pickRung(table, { harness: 'claude', level, axis }) || claudeRow(table, reference.alias, reference.effort)
  const claudeRung = level === floor
    ? (claudeRow(table, reference.alias, reference.effort) || { model: claudeId(table, reference.alias), alias: reference.alias, effort: reference.effort, status: null })
    : sameLevel
  return { claudeRung, sameLevel }
}

module.exports = { claudeRow, aliasOf, askedOf, claudeLevel, claudeId, stanceOf, claudeRungAt }
