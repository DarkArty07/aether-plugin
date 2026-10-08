#!/usr/bin/env python3
"""Prices every model request of a session from its transcripts, at the plugin's OpenRouter rates, with
each request's real cache-write lifetime (5 minutes or 1 hour). Claude Code's own output gives only the
total cache writes, so aether-report has to assume the lifetimes; the transcripts record them.

usage: price-transcripts.py <transcripts dir> [boundary ...]
  <transcripts dir>: ~/.claude/projects/<project>, holding <session>.jsonl and <session>/subagents/
  boundary: ISO times; the cost is also split into the phases between them.
"""
import collections, glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PRICES = json.load(open(os.path.join(HERE, '..', '..', '..', '..', 'plugins', 'aether', 'config', 'prices.json')))


def rates(model, prompt):
    for m in PRICES['models'].values():
        if model in m['ids']:
            long = m.get('longPrompt')
            return long if long and prompt >= long['minPromptTokens'] else m
    raise SystemExit(f'no price for {model}')


def requests(root):
    files = glob.glob(f'{root}/*.jsonl') + glob.glob(f'{root}/*/subagents/**/*.jsonl', recursive=True)
    seen = {}
    for path in files:
        for line in open(path):
            row = json.loads(line)
            message = row.get('message') or {}
            if row.get('type') == 'assistant' and message.get('usage'):
                seen[message.get('id') or row.get('requestId')] = (row['timestamp'], message['model'], message['usage'])
    return seen.values()


def price(model, u):
    writes = u.get('cache_creation') or {}
    prompt = u['input_tokens'] + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0)
    r = rates(model, prompt)
    return (u['input_tokens'] * r['input'] + u['output_tokens'] * r['output'] + u.get('cache_read_input_tokens', 0) * r['cacheRead']
            + writes.get('ephemeral_5m_input_tokens', 0) * r['cacheWrite5m'] + writes.get('ephemeral_1h_input_tokens', 0) * r['cacheWrite1h']) / 1e6


root, boundaries = sys.argv[1], sys.argv[2:]
by_model = collections.defaultdict(lambda: {'requests': 0, 'usd': 0.0, 'cacheWrite5m': 0, 'cacheWrite1h': 0, 'promptsOver200k': 0})
phases = collections.Counter()
for t, model, u in requests(root):
    usd = price(model, u)
    m = by_model[model]
    m['requests'] += 1
    m['usd'] += usd
    m['cacheWrite5m'] += (u.get('cache_creation') or {}).get('ephemeral_5m_input_tokens', 0)
    m['cacheWrite1h'] += (u.get('cache_creation') or {}).get('ephemeral_1h_input_tokens', 0)
    if u['input_tokens'] + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0) > 200000:
        m['promptsOver200k'] += 1
    phases[sum(1 for b in boundaries if t >= b)] += usd
result = {
    'pricing': f"{PRICES['basis']}, snapshot {PRICES['snapshot']}",
    'totalUsd': round(sum(m['usd'] for m in by_model.values()), 4),
    'byModel': {k: {**v, 'usd': round(v['usd'], 4)} for k, v in by_model.items()},
}
if boundaries:
    result['phases'] = [{'from': ([None] + boundaries)[i], 'to': (boundaries + [None])[i], 'usd': round(phases[i], 4)} for i in range(len(boundaries) + 1)]
print(json.dumps(result, indent=1))
