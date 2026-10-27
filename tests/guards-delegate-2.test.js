'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('delegate-2', [
  'plugins/aether/lib/delegate-run.js',
  'plugins/aether/lib/delegate-task.js',
  'plugins/aether/lib/ladder.js',
])
