'use strict'
const { checkGroup } = require('./guards-helpers.js')

checkGroup('core-1', [
  'plugins/aether/lib/autonomy.js',
  'plugins/aether/lib/guard.js',
  'plugins/aether/lib/first-setup.js',
  'plugins/aether/lib/voice.js',
  'plugins/aether/lib/session.js',
])
