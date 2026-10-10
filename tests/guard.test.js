'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { decide, irreversibleClass, redactCommand } = require('../plugins/aether/lib/guard.js')
const { markSession } = require('../plugins/aether/lib/session.js')
const { pendingFile, readPending } = require('../plugins/aether/lib/pending.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const GUARD_BIN = path.join(PLUGIN, 'bin', 'aether-guard')
const SPEC = '/repo/docs/superpowers/specs/2026-10-08-x-design.md'
const PLAN = '/repo/docs/superpowers/plans/2026-10-08-x.md'
const KIT_SPEC = '/repo/specs/001-login/spec.md'
const KIT_PLAN = '/repo/specs/001-login/plan.md'
const KIT_TASKS = '/repo/specs/001-login/tasks.md'
const CONSTITUTION = '/repo/.specify/memory/constitution.md'
const PROTECTED_FILES = [SPEC, PLAN, KIT_SPEC, KIT_PLAN, KIT_TASKS, CONSTITUTION]

const call = (tool, input, who = {}) => ({ hook_event_name: 'PreToolUse', cwd: '/repo', tool_name: tool, tool_input: input, ...who })
const lead = { agent_type: 'aether:lead' }
const writer = { agent_id: 'a2', agent_type: 'aether:writer' }
const designer = { agent_id: 'a1', agent_type: 'aether:designer' }
const implementer = { agent_id: 'a3', agent_type: 'aether:implementer' }
// Every agent that is neither the main session nor the Lead or the Writer.
const others = [
  implementer,
  { agent_id: 'a4', agent_type: 'aether:supervisor' },
  { agent_id: 'a5', agent_type: 'aether:reviewer' },
  { agent_id: 'a6', agent_type: 'aether:judge' },
  designer,
  { agent_id: 'a7', agent_type: 'general-purpose' },
  { agent_id: 'a8', agent_type: 'workflow-subagent' },
  { agent_id: 'a9' },
  { agent_type: 'aether:implementer' },
]

// The reason the guard gives an agent that may not write a protected file.
const refusal = (file) => `In Aether mode only the Lead and the Writer write specs, plans and tasks. Hand this change to the Lead, or to the aether:writer agent, instead of editing ${file} yourself.`
// The three tools the guard checks on one file.
const writes = (file) => [
  ['Write', { file_path: file, content: 'x' }],
  ['Edit', { file_path: file, old_string: 'a', new_string: 'b' }],
  ['MultiEdit', { file_path: file, edits: [] }],
]

test('the main session may write, edit and multi-edit the old and the new paths', () => {
  for (const file of PROTECTED_FILES) {
    for (const [tool, input] of writes(file)) {
      assert.equal(decide(call(tool, input)), null, `${tool} on ${file}`)
    }
  }
})

test('the Lead and the Writer may write, edit and multi-edit them too', () => {
  for (const who of [lead, writer]) {
    for (const file of PROTECTED_FILES) {
      for (const [tool, input] of writes(file)) {
        assert.equal(decide(call(tool, input, who)), null, `${tool} on ${file} by ${who.agent_type}`)
      }
    }
  }
})

test('every other agent is refused, and the reason names the file', () => {
  for (const who of others) {
    for (const file of PROTECTED_FILES) {
      for (const [tool, input] of writes(file)) {
        const d = decide(call(tool, input, who))
        assert.ok(d, `${tool} on ${file} by ${JSON.stringify(who)}`)
        assert.equal(d.reason, refusal(file))
      }
    }
  }
})

test('NotebookEdit is checked by its notebook_path', () => {
  const notebook = '/repo/docs/superpowers/plans/n.ipynb'
  assert.equal(decide(call('NotebookEdit', { notebook_path: notebook, new_source: 'x' }, writer)), null)
  assert.equal(decide(call('NotebookEdit', { notebook_path: notebook, new_source: 'x' }, implementer)).reason, refusal(notebook))
})

test('other tools and malformed input get no decision', () => {
  assert.equal(decide(call('Bash', { command: 'echo x > docs/superpowers/specs/a.md' }, implementer)), null)
  assert.equal(decide(call('Write', {}, implementer)), null)
  assert.equal(decide(call('Write', { file_path: 42 }, implementer)), null)
  assert.equal(decide(null), null)
  assert.equal(decide({}), null)
})

test('relative paths are resolved against the hook cwd', () => {
  assert.equal(decide(call('Write', { file_path: 'docs/superpowers/specs/new.md', content: 'x' }, implementer)).reason, refusal('/repo/docs/superpowers/specs/new.md'))
  assert.equal(decide({ ...call('Write', { file_path: 'superpowers/plans/new.md', content: 'x' }, implementer), cwd: '/repo/docs' }).reason, refusal('/repo/docs/superpowers/plans/new.md'))
  assert.equal(decide({ ...call('Write', { file_path: '001-login/spec.md', content: 'x' }, implementer), cwd: '/repo/specs' }).reason, refusal('/repo/specs/001-login/spec.md'))
  assert.equal(decide({ ...call('Write', { file_path: 'specs/new.md', content: 'x' }, implementer), cwd: '/repo' }), null)
})

test('only the old and the new protected places are protected', () => {
  for (const file of [
    '/repo/README.md',
    '/repo/docs/superpowers/specs-old/x.md',
    '/repo/docs/superpowers/plansx/y.md',
    '/repo/mydocs/superpowers/specs/x.md',
    '/repo/docs/superpowers/x.md',
    '/repo/.specify/constitution.md',
    '/repo/specify/memory/constitution.md',
    '/repo/.specify/memory/constitution.md.bak',
  ]) {
    assert.equal(decide(call('Write', { file_path: file, content: 'x' }, implementer)), null, file)
  }
  assert.ok(decide(call('Write', { file_path: '/repo/packages/app/docs/superpowers/specs/x.md', content: 'x' }, implementer)))
  assert.ok(decide(call('Write', { file_path: '/repo/packages/app/specs/002-api/tasks.md', content: 'x' }, implementer)))
})

test('a specs folder with no Spec Kit spec, plan or tasks file is allowed for every agent', () => {
  for (const file of [
    '/repo/specs/unit/foo.test.js',
    '/repo/specs/unit/spec.md',
    '/repo/src/specs/notes.md',
    '/repo/specs/1-login/spec.md',
    '/repo/specs/0001-login/spec.md',
    '/repo/specs/001/spec.md',
    '/repo/specs/001-login/notes.md',
    '/repo/specs/001-login/sub/spec.md',
    '/repo/specs/001-login/spec.md.bak',
    '/repo/myspecs/001-login/spec.md',
  ]) {
    for (const who of [{}, lead, writer, ...others]) {
      assert.equal(decide(call('Write', { file_path: file, content: 'x' }, who)), null, `${file} by ${JSON.stringify(who)}`)
    }
  }
})

test('the Spec Kit constitution is protected', () => {
  assert.equal(decide(call('Write', { file_path: CONSTITUTION, content: 'x' }, implementer)).reason, refusal(CONSTITUTION))
  assert.equal(decide(call('Edit', { file_path: CONSTITUTION, old_string: 'a', new_string: 'b' }, lead)), null)
})

test('a missing cwd falls back to the process cwd, and ".." is resolved before the check', () => {
  const missing = decide({ tool_name: 'Write', tool_input: { file_path: 'docs/superpowers/specs/x.md', content: 'x' }, ...implementer })
  assert.equal(missing.reason, refusal(path.resolve('docs/superpowers/specs/x.md')))
  assert.ok(decide(call('Write', { file_path: '/repo/x/../docs/superpowers/specs/a.md', content: 'x' }, implementer)))
  assert.equal(decide(call('Write', { file_path: '/repo/docs/superpowers/specs/../notes.md', content: 'x' }, implementer)), null)
  assert.ok(decide(call('Write', { file_path: '/repo/specs/001-login/../001-login/spec.md', content: 'x' }, implementer)))
  assert.equal(decide(call('Write', { file_path: '/repo/specs/001-login/../spec.md', content: 'x' }, implementer)), null)
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

// Runs the bin in a data directory where session s1 is an Aether session, unless marked is false.
function guard(t, stdin, { marked = true } = {}) {
  const data = tempDir(t, 'aether-data-')
  if (marked) markSession(data, 's1')
  const env = { ...process.env, AETHER_DATA_DIR: data }
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8', env })
}
const inSession = (input) => ({ session_id: 's1', ...input })

test('outside an Aether session the guard allows what it would refuse, autonomy files included', (t) => {
  for (const input of [
    call('Write', { file_path: SPEC, content: 'x' }, implementer),
    call('Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }, { agent_id: 'a2', agent_type: 'general-purpose' }),
    call('Write', { file_path: '/repo/.aether/autonomy/grants.json', content: '{}' }),
  ]) {
    const r = guard(t, JSON.stringify(inSession(input)), { marked: false })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('aether-guard prints a deny decision for an agent that may not write specs', (t) => {
  const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, implementer))))
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, refusal(SPEC))
})

test('aether-guard stays silent when it allows, and on input it cannot read', (t) => {
  for (const stdin of [
    JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }))),
    JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, writer))),
    '',
    'not json',
    '[]',
  ]) {
    const r = guard(t, stdin)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('in an Aether session the main session, the Lead and the Writer may write specs, and every other agent is refused', (t) => {
  for (const who of [{}, lead, writer]) {
    const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: KIT_SPEC, content: 'x' }, who))))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', JSON.stringify(who))
  }
  for (const who of others) {
    const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: KIT_SPEC, content: 'x' }, who))))
    assert.equal(r.status, 0, r.stderr)
    const out = JSON.parse(r.stdout)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny', JSON.stringify(who))
    assert.equal(out.hookSpecificOutput.permissionDecisionReason, refusal(KIT_SPEC))
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

