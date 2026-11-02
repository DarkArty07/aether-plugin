---
title: Install and start Aether
description: Install the plugin, answer two questions and open Aether mode with a short command, in four steps
order: 101
---

# Install and start Aether

At the end of this guide Aether is installed and you are talking to the Lead in your own project. It takes about five minutes.

## Before you start

You need:
- Claude Code 2.1.294 or later;
- Node.js 22;
- git 2.36 or later;
- a terminal, and the folder of the project you want to work on.

If you are not sure you have them, go on: step 1 checks them for you and says what to fix.

## Steps

### 1. Paste one line

Paste this in a terminal:

```
claude plugin install aether --marketplace DarkArty07/aether-plugin && claude "/aether:setup"
```

The first part installs the plugin. The second part opens Claude Code with `/aether:setup` as its first message.

What you see:
- The install prints that 8 options are not yet set. That is normal: every option has a default, and the setup saves the ones your answers change.
- Claude Code may ask whether you trust the folder. Say yes.
- `/aether:setup` starts and checks, without asking you anything, Claude Code, Node, git and the other things Aether needs.

### 2. Answer the questions and close the terminal

`/aether:setup` asks in your language, in one screen. It is two questions, sometimes one:

**How should `aeth` start, with permissions?**
- «Work autonomously (no permission prompts)» is the recommended answer. Claude Code does not stop to ask before each tool call, so the Lead and its agents can work without waiting for you.
- «Claude Code auto mode» lets Claude Code decide which calls need your answer.
- «Ask before each tool» makes Claude Code ask you every time. A long job waits at each prompt.

Whatever you choose, Aether's guard stays on: a `push`, a merge to `main`, a publish, a deploy and a delete wait for your yes, in the brief, unless you granted that class of action in general words.

**Do you want to send work to other harnesses?** You only see this if the setup found some installed (`agy`, `codex`, `grok`, `cursor-agent` or `muse`). «No, only Claude» is the recommended answer. If you pick some, the setup turns on `superdelegation` and saves `harnesses`; Grok's choice carries a warning that it runs without asking permissions. [Other harnesses](other-harnesses.md) has the rest.

If the name `aeth` is already taken by something that is not Aether's, the setup asks you for another name, once. It never replaces a file that is not its own.

Then the setup puts `aeth` in a folder of your `PATH` when it finds one, saves your choices, and prints a final screen: the version installed, one line for each check (✓ or ✗ with its fix), the command with its folder and whether it is on your `PATH`, the permission mode, the harnesses, and what to type next.

Now **close this terminal.** A new one will find the new command.

### 3. Open a new terminal in your project and type `aeth`

```
cd path/to/your-project
aeth
```

What you see: Claude Code opens as the Lead, with the violet Aether theme if your terminal has true color, and a welcome line:

```
Aether 0.30.0 · Lead ready · tell me what you want, or type /aether:help to see what I can do
```

The number is the version you installed. If your system language starts with `es`, the line comes in Spanish. It shows once, when the session starts.

From the next day on, this is the only step you need. `aeth -c` continues the last conversation, `aeth --resume` lets you pick an older one, and `aeth -p "<task>"` runs one task. Plain `claude` stays normal mode, where the plugin does nothing.

If you prefer not to install a short command, `claude --agent aether:lead --effort xhigh` starts the same Lead. It needs no setup, and it uses your usual Claude Code permission settings.

### 4. Tell the Lead what you want

Write it in your own words, as you would to a colleague:

```
The cart total ignores the discount code. Can you fix it?
```

[Your first request](first-request.md) follows one like it from your message to the brief.

## Check that it worked

- The welcome line appeared, and the Lead answers.
- Type `/aether:doctor`. It prints a fixed report: what it checked, what failed and the exact fix. It checks Claude Code, Node, git, the version of Aether, the `aeth` command and whether it is on your `PATH`, Dynamic workflows, the harnesses installed and whether the folder is a git repository. It changes nothing.
- Outside a session, `claude plugin list` shows `aether@aether-plugin` with its status `enabled`.

**`aeth` is not found.** Open `claude` and type `/aether:doctor`. It gives the line to add to your `PATH`. Add it to your shell profile, open a new terminal and type `aeth` again. Aether never edits a shell file for you.

To change an answer later, run `/aether:setup` again.

## Next

- [Your first request](first-request.md): a small task, from your message to the brief.
- [Other harnesses](other-harnesses.md) and [Update and uninstall](update-and-uninstall.md).
- [Getting started](../getting-started.md): the same install in reference form, and [Troubleshooting](../guide/troubleshooting.md) when something fails.
- [Options](../guide/options.md#options): the eight options and their defaults.
