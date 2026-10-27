'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('observe-2', [
  'plugins/aether/lib/observe-dev.js',
  'plugins/aether/lib/observe-digest.js',
  'plugins/aether/lib/observe-hook.js',
  'plugins/aether/lib/observe-read.js',
])
