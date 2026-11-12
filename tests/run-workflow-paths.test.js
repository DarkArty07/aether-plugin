'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ladderCommand } = require('../plugins/aether/lib/wt-ladder.js')

const OPS_MODULE = path.join(__dirname, '..', 'plugins', 'aether', 'hooks', 'ops-command.mjs')

let parseOpsPrompt
test.before(async () => {
  ;({ parseOpsPrompt } = await import(OPS_MODULE))
})

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

function loadWorkflow() {
  const source = fs.readFileSync(path.join(PLUGIN, 'workflows', 'run.workflow.js'), 'utf8')
  const body = source.replace('export const meta', 'const meta')
  return new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'Date', 'Math', 'require', 'process', body)
}

function shellSplit(command) {
  const match = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
  return match.map((arg) => {
    if (arg.startsWith("'") && arg.endsWith("'")) return arg.slice(1, -1).replace(/'\\''/g, "'")
    if (arg.startsWith('"') && arg.endsWith('"')) return arg.slice(1, -1).replace(/\\"/g, '"')
    return arg
  })
}

function payloadOf(prompt) {
  const m = /^=== aether-lane payload: (.+) ===$/m.exec(prompt)
  return m ? { path: m[1], text: prompt.slice(m.index + m[0].length + 1) } : null
}

test('in a repository with spaces in its path, applyVerdict quotes --payload so the path reaches the command intact', async (t) => {
  const repo = makeRepo(t, { prefix: 'aether test ' })
  assert.ok(repo.dir.includes(' '), `repo path must contain a space: ${repo.dir}`)

  const args = compile(repo, plan([task(1)]))
  const capturedCommands = []
  let ladderVerdictResult = null

  const agent = async (prompt, opts = {}) => {
    const role = (opts.agentType || '').replace(/^aether:/, '')

    if (role === 'implementer') {
      return { status: 'DONE', summary: 'Implemented.', head: 'abc1234', tests: '3/3 pass', concerns: '', question: '' }
    }

    if (role === 'supervisor') {
      return {
        verdict: 'retry',
        findings: [{ severity: 'important', title: 'missing edge case', file: 'src/t1/a.js:3', evidence: 'gap' }],
        ruling: 'Retry: missing edge case.',
        guidance: 'handle edge case',
        question: '',
      }
    }

    if (role === 'ops') {
      const line = prompt.split('\n')[2] || ''
      capturedCommands.push({ prompt, line })

      if (line.includes('aether-wt gate')) {
        return { exitCode: 0, stdout: JSON.stringify({ pass: true, checks: 'pass', findings: [], detail: '', tests: '# pass 1', files: ['src/t1/a.js'] }) }
      }

      if (line.includes('aether-wt ladder') && line.includes('--verdict')) {
        const tokens = shellSplit(line)
        const payloadIdx = tokens.indexOf('--payload')
        const payloadArg = payloadIdx !== -1 ? tokens[payloadIdx + 1] : undefined
        const expectedFile = path.join(args.runDir, 'ladder', 'task-1-verdict.json')

        // Write the payload file as ops agent would before running ladder
        const payloadData = payloadOf(prompt)
        if (payloadData) {
          fs.mkdirSync(path.dirname(payloadData.path), { recursive: true })
          fs.writeFileSync(payloadData.path, payloadData.text, 'utf8')
        }

        const verdictIdx = tokens.indexOf('--verdict')
        const verdict = verdictIdx !== -1 ? tokens[verdictIdx + 1] : undefined
        const digestIdx = tokens.indexOf('--digest')
        const digest = digestIdx !== -1 ? tokens[digestIdx + 1] : undefined

        try {
          const ans = ladderCommand(args.repoRoot, args.runId, 'task-1', {
            verdict,
            payload: payloadArg,
            digest,
          })
          ladderVerdictResult = { ok: true, payloadArg, expectedFile, ans }
          return { exitCode: 0, stdout: JSON.stringify(ans) }
        } catch (err) {
          ladderVerdictResult = { ok: false, payloadArg, expectedFile, error: err.message }
          return { exitCode: 1, stdout: JSON.stringify({ error: err.message }) }
        }
      }

      if (line.includes('aether-wt ladder')) {
        const view = ladderCommand(args.repoRoot, args.runId, 'task-1')
        return { exitCode: 0, stdout: JSON.stringify(view) }
      }

      if (line.includes('aether-wt remove')) {
        return { exitCode: 0, stdout: JSON.stringify({ removed: true, patch: null }) }
      }

      if (line.includes('aether-wt sweep')) {
        return { exitCode: 0, stdout: JSON.stringify({ removedWorktrees: [], removedBranches: [] }) }
      }

      return { exitCode: 0, stdout: JSON.stringify({}) }
    }

    return null
  }

  const parallel = (thunks) => Promise.all(thunks.map((t) => t()))
  const pipeline = () => {}
  const phase = () => {}
  const log = () => {}

  const workflow = loadWorkflow()
  await workflow(agent, parallel, pipeline, phase, log, args, Date, Math, undefined, undefined)

  assert.ok(ladderVerdictResult, 'ladder verdict command should have been called')
  assert.equal(ladderVerdictResult.payloadArg, ladderVerdictResult.expectedFile, 'payload argument must reach command as one single intact argument')
  assert.equal(ladderVerdictResult.ok, true, ladderVerdictResult.error)
  const verdictLine = capturedCommands.map(({ line }) => line).find((line) => line.includes('--verdict'))
  assert.ok(verdictLine, 'a verdict command should have been sent through the ops agent')
  assert.ok(
    verdictLine.includes(`--payload '${ladderVerdictResult.expectedFile}'`),
    `the spaced payload must be quoted in the command: ${verdictLine}`,
  )
})


test('in a repository with spaces in its path, approved() quotes --payload after merge', async (t) => {
  const repo = makeRepo(t, { prefix: 'aether test approve ' })
  assert.ok(repo.dir.includes(' '), `repo path must contain a space: ${repo.dir}`)

  const args = compile(repo, plan([task(1)]))
  const verdicts = []

  const agent = async (prompt, opts = {}) => {
    const role = (opts.agentType || '').replace(/^aether:/, '')

    if (role === 'implementer') {
      return { status: 'DONE', summary: 'Implemented.', head: 'abc1234', tests: '3/3 pass' }
    }

    if (role === 'supervisor') {
      return { verdict: 'approve', findings: [], ruling: 'Approve: good.', guidance: '', question: '' }
    }

    if (role === 'reviewer') {
      return { verdict: 'ready', findings: [], declined: [], summary: 'Ready to merge.' }
    }

    if (role === 'ops') {
      const line = prompt.split('\n')[2] || ''

      if (line.includes('aether-wt gate')) {
        return { exitCode: 0, stdout: JSON.stringify({ pass: true, checks: 'pass', findings: [], files: ['src/t1/a.js'] }) }
      }

      if (line.includes('aether-wt ladder') && line.includes('--verdict')) {
        const tokens = shellSplit(line)
        const payloadIdx = tokens.indexOf('--payload')
        const payloadArg = payloadIdx !== -1 ? tokens[payloadIdx + 1] : undefined
        const expectedFile = path.join(args.runDir, 'ladder', 'task-1-verdict.json')

        const payloadData = payloadOf(prompt)
        if (payloadData) {
          fs.mkdirSync(path.dirname(payloadData.path), { recursive: true })
          fs.writeFileSync(payloadData.path, payloadData.text, 'utf8')
        }

        const verdictIdx = tokens.indexOf('--verdict')
        const verdict = verdictIdx !== -1 ? tokens[verdictIdx + 1] : undefined
        const digestIdx = tokens.indexOf('--digest')
        const digest = digestIdx !== -1 ? tokens[digestIdx + 1] : undefined

        try {
          const ans = ladderCommand(args.repoRoot, args.runId, 'task-1', { verdict, payload: payloadArg, digest })
          verdicts.push({ verdict, payloadArg, expectedFile, ok: true })
          return { exitCode: 0, stdout: JSON.stringify(ans) }
        } catch (err) {
          verdicts.push({ verdict, payloadArg, expectedFile, ok: false, error: err.message })
          return { exitCode: 1, stdout: JSON.stringify({ error: err.message }) }
        }
      }

      if (line.includes('aether-wt ladder')) {
        const view = ladderCommand(args.repoRoot, args.runId, 'task-1')
        return { exitCode: 0, stdout: JSON.stringify(view) }
      }

      if (line.includes('aether-wt merge')) {
        return { exitCode: 0, stdout: JSON.stringify({ merged: true, commit: 'merge-commit-1' }) }
      }

      if (line.includes('aether-wt status')) {
        return { exitCode: 0, stdout: JSON.stringify({ merged: true, commit: 'merge-commit-1', head: 'head-1' }) }
      }

      if (line.includes('aether-wt diff')) {
        return { exitCode: 0, stdout: JSON.stringify({ path: path.join(args.runDir, 'packages', 'final.diff'), base: 'base', head: 'head' }) }
      }

      if (line.includes('aether-wt remove')) {
        return { exitCode: 0, stdout: JSON.stringify({ removed: true, patch: null }) }
      }

      if (line.includes('aether-wt sweep')) {
        return { exitCode: 0, stdout: JSON.stringify({ removedWorktrees: [], removedBranches: [] }) }
      }

      return { exitCode: 0, stdout: JSON.stringify({}) }
    }

    return null
  }

  const parallel = (thunks) => Promise.all(thunks.map((t) => t()))
  const workflow = loadWorkflow()
  await workflow(agent, parallel, () => {}, () => {}, () => {}, args, Date, Math, undefined, undefined)

  const approveVerdict = verdicts.find((v) => v.verdict === 'approve')
  assert.ok(approveVerdict, 'approve verdict should be applied after merge')
  assert.equal(approveVerdict.payloadArg, approveVerdict.expectedFile)
  assert.equal(approveVerdict.ok, true, approveVerdict.error)
})

test('in a repository without spaces, applyVerdict leaves --payload bare so the mod still answers without a model', async (t) => {
  const repo = makeRepo(t)
  assert.ok(!repo.dir.includes(' '), `repo path must contain no space: ${repo.dir}`)

  const args = compile(repo, plan([task(1)]))
  const expectedFile = path.join(args.runDir, 'ladder', 'task-1-verdict.json')
  assert.ok(!/[^A-Za-z0-9._:=@/,-]/.test(expectedFile), `payload path must need no quoting: ${expectedFile}`)
  const verdictPrompts = []

  const agent = async (prompt, opts = {}) => {
    const role = (opts.agentType || '').replace(/^aether:/, '')

    if (role === 'implementer') {
      return { status: 'DONE', summary: 'Implemented.', head: 'abc1234', tests: '3/3 pass', concerns: '', question: '' }
    }

    if (role === 'supervisor') {
      return {
        verdict: 'retry',
        findings: [{ severity: 'important', title: 'missing edge case', file: 'src/t1/a.js:3', evidence: 'gap' }],
        ruling: 'Retry: missing edge case.',
        guidance: 'handle edge case',
        question: '',
      }
    }

    if (role === 'ops') {
      const line = prompt.split('\n')[2] || ''

      if (line.includes('aether-wt gate')) {
        return { exitCode: 0, stdout: JSON.stringify({ pass: true, checks: 'pass', findings: [], detail: '', tests: '# pass 1', files: ['src/t1/a.js'] }) }
      }

      if (line.includes('aether-wt ladder') && line.includes('--verdict')) {
        verdictPrompts.push(prompt)
        const tokens = line.split(' ')
        const payloadArg = tokens[tokens.indexOf('--payload') + 1]
        const verdict = tokens[tokens.indexOf('--verdict') + 1]
        const digest = tokens[tokens.indexOf('--digest') + 1]

        const payloadData = payloadOf(prompt)
        if (payloadData) {
          fs.mkdirSync(path.dirname(payloadData.path), { recursive: true })
          fs.writeFileSync(payloadData.path, payloadData.text, 'utf8')
        }

        try {
          const ans = ladderCommand(args.repoRoot, args.runId, 'task-1', { verdict, payload: payloadArg, digest })
          return { exitCode: 0, stdout: JSON.stringify(ans) }
        } catch (err) {
          return { exitCode: 1, stdout: JSON.stringify({ error: err.message }) }
        }
      }

      if (line.includes('aether-wt ladder')) {
        const view = ladderCommand(args.repoRoot, args.runId, 'task-1')
        return { exitCode: 0, stdout: JSON.stringify(view) }
      }

      if (line.includes('aether-wt remove')) {
        return { exitCode: 0, stdout: JSON.stringify({ removed: true, patch: null }) }
      }

      if (line.includes('aether-wt sweep')) {
        return { exitCode: 0, stdout: JSON.stringify({ removedWorktrees: [], removedBranches: [] }) }
      }

      return { exitCode: 0, stdout: JSON.stringify({}) }
    }

    return null
  }

  const parallel = (thunks) => Promise.all(thunks.map((t) => t()))
  const workflow = loadWorkflow()
  await workflow(agent, parallel, () => {}, () => {}, () => {}, args, Date, Math, undefined, undefined)

  assert.ok(verdictPrompts.length > 0, 'a verdict command should have been sent through the ops agent')
  for (const verdictPrompt of verdictPrompts) {
    const line = verdictPrompt.split('\n')[2] || ''
    assert.ok(
      line.includes(`--payload ${expectedFile} --digest`),
      `the payload must stay bare in an ordinary run: ${line}`,
    )
    assert.ok(!line.includes(`'${expectedFile}'`), `the payload must not be quoted in an ordinary run: ${line}`)
    const parsed = parseOpsPrompt(verdictPrompt)
    assert.notEqual(parsed, null, `the mod must still accept the unquoted verdict prompt: ${line}`)
    assert.equal(parsed.bin, 'aether-wt')
    assert.equal(parsed.cwd, args.repoRoot)
    assert.equal(parsed.args[parsed.args.indexOf('--payload') + 1], expectedFile)
  }
})
