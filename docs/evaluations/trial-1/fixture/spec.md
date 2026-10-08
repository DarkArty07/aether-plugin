# tasks: spec

`tasks` is a small task list for the command line: a library plus a CLI. It runs on Node.js 22, is written in CommonJS, and has no dependencies. Tests use `node:test` and run with `npm test` (`node --test`).

## Task model

A task is a plain object `{ id, title, tags, priority, due, done }`:

- `id`: a positive integer, unique within a list. The store assigns it: one more than the highest id in the list, or 1 for an empty list. Ids of removed tasks are never reused while a higher id exists.
- `title`: a non-empty string, trimmed, with single spaces between words.
- `tags`: an array of lowercase strings, without the `@`, with no duplicates, in order of first appearance.
- `priority`: `1` (high), `2` (normal, the default) or `3` (low).
- `due`: a `YYYY-MM-DD` string naming a real calendar date, or `null`.
- `done`: a boolean, `false` for a new task.

## Parsing a task line: `parseTask(line)`

The line is split on whitespace. Each word is one of:

- `@tag`: adds a tag. A tag is one or more of `A–Z`, `a–z`, `0–9`, `-` and `_`, and is stored in lowercase. A word that starts with `@` but is not a valid tag makes the line invalid.
- `!1`, `!2` or `!3`: sets the priority. Any other word that starts with `!`, or a second priority marker, makes the line invalid.
- `due:YYYY-MM-DD`: sets the due date. The date must exist in the calendar (`due:2026-02-30` is invalid). Any other word that starts with `due:`, or a second due date, makes the line invalid.
- anything else: a word of the title, in order.

`parseTask` returns `{ title, tags, priority, due }`. It throws an `Error` whose message starts with `invalid task:` when the line is invalid or the title is empty.

## Store: `load(file)`, `save(file, tasks)`, `nextId(tasks)`

- `load(file)` returns the list of tasks saved in the file. A missing file is an empty list. A file that does not hold a JSON array throws an `Error` whose message starts with `invalid store:`.
- `save(file, tasks)` writes the list as JSON indented by two spaces, followed by a newline. It creates the parent directory when needed. It writes a temporary file in the same directory and renames it over the target, so that a reader never sees a partly written file, and it leaves no temporary file behind.
- `nextId(tasks)` returns the highest id plus one, or 1 for an empty list.

## Queries: `filterTasks(tasks, filter)`, `sortTasks(tasks, by)`

Both return a new array and leave their input unchanged.

- `filterTasks(tasks, { tag, done, dueBefore })`. Every field is optional, and a task must match all the fields given:
  - `tag`: the task has that tag, compared without regard to case;
  - `done`: the task's `done` equals it;
  - `dueBefore` (`YYYY-MM-DD`): the task has a due date strictly before it. Tasks without a due date do not match.
- `sortTasks(tasks, by)`:
  - `priority`: priority 1 first, then by due date (earliest first, tasks without a due date last), then by id;
  - `due`: by due date (earliest first, tasks without a due date last), then by priority, then by id;
  - `id`: by id.
  - Any other `by` throws an `Error` whose message starts with `invalid sort:`.

## Arguments: `parseArgs(argv)`

`argv` holds the command-line words after `node` and the script. The first word is the command: `add`, `list`, `done`, `remove` or `help`. No words at all means `help`. An unknown command throws.

Flags may appear anywhere after the command:

- `--file <path>`: the store file, `tasks.json` by default;
- `--tag <tag>`, `--due-before <YYYY-MM-DD>`: filters for `list`;
- `--done` or `--pending`: keep only done, or only pending, tasks;
- `--sort <priority|due|id>`: the order for `list`, `priority` by default.

`parseArgs` returns `{ command, args, file, filter, sort }`:
- `args` holds the other words, in order;
- `filter` has only the fields that were given: `tag`, `done` (`true` for `--done`, `false` for `--pending`) and `dueBefore`.

It throws an `Error` whose message starts with `invalid arguments:` in these cases:
- an unknown command or flag;
- a flag without its value;
- `--done` together with `--pending`;
- a `--sort` that is not one of the three orders;
- a `--due-before` that is not a real date.

## Formatting: `formatTask(task)`, `formatTable(tasks)`

- `formatTask(task)` writes, in order:
  - `#<id>`;
  - `[x]` when the task is done, or `[ ]` when it is pending;
  - the title;
  - ` !<priority>` when the priority is not 2;
  - ` due:<date>` when the task has a due date;
  - ` @<tag>` for each tag.

  Example: `#3 [ ] Buy milk !1 due:2026-10-10 @home @errands`.
- `formatTable(tasks)` returns the tasks' lines joined by `\n`, with no newline at the end. An empty list gives `No tasks.`

## Commands: `runCommand(parsed)`

`parsed` is what `parseArgs` returns. `runCommand` returns `{ output, exitCode }` and works on the store in `parsed.file`.

- `add <words...>`: parses the words as a task line, gives the task the next id, saves it, and outputs `Added #<id>`.
- `list`: outputs the formatted table of the tasks that match the filter, in the chosen order.
- `done <id>`: marks the task done, saves, and outputs `Done #<id>`.
- `remove <id>`: removes the task, saves, and outputs `Removed #<id>`.
- `help`: outputs the usage text, which names every command and flag, with exit code 0.

For `done` and `remove`:
- an id that is not a positive integer gives exit code 2 and an output that starts with `invalid arguments:`;
- an id that matches no task gives exit code 1 and the output `No task #<id>.`

An invalid task line gives exit code 2, and the output is the error's message. Every other success has exit code 0.

## CLI: `bin/tasks.js`

The CLI runs `parseArgs` on its arguments, then `runCommand`, then prints the output and exits with the exit code:
- output for exit code 0 goes to stdout;
- output for any other exit code goes to stderr.

An error thrown by `parseArgs` exits with code 2, after printing its message to stderr.
