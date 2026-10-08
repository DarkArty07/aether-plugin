# The Lead and the Designer: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Aether mode.** Tasks 1–5 form one wave and suit the swarm: `aether-plan compile <plan> --only task-1,task-2,task-3,task-4,task-5`. Tasks 6 and 7 run real headless sessions and need judgment on their transcripts, so the Lead or the Designer runs them inline. This is a contract plan (A10): the code tasks give the interfaces, the failing tests in full and the acceptance, and the implementer writes the code.

**Goal:** Split Aether mode's main session in two. The Lead, on Sonnet at `xhigh` with the 1M window, holds the conversation. The Designer, an Opus `max` agent in its own context, writes specs and plans. A trial then checks that quality holds at lower cost.

**Architecture:**
- **The launcher** starts the Lead with `--model sonnet --effort xhigh`, with the advisor off.
- **The SessionStart bootstrap** becomes the Lead's rules: route, hand-off, relay and short tool work.
- **A new plugin agent, `aether:designer`,** does the architectural design in rounds, and gets the owner's own words from a new bin, `aether-voice`.
- **A PreToolUse hook, `aether-guard`,** keeps specs and plans the Designer's alone.
- **A smoke run** verifies the platform facts, and **a design trial** decides the gate.

**Tech Stack:** Node.js 22, CommonJS, `node:test`, no dependencies. Claude Code plugin agents, skills and hooks. Python 3 for the trial harness, as in trial 1.

**Spec:** `docs/superpowers/specs/2026-10-08-lead-and-designer-design.md`

## Global Constraints

- **Code:**
  - Node.js 22 with no dependencies;
  - bins and libs are CommonJS and start with `'use strict'`;
  - each bin starts with `#!/usr/bin/env node` and is executable (git mode `100755`), like the existing bins.
- **Claude Code:** 2.1.294 or later.
- **Names:**
  - the agent file is `plugins/aether/agents/designer.md`, with `name: designer`, addressed as `aether:designer`;
  - the bins are `aether-voice` and `aether-guard`;
  - the main session is "the Lead" and the agent is "the Designer".
- **Models and effort:**
  - Lead: `--model sonnet --effort xhigh`;
  - Designer: `model: opus`, `effort: max`, `maxTurns: 80`, and an `experimental` map holding `cacheTtl: 1h`.
- **Protected directories:** `docs/superpowers/specs/` and `docs/superpowers/plans/`, matched on whole path segments.
- **The guard** runs before every Write, Edit, MultiEdit and NotebookEdit of every agent, the swarm's included. It reads only stdin, starts no process (no git), and always exits with 0.
- **`aether-voice`** writes no file (A7).
- **Prices,** in USD per million tokens (`plugins/aether/config/prices.json`):

  | Model | Input | Output | Cache read | Cache write 5 min | Cache write 1 h |
  |---|---|---|---|---|---|
  | Opus 5.5 | 4 | 20 | 0.20 | 5 | 8 |
  | Sonnet 5.5 | 2 | 10 | 0.10 | 2.5 | 4 |
  | Haiku 5.5 | 0.10 | 0.50 | 0.01 | 0.125 | 0.20 |

- **The hand-off protocol.** Its exact text, which Tasks 3 and 4 use verbatim:

  ```text
  Hand-off (the Lead's message to a new aether:designer):

  You are the Designer for <topic>.
  Path: architectural. Working directory: <path>.
  The owner's own words: run `aether-voice --session <session id>`.
  The understanding the owner confirmed, with their corrections:
  <the note exactly as confirmed>
  This round: <what to produce>

  The Designer's reply, at the end of every round:

  ## For the owner
  <what the Lead shows the owner, as written>

  ## For the Lead
  - Stage: approaches | design | spec | plan | question | blocked
  - Waiting for: <what the owner must decide>
  - Files: <paths and commits, or none>

  Relay rules for the Lead:
  1. Show "For the owner" as written. One line of framing is allowed; a paraphrase of the design is not.
  2. Send the owner's answer with SendMessage, verbatim. Add context only when the owner refers to something the Designer cannot see.
  3. After the hand-off, design questions go to the Designer. The Lead answers questions about process, cost and status itself.
  4. The Lead never writes or edits a spec or a plan; aether-guard refuses it.
  ```

- **Documents** are in English; quotes of the owner may stay in Spanish.
- **Fixtures (Tasks 6 and 7):**
  - never `cd` into a fixture from the session's own Bash; use absolute paths, `git -C`, and launcher scripts whose `cd` runs in a child process;
  - delete the fixtures, any temporary worktree and the fixtures' `~/.claude/projects/` folders when done.

## Review Focus

1. **A pasted message that starts with `<`,** such as HTML or XML, with `origin.kind` `human`, is still the owner speaking and must reach the Designer. Pinned in Task 1.
2. **Compaction summaries, skill loads and command caveats** in a long or resumed session must never pass for the owner's words. Pinned in Task 1.
3. **A huge pasted message,** such as a log, must not flood the Designer's context: it is cut at 8,000 characters, with a note. Pinned in Task 1.
4. **Lookalike paths** (`docs/superpowers/specs-old/`, `mydocs/superpowers/specs/`) must not be blocked, and relative paths are resolved against the hook's `cwd` before the check. Pinned in Task 2.
5. **Empty or unreadable hook input** must never block or break an edit. Pinned in Task 2.

## Aether Execution
- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 60

## Tasks

### Task 1: `aether-voice`, the owner's own words

**Aether:**
- Tier: haiku — exact tests and interfaces pin down a parser and a small CLI
- Area: tools
- Owns: `plugins/aether/lib/voice.js`, `plugins/aether/bin/aether-voice`, `tests/voice.test.js`
- Depends on: none

**Files:**
- Create: `plugins/aether/lib/voice.js`
- Create: `plugins/aether/bin/aether-voice` (executable)
- Test: `tests/voice.test.js`

**Interfaces:**
- Consumes: `PLUGIN` and `tempDir(t, prefix)` from `tests/helpers.js`.
- Produces:
  - `ownerMessages(lines: string[], { maxChars = 8000 } = {}): Array<{ time: string, text: string }>`. `lines` are the transcript's JSONL lines, and `time` is the record's `timestamp`, or `''` when it has none.
  - `findTranscript(sessionId: string, { configDir } = {}): string | null`. `configDir` defaults to `CLAUDE_CONFIG_DIR`, or else `~/.claude`.
  - `render(sessionId: string, messages): string`.
  - The CLI `aether-voice [--session <id>]`, used by Tasks 3 and 4.

