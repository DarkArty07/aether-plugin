'use strict'

// The shared vocabulary of the audit family: the closed lists every audit step reads, the usage error and the argument reader.
// Family: audit.

const TOPICS = ['bugs', 'security', 'dependencies', 'tests', 'reliability', 'performance', 'accessibility', 'architecture', 'docs', 'releases', 'hygiene', 'opportunities']
const TYPES = ['bug', 'risk', 'debt', 'docs', 'opportunity', 'other']
const VERDICTS = ['proven', 'read-confirmed', 'proposal', 'refuted', 'unverified']
const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const SEVERITIES = ['critical', 'high', 'medium', 'low']
const SIZES = ['S', 'M', 'L']
const WAIT_COSTS = ['high', 'medium', 'low']
const CHECK_STATES = ['result', 'not-applicable', 'could-not']

// An Error whose exitCode is 2: the bin prints it as a usage mistake.
function usageError(message) {
  return Object.assign(new Error(message), { exitCode: 2 })
}

// spec = { values: ['out'], booleans: ['save'], positionals: [min, max] }
// -> { values: { out: 'x' }, booleans: { save: true }, positionals: ['a'] }; values and booleans hold only the flags that were given.
// Throws usageError for an unknown flag, a value flag with no value (or whose value starts with `--`), a flag given twice,
// and a number of positionals outside [min, max].
function parseArgs(args, spec) {
  const values = {}
  const booleans = {}
  const positionals = []
  const seen = new Set()
  const valueFlags = new Set(spec.values || [])
  const booleanFlags = new Set(spec.booleans || [])
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      if (!valueFlags.has(name) && !booleanFlags.has(name)) throw usageError(`unknown flag: ${arg}`)
      if (seen.has(name)) throw usageError(`flag given twice: ${arg}`)
      seen.add(name)
      if (valueFlags.has(name)) {
        const next = args[i + 1]
        if (next === undefined || next.startsWith('--')) throw usageError(`flag needs a value: ${arg}`)
        values[name] = next
        i++
      } else {
        booleans[name] = true
      }
    } else if (arg.startsWith('-') && arg !== '-') {
      throw usageError(`unknown flag: ${arg}`)
    } else {
      positionals.push(arg)
    }
  }
  const [min, max] = spec.positionals || [0, Infinity]
  if (positionals.length < min || positionals.length > max) throw usageError(`needs between ${min} and ${max} arguments, got ${positionals.length}`)
  return { values, booleans, positionals }
}

module.exports = {
  TOPICS,
  TYPES,
  VERDICTS,
  PRIORITIES,
  SEVERITIES,
  SIZES,
  WAIT_COSTS,
  CHECK_STATES,
  usageError,
  parseArgs,
}
