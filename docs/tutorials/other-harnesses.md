---
title: Other harnesses
description: Send work to agy, Codex, Grok, Cursor or Muse while their quota lasts, and check it with the /harnesses panel
order: 106
---

# Other harnesses

At the end of this guide Aether sends the work that is not the Lead's to the coding plans you already pay for, and you can see the quota of each one. It takes about fifteen minutes, most of it installing and signing in to the CLI.

## Before you start

- Aether is installed and `aeth` works ([Install and start](install-and-start.md)).
- You are on Linux or WSL. Superdelegation runs only on Linux: on macOS and on native Windows the lanes stay off.
- You have a plan with the harness: agy, Codex, Grok, Cursor or Muse.
- Know what you turn on. A lane works without permission prompts and spends the quota of another plan. That is why `superdelegation` is off by default and why you turn it on yourself. Native Claude is always the fallback, and the Lead itself stays on Claude.

## Steps

### 1. Install the CLI and sign in to it yourself

Install the harness's CLI as its maker says, and sign in, in your own terminal. Aether never signs in for you and never opens a harness's credential files. The commands are `agy`, `codex`, `grok`, `cursor-agent` and `muse`. Check that the one you installed is found:

```
which codex
```

Aether looks on the `PATH` of Claude Code's own process, not of your shell. A directory that only your shell profile adds can be missing there.

### 2. Run /aether:setup again

```
claude "/aether:setup"
```

The setup checks again, and now it finds the CLIs you installed. It asks whether to send work to them, and you can pick several. «No, only Claude» is the recommended answer. (It asks the permissions question again too: pick the same answer to keep it.) Grok's choice carries a warning that it runs without asking permissions. Then it saves your answer as the `superdelegation` and `harnesses` options.

Close the terminal and open a new one: the options are read when a session starts.

### 3. Or set the options by hand

In Claude Code, open `/plugin` → Installed → aether → Configure options. Set `superdelegation` to true. List the harnesses in `harnesses`, comma-separated, from `agy`, `codex`, `grok`, `cursor` and `muse`, for example `agy,codex`. The defaults are `superdelegation`, off by default, and `harnesses`, `agy` by default. A list with no valid name means `agy`. `claude plugin configure aether@aether-plugin` shows which options are unset.

### 4. Open the panel

Start `aeth` in your project and type:

```
/harnesses
```

What you see: a pane that prints nothing to the chat and calls no model. Its title is `Aether · other harnesses`, and under it an options line, `superdelegation ON · harnesses agy,codex`. For each harness it shows the version and, for each quota group, a status (`usable`, `dry until <date> UTC`, `under the reserve` or `no reading`) and a bar with the share left and `resets in <h>`. `Recent delegates` lists the five newest delegations.

`r` reads the quota again, and `Esc` or `x` closes the pane. The panel only reads: the switch is the `superdelegation` option. With Muse on, `r` makes one minimal call, about 54,000 input tokens of its subscription.

### 5. Let the Lead use it

There is nothing more to do. With `superdelegation` on, each call of an agent that is not the Lead goes to a harness when one of its models, at some effort, scores about as high as the native pair would. The quota that renews first goes first, then the cheaper call. Native Claude takes the call only when none can. A harness that is missing, out of quota or fails sends the call to the next one, and finally to Claude, without asking you.

### 6. Know the limits

- **Containment.** Grok works with `--always-approve`, and the other lanes also run without prompts, in a worktree of their own. Aether checks the files they change and drops variables named like tokens, keys and secrets from their environment. But your home directory stays, because each CLI keeps its login there. This prevents accidents, not an agent that goes looking for your files, and nothing undoes a network action.
- **Cursor** is not tested with a real account, and ships with no models in the lane table, so it takes no call until you add them (see [Lanes](../guide/lanes.md#lanes)).
- **Codex, Grok and Muse** have their models in the tables already. Muse's `muse-wonder-full-1.0` is given only on some plans; an account without it is refused and the call runs on Claude.

## Check that it worked

- `/harnesses` shows `superdelegation ON` and the harnesses you listed, none marked `enabled, not installed`.
- Each quota group says `usable`. A group `under the reserve` or `dry` is skipped until it recovers.
- `/aether:doctor` lists the harness CLIs it found.
- After a swarm, `/spend` shows the calls to other harnesses and their dollars (see [See the spend](see-the-spend.md)).

If no work leaves Claude, or a harness shows `Quota unavailable`, read [Nothing runs on a lane](../guide/troubleshooting.md#nothing-runs-on-a-lane) and [the panel's messages](../guide/troubleshooting.md#the-harnesses-panel-says-quota-unavailable-or-enabled-not-installed).

## Next

- [See the spend](see-the-spend.md): the dollars and the calls that left Claude.
- [Work for hours](work-for-hours.md): a long run, with its quota brake.
- [Lanes](../guide/lanes.md#lanes): the rule that picks the harness for each call.
- [Options](../guide/options.md#options): `superdelegation` and `harnesses`.
