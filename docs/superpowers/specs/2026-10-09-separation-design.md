# Aether: the project apart from the copy the owner runs (design spec)

- **Date:** 2026-10-09
- **Status:** Written from the design the Lead approved as the owner's delegate on 2026-10-09: approach B, every section, and assumptions 1–6.
- **Method:** superpowers brainstorming, architectural path, in Aether mode. The Lead's session is `7081714f-a148-4285-9b89-ad41d50a98f3`.
- **Amends:** decision A8 (how `aether-mode` loads the plugin), the README's "Use Aether mode" and "Development" sections, and `scripts/refresh-lanes.js` (where the key lives). Adds A26.
- **Branch:** `feature/separation`, in the worktree `.worktrees/separation`. Plugin version 0.6.0.

## 0. Criterios del dueño

Estos criterios salen de los mensajes del dueño en esta sesión («Mira necesitamos hacer la separacion de repo de proyecto y repo local, me imagino que estmaos trabjando el local como proyecto verdad? no hay diferenciaicon entre local y proyecto», «hayq ue hacer la separacion ve separando», y del mensaje 5: «CON CALIDAD y SIN SOBREINGENIERIA»), y de la propuesta del Lead que el dueño aceptó. Cada requisito dice a cuál sirve. Lo que no sirve a ninguno está en §11, Propuestas, y no se construye.

| | Criterio | Evidencia que lo prueba |
|---|---|---|
| **C1** | **Lo que usas no cambia mientras trabajamos.** Ni un merge a `main`, ni una rama en el checkout principal, ni un `main` roto cambian lo que carga `aether-mode`. | Tras el merge, el launcher real sigue cargando la versión instalada (un `claude` falso imprime su `--plugin-dir`); tests del launcher; cada registro de `runs.jsonl` lleva la versión del plugin. |
| **C2** | **Actualizar es un comando explícito, local y sin red.** | Tests de `install` sobre un repositorio de prueba sin remoto. |
| **C3** | **Volver a la versión anterior es un comando.** | Tests de `rollback`; el ensayo de la migración. |
| **C4** | **`aether-mode` sigue siendo el interruptor,** con los mismos flags, y `claude` sigue en modo normal. `aether-mode --dev` carga el árbol de desarrollo a propósito. | El test que fija la línea de `claude`; los tests de comportamiento con fish y un `claude` falso. |
| **C5** | **Lo local vive fuera del proyecto:** la clave y los datos de corridas están en el directorio de datos, no en el árbol del repositorio. | Tests de `refresh-lanes`; tras la migración no hay `.env` en el repositorio. |
| **C6** | **Tu herramienta diaria no se rompe en ningún paso de la migración,** y el swarm, las lanes y la autonomía funcionan con la copia fija. | El ensayo en carpetas temporales; cada paso de la migración con su verificación y su forma de deshacerlo; `claude plugin validate --strict` y el hook de inicio sobre la copia instalada. |
| **C7** | **Con calidad y sin sobreingeniería:** sin hooks nuevos, sin red, sin dependencias. | El diff: un script, un flag en el launcher, una ruta en `refresh-lanes`, documentos y la versión. |

## 1. Summary

Today one working tree plays three roles. It is the project (code, history, the GitHub repository). It is also the plugin the owner runs: the fish function `aether-mode` is a link to `scripts/aether-mode.fish` in the main checkout and loads `<repo>/plugins/aether`, so whatever that checkout holds is what the next session loads. And it holds local state: the Artificial Analysis key in `.env`.

This change separates them:
- **The installed release.** `scripts/aether-install.js` extracts a tagged version from the local clone, with no network, into `~/.local/share/aether-plugin/installed/<version>-<commit>/`, launcher included, and keeps `current` and `previous` links. The owner's fish function links to the launcher inside `current`. Work on the project, merges to `main` included, changes nothing the owner runs until the next `install`; `rollback` swaps the two links.
- **The escape hatch.** `aether-mode --dev` loads the repository's development tree on purpose.
- **The key.** `refresh-lanes.js` reads it from the data directory; the migration moves it there.

