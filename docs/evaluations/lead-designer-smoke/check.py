#!/usr/bin/env python3
"""Check the Lead and Designer platform facts (spec §11, S7-S13) in a session's transcripts.

usage: check.py <session id> [<summary.json>] [<out.json>]

It reads ~/.claude/projects/*/<session>.jsonl and the session's subagents/ transcripts, and prints
one verdict per check with its evidence.
"""

import glob
import json
import os
import sys

CONFIG = os.environ.get('CLAUDE_CONFIG_DIR') or os.path.expanduser('~/.claude')


def records(path):
    out = []
    for line in open(path):
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


def blocks(rec, kind):
    content = (rec.get('message') or {}).get('content')
    return [b for b in content if isinstance(b, dict) and b.get('type') == kind] if isinstance(content, list) else []


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return '\n'.join(text_of(b.get('content')) if b.get('type') == 'tool_result' else (b.get('text') or '')
                         for b in content if isinstance(b, dict))
    return ''


def is_owner(r):
    """The aether-voice rule: a human-origin message, or, with no origin field (SDK sessions), a plain user message."""
    if r.get('type') != 'user' or r.get('isSidechain') or r.get('isMeta') or r.get('isCompactSummary') or 'toolUseResult' in r:
        return False
    if 'origin' in r:
        return (r.get('origin') or {}).get('kind') == 'human'
    content = (r.get('message') or {}).get('content')
    text = content if isinstance(content, str) else ' '.join(b.get('text') or '' for b in content or [] if isinstance(b, dict) and b.get('type') == 'text')
    return bool(text.strip()) and not text.startswith('<')

def owner_messages(recs):
    return [(i, r) for i, r in enumerate(recs) if is_owner(r)]