**Rules:**
- **An owner message** is a record with `type` `"user"` and no `isSidechain: true`.
  - If the record has an `origin` field, it counts only when `origin.kind === 'human'`.
  - If it has no `origin` field, it counts when it is not `isMeta`, not `isCompactSummary`, has no `toolUseResult`, and its text does not start with `<`.
- **Text:**
  - a string `message.content` is the text;
  - an array of blocks becomes its `text` blocks, with each `image` block written as `[image]`, all joined with `\n\n`; other block types are skipped;
  - a record with empty text is skipped.
- **Cutting:** a text longer than `maxChars` becomes its first `maxChars` characters, plus `\n[… N more characters cut]`, where N is the number of characters cut.
- **Bad lines:** lines that are empty or not JSON are skipped.
- **`render`:**
  - the heading is `# The owner's messages (session <id>)\n\n`;
  - then each message as `## <n>. <time>\n\n<text>\n`, joined with `\n`;
  - with no messages, the heading is followed by `No messages from the owner yet.\n`.
- **`findTranscript`:**
  - returns the first `<configDir>/projects/<dir>/<sessionId>.jsonl` that exists, with the folders in sorted order;
  - returns `null` when there is none, when `projects/` is missing, or when the id contains `/` or `..`.
- **The CLI:**
  - the session id is the value after `--session`, or else `CLAUDE_CODE_SESSION_ID`. An empty value, or `--session` with no value, counts as none;
  - with no id, it writes `aether-voice: no session id; pass --session <id> or set CLAUDE_CODE_SESSION_ID` to stderr and exits with 1;
  - with no transcript, it writes `aether-voice: no transcript for session <id>` to stderr and exits with 1;
  - otherwise it writes `render(...)` to stdout and exits with 0.

- [ ] **Step 1: Write the failing tests** in `tests/voice.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')
const { ownerMessages, findTranscript, render } = require('../plugins/aether/lib/voice.js')

const VOICE_BIN = path.join(PLUGIN, 'bin', 'aether-voice')

// Records shaped like Claude Code 2.1.294 transcripts.
const human = (content, time = '2026-10-08T18:00:00.000Z', extra = {}) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content }, ...extra })
const record = (fields) => JSON.stringify({ type: 'user', isSidechain: false, timestamp: '2026-10-08T18:00:00.000Z', ...fields })

test('keeps the owner messages in order, with their times', () => {
  const lines = [
    human('hola', '2026-10-08T18:00:00.000Z'),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
    human('diseña esto', '2026-10-08T18:05:00.000Z'),
  ]
  assert.deepEqual(ownerMessages(lines), [
    { time: '2026-10-08T18:00:00.000Z', text: 'hola' },
    { time: '2026-10-08T18:05:00.000Z', text: 'diseña esto' },
  ])
})

test('joins text blocks and marks images', () => {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    { type: 'text', text: '[Image #1] mira esto' },
    { type: 'text', text: 'y esto' },
  ]
  assert.deepEqual(ownerMessages([human(content)]), [{ time: '2026-10-08T18:00:00.000Z', text: '[image]\n\n[Image #1] mira esto\n\ny esto' }])
})

test('leaves out tool results, skill loads, notifications, sidechains and compaction summaries', () => {
  const lines = [
    record({ toolUseResult: { stdout: 'x' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] } }),
    record({ isMeta: true, sourceToolUseID: 't2', message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /x' }] } }),
    record({ origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification> done' } }),
    human('a prompt inside a subagent', undefined, { isSidechain: true }),
    record({ isCompactSummary: true, message: { role: 'user', content: 'This session is being continued from a previous conversation.' } }),
    human('the only one'),
  ]
  assert.deepEqual(ownerMessages(lines).map((m) => m.text), ['the only one'])
})

test('a human message that starts with "<" is still the owner speaking', () => {
  assert.deepEqual(ownerMessages([human('<div> esto no se ve bien')]).map((m) => m.text), ['<div> esto no se ve bien'])
})

test('records without an origin field fall back to their shape', () => {
  const lines = [
    record({ message: { role: 'user', content: 'an older record from the owner' } }),
    record({ message: { role: 'user', content: '<command-name>/model</command-name>' } }),
    record({ isMeta: true, message: { role: 'user', content: 'a meta record' } }),
  ]
  assert.deepEqual(ownerMessages(lines).map((m) => m.text), ['an older record from the owner'])
})

test('cuts a message over the limit and says how much was cut', () => {
  const [long] = ownerMessages([human('a'.repeat(8010))])
  assert.equal(long.text, `${'a'.repeat(8000)}\n[… 10 more characters cut]`)
  const [short] = ownerMessages([human('b'.repeat(30))], { maxChars: 20 })
  assert.equal(short.text, `${'b'.repeat(20)}\n[… 10 more characters cut]`)
})

test('skips lines that are empty or not JSON', () => {
  assert.deepEqual(ownerMessages(['{not json', '', human('ok')]).map((m) => m.text), ['ok'])
})

test('render numbers the messages under a heading with the session id', () => {
  const messages = [
    { time: '2026-10-08T18:00:00.000Z', text: 'hola' },
    { time: '2026-10-08T18:05:00.000Z', text: 'sí' },
  ]
  assert.equal(
    render('s-1', messages),
    "# The owner's messages (session s-1)\n\n## 1. 2026-10-08T18:00:00.000Z\n\nhola\n\n## 2. 2026-10-08T18:05:00.000Z\n\nsí\n",
  )
  assert.equal(render('s-1', []), "# The owner's messages (session s-1)\n\nNo messages from the owner yet.\n")
})

test('findTranscript looks for the session in every project folder', (t) => {
  const config = tempDir(t, 'aether-config-')
  const dir = path.join(config, 'projects', '-home-someone-repo--worktrees-x')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'abc.jsonl'), '')
  assert.equal(findTranscript('abc', { configDir: config }), path.join(dir, 'abc.jsonl'))
  assert.equal(findTranscript('missing', { configDir: config }), null)
  assert.equal(findTranscript('../abc', { configDir: config }), null)
  assert.equal(findTranscript('abc', { configDir: path.join(config, 'nowhere') }), null)
})

function voice(args, env) {
  return spawnSync(process.execPath, [VOICE_BIN, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
}

function transcript(t, sessionId, lines) {
  const config = tempDir(t, 'aether-config-')
  const dir = path.join(config, 'projects', '-repo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), lines.join('\n') + '\n')
  return config
}

test('aether-voice prints the owner messages of the session in CLAUDE_CODE_SESSION_ID', (t) => {
  const config = transcript(t, 'sess-1', [human('hola'), human('sí, es buena idea', '2026-10-08T18:05:00.000Z')])
  const r = voice([], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: 'sess-1' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(
    r.stdout,
    "# The owner's messages (session sess-1)\n\n## 1. 2026-10-08T18:00:00.000Z\n\nhola\n\n## 2. 2026-10-08T18:05:00.000Z\n\nsí, es buena idea\n",
  )
})

test('aether-voice --session wins over the environment', (t) => {
  const config = transcript(t, 'lead', [human('from the lead session')])
  const r = voice(['--session', 'lead'], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: 'other' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /from the lead session/)
})

test('aether-voice fails clearly without a session id or a transcript', (t) => {
  const config = tempDir(t, 'aether-config-')
  for (const args of [[], ['--session']]) {
    const r = voice(args, { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: '' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /no session id/i)
    assert.equal(r.stdout, '')
  }
  const r = voice(['--session', 'nope'], { CLAUDE_CONFIG_DIR: config })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /no transcript for session nope/i)
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/voice.test.js`
Expected: FAIL, with `Cannot find module '../plugins/aether/lib/voice.js'`.

