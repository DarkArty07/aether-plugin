'use strict'
const { checkGroup } = require('./guards-helpers.js')
checkGroup('seat', [
  'plugins/aether/lib/seats.js',
  'plugins/aether/lib/seat-calls.js',
  'plugins/aether/lib/exam.js',
])
