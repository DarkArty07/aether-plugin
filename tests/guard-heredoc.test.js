'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { irreversibleClass, irreversibleClasses } = require('../plugins/aether/lib/guard.js')

test('irreversibleClasses lists every class of the line once, in order (R1)', () => {
  assert.deepEqual(irreversibleClasses('git push origin main && npm publish'), ['push', 'publish'])
  assert.deepEqual(irreversibleClasses('npm publish; npm publish --tag next | cat'), ['publish'])
  assert.deepEqual(irreversibleClasses('echo $(gh pr merge 7) && rm -rf ~ && git push'), ['merge-main', 'delete', 'push'])
  assert.deepEqual(irreversibleClasses('ls -la'), [])
  assert.equal(irreversibleClass('git push origin main && npm publish'), 'push')
  assert.equal(irreversibleClass('ls -la'), null)
})

test('a shell that takes its script from a heredoc is read like bash -c (R2)', () => {
  for (const [command, cls] of [
    ["bash <<'EOF'\nnpm publish\nEOF", 'publish'],
    ['sh <<-EOF\n\tgit push origin main\n\tEOF', 'push'],
    ['env bash <<EOF\ngh pr merge 7\nEOF', 'merge-main'],
    ['zsh <<"END"\nnpm publish\nEND', 'publish'],
    ['dash <<\\END\nkubectl apply -f x.yaml\nEND', 'deploy'],
    ['bash -s <<EOF\nnpm publish\nEOF', 'publish'],
    ["bash <<'A'\nbash <<'B'\nnpm publish\nB\nA", 'publish'],
    ["bash <<'EOF' | tee out.log\ngit push origin main\nEOF", 'push'],
  ]) {
    assert.equal(irreversibleClass(command), cls, command)
  }
})

test('a heredoc that no shell runs as a script stays text (R2)', () => {
  for (const command of [
    "cat <<'EOF'\nnpm publish\nEOF",
    "bash script.sh <<'EOF'\nnpm publish\nEOF",
    'bash -c "echo ok" <<EOF\nnpm publish\nEOF',
    "git commit -F - <<'EOF'\nfix: do not npm publish\nEOF",
  ]) {
    assert.equal(irreversibleClass(command), null, command)
  }
  assert.equal(irreversibleClass("bash <<'EOF'\necho hi\nEOF\nnpm publish"), 'publish')
})