test('a session id that is missing or could leave the data directory counts as no Aether session', (t) => {
  for (const id of [undefined, '', '../s1', 'a/b', 42]) {
    const r = guard(t, JSON.stringify({ ...call('Write', { file_path: SPEC, content: 'x' }, implementer), session_id: id }))
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
      'rm -fr ~',
      'rm -rf ~/x',
      'rm -rf $HOME',
      'rm -r -f $HOME/x',
      'rm --recursive --force "/"',
      'rm -rf ..',
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

test('a forced removal is risky only when its target is the root, a home, a parent or the current directory, or one of their children', () => {
  for (const target of [
    '/', '/*', '/etc', '/etc/', '/etc/*', '/home/',
    '~', '~/', '~/*', '~/.ssh', '~/.ssh/*',
    '$HOME', '$HOME/', '$HOME/*', '$HOME/.ssh',
    '${HOME}', '${HOME}/*', '${HOME}/.ssh',
    '..', '../', '../..', '../*', '../../*',
    '.', './', './*', '*',
  ]) {
    assert.equal(irreversibleClass(`rm -rf ${target}`), 'delete', target)
  }
  // A deeper path, such as a build folder or a unit's worktree, is not risky.
  for (const target of [
    '/tmp/build', '/tmp/build/', '/repo/.aether/worktrees/run/unit', '../x', '../../x', '~/x/y', '~/.ssh/id_rsa',
    '$HOME/x/y', '${HOME}/x/y', './dist', './dist/*', 'build', 'build/*', '*.log', '..x', '.hidden',
  ]) {
    assert.equal(irreversibleClass(`rm -rf ${target}`), null, target)
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

test('irreversibleClass reads past git options before the subcommand', () => {
  for (const command of [
    'git -C ../other push',
    'git -c user.name=x push origin main',
    'git -c k=v -C ../other push',
    'git --git-dir=.git/x push',
    'git --git-dir .git/x push',
    'git --work-tree=../wt push',
    'git --work-tree ../wt push',
    'git --no-pager push',
    'git --namespace ns --exec-path=/p -C x push',
    'sudo git -C ../other push',
  ]) {
    assert.equal(irreversibleClass(command), 'push', command)
  }
  assert.equal(irreversibleClass('git -C ../other branch -D old'), 'delete')
  assert.equal(irreversibleClass('git --no-pager reset --hard'), 'delete')
  assert.equal(irreversibleClass('git -C ../other status'), null)
})

test('a local git merge is not irreversible, and the push that publishes it is', () => {
  assert.equal(irreversibleClass('git merge feature/x'), null)
  assert.equal(irreversibleClass('git -C ../other merge main'), null)
  assert.equal(irreversibleClass('git --no-pager merge --no-ff x'), null)
  assert.equal(irreversibleClass('git merge main && git push'), 'push')
})

test('irreversibleClass drops the exec prefixes and their options, past sudo and env too', () => {
  for (const command of [
    'timeout 30 git push',
    'timeout -s KILL 30 git push',
    'timeout -s9 30 git push',
    'timeout -k 5 --signal=TERM 30 git push',
    'timeout --preserve-status 30 git push',
    'nice git push',
    'nice -n 10 git push',
    'nice -10 git push',
    'nohup git push origin main',
    'time git push',
    'time -p git push',
    'command git push',
    'command -p git push',
    'exec git push',
    'exec -a NAME git push',
    'nohup nice -n 5 timeout 10 git push',
    'sudo -u root git push',
    'sudo -H -E git push',
    'sudo -- git push',
    'sudo -u root env -u X FOO=1 git push',
    'env -i git push',
    'env -u NAME git push',
    'env -u BAR -i FOO=1 git push',
  ]) {
    assert.equal(irreversibleClass(command), 'push', command)
  }
  assert.equal(irreversibleClass('timeout 30 npm publish'), 'publish')
  assert.equal(irreversibleClass('nice -n 10 npm publish'), 'publish')
  assert.equal(irreversibleClass('timeout 30 git status'), null)
  assert.equal(irreversibleClass('nice -n 10 echo git push'), null)
})

test('irreversibleClass reads a subshell, a group, a substitution and a background job as segments', () => {
  assert.equal(irreversibleClass('(cd x && git push)'), 'push')
  assert.equal(irreversibleClass('{ git push; }'), 'push')
  assert.equal(irreversibleClass('{ echo x; } && npm publish'), 'publish')
  assert.equal(irreversibleClass('echo $(git push)'), 'push')
  assert.equal(irreversibleClass('echo `git push`'), 'push')
  assert.equal(irreversibleClass('echo x & git push'), 'push')
  assert.equal(irreversibleClass('npm publish&'), 'publish')
  // Quoted, or inside a word, the same characters are text.
  assert.equal(irreversibleClass('echo "(git push)"'), null)
  assert.equal(irreversibleClass("echo '`git push`'"), null)
  assert.equal(irreversibleClass('find . -exec echo {} \\;'), null)
  assert.equal(irreversibleClass('echo a{git,push}'), null)
  assert.equal(irreversibleClass('echo ${HOME}'), null)
})

// A command that runs the script `git push` through `levels` nested `bash -c` calls.
const nested = (script, levels) => (levels === 0 ? script : `bash -c ${JSON.stringify(nested(script, levels - 1))}`)

test('irreversibleClass classes the script that a shell or eval runs, down to three levels of nesting', () => {
  for (const command of [
    'bash -c "git push"',
    "sh -c 'git push origin main'",
    'bash -lc "git push"',
    'bash -xc "git push"',
    'bash --norc -c "git push"',
    'sudo bash -c "git push"',
    'bash -c "git status; git push"',
    'eval "git push"',
    'eval git push',
    'eval "eval \'git push\'"',
  ]) {
    assert.equal(irreversibleClass(command), 'push', command)
  }
  assert.equal(irreversibleClass('zsh -c "npm publish"'), 'publish')
  assert.equal(irreversibleClass('dash -c "npm publish"'), 'publish')
  assert.equal(irreversibleClass(nested('git push', 1)), 'push')
  assert.equal(irreversibleClass(nested('git push', 3)), 'push')
  assert.equal(irreversibleClass(nested('git push', 4)), null)
  for (const command of ['bash -c "echo git push"', 'bash script.sh', 'sh deploy.sh git push', 'bash -c', 'eval']) {
    assert.equal(irreversibleClass(command), null, command)
  }
})

test('redactCommand keeps only the subcommand of a credentials command', () => {
  assert.equal(redactCommand('gh secret set STRIPE_KEY --body sk_live_x', 'credentials'), 'gh secret set [arguments redacted]')
  assert.equal(redactCommand('sudo gh auth login --with-token < token.txt', 'credentials'), 'gh auth login [arguments redacted]')
  assert.equal(redactCommand('aws configure', 'credentials'), 'aws configure [arguments redacted]')
  assert.equal(redactCommand('npm test && bash -c "npm token create"', 'credentials'), 'npm token create [arguments redacted]')
})

test('redactCommand replaces a secret variable, a secret flag and a URL user-info', () => {
  assert.equal(redactCommand('NPM_TOKEN=abc npm publish', 'publish'), 'NPM_TOKEN=[redacted] npm publish')
  assert.equal(redactCommand('npm publish --otp 123456', 'publish'), 'npm publish --otp [redacted]')
  assert.equal(redactCommand('git push https://me:ghp_x@github.com/o/r.git main', 'push'), 'git push https://[redacted]@github.com/o/r.git main')
})

test('redactCommand covers every secret name and flag, both forms of a flag, and keeps the rest as it is spelled', () => {
  assert.equal(
    redactCommand('export db_pass=x my_secret="a b" API_KEY=k NODE_ENV=prod npm   publish', 'publish'),
    'export db_pass=[redacted] my_secret=[redacted] API_KEY=[redacted] NODE_ENV=prod npm   publish',
  )
  assert.equal(
    redactCommand('npm publish --passwd x --secret=y --api-key k --auth=a --token t --body b', 'publish'),
    'npm publish --passwd [redacted] --secret=[redacted] --api-key [redacted] --auth=[redacted] --token [redacted] --body [redacted]',
  )
  assert.equal(redactCommand('npm   publish --otp 123456  --tag  next', 'publish'), 'npm   publish --otp [redacted]  --tag  next')
  assert.equal(redactCommand('git push https://user@host.example/x.git', 'push'), 'git push https://[redacted]@host.example/x.git')
})

test('redactCommand leaves a command with nothing to redact as it is', () => {
  for (const command of ['git push origin main', 'npm publish --tag next', 'rm -rf build', 'NODE_ENV=prod npm run build', 'git log --author=me', 'echo "a; b"']) {
    assert.equal(redactCommand(command, irreversibleClass(command)), command)
  }
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

test('the first record keeps .aether/ out of git, so the owner\'s list is not committed', (t) => {
  const repo = makeRepo(t)
  const r = guardBash(t, 'git push origin main', { cwd: repo.dir })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readPending(repo.dir).length, 1)
  assert.ok(fs.readFileSync(path.join(repo.dir, '.git', 'info', 'exclude'), 'utf8').split('\n').includes('/.aether/'))
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('a git exclude file that cannot be written still lets the command through, and nothing is recorded', (t) => {
  const repo = makeRepo(t)
  const exclude = path.join(repo.dir, '.git', 'info', 'exclude')
  fs.rmSync(exclude, { force: true })
  fs.mkdirSync(exclude)
  const r = guardBash(t, 'git push origin main', { cwd: repo.dir, mode: 'enforce' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(pendingFile(repo.dir)), false)
})

test('the owner\'s list records a credentials command without its arguments, and never the secret', (t) => {
  const repo = makeRepo(t)
  const r = guardBash(t, 'gh secret set STRIPE_KEY --body sk_live_x', { cwd: repo.dir })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(readPending(repo.dir).map((e) => [e.class, e.command]), [['credentials', 'gh secret set [arguments redacted]']])
  assert.equal(fs.readFileSync(pendingFile(repo.dir), 'utf8').includes('sk_live_x'), false)
})

test('the owner\'s list records a push without its URL password and a publish without its secret values', (t) => {
  const repo = makeRepo(t)
  guardBash(t, 'git push https://me:ghp_x@github.com/o/r.git main', { cwd: repo.dir })
  guardBash(t, 'NPM_TOKEN=s3cretvalue npm publish --otp 424242', { cwd: repo.dir })
  assert.deepEqual(readPending(repo.dir).map((e) => e.command), [
    'git push https://[redacted]@github.com/o/r.git main',
    'NPM_TOKEN=[redacted] npm publish --otp [redacted]',
  ])
  const file = fs.readFileSync(pendingFile(repo.dir), 'utf8')
  for (const secret of ['ghp_x', 's3cretvalue', '424242']) assert.equal(file.includes(secret), false, secret)
})
