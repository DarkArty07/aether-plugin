#!/usr/bin/env python3
"""Measures one finished trial run the same way for both modes, and prints JSON.

usage: evaluate.py <mode>    (mode: aether or normal)
"""
import json
import os
import re
import subprocess
import sys

MODE = sys.argv[1]
T = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.expanduser(f'~/.cache/aether-trial2/{MODE}')
REPO = f'{F}/repo'
WT = f'{REPO}/.worktrees/trial'
BIN = os.path.join(T, '..', '..', '..', 'plugins', 'aether', 'bin')


def sh(args, cwd=None, env=None):
    r = subprocess.run(args, cwd=cwd, env={**os.environ, **(env or {})}, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


def node_counts(output):
    counts = {}
    for key in ('tests', 'pass', 'fail'):
        m = re.search(rf'^# {key} (\d+)$', output, re.M)
        counts[key] = int(m.group(1)) if m else None
    return counts


timing = json.load(open(f'{F}/timing.json'))
out = json.load(open(f'{F}/out.json'))
_, price_out, _ = sh(['node', f'{BIN}/aether-report', 'price', f'{F}/out.json', '--main-model', 'claude-opus-5-5'])
price = json.loads(price_out)

code, tests_out, tests_err = sh(['npm', 'test', '--silent'], cwd=WT)
hidden_code, hidden_out, _ = sh(['node', '--test', f'{T}/fixture/acceptance-suite.js'], env={'TASKS_ROOT': WT})
failed_hidden = re.findall(r'^not ok \d+ - (.*)$', hidden_out, re.M)

_, log, _ = sh(['git', 'log', '--oneline', 'main..feature/trial'], cwd=REPO)
_, merges, _ = sh(['git', 'log', '--oneline', '--merges', 'main..feature/trial'], cwd=REPO)
_, stat, _ = sh(['git', 'diff', '--shortstat', 'main..feature/trial'], cwd=REPO)
_, status, _ = sh(['git', 'status', '--porcelain'], cwd=WT)
src_lines = 0
for dirpath, _, files in os.walk(os.path.join(WT, 'src')):
    for name in files:
        if name.endswith('.js'):
            src_lines += sum(1 for _ in open(os.path.join(dirpath, name)))
for name in ('index.html', 'styles.css'):
    if os.path.exists(os.path.join(WT, name)):
        src_lines += sum(1 for _ in open(os.path.join(WT, name)))
test_lines = 0
for dirpath, _, files in os.walk(os.path.join(WT, 'test')):
    for name in files:
        if name.endswith('.js'):
            test_lines += sum(1 for _ in open(os.path.join(dirpath, name)))

_, worktrees, _ = sh(['git', 'worktree', 'list', '--porcelain'], cwd=REPO)
_, branches, _ = sh(['git', 'branch', '--list', 'aether/*'], cwd=REPO)
aether_runs = os.listdir(f'{REPO}/.aether/runs') if os.path.isdir(f'{REPO}/.aether/runs') else []

record = None
runs_file = f'{F}/data/runs.jsonl'
if os.path.exists(runs_file):
    lines = [json.loads(line) for line in open(runs_file) if line.strip()]
    record = lines[-1] if lines else None

summary = {
    'mode': MODE,
    'exit': timing['exit'],
    'wallClockSeconds': round(timing['end'] - timing['start'], 1),
    'cost': {
        'claudeCodeListUsd': round(price['listUsd'], 4),
        'openRouterUsd': round(price['totalUsd'], 4),
        'byModel': {m: {'listUsd': round(v['listUsd'] or 0, 4), 'openRouterUsd': round(v['usd'] or 0, 4), 'tokens': v['tokens']} for m, v in price['byModel'].items()},
        'totalCostUsdReported': out.get('total_cost_usd'),
    },
    'turns': out.get('num_turns'),
    'stop': out.get('stop_reason') or out.get('subtype'),
    'npmTest': {'exitCode': code, **node_counts(tests_out + tests_err)},
    'hiddenSuite': {**node_counts(hidden_out), 'failed': failed_hidden},
    'git': {
        'commits': len(log.strip().splitlines()) if log.strip() else 0,
        'merges': len(merges.strip().splitlines()) if merges.strip() else 0,
        'shortstat': stat.strip(),
        'uncommitted': status.strip().splitlines(),
    },
    'lines': {'srcHtmlCss': src_lines, 'tests': test_lines},
    'leftovers': {
        'aetherWorktrees': [w for w in re.findall(r'^worktree (.*)$', worktrees, re.M) if '/.aether/' in w],
        'aetherBranches': branches.split(),
        'aetherRunDirs': aether_runs,
    },
    'finalizedRecord': None,
}
if record:
    rep = record.get('report', {})
    summary['finalizedRecord'] = {
        'status': record.get('status'),
        'versions': record.get('versions'),
        'speed': rep.get('speed'),
        'costRunUsd': rep.get('cost', {}).get('run', {}).get('usd') if rep.get('cost') else None,
        'costByRole': {k: round(v['usd'], 4) for k, v in (rep.get('cost') or {}).get('run', {}).get('byRole', {}).items()},
        'quality': rep.get('quality'),
    }
print(json.dumps(summary, indent=1))
