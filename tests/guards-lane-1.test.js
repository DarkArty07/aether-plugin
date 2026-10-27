'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('lane-1', [
  'plugins/aether/lib/lane-calls.js',
  'plugins/aether/lib/lane-work.js',
  'plugins/aether/lib/lane-schemas.js',
  'plugins/aether/lib/lane-readings.js',
  'plugins/aether/lib/lane-order.js',
])
