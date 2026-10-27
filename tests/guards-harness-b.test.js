'use strict'
const { checkGroup } = require('./guards-helpers.js')

checkGroup('harness-b', [
  'plugins/aether/lib/harness/grok-acp.js',
  'plugins/aether/lib/harness/grok-quota.js',
  'plugins/aether/lib/harness/muse.js',
])
