'use strict'
const { checkGroup } = require('./guards-helpers.js')

checkGroup('bins', [
  'plugins/aether/bin/aether-autonomy',
  'plugins/aether/bin/aether-delegate',
  'plugins/aether/bin/aether-exam',
  'plugins/aether/bin/aether-first-setup',
  'plugins/aether/bin/aether-guard',
  'plugins/aether/bin/aether-lane',
  'plugins/aether/bin/aether-observe',
  'plugins/aether/bin/aether-plan',
  'plugins/aether/bin/aether-report',
  'plugins/aether/bin/aether-session-start',
  'plugins/aether/bin/aether-voice',
  'plugins/aether/bin/aether-wt',
  'plugins/aether/lib/plan-compile.js',
  'plugins/aether/lib/session-start.js',
  'plugins/aether/lib/autonomy-command.js',
  'plugins/aether/lib/lane-command.js',
])
