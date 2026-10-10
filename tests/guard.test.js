'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { decide, irreversibleClass } = require('../plugins/aether/lib/guard.js')
const { markSession } = require('../plugins/aether/lib/session.js')
const { pendingFile, readPending } = require('../plugins/aether/lib/pending.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

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

// Runs the bin in a data directory where session s1 is an Aether session, unless marked is false.
function guard(t, stdin, { marked = true } = {}) {
  const data = tempDir(t, 'aether-data-')
  if (marked) markSession(data, 's1')
  const env = { ...process.env, AETHER_DATA_DIR: data }
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8', env })
}
const inSession = (input) => ({ session_id: 's1', ...input })

test('aether-guard prints a deny decision for the main session', (t) => {
  const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }))))
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /aether:designer/)
})

test('aether-guard stays silent when it allows, and on input it cannot read', (t) => {
  for (const stdin of [JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, designer))), '', 'not json', '[]']) {
    const r = guard(t, stdin)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('hooks.json runs aether-guard before Write, Edit, MultiEdit and NotebookEdit, and before Bash', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
  const entries = hooks.hooks.PreToolUse
  const guardHook = [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/aether-guard"' }]
  assert.equal(entries.length, 2)
  assert.equal(entries[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit')
  assert.deepEqual(entries[0].hooks, guardHook)
  assert.equal(entries[1].matcher, 'Bash')
  assert.deepEqual(entries[1].hooks, guardHook)
  // The SessionStart hook and the usage meter stay as they were.
  assert.equal(hooks.hooks.SessionStart[0].matcher, 'startup|resume|clear|compact')
  assert.deepEqual(hooks.modules, ['./register.js'])
})

// From the final review of run 20261008-134400-d48f: pin Review Focus 4.
test('a missing cwd falls back to the process cwd, and ".." is resolved before the check', () => {
  assert.ok(decide({ tool_name: 'Write', tool_input: { file_path: 'docs/superpowers/specs/x.md', content: 'x' } }))
  assert.ok(decide(call('Write', { file_path: '/repo/x/../docs/superpowers/specs/a.md', content: 'x' })))
  assert.equal(decide(call('Write', { file_path: '/repo/docs/superpowers/specs/../notes.md', content: 'x' })), null)
})

const GRANTS = '/repo/.aether/autonomy/grants.json'
const RUN_STATE = '/repo/.aether/autonomy/auto-20261009-200000-ab12/run.json'

test('no agent may write the autonomy registry or a run state, the Designer included', () => {
  const agents = [{}, designer, { agent_id: 'a3', agent_type: 'aether:implementer' }]
  for (const file of [GRANTS, RUN_STATE]) {
    for (const agent of agents) {
      for (const [tool, input] of [
        ['Write', { file_path: file, content: '{}' }],
        ['Edit', { file_path: file, old_string: 'a', new_string: 'b' }],
        ['MultiEdit', { file_path: file, edits: [] }],
      ]) {
        const d = decide(call(tool, input, agent))
        assert.ok(d, `${tool} on ${file} by ${agent.agent_type || 'the Lead'}`)
        assert.match(d.reason, /written only by aether-autonomy/)
        assert.ok(d.reason.includes(file), 'the reason names the file')
      }
    }
  }
  assert.ok(decide(call('NotebookEdit', { notebook_path: GRANTS, new_source: 'x' })))
  assert.ok(decide({ ...call('Write', { file_path: 'autonomy/grants.json', content: '{}' }), cwd: '/repo/.aether' }))
})

test('the diary, the brief and lookalike paths stay writable', () => {
  for (const file of [
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/diary.md',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/brief.md',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/run.json.bak',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/sub/run.json',
    '/repo/.aether/autonomy/x/grants.json',
    '/repo/.aether/autonomy-old/grants.json',
    '/repo/.aether/grants.json',
  ]) {
    assert.equal(decide(call('Write', { file_path: file, content: 'x' })), null, file)
  }
})

test('outside an Aether session the guard allows what it would refuse, autonomy files included', (t) => {
  for (const input of [
    call('Write', { file_path: SPEC, content: 'x' }),
    call('Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }, { agent_id: 'a2', agent_type: 'general-purpose' }),
    call('Write', { file_path: '/repo/.aether/autonomy/grants.json', content: '{}' }),
  ]) {
    const r = guard(t, JSON.stringify(inSession(input)), { marked: false })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('in an Aether session every agent but the Designer is refused, general-purpose and workflow agents included', (t) => {
  const whos = [
    {},
    { agent_type: 'aether:lead' },
    { agent_id: 'a2', agent_type: 'general-purpose' },
    { agent_id: 'a3', agent_type: 'workflow-subagent' },
    { agent_id: 'a4', agent_type: 'aether:implementer' },
  ]
  for (const who of whos) {
    const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, who))))
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny', JSON.stringify(who))
  }
  assert.equal(guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, designer)))).stdout, '')
})

