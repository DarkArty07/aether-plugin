#!/usr/bin/env python3
"""The simulated owner: one isolated `claude -p` call per turn.

It sees the brief and only what the owner sees: the session's replies and its own earlier messages.
The call loads no settings, plugins, tools or MCP servers, so it can only answer in text.
"""

import json
import os
import subprocess
import tempfile

SYSTEM = (
    "You play the owner of a software project, talking with an AI coding agent in Claude Code. "
    "You see only what the owner sees. Follow your brief and the rules you are given. "
    "Reply with the owner's next message only: no preamble, no quotes, no explanation."
)

RULES = """Rules:
- Reply in Spanish, briefly, the way the owner writes.
- When the agent asks questions, answer them from the brief. When the brief does not say, choose the simplest option.
- When the agent writes back its understanding, confirm it if it matches the brief's intent, and correct it if it does not.
- When the agent shows approaches, a design, a spec or a plan: approve it if it serves the brief, otherwise ask for changes. Ask for changes at most twice per stage.
- When the brief's stop condition is met, reply exactly DONE and nothing else."""


def ask(prompt, timeout=600):
    env = {k: v for k, v in os.environ.items() if not k.startswith('CLAUDE') or k == 'CLAUDE_CONFIG_DIR'}
    env.update({'ENABLE_CLAUDEAI_MCP_SERVERS': 'false', 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL': '1'})
    with tempfile.TemporaryDirectory(prefix='aether-owner-') as cwd:
        out = subprocess.run(
            ['claude', '-p', '--model', 'sonnet', '--effort', 'high', '--output-format', 'json',
             '--setting-sources', 'project', '--tools', '', '--strict-mcp-config', '--system-prompt', SYSTEM, prompt],
            cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    data = json.loads(out.stdout)
    return data.get('result', '').strip(), data.get('total_cost_usd', 0.0)


def next_message(brief, history, first=False):
    """history: list of {"role": "owner" | "agent", "text": str}. Returns (message, cost)."""
    lines = ['Your brief:', brief.strip(), '', RULES, '']
    if first:
        lines.append("Write your first message to the agent: what you want, as the brief's request says.")
    else:
        lines.append('The conversation so far:')
        for turn in history:
            who = 'You (the owner)' if turn['role'] == 'owner' else 'The agent'
            lines += ['', f'--- {who} ---', turn['text']]
        lines += ['', 'Write your next message to the agent.']
    return ask('\n'.join(lines))
