#!/usr/bin/env node
'use strict'

// A stand-in for the grok CLI in a headless run (`grok -p <prompt> --always-approve --model <m> --output-format json`).
// It acts out the directives it finds in its prompt, one per line, each starting with "FAKE-GROK: ", and prints what
// grok 1.0.41 prints (2026-10-13): one JSON object with `text`, which joins the words of every turn without a separator
// so the answer's JSON is the last object in it, `usage` (input_tokens, output_tokens, reasoning_tokens,
// cache_read_input_tokens, total_tokens) and `total_cost_usd`. Unlike the fake agy, it has no schema flag and no quota
// command: the quota is the billing lines in grok's log, which the test writes.
//
//   write <relative path> <text...>     writes "<text>\n" under the working directory
//   answer <json>                       the JSON object that ends its text
//   usage <input> <output> <reasoning> <cacheRead>   this turn's tokens (default 1000 200 0 500)
//   billing <percent>                   appends a `billing: fetched credits config` line to $HOME/.grok/logs/unified.jsonl
//                                       with creditUsagePercent <percent> and the period of the log's last line, as grok does when it fetches its credits config
//
// AETHER_FAKE_GROK_LOG, when set, gets one JSON line per call: { argv, cwd, marker, prompt }.

const fs = require('node:fs')
const path = require('node:path')

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}

if (argv[0] === '--version') {
  process.stdout.write('grok 1.0.41 (test) [stable]\n')
  process.exit(0)
}

const prompt = flag('-p') || ''

if (process.env.AETHER_FAKE_GROK_LOG) {
  fs.appendFileSync(process.env.AETHER_FAKE_GROK_LOG, `${JSON.stringify({ argv, cwd: process.cwd(), marker: process.env.AETHER_LANE_CALL || null, prompt })}\n`)
}

let structured = null
let turn = [1000, 200, 0, 500]
for (const line of prompt.split('\n')) {
  if (!line.startsWith('FAKE-GROK: ')) continue
  const [verb, ...rest] = line.slice('FAKE-GROK: '.length).split(' ')
  if (verb === 'write') {
    const target = path.join(process.cwd(), rest[0])
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, `${rest.slice(1).join(' ')}\n`)
  } else if (verb === 'answer') {
    structured = JSON.parse(rest.join(' '))
  } else if (verb === 'usage') {
    turn = rest.map(Number)
  } else if (verb === 'billing') {
    const file = path.join(process.env.HOME, '.grok', 'logs', 'unified.jsonl')
    // The same period as the line already in the log, so that the two readings are of one week.
    const last = JSON.parse(fs.readFileSync(file, 'utf8').trim().split('\n').pop())
    const config = { creditUsagePercent: Number(rest[0]), currentPeriod: last.ctx.config.currentPeriod }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), src: 'shell', pid: process.pid, ver: '1.0.41', lvl: 'info', msg: 'billing: fetched credits config', ctx: { config } })}\n`)
  }
}

const [input, output, reasoning, cacheRead] = turn
process.stdout.write(
  `${JSON.stringify({
    text: `I read the files.Found what was asked. ${structured ? JSON.stringify(structured) : 'Done.'}`,
    usage: { input_tokens: input, output_tokens: output, reasoning_tokens: reasoning, cache_read_input_tokens: cacheRead, total_tokens: input + output },
    total_cost_usd: 0.01,
  })}\n`,
)