Nothing inside `plugins/aether` changes but its version. No new hook.

## 2. Scope

**In:** parts 2 and 3 of the Lead's proposal: the installed copy, and the local state outside the project.

**Out, and not closed off:**
- The 18 tracked files that name the owner's machine, and `docs/evaluations`: they belong to the decision to make the repository public, which the owner has not taken (§11).
- **`.aether/` stays in the main checkout of each project Aether works on.** It is the swarm's workspace in that project (runs, unit worktrees, the autonomy registry, design transactions), the same in Asclepio as here; git ignores it; and moving it would change the core of the swarm, the guard and the autonomy in every project. "The run data" of the Lead's proposal means `runs.jsonl`, `usage/` and `lanes/`, which already live in the data directory. This differs from the Lead's wording to the owner ("las corridas dejan de vivir junto al codigo"); the Lead tells the owner.

## 3. Approaches

**A. A git worktree of the repository at the tag.** Cheap and exact, but the copy stays tied to the project's `.git`: it shows in `git worktree list`, and a `worktree remove`, a `prune` or a `checkout` inside it changes or breaks the owner's tool. It also checks out the whole repository. Not chosen.

**B. One extracted copy per version, from the local tag. Chosen.** `git archive <tag> plugins/aether scripts/aether-mode.fish` into its own directory. No network; only tracked files of the tag; after the install it does not depend on the repository. The copy has the repository's own shape, so every launcher since 0.1.0 works from it unchanged, and every tagged version can be installed or rolled back to. Verified on 2026-10-09: 0.5.0 extracted this way and launched through fish with a fake `claude` loaded `…/installed/0.5.0-4130f86/plugins/aether` with the same flags, resolved to the version; `bin/` kept its executable bits; `claude plugin validate --strict` passed on the copy; its SessionStart hook ran. About 376 KB per version.

**C. Claude Code's marketplace.** `claude plugin install` writes the plugin to a settings scope and enables it in every `claude` session, which breaks the on/off switch unless it is disabled and enabled per session through `--settings`, which is not verified. Pinning a tag needs a GitHub or git source (network); a local-path marketplace reads the working tree, not a tag. There is no command to go back a version. And the `--plugin-dir` facts the plugin relies on would need checking again. Kept as a proposal for a public repository (§11).

A `.zip` given to `--plugin-dir` was also set aside: where the mod writes its types, and whether `bin/` reaches `PATH`, are not verified.

## 4. Layout on disk

```
~/.local/share/aether-plugin/            (or AETHER_DATA_DIR)
  .env                                    the Artificial Analysis key, mode 600
  runs.jsonl  usage/  lanes/              unchanged
  installed/
    0.5.0-4130f86/
      plugins/aether/                     the plugin as tracked at the tag
      scripts/aether-mode.fish            the launcher as tracked at the tag
      dev-tree -> <main checkout>         used by --dev
    0.6.0-<commit>/ …
    current  -> 0.6.0-<commit>
    previous -> 0.5.0-4130f86
~/.config/fish/functions/aether-mode.fish -> ~/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish
```

**R1. The installed copy.** Each version installs into `<data>/installed/<version>-<commit>/`, where `<commit>` is the first 7 hexadecimal characters of the tag's commit. It holds `plugins/aether/` and `scripts/aether-mode.fish` exactly as tracked at the tag, executable bits included, and a symlink `dev-tree` to the absolute path of the repository's main checkout. Nothing else of the repository is copied. Sirve a: C1, C5

**R2. The links.** `<data>/installed/current` and `<data>/installed/previous` are symlinks whose target is a version directory's name (relative). Each is replaced atomically: a new link is created under a temporary name in `installed/` and renamed over the old one. When both change, `previous` is written first. Sirve a: C1, C3, C6

