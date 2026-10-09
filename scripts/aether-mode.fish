# Aether mode: Claude Code with the aether plugin and dynamic workflows.
# Install the latest release, then link this function from the installed copy:
#   node scripts/aether-install.js install
#   ln -sfn ~/.local/share/aether-plugin/installed/current/scripts/aether-mode.fish ~/.config/fish/functions/aether-mode.fish
# aether-mode --dev loads the repository's development tree instead of the installed release.
function aether-mode --description 'Claude Code in Aether mode'
    set -l repo (path dirname (path dirname (realpath (functions --details aether-mode))))
    if test "$argv[1]" = --dev
        set -e argv[1]
        if test -L $repo/dev-tree
            set -l tree (realpath $repo/dev-tree 2>/dev/null)
            if not test -d "$tree/plugins/aether"
                echo "aether-mode: the development tree that $repo/dev-tree points to is gone" >&2
                return 1
            end
            set repo $tree
        end
    end
    env CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1 claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' --model sonnet --effort xhigh $argv
end