def main(session_id, summary_path=None, out_path=None):
    mains = glob.glob(os.path.join(CONFIG, 'projects', '*', f'{session_id}.jsonl'))
    if not mains:
        sys.exit(f'no transcript for session {session_id}')
    main_path = mains[0]
    lead = records(main_path)
    subdir = os.path.join(os.path.dirname(main_path), session_id, 'subagents')
    agents = {}
    for meta in glob.glob(os.path.join(subdir, '**', 'agent-*.meta.json'), recursive=True):
        jl = meta.replace('.meta.json', '.jsonl')
        agent_id = os.path.basename(jl)[len('agent-'):-len('.jsonl')]
        agents[agent_id] = {'meta': json.load(open(meta)), 'records': records(jl) if os.path.exists(jl) else []}
    designers = {k: v for k, v in agents.items() if v['meta'].get('agentType') == 'aether:designer'}
    checks = {}

    if summary_path:
        s = json.load(open(summary_path))
        checks['S0'] = (s['turns'] >= 2, f"{s['turns']} turns in one process, stop: {s['stop']}")

    lead_turns = [r for r in lead if r.get('type') == 'assistant' and not r.get('isSidechain')]
    pairs = sorted({((r.get('message') or {}).get('model'), r.get('effort')) for r in lead_turns})
    checks['S7'] = (pairs == [('claude-sonnet-5-5', 'xhigh')], f'main session (model, effort): {pairs}')

    d_pairs, one_hour = set(), 0
    for d in designers.values():
        for r in d['records']:
            if r.get('type') == 'assistant':
                d_pairs.add(((r.get('message') or {}).get('model'), r.get('effort')))
                usage = (r.get('message') or {}).get('usage') or {}
                one_hour += ((usage.get('cache_creation') or {}).get('ephemeral_1h_input_tokens') or 0)
    checks['S8'] = (bool(designers) and d_pairs == {('claude-opus-5-5', 'max')} and one_hour > 0,
                    f'{len(designers)} designer(s), (model, effort): {sorted(d_pairs)}, 1-hour cache writes: {one_hour}')

    # S9a: the Designer's spec write went through.
    writes, failed = [], []
    for d in designers.values():
        results = {b.get('tool_use_id'): b for r in d['records'] if r.get('type') == 'user' for b in blocks(r, 'tool_result')}
        for r in d['records']:
            for b in blocks(r, 'tool_use'):
                path = (b.get('input') or {}).get('file_path') or ''
                if b.get('name') in ('Write', 'Edit') and '/docs/superpowers/specs/' in path:
                    writes.append(path)
                    if (results.get(b.get('id')) or {}).get('is_error'):
                        failed.append(path)
    checks['S9a'] = (bool(writes) and not failed, f'designer spec writes: {writes}, refused: {failed}')

    # S9b: the guard refused the Lead's own write.
    denials = [text_of(b.get('content'))[:160] for r in lead if r.get('type') == 'user' for b in blocks(r, 'tool_result')
               if 'only the Designer writes specs and plans' in text_of(b.get('content'))]
    checks['S9b'] = (bool(denials), f'denials seen by the Lead: {denials[:1]}')

    # S10: SendMessage to the Designer, and the Designer kept working after it.
    sends = [(r.get('timestamp'), (b.get('input') or {}).get('to')) for r in lead for b in blocks(r, 'tool_use') if b.get('name') == 'SendMessage']
    resumed = []
    for ts, to in sends:
        d = designers.get(to)
        if d and any((r.get('timestamp') or '') > (ts or '') for r in d['records'] if r.get('type') == 'assistant'):
            resumed.append(to)
    checks['S10'] = (bool(resumed), f'SendMessage calls: {len(sends)}, to a designer that went on: {len(resumed)}')

    # S11: aether-voice with the Lead's id, and the owner's first words in its result.
    first_owner = text_of((owner_messages(lead)[0][1].get('message') or {}).get('content')) if owner_messages(lead) else ''
    voice_ok, voice_seen = False, []
    for d in designers.values():
        results = {b.get('tool_use_id'): b for r in d['records'] if r.get('type') == 'user' for b in blocks(r, 'tool_result')}
        for r in d['records']:
            for b in blocks(r, 'tool_use'):
                cmd = (b.get('input') or {}).get('command') or ''
                if b.get('name') == 'Bash' and 'aether-voice' in cmd:
                    voice_seen.append(cmd[:120])
                    out = text_of((results.get(b.get('id')) or {}).get('content'))
                    if session_id in cmd and first_owner[:40] and first_owner[:40] in out:
                        voice_ok = True
    checks['S11'] = (voice_ok, f'aether-voice calls: {voice_seen[:2]}')

    # S12: no advisor call anywhere.
    advisor = sum(1 for recs in [lead] + [a['records'] for a in agents.values()] for r in recs
                  for b in blocks(r, 'server_tool_use') if 'advisor' in (b.get('name') or ''))
    checks['S12'] = (advisor == 0, f'advisor calls: {advisor}')

    # S13: the first hand-off answers an owner message that is not the opening request.
    owners = owner_messages(lead)
    handoff = next(((i, r) for i, r in enumerate(lead) for b in blocks(r, 'tool_use')
                    if b.get('name') in ('Agent', 'Task') and (b.get('input') or {}).get('subagent_type') == 'aether:designer'), None)
    if handoff:
        before = [o for o in owners if o[0] < handoff[0]]
        trigger = text_of((before[-1][1].get('message') or {}).get('content')) if before else ''
        checks['S13'] = (len(before) >= 2, f'hand-off after owner message {len(before)}: "{trigger[:200]}"')
    else:
        checks['S13'] = (False, 'no hand-off to aether:designer')

    for name, (ok, evidence) in checks.items():
        print(f"{'PASS' if ok else 'FAIL'} {name}: {evidence}")
    if out_path:
        json.dump({k: {'pass': v[0], 'evidence': v[1]} for k, v in checks.items()}, open(out_path, 'w'), ensure_ascii=False, indent=1)
    return checks


if __name__ == '__main__':
    main(*sys.argv[1:])
