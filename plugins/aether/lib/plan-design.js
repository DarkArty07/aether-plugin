'use strict'

// Builds the JSON arguments for /aether:design from the checkout, environment and flags.
// Family: plan.

const fs = require('node:fs')
const path = require('node:path')
const { git } = require('./git.js')

const DESIGN_USAGE =
  'usage: aether-plan design-args <feature> [--short <document> --intent <text> --author <model>]'
const FEATURE = /^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*$/
const SHORT_DOCS = new Set(['spec.md', 'plan.md', 'tasks.md', 'design.md'])

function fail(message, stdout = process.stdout) {
  stdout.write(JSON.stringify({ ok: false, errors: [message], warnings: [] }) + '\n')
  process.exit(1)
}

function hasEntry(target, kind, stdout) {
  try {
    return Boolean(fs.statSync(target, { throwIfNoEntry: false })?.[kind]())
  } catch (err) {
    fail(err.message, stdout)
  }
}

function parseArgs(args) {
  const flags = { '--short': null, '--intent': null, '--author': null }
  let feature = null
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (Object.hasOwn(flags, arg) && flags[arg] === null) {
      const next = args[++i]
      if (next === undefined || next.startsWith('--')) return { error: DESIGN_USAGE }
      flags[arg] = next
    } else if (!arg.startsWith('--') && feature === null) {
      feature = arg
    } else {
      return { error: DESIGN_USAGE }
    }
  }
  const { '--short': doc, '--intent': intent, '--author': author } = flags
  if (!feature) return { error: DESIGN_USAGE }
  const shortFlags = [doc !== null, intent !== null, author !== null]
  if (shortFlags.some(Boolean) && !shortFlags.every(Boolean)) return { error: DESIGN_USAGE }
  return { feature, doc, intent, author }
}

function designArgs(
  argv,
  {
    cwd = process.cwd(),
    env = process.env,
    binDir = path.resolve(__dirname, '..', 'bin'),
    stdout = process.stdout,
  } = {},
) {
  const args = argv[0] === 'design-args' ? argv.slice(1) : argv
  const parsed = parseArgs(args)
  if (parsed.error) fail(parsed.error, stdout)

  let top
  try {
    top = git(['rev-parse', '--show-toplevel'], cwd, { allowFail: true })
  } catch (err) {
    fail(err.message, stdout)
  }
  if (top.status !== 0 || !top.stdout.trim()) fail(`not a git repository: ${cwd}`, stdout)
  const repoRoot = top.stdout.trim()

  const feature = parsed.feature.replace(/\/+$/, '')
  if (!FEATURE.test(feature)) fail(`invalid feature path: ${parsed.feature}`, stdout)

  const { doc, intent, author } = parsed
  const featureDir = path.join(repoRoot, feature)
  if (!hasEntry(featureDir, 'isDirectory', stdout)) fail(`feature folder not found: ${featureDir}`, stdout)

  let document = null
  if (doc === null) {
    const intentPath = path.join(featureDir, 'intent.md')
    if (!hasEntry(intentPath, 'isFile', stdout)) fail(`intent.md not found: ${intentPath}`, stdout)
  } else {
    document = !doc.includes('/') && !doc.includes(path.sep) ? `${feature}/${doc}` : doc
    const name = document.startsWith(`${feature}/`) ? document.slice(feature.length + 1) : null
    if (!SHORT_DOCS.has(name)) fail(`invalid short document: ${doc}`, stdout)
    const docPath = path.join(repoRoot, document)
    if (!hasEntry(docPath, 'isFile', stdout)) fail(`document not found: ${docPath}`, stdout)
  }

  const result = {
    feature,
    session: env.CLAUDE_CODE_SESSION_ID || '',
    repoRoot,
    superdelegation: env.AETHER_SUPERDELEGATION || '',
    harnesses: env.AETHER_LANE_HARNESSES || '',
    binDir,
  }
  if (document !== null) {
    result.mode = 'short'
    result.document = document
    result.intent = intent
    result.author = author
  }

  stdout.write(JSON.stringify(result) + '\n')
  return result
}

module.exports = { designArgs, DESIGN_USAGE }
