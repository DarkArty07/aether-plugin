---
name: doctor
description: Check that Aether is installed and ready, and say how to fix what is not.
disable-model-invocation: true
---

# Doctor

The person called this to find out whether Aether is ready, and what to fix if it is not. You run one command and report. You change nothing: you run no fix, not even a command, edit no file, write no code and touch no shell file. The person decides.

The command is `aether-doctor`, on the Bash tool's `PATH`. It prints one JSON object whose `checks` each have `id`, `status` (`ok`, `info`, `warn` or `error`), `detail` and `fix` (the command or step, or `null`). It exits 0 with no error, 1 with one, and 2 for a usage mistake. If `aether-doctor` is not found, the plugin is not enabled in this session: say so, tell the person to start a new session after installing it, and stop.

1. **Run.** `aether-doctor`, adding `--name <name>` when the person named their command, in the call or in words. When it prints only an `error` (exit 2, or exit 1 when the check itself failed), give it and stop.
2. **Report,** in the person's language, in this fixed shape:
   - One line of summary: all good, or the number of problems (checks with status `warn` or `error`).
   - One line per check, in the order given, with its symbol and its `detail`: `✓` for `ok`, `·` for `info`, `!` for `warn`, `✗` for `error`.
   - Then, when a check with status `warn` or `error` has a `fix`, a "To fix" list with one item per such check, with the `fix` exactly as given.

A check with status `info` is not a problem: if it has a `fix`, put it at the end of its line as a hint, not in the list.
