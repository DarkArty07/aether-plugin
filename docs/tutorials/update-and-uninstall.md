---
title: Update and uninstall
description: Update Aether, turn on auto-update, change your setup answers, pin or roll back a release, and uninstall the plugin and the aeth command
order: 108
---

# Update and uninstall

At the end of this guide you can move Aether to a newer release, go back to an older one, and remove it completely. Each part takes a few minutes.

## Before you start

- Aether is installed: `claude plugin list` shows `aether@aether-plugin`.
- The plugin and `aeth` are two things. The plugin lives in Claude Code's plugin folders. `aeth` is a small file that `/aether:setup` put in a folder of your `PATH`. It runs the newest installed release each time, so an update needs no second setup, and uninstalling the plugin does not remove the file.
- An update takes effect in a session that starts after it, so close your Aether sessions first.

## Steps

### 1. Update

```
claude plugin update aether@aether-plugin
```

It ends with `Restart to apply changes.` Close the terminal, open a new one and type `aeth`. Claude Code keeps the previous version's folder for 14 days, and `aeth` runs the newest.

What you see: the welcome line names the new version.

### 2. Or let Claude Code update it

In Claude Code, open `/plugin` → Marketplaces and turn on auto-update for the `aether-plugin` marketplace. It is off by default for third-party marketplaces.

### 3. Change what you chose

Run `/aether:setup` again, as often as you like, and close the terminal after it:

```
claude "/aether:setup"
```

It refreshes `aeth` and asks the questions again, so you can change the permission mode, the harnesses or the name. An `aeth` written by an earlier version keeps working and starts with permissions bypassed, as before. Run the setup to choose another mode.

### 4. Pin a release, or roll back

To stay on a release, give the marketplace's source a `ref`, a release tag, in `~/.claude/settings.json`:

```
"extraKnownMarketplaces": {
  "aether-plugin": { "source": { "source": "github", "repo": "DarkArty07/aether-plugin", "ref": "aether--v<version>" } }
}
```

Edit that entry in place. After an install Claude Code adds `enabledPlugins` and the official marketplace to the same file, and replacing the file would drop them. Then start a session, which fetches the tag, and run the update of step 1. Set the `ref` to a newer tag, or remove it, to move forward again.

Never remove the marketplace to change versions: removing it uninstalls Aether and deletes its data. If the update does not move the plugin, start one session without `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, and run it again. [Maintenance](../guide/maintenance.md#update-pin-roll-back-and-uninstall) has the details.

### 5. Find the `aeth` file before you uninstall

While the plugin is still installed, type `/aether:doctor` in a session. The line of the command says `aeth runs Aether` and gives its path. In a terminal you can also run:

```
command -v aeth
```

To be sure the file is Aether's, look at its first two lines. The second one reads `# aether-first-setup stub`:

```
head -n 2 "$(command -v aeth)"
```

### 6. Uninstall the plugin

```
claude plugin uninstall aether@aether-plugin
```

This also deletes Aether's data directory, `~/.claude/plugins/data/aether-aether-plugin/`, with the usage records, the run history, the delegate log and the Examiner's hidden exams. Add `--keep-data` to keep it.

Aether also keeps files inside the repositories where you used it, under `.aether/`: the autonomy grants, the diaries and briefs of runs, and the list of irreversible commands. They are not in the data directory, so the uninstall leaves them. Delete the folder by hand if you no longer want it.

### 7. Remove the `aeth` file

Once you have checked that it is Aether's, remove the file that step 5 found:

```
rm "$(command -v aeth)"
```

If you gave the command another name, use that name. If you ran the setup with more than one name, repeat it for each. Aether edited no shell file. If you added a line to your profile to put the folder on your `PATH`, that line is yours to keep or remove.

## Check that it worked

- After an update, `claude plugin list` shows the new version with the status `enabled`, and `/aether:doctor` says which release is installed.
- After an uninstall, `claude plugin list` no longer shows `aether@aether-plugin`.
- After you remove the file, `command -v aeth` prints nothing.
- Without `--keep-data`, the data directory is gone.

## Next

- [Install and start](install-and-start.md): to put Aether back.
- [Work for hours](work-for-hours.md) and [Other harnesses](other-harnesses.md): the choices the setup saves.
- [An update does not take](../guide/troubleshooting.md#an-update-does-not-take): when the version does not change.
- [Options](../guide/options.md#options): the eight options and their defaults.
