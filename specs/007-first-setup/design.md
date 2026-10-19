# Design: a launcher that installs itself, and the `first-setup` skill

## Intent

The owner's words: «primero vamos a hacer el lanzador, la skill y lo que se necesite»; «solucionar pragmáticamente que mi lanzador no funciona, que no me sale el tema»; «la skill se debería llamar algo así como aether-first-setup»; «publica el lanzador y la skill para que caiga en la nueva instalación y esté en el repo». The entry screen is out: «dejar la entrada para después».

What was found. The launcher `scripts/aether-lead` exists only in a clone, so a person who installs the plugin has no short way to start Aether mode. The owner's copy in `~/.local/bin/` was a copy, not a link, and went stale: it lacked the `theme` setting, so the Aether theme never showed. `aether` is taken on the owner's machine by another project's command.

## Decisions

1. **The launcher ships in the plugin**, at `plugins/aether/launcher/aether-lead`, outside `bin/` so that it is not put on the Bash tool's `PATH` and the count of commands of `bin/` does not move for it. Its content is today's `scripts/aether-lead`, unchanged. `scripts/aether-lead` becomes a three-line forwarder that runs the plugin's launcher by its own resolved path (`readlink -f`), so every existing link to it keeps working.
2. **`aether-first-setup`** is a new command of `bin/`: a thin bin over `lib/first-setup.js`. It installs a stub, a small shell file, named by `--name` (default `aeth`) in `--dir` (default `~/.local/bin`).
3. **The stub never goes stale.** It runs the launcher of the newest installed release: it lists `"${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/aether/*/launcher/aether-lead`, takes the highest version by `sort -V`, and `exec`s it with all its arguments. With none found it prints one line saying how to install the plugin, and exits 1. The stub carries a marker line, `# aether-first-setup stub`, which is how the command knows a file is its own.
4. **It never takes what is not its own.**
   - A name must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`; anything else is refused.
   - If a file of that name exists in `--dir`, or any executable of that name is on the `PATH`, and it is not a stub with the marker, the command writes nothing and exits 3, naming what it found and suggesting `--name`.
   - A stub with the marker is replaced in place (a re-run refreshes it).
   - A new file is created with the `wx` flag and mode 0755; a replaced stub is written to a temporary file in the same directory and renamed over.
   - It creates `--dir` if missing. It never edits a shell file, never uses sudo, and never touches a file outside `--dir`.
5. **The `PATH` check prints, it does not edit.** When `--dir` is not on the `PATH`, the result says so and gives the line to add for bash, zsh and fish.
6. **`--check`** reports what would happen and writes nothing.
7. **The result is one JSON object on stdout** (`installed`, `name`, `path`, `launcher`, `launcherVersion`, `onPath`, `replaced`, `shellHint`), or `{"error": ...}` with exit 2 (usage) or 3 (a name that is taken), like the other bins.
8. **The skill is `first-setup`**, so `/aether:first-setup`. It is for the person to call, once, after installing, in a plain session. It tells Claude to run `aether-first-setup --check`, then `aether-first-setup` (with `--name <name>` when the person named one), and to relay the result in a few lines: the command to type, and the `PATH` line when it is needed. On exit 3 it asks the person for another name once and runs again. It does not write code. Its frontmatter sets `disable-model-invocation: true`, so that no entry of it is added to the skills list of a plain session; if `claude plugin validate --strict` or the documentation shows that the field does not do this, say so in the report and keep the skill's description to one short line.

## Not in this change

The entry screen and any menu. An install-time step: Claude Code has no install event for a plugin, so the person runs the skill once. The owner's old `claude-aether` wrapper. Any change to the options.

## Tests (no model, no network, in throwaway directories)

- The bin: installs a stub in a temporary `--dir` with the marker and mode 0755; `--check` writes nothing; a re-run replaces the own stub and says `replaced`; a foreign file of the same name is left byte-identical and the exit is 3; a foreign executable of that name on the `PATH` gives exit 3; invalid names (`../x`, `-x`, `a b`, an empty one) give exit 2; `--dir` missing is created; `onPath` is true and false as it should be, with the hint only when false.
- The stub, run against a fake cache: with the versions 0.9.0, 0.12.3 and 0.12.10 it runs 0.12.10's launcher and passes its arguments whole; it honors `CLAUDE_CONFIG_DIR`; with no cache it prints one line and exits 1.
- The launcher: `tests/start-command.test.js` keeps passing through the forwarder, and one test pins that the plugin's launcher and the forwarder start `claude` with the same arguments.
- The skill: `plugins/aether/skills/first-setup/SKILL.md` has `name: first-setup` and a `description`.
- The docs facts: the count of commands of `bin/` is eleven everywhere the pages give it, `aether-first-setup` is a file of `bin/`, and the pages that name `aether-lead` still resolve.

## Docs

`docs/getting-started.md` (Install and Start: run `/aether:first-setup` once, then the new command), the README's First start (about three lines, the README stays within 160 lines), `docs/reference/components.md` (the skill, the command and the launcher; the footprint of the skill is read from the plugin, not measured, as for the 0.8 to 0.12 additions), `docs/guide/troubleshooting.md` (a theme that does not show: the launcher copy is stale, run the setup again), `docs/changelog.md`, `docs/roadmap.md`, `docs/decisions.md` (A59), and a handoff.