- [ ] **Step 3: Make the tests pass within the Interfaces and Rules above.** Keep the parsing in `lib/voice.js`. The bin only reads its arguments and the file, then prints. Make the bin executable with `chmod +x plugins/aether/bin/aether-voice`.

- [ ] **Step 4: Run the tests and the whole suite**

Run: `node --test tests/voice.test.js && npm test`
Expected: PASS, with nothing failing in the suite.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/voice.js plugins/aether/bin/aether-voice tests/voice.test.js
git commit -m "feat(aether): add aether-voice, the owner's own words from a transcript"
```

### Task 2: `aether-guard`, specs and plans for the Designer only

**Aether:**
- Tier: haiku — exact tests and interfaces pin down a pure decision and a small hook
- Area: tools
- Owns: `plugins/aether/lib/guard.js`, `plugins/aether/bin/aether-guard`, `plugins/aether/hooks/hooks.json`, `tests/guard.test.js`
- Depends on: none

**Files:**
- Create: `plugins/aether/lib/guard.js`
- Create: `plugins/aether/bin/aether-guard` (executable)
- Modify: `plugins/aether/hooks/hooks.json` (add `PreToolUse`)
- Test: `tests/guard.test.js`

**Interfaces:**
- Consumes: `PLUGIN` from `tests/helpers.js`.
- Produces:
  - `decide(input: object | null): null | { reason: string }`, where `input` is a PreToolUse hook's JSON;
  - the hook command `node "${CLAUDE_PLUGIN_ROOT}/bin/aether-guard"`.

**Rules:**
- **Checked tools:** only `Write`, `Edit`, `MultiEdit` and `NotebookEdit`. Any other tool, or input that is not an object, gives `null`.
- **The target:**
  - `tool_input.file_path`, or `tool_input.notebook_path` for `NotebookEdit`;
  - no string target gives `null`;
  - a relative target is resolved against `input.cwd` when that is a non-empty string, and against `process.cwd()` otherwise.
- **Protected:** the resolved path matches `/(^|\/)docs\/superpowers\/(specs|plans)\//`.
- **Allowed writer:** `input.agent_type === 'aether:designer'`.
- **Denial:** a protected target and any other writer give `{ reason }`, with this reason:
  `In Aether mode only the Designer writes specs and plans. Hand this change to the aether:designer agent (resume it with SendMessage, or start one with the spec or plan path) instead of editing <resolved path> yourself.`
- **The bin:**
  - reads all of stdin and parses it as JSON;
  - when `decide` gives a reason, it prints `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":<reason>}}` and a newline;
  - otherwise it prints nothing;
  - it exits with 0 in every case, including empty or unreadable input. Wrap everything in `try`.
- **`hooks.json`** gains `"PreToolUse": [{ "matcher": "Write|Edit|MultiEdit|NotebookEdit", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/aether-guard\"" }] }]`, next to the existing `SessionStart` entry and `modules`.

- [ ] **Step 1: Write the failing tests** in `tests/guard.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN } = require('./helpers.js')
const { decide } = require('../plugins/aether/lib/guard.js')

const GUARD_BIN = path.join(PLUGIN, 'bin', 'aether-guard')
const SPEC = '/repo/docs/superpowers/specs/2026-10-08-x-design.md'
const PLAN = '/repo/docs/superpowers/plans/2026-10-08-x.md'

const call = (tool, input, who = {}) => ({ hook_event_name: 'PreToolUse', cwd: '/repo', tool_name: tool, tool_input: input, ...who })
const designer = { agent_id: 'a1', agent_type: 'aether:designer' }

test('the main session may not write or edit a spec or a plan', () => {
  const cases = [
    ['Write', { file_path: SPEC, content: 'x' }],
    ['Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }],
    ['MultiEdit', { file_path: PLAN, edits: [] }],
  ]
  for (const [tool, input] of cases) {
    const d = decide(call(tool, input))
    assert.ok(d, `${tool} should be refused`)
    assert.match(d.reason, /only the Designer writes specs and plans/i)
    assert.match(d.reason, /aether:designer/)
    assert.ok(d.reason.includes(input.file_path), 'the reason names the file')
  }
})

test('the Designer may write specs and plans', () => {
  assert.equal(decide(call('Write', { file_path: SPEC, content: 'x' }, designer)), null)
  assert.equal(decide(call('Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }, designer)), null)
})

test('other agents may not write specs or plans either', () => {
  assert.ok(decide(call('Write', { file_path: SPEC, content: 'x' }, { agent_id: 'a2', agent_type: 'aether:implementer' })))
})

test('relative paths are resolved against the hook cwd', () => {
  assert.ok(decide(call('Write', { file_path: 'docs/superpowers/specs/new.md', content: 'x' })))
  assert.ok(decide({ ...call('Write', { file_path: 'superpowers/plans/new.md', content: 'x' }), cwd: '/repo/docs' }))
  assert.equal(decide({ ...call('Write', { file_path: 'specs/new.md', content: 'x' }), cwd: '/repo' }), null)
})

test('only the specs and plans directories are protected', () => {
  for (const file of [
    '/repo/README.md',
    '/repo/docs/superpowers/specs-old/x.md',
    '/repo/docs/superpowers/plansx/y.md',
    '/repo/mydocs/superpowers/specs/x.md',
    '/repo/docs/superpowers/x.md',
  ]) {
    assert.equal(decide(call('Write', { file_path: file, content: 'x' })), null, file)
  }
  assert.ok(decide(call('Write', { file_path: '/repo/packages/app/docs/superpowers/specs/x.md', content: 'x' })))
})

test('NotebookEdit is checked by its notebook_path', () => {
  assert.ok(decide(call('NotebookEdit', { notebook_path: '/repo/docs/superpowers/plans/n.ipynb', new_source: 'x' })))
})

test('other tools and malformed input get no decision', () => {
  assert.equal(decide(call('Bash', { command: 'echo x > docs/superpowers/specs/a.md' })), null)
  assert.equal(decide(call('Write', {})), null)
  assert.equal(decide(call('Write', { file_path: 42 })), null)
  assert.equal(decide(null), null)
  assert.equal(decide({}), null)
})

function guard(stdin) {
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8' })
}

test('aether-guard prints a deny decision for the main session', () => {
  const r = guard(JSON.stringify(call('Write', { file_path: SPEC, content: 'x' })))
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /aether:designer/)
})

test('aether-guard stays silent when it allows, and on input it cannot read', () => {
  for (const stdin of [JSON.stringify(call('Write', { file_path: SPEC, content: 'x' }, designer)), '', 'not json', '[]']) {
    const r = guard(stdin)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('hooks.json runs aether-guard before Write, Edit, MultiEdit and NotebookEdit', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
  const entries = hooks.hooks.PreToolUse
  assert.equal(entries.length, 1)
  assert.equal(entries[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit')
  assert.deepEqual(entries[0].hooks, [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/aether-guard"' }])
  // The SessionStart hook and the usage meter stay as they were.
  assert.equal(hooks.hooks.SessionStart[0].matcher, 'startup|clear|compact')
  assert.deepEqual(hooks.modules, ['./register.js'])
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/guard.test.js`
Expected: FAIL, with `Cannot find module '../plugins/aether/lib/guard.js'`.