**R3. Copies are never rewritten.** A version directory that exists is reused as it is: never extracted again, never deleted by the installer. Only its `dev-tree` link may be repointed (R5). A tag moved to another commit installs as a new directory beside the old one. Copies stay writable, because Claude Code writes `.claude-plugin/types/` and `tsconfig.json` into a plugin directory when it loads the mod. Sirve a: C1, C6

**R4. The data directory** is `AETHER_DATA_DIR` when set, or else `~/.local/share/aether-plugin`: the rule of `plugins/aether/lib/run.js` `dataDir()`. Session start's 30-day pruning touches only `usage/` and `lanes/`, so it never touches `installed/` or `.env`. Sirve a: C5

## 5. The installer: `node scripts/aether-install.js <command>`

A project script, run by the agent; it is not a bin of the plugin. It reads tags from the repository it lives in (its own directory's parent), whatever the current directory, and works from the main checkout or any linked worktree. It uses no network.

**R5. `install [<version>]`.**
- With no version, it takes the highest `aether--v<major>.<minor>.<patch>` tag by numeric version order (0.10.0 is above 0.9.0). Tags of any other form are ignored.
- It checks that `plugins/aether/.claude-plugin/plugin.json` at the tag holds that version.
- When the version directory does not exist, it extracts the tag's `plugins/aether` and `scripts/aether-mode.fish` into a temporary directory under `installed/` whose name starts with `.tmp-`, then renames it into place. On any failure the temporary directory is removed.
- It points the version's `dev-tree` at the main checkout (created or replaced when it is missing or points elsewhere).
- If `current` already names this version directory, it changes neither `current` nor `previous`, and prints `aether <version> (<commit>) is already current.`
- Otherwise `previous` takes the old `current` (when there was one; when there was none, `previous` is left as it was), and `current` takes the new version. It prints `aether <version> (<commit>) is now current; previous: <version> (<commit>). It loads in the next aether-mode session.`, with `previous: none.` when there is no previous version.
- Exit 0. It never changes the repository's working tree, index, branches or tags.

Sirve a: C2, C1

**R6. Refusals change nothing.** Each prints one line and exits 1, with `installed/` as it was:
- no tag of the form: `no aether--v* tag in <main checkout>.`
- the named tag does not exist: `no tag aether--v<version>.`
- the tag's manifest disagrees: `aether--v<version> holds plugin version <found>, not <version>.` (`<found>` is `none` when the manifest is missing or has no version);
- the extraction fails: `cannot extract aether--v<version>: <git's or tar's error, trimmed>`;
- any other error: `aether-install: <message>`.

Sirve a: C2, C6

**R7. `rollback`.** It swaps `current` and `previous`, `previous` first, and prints the same line as `install`. A second `rollback` goes forward again. When either link is missing or names a directory that is gone, it prints `no previous version to roll back to.` and exits 1, changing nothing. Sirve a: C3

**R8. `status`.** It prints three lines and exits 0: `current: <version> (<commit>)`, `previous: <version> (<commit>)` and `latest tag: <version> (<commit>)`, each `none` when absent. A link that names a directory that is gone counts as absent. Sirve a: C2, C3

**R9. Usage.** Any other arguments (none, an unknown command, a version not of the form `<major>.<minor>.<patch>`, or extra arguments) print `usage: node scripts/aether-install.js install [<version>] | rollback | status` and exit 2. Sirve a: C2

## 6. The launcher

**R10. The default.** `aether-mode` loads the plugin beside its own file: it takes `realpath` of its own definition and loads `<that directory's parent's parent>/plugins/aether`, as it does today. Linked from `installed/current/scripts/aether-mode.fish`, it therefore loads the installed release, resolved to its version directory when the session starts; an install during a session does not change that session's files. The line that starts Claude Code stays byte-identical:

    env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv

Sirve a: C1, C4

**R11. `--dev`.** Only as the first argument. It is removed from the arguments. When the launcher's directory has a `dev-tree` link, it loads `dev-tree`'s `plugins/aether` (the main checkout, on whatever branch it has); when that tree is gone, it prints `aether-mode: the development tree that <path>/dev-tree points to is gone` on stderr and returns 1, and never falls back to the release. Without a `dev-tree` link (the launcher run from the repository itself), `--dev` changes nothing, because that already is the development tree. Trial harnesses keep passing `--plugin-dir` themselves. Sirve a: C4

**R12. Installing the launcher.** The owner's fish function is the symlink `~/.config/fish/functions/aether-mode.fish` → `~/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish`. In bash or zsh, the README's function uses `--plugin-dir "$(realpath ~/.local/share/aether-plugin/installed/current)/plugins/aether"`; `--dev` is for fish only. Sirve a: C1, C4

## 7. The key

**R13. Where `refresh-lanes.js` finds the key.** From `ARTIFICIAL_ANALYSIS_API_KEY` when set, or else from `<data>/.env` (R4), and nowhere else; it no longer looks in the repository. When neither has it, it prints `ARTIFICIAL_ANALYSIS_API_KEY is not set, and <data>/.env does not have it.` and exits 1. It never prints the key. The migration moves the file with `mv`, which keeps mode 600. `.git/info/exclude` keeps its `/.env` line. Sirve a: C5

## 8. What keeps working with the installed copy

Verified in the code on 2026-10-09; nothing here changes.
- `bin/` reaches `PATH` with `--plugin-dir` (research S2), now from the installed copy. Hooks run `${CLAUDE_PLUGIN_ROOT}/bin/…`.
- The plugin reads `config/lanes.json`, `config/autonomy.json` and `config/prices.json` from its own directory: a change to them reaches the owner with a release, like code. `AETHER_LANES_CONFIG` still overrides the lane table.
- `aether-wt`, `aether-lane` and `aether-autonomy` find the main checkout and `.aether/` from the working directory's repository (`git rev-parse --git-common-dir`), never from the plugin's location.
- The usage meter, the lane log and `runs.jsonl` write to the data directory, and `aether-report` records the plugin version of the copy that ran.
- The design lane hands agy absolute paths outside the workspace already (superpowers' skills), so a plugin outside the project is no new case.

**R14. No change inside `plugins/aether`** but `"version": "0.6.0"` in its manifest. `hooks/hooks.json` does not change, and no hook is added. Sirve a: C6, C7

## 9. The migration

The Lead runs it, all of it, with no question to the owner. The plan's "After the swarm" section holds each command, its check and its undo.

**R15. The order.** Switching the owner's fish link happens only after the rehearsal and the fake-`claude` check pass.
1. **Rehearsal, with no tokens and nothing of the owner's touched:** a local clone (`git clone --local`, no network) with a temporary `aether--v0.6.0` tag; a temporary data directory and fish function path; a fake `claude` that prints its arguments. Install 0.5.0 and 0.6.0; run the launcher with and without `--dev`; `rollback` twice; `status`; `claude plugin validate --strict` and the SessionStart hook on the installed copy.
2. **Pin the owner to 0.5.0 before the merge:** install 0.5.0 (today's `main`, `4130f86`) into the real data directory with the branch's installer, check it with the fake `claude`, then switch the fish link. Behavior is identical to today. Undo: link the function back to `<repo>/scripts/aether-mode.fish`.
3. **Merge to `main`,** under the owner's authorization of this session. Check that the owner's launcher still loads the installed 0.5.0: the first proof of C1.
4. **Move the key** to the data directory; check that it is there with mode 600 and gone from the repository.
5. **Release 0.6.0 and install it:** the local tag `aether--v0.6.0` (`claude plugin tag plugins/aether`, or `git tag -a` if that command does not name it so), then `install`: current 0.6.0, previous 0.5.0. Undo: `rollback`.

Pushing `main` and the tag is not needed for any of this, and follows the Lead's standing authorizations. If Claude Code asks to confirm a new `--plugin-dir` in the first real session, that is one "yes" per version and not a failure.

Sirve a: C6, C1, C5

## 10. Documents, version and tests

**R16. The README** says, in "Use Aether mode": that `aether-mode` loads the installed release, how to install it and link the launcher (fish and bash), the three commands, and `--dev`. Its data list adds `installed/` and `.env`. "Development" says that the main checkout no longer feeds `aether-mode`: a session's `bin/` on `PATH` is the installed release's, and a branch's bins are run by path or with `aether-mode --dev`. A new "Release" subsection gives the procedure: bump the version, `npm run check`, merge, `claude plugin tag plugins/aether`, `install`, and the manual rollback. The status line becomes version 0.6. Sirve a: C2, C3, C4

**R17. `docs/decisions.md`** adds A26 and notes that A8 is updated by it. Sirve a: C1, C5

**R18. The version** becomes 0.6.0. Sirve a: C2

**R19. Tests.**
- `tests/aether-install.test.js`, on a throwaway repository with tags and a data directory whose path holds a space: the highest tag by version order, extracted from the tag and not the working tree, with only the plugin, the launcher and `dev-tree`; `dev-tree` names the main checkout when run from a linked worktree; `previous` and `current` after a second install; `rollback` both ways; already current; a reused version directory; a moved tag; each refusal leaving `installed/` as it was, the failed extraction included; `status`; usage exit 2.
- `tests/launcher.test.js` keeps the line test and adds: the README's bash line, version 0.6.0, the documents, and behavior tests that run the launcher in fish with a fake `claude` (skipped when fish is missing): the release, `--dev`, `--dev` only first, a dev tree that is gone, and the launcher run from the repository.
- `tests/refresh-lanes.test.js`: the key from `<data>/.env`, the new message, `keyFile`, and no lookup in the repository.

Sirve a: C1, C2, C3, C4, C5

## 11. Proposals (not built)

- Remove the machine paths from the 18 tracked files and move `docs/evaluations`: with the decision to make the repository public.
- Distribution through Claude Code's marketplace, for users of a public repository.
- Moving `.aether/` out of each project's tree.
- A notice at session start when a newer tag exists; deleting old installed versions; `--dev <path>` for a worktree; `--dev` in bash.
- **A design dossier,** so a successor Designer inherits the previous Designers' context (the owner's confirmed future idea: «seria buena una impelemtnacion futura en la cual el desaginer nativo o en general los designers puedan heredar los cotnextos de los otros», «si entendiste bien pero a futuro hacemos eso»).

## 12. Assumptions and facts

**Assumptions** the Lead approved:
1. "The run data" means `runs.jsonl`, `usage/` and `lanes/`; `.aether/` stays (§2).
2. Installed copies live under the data directory and follow `AETHER_DATA_DIR`.
3. This delivery is version 0.6.0.
4. The key keeps the name `.env`, now in the data directory.
5. Claude Code does not ask to confirm a new `--plugin-dir`; this cannot be checked without a paid call, and if it asks, it is one "yes" per version.
6. The installer lives only in the project, and the agent runs it.

**Facts checked on 2026-10-09:**
- Claude Code 2.1.296; fish 4.2.1.
- `claude plugin tag --dry-run plugins/aether` names its tag `aether--v<version>` (it refused only because `aether--v0.5.0` exists).
- Every tagged launcher since 0.1.0 computes the plugin as `$repo/plugins/aether` from its own resolved path.
- `.env` is excluded by `.git/info/exclude` only, not by `.gitignore`.
- In fish, `fish --no-config -c '<script>' a b` passes `a b` as `$argv`, and `--no-config` leaves the user's function directory out.
- The proposed launcher was run in fish with a fake `claude`: the release, `--dev`, `--dev` not first, a dev tree that is gone, the launcher run from a repository, and a data directory whose path holds a space all behaved as R10–R11 say.
