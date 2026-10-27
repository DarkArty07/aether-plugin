'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('spend', [
  'plugins/aether/lib/spend.js',
  'plugins/aether/lib/spend-archive.js',
  'plugins/aether/lib/report.js',
  'plugins/aether/lib/prices.js',
])
