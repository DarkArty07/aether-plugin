# Acceptance A1: the native install

- **Date:** 2026-10-09 (the commands ran between 2026-10-10T00:39Z and 2026-10-10T00:41Z)
- **`claude --version`:** `2.1.296 (Claude Code)`
- **`git -C /tmp/aether-accept-a1-I1bEJz/clone rev-parse --short HEAD`:** `35e7aa8` (the merge of task-10, the 0.7.0 tree); the throwaway tag `aether--v0.7.0` exists in the clone only
- **Scratch directory `<S>`:** `/tmp/aether-accept-a1-I1bEJz`
- **K0 `stat` record, before anything:**

  ```
  /home/darkarty/.claude/settings.json 1791478083
  /home/darkarty/.claude/plugins/installed_plugins.json 1791258024
  ```

- **K0 `stat` record, at the end (after K6):**

  ```
  /home/darkarty/.claude/settings.json 1791478083
  /home/darkarty/.claude/plugins/installed_plugins.json 1791258024
  ```

  The two records match: nothing under `~/.claude` changed.

## Set-up

- `<S>` came from `mktemp -d -t aether-accept-a1-XXXXXX`. An earlier, interrupted attempt had left an empty `/tmp/aether-accept-a1-p7JBqs`; it held nothing and was removed with `rmdir`.
- K2: `git clone --quiet <worktree> <S>/clone && git -C <S>/clone tag aether--v0.7.0`. The source repository got no tag.
- K3: the fake model of Task 7, with no script. It bound port `35133`, which the system chose.

  ```
  $ cat <S>/fake/port
  35133
  $ ss -ltnp | grep ":35133 "
  LISTEN 0  511  127.0.0.1:35133  0.0.0.0:*  users:(("node",pid=3873724,fd=21))
  $ cat <S>/fake/pid
  3873724
  ```

  The listener is the `node` process of the fake model.
- K4: the four wrappers `<S>/c`, `<S>/c-net` (`CLAUDE_CONFIG_DIR=<S>/cfg`) and `<S>/c2`, `<S>/c2-net` (`CLAUDE_CONFIG_DIR=<S>/cfg2`) were written as K4 gives them, and `chmod +x`.
  The `-net` ones lack only `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.
- Every `claude` call below went through a wrapper. The only network traffic was the GitHub clone of `anthropics/claude-plugins-official`, made with a `-net` wrapper.

## Check 1: the marketplace validates

The command reads files only. It ran through `<S>/c`, so that even a stray write would land in `<S>/cfg` and K0's "only through the wrappers" holds:

```
$ <S>/c plugin validate /tmp/aether-accept-a1-I1bEJz/clone --strict
Validating marketplace manifest: /tmp/aether-accept-a1-I1bEJz/clone/.claude-plugin/marketplace.json

✔ Validation passed
exit=0
```

**PASS**

## Check 2: install from the clone's path, without the official marketplace

```
$ <S>/c plugin marketplace add /tmp/aether-accept-a1-I1bEJz/clone
Adding marketplace…✔ Successfully added marketplace: aether-plugin (declared in user settings)

$ <S>/c plugin install aether@aether-plugin
Installing plugin "aether@aether-plugin"...✔ Successfully installed plugin: aether@aether-plugin (scope: user). Warning: dependency "superpowers@claude-plugins-official" was not installed (no marketplace you have added lists it). "aether" will not load without it
1 userConfig option not yet set — run /plugin configure aether@aether-plugin in Claude Code, or pass --config KEY=VALUE.

$ <S>/c plugin list
Installed plugins:

  ❯ aether@aether-plugin
    Version: 0.7.0
    Read from: /tmp/aether-accept-a1-I1bEJz/clone/plugins/aether
    Scope: user
    Status: ✘ failed to load
    Error: Dependency "superpowers@claude-plugins-official" is not installed — run `claude plugin install superpowers@claude-plugins-official`, or check that its marketplace is added
```

All three commands exited 0. `aether@aether-plugin` failed to load, and the error names `superpowers@claude-plugins-official`, as spec F12 says. `Read from:` is the clone's `plugins/aether`: a marketplace added from a path loads in place (spec F13).

Two observations: the install itself succeeds, with a warning that names the missing dependency, and it prints a notice that one userConfig option (`lanes`) is "not yet set", although the option defaults to off.

**PASS**

## Check 3: add the official marketplace

```
$ <S>/c-net plugin marketplace add anthropics/claude-plugins-official
Adding marketplace…SSH not configured, cloning via HTTPS: https://github.com/anthropics/claude-plugins-official.git
Refreshing marketplace cache (timeout: 120s)…
Cloning repository (timeout: 120s): https://github.com/anthropics/claude-plugins-official.git
Clone complete, validating marketplace…
Cleaning up old marketplace cache…
✔ Successfully added marketplace: claude-plugins-official (declared in user settings) (+ 1 dependency: superpowers)

