'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { choose } = require('../plugins/aether/lib/superdelegation.js')

const claude = (model, effort, intelligence, costPerTaskUsd) =>
  ({ id: `claude/${model}@${effort}`, harness: 'claude', model, family: `claude-${model}`, effort, group: null, intelligence, costPerTaskUsd })
const outside = (model, intelligence, costPerTaskUsd) =>
  ({ id: `agy/${model}@high`, harness: 'agy', model, family: model, effort: 'high', group: 'g', intelligence, costPerTaskUsd })
const LANES = { harnesses: { agy: { models: { near: { roles: ['implementer', 'supervisor'] }, exact: { roles: ['implementer', 'supervisor'] } } } } }
const HEALTHY = { agy: { installed: true, groups: { g: { usable: true, unknown: false, mark: null, resetsAt: null } } } }
const ask = (pairs, role, more = {}) => choose({ pairs, reference: { model: 'opus', effort: 'high' }, harnesses: HEALTHY, role, lanes: LANES, ...more })

test('the supervisor floor is strict: a pair one tenth under the level is out, and the tolerance still serves the implementer', () => {
  const pairs = [claude('opus', 'high', 51.7, 3.465), outside('near', 51.6, 0.5)]
  assert.equal(ask(pairs, 'implementer').picked.id, 'agy/near@high')
  const supervisor = ask(pairs, 'supervisor')
  assert.equal(supervisor.picked, null)
  assert.equal(supervisor.native.id, 'claude/opus@high')
})

test('a pair at the level of the supervisor is a candidate for it', () => {
  const pairs = [claude('opus', 'high', 51.7, 3.465), outside('exact', 51.7, 0.5)]
  assert.equal(ask(pairs, 'supervisor').picked.id, 'agy/exact@high')
})

test('the replacement of an author model for the supervisor never gives fewer points than the level', () => {
  const pairs = [claude('opus', 'high', 51.7, 3.465), claude('sonnet', 'high', 41.1, 1.636)]
  const authors = ['claude-opus']
  const weak = ask(pairs, 'supervisor', { authors, nativeDiffers: true })
  assert.equal(weak.native.id, 'claude/opus@high')
  assert.match(weak.reason, /the native fallback stays opus: the Claude models free of the authors give fewer points than the level/)
  assert.equal(weak.reason.includes('no other Claude model is free'), false)
  // When every Claude model is an author the old line stays.
  assert.match(ask(pairs, 'supervisor', { authors: ['claude-opus', 'claude-sonnet'], nativeDiffers: true }).reason, /no other Claude model is free of the authors, so the native fallback stays opus/)
  // Any other role keeps the replacement by closest points, as before.
  assert.equal(ask(pairs, 'reviewer', { authors, nativeDiffers: true }).native.id, 'claude/sonnet@high')
  // A replacement that is not weaker is taken.
  const stronger = [...pairs, claude('sonnet-6', 'high', 55, 2)]
  assert.equal(ask(stronger, 'supervisor', { authors, nativeDiffers: true }).native.id, 'claude/sonnet-6@high')
})
