'use strict'
const { checkGroup } = require('./guards-helpers.js')

checkGroup('harness-a', [
  'plugins/aether/lib/harness/agy.js',
  'plugins/aether/lib/harness/codex.js',
  'plugins/aether/lib/harness/cursor.js',
  'plugins/aether/lib/harness/grok.js',
  'plugins/aether/lib/harness/structured.js',
  'plugins/aether/lib/harness/index.js',
])
