# Acceptance A5: pin and roll back (2026-10-09)

**Question.** Does a user who pins the marketplace to a release tag stay on that release, move to a newer one when the `ref` changes, and roll back to the earlier one the same way, with the plugin's data directory untouched?

- **Date:** 2026-10-09 18:41 CST (2026-10-10T00:41Z)
- **Claude Code:** `claude --version` printed `2.1.296 (Claude Code)`
- **Clone:** `git -C /tmp/aether-accept-a5-emg7oF/clone rev-parse --short HEAD` printed `51f9ebb`, the throwaway `0.7.1` commit. The tag `aether--v0.7.0` is on `35e7aa8`, the tree of this task's branch.
- **Scratch directory:** `/tmp/aether-accept-a5-emg7oF`
- **K0 `stat -c '%n %Y' ~/.claude/settings.json ~/.claude/plugins/installed_plugins.json`**

  Before the first command:

  ```
  /home/darkarty/.claude/settings.json 1791478083
  /home/darkarty/.claude/plugins/installed_plugins.json 1791258024
  ```

  After the last command (K6 done):

  ```
  /home/darkarty/.claude/settings.json 1791478083
  /home/darkarty/.claude/plugins/installed_plugins.json 1791258024
  ```

  The two records match.

## Set-up: K0 to K5, and the second release

1. **K1, K2.** `mktemp -d -t aether-accept-a5-XXXXXX` made `/tmp/aether-accept-a5-emg7oF`. The clone was `git clone --quiet <this worktree> /tmp/aether-accept-a5-emg7oF/clone`, then `git -C .../clone tag aether--v0.7.0`.
2. **K3.** The fake model ran with no script: `listening 43557`, pid `3858824`. `ss -ltnp | grep ":43557 "` showed `127.0.0.1:43557 ... users:(("node",pid=3858824,fd=21))`, the same pid as `fake/pid`.
3. **K4.** `/tmp/aether-accept-a5-emg7oF/c` and `c-net` were written as the kit gives them, with `CLAUDE_CONFIG_DIR=/tmp/aether-accept-a5-emg7oF/cfg`, and `chmod +x`. Every `claude` call below went through one of them.
4. **The second release, in the clone only.**

   ```
   sed -i 's/"version": "0.7.0"/"version": "0.7.1"/' plugins/aether/.claude-plugin/plugin.json
   git -C /tmp/aether-accept-a5-emg7oF/clone -c user.name=acceptance -c user.email=acceptance@example.invalid commit -qam "throwaway 0.7.1"
   git -C /tmp/aether-accept-a5-emg7oF/clone tag aether--v0.7.1
   ```

   `git show aether--v0.7.1:plugins/aether/.claude-plugin/plugin.json | grep version` printed `"version": "0.7.1"`; the same for `aether--v0.7.0` printed `"version": "0.7.0"`.
5. **K5, the pinned install.**
   - `cfg/settings.json` was `{ "enableWorkflows": true, "extraKnownMarketplaces": { "aether-plugin": { "source": { "source": "git", "url": "file:///tmp/aether-accept-a5-emg7oF/clone", "ref": "aether--v0.7.0" } } } }`.
   - `c-net plugin marketplace add anthropics/claude-plugins-official` printed `Successfully added marketplace: claude-plugins-official`.
   - `c -p hi` from the scratch directory printed `API Error: 400 fake model`. After 30 seconds `known_marketplaces.json` still listed only `claude-plugins-official`.
   - **This step needed the network wrapper.** `c-net -p hi` printed the same error, and `known_marketplaces.json` then listed `aether-plugin` with `"ref": "aether--v0.7.0"` at once.
   - `c plugin install aether@aether-plugin` printed `Successfully installed plugin: aether@aether-plugin (scope: user) (+ 1 dependency: superpowers)`, and `1 userConfig option not yet set` (no `--config`, so `lanes` keeps its default).
   - `c plugin list` showed `aether@aether-plugin` `Version: 0.7.0` `Status: enabled`, and `superpowers@claude-plugins-official` `Version: 6.4.1` `Status: enabled`.
   - `cfg/plugins/installed_plugins.json` gave `aether@aether-plugin` the `installPath` `/tmp/aether-accept-a5-emg7oF/cfg/plugins/cache/aether-plugin/aether/0.7.0`, `gitCommitSha` `35e7aa88e07fa808acfc5f3e387634a0fa055176`.

Set-up: PASS

## Check 1: installed at 0.7.0

```
$ /tmp/aether-accept-a5-emg7oF/c plugin list
  ❯ aether@aether-plugin
    Version: 0.7.0
    Scope: user
    Status: ✔ enabled
$ mkdir -p /tmp/aether-accept-a5-emg7oF/cfg/plugins/data/aether-aether-plugin
$ echo keep > /tmp/aether-accept-a5-emg7oF/cfg/plugins/data/aether-aether-plugin/keep.txt
$ cat /tmp/aether-accept-a5-emg7oF/cfg/plugins/data/aether-aether-plugin/keep.txt
keep
```

