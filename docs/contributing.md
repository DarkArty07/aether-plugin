---
title: Contributing
description: How to work on the Aether plugin in this repository, run its checks and cut a release.
order: 30
---

# Contributing

This page is for working on the plugin itself: trying a branch, running the checks and releasing. For the method the plugin follows, read [Methodology](methodology.md), and for what each release changed, the [Changelog](changelog.md).

## Development

The plugin is `plugins/aether/`, and the repository's `.claude-plugin/marketplace.json` lists it. An installed release is a copy in Claude Code's plugin cache, so work in the repository never changes it until you update. To try a branch:

    claude --plugin-dir <worktree>/plugins/aether --agent aether:lead --effort xhigh

That loads the tree for one session, in place of the installed release; with the launcher it is `aether-lead --plugin-dir <worktree>/plugins/aether`. Its data goes to `~/.claude/plugins/data/aether-inline/`, and its options are set apart, under `pluginConfigs["aether@inline"]` in your settings. The bins of a branch run by path: `node <worktree>/plugins/aether/bin/aether-plan check <plan>`.

    npm test              # node --test "tests/*.test.js": bins, libraries, workflow scenarios and the fake model
    npm run test:mod      # claude plugin test plugins/aether: the mod (usage meter and ops)
    npm run validate      # claude plugin validate, on the plugin and on the marketplace
    npm run check         # all three

`npm test` runs the bins, the libraries, the workflow scenarios and the documentation facts; it does not run the mod. `npm run test:mod` runs `claude plugin test plugins/aether`: the mod, with the usage meter, ops and delegation, on the test engine with a simulated model.

Node.js 22 with no dependencies. The workflow's tests run its script in a harness with stubbed agents, so they spend no tokens. `scripts/refresh-lanes.js` updates the lane table from Artificial Analysis; it reads `ARTIFICIAL_ANALYSIS_API_KEY`, or else the `.env` file its header comment names.

Take the number of a new `docs/decisions.md` entry when the change is integrated, not when the branch starts: if `main` moved since and the number is taken, renumber to the next free number before merging. `tests/docs-decisions.test.js` fails on a repeated number.

### Check the plan format

When you change the plan checker, the compiler or the format of a task, check that the plan format Aether builds from still reads correctly. Save this two-task plan as `tasks.md` anywhere. It is what the Writer produces for a plan, shortened: every task has the Aether fields, and there is an `## Aether Execution` section.

```
# Tasks: Greeting and farewell

## Task list

### Task 1: The greeting function

**Aether:**
- Area: greeting
- Owns: `src/greeting.js`, `test/greeting.test.js`
- Depends on: none

Write `greet(name)` in `src/greeting.js`. It returns `Hello, <name>!`.

### Task 2: The farewell function

**Aether:**
- Area: farewell
- Owns: `src/farewell.js`, `test/farewell.test.js`
- Depends on: none

Write `farewell(name)` in `src/farewell.js`. It returns `Goodbye, <name>!`.

## Aether Execution

- Test command: `npm test`
- Max agents: 20
```

Then run the plan checker on it. Inside a session it is on the `PATH`; outside one it is not, so use its path, as the paragraph after the output explains:

```
aether-plan check tasks.md
```

It prints one line of JSON and exits 0 when the plan is sound. For this plan it is:

```
{"ok":true,"tasks":2,"waves":[["task-1","task-2"]],"warnings":[]}
```

`waves` shows the swarm would run both tasks at the same time, because neither depends on the other and they own different files.

The commands of the plugin's `bin/` folder are on the `PATH` of the Bash tool in a session that has the plugin, so inside a session you type `aether-plan check tasks.md`. In a shell outside a session they are not on the `PATH`, and you run the file by its path. In a clone of this repository that is `node plugins/aether/bin/aether-plan check tasks.md`. If you installed from GitHub, the plugin's copy is in the Claude config dir, and the path is `node ~/.claude/plugins/cache/aether-plugin/aether/<version>/bin/aether-plan check tasks.md`, where `<version>` is the one `claude plugin list` shows. If you set `CLAUDE_CONFIG_DIR`, write that folder in place of `~/.claude`. If you installed from a clone's path, the plugin loads from the clone itself, so the clone's path above is the one.

### Release

While the major version is 0, a minor version (`0.Y.0`) may break compatibility, and the changelog says so explicitly.

1. bump `"version"` in `plugins/aether/.claude-plugin/plugin.json`, the version that `tests/launcher.test.js` pins, the `Version X.Y.Z` line of the README, and the first `Version X.Y.Z:` line of the [changelog](changelog.md); tests/docs-facts.test.js checks the last two; turn the changelog's `## Unreleased` entry into part of that new `Version X.Y.Z:` line;
2. run `npm run check`;
3. merge to `main`;
4. in the main checkout, run `claude plugin tag plugins/aether`, which creates the tag `aether--v<version>`;
5. push `main` and the tag;
6. users update with `claude plugin update aether@aether-plugin`.

## The website

`site/` is the project's landing page: static HTML, CSS and JavaScript with no build step and no dependencies, which also opens straight from `file://`. `index.html` holds the page and its Spanish copy, `app.js` holds both languages and the animations, `404.html` is the page GitHub Pages shows for a missing address, and `assets/` holds the images and the fonts with their licence texts. Nothing in it refers to a file outside `site/`.

To preview it, serve the folder and open the address it prints:

    python3 -m http.server -d site

The workflow `.github/workflows/pages.yml` deploys it: on a push to `main` that changes `site/` or the workflow itself, and by hand from the Actions tab, it uploads `site/` and publishes it with GitHub Pages. It uses no secrets. The workflow stays off until the repository variable `PAGES_ENABLED` is `true`. Pages must also be turned on once in the repository settings, with the source set to "GitHub Actions", and a private repository needs a plan that allows Pages (or has to be public). `tests/site.test.js` holds the folder to the rules above: every local link resolves, the only absolute addresses are this repository's and its Pages site, every image has an alt text, and no file is over 3 MB.

The images of the README live in `assets/readme/`: `banner.png`, `radar.png`, `mascot.gif` and `social.png`, the card that the site shares. The concepts, plates and work files they came from stay out of the repository.
