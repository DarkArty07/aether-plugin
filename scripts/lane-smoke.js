#!/usr/bin/env node
'use strict'

// Usage: node scripts/lane-smoke.js <harness> [<model>] [--effort low|medium|high]
//
// One real call to a lane harness, the way a swarm lane would make it, in a fresh empty directory: the model
// is asked to write one file and to answer with a JSON object. It checks that the harness runs, that the
// adapter reads the answer, and that the file exists. It spends quota and runs the CLI with the approval flag
// its adapter passes, so run it on purpose. Prints one line of JSON. Exits 0 when the call is clean, 1 when it
// is not, 2 on a usage error.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const lanes = require('../plugins/aether/lib/lanes.js')
const { createAdapter } = require('../plugins/aether/lib/harness/index.js')

const USAGE = 'usage: node scripts/lane-smoke.js <harness> [<model>] [--effort low|medium|high]'
const TIMEOUT_MS = 180000
const PROMPT =
  'Create the file hello.txt in the working directory containing exactly the text: lane ok\n' +
  'Then answer with only this JSON object and nothing else: {"status":"done","file":"hello.txt"}'
const SCHEMA = {
  type: 'object',
  properties: { status: { type: 'string' }, file: { type: 'string' } },
  required: ['status', 'file'],
  additionalProperties: false,
}

function parseArgs(argv) {
  const positional = []
  let effort = 'low'
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--effort') effort = argv[++i]
    else positional.push(argv[i])
  }
  if (positional.length < 1 || positional.length > 2 || !['low', 'medium', 'high'].includes(effort)) throw new Error(USAGE)
  return { harness: positional[0], model: positional[1] ?? null, effort }
}

function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (err) {
    console.error(err.message)
    return 2
  }
  const config = lanes.loadConfig(lanes.CONFIG_FILE)
  const settings = config.harnesses[args.harness]
  if (!settings) {
    console.error(`no harness ${args.harness} in the lane table: ${Object.keys(config.harnesses).join(', ')}`)
    return 2
  }
  const model = args.model ?? Object.keys(settings.models)[0]
  if (!model) {
    console.error(`harness ${args.harness} has no models in the lane table: give one as the second argument`)
    return 2
  }
  const adapter = createAdapter(args.harness, settings)
  if (!adapter.installed()) {
    console.log(JSON.stringify({ ok: false, harness: args.harness, model, reason: `${settings.command} is not installed` }))
    return 1
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-lane-smoke-'))
  const schemaFile = path.join(dir, '.schema.json')
  fs.writeFileSync(schemaFile, JSON.stringify(SCHEMA))
  const work = path.join(dir, 'work')
  fs.mkdirSync(work)
  const prompt = adapter.schemaInPrompt === true ? `${PROMPT}\n\nThe JSON object has the fields: ${JSON.stringify(SCHEMA.required)}.` : PROMPT
  const argvOfCall = adapter.argv({ model: adapter.modelArg({ model, level: args.effort }), level: args.effort, schemaFile, timeoutSeconds: TIMEOUT_MS / 1000, prompt })
  const started = Date.now()
  const run = spawnSync(argvOfCall[0], argvOfCall.slice(1), { cwd: work, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
  const seconds = Math.round((Date.now() - started) / 100) / 10
  const parsed = adapter.parse({ stdout: run.stdout ?? '', stderr: run.stderr ?? '', exitCode: run.status }, { required: ['status', 'file'] })
  const written = path.join(work, 'hello.txt')
  const content = fs.existsSync(written) ? fs.readFileSync(written, 'utf8').trim() : null
  const ok = parsed.clean && content === 'lane ok'
  console.log(JSON.stringify({ ok, harness: args.harness, model, effort: args.effort, seconds, clean: parsed.clean, reason: parsed.reason, structured: parsed.structured, usage: parsed.usage, fileContent: content, dir }))
  return ok ? 0 : 1
}

process.exit(main(process.argv.slice(2)))
