// Replays every routable delegation brief through typesafe/jev-1.14 (OpenRouter System One). Key from env, never printed. Resumable.
const fs = require('fs')
const DIR = (process.env.REPLAY_DIR || require('path').join(__dirname, 'out') + '/')
const KEY = process.env.OPENROUTER_API_KEY
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'aether-router-replay' }
const Q = {
  shape: { type: 'choice', instructions: 'What kind of work does this task ask the agent to do?', criteria: {
    lookup: 'Find specific facts in named files or sources; no synthesis',
    explore: "Read this project's code or documentation to explain how something works",
    survey: 'Research several external sources (web, APIs, vendors) and summarize findings',
    mechanical_edit: 'Apply an exactly specified edit',
    implement: 'Write or change code to meet a stated behavior',
    debug: 'Find the cause of a failure and fix it',
    audit: 'Check existing work against a specification or review it, and report discrepancies',
    design: 'Choose an architecture or approach among alternatives',
    evaluate: 'Grade or score given material against a rubric',
    other: null } },
  stakes: { type: 'score', instructions: 'If the OUTPUT of this task is wrong and nobody notices, what happens?', criteria: [
    'Nothing depends on it; it is trivially rechecked', 'A rerun or a correction by the requester', 'A decision is misled or users see the error',
    'Legal, medical, security or financial harm, data loss, or something irreversible'] },
  pinned_by_checks: { type: 'noul', instructions: 'Would automated checks (tests, a schema, an exact comparison) fully decide whether the output is correct?' },
  needs_judgment: { type: 'noul', instructions: 'Does the task require weighing sources or exercising judgment, rather than extracting stated facts?' },
  reads_a_lot: { type: 'score', instructions: 'How much material must the agent read to finish?', criteria: ['A few files or pages', 'Dozens of files or pages', 'A large corpus or an open-ended web search'] },
  edits_files: { type: 'noul', instructions: 'Does the task require creating or modifying files in a repository?' },
  many_steps: { type: 'noul', instructions: 'Will finishing the task take dozens of separate steps (reads, edits, command runs) rather than a few?' },
}
const rows = fs.readFileSync(DIR + 'corpus.jsonl', 'utf8').trim().split('\n').map(JSON.parse).filter((r) => !r.subagentType.startsWith('aether:') && r.prompt)
const OUT = DIR + 'jev-results.jsonl'
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : [])
const todo = rows.filter((r) => !done.has(r.id))
console.log('briefs:', rows.length, '| already done:', done.size, '| to do:', todo.length)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function one(r) {
  let last = ''
  for (let a = 0; a < 4; a++) {
    const t0 = Date.now()
    try {
      const res = await fetch('https://openrouter.ai/api/v1/systemone', { method: 'POST', headers: H, signal: AbortSignal.timeout(40000),
        body: JSON.stringify({ model: 'typesafe/jev-1.14', state: { task: r.description, brief: r.prompt }, questions: Q }) })
      const text = await res.text(), ms = Date.now() - t0
      if (!text.trim()) { last = 'empty ' + res.status; await sleep(800 * (a + 1)); continue }
      const j = JSON.parse(text)
      if (res.status === 429 || res.status >= 500) { last = 'http ' + res.status; await sleep(1500 * (a + 1)); continue }
      if (!res.ok || j.error) { last = 'err ' + JSON.stringify(j.error || j).slice(0, 160); break }
      const A = j.answers, pick = (q) => ({ score: q.score, p: q.probabilities, c: q.confidence })
      return { id: r.id, ms, attempts: a + 1, model: j.model, cost: j.usage && j.usage.cost, inTok: j.usage && j.usage.input_tokens,
        shape: { choice: A.shape.choice, p: A.shape.probabilities, c: A.shape.confidence }, stakes: pick(A.stakes), reads: pick(A.reads_a_lot),
        pinned: A.pinned_by_checks.noul, judgment: A.needs_judgment.noul, edits: A.edits_files.noul, steps: A.many_steps.noul }
    } catch (e) { last = e.name + ': ' + e.message; await sleep(1000 * (a + 1)) }
  }
  return { id: r.id, failed: last }
}
;(async () => {
  let i = 0, ok = 0, bad = 0
  async function worker() {
    while (i < todo.length) {
      const r = todo[i++]
      const out = await one(r)
      fs.appendFileSync(OUT, JSON.stringify(out) + '\n')
      out.failed ? bad++ : ok++
      if ((ok + bad) % 25 === 0) console.log('progress', ok + bad, '/', todo.length, 'ok', ok, 'failed', bad)
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker))
  console.log('FINISHED ok', ok, 'failed', bad)
})()
