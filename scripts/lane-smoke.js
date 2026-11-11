#!/usr/bin/env node
'use strict'

// Usage: node scripts/lane-smoke.js <harness> [<model>] [--effort low|medium|high|xhigh|max] [--raw <file>] [--edits]
//
// One real call to a lane harness, the way a swarm lane would make it, in a fresh empty directory: the model
// is asked to write one file and to answer with a JSON object. It checks that the harness runs, that the
// adapter reads the answer, and that the file exists. It spends quota and runs the CLI with the approval flag
// its adapter passes, so run it on purpose. Prints one line of JSON. Exits 0 when the call is clean, 1 when it
// is not, 2 on a usage error.
//
// --edits makes the call a code-editing one (issue 189): the model writes probe.test.js, a test that starts a
// child process with pipes, runs it with node --test and answers whether it passed. The adapter gets editsCode, so
// a Codex call opens its sandbox's network. The script then runs the same test itself, outside any sandbox
// (testsOutside), which tells a sandbox that refuses the child process from a test that is wrong.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const lanes = require('../plugins/aether/lib/lanes.js')
const { createAdapter } = require('../plugins/aether/lib/harness/index.js')

const USAGE = 'usage: node scripts/lane-smoke.js <harness> [<model>] [--effort low|medium|high|xhigh|max] [--raw <file>] [--edits]'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
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
// The --edits prompt, word for word, and its schema.
const EDIT_PROMPT = [
  'Create the file probe.test.js in the working directory with exactly this content:',
  '',
  "const test = require('node:test')",
  "const assert = require('node:assert/strict')",
  "const { spawnSync } = require('node:child_process')",
  "test('a child process with pipes runs', () => {",
  "  const r = spawnSync('git', ['--version'])",
  '  assert.equal(r.error, undefined)',
  '  assert.equal(r.status, 0)',
  '  assert.match(String(r.stdout), /git version/)',
  '})',
  '',
  'Then run: node --test probe.test.js',
  'Then answer with only this JSON object and nothing else: {"status":"done","file":"probe.test.js","tests":"pass","detail":""} when the test passed, or {"status":"done","file":"probe.test.js","tests":"fail","detail":"<the error the test printed>"} when it did not. Do not change the test to make it pass.',
].join('\n')
const EDIT_PROBE = 'probe.test.js'
const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    file: { type: 'string' },
    tests: { type: 'string' },
    detail: { type: 'string' },
  },
  // Every property is required: Codex's structured output refuses a schema with an optional one (the first real call
  // of 2026-11-11 answered 400, «'schema.required' is required to include every key in properties. Missing 'detail'»).
  // A passing probe answers with an empty detail.
  required: ['status', 'file', 'tests', 'detail'],
  additionalProperties: false,
}

function parseArgs(argv) {
  const positional = []
  let effort = 'low'
  let raw = null
  let edits = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--edits') edits = true
    else if (argv[i] === '--effort') effort = argv[++i]
    else if (argv[i] === '--raw') {
      raw = argv[++i]
      if (raw === undefined) throw new Error(USAGE)
    } else positional.push(argv[i])
  }
  if (positional.length < 1 || positional.length > 2 || !EFFORTS.includes(effort)) throw new Error(USAGE)
  return { harness: positional[0], model: positional[1] ?? null, effort, raw, edits }
}

function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (err) {
    console.error(err.message)
    return 2
  }
  const config = lanes.loadConfig()
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
  const schema = args.edits ? EDIT_SCHEMA : SCHEMA
  fs.writeFileSync(schemaFile, JSON.stringify(schema))
  const work = path.join(dir, 'work')
  fs.mkdirSync(work)
  const basePrompt = args.edits ? EDIT_PROMPT : PROMPT
  const prompt = adapter.schemaInPrompt === true ? `${basePrompt}\n\nThe JSON object has the fields: ${JSON.stringify(schema.required)}.` : basePrompt
  const callOptions = { model, level: args.effort, schemaFile, timeoutSeconds: TIMEOUT_MS / 1000, prompt }
  if (args.edits) callOptions.editsCode = true
  const argvOfCall = adapter.argv(callOptions)
  const started = Date.now()
  // The environment a lane gives its CLI: the owner's git, GitHub, registry and cloud credentials stay out of it.
  const env = lanes.laneEnv(process.env, `lane-smoke-${process.pid}`)
  const run = spawnSync(argvOfCall[0], argvOfCall.slice(1), { cwd: work, env, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
  const seconds = Math.round((Date.now() - started) / 100) / 10
  const stdout = run.stdout ?? ''
  const stderr = run.stderr ?? ''
  if (args.raw) {
    const separator = stdout.length === 0 || stdout.endsWith('\n') ? '' : '\n'
    fs.writeFileSync(args.raw, `${stdout}${separator}--- stderr ---\n${stderr}`)
  }
  const parsed = adapter.parse({ stdout, stderr, exitCode: run.status }, { required: schema.required })
  if (args.edits) {
    const answer = parsed.structured ?? {}
    const probe = path.join(work, EDIT_PROBE)
    const ok = parsed.clean && fs.existsSync(probe) && answer.tests === 'pass'
    // The same test, run here outside the sandbox: a failure here is a wrong test, not a refusing sandbox.
    const outside = spawnSync(process.execPath, ['--test', EDIT_PROBE], { cwd: work, encoding: 'utf8', timeout: TIMEOUT_MS })
    const report = { ok, harness: args.harness, model, effort: args.effort, seconds, clean: parsed.clean, reason: parsed.reason, structured: parsed.structured, usage: parsed.usage, edits: true, tests: answer.tests ?? null }
    if (answer.detail) report.detail = answer.detail
    report.testsOutside = outside.status === 0 ? 'pass' : 'fail'
    report.networkOpen = argvOfCall.some((arg) => arg.includes('network_access=true'))
    report.dir = dir
    if (args.raw) report.raw = args.raw
    console.log(JSON.stringify(report))
    return ok ? 0 : 1
  }
  const written = path.join(work, 'hello.txt')
  const content = fs.existsSync(written) ? fs.readFileSync(written, 'utf8').trim() : null
  const ok = parsed.clean && content === 'lane ok'
  const report = { ok, harness: args.harness, model, effort: args.effort, seconds, clean: parsed.clean, reason: parsed.reason, structured: parsed.structured, usage: parsed.usage, fileContent: content, dir }
  if (args.raw) report.raw = args.raw
  console.log(JSON.stringify(report))
  return ok ? 0 : 1
}

process.exit(main(process.argv.slice(2)))
