---
name: first-setup
description: Install the short command that starts Aether mode, once, after installing the plugin.
disable-model-invocation: true
---

# First setup

The person called this once, after installing the plugin, to get a short command that starts Aether mode. You run two commands and tell them the result in a few lines. You do not write any code, edit any file by hand, or touch a shell file.

The command is `aether-first-setup`, on the Bash tool's `PATH`. It installs a small stub, named `aeth` unless the person names another, in `~/.local/bin`. The stub runs the launcher of the newest installed release, so it needs no second setup after an update. Every command prints one JSON object. If `aether-first-setup` is not found, the plugin is not enabled in this session: tell the person to start a new session after installing it, and stop.

1. **Check.** Run `aether-first-setup --check`, adding `--name <name>` when the person named the command, in the call or in words. It writes nothing.
   - Exit 0: nothing is in the way. Go to step 2.
   - Exit 3: the name is taken by something that is not Aether's. Say what the `error` names, ask the person for another name, once, and run the check again with `--name <name>`. If that is taken too, say so and stop.
   - Exit 2: the name is not valid (letters, digits, `.`, `_` and `-`, starting with a letter or a digit, at most 64 characters, and not `claude`). Ask for another, once, in the same way.
   - Exit 1: it could not write. Give the person the `error` as it is, and stop. Never write the stub by hand, never use sudo, never edit a shell file.
2. **Install.** Run `aether-first-setup` with the same `--name`. Its JSON has `path`, `replaced`, `launcher`, `launcherVersion`, `onPath` and `shellHint`; on exit 1 do as above.
3. **Tell the person, in a few lines:**
   - the command to type in a terminal: `<name>`, and that every argument goes on to `claude`, as in `<name> --resume`;
   - the `PATH`: the name check and `onPath` read this session's `PATH`, which may differ from their terminal's. When `onPath` is false, give the lines of `shellHint` for their shell, and say a new terminal is needed after adding one. When it is true, they should still open a new terminal and type the command, and add the line of `shellHint` if it is not found. Add nothing yourself;
   - when `replaced` is true, that an earlier stub of Aether's was refreshed;
   - when `launcher` is null, that no installed release was found, so the command will say so until the plugin is installed with `claude plugin install aether --marketplace DarkArty07/aether-plugin`.

Do not start a session, and do not run the new command: it opens Claude Code.
