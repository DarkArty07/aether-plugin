#!/usr/bin/env python3
"""Trial 3: blind judgments by Opus. q2 marks each brief item per set; q3 scores the two sets, in both orders.

usage: judge.py <results dir> <brief.md>

It reads <results>/X/*.md and <results>/Y/*.md and writes judge-q2.json and judge-q3.json. The judge sees
the brief and the documents only, never which configuration wrote them.
"""

import glob
import json
import os
import re
import subprocess
import sys
import tempfile

SYSTEM = ('You are a strict and fair senior reviewer of software designs. You judge only the documents you are '
          'given, against the brief. You answer with one JSON object and nothing else.')


def ask(prompt):
    env = {k: v for k, v in os.environ.items() if not k.startswith('CLAUDE') or k == 'CLAUDE_CONFIG_DIR'}
    env.update({'ENABLE_CLAUDEAI_MCP_SERVERS': 'false', 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL': '1'})
    with tempfile.TemporaryDirectory(prefix='aether-judge-') as cwd:
        out = subprocess.run(['claude', '-p', '--model', 'opus', '--effort', 'xhigh', '--output-format', 'json',
                              '--setting-sources', 'project', '--tools', '', '--strict-mcp-config', '--system-prompt', SYSTEM],
                             input=prompt, cwd=cwd, env=env, capture_output=True, text=True, timeout=1800)
    data = json.loads(out.stdout)
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', data.get('result', '').strip())
    return json.loads(text), data.get('total_cost_usd', 0.0)


def documents(results, label):
    parts = []
    for path in sorted(glob.glob(os.path.join(results, label, '*.md'))):
        parts.append(f'===== {os.path.basename(path)} =====\n{open(path).read()}')
    return '\n\n'.join(parts) or '(no spec or plan was produced)'


def main(results, brief_path):
    brief = open(brief_path).read()
    docs = {label: documents(results, label) for label in ('X', 'Y')}
    cost = 0.0
    q2_prompt = (f'The brief:\n{brief}\n\nTwo sets of design documents follow, X and Y. For each set and each numbered '
                 'item of the brief, mark it "captured", "missed" or "contradicted", with a short quote from that set as '
                 'evidence (empty for missed). Return {"X": [{"item": 1, "mark": "...", "quote": "..."}, ...], "Y": [...]}.\n\n'
                 f'##### SET X #####\n{docs["X"]}\n\n##### SET Y #####\n{docs["Y"]}')
    q2, c = ask(q2_prompt)
    cost += c
    q3 = {}
    for first, second in (('X', 'Y'), ('Y', 'X')):
        prompt = (f'The brief:\n{brief}\n\nTwo sets of design documents follow, FIRST and SECOND. Score each from 1 to 5 on '
                  'correctness, completeness against the intent, design quality, and how executable the plan is '
                  '(contracts, tests, waves). Then state a preference. Return {"FIRST": {"correctness": n, "completeness": n, '
                  '"design": n, "executable": n}, "SECOND": {...}, "preference": "FIRST" | "SECOND" | "tie", "reason": "..."}.\n\n'
                  f'##### FIRST #####\n{docs[first]}\n\n##### SECOND #####\n{docs[second]}')
        verdict, c = ask(prompt)
        cost += c
        pref = verdict.get('preference')
        q3[f'{first}-then-{second}'] = {
            first: verdict.get('FIRST'), second: verdict.get('SECOND'),
            'preference': first if pref == 'FIRST' else second if pref == 'SECOND' else 'tie',
            'reason': verdict.get('reason'),
        }
    json.dump(q2, open(os.path.join(results, 'judge-q2.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(q3, open(os.path.join(results, 'judge-q3.json'), 'w'), ensure_ascii=False, indent=1)
    marks = {label: {m: sum(1 for i in q2.get(label, []) if i.get('mark') == m) for m in ('captured', 'missed', 'contradicted')} for label in ('X', 'Y')}
    print(json.dumps({'q2': marks, 'q3': {k: v['preference'] for k, v in q3.items()}, 'judge_usd': round(cost, 4)}))


if __name__ == '__main__':
    main(*sys.argv[1:])
