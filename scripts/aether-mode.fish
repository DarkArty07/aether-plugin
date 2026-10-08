# Aether mode: Claude Code with the aether plugin and dynamic workflows.
# Install: ln -s (realpath scripts/aether-mode.fish) ~/.config/fish/functions/aether-mode.fish
function aether-mode --description 'Claude Code in Aether mode'
    set -l repo (path dirname (path dirname (realpath (functions --details aether-mode))))
    claude --plugin-dir $repo/plugins/aether --settings '{"enableWorkflows": true}' $argv
end
