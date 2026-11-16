'use strict'

// The one written list of the harnesses a delegate may run on. The router and the delegate commands copy it.
// Family: harness.

const HARNESS_NAMES = Object.freeze(['agy', 'codex', 'grok', 'muse'])
const formatHarnessesOr = (names = HARNESS_NAMES) => `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`

module.exports = { HARNESS_NAMES, formatHarnessesOr }
