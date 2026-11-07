'use strict'

// The tidy deletions and renames of spec 030 R38, for the tests and the tools that name them. The rules and the
// segment walk live in guard.js, so that the guard and this module read a command with one segmenter: guard.js
// cannot require this module back without a cycle (tests/guards.test.js).
// Family: tidy.

const os = require('node:os')
const { emptiesTidyFile, tidyTargetsIn } = require('./guard.js')

// The paths that rm, mv, rmdir, unlink, git rm and git mv name in a command and that aether:tidy orders moved or
// removed, in order of appearance. The home folder is the one that ~ and $HOME name.
function tidyTargets(command, { cwd, home = os.homedir() } = {}) {
  return tidyTargetsIn(command, cwd, { ...process.env, HOME: home })
}

module.exports = {
  tidyTargets,
  emptiesTidyFile,
}
