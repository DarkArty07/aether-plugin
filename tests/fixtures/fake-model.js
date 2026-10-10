'use strict'

// A fake Anthropic Messages API for the acceptance probes: it binds 127.0.0.1 on a free port,
// records every model request, and either refuses it (record mode) or answers it from a script.
//
//   node fake-model.js --out <dir> [--script <file.json>]
//
// <dir>/port        the port, as "<port>\n", written before "listening <port>" is printed
// <dir>/req-<n>.json  { url, body } of the n-th request (count_tokens requests are not saved)
// <dir>/fake.log    one JSON line per request: n, model, effort, first, k, reply
//
// The script is a JSON array of rules { match, replies }. The first rule whose `match` is a substring
// of the first user message answers replies[k], where k counts the tool results already sent back.
// A reply is { text }, { bash } (the Bash tool) or { tool, input }.

const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const USAGE = 'usage: fake-model.js --out <dir> [--script <file.json>]'
const MESSAGE_USAGE = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

function fail(message) {
  process.stderr.write(`fake-model: ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { out: null, script: null }
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if ((flag !== '--out' && flag !== '--script') || !value) fail(USAGE)
    args[flag.slice(2)] = value
  }
  if (!args.out) fail(USAGE)
  return args
}

function checkBlock(block, where) {
  const isObject = block && typeof block === 'object' && !Array.isArray(block)
  const kinds = isObject ? ['text', 'bash', 'tool'].filter((kind) => typeof block[kind] === 'string') : []
  if (kinds.length !== 1) fail(`${where} must be { text }, { bash } or { tool, input }`)
}

function loadScript(file) {
  let rules
  try {
    rules = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    return fail(`cannot read the script ${file}: ${error.message}`)
  }
  if (!Array.isArray(rules)) fail('the script must be a JSON array of rules')
  rules.forEach((rule, i) => {
    if (!rule || typeof rule.match !== 'string' || !Array.isArray(rule.replies)) {
      fail(`script rule ${i} must be { "match": string, "replies": array }`)
    }
    rule.replies.forEach((block, j) => checkBlock(block, `script rule ${i} reply ${j}`))
  })
  return rules
}

const asArray = (value) => (Array.isArray(value) ? value : [])

// The text of the first message, without its system reminders.
function firstText(body) {
  const message = asArray(body && body.messages)[0]
  if (!message) return ''
  const content = message.content
  const text =
    typeof content === 'string'
      ? content
      : asArray(content)
          .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
}

// The number of user messages that carry a tool result: how far the scripted conversation has gone.
function toolResultCount(body) {
  return asArray(body && body.messages).filter(
    (message) => message && message.role === 'user' && asArray(message.content).some((block) => block && block.type === 'tool_result'),
  ).length
}

// The scripted block as { kind: 'tool', name, input } or { kind: 'text', text }.
function resolveBlock(block) {
  if (typeof block.bash === 'string') return { kind: 'tool', name: 'Bash', input: { command: block.bash, description: 'fake model' } }
  if (typeof block.tool === 'string') return { kind: 'tool', name: block.tool, input: block.input || {} }
  return { kind: 'text', text: block.text }
}

function chooseBlock(rules, body, first, k) {
  if (asArray(body && body.tools).length === 0) return { text: 'ok' }
  const rule = rules.find((candidate) => first.includes(candidate.match))
  if (!rule) return { text: 'ok' }
  return rule.replies[k] || { text: 'done' }
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function streamBody(n, model, answer) {
  const tool = answer.kind === 'tool'
  const start = tool
    ? { type: 'tool_use', id: `toolu_${n}`, name: answer.name, input: {} }
    : { type: 'text', text: '' }
  const delta = tool
    ? { type: 'input_json_delta', partial_json: JSON.stringify(answer.input) }
    : { type: 'text_delta', text: answer.text }
  return [
    frame('message_start', {
      type: 'message_start',
      message: { id: `msg_${n}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: MESSAGE_USAGE },
    }),
    frame('content_block_start', { type: 'content_block_start', index: 0, content_block: start }),
    frame('content_block_delta', { type: 'content_block_delta', index: 0, delta }),
    frame('content_block_stop', { type: 'content_block_stop', index: 0 }),
    frame('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: 5 },
    }),
    frame('message_stop', { type: 'message_stop' }),
  ].join('')
}

function messageBody(n, model, answer) {
  const tool = answer.kind === 'tool'
  return {
    id: `msg_${n}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [tool ? { type: 'tool_use', id: `toolu_${n}`, name: answer.name, input: answer.input } : { type: 'text', text: answer.text }],
    stop_reason: tool ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: MESSAGE_USAGE,
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

function main() {
  const { out, script } = parseArgs(process.argv.slice(2))
  const rules = script ? loadScript(script) : null
  fs.mkdirSync(out, { recursive: true })
  let n = 0

  function handleMessages(req, res, raw) {
    n += 1
    let body = raw
    try {
      body = JSON.parse(raw)
    } catch {
      // not JSON: keep the raw string
    }
    fs.writeFileSync(path.join(out, `req-${n}.json`), JSON.stringify({ url: req.url, body }))
    const isObject = body && typeof body === 'object'
    const first = firstText(body)
    const k = toolResultCount(body)
    const model = isObject ? body.model : undefined
    const effort = (isObject && body.output_config && body.output_config.effort) || null
    const logLine = { n, model: model === undefined ? null : model, effort, first, k, reply: null }
    if (!rules) {
      fs.appendFileSync(path.join(out, 'fake.log'), `${JSON.stringify(logLine)}\n`)
      sendJson(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'fake model' } })
      return
    }
    const answer = resolveBlock(chooseBlock(rules, body, first, k))
    logLine.reply = answer.kind === 'tool' ? answer.name : 'text'
    fs.appendFileSync(path.join(out, 'fake.log'), `${JSON.stringify(logLine)}\n`)
    if (isObject && body.stream === true) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.end(streamBody(n, model, answer))
    } else {
      sendJson(res, 200, messageBody(n, model, answer))
    }
  }

  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const isMessages = req.method === 'POST' && req.url.startsWith('/v1/messages')
        if (isMessages && req.url.includes('count_tokens')) sendJson(res, 200, { input_tokens: 100 })
        else if (isMessages) handleMessages(req, res, Buffer.concat(chunks).toString('utf8'))
        else sendJson(res, 404, {})
      } catch (error) {
        process.stderr.write(`fake-model: ${error.stack}\n`)
        if (!res.headersSent) sendJson(res, 500, { type: 'error', error: { type: 'api_error', message: error.message } })
        else res.end()
      }
    })
  })

  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    fs.writeFileSync(path.join(out, 'port'), `${port}\n`)
    process.stdout.write(`listening ${port}\n`)
  })
  process.on('SIGTERM', () => process.exit(0))
}

main()
