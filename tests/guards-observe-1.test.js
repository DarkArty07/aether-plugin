'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('observe-1', [
  'plugins/aether/lib/observe.js',
  'plugins/aether/lib/observe-calibrate.js',
  'plugins/aether/lib/observe-detect.js',
  'plugins/aether/lib/observe-redact.js',
  'plugins/aether/lib/observe-baseline.js',
])
