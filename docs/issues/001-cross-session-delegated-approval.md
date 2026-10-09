# Cross-session parallelization: a Lead cannot carry the owner's delegated approval to another session

**Type:** limitation and feature request
**Date:** 2026-10-09
**Found in:** a live trial of two parallel Aether-mode sessions

## Summary

We tried to run two Aether-mode main sessions in parallel on two different projects. One Lead orchestrated and monitored the other, so the owner would only talk to the orchestrating one. The plumbing worked, but the second session stalled at its first owner-approval gate and could not be unblocked from the first. Prompt engineering cannot fix this: the receiving session correctly treats a peer message as non-user input.

## Setup

- Session A (Lead, project 1) and session B (Lead, project 2). Both interactive, both launched with `--plugin-dir <plugin> --model sonnet --effort xhigh`.
- A found B with `ListAgents`, handed it a requirements file with `SendMessage` (using `notify_when_idle`), and read B's transcript read-only to see what B said between idle notices. A also ran its own Designer in the background at the same time.
- The owner told A: "I approve you, you continue."

## What worked

- Peer discovery, with name, busy or idle state and start time.
- Message delivery. B read the handoff, checked A's requirements against its own code and found a conflict with one of its policies. A refined the requirement in a second message, and B updated its understanding.
- One-shot idle notices (they must be re-armed on every message).
- A's Designer ran in parallel with B's work.

## What failed

1. **Delegated approval did not cross sessions.** B said it did not treat A's message as the owner's confirmation and kept waiting at its "confirm understanding" gate. That is the correct behavior for a harness that cannot verify the sender. The owner's delegation to A was valid only inside A's session. B stayed stopped until the owner typed in B's terminal, and the owner read that as the parallelization failing.
2. **A cannot launch B.** The `orca` CLI was not installed, and a headless `claude -p` cannot pass the owner's approval gates, so the owner started B by hand. There is no supported way for A to spawn a peer with the plugin flags and a first prompt.
3. **Poor observability of B.** An idle notice carries only the first characters of B's last message. Reading the rest meant parsing B's transcript JSONL, which depends on an internal file layout.
4. **No message protocol.** Status ("design ready", "question", "done"), gate ownership and the shape of a handoff were free text, and each side improvised.

## Why prompt engineering cannot solve it

The receiving harness is right to refuse. Any text A sends looks the same as a forged owner message. The authority has to be set through a channel the owner controls and B can verify.

## Proposals

1. **Delegation at launch.** Let the owner declare in the launch prompt, or with a flag or setting (for example `--delegate-approvals-to <session name>` with a gate list and an expiry), that B accepts approvals relayed by A for named gates: understanding, design, spec and plan. Irreversible or costly actions stay owner-only: merge, deploy, push to main and real model calls. The launch input is authentic owner input from the first turn.
2. **A trusted grant command.** A slash command the owner runs inside B (for example `/aether:delegate <session> <gates> <expiry>`) that records a grant which B's hook checks. It must travel on a channel A cannot write to.
3. **A spawn helper**, like `aether-wt`, that creates a worktree for B, starts it with the plugin flags and a first prompt that carries the delegation, and registers it with A.
4. **A small peer protocol:** typed messages (`handoff`, `question`, `design-ready`, `blocked`, `done`) with a file path for long content, mirroring the Lead and Designer reply format.
5. **Better monitoring:** something like `aether-peer status <name>` that reads B's last turn through a supported interface instead of the transcript file.

## Acceptance

- A Lead can drive another Lead from understanding through plan with the owner approving once, at launch.
- Gates marked owner-only still stop and name the action waiting for the owner.
- A forged peer message without a grant is refused, with a regression test.
- The limits are documented in the README.

## Environment

Claude Code 2.1.295, Aether plugin 0.3, Linux (WSL2). Both sessions ran with `--dangerously-skip-permissions`.

## Update, same day: two more instances and a finding about enforcement

- **The smoke call.** The owner authorized a real model call in the first session. The second session answered that this was not enough and asked the owner to type it in its own terminal, which is the same refusal as before. The authorization had to be repeated.
- **The gates are advisory.** The owner then told the first session to merge the second project's pull request. The first Lead did it with `gh`, although the second session's rule says that merge needs the owner's OK in its terminal. Nothing stopped it. A gate that only the cooperating agent respects protects against honest agents and not against an agent that acts directly.
- Both points are developed in issue 006 (an autonomy contract enforced by a hook, with a ledger).
