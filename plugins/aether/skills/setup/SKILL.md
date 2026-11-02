---
name: setup
description: Set up Aether after installing it, or change your choices. Checks what it needs, asks up to three questions and installs the short command aeth.
disable-model-invocation: true
---

# Setup

The person called this right after installing the plugin (the install line opens Claude Code with `/aether:setup`), or again to change what they chose. You check, ask, install, save their choice and show one final screen. You do not write code, edit a file by hand (a shell file or a settings file: the command of step 4 is what saves the options), run a fix for them, start a session, or run the new command: it opens Claude Code.

The commands below are on the Bash tool's `PATH`, and each prints one JSON object. If `aether-doctor` is not found, the plugin is not enabled in this session: tell the person to open a new terminal and run `claude "/aether:setup"`, and stop.

Write in the person's language: the one they wrote in, or, when their only message is this command, the one of their system locale (`echo "${LC_ALL:-${LC_MESSAGES:-$LANG}}"`, run with step 1): Spanish for `es…`, English otherwise.

1. **Check.** Run `aether-doctor`, adding `--name <name>` when the person named their command, in the call (as in `/aether:setup aether`) or in words. Keep its JSON: `checks`, `harnesses`, `options`, `command`, `installed`, `version`. Exit 2 means the name is not valid: run it again without `--name`, and step 3 asks for another. A failed check does not stop the setup: it goes on the final screen with its fix.

2. **Ask,** in one AskUserQuestion call, with the recommended option first. Ask the second and third questions only when they apply.
   - **Permissions** (always). «How should `aeth` start?»
     - «Work autonomously (Recommended)»: no permission prompts; an irreversible action (a push, a merge to `main`, a publish, a deploy, a delete, a change of credentials) still waits for your yes. → `autonomous`
     - «Claude Code auto mode»: Claude Code approves what it judges safe and stops what is risky. → `auto`
     - «Ask before each tool»: the safest; a long task stops at every permission prompt. → `ask`
   - **Other harnesses** (only when `harnesses` is not empty). «I found <names> installed. Should Aether send them work while their quota lasts?», with `multiSelect`:
     - «No, only Claude (Recommended)».
     - One option per harness found, up to three. When more than three were found, offer «All of them (<names>)» instead, and the person can name a few in their own words.
     - Every harness runs its CLI without permission prompts, in a worktree of its own, with credential variables kept out of its environment but the home directory reachable: say so in the question, and «runs without permission prompts» in the option of each harness and of «All of them». In the option of `cursor`, also say that it is not tested with a real account and has no models in the lane table, so it takes no work. The names in `harnesses` are the ones the option takes: save them as they are.
     - When `options.superdelegation` is already on, say which harnesses it uses now in the question.
   - **Name** (only when `command.path` is set and `command.own` is false: the name is a command that is not Aether's). «`<name>` is already a command on your computer. Which name should Aether's command have?», with `<name>2` and, unless the taken name is `aether`, `aether` as options.

3. **Install.** Run `aether-first-setup --permissions <autonomous|auto|ask>`, adding `--name <name>` when one was named or chosen. Keep its JSON: `path`, `dir`, `onPath`, `shellHint`, `replaced`, `permissions`.
   - Exit 3, the name is taken; or exit 2 with an `error` about the name, which is not valid (letters, digits, `.`, `_` and `-`, starting with a letter or a digit, at most 64 characters, not `claude`): ask once for another name and run it again. If that fails too, or exit 2 names something else, put the `error` on the final screen.
   - Exit 1, it could not write: put the `error` on the final screen as it is. Never write the command by hand, never use sudo.

4. **Save the harness choice,** only when that question was asked. The values are JSON strings:
   - Harnesses chosen: `printf '%s' '{"superdelegation":"true","harnesses":"<names, comma-separated>"}' | claude plugin configure aether@aether-plugin --values-stdin`
   - «No, only Claude», when `options.superdelegation` is on: the same command with `{"superdelegation":"false"}`. When it is off, write nothing.
   - If the command fails, put its message on the final screen with the way by hand: `/plugin` → Installed → aether → Configure options.

5. **The final screen,** in a fenced block, in this order:
   ```
   Ready: Aether <installed, or version>
   ✓ Claude Code <version> · Node <version> · git <version>
   ✓ Workflows on
   ✓ Command: <name> (in <dir>, already on your PATH)
   ✓ Permissions: <works autonomously | Claude Code auto mode | asks before each tool>; push, merge to main, publish, deploy, deletes and credentials wait for your yes
   ✓ Other harnesses: <names>, or only Claude

   Now close this terminal, open a new one in your project's folder and type:  <name>
   Try asking:
     · «Explain this project to me»
     · «Fix the failing test in …»
     · «I want a login page with …»   (design and swarm)

   If something fails: /aether:doctor   ·   To change something: /aether:setup
   ```
   - Mark each line ✓ (ok), · (info) or ✗ (warn or error), and put the `fix` of each ✗ on the line below it. For workflows that are `info`, write «Workflows: on unless your plan is Pro (/config → Dynamic workflows)».
   - When `onPath` is false, the command line is ✗, and below it the line of `shellHint` for the person's shell (`$SHELL`), with «add it, then open the new terminal».
   - When `replaced` is true, add «(an earlier `<name>` was refreshed)» to the command line.
   - Translate every line into the person's language; keep the commands as they are.

Say nothing after the block.