test('a session id that is missing or could leave the data directory counts as no Aether session', (t) => {
  for (const id of [undefined, '', '../s1', 'a/b', 42]) {
    const r = guard(t, JSON.stringify({ ...call('Write', { file_path: SPEC, content: 'x' }), session_id: id }))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', String(id))
  }
})

// Bash: the classifier first, then the bin's path that records a command or refuses it.

test('irreversibleClass gives the class of each listed form', () => {
  const forms = {
    push: ['git push', 'git push origin main', 'git push --force-with-lease origin feature/x'],
    'merge-main': ['gh pr merge 12 --squash'],
    publish: [
      'npm publish',
      'pnpm publish',
      'yarn publish',
      'yarn npm publish',
      'cargo publish',
      'twine upload dist/*',
      'gem push pkg.gem',
      'docker push app:1',
      'gh release create v1',
    ],
    deploy: [
      'kubectl apply -f x.yaml',
      'kubectl delete pod x',
      'terraform apply',
      'terraform destroy',
      'helm install web ./chart',
      'helm upgrade web ./chart',
      'fly deploy',
      'flyctl deploy --remote-only',
      'firebase deploy',
      'serverless deploy',
      'sls deploy --stage prod',
      'gcloud app deploy',
      'gcloud run deploy svc',
      'netlify deploy --prod',
      'netlify deploy --dir=dist --prod',
      'vercel --prod',
      'vercel deploy --prod',
    ],
    delete: [
      'git branch -D old',
      'git reset --hard',
      'git reset --hard HEAD~1',
      'git clean -f',
      'git clean -fd',
      'git clean -fdx',
      'git clean --force',
      'rm -rf /',
      'rm -rf /tmp/build',
      'rm -fr ~',
      'rm -rf ~/x',
      'rm -rf $HOME',
      'rm -r -f $HOME/x',
      'rm --recursive --force "/"',
      'rm -rf ..',
      'rm -rf ../x',
    ],
    credentials: [
      'gh auth login',
      'gh auth refresh',
      'gh auth token',
      'gh secret set TOKEN',
      'gh secret delete TOKEN',
      'npm token create',
      'aws configure',
      'aws iam create-access-key --user-name ci',
    ],
  }
  for (const [cls, commands] of Object.entries(forms)) {
    for (const command of commands) assert.equal(irreversibleClass(command), cls, command)
  }
})

test('irreversibleClass gives null to dry runs, quoted text, look-alikes and harmless forms', () => {
  for (const command of [
    'git push --dry-run',
    'git push -n origin x',
    'echo "git push"',
    "echo 'gh pr merge'",
    'git status && echo done',
    'git pushx',
    'npm publishing',
    'rm -rf build',
    'rm -rf ./dist',
    'rm -r notes',
    'rm -f notes',
    'kubectl get pods',
    'vercel',
    'git branch -d old',
    'git reset HEAD~1',
    'git clean -n',
    '',
    42,
    undefined,
  ]) {
    assert.equal(irreversibleClass(command), null, String(command))
  }
})

test('irreversibleClass reads each segment, past sudo, env and assignments, and never splits inside quotes', () => {
  assert.equal(irreversibleClass('npm test && git push'), 'push')
  assert.equal(irreversibleClass('cd x; sudo env FOO=1 npm publish'), 'publish')
  assert.equal(irreversibleClass('git status\ngit push'), 'push')
  assert.equal(irreversibleClass('git status || git push'), 'push')
  assert.equal(irreversibleClass('git status | git push'), 'push')
  assert.equal(irreversibleClass('FOO=1 BAR=2 git push'), 'push')
  assert.equal(irreversibleClass('git status && echo done && git push --dry-run'), null)
  assert.equal(irreversibleClass('echo "a; git push"'), null)
  assert.equal(irreversibleClass("echo 'a && git push'; git status"), null)
  // A backslash keeps the semicolon in its word; an escaped quote does not open a quote.
  assert.equal(irreversibleClass('echo a\\; git push'), null)
  assert.equal(irreversibleClass('echo \\"; git push'), 'push')
  // Quotes come off the words, as the shell takes them.
  assert.equal(irreversibleClass('"git" push'), 'push')
  assert.equal(irreversibleClass("git 'push' origin"), 'push')
  assert.equal(irreversibleClass('git \\\npush'), 'push')
})

const PUSH_QUOTE = 'apruebo push a origin main en esta ocasion'
const REASON = (cls) =>
  `Aether added this ${cls} command to the owner's list (.aether/pending.jsonl): it is irreversible and no grant covers it. Go on with the work that does not depend on it, and put it in your brief's "Espera tu sí".`