After the `mkdir -p`, `cfg/plugins/data/` held only `aether-aether-plugin`: the data directory name is `<plugin>-<marketplace>`, the `id()` of `aether@aether-plugin`.

PASS

## Check 2: move forward to 0.7.1

The `ref` was changed with `node -e`, which read `cfg/settings.json`, set `extraKnownMarketplaces["aether-plugin"].source.ref` to `aether--v0.7.1` and wrote it back. The file also held the `enabledPlugins` and `claude-plugins-official` entries Claude Code had added at install; they were kept.

```
$ cd /tmp/aether-accept-a5-emg7oF && ./c -p hi
API Error: 400 fake model
  (30 seconds later, known_marketplaces.json still: "ref": "aether--v0.7.0")
$ ./c-net -p hi
API Error: 400 fake model
  (at once: "ref": "aether--v0.7.1", "lastUpdated": "2026-10-10T00:40:18.447Z")
$ ./c plugin update aether@aether-plugin
Checking for updates for plugin "aether@aether-plugin"…
✔ Plugin "aether" updated from 0.7.0 to 0.7.1 for scope user. Restart to apply changes.
$ ./c plugin list
  ❯ aether@aether-plugin
    Version: 0.7.1
    Scope: user
    Status: ✔ enabled
$ cat cfg/plugins/data/aether-aether-plugin/keep.txt
keep
```

- `installed_plugins.json` after the update: `installPath` `.../cache/aether-plugin/aether/0.7.1`, `version` `0.7.1`, `gitCommitSha` `51f9ebbe7bccf906e7e18512c522ee8fb24bcf40`.
- `keep.txt` is the same file: 5 bytes, modified at 18:39, the minute Check 1 wrote it.
- `cfg/plugins/cache/aether-plugin/aether/` holds `0.7.0` and `0.7.1`.
- **The `ref` change reached `known_marketplaces.json` only in the session run through `c-net`.** The session through `c` ran, and 30 seconds later the file still held the old `ref`. The two wrappers differ only in `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, which is the probable cause; this probe did not isolate it.

PASS

## Check 3: roll back to 0.7.0

The same steps, with `aether--v0.7.0` as the `ref`.

```
$ cd /tmp/aether-accept-a5-emg7oF && ./c -p hi
API Error: 400 fake model
  (30 seconds later, known_marketplaces.json still: "ref": "aether--v0.7.1")
$ ./c-net -p hi
API Error: 400 fake model
  (at once: "ref": "aether--v0.7.0", "lastUpdated": "2026-10-10T00:41:00.536Z")
$ ./c plugin update aether@aether-plugin
Checking for updates for plugin "aether@aether-plugin"…
✔ Plugin "aether" updated from 0.7.1 to 0.7.0 for scope user. Restart to apply changes.
$ ./c plugin list
  ❯ aether@aether-plugin
    Version: 0.7.0
    Scope: user
    Status: ✔ enabled
$ cat cfg/plugins/data/aether-aether-plugin/keep.txt
keep
```

- `installed_plugins.json` after the rollback: `installPath` `.../cache/aether-plugin/aether/0.7.0`, `version` `0.7.0`, `gitCommitSha` `35e7aa88e07fa808acfc5f3e387634a0fa055176`, the commit of the first install.
- `keep.txt` is the same file, still 5 bytes, still modified at 18:39.
- The rollback needs no command beyond the forward move: `plugin update` accepts a lower version when the pinned `ref` points to it.

**The data directory is the one the plugin computes.** Run with `CLAUDE_CONFIG_DIR=/tmp/aether-accept-a5-emg7oF/cfg` and `AETHER_DATA_DIR`, `CLAUDE_CODE_PLUGIN_CACHE_DIR` unset, `require('<cache>/aether-plugin/aether/<version>/lib/run.js').dataDir(process.env, '<cache>/aether-plugin/aether/<version>')` printed `/tmp/aether-accept-a5-emg7oF/cfg/plugins/data/aether-aether-plugin` for `0.7.0` and for `0.7.1`. The data directory does not depend on the version, which is why `keep.txt` survives both moves.

PASS

## Check 4: stop (K6)

```
$ kill $(cat /tmp/aether-accept-a5-emg7oF/fake/pid)
$ ss -ltnp | grep ":43557 "
  (no listener)
```

- The fake model had saved 9 requests (`req-1.json` to `req-9.json`) from the sessions above, each with the first message `hi`. Both wrappers point `ANTHROPIC_BASE_URL` at it, so no model request had another destination.
- The K0 `stat` records match (top of this file).

PASS

Result: PASS
