---
title: Audit a project
description: Ask the Lead for a read-only audit of the project and get back one list ordered from most to least urgent, then take what you want
order: 18
---

# Audit a project

`/aether:audit` asks the Lead to look at the whole project and hand back one list of what is pending, ordered from most to least urgent, for you to choose from. It only reads: it changes nothing in the project and fixes nothing. The Lead runs an automated analysis, asks you one question about which topics to cover, reviews each topic with read-only delegates, verifies what they found, and delivers the list from P0 to P3. Esta guía también está en español: [Auditar un proyecto](../es/guias/auditar-un-proyecto.md).

Type `/aether:audit` with no arguments to be asked, or name the topics and skip the question, as in `/aether:audit docs bugs`. Add `--no-tests` to skip the project's tests. Answer in your own language: the Lead delivers in it.

## What it audits

The audit covers twelve topics, from the catalog in `plugins/aether/skills/audit/topics.md`. Each reviewer starts from the hotspots the analysis found, because defects concentrate where files change often and are big.

- Bugs: logic that gives a wrong result, unhandled edge cases, errors swallowed in silence, a promise or a resource never awaited or closed. Sources: Anthropic's [code-review command](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md) and the [hotspots guide](https://docs.enterprise.codescene.io/versions/6.6.7/guides/technical/hotspots.html).
- Security: input that reaches a query, a shell, a path or HTML unchecked, missing authentication or authorization, secrets in the tree or the history, unsafe defaults, data sent or logged that should not be. Sources: [OWASP ASVS](https://asvs.owasp.org/) and the [OWASP Code Review Guide](https://owasp.org/www-project-code-review-guide/).
- Dependencies: known vulnerabilities the analysis reported and whether the vulnerable code is reachable, versions not pinned or a missing lockfile, licenses that conflict with the project's, CI workflows with broad permissions or unpinned actions. Source: the [Scorecard checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md).
- Tests: tests that fail and why, critical paths with no test, tests that assert nothing, tests that depend on time, order or the network, a test command that does not run all the tests. Sources: [PIT](https://pitest.org/quickstart/basic_concepts/) and [Google's flaky-test guide](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html).
- Reliability: calls to an external service or process with no timeout, no retry limit or no handling of its failure, what a crash halfway leaves behind, errors logged nowhere, resources that grow without bound. Source: the [SRE launch checklist](https://sre.google/sre-book/launch-checklist/).
- Performance: work repeated in a loop, a query per item, a whole file or table read to use a part, blocking calls on a request path. Source: [ISO 25010](https://www.iso.org/standard/78176.html).
- Accessibility: images without alternative text, controls without a label, color as the only signal, keyboard traps, contrast. Source: [ISO 25010](https://www.iso.org/standard/78176.html).
- Architecture and debt: the hotspots with poor health, modules coupled so that one change needs many files, dead code, logic duplicated in two places that must stay in step. Sources: the [hotspots guide](https://docs.enterprise.codescene.io/versions/6.6.7/guides/technical/hotspots.html) and the [Technical Debt Quadrant](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html).
- Documentation against code: commands, options, flags, file paths, examples and versions the README and the docs state that the code no longer has or does differently, setup steps that would fail, a promised feature that is not there. Sources: [Write the Docs testing guide](https://www.writethedocs.org/guide/tools/testing/) and [Diátaxis](https://www.diataxis.fr/start-here/).
- Versions and releases: the version stated in more than one place and not the same in all, a changelog that misses the latest release or is not dated, tags that do not match the versions, a breaking change in a minor or a patch. Sources: [SemVer](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
- Repository hygiene: branches the analysis lists as stale that hold work not in the default branch, pull requests and issues open for a long time that are already done or no longer apply, TODO and FIXME without context, CI that is red or disabled. Source: the [issue-age metric](https://www.chaoss.community/kb/metric-issue-age/).
- Opportunities: what the project promises or what open issues ask for that nothing implements yet, a small change that would remove a recurring manual step. Source: the [suggested tasks](https://jules.google/docs/suggested-tasks/).

Performance and accessibility are proposed only when the analysis shows they apply: performance when the project has a hot path, a performance goal or a measured complaint, and accessibility when it has a user interface.

## How it runs

The audit runs in seven phases. The Lead does the first two and the last three itself, and hands discovery and verification to delegates, one `Agent` call each, launched in parallel in the background. The audit does not need the Workflow tool: it works the same in a session with or without it.

1. Automated analysis. The Lead runs `aether-audit analyze --out <file>` in the project's root, with `--no-tests` when you asked for it, or `--tests-command '<that command>'` when no manifest declares tests and the README names one. The command reads the test command, the linter and the dependency audit the project declares, reads git for secrets, TODO and FIXME, branches, hotspots and the open issues and pull requests, and runs the project's tests with a time limit. It installs nothing and fixes nothing, and it never prints a secret's value. Work files go in a directory made with `mktemp -d` outside the project.
2. One topic question. Unless you named the topics, the Lead asks a single question, in one message, and stops there: what the project is, the topics it proposes with a reason each, the ones it leaves out with theirs, the estimate from earlier audits or that there is no history yet, and an invitation to confirm, remove or add. With `/aether:audit docs bugs` there is no question. A name that is not in the catalog is said at the start and ignored; `--no-tests` is not a topic.
3. Discovery. One reviewer per confirmed topic, each a read-only delegate with a bounded scope: the hotspots and the facts of the analysis that touch its topic. Each returns candidates it can point to, with a file and a line or a commit, and what it did not get to.
4. Verification. The Lead applies the entry gate with `aether-audit candidates <file>`, then each accepted candidate goes to a verifier in a fresh context, which gets the claim and the location, not the reviewer's reasoning, and tries to refute it. A verifier may take up to four claims of the same area. It reproduces only on Claude, in a directory made with `mktemp -d` outside the project; on another harness it does not reproduce, and a «proven» from there is taken as confirmed by reading, with what it ran kept as evidence. Then `aether-audit verdicts <file> <verdicts-file>`. A finding whose verification failed in any way is unverified, never verified.
5. Cleanup. The Lead adds a cause key to each finding and notes which open issue covers it, then runs `aether-audit clean <file> --analysis <file> --topics <a,b,c>`, which merges findings of one cause, drops what an open issue covers, and marks each one new or still against the earlier audit.
6. Triage. The Lead writes one judgment per verified finding, with severity and priority set apart, the reason in one sentence, the rough size, whether it is a regression, the cost of waiting and how it would be built, then runs `aether-audit triage <file> <judgments-file>`, which orders each band and numbers the list.
7. Delivery. The Lead writes what the delivery needs (date, topics, topics left out with their reasons, duration, the cost from `aether-report --spend`, what waits for your yes, the assumptions, what each reviewer did not look at, the RADAR line), runs `aether-audit report --meta <file> --analysis <file> --triage <file> --lang <es|en> --save`, and hands you its markdown as it is, ending with which items you take.

In a session the Lead runs these commands itself; from a shell outside a session the same bin is `node plugins/aether/bin/aether-audit`, run from a clone of this repository.

## What it does not do

The audit changes nothing in the project: no edit, no commit, no branch, no stash, no worktree of its own, no `git fetch` and no `git pull`. It fixes nothing and installs nothing: no `--fix`, no `npm audit fix`, no migration. It creates no issue on its own: only after you choose items, one issue per chosen item with `gh issue create`, and only when the project has a GitHub remote and `gh` answers; otherwise it gives you the chosen items as text. It answers in your language.

It runs the project's own tests and tools, which is running the project's code, so it reads each command before running it. A command that deploys, migrates, seeds data, publishes, runs end to end against a live service or needs credentials is not run: the check ends as not run, with the reason, and the report says so. A time limit caps each run, you can skip the tests with `--no-tests`, and the comparison of the project's state before and after the analysis reports anything the commands changed. The value of a secret is never printed, quoted or repeated, in a message, a file or a brief: only its type, its file and its line or commit.

## Without a network, tests or GitHub

Every automated check ends in one of three states: a result, not applicable with why, or could not with why. A check that could not run never counts as clean. The report says so in its not-covered section: which checks were skipped and why, which topics were left out and why, what each reviewer did not look at, and which reviewers ran out. A project with no tests, no linter, no manifest and no remote audits the same way: each check says not applicable, and the audit goes on with the topics that do apply.

Reviewers and verifiers have no `gh` and no network: what they need from GitHub is in their brief, and the comparison with the open issues happens in the cleanup, where a missing or failing `gh` leaves the comparison undone, with the reason.

## Where the report is saved

Outside the project, in the plugin's data directory, under `<data dir>/audits/<project>/<date>`, with `report.json` and `report.md`. The date is the day the audit ran; a second audit the same day takes the next suffix. Nothing is written inside the project you audited.

The next audit reads the saved one by itself: it reuses the cause key when it meets the same problem and marks each finding new or still. An earlier item it does not find again counts as resolved only when a file of its locations changed since the earlier audit (for a branch, when its tip moved or it is gone); otherwise the since-the-last-audit line counts it as not found again, though its code did not change, because reviewers are models and miss things. Items of topics left out this time are counted apart. When there is no earlier audit, that section says so.

## What you take

The list runs from P0 to P3, each band with its items numbered from the top: P0 is broken now or harming now, P1 soon, P2 work worth scheduling, P3 when there is time, and every proposal. Each item says its topic and how it was verified, what it is and where, why that level, its size and how it would be built. The unverified findings come after, with no level and no number: they are leads, not ranked.

The delivery ends by asking which items you take, for example «1, 2 and 3». The Lead looks each number up in the saved `report.json`. Each item you choose becomes a GitHub issue only in a project with a GitHub remote where `gh` answers, with its claim, locations, evidence, verification, priority and why. Otherwise you get the chosen items as text, and building them is a new request.

## The test rounds

The skill was tried on real projects before it was documented, and fixed between rounds: the evidence is in `specs/026-project-audit/rounds/`, starting with [round 1](../../specs/026-project-audit/rounds/round-1.md). Three projects of different stacks: this repository in a quiet clone, a Python project, and a PHP project with no GitHub remote. Each took 8 to 21 minutes and cost US$ 7 to 21 at list price; every reviewer and verifier ran on Muse, so nothing was reproduced and every listed finding is confirmed by reading. No secret value was printed, no issue was created, and the projects were left unchanged. The round found nine defects of the skill, from invented locations to verifiers with network, and each was fixed.
