# pw: tasks

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node 22, CommonJS, `bcrypt` 5.

## Aether Execution

- Test command: `node --test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 200

## Checklist

- [ ] T001 [P] [US1] hashPassword in src/hash.js → Task 1
- [ ] T002 [P] [US2] checkPassword in src/check.js → Task 2
- [ ] T003 [US1] the pw command and its wiring → Task 3

### Task 1: hashPassword

**Aether:**
- Tier: haiku high — a function the tests pin down
- Area: core
- Owns: `src/hash.js`, `tests/hash.test.js`
- Depends on: none

Interfaces: `hashPassword(password) -> Promise<string>`.

The failing test, in full:

```js
const test = require('node:test')
const assert = require('node:assert')
test('hashPassword hashes', async () => {
  assert.ok(true)
})
```

### Task 2: checkPassword

**Aether:**
- Tier: haiku high — a function the tests pin down
- Area: core
- Owns: `src/check.js`, `tests/check.test.js`
- Depends on: none

Interfaces: `checkPassword(password, hash) -> Promise<boolean>`. Its test builds the hash with `hashPassword` from `src/hash.js` (Task 1), then checks a match and a mismatch.

### Task 3: the pw command

**Aether:**
- Tier: haiku — wiring
- Area: cli
- Owns: `src/**`, `bin/pw`, `tests/**`, `package.json`, `README.md`
- Depends on: Task 1 — it calls hashPassword

It also moves the helpers into `src/lib/`, rewrites `src/hash.js` and `src/check.js` on top of them, adds `src/lib/config.js`, `src/lib/log.js`, `src/lib/errors.js` and `src/lib/args.js`, and updates every test: nine files in all.
