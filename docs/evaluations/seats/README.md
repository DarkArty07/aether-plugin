# Measuring the design seats

Spec [001-design-seats](../../../specs/001-design-seats/spec.md), requirement R16: before an external model keeps a seat in the `balanced` choice, it is compared with the native agent of that seat. The owner's rule decides: if quality drops, the seat goes back to the native agent.

Every run below makes real calls. The native ones are paid at API prices; the external ones spend the quota of the owner's plan. They are the owner's to run, from a machine with agy and Claude Code signed in.

## The Judge: seeded defects (automated)

[`harness/judge-defects.js`](harness/judge-defects.js) gives each Judge the same documents, each with known defects, and an answer key per fixture:

| Fixture | Seeded defects | Expected verdict |
|---|---|---|
| `spec-defects` | a criterion that cannot be tested ("feels fast"); a part of the owner's intent the spec leaves out (the welcome email); a production deploy missing from Irreversible actions | revise or reject |
| `tasks-defects` | a task that owns all of `src/**` and nine files; a dependency on Task 1 that Task 2 does not state; a failing test that is `assert.ok(true)` | revise or reject |
| `clean` | none | approve |

The harness matches each finding to the key by keywords. The matching is mechanical: no model grades the Judges, so there is no grader's bias. A blocking or major finding that matches no seeded defect is listed as unmatched. A person reads those: each one is either a real problem the fixture did not plant, or a false alarm.

```sh
# The native Judge: its agent file on Opus at high effort, through claude -p. Paid at API prices.
node docs/evaluations/seats/harness/judge-defects.js --occupant native --repeat 3 --out judge-native

# The external Judge: aether-lane seat judge with your seats choice (balanced puts Argon on agy first).
AETHER_LANES=on AETHER_SEATS=balanced node docs/evaluations/seats/harness/judge-defects.js --occupant external --repeat 3 --out judge-external
```

Each run writes `results.json` (every answer and its score) and `summary.md`. An external round that gives the seat back to the native agent (no quota, a wrong model name, a failure) is recorded as not run, with its reason, and is not scored.

**Decision.** Over three rounds per fixture, the external Judge keeps the seat when all three of these hold:
- it finds at least as many seeded defects as the native one;
- it gets no more verdicts wrong;
- its unmatched findings are not mostly false alarms.

Otherwise remove it from `designSeats.balanced.judge` in your copy of `config/lanes.json`, or choose `native`.

**Cost.** Nine native rounds of a short review on Opus at `high`: a few dollars at list price. The external rounds use agy's quota.

## The Writer: blind comparison (by hand)

1. Take a real approved spec. Commit it on two branches.
2. On one branch, run the native Writer (the Lead does it under `native`). On the other, run `aether-lane seat writer` under `robust`.
3. Name the two results X and Y with [`../trial-3/harness/blind.py`](../trial-3/harness/blind.py), and score them with [`../trial-3/harness/judge.py`](../trial-3/harness/judge.py): q3 compares them in both orders.
4. Run the native Judge on each `tasks.md`, and count its blocking and major findings.

The external Writer keeps the seat in `robust` when q3 is not worse and the Judge finds no more blocking or major problems in its tasks.

## The Examiner: defects caught (by hand)

1. For one approved spec and plan, write an exam with each occupant: `aether-lane seat examiner` under `balanced`, and the native Examiner under `robust`.
2. Run both exams with `aether-exam run` on two commits: a correct build, and the same build with known bugs planted.
3. Count, for each exam, the planted bugs it catches (a test that fails on the buggy commit) and the false failures (a test that fails on the correct one).

The external Examiner keeps the seat when it catches at least as many bugs with no more false failures.

## Not yet measured

As of 2026-10-15, no external seat has been compared with its native agent. A first check ran that day: agy 1.3.6 offers `gemini-4-argon-low`, `-medium` and `-high`, the Judge harness above ran once per fixture with `--occupant external` (all three verdicts right, 6 of 6 seeded defects found, one real finding no fixture planted), and a Judge, an Examiner and a Writer round each ran through `aether-lane seat-start` and `seat-wait` in a throwaway repository (exit 0, no change outside the seat, the Writer's tasks passed `aether-plan check`). That shows the seats work on Argon; it is not the comparison above, which still needs the native runs and three rounds per fixture.
