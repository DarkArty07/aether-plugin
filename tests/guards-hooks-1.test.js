'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('hooks-1', [
  'plugins/aether/hooks/register.js',
  'plugins/aether/hooks/ops-command.mjs',
  'plugins/aether/hooks/fault-trace.mjs',
  'plugins/aether/hooks/quota-brake.mjs',
  'plugins/aether/hooks/spend-view.mjs',
])