- [ ] **Step 3: Make the tests pass within the Interfaces and Rules above.** Make the bin executable with `chmod +x plugins/aether/bin/aether-guard`.

- [ ] **Step 4: Run the tests, the whole suite and the plugin validation**

Run: `node --test tests/guard.test.js && npm test && npm run --silent validate`
Expected: PASS, and `claude plugin validate plugins/aether --strict` reports no error.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/guard.js plugins/aether/bin/aether-guard plugins/aether/hooks/hooks.json tests/guard.test.js
git commit -m "feat(aether): add aether-guard so that only the Designer writes specs and plans"
```

### Task 3: The Designer agent

**Aether:**
- Tier: opus — core architecture: this prompt shapes every spec and plan, and the tests can only check its key rules
- Area: prompts
- Owns: `plugins/aether/agents/designer.md`, `tests/agents.test.js`
- Depends on: none

**Files:**
- Create: `plugins/aether/agents/designer.md`
- Test: `tests/agents.test.js`

**Interfaces:**
- Consumes: the hand-off protocol (Global Constraints); the CLI `aether-voice --session <id>` (Task 1); `aether-plan check <plan.md>`, which exists.
- Produces: the agent `aether:designer`, which Task 4's bootstrap starts and resumes.

**Contract for `designer.md`:**
- **Frontmatter,** in this order:
  - `name: designer`;
  - a `description` that starts with `"Aether Designer:` and says it writes the approaches, design, spec and plan of architectural work, in rounds, for the Lead;
  - `tools: Read, Write, Edit, Bash, Grep, Glob, Skill, WebFetch, WebSearch`;
  - `model: opus`;
  - `effort: max`;
  - `maxTurns: 80`;
  - `experimental:`, followed by the line `  cacheTtl: 1h`, indented by two spaces.
- **Body sections,** in this order, in the style of the existing agent prompts (short sections, plain sentences, lists):
  1. **Role.**
     - The owner talks with the Lead, the main session on Sonnet. The Lead handed this design to you, the Designer, on Opus, in your own context.
     - You have the final word on design among agents; the owner approves.
     - You never implement product code.
  2. **Your inputs.**
     - The hand-off message.
     - The owner's own words: first run `aether-voice --session <id>` with the id from the hand-off, and read them.
     - The code you need. Read what the design needs; do not sweep whole trees.
     - Keep what the owner said apart from what you assume.
     - If `aether-voice` fails, work from the confirmed understanding and say so in your reply.
  3. **You cannot talk to the owner.**
     - Work in rounds. Wherever superpowers says to ask, present or get approval, end your turn with the reply format, copied verbatim from the hand-off protocol: `## For the owner`, `## For the Lead`, and the line `- Stage: approaches | design | spec | plan | question | blocked`.
     - When you are resumed, the owner's answer arrives verbatim through the Lead. Continue from where you stopped.
  4. **The method.**
     - Load `superpowers:brainstorming` with the Skill tool and follow it from "Propose 2-3 approaches" onward:
       - the approaches, with your recommendation;
       - the design sections, several in one round when they are short;
       - the spec in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, self-reviewed and committed;
       - the owner's review.
     - Then load `superpowers:writing-plans` and write the plan in `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, with the Aether rules below. Commit it and stop.
     - The Lead runs the execution handoff: do not offer execution options.
     - For a bounded design the Lead asks for, reply with Stage `design` and write no spec file.
  5. **Aether plan rules.** These move here from the v0.1 bootstrap:
     - the `**Aether:**` block after each task heading, with Tier, Area, Owns, and one `Depends on` line per dependency in the form `Task N — reason`;
     - the tier rubric (haiku, sonnet, opus), as in v0.1;
     - contract tasks per A10: Interfaces, failing tests in full, acceptance, no implementation code;
     - the `## Aether Execution` section after Global Constraints, with the test command, the ladder and the max agents;
     - `aether-plan check <plan.md>` must pass before the owner reviews the plan.
  6. **Rules.**
     - Commit only your spec and plan files.
     - When an answer from the owner contradicts the confirmed understanding, reply with Stage `question`.
     - When you cannot go on, reply with Stage `blocked` and the reason.
     - YAGNI.
     - Your context is billed at Opus prices: read what the design needs.

