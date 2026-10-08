#!/usr/bin/env python3
"""Trial 3: copy each configuration's spec and plan into <results>/X and <results>/Y, in an order a seed decides.

usage: blind.py <results dir> <seed>

The mapping goes to <results>/mapping.json. Do not open it before the owner has stated a preference (q4).
"""

import json
import os
import random
import shutil
import subprocess
import sys


def changed_docs(worktree):
    """The spec and plan files that differ from main, committed or not."""
    git = lambda *args: subprocess.run(['git', '-C', worktree, *args], capture_output=True, text=True, check=True).stdout.split()
    files = git('diff', '--name-only', 'main', '--', 'docs/superpowers/specs', 'docs/superpowers/plans')
    files += git('ls-files', '--others', '--exclude-standard', '--', 'docs/superpowers/specs', 'docs/superpowers/plans')
    return sorted(set(files))


def main(out, seed):
    order = ['baseline', 'new']
    random.Random(int(seed)).shuffle(order)
    mapping = {'seed': int(seed), 'X': order[0], 'Y': order[1], 'files': {}}
    for label, config in (('X', order[0]), ('Y', order[1])):
        worktree = os.path.expanduser(f'~/.cache/aether-trial3/{config}/repo/.worktrees/trial')
        dest = os.path.join(out, label)
        shutil.rmtree(dest, ignore_errors=True)
        os.makedirs(dest)
        files = changed_docs(worktree)
        # Neutral names, so that a file name never tells which configuration wrote it.
        counts = {'spec': 0, 'plan': 0}
        for f in files:
            kind = 'spec' if '/specs/' in f else 'plan'
            counts[kind] += 1
            name = kind if counts[kind] == 1 else f'{kind}-{counts[kind]}'
            shutil.copy(os.path.join(worktree, f), os.path.join(dest, f'{name}.md'))
        mapping['files'][label] = files
    json.dump(mapping, open(os.path.join(out, 'mapping.json'), 'w'), indent=1)
    print({label: len(files) for label, files in mapping['files'].items()})


if __name__ == '__main__':
    main(*sys.argv[1:])
