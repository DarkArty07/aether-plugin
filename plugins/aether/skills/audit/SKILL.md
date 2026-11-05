---
name: audit
description: Audit the project and get a list of what is pending, ordered from most to least urgent. Reads only; fixes nothing.
argument-hint: "[topics] [--no-tests]"
disable-model-invocation: true
---

# Audit

The person called this to learn what is pending in the project, from the most urgent to the least, and to choose what to take. You audit the whole project with read-only delegates and hand back one list. You ask **one question** at the start, unless the person named the topics, and then you work alone to the delivery. You change nothing in the project and fix nothing. Answer in the person's language.

`/aether:audit [topics] [--no-tests]`: the topics are ids of the catalog in `topics.md`, beside this file (`docs bugs`); a name the person writes in their language maps to its id. A name that is not in the catalog is said at the start and ignored; when none is, you ask the topic question. `--no-tests` is not a topic: it skips the project's tests.

## Rules for every phase

- **Read-only.** You never edit, create or delete a file of the project, and never make a commit, a branch, a stash or a worktree of your own in it. You run no `git fetch`, `git pull`, `--fix`, install or migration. Aether's own delegate machinery is the one exception: the temporary worktree of each external delegate, removed when it ends, the exclude lines in `.git/info/exclude` and the `.aether/` folder they hide.
- **Work files** go in one directory outside the project, made once at the start with `mktemp -d`. Below, `$W` stands for the path it printed: write that path out in every later command, because a shell variable does not survive from one command to the next. Write every JSON file of the phases there, and nowhere else.
- **Secrets.** Never print, quote, copy or repeat the value of a secret, in a message, a file or a brief: only its type, its file, its line or its commit. Every brief you write says the same.
- **Delegates.** Every reviewer and verifier is a read-only delegate: one `Agent` call with `subagent_type: "general-purpose"` and `run_in_background: true`, a brief that starts with `AETHER-TASK: <id>` and has no `AETHER-OWNS` line. Every id carries this audit's stamp, `<stamp>` (phase 1): the system keys a task by its id across sessions and projects, and a launch with an id another audit already used is taken as a correction of that task, with its work and findings carried into the brief. Reuse an id only to correct or relaunch the same delegate of this audit. You do not choose the model: pass neither `model` nor `effort`, and the system picks. Launch each phase's delegates in one message, in parallel. When a result arrives, judge it with `aether-delegate verdict --task <id> --verdict approve` when its answer holds the JSON block the brief asks for; otherwise `--verdict fix --finding 'answer: <what is missing>'` once, and after that take it as a reviewer that ran out. Every delegate result names where it ran (a harness and a model, or Claude): keep it.
- **No Workflow needed.** The audit does not need the Workflow tool: it works the same in a session with or without it, and you never ask the person to turn it on.
- **A headless session** (`claude -p`) that ended before its delegates answered is resumed with `--resume`: relaunch, with the same `AETHER-TASK` id, each delegate that did not answer.
- **No issues on your own.** You create a GitHub issue with `gh issue create` only after the person chooses items, one per chosen item, and only when the project has a GitHub remote and `gh` answers. Otherwise you give the chosen items as text.

## 1. Automated analysis

Run, in the project's root:

    mktemp -d && date +%s
    aether-audit analyze --out "$W/analysis.json"