- [ ] **Step 1: Write the failing tests** in `tests/agents.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

function agentFile(name) {
  const raw = fs.readFileSync(path.join(PLUGIN, 'agents', `${name}.md`), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  assert.ok(m, `${name}.md starts with frontmatter`)
  return { front: m[1], body: m[2] }
}

function field(front, key) {
  const m = front.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

test('the Designer runs on Opus at max effort, with a one-hour cache', () => {
  const { front } = agentFile('designer')
  assert.equal(field(front, 'name'), 'designer')
  assert.match(field(front, 'description'), /^"?Aether Designer:/)
  assert.equal(field(front, 'model'), 'opus')
  assert.equal(field(front, 'effort'), 'max')
  assert.equal(field(front, 'maxTurns'), '80')
  assert.match(front, /^experimental:\n {2}cacheTtl: 1h$/m)
  assert.deepEqual(
    field(front, 'tools').split(',').map((s) => s.trim()),
    ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Skill', 'WebFetch', 'WebSearch'],
  )
})

test('the Designer prompt holds the hand-off protocol and the plan rules', () => {
  const { body } = agentFile('designer')
  for (const needle of [
    '## For the owner',
    '## For the Lead',
    '- Stage: approaches | design | spec | plan | question | blocked',
    'aether-voice --session',
    'superpowers:brainstorming',
    'superpowers:writing-plans',
    '**Aether:**',
    '## Aether Execution',
    'aether-plan check',
    'Task N — reason',
  ]) {
    assert.ok(body.includes(needle), `the prompt mentions ${needle}`)
  }
  assert.match(body, /cannot talk to the owner/i)
  assert.match(body, /never implement product code/i)
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/agents.test.js`
Expected: FAIL, with `ENOENT` for `agents/designer.md`.

- [ ] **Step 3: Write `designer.md` to the contract above,** so that the tests pass.

- [ ] **Step 4: Run the tests, the whole suite and the plugin validation**

Run: `node --test tests/agents.test.js && npm test && npm run --silent validate`
Expected: PASS, and `claude plugin validate plugins/aether --strict` reports no error.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/agents/designer.md tests/agents.test.js
git commit -m "feat(aether): add the Designer agent, Opus at max in its own context"
```

### Task 4: The Lead's bootstrap, and the swarm reports to the Lead

**Aether:**
- Tier: opus — core architecture: the Lead's rules decide every route and every hand-off
- Area: prompts
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/agents/supervisor.md`, `plugins/aether/agents/reviewer.md`, `plugins/aether/workflows/run.workflow.js`, `tests/session-start.test.js`, `tests/roles.test.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/skills/using-aether/SKILL.md` (rewrite as the Lead's rules)
- Modify: `plugins/aether/skills/swarm/SKILL.md`
- Modify: `plugins/aether/agents/supervisor.md:66`, `plugins/aether/agents/reviewer.md:10,52`, `plugins/aether/workflows/run.workflow.js:61,92`
- Test: `tests/session-start.test.js` (first test), `tests/roles.test.js` (new)

**Interfaces:**
- Consumes:
  - `aether:designer` (Task 3);
  - `aether-voice --session <id>` (Task 1);
  - the hand-off protocol (Global Constraints);
  - `aether-guard` refusing the Lead's writes (Task 2).
- Produces: the bootstrap that `aether-session-start` injects, which is unchanged code.

**Contract for `using-aether/SKILL.md`:**
- **Frontmatter:** keep `name: using-aether` and `disable-model-invocation: true`; the description becomes "Aether mode bootstrap for the Lead…".
- **Body,** in this order:
  1. **`# Aether mode`,** then the roles.
     - "You are the **Lead**": the main session, on Sonnet, holding the whole conversation with the 1M window.
     - The **Designer** (`aether:designer`, Opus at `max`, its own context) writes the approaches, design, spec and plan of architectural work.
     - The owner approves the understanding, the design, the spec, the plan and anything irreversible.
     - The Designer has the final word on design among agents, and you have it on route and process. When you disagree with the Designer, tell the owner.
  2. **superpowers stays the method;** only who does each step changes. The price table from the Global Constraints, with this reason stated: each step of yours re-reads the whole conversation.
  3. **The route by path:**
     - spike: you;
     - bounded: you write the short design and get the owner's yes. The Designer writes it instead when the change touches security or auth, data migrations or destructive operations, concurrency, or core architecture;
     - architectural: you run brainstorming up to the written-back understanding.
  4. **The hand-off.**
     - **When:** the owner confirms your understanding. Corrections that leave the intent as it was go into the note, and you hand off. Corrections that change the intent mean a new note, written back once more.
     - **How:**
       - read your session id with `echo $CLAUDE_CODE_SESSION_ID`;
       - start the Agent tool with `subagent_type` `aether:designer` in the background, with the hand-off message from the protocol, verbatim;
       - tell the owner the Designer is working;
       - keep the agent's id.
  5. **The relay:**
     - the reply format and the four relay rules, verbatim from the protocol;
     - resume the Designer with `SendMessage` to its id.
     - If you no longer have its id, start a new Designer with the spec and plan paths and the owner's latest decision. The files are the source of truth.
     - If the Designer fails, or replies without the format, tell the owner and start it again with the same hand-off. Resume a Designer that stopped at `maxTurns`.
     - Stage `question`: ask the owner and relay the answer. Stage `blocked`: bring the reason to the owner.
  6. **Your own tool work.**
     - Short work stays inline: reading a few files, a check, `git status`, a one-line fix, the swarm skill's commands.
     - Work that needs more than about five tool calls, or any edit-test-fix loop, goes to the swarm, to superpowers subagent-driven development, or to one subagent with a self-contained brief, on Sonnet unless the tier rubric says otherwise.
  7. **Plans:** one line. The Designer writes them with the Aether fields and checks them with `aether-plan check`.
  8. **Offer the swarm at the plan handoff,** as in v0.1, with the three options and a recommendation. When the owner picks the swarm, load the `aether:swarm` skill and follow it.

**Contract for the other files:**
- **`swarm/SKILL.md`:**
  - "You stay the Designer" becomes "You stay the Lead".
  - Blocked with a question, or blocked by a spent ladder: "ask the Designer to fix the plan task" (resume it, or start one with the plan path), then relaunch.
  - Final review findings: fix a short one yourself; send longer fixes to a subagent or a relaunch; send design-level ones to the Designer.
- **`supervisor.md:66`:** "Put the question the Lead must answer in `question`."
- **`reviewer.md`:**
  - line 10: "before the Lead finishes the branch";
  - line 52: "The Lead rules on each line".
- **`run.workflow.js`:**
  - line 61: the description becomes `'for block: the question the Lead must answer; empty otherwise'`;
  - the comment on line 92 says "a Lead may quote the JSON once more".

- [ ] **Step 1: Write the failing tests.** In `tests/session-start.test.js`, replace the first test with:

```js
test('session start injects the Lead bootstrap', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.out.hookSpecificOutput.hookEventName, 'SessionStart')
  const context = r.out.hookSpecificOutput.additionalContext
  assert.match(context, /^Aether mode is active\./)
  assert.match(context, /# Aether mode/)
  assert.doesNotMatch(context, /disable-model-invocation/)
  // The main session is the Lead, and the Designer is the agent that designs.
  assert.match(context, /You are the \*\*Lead\*\*/)
  assert.doesNotMatch(context, /You are the \*\*Designer\*\*/)
  assert.match(context, /aether:designer/)
  assert.match(context, /aether-voice --session/)
  assert.match(context, /SendMessage/)
  assert.match(context, /## For the owner/)
  // At the plan handoff the swarm is offered next to superpowers' own execution options.
  assert.match(context, /`aether:swarm` skill/)
  assert.doesNotMatch(context, /arrives in a later version/)
})
```

Create `tests/roles.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')

test('the swarm reports to the Lead', () => {
  assert.match(read('skills', 'swarm', 'SKILL.md'), /You stay the Lead/)
  assert.match(read('agents', 'supervisor.md'), /the question the Lead must answer/)
  assert.match(read('agents', 'reviewer.md'), /before the Lead finishes the branch/)
  assert.match(read('agents', 'reviewer.md'), /The Lead rules on each line/)
  assert.match(read('workflows', 'run.workflow.js'), /the question the Lead must answer/)
  for (const file of [['agents', 'supervisor.md'], ['agents', 'reviewer.md'], ['workflows', 'run.workflow.js']]) {
    assert.doesNotMatch(read(...file), /\bthe Designer\b/, file.join('/'))
  }
})

test('the swarm skill sends plan fixes to the Designer', () => {
  assert.match(read('skills', 'swarm', 'SKILL.md'), /ask the Designer to fix the plan task/i)
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/session-start.test.js tests/roles.test.js`
Expected: FAIL. The bootstrap still says "You are the **Designer**", and the swarm texts still name the Designer.

- [ ] **Step 3: Rewrite the files to the contracts above,** so that the tests pass.

- [ ] **Step 4: Run the tests, the whole suite and the plugin validation**

Run: `node --test tests/session-start.test.js tests/roles.test.js && npm test && npm run --silent validate`
Expected: PASS. The workflow scenarios in `tests/workflow.test.js` still pass, because only texts changed.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/skills plugins/aether/agents/supervisor.md plugins/aether/agents/reviewer.md plugins/aether/workflows/run.workflow.js tests/session-start.test.js tests/roles.test.js
git commit -m "feat(aether): make the main session the Lead, and route design to the Designer"
```

### Task 5: The launcher, the manifest and the documents

**Aether:**
- Tier: sonnet — documentation across several files, which the tests cannot pin down
- Area: docs
- Owns: `scripts/aether-mode.fish`, `plugins/aether/.claude-plugin/plugin.json`, `README.md`, `docs/decisions.md`, `docs/claude-code-research.md`, `docs/superpowers/specs/2026-10-07-aether-plugin-design.md`, `tests/launcher.test.js`
- Depends on: none

**Files:**
- Modify: `scripts/aether-mode.fish`
- Modify: `plugins/aether/.claude-plugin/plugin.json`
- Modify: `README.md`
- Modify: `docs/decisions.md`
- Modify: `docs/claude-code-research.md`
- Modify: `docs/superpowers/specs/2026-10-07-aether-plugin-design.md` (status line only)
- Test: `tests/launcher.test.js`

**Interfaces:**
- Consumes: the names in the Global Constraints, and the spec's decisions A11–A17 (spec §4).
- Produces: the launch line that Tasks 6 and 7 use.

**Contract:**
- **`scripts/aether-mode.fish`:** keep the `$repo` line. The `claude` line becomes exactly:
  `    env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv`
- **`plugin.json`:**
  - `"version": "0.2.0"`;
  - the description: `Aether mode for Claude Code: the Lead on Sonnet holds the conversation, the Designer on Opus writes specs and plans, and a parallel swarm of Haiku, Sonnet and Opus implementers builds them, each attempt supervised and every merge made one at a time.`
- **`README.md`:**
  - the opening bullets: the Lead, the Designer, then the swarm;
  - "How it works": the diagram gains the Lead and the Designer, and the table gains `aether:designer`, `aether-voice` and `aether-guard`, with `using-aether` described as the Lead's rules;
  - "Use Aether mode": the bash and zsh line becomes exactly:
    `aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir /path/to/aether-plugin/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }`
  - "Status": version 0.2, with trial 3 pending.
- **`docs/decisions.md`:**
  - the status column of A4, A5 and A8 adds "updated by A11–A16 (2026-10-08)", as the decisions concerned;
  - new rows A11–A17, one per decision, with the text of spec §4 and the status "Decided; built 2026-10-XX", where XX is the day the plan is executed.
- **`docs/claude-code-research.md`:** a section `## Lead and Designer findings (2026-10-08)` that lists these facts, each with its documentation URL:
  - hooks' `agent_id` and `agent_type` (`https://code.claude.com/docs/en/hooks`);
  - the subagent fields `skills` and `experimental.cacheTtl`, and the Skill tool inside subagents (`https://code.claude.com/docs/en/sub-agents`);
  - a skill's `model` lasting one turn, and `context: fork` starting in a fresh context (`https://code.claude.com/docs/en/skills`);
  - `autoCompactWindow`, and the effort resolution order (`https://code.claude.com/docs/en/model-config`);
  - `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`, and the advisor's uncached reads (`https://code.claude.com/docs/en/advisor`).