$ <S>/c plugin list
Installed plugins:

  ❯ aether@aether-plugin
    Version: 0.7.0
    Read from: /tmp/aether-accept-a1-I1bEJz/clone/plugins/aether
    Scope: user
    Status: ✔ enabled

  ❯ superpowers@claude-plugins-official
    Version: 6.4.1
    Scope: user
    Status: ✔ enabled
```

Adding the marketplace installed superpowers by itself (`+ 1 dependency: superpowers`, `"auto": true` in `installed_plugins.json`), so `aether` loaded without a second `plugin install`. Re-running `<S>/c plugin install aether@aether-plugin` was therefore not needed, and was not run.

`<S>/cfg/settings.json` afterwards lists both plugins under `enabledPlugins` as `true`.

**PASS**

## Check 4: the pinned copy, with lanes on (K5 into `<S>/cfg2`)

1. `<S>/cfg2/settings.json` was written as K5 gives it:

   ```json
   { "enableWorkflows": true, "extraKnownMarketplaces": { "aether-plugin": { "source": { "source": "git", "url": "file:///tmp/aether-accept-a1-I1bEJz/clone", "ref": "aether--v0.7.0" } } } }
   ```

2. `<S>/c2-net plugin marketplace add anthropics/claude-plugins-official` printed `✔ Successfully added marketplace: claude-plugins-official (declared in user settings)`.
3. A session from `<S>`: `<S>/c2 -p hi`. It ended with `API Error: 400 fake model` (the fake model refuses in record mode). That is allowed by K5.
4. **The first session did not clone the declared marketplace.** After the 30-second wait `<S>/cfg2/plugins/known_marketplaces.json` listed only `claude-plugins-official`, so K5's fallback applied: the session was run once more with `<S>/c2-net -p hi`, which ended the same way and was followed within a second by `aether-plugin` in `known_marketplaces.json`:

   ```json
   "aether-plugin": {
     "source": { "source": "git", "url": "file:///tmp/aether-accept-a1-I1bEJz/clone", "ref": "aether--v0.7.0" },
     "installLocation": "/tmp/aether-accept-a1-I1bEJz/cfg2/plugins/marketplaces/aether-plugin",
     "lastUpdated": "2026-10-10T00:40:49.702Z"
   }
   ```

   So the clone of a declared marketplace needs the session without `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. K4 says the same: `c-net` for "a session that must clone a declared marketplace".
5. `<S>/c2 plugin install aether@aether-plugin --config lanes=true`:

   ```
   Installing plugin "aether@aether-plugin"...✔ Successfully installed plugin: aether@aether-plugin (scope: user) (+ 1 dependency: superpowers)
   ```

6. K5's expectations:

   ```
   $ <S>/c2 plugin list
   Installed plugins:

     ❯ aether@aether-plugin
       Version: 0.7.0
       Scope: user
       Status: ✔ enabled

     ❯ superpowers@claude-plugins-official
       Version: 6.4.1
       Scope: user
       Status: ✔ enabled
   ```

   `<S>/cfg2/plugins/installed_plugins.json` gives `aether@aether-plugin` the `installPath`
   `/tmp/aether-accept-a1-I1bEJz/cfg2/plugins/cache/aether-plugin/aether/0.7.0`, which matches `<cfg2>/plugins/cache/aether-plugin/aether/0.7.0` exactly (checked with `node`). The copy is on disk and its `.claude-plugin/plugin.json` says `"version": "0.7.0"`.
   There is no `Read from:` line: this one is a copy in the plugin cache, not the clone loaded in place as in check 2.

7. The extra expectation of this check, read with `node` from `<S>/cfg2/settings.json`:

   ```json
   "pluginConfigs": { "aether@aether-plugin": { "options": { "lanes": true } } }
   ```

   `pluginConfigs["aether@aether-plugin"].options.lanes === true` printed `true` (`typeof` is `boolean`).

8. The pinned marketplace checkout `<S>/cfg2/plugins/marketplaces/aether-plugin` is at `35e7aa8`, which `git describe --tags --exact-match` names `aether--v0.7.0`, the same commit as the tag in `<S>/clone`.

**PASS**

## Check 5: the GitHub form

`claude plugin install aether --marketplace DarkArty07/aether-plugin` was not run: the repository is private and unpushed. Documented (spec F15), to verify after the owner's push.

**SKIPPED**

## Check 6: stop the fake model (K6)

```
$ kill $(cat /tmp/aether-accept-a1-I1bEJz/fake/pid)
$ ss -ltnp | grep ":35133 "      # no output: no listener on port 35133
```

The fake model had logged three model requests in `<S>/fake/fake.log` (from the two `-p hi` sessions of check 4, each answered with its 400), all on `127.0.0.1`. The final K0 `stat` record, in the header, equals the first.

**PASS**

Result: PASS