// Runs aether-guard on a Bash call from session s1 in cwd. The session is an Aether session unless marked is false.
function guardBash(t, command, { cwd, mode, marked = true, configDir = tempDir(t, 'aether-claude-') }) {
  const data = tempDir(t, 'aether-data-')
  if (marked) markSession(data, 's1')
  const env = { ...process.env, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir }
  delete env.AETHER_IRREVERSIBLE
  if (mode !== undefined) env.AETHER_IRREVERSIBLE = mode
  const stdin = JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } })
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8', env })
}

// A transcript with one message from the owner, which a grant's quote is verified against.
function ownerTranscript(configDir, sessionId, text) {
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  const message = {
    type: 'user',
    isSidechain: false,
    origin: { kind: 'human' },
    timestamp: '2026-10-09T19:32:31.611Z',
    message: { role: 'user', content: text },
  }
  fs.writeFileSync(path.join(folder, `${sessionId}.jsonl`), JSON.stringify(message) + '\n')
}

test('an irreversible command that no grant covers is recorded, and allowed in log mode', (t) => {
  const repo = makeRepo(t)
  const r = guardBash(t, 'git push origin main', { cwd: repo.dir })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  const entries = readPending(repo.dir)
  assert.equal(entries.length, 1)
  const { time, ...rest } = entries[0]
  assert.equal(typeof time, 'number')
  assert.deepEqual(rest, { session: 's1', class: 'push', command: 'git push origin main', cwd: repo.dir, mode: 'log' })
})

test('the mode is enforce only when AETHER_IRREVERSIBLE is exactly enforce', (t) => {
  const repo = makeRepo(t)
  for (const mode of ['Enforce', 'on', '']) {
    assert.equal(guardBash(t, 'git push', { cwd: repo.dir, mode }).stdout, '', mode)
  }
  assert.deepEqual(readPending(repo.dir).map((e) => e.mode), ['log', 'log', 'log'])
})

test('in enforce mode the same command is refused with the reason that names its class, and recorded as enforce', (t) => {
  const repo = makeRepo(t)
  const r = guardBash(t, 'git push origin main', { cwd: repo.dir, mode: 'enforce' })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON('push') },
  })
  assert.deepEqual(readPending(repo.dir).map((e) => e.mode), ['enforce'])
})

test('a command outside the classes is allowed silently and recorded nowhere', (t) => {
  const repo = makeRepo(t)
  for (const mode of [undefined, 'enforce']) {
    const r = guardBash(t, 'git status', { cwd: repo.dir, mode })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
  assert.equal(fs.existsSync(pendingFile(repo.dir)), false)
})

test('outside an Aether session a push is allowed silently and recorded nowhere', (t) => {
  const repo = makeRepo(t)
  const r = guardBash(t, 'git push origin main', { cwd: repo.dir, marked: false, mode: 'enforce' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(pendingFile(repo.dir)), false)
})

test('outside a git repository a push is allowed silently and nothing is written', (t) => {
  const plain = tempDir(t, 'aether-plain-')
  const r = guardBash(t, 'git push origin main', { cwd: plain, mode: 'enforce' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(path.join(plain, '.aether')), false)
})

test('a grant that covers the command lets it through silently, in either mode, and records nothing', (t) => {
  const repo = makeRepo(t)
  const configDir = tempDir(t, 'aether-claude-')
  ownerTranscript(configDir, 's1', PUSH_QUOTE)
  assert.equal(autonomy.grant(repo.dir, { class: 'push', quote: PUSH_QUOTE, session: 's1' }, { configDir }).ok, true)
  for (const mode of [undefined, 'enforce']) {
    const r = guardBash(t, 'git push origin main', { cwd: repo.dir, mode, configDir })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
  assert.equal(fs.existsSync(pendingFile(repo.dir)), false)
})

test('a session grant for another session does not cover this one', (t) => {
  const repo = makeRepo(t)
  const configDir = tempDir(t, 'aether-claude-')
  ownerTranscript(configDir, 's2', PUSH_QUOTE)
  assert.equal(autonomy.grant(repo.dir, { class: 'push', quote: PUSH_QUOTE, session: 's2', scope: 'session' }, { configDir }).ok, true)
  const r = guardBash(t, 'git push origin main', { cwd: repo.dir, configDir })
  assert.equal(r.stdout, '')
  assert.deepEqual(readPending(repo.dir).map((e) => [e.session, e.mode]), [['s1', 'log']])
})

test('a grant registry that cannot be read allows the command and records nothing', (t) => {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, '.aether', 'autonomy'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'autonomy', 'grants.json'), '{ not json')
  const r = guardBash(t, 'git push origin main', { cwd: repo.dir, mode: 'enforce' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(pendingFile(repo.dir)), false)
})