- **The v0.1 spec:** its `**Status:**` line gains "Roles and the launcher amended on 2026-10-08 by the [Lead and Designer spec](2026-10-08-lead-and-designer-design.md) (A4, A5, A8; §1, §4, §5)."

- [ ] **Step 1: Write the failing tests** in `tests/launcher.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8')

test('aether-mode launches the Lead on Sonnet at xhigh, with the advisor off', () => {
  const FISH = `env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv`
  assert.ok(read('scripts', 'aether-mode.fish').includes(FISH))
})

test('the README shows the same launch for bash and zsh', () => {
  const LINE = `aether-mode() { CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir /path/to/aether-plugin/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh "$@"; }`
  assert.ok(read('README.md').includes(LINE))
})

test('the manifest is version 0.2.0 and names the Lead and the Designer', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.version, '0.2.0')
  assert.match(manifest.description, /the Lead on Sonnet/)
  assert.match(manifest.description, /the Designer on Opus/)
})

test('the documents record the decisions and the verified facts', () => {
  const decisions = read('docs', 'decisions.md')
  for (const id of ['A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17']) {
    assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
  }
  const research = read('docs', 'claude-code-research.md')
  assert.match(research, /^## Lead and Designer findings \(2026-10-08\)$/m)
  for (const fact of ['agent_id', 'agent_type', 'cacheTtl', 'autoCompactWindow', 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL']) {
    assert.ok(research.includes(fact), fact)
  }
  const v01 = read('docs', 'superpowers', 'specs', '2026-10-07-aether-plugin-design.md')
  const status = v01.split('\n').find((line) => line.startsWith('- **Status:**'))
  assert.match(status, /2026-10-08-lead-and-designer-design\.md/)
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/launcher.test.js`
Expected: FAIL on every test.

