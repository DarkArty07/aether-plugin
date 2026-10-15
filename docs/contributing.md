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

Node.js 22 with no dependencies. The workflow's tests run its script in a harness with stubbed agents, so they spend no tokens. `scripts/refresh-lanes.js` updates the lane table from Artificial Analysis; it reads `ARTIFICIAL_ANALYSIS_API_KEY`, or else the `.env` file its header comment names.

### Release

1. bump `"version"` in `plugins/aether/.claude-plugin/plugin.json`, the version that `tests/launcher.test.js` pins, the `Version X.Y.Z` line of the README, and the first `Version X.Y.Z:` line of the [changelog](changelog.md); tests/docs-facts.test.js checks the last two;
2. run `npm run check`;
3. merge to `main`;
4. in the main checkout, run `claude plugin tag plugins/aether`, which creates the tag `aether--v<version>`;
5. push `main` and the tag;
6. users update with `claude plugin update aether@aether-plugin`.
