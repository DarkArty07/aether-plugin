<!-- Copia del cuerpo del issue #136 tomada el 2026-11-12 para los asientos de diseño. La fuente es GitHub. -->

## Possible refactor: the list of harnesses lives in many places, so adding one is a change to dozens of files

Found while adding Codex as a harness (spec 022). Adding a harness is the most expensive kind of feature the project gets, and most of that cost is not the new adapter: it is finding and changing every place that repeats the list of harness names.

## Evidence (measured on the Codex branch)

- **Five fixed lists in `lib/`** that must hold the same names in the same order: `EXTERNAL` (`router-quota.js`), `RENEWABLE` (`router-renewal.js`), `DELEGATE_HARNESSES` (`router-pick.js`), `HARNESSES` (`delegate-calls.js`) and `ALLOWED_HARNESSES` (`lane-delegate.js`), plus the usage line and error message of `bin/aether-delegate renew` and of `renewReading`.
- **17 files** of `lib/`, `lib/harness/` and `bin/` write `'agy'`, `'grok'` or `'muse'` by hand.
- **104 of 242 test files** name a harness; several pin the exact list or a sentence of the documentation that contains it.
- The Codex change so far is 12 tasks and 90 changed files (the design and the evidence included).
- Spec 022 had to add `tests/harness-lists.test.js` and a `new-harness` skill whose job is to remember every list, which is a sign that the code does not do it.

## Why it matters

- Each place is another chance to miss one, and the swarm cannot check it: in the Codex run three units were blocked because an existing test that pins the old list belonged to no task (see #134 and #135 for the gate and ladder side).
- Every attempt of every unit runs the whole suite (about 2,480 tests, 100 seconds), so a wide change multiplies the time.
- The next harness will cost the same unless this changes.

## Proposal (to be designed, not decided)

1. One module that holds the harness names and their order (it could read `config/lanes.json`, which already has the keys), and that the five lists, the bin usage lines and the error messages read.
2. Tests that take the list from that module instead of repeating it, and tests of the documentation that check the names against it rather than a fixed sentence.
3. Keep `tests/harness-lists.test.js` as the guard that nothing writes the list by hand again.

Out of scope here: the per-harness behaviour (adapters, quota readers, pairs), which is data and code that belong to one harness.

## Not verified

Whether every one of the 17 files is a real duplicate of the list or only mentions one harness for its own behaviour; the first step of the design is to separate the two.

