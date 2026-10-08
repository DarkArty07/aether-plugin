#!/usr/bin/env python3
"""Drive one multi-turn headless Claude Code session over stream-json, with a simulated owner.

usage: drive.py <config.json>

The config holds:
- name: the results' file prefix;
- cwd: the session's working directory, the fixture's worktree;
- plugin_dir: the aether plugin to load, or null;
- model, effort: the main session's;
- max_budget_usd, max_turns, turn_timeout_s;
- data_dir: AETHER_DATA_DIR for the session;
- brief: the simulated owner's brief (a path);
- opening: the owner's first message (a path), or null to let the simulated owner write it;
- probe: one scripted message sent after DONE, or null;
- results: the directory for the events, the conversation and the summary.

The session is one long-lived process: each owner message is one stream-json line on stdin, and
each turn ends with a `result` event on stdout. When a background agent, such as the Designer, finishes,
the session starts a turn on its own: the driver waits for that turn's result instead of asking the
simulated owner, as an owner would wait in an interactive session.
"""

import json
import os
import queue
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import owner  # noqa: E402


def session_env(data_dir):
    # Drop the parent session's variables, such as CLAUDE_CODE_SESSION_ID, so the child sets its own.
    env = {k: v for k, v in os.environ.items() if (not k.startswith('CLAUDE') or k == 'CLAUDE_CONFIG_DIR') and k != 'AI_AGENT'}
    env.update({
        'CLAUDE_CODE_DISABLE_ADVISOR_TOOL': '1',
        'ENABLE_CLAUDEAI_MCP_SERVERS': 'false',
        'CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS': '0',
        'AETHER_DATA_DIR': data_dir,
    })
    return env


def main(config_path):
    cfg = json.load(open(config_path))
    os.makedirs(cfg['results'], exist_ok=True)
    prefix = os.path.join(cfg['results'], cfg['name'])
    cmd = ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
           '--model', cfg['model'], '--effort', cfg['effort'], '--permission-mode', 'bypassPermissions',
           '--strict-mcp-config', '--max-budget-usd', str(cfg['max_budget_usd'])]
    if cfg.get('plugin_dir'):
        cmd += ['--plugin-dir', cfg['plugin_dir'], '--settings', '{"enableWorkflows": true}']
    brief = open(cfg['brief']).read()
    events = open(prefix + '-events.jsonl', 'w')
    lines = queue.Queue()
    started = time.time()
    proc = subprocess.Popen(cmd, cwd=cfg['cwd'], env=session_env(cfg['data_dir']), stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=open(prefix + '-stderr.txt', 'w'), text=True, bufsize=1)
    threading.Thread(target=lambda: [lines.put(l) for l in proc.stdout] + [lines.put(None)], daemon=True).start()

    def send(text):
        proc.stdin.write(json.dumps({'type': 'user', 'message': {'role': 'user', 'content': text}}) + '\n')
        proc.stdin.flush()

    state = {'background': [], 'started': False}

    def read(timeout):
        # One event, or None on timeout; 'eof' when the session ended.
        try:
            line = lines.get(timeout=max(0.5, timeout))
        except queue.Empty:
            return None
        if line is None:
            return 'eof'
        events.write(line)
        events.flush()
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            return {}
        if event.get('type') == 'system' and event.get('subtype') == 'background_tasks_changed':
            state['background'] = event.get('tasks') or []
        if (event.get('type') == 'system' and event.get('subtype') == 'init') or event.get('type') == 'assistant':
            state['started'] = True
        return event

    def result(timeout):
        deadline = time.time() + timeout
        while time.time() < deadline:
            event = read(deadline - time.time())
            if event == 'eof':
                return None
            if event and event.get('type') == 'result':
                state['started'] = False
                return event
        return None

    def follow_up(grace, timeout):
        # A turn the session starts on its own: while background agents run, or when a turn begins
        # within `grace` seconds. None when the session stays idle.
        quiet_until = time.time() + grace
        while state['background'] or state['started'] or time.time() < quiet_until:
            wait = timeout if (state['background'] or state['started']) else quiet_until - time.time()
            event = read(wait)
            if event == 'eof':
                return None
            if event is None and not (state['background'] or state['started']):
                return None
            if event and event.get('type') == 'result':
                state['started'] = False
                return event
        return None

    history, results, owner_cost, stop = [], [], 0.0, 'turn cap'
    if cfg.get('opening'):
        message = open(cfg['opening']).read().strip()
    else:
        message, cost = owner.next_message(brief, history, first=True)
        owner_cost += cost
    for _ in range(cfg['max_turns']):
        send(message)
        history.append({'role': 'owner', 'text': message})
        res = result(cfg['turn_timeout_s'])
        if res is None:
            stop = 'no result: timeout or the session ended'
            break
        results.append(res)
        history.append({'role': 'agent', 'text': res.get('result') or ''})
        while not (res.get('is_error') or res.get('subtype') not in (None, 'success')):
            more = follow_up(8, cfg['turn_timeout_s'])
            if more is None:
                break
            res = more
            results.append(res)
            history.append({'role': 'agent', 'text': res.get('result') or ''})
        if res.get('is_error') or res.get('subtype') not in (None, 'success'):
            stop = f"error result: {res.get('subtype')}"
            break
        message, cost = owner.next_message(brief, history)
        owner_cost += cost
        if message.strip() == 'DONE':
            history.append({'role': 'owner', 'text': 'DONE'})
            stop = 'DONE'
            break
    if stop == 'DONE' and cfg.get('probe'):
        send(cfg['probe'])
        history.append({'role': 'owner', 'text': cfg['probe']})
        res = result(cfg['turn_timeout_s'])
        while res:
            results.append(res)
            history.append({'role': 'agent', 'text': res.get('result') or ''})
            res = follow_up(8, cfg['turn_timeout_s'])
    proc.stdin.close()
    try:
        proc.wait(timeout=300)
    except subprocess.TimeoutExpired:
        proc.kill()
    events.close()
    json.dump(history, open(prefix + '-conversation.json', 'w'), ensure_ascii=False, indent=1)
    costs = [r.get('total_cost_usd') or 0 for r in results]
    summary = {
        'name': cfg['name'],
        'session_id': results[0].get('session_id') if results else None,
        'stop': stop,
        'turns': len(results),
        'owner_messages': sum(1 for h in history if h['role'] == 'owner'),
        # total_cost_usd accumulates over the process, so the session's cost is the last value.
        'cost_usd': costs[-1] if costs else 0,
        'costs': costs,
        'model_ms': sum(r.get('duration_ms') or 0 for r in results),
        'wall_s': round(time.time() - started, 1),
        'model_usage_last': results[-1].get('modelUsage') if results else None,
        'owner_simulator_usd': round(owner_cost, 4),
        'exit_code': proc.returncode,
    }
    json.dump(summary, open(prefix + '-summary.json', 'w'), indent=1)
    print(json.dumps({k: summary[k] for k in ('session_id', 'stop', 'turns', 'cost_usd', 'model_ms', 'wall_s')}))


if __name__ == '__main__':
    main(sys.argv[1])
