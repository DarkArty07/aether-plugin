# Three tests of the Examiner's exam were wrong, and one of them could never fail

**Type:** bug (Examiner, `aether-exam`)
**Date:** 2026-10-16
**Found in:** the first run of the exam of `specs/006-delegate-router` on its build, the Lead's session 56b71739
**Status:** open
**Update 2026-10-19, branch `fix/bug-issues`:** proposals 1 and 2 are in `agents/examiner.md`: a test that runs a nested Node runner clears `NODE_TEST_CONTEXT`; a test that expects a failure is shown red on a deliberately broken input before it is trusted; headings, flags and names are found by what the requirement asks under any plausible spelling, with a command's flags read from its usage, never guessed. Proposal 3 is the instruction form: the tests are written before any helper library. `maxTurns` stays 40. The acceptance's rerun of the 006 exam needs a model round and has not been run.
**GitHub:** [#34](https://github.com/DarkArty07/aether-plugin/issues/34) (private repository)

## What happened

The exam had 15 tests; the first run gave 9 passed and 6 failed. Three of the six failures were mistakes of the exam, not of the build:

- **`c2` could never fail.** It rewrote the criterion and ran `node --test tests/router-regression.test.js` from inside a test file, expecting a non-zero exit. A test file started by `node --test` has `NODE_TEST_CONTEXT=child-v8` in its environment, and the nested runner inherited it; a runner in that mode reports through its parent and exits 0 even when its tests fail. So `the regression still passes with every level of the criterion moved` was reported on a regression that does watch the criterion (checked by hand: with the levels rotated it fails two tests). Clearing that variable in the nested run fixes it.
- **`c11` called `aether-route replay` with no mode.** The bin requires `--journal` or `--projects …`; the plan (not the spec) fixes the flags, and the Examiner reads the spec and the plan's public interfaces, so it guessed.
- **`c12` looked for a heading `Proposals`.** The plan names the section `Other uses found, not built`; the requirement is that the proposals are listed with their measurements.

The Examiner also stopped at its 40-turn cap with six helper files and no test; one message to the same agent finished the exam.

## Impact

- A wrong exam test fails a correct build (`c11`, `c12`) or passes a broken one (`c2`). The Lead has to read each failure to tell the exam's mistake from the build's, which is what the exam is meant to spare.

## Proposals

1. `agents/examiner.md`: a test that runs a nested Node test runner clears `NODE_TEST_CONTEXT` from its environment; and an exam test that expects a failure is shown to fail on a deliberately broken input before it is trusted.
2. Say that a test finds a heading, a flag or a name by what the requirement asks (any of its plausible spellings), not by a word the plan did not fix.
3. Write the tests before the helper libraries, or raise `maxTurns`.

## Acceptance

- A test that expects a failing nested run fails when the build is broken. A rerun of the exam of `006-delegate-router` with the three tests as first written gives the same verdicts as with the corrected ones.

## Environment

Claude Code 2.1.301, Node 22, Aether plugin 0.11.0, Linux (WSL2).
