#!/usr/bin/env python3
"""Trial 3: one configuration's measures, from its summary and its transcripts.

usage: measure.py <results dir> <baseline|new>

It prints JSON: cost by model, model time and wall time, owner turns, the main session's requests per
owner message, the (model, effort) pairs of the main session and of the Designer, and q1 (aether-plan check).
"""

import glob
import json
import os
import subprocess
import sys

CONFIG_DIR = os.environ.get('CLAUDE_CONFIG_DIR') or os.path.expanduser('~/.claude')


def records(path):
    out = []
    for line in open(path):
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


def is_owner(r):
    """The aether-voice rule: a human-origin message, or, with no origin field (SDK sessions), a plain user message."""
    if r.get('type') != 'user' or r.get('isSidechain') or r.get('isMeta') or r.get('isCompactSummary') or 'toolUseResult' in r:
        return False
    if 'origin' in r:
        return (r.get('origin') or {}).get('kind') == 'human'
    content = (r.get('message') or {}).get('content')
    text = content if isinstance(content, str) else ' '.join(b.get('text') or '' for b in content or [] if isinstance(b, dict) and b.get('type') == 'text')
    return bool(text.strip()) and not text.startswith('<')

def main(results, config):
    summary = json.load(open(os.path.join(results, f'{config}-summary.json')))
    sid = summary['session_id']
    main_path = glob.glob(os.path.join(CONFIG_DIR, 'projects', '*', f'{sid}.jsonl'))[0]
    lead = records(main_path)
    requests = {(r.get('message') or {}).get('id') for r in lead if r.get('type') == 'assistant' and not r.get('isSidechain')}
    owners = [r for r in lead if is_owner(r)]
    main_pairs = sorted({((r.get('message') or {}).get('model'), r.get('effort')) for r in lead if r.get('type') == 'assistant'})
    designer_pairs = set()
    for meta in glob.glob(os.path.join(os.path.dirname(main_path), sid, 'subagents', '**', '*.meta.json'), recursive=True):
        if json.load(open(meta)).get('agentType') == 'aether:designer':
            for r in records(meta.replace('.meta.json', '.jsonl')):
                if r.get('type') == 'assistant':
                    designer_pairs.add(((r.get('message') or {}).get('model'), r.get('effort')))
    worktree = os.path.expanduser(f'~/.cache/aether-trial3/{config}/repo/.worktrees/trial')
    # Only the plans this session wrote: those that differ from the base commit, committed or not.
    changed = subprocess.run(['git', '-C', worktree, 'diff', '--name-only', 'main', '--', 'docs/superpowers/plans'], capture_output=True, text=True).stdout.split()
    changed += subprocess.run(['git', '-C', worktree, 'ls-files', '--others', '--exclude-standard', '--', 'docs/superpowers/plans'], capture_output=True, text=True).stdout.split()
    plans = sorted(os.path.join(worktree, f) for f in set(changed))
    q1 = []
    for plan in plans:
        out = subprocess.run([os.path.join(worktree, 'plugins', 'aether', 'bin', 'aether-plan'), 'check', plan], capture_output=True, text=True)
        q1.append({'plan': os.path.basename(plan), 'ok': out.returncode == 0, 'output': out.stdout.strip()[:400]})
    usage = summary.get('model_usage_last') or {}
    print(json.dumps({
        'config': config,
        'session_id': sid,
        'stop': summary['stop'],
        'cost_usd': round(summary['cost_usd'], 4),
        'cost_by_model_last_turn': {m: round(u.get('costUSD', 0), 4) for m, u in usage.items()},
        'model_s': round(summary['model_ms'] / 1000, 1),
        'wall_s': summary['wall_s'],
        'owner_turns': len(owners),
        'main_requests': len(requests),
        'main_requests_per_owner_message': round(len(requests) / max(len(owners), 1), 1),
        'main_pairs': main_pairs,
        'designer_pairs': sorted(designer_pairs),
        'q1': q1,
        'owner_simulator_usd': summary.get('owner_simulator_usd'),
    }, indent=1))


if __name__ == '__main__':
    main(*sys.argv[1:])
