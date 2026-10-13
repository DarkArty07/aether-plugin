# pw: hash and check passwords

- Date: 2026-10-13
- Status: Draft
- Intent: a command-line tool that hashes and checks passwords with bcrypt.

## Criteria

- C1: `pw hash <password>` prints a bcrypt hash of cost 12. Evidence: a test runs it and checks the hash with bcrypt.compare.
- C2: `pw check <password> <hash>` exits 0 on a match and 1 otherwise. Evidence: a test runs both cases.

## Requirements

- R1. `src/hash.js` exports `hashPassword(password) -> Promise<string>`, bcrypt cost 12. Serves: C1
- R2. `src/check.js` exports `checkPassword(password, hash) -> Promise<boolean>`. Serves: C2
- R3. `bin/pw` dispatches `hash` and `check`. Serves: C1, C2

## Irreversible actions

None.
