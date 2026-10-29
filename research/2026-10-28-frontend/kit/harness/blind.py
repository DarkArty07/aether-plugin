#!/usr/bin/env python3
"""Copies the two finished builds to blind labels A and B, in random order, and writes the key apart.
The browser harness and the grading use the labels; the key is opened only after grading.

usage: blind.py <work dir>    (writes <work dir>/builds/A, <work dir>/builds/B and <work dir>/blind-key.json)
"""
import json, os, random, shutil, subprocess, sys
W = os.path.abspath(sys.argv[1])
modes = ['aether', 'normal']
random.SystemRandom().shuffle(modes)
key = {'A': modes[0], 'B': modes[1]}
for label, mode in key.items():
    src = os.path.expanduser(f'~/.cache/aether-trial2/{mode}/repo/.worktrees/trial')
    dst = f'{W}/builds/{label}'
    shutil.rmtree(dst, ignore_errors=True)
    os.makedirs(dst)
    for item in ('src', 'test', 'scripts', 'index.html', 'styles.css', 'package.json', 'package-lock.json'):
        p = os.path.join(src, item)
        if os.path.isdir(p):
            shutil.copytree(p, os.path.join(dst, item))
        elif os.path.exists(p):
            shutil.copy2(p, os.path.join(dst, item))
    subprocess.run(['npm', 'ci', '--silent', '--no-audit', '--no-fund'], cwd=dst, check=True)
json.dump(key, open(f'{W}/blind-key.json', 'w'))
print('builds ready: A, B (key written, not shown)')