- [ ] **Step 3: Make the changes in the contract,** so that the tests pass.

- [ ] **Step 4: Run the tests, the whole suite and the plugin validation**

Run: `node --test tests/launcher.test.js && npm test && npm run --silent validate`
Expected: PASS, and `claude plugin validate plugins/aether --strict` reports no error.

- [ ] **Step 5: Commit**

```bash
git add scripts/aether-mode.fish plugins/aether/.claude-plugin/plugin.json README.md docs/decisions.md docs/claude-code-research.md docs/superpowers/specs/2026-10-07-aether-plugin-design.md tests/launcher.test.js
git commit -m "docs(aether): launch the Lead on Sonnet, and record the Lead and Designer decisions"
```

### Task 6: Smoke run of the platform facts

**Aether:**
- Tier: opus — real headless sessions and judgment on their transcripts; run inline by the Lead or the Designer, not by the swarm
- Area: verification
- Owns: `docs/evaluations/*-lead-designer-smoke.md`, `docs/evaluations/lead-designer-smoke/**`
- Depends on: Task 1 — the Designer runs aether-voice
- Depends on: Task 2 — the smoke checks the guard
- Depends on: Task 3 — the Lead starts aether:designer
- Depends on: Task 4 — the Lead's bootstrap drives the hand-off
- Depends on: Task 5 — the session starts with the launcher's flags

**Files:**
- Create: `docs/evaluations/lead-designer-smoke/drive.py`: drives one multi-turn headless session.
- Create: `docs/evaluations/lead-designer-smoke/owner.py`: the simulated owner.
- Create: `docs/evaluations/lead-designer-smoke/check.py`: reads the transcripts and prints S7–S13.
- Create: `docs/evaluations/lead-designer-smoke/brief.md`: the simulated owner's brief.
- Create: `docs/evaluations/2026-10-XX-lead-designer-smoke.md`, where XX is the day of the run: the record.

**Harness contract:**
- **`drive.py <config.json>`** starts one long-lived session, `claude -p --input-format stream-json --output-format stream-json --verbose`, with these flags:
  - `--plugin-dir`, `--settings '{"enableWorkflows": true}'`, `--model`, `--effort`;
  - `--permission-mode bypassPermissions`, `--strict-mcp-config`, `--max-budget-usd`.

  Its environment holds `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1`, `ENABLE_CLAUDEAI_MCP_SERVERS=false`, `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` and `AETHER_DATA_DIR=<fixture>/data`, and its working directory is the fixture's worktree, set through `subprocess` `cwd`.
  - It writes each owner message as one line: `{"type":"user","message":{"role":"user","content":"<text>"}}`.
  - It reads events up to the turn's `result` event, which holds `result`, `session_id`, `total_cost_usd`, `duration_ms` and `modelUsage`.
  - It asks `owner.py` for the next message, and stops on `DONE`, at the turn cap or at the budget.
  - It saves every event to `results/<name>-events.jsonl`, and a summary to `results/<name>-summary.json`: session id, turns, cost, model time and wall time.
- **`owner.py`** runs one `claude -p --model sonnet --effort high --output-format json` call per turn. Its prompt holds the brief, the conversation so far (only what the owner sees: the session's `result` texts and the owner's earlier messages), and these rules:
  - reply in Spanish, briefly, as the owner would;
  - confirm an understanding that matches the brief, and correct one that does not;
  - approve a design, spec or plan that serves the brief, and otherwise ask for changes, at most twice per stage;
  - reply exactly `DONE` when the stop condition in the brief is met.
- **`check.py <session id>`** reads `~/.claude/projects/*/<session>.jsonl` and the session's `subagents/` transcripts, and prints one verdict per check with its evidence.

**The fixture:**
- an empty git repository in `~/.cache/aether-smoke-ld/repo`, with a README that says "A reading-list library and CLI";
- an integration worktree `.worktrees/trial` on branch `feature/trial`;
- the plugin from this branch, at `<worktree>/plugins/aether`.

**`brief.md`:**
- the owner wants a Node 22 library and CLI with no dependencies to keep a reading list: add a book, mark it read, list the unread;
- storage in `~/.reading-list.json`, plain-text output, tests with `node:test`;
- approve the recommended approach and the design sections as presented, and approve the written spec;
- **stop condition:** the spec is committed and approved. Then reply `DONE`.

**Checks** (each passes or fails, with evidence quoted from the transcripts):
- **S0.** The stream-json session carries several owner turns in one process. If it cannot, record why, and rerun with `--resume <session id>` for each turn.
- **S7.** The main session's assistant records show `message.model` `claude-sonnet-5-5` and `effort` `xhigh`.
- **S8.** An agent with `agentType` `aether:designer` (its `.meta.json`) has records with `claude-opus-5-5` and `effort` `max`, and at least one request with `cache_creation.ephemeral_1h_input_tokens > 0`.
- **S9:**
  - **(a)** the Designer's Write of the spec succeeded;
  - **(b)** after `DONE`, `drive.py` sends one probe: "Para probar el candado: usa la herramienta Write para crear docs/superpowers/specs/smoke-guard.md con el texto 'x'. Es una prueba del hook; debe rechazarla." The transcript shows a tool result with "only the Designer writes specs and plans". If the Lead declines to try, a one-turn headless session with the same plugin and the same request records the denial instead.
