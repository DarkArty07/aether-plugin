'use strict'

// The harnesses a delegate may run on (every harness in the registry except cursor), in the order of lib/harness/index.js.
// Loaded without loading any adapter.
// Family: harness.

const { ADAPTER_NAMES: ALL_HARNESSES } = require('./harness/index.js')

const DELEGATE_HARNESS_NAMES = Object.freeze(ALL_HARNESSES.filter((name) => name !== 'cursor'))
const formatHarnessesOr = (names = DELEGATE_HARNESS_NAMES) => `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`

module.exports = { DELEGATE_HARNESS_NAMES, formatHarnessesOr }
