'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('delegate-1', [
  'plugins/aether/lib/delegate-calls.js',
  'plugins/aether/lib/delegate-chain.js',
  'plugins/aether/lib/delegate-checks.js',
  'plugins/aether/lib/delegate-limits.js',
  'plugins/aether/lib/delegate-log.js',
  'plugins/aether/lib/delegate-report.js',
])
