'use strict'

const { checkGroup } = require('./guards-helpers.js')

checkGroup('core-2', [
  'plugins/aether/lib/plan.js',
  'plugins/aether/lib/pairs.js',
  'plugins/aether/lib/superdelegation.js',
  'plugins/aether/lib/quota-refusal.js',
  'plugins/aether/lib/pending.js',
])