(the first line gives the work directory and the start time: the start time is the audit's `<stamp>` in every delegate id, and the start of the duration of phase 7)

Add `--no-tests` when the person asked for it. The command reads the manifests and build files for the test command, runs the project's tests with a time limit (it reads the whole chain of scripts first and does not run one that deploys, migrates, seeds, publishes, runs end to end against a live service or needs credentials), the linter the project declares, the ecosystem's dependency audit, and reads git for secrets (in every branch and the history), TODO and FIXME, branches, hotspots, and the open issues and pull requests when `gh` answers. It installs nothing and fixes nothing, and it never prints a secret's value. Each check ends as a result, «not applicable» or «could not», with why; a check that could not run never counts as clean.

When no manifest declares tests and the README names a test command, run the analysis once more with `--tests-command '<that command>'`: the command reads it the same way before it runs it.

Read the line it prints, and from `$W/analysis.json` what you need: `checks` (each check), `checks.hotspots` (where to start), `changes` (anything that changed in the project while the analysis ran), `selfFindings` (findings the analysis established itself) and `estimate`. Read the README and the manifest too, for what the project is.

## 2. Topic question

Unless the person named the topics, ask **one question**, in one message, and end your turn there: do not start the review without a new answer. The message starts with its first line below, with nothing before it, and has, in the person's language:

1. A line with what the project is (its name, stack, size and commits), and «Automated analysis, already done:» with one line per check that says something (tests passed and failed, vulnerabilities, possible secrets with their commit, the first hotspots, open issues and stale branches). A check that could not run says why.
2. «I propose to audit N topics, one agent each:», a numbered list of the topics that apply, each with its reason taken from the analysis or the project («Security: there is a login and a possible key in the history»).
3. «I leave out:», continuing the numbering, each topic with its reason («Accessibility: it has no interface»). Propose `performance` only when the project has a hot path, a performance goal or a measured complaint, and `accessibility` only when it has a user interface.
4. «Estimate:» from `analysis.estimate` (time and cost of earlier audits), or «there is no history yet».
5. «Do you confirm, remove or add any?», with an example: «yes», «remove 8», «add 11».

Take the answer as it comes: «yes» is the proposed list; numbers or names remove or add. When the answer is ambiguous, take the reading that audits more, and say so under «Assumptions» in the delivery. Never ask a second question.

## 3. Discovery

One reviewer per confirmed topic. A reviewer has about 20 tool calls and ten minutes, so give it a bounded scope: the hotspots and the files the analysis points to for its topic, then what is nearest to them. What it does not get to goes to «not covered». Give each one only what it needs:

    AETHER-TASK: audit-<stamp>-<topic>

    You review one topic of a read-only audit of a project. Change, create or delete no file of the project and run no command that changes it (no git fetch or pull, no --fix, no install). Never print, quote or copy the value of a secret: name its type, file and line only.

    Project: <name>, <the stack in one line>, at <root>.
    Topic: <id>: <what to look for, from topics.md>.
    Start here: <the hotspots and the facts of the analysis that touch this topic>.
    Scope: <files or directories>. About 20 tool calls; then answer with what you have.
    Open issues (do not report what they already cover): <number and title, at most 30>.
    You have no gh and no network: what you need from GitHub is in this brief.

    Report only problems you can point to: a file and a line, or a file and a commit, and the evidence you saw (a quote of at most two lines, or a command's output). A branch is located by its name and the commit at its tip: {"file": "<branch>", "commit": "<sha>"}. An open issue is not a finding by itself: report the code or the document it points to. No nitpicks, nothing a linter would catch, nothing you are not fairly sure is real. An opportunity says where it is promised or asked for.

    End your answer with one fenced json block of valid JSON (no trailing comma, no comment), and nothing after it:
    {"candidates": [{"id": "<topic>-1", "topic": "<topic>", "title": "...", "claim": "...", "location": {"file": "...", "line": 1}, "type": "bug|risk|debt|docs|opportunity|other", "trigger": "...", "evidence": "...", "impact": "..."}], "notLooked": ["what you did not get to"]}
    Write title, claim and impact in <the person's language>.

Reviewers never get the person's conversation. Wait for every reviewer; keep each one's `notLooked`, and the topics of reviewers that ran out.

## 4. Verification

Join every reviewer's candidates into one array in `$W/candidates.json` (the analysis's own `selfFindings` are already established: phase 5 takes them in). You may fix a candidate's shape (a path the reviewer mistyped, a topic id, a duplicate id) and say so under «Assumptions»; never rewrite its claim or its evidence, and never invent a location: a candidate with none is discarded, which is the point of the gate. Run:

    aether-audit candidates "$W/candidates.json" --out "$W/gated.json"

It discards a candidate with no location or no evidence. Then each accepted candidate goes to a verifier in a fresh context, which gets the claim and the location, not the reviewer's reasoning. A verifier may take up to four claims of the same area, each judged on its own:

    AETHER-TASK: audit-<stamp>-verify-<n>

    You verify claims of a read-only audit. You did not make them, and you try to refute each one. Change, create or delete no file of the project and run no command that changes it. Never print, quote or copy the value of a secret.

    For each claim: (1) restate it from the code, in your own words: its root cause, what triggers it and its impact; if you cannot, it is unverified. (2) Try to refute it: read the location, its callers and the tests and configuration around it, and look for what makes it false. (3) Reproduce it only if you run on Claude and can do it without touching the project: write the reproduction in a directory made with `mktemp -d` outside the project, run it, and remove the directory. On another harness, do not reproduce.

    Verdicts: proven (you reproduced it; give the command and what it printed), read-confirmed (the code shows it), proposal (only for a claim whose type is opportunity, when it is real), refuted (give the evidence that makes it false), unverified (you could not settle it; say why). A claim of any other type is never a proposal: a future risk that the code shows is read-confirmed.

    Claims: <id, claim, location and type of each>

    End your answer with one fenced json block of valid JSON (no trailing comma, no comment), and nothing after it:
    {"verdicts": [{"id": "...", "verdict": "...", "rootCause": "...", "trigger": "...", "impact": "...", "evidence": "...", "reproduction": "..."}]}

Write every verdict into one array in `$W/verdicts.json`, adding to each `ranOn`: `"claude"` when its result says it ran on Claude, else the harness's name. A verifier that ran out or did not answer leaves its claims with no verdict. Copy each verdict as the verifier gave it: never change one, and never make one stronger. When a verifier's own evidence contradicts its verdict, write that claim's verdict as `"unverified"` with the contradiction as its `reason`, and say so under «Assumptions». Run:

    aether-audit verdicts "$W/gated.json" "$W/verdicts.json" --out "$W/settled.json"

A finding whose verification failed in any way is «unverified», never verified: the command decides that, not you.

## 5. Cleanup

In `$W/settled.json`, add to each finding a `causeKey`: a short slug of its root cause, the same for findings with the same cause, and the one of the earlier audit's item when it is the same problem (the earlier report is `report.json` under the audits folder of the data directory, which the next command finds by itself). Add `coveredBy: <issue number>` when an open issue of `checks.issues` already covers it. Then run:

    aether-audit clean "$W/settled.json" --analysis "$W/analysis.json" --topics <the confirmed topic ids, comma-separated> --out "$W/clean.json"

It adds the analysis's own findings (a change the audit's commands made to the project), merges the findings of one cause, removes what an open issue covers, and marks each one «new» or «still» against the earlier audit, listing the resolved ones.

