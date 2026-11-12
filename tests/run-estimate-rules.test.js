'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')
const AUTONOMOUS = read('skills', 'autonomous-runs', 'SKILL.md')
const USING = read('skills', 'using-aether', 'SKILL.md')

test('autonomous-runs requires per-part estimates with sources and a ceiling covering the estimate (#227)', () => {
  assert.match(
    AUTONOMOUS,
    /"Costo y tiempo estimados" gives one line per part — design, exam, swarm units, final reviews \(one per swarm launch\), delegate tasks — each with its source \(`runs\.jsonl` for units; `aether-report --seats` and earlier run reports for the rest\), or says no history exists for that part\./
  )
  assert.match(
    AUTONOMOUS,
    /The proposed dollar ceiling covers the estimate; when it cannot, the plan says which scope fits the ceiling so the owner chooses\./
  )
})

test('autonomous-runs Cost section describes what the figure really counts and warns on review per launch (#227, #252)', () => {
  assert.match(
    AUTONOMOUS,
    /The figure adds up every run of `aether-wt` that starts while the run is open: each swarm launch and each attempt of a delegate task on another harness, each with its lanes, the external seats you record, and every native agent of the session inside its window, the Lead's turns included\. Runs that overlap count the same requests once per run, so the figure can exceed what the session spent \(issue 252\)\. A delegate task on Claude counts only inside those windows: the hours ceiling is the real guard\./
  )
  assert.match(
    AUTONOMOUS,
    /Each swarm launch that ends with everything merged pays its own final review, so launching in batches pays one per batch/
  )
  assert.doesNotMatch(AUTONOMOUS, /not your own turns, nor the native Judge's, Writer's and Examiner's/)
  assert.doesNotMatch(AUTONOMOUS, /not delegate tasks/)
})

test('using-aether estimates by part from runs.jsonl and aether-report --seats, within size limit (#227)', () => {
  assert.match(USING, /by part \(design, exam, units, reviews\) from `runs\.jsonl` and `aether-report --seats`/)
  assert.doesNotMatch(USING, /from finalized `runs\.jsonl` in the plugin data directory/)
})

test('autonomous-runs gives worktree diary guidance near The diary (#239)', () => {
  assert.match(
    AUTONOMOUS,
    /After `EnterWorktree`, Claude Code refuses `Write` to the main checkout's diary; write the diary and brief with Bash there, or enter the worktree with `cd` instead of `EnterWorktree`\./
  )
})