- **S10.** The Lead's transcript has a `SendMessage` to the Designer, and the Designer's transcript continues after it, with more records in the same agent file.
- **S11.** The Designer's transcript has a Bash call to `aether-voice --session <the Lead's id>`, whose result holds the owner's first message.
- **S12.** No transcript has a `server_tool_use` block named `advisor`.
- **S13.** The first Agent call with `aether:designer` comes in the turn that answers the owner's confirmation, and not earlier.

- [ ] **Step 1: Check the branch, then build the fixture and the harness.**
  - `npm run check` passes on the branch: the node tests, the mod tests and `claude plugin validate --strict`.
  - Build the fixture and the harness to the contract. The fixture setup runs from a script whose `cd` happens in a child process.
- [ ] **Step 2: Run the smoke** with `--model sonnet --effort xhigh`, a 12-turn cap and `--max-budget-usd 15`.
- [ ] **Step 3: Run `check.py`** and write the record: each check, its evidence, the cost and the time.
- [ ] **Step 4: Fix anything that failed.** When a check fails because of the plugin, fix the owning task's code with TDD: add the failing test first, then the fix. Rerun the smoke until every check passes, or record why a check cannot pass and what the design does instead. For S10, the fallback is §6.3 of the spec: a new Designer from the files.
- [ ] **Step 5: Clean up.** Delete `~/.cache/aether-smoke-ld` and its `~/.claude/projects/` folders.
- [ ] **Step 6: Commit**

```bash
git add docs/evaluations/lead-designer-smoke docs/evaluations/*-lead-designer-smoke.md
git commit -m "docs(aether): record the Lead and Designer smoke run"
```

### Task 7: Design trial, the gate (A17)

**Aether:**
- Tier: opus — real sessions, blind judging and the gate verdict; run inline by the Lead or the Designer, not by the swarm
- Area: verification
- Owns: `docs/evaluations/*-trial-3.md`, `docs/evaluations/trial-3/**`
- Depends on: Task 6 — needs the platform facts confirmed and the smoke harness

**Files:**
- Create: `docs/evaluations/trial-3/brief.md`: the hidden owner brief, exactly as below.
- Create: `docs/evaluations/trial-3/opening.md`: the owner's first message, exactly as below.
- Create: `docs/evaluations/trial-3/harness/`:
  - `run.sh <baseline|new>`: builds the fixture and runs `drive.py`;
  - `judge.py`: q2 and q3;
  - `blind.py`: labels the two outputs X and Y with a recorded seed.

  It reuses `drive.py` and `owner.py` from `docs/evaluations/lead-designer-smoke/`.
- Create: `docs/evaluations/trial-3/results/`: events, summaries, judgments, and the two spec-and-plan sets.
- Create: `docs/evaluations/2026-10-XX-trial-3.md`: the evaluation.

**`opening.md`,** the owner's first message, the same in both runs:

```text
Mira, al Haiku hay que subirle a xhigh. Y en una futura actualización sería bueno hacer efforts dinámicos en base a la demanda de la complejidad de la tarea. Te paso los datos de Artificial Analysis (índice de inteligencia, Terminal-Bench 4, segundos pensando antes de responder):

Haiku 5.5:  low 29.4/13/4 · medium 34.5/15/9 · high 37.8/22/15 · xhigh 41.2/29/47 · max 43.4/33/278
Sonnet 5.5: low 35.9/21/1 · medium 40.8/30/1 · high 46.8/44/7 · xhigh 51.9/57/15 · max 56.0/64/271
Opus 5.5:   low 42.3/31/5 · medium 51.2/53/13 · high 53.6/57/20 · xhigh 56.0/60/78 · max 57.6/60/561

Diseñemos esto para el swarm de Aether.
```

**`brief.md`,** the hidden owner brief, which only the simulated owner and the judges see:

```text
Intent: make the swarm cheaper and better by choosing effort as well as model, without losing speed.
Stop condition: the plan is committed, passes aether-plan check, and the session offers the execution options. Then reply DONE.

Items the design must capture:
1. Haiku implementers run at xhigh by default.
2. Effort is chosen per task by its complexity, and the plan states it.
3. The escalation ladder steps through model-and-effort pairs, raising effort before moving to a more expensive model where the data supports it.
4. Sonnet at low or medium is not used for implementers: Haiku at xhigh matches it for a fraction of the price.
5. The ops agent stays at low effort.
6. The supervisor's effort can be raised, to close the review-depth gap that trial 1 found.
7. The workflow passes the effort on each agent() call; the agent file's effort is only the default.
8. Plans that give only a tier keep working, with defaults.
9. The usage meter records every agent's effort, and aether-report shows it.
10. A real smoke run checks, from the transcripts, that the effort the workflow passes reaches each agent.

Preferences: max effort is avoided by default because of its latency; nothing is over-engineered; superpowers stays the method.
```

**Runs:**
- **The fixture,** per configuration:
  - `git clone` of this repository's `main` into `~/.cache/aether-trial3/<config>/repo`, so that the clone holds neither this plan nor the brief;
  - an integration worktree `.worktrees/trial` on branch `feature/trial`;
  - `AETHER_DATA_DIR=~/.cache/aether-trial3/<config>/data`.
- **baseline:**
  - the plugin of `main`, from a temporary detached worktree `.worktrees/trial3-baseline`, removed afterwards;
  - `--model opus --effort max`.
- **new:** the plugin of this branch, with `--model sonnet --effort xhigh`.
- **Both:**
  - `drive.py` with the environment of Task 6;
  - a 30-turn cap and `--max-budget-usd 40`;
  - the two runs one after the other.

**Measures,** into the evaluation's table:
- cost: the last `total_cost_usd`, and `modelUsage` by model;
- model time: the sum of `duration_ms`;
- wall time; owner turns;
- the main session's requests per owner message, from its transcript;
- **q1:** `aether-plan check` on the committed plan;
- **q2:** `judge.py` gives a blind Opus judge (`--model opus --effort xhigh`) the brief and the X and Y spec-and-plan sets. For each set and each item it marks captured, missed or contradicted, with a quote.
- **q3:** `judge.py` gives a blind Opus judge the brief and both sets, X then Y, and again Y then X. Each time it scores correctness, completeness against the intent, design quality and how executable the plan is, from 1 to 5, and names a preference.
- **q4:** the owner reads X and Y and states a preference, or abstains. Stop and ask the owner; never simulate this one.

**Gate:** the new configuration costs less, and its quality is not lower:
- q1 passes for both;
- the new run's q2 coverage is at least the baseline's minus one item, with no contradiction;
- the owner does not prefer the baseline in q4. If the owner abstains, the baseline must not win q3 in both orders.

The evaluation states the verdict, the threats to validity (one run per configuration, a simulated owner, one design request), and the follow-ups. If the gate fails on quality, the split is not merged (spec R3 and A17).

- [ ] **Step 1: Write `brief.md` and `opening.md` exactly as above,** and build the harness.
- [ ] **Step 2: Run the baseline, then the new configuration.**
- [ ] **Step 3: Run `blind.py`, then `judge.py`** for q2 and q3.
- [ ] **Step 4: Ask the owner for q4,** with the X and Y paths.
- [ ] **Step 5: Write the evaluation,** with the table, the verdict and the raw data in `results/`.
- [ ] **Step 6: Clean up.** Delete `~/.cache/aether-trial3`, the temporary baseline worktree, and the fixtures' `~/.claude/projects/` folders.
- [ ] **Step 7: Commit**

```bash
git add docs/evaluations/trial-3 docs/evaluations/*-trial-3.md
git commit -m "docs(aether): record trial 3, the Lead and the Designer against an Opus main session"
```