## 6. Triage

Write `$W/judgments.json`, one judgment per verified finding of `$W/clean.json`, by id:

    {"<id>": {"severity": "critical|high|medium|low", "priority": "P0|P1|P2|P3", "reason": "<why this level, in one sentence>", "size": "S|M|L", "how": "<who would build it: directly, a delegate, the swarm, or you>", "regression": false, "waitCost": "high|medium|low"}}

Severity is the scope of the harm; priority is when to act, and they are set apart. P0 is broken now or harming now (a failing test on the default branch, a confirmed bug that loses data or money, an exposed secret); P1 soon (a likely bug, documentation that states something false, something that blocks a release); P2 work worth scheduling; P3 when there is time, and every proposal. The age of an issue, a branch or a TODO is a reason to look, never a severity. `waitCost` is what waiting costs; `regression` is true when it worked before. Run:

    aether-audit triage "$W/clean.json" "$W/judgments.json" --out "$W/triage.json"

It orders each band (regressions first, then the cost of waiting, then the smaller size) and numbers the list. If it names judgments that are incomplete, complete them and run it again.

## 7. Delivery

Run `aether-report --spend --session "$CLAUDE_CODE_SESSION_ID"` for the cost, and write `$W/meta.json`:

    {"date": "<YYYY-MM-DD>", "topics": ["<ids audited>"], "leftOut": [{"topic": "<id>", "reason": "..."}], "durationSeconds": <now minus the start time of phase 1>, "costUsd": <the session total, or null>,
     "waits": ["Choose which you take, by number. Each one becomes a GitHub issue.", "<an item that needs the person's own action, such as rotating a key>"],
     "assumptions": ["<what you assumed, the likeliest to be vetoed first>"],
     "reviewers": {"notLooked": [{"topic": "<id>", "items": ["..."]}], "exhausted": ["<topic>"]},
     "radar": "Rápido <minutes> · Delegación <calls on other harnesses> of <all calls> · Asequible US$ <total>",
     "cost": {"readable": true, "text": "<the session line, in the format of the closing report of the Aether bootstrap>"}}

When the spend cannot be read, `"costUsd": null` and `"cost": {"readable": false}`: give no figure. In a project with no GitHub remote, the first wait says the chosen items are given as text. Then run:

    aether-audit report --meta "$W/meta.json" --analysis "$W/analysis.json" --triage "$W/triage.json" --lang <es|en> --save --out "$W/report.json"

It saves the report outside the project, in the data directory, and returns its sections and its markdown. Give the person that markdown as it is, with nothing before its header line (a note of yours goes under «Assumptions»), in their language: for a language other than Spanish or English, use `--lang en` and translate it. It opens with the header line, «Awaiting your yes» and «Assumptions», then the list from P0 to P3 (each item with its topic and verification, what it is, where, why that level, its size and how it would be built), the unverified findings, what changed since the last audit, the discarded, what was not covered, the RADAR line and the cost, and it ends asking which items the person takes.

When the person answers with numbers, look each one up in the saved `report.json`. Only after the person chooses, and only in a project with a GitHub remote where `gh` answers, create one issue per chosen item with `gh issue create --title '<title>' --body '<claim, locations, evidence, verification, priority and why>'`, and give the issue links. Otherwise give the chosen items as text. Then stop: building them is a new request.
