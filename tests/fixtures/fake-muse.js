#!/usr/bin/env node
'use strict'

// A stand-in for the muse CLI in a headless run (`muse exec --json ...`). `--version` prints what muse 1.4.11 prints.
// `exec` acts out a script, the JSON text of AETHER_FAKE_MUSE_SCRIPT:
//
//   { stdout?, stderr?, exit?, files?: { <path relative to the working directory>: <text> }, sleepMs?, child?: boolean }
//
// It appends to AETHER_FAKE_MUSE_LOG, when set, one JSON line per call: { argv, cwd, metaApiKey, home }. It writes
// `files`; with `child` it starts a detached child that never ends and writes its pid to AETHER_FAKE_MUSE_CHILD_PID;
// it waits `sleepMs`, prints `stdout` and `stderr`, and exits with `exit` (0 by default). Any other command exits 2.

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const argv = process.argv.slice(2)

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(2)
}

function readScript() {
  const source = process.env.AETHER_FAKE_MUSE_SCRIPT
  return source ? JSON.parse(source) : {}
}

function write(stream, text) {
  return new Promise((resolve) => (text ? stream.write(text, resolve) : resolve()))
}

async function exec() {
  const script = readScript()
  if (process.env.AETHER_FAKE_MUSE_LOG) {
    const entry = { argv, cwd: process.cwd(), metaApiKey: Boolean(process.env.META_API_KEY), home: process.env.HOME }
    fs.appendFileSync(process.env.AETHER_FAKE_MUSE_LOG, `${JSON.stringify(entry)}\n`)
  }
  for (const [file, text] of Object.entries(script.files ?? {})) {
    const target = path.resolve(process.cwd(), file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, text)
  }
  if (script.child) {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' })
    child.unref()
    if (process.env.AETHER_FAKE_MUSE_CHILD_PID) fs.writeFileSync(process.env.AETHER_FAKE_MUSE_CHILD_PID, String(child.pid))
  }
  if (script.sleepMs) await new Promise((resolve) => setTimeout(resolve, script.sleepMs))
  await write(process.stdout, script.stdout)
  await write(process.stderr, script.stderr)
  process.exit(script.exit ?? 0)
}

if (argv[0] === '--version') {
  process.stdout.write('Muse Code 1.4.11 (1.4.11-R6667.1)\n')
} else if (argv[0] === 'exec') {
  exec()
} else {
  fail('unknown command')
}
