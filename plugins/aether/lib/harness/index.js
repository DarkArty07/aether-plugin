'use strict'

// The external harnesses a lane can run on, and the adapter each is built by. A harness module loads
// only when a call asks for it, so one whose module is missing leaves the others working.

const HARNESS_NAMES = ['agy', 'codex', 'grok', 'cursor', 'muse']
const FACTORY = { agy: 'createAgy', codex: 'createCodex', grok: 'createGrok', cursor: 'createCursor', muse: 'createMuse' }

// Factories added by tests, or by a caller that brings its own harness, under any name.
const registered = new Map()

function registerAdapter(name, factory) {
  registered.set(name, factory)
}

function unregisterAdapter(name) {
  registered.delete(name)
}

// The adapter of harness name, built from its table entry. Throws, naming the harness, when the name
// is not known or its module cannot be loaded.
function createAdapter(name, settings) {
  const options = { command: settings.command, groups: settings.groups }
  if (registered.has(name)) return registered.get(name)(options)
  if (!HARNESS_NAMES.includes(name)) throw new Error(`unknown harness: ${name}`)
  let factory
  try {
    factory = require(`./${name}.js`)[FACTORY[name]]
  } catch (err) {
    throw new Error(`harness ${name} cannot be loaded: ${err.message}`)
  }
  if (typeof factory !== 'function') throw new Error(`harness ${name} cannot be loaded: ${FACTORY[name]} is missing`)
  return factory(options)
}

module.exports = { HARNESS_NAMES, createAdapter, registerAdapter, unregisterAdapter }
