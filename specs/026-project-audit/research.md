# Research: the state of the art in project audits (spec 026)

Two read-only research delegates ran on 2026-11-04 (tasks `audit-sota-ai` and `audit-sota-se`, both on codex gpt-6.1-sol at low, approved). The Lead checked the two load-bearing sources itself (Trail of Bits `fp-check`, Anthropic `code-review`). This file keeps what the spec and the plan need; every claim has its source.

## What exists, and the gap

No mature tool combines a whole-repository audit, pending fixes, documentation drift, feature opportunities and one calibrated urgency list. The tools that exist review a PR diff (Anthropic `code-review`, CodeRabbit, Cursor Bugbot, Greptile, Copilot review, Codex `/review`) or one dimension (Anthropic `/security-review`, Trail of Bits skills, Semgrep Assistant, Snyk). The closest to a whole-project review is `wshobson/agents` `comprehensive-review` (architecture, quality and debt, security, performance, testing, documentation, standards; phase reports kept in files), whose mandatory approval checkpoints conflict with an audit that runs alone. Google Jules' «Suggested Tasks» scans a repository for TODOs and presents selectable tasks: the closest interaction to ours, narrower in coverage.

- https://github.com/wshobson/agents/blob/main/plugins/comprehensive-review/commands/full-review.md
- https://jules.google/docs/suggested-tasks/

## Patterns worth copying

1. **Discovery and verification are separate agents.** Anthropic `code-review` (checked by the Lead): parallel reviewers find, then «one subagent per issue» validates each, and «Filter out any issues that were not validated». No numeric confidence; a strict bar: «If you are not certain an issue is real, do not flag it.» https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md
2. **The verifier restates the claim first.** Trail of Bits `fp-check` (checked by the Lead): Step 0 restates the exact claim, root cause, trigger, impact, execution context and caller constraints; «half of false positives collapse at this step». Standard verification for a clear, single-component claim; deep verification when the path crosses three or more modules, involves concurrency or the claim is ambiguous. Verdict TRUE or FALSE POSITIVE with evidence. https://github.com/trailofbits/skills/blob/main/plugins/fp-check/skills/fp-check/SKILL.md
3. **A failed verification must not look like confidence.** The `claude-code-security-review` Action keeps a finding when its filter fails and gives it a default confidence of 10: a documented pitfall. https://github.com/anthropics/claude-code-security-review/blob/main/claudecode/findings_filter.py
4. **Fresh reviewers.** `obra/superpowers` gives the reviewer the requirements and the git range, not the author's session history, and asks it to report what it declined to judge. https://github.com/obra/superpowers/blob/main/skills/requesting-code-review/code-reviewer.md
5. **Each finding carries location, trigger, evidence, impact and the proposed action**, and the scales are one: `pr-review-toolkit` mixes 1–10 and 0–100 scales across its specialists, which then need normalizing. https://github.com/anthropics/claude-plugins-official/blob/main/plugins/pr-review-toolkit/README.md
6. **Deterministic evidence first, semantic review second.** Semgrep Assistant and QASecClaw put a model after the scanners, to triage their output; QASecClaw reports 88.6 % fewer false positives for 3.1 % less recall on the OWASP Java benchmark. https://semgrep.dev/blog/2024/the-tech-behind-semgrep-assistant/ · https://arxiv.org/abs/2605.01885
7. **Deduplicate by root cause and against earlier runs.** Cursor Bugbot's documented design clusters findings and dedupes against prior runs. https://prod.cursor.com/blog/building-bugbot
8. **Say what was not covered.** GitHub documents that Copilot review misses problems in large changes and hallucinates findings. https://github.com/github/docs/blob/main/content/copilot/responsible-use/agents.md

## Pitfalls

Noise (invalid, redundant, out-of-scope suggestions): in a study of 31,073 CodeRabbit comments, 36.4 % were accepted and 56.3 % rejected (https://arxiv.org/abs/2607.03316). Broad exclusions hide what a project audit needs: `/security-review` excludes documentation and outdated dependencies, `code-review` excludes pre-existing problems. Repeated passes raise cost and can change the findings.

## Dimensions (engineering practice without AI)

- **Product quality**, ISO/IEC 25010:2023: functional suitability, performance efficiency, compatibility, interaction capability, reliability, security, maintainability, flexibility, safety. https://www.iso.org/standard/78176.html
- **Hotspots first:** change frequency combined with complexity (file size as the proxy); stable unhealthy code gets lower priority; coupling and knowledge silos next. https://docs.enterprise.codescene.io/versions/6.6.7/guides/technical/hotspots.html · Rarely touched debt may not be worth paying (Fowler): https://martinfowler.com/bliki/TechnicalDebtQuadrant.html
- **Security:** OWASP ASVS as the requirements, the Code Review Guide as the reference; the Top 10 is only a starting point. https://asvs.owasp.org/ · https://owasp.org/www-project-code-review-guide/
- **Supply chain:** dependency review and SCA (advisories, licenses), and the OpenSSF Scorecard checks (pinned dependencies, workflow permissions, branch protection). https://github.com/ossf/scorecard/blob/main/docs/checks.md
- **Secrets:** scan the whole history across branches, not only the current tree. https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning
- **Tests:** coverage of important behavior, whether assertions detect faults (mutation testing), flaky tests. https://pitest.org/quickstart/basic_concepts/ · https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
- **Reliability and operations:** timeouts, retries, error handling, graceful degradation, monitoring (Google's launch checklist and Production Readiness Review). https://sre.google/sre-book/launch-checklist/
- **Documentation drift:** compare documented commands, options and examples against the code and the tests; README purpose, setup and help. https://www.writethedocs.org/guide/tools/testing/ · https://www.diataxis.fr/start-here/
- **Releases and versions:** SemVer, a dated changelog. https://semver.org/ · https://keepachangelog.com/en/1.1.0/
- **Repository hygiene:** issue and PR age, inactive branches, CI results, TODO/FIXME with context; age is a reason to look, not a severity. https://www.chaoss.community/kb/metric-issue-age/

## Triage

- **Severity is not priority.** Mozilla: severity is the scope of a defect's effect, priority is when it should be fixed. https://firefox-source-docs.mozilla.org/bug-mgmt/guides/severity.html · https://firefox-source-docs.mozilla.org/bug-mgmt/guides/priority.html
- **Bands**, adapted from Chromium's priorities: P0 emergency, P1 prompt or release blocker, P2 scheduled, P3 later or reconsider. https://chromium.googlesource.com/chromium/src/+/HEAD/docs/process/priorities_slo.md
- **Harm** as impact × likelihood in coarse, explained categories (OWASP risk rating). https://owasp.org/www-community/OWASP_Risk_Rating_Methodology
- **Within a band**, cost of delay over effort, a light WSJF, with broad estimates, not decimals. https://framework.scaledagile.com/wsjf
- **CVSS** stays supporting evidence for a security item; a base score alone does not order a mixed list. https://www.first.org/cvss/specification-document
- Chromium's triage advice: when time is short, regressions first. https://chromium.googlesource.com/chromium/src/+/HEAD/docs/process/priorities_slo.md

## Not verified

The upstreams of community `repo-health`, `tech-debt-audit` and `code-health` skills; proprietary verifier internals; independent accuracy comparisons between products. Star counts are snapshots, not quality.
