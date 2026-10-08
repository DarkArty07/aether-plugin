#!/usr/bin/env python3
"""Counts the subagents a trial session dispatched with the Agent tool, by description pattern and model.

usage: agents.py <mode>
"""
import collections
import glob
import json
import os
import sys

MODE = sys.argv[1]
dirs = glob.glob(os.path.expanduser(f'~/.claude/projects/*aether-trial-{MODE}-repo--worktrees-trial'))
counts = collections.Counter()
calls = []
for d in dirs:
    for path in glob.glob(f'{d}/*.jsonl'):
        for line in open(path):
            try:
                row = json.loads(line)
            except ValueError:
                continue
            content = (row.get('message') or {}).get('content')
            if not isinstance(content, list):
                continue
            for block in content:
                if block.get('type') == 'tool_use' and block.get('name') in ('Agent', 'Task'):
                    args = block.get('input') or {}
                    model = args.get('model') or '(inherit)'
                    kind = args.get('subagent_type') or 'general-purpose'
                    calls.append({'description': args.get('description'), 'model': model, 'type': kind})
                    counts[(kind, model)] += 1
print(json.dumps({'dispatches': len(calls), 'byTypeAndModel': {f'{k[0]} / {k[1]}': v for k, v in counts.items()}, 'calls': calls}, indent=1))
