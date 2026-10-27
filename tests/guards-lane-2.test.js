'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('lane-2', [
  'plugins/aether/lib/lane-delegate.js',
  'plugins/aether/lib/lane-marks.js',
  'plugins/aether/lib/lane-pick.js',
  'plugins/aether/lib/lane-quota.js',
])
