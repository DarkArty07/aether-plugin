'use strict'

// Dispatches and executes lane CLI commands for superdelegation and external harnesses.
// Called by bin/aether-lane to handle status, start, wait, result, pick, and seats.
// Family: lane.

const calls = require('./lane-calls.js')
const seats = require('./seats.js')
const seatCalls = require('./seat-calls.js')
const quota = require('./lane-quota.js')
const pick = require('./lane-pick.js')
const delegate = require('./lane-delegate.js')

const COMMANDS = {
  status: 'status <run> [--refresh]',
  start: 'start <run> <call> --role <role> --model <lane model> --effort <effort> --digest <digest> [--task <task>]',
  wait: 'wait <run> <call> [--max <seconds>]',
  result: 'result <run> <call>',
  stop: 'stop <run> [<call>]',
  pick: 'pick <run> <call> --role <role> --model <haiku|sonnet|opus> --effort <effort> [--exclude <id>[,<id>...]] [--author <family>]',
  took: 'took <run> <call> --by <native|harness:model> --cause <chosen|no-candidate|failed>',
}
const PAUSE_USAGE = 'pause --seconds <1 to 120>'
const USAGE = `usage: aether-lane ${[...Object.values(COMMANDS), delegate.DELEGATE_USAGE, PAUSE_USAGE, quota.USAGE].join(' | ')} | ${seats.USAGE.replace('usage: aether-lane ', '')} | ${Object.values(seatCalls.COMMANDS).join(' | ')}`

function requireArgs(verb, runId, call) {
  const needsCall = COMMANDS[verb].split(' ').includes('<call>')
  if (runId === undefined || (needsCall && call === undefined)) throw new Error(`usage: aether-lane ${COMMANDS[verb]}`)
}

function flags(args) {
  const parsed = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`)
    if (i + 1 >= args.length) throw new Error(`${arg} needs a value`)
    parsed[arg.slice(2)] = args[++i]
  }
  return parsed
}

function wantsRefresh(args) {
  if (args.length === 0) return false
  if (args.length === 1 && args[0] === '--refresh') return true
  throw new Error(`usage: aether-lane ${COMMANDS.status}`)
}

async function statusCommand(cwd, runId, args) {
  const refresh = wantsRefresh(args)
  const refreshed = refresh ? await calls.refreshStale(cwd, runId) : {}
  const latest = Object.fromEntries(Object.entries(refreshed).map(([name, done]) => [name, done.reading]))
  const view = calls.status(cwd, runId, { latest })
  for (const [name, done] of Object.entries(refreshed)) {
    if (Object.hasOwn(view.harnesses, name)) Object.assign(view.harnesses[name], { refreshed: done.refreshed, refreshMethod: done.method })
  }
  return view
}

function maxSeconds(value) {
  if (value === undefined) return null
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('--max needs a number of seconds')
  return seconds
}

function seatRoundCommand(verb, cwd, [id, ...rest]) {
  const name = verb.slice('seat-'.length)
  if (id === undefined) throw new Error(`usage: aether-lane ${seatCalls.COMMANDS[name]}`)
  if (name === 'stop') return seatCalls.stop(cwd, id)
  return seatCalls.wait(cwd, id, { maxSeconds: maxSeconds(flags(rest).max) })
}

async function command(argv, { cwd, env }) {
  const [verb, runId, call, ...rest] = argv
  if (Object.hasOwn(COMMANDS, verb)) requireArgs(verb, runId, call)
  if (verb === 'status') return statusCommand(cwd, runId, argv.slice(2))
  if (verb === 'start') return calls.start(cwd, runId, call, flags(rest))
  if (verb === 'wait') return calls.wait(cwd, runId, call, { maxSeconds: maxSeconds(flags(rest).max) })
  if (verb === 'result') return calls.result(cwd, runId, call)
  if (verb === 'stop') return calls.stop(cwd, runId, call ?? null)
  if (verb === 'pick') return pick.pickCommand(cwd, runId, call, flags(rest))
  if (verb === 'took') return pick.tookCommand(cwd, runId, call, flags(rest))
  if (verb === 'seat-start') return seatCalls.start(cwd, { ...flags(argv.slice(2)), seat: runId }, { env })
  if (verb === 'seat-wait' || verb === 'seat-stop') return seatRoundCommand(verb, cwd, argv.slice(1))
  throw new Error(USAGE)
}

function readStdin(stdin = process.stdin) {
  if (stdin.isTTY) return Promise.resolve('')
  return new Promise((resolve, reject) => {
    let data = ''
    stdin.setEncoding('utf8')
    stdin.on('data', (chunk) => {
      data += chunk
    })
    stdin.once('end', () => resolve(data))
    stdin.once('error', reject)
  })
}

async function main(argv, { cwd = process.cwd(), stdin = process.stdin, stdout = process.stdout, env = process.env } = {}) {
  if (argv[0] === '_runner') {
    await calls.runCall(cwd, argv[1], argv[2])
    return { exitCode: 0 }
  }
  if (argv[0] === '_seat') {
    await seatCalls.runSeat(cwd, argv[1])
    return { exitCode: 0 }
  }
  if (argv[0] === 'quota') {
    stdout.write(await quota.quotaCommand(argv.slice(1)))
    return { exitCode: 0 }
  }
  if (argv[0] === 'delegate') {
    stdout.write(`${JSON.stringify(await delegate.delegateCommand(cwd, flags(argv.slice(1))))}\n`)
    return { exitCode: 0 }
  }
  if (argv[0] === 'pause') {
    const { seconds, ...unknown } = flags(argv.slice(1))
    if (Object.keys(unknown).length > 0) throw new Error(`usage: aether-lane ${PAUSE_USAGE}`)
    stdout.write(`${JSON.stringify(await pick.pauseCommand(seconds))}\n`)
    return { exitCode: 0 }
  }
  if (argv[0] === 'seat') {
    const inputFn = () => readStdin(stdin)
    const { exitCode, value } = await seats.seatCommand(argv.slice(1), { input: inputFn })
    stdout.write(`${JSON.stringify(value)}\n`)
    return { exitCode }
  }
  stdout.write(`${JSON.stringify(await command(argv, { cwd, env }))}\n`)
  return { exitCode: 0 }
}

module.exports = {
  main,
}
