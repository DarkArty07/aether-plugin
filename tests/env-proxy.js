'use strict'

// The sandbox of another coding harness sets Node's env-proxy switch (issue #254): NODE_USE_ENV_PROXY=1
// (and possibly --use-env-proxy inside NODE_OPTIONS) together with proxy variables. Every node process then
// prints `(node:NNN) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, ...` on stderr, even
// `node -e 1`, so tests that require an empty stderr from a child process fail. The switch is scrubbed here,
// in the test process itself, so no child a test starts can inherit it: children spawned without an explicit
// env (the plugin libs' defaultExec and runTests) inherit process.env, and the helpers' run() builds on
// process.env too. Required first by tests/helpers.js, which every helper-based test file loads, and directly
// by the test files that start node child processes without the helper.

delete process.env.NODE_USE_ENV_PROXY

// NODE_OPTIONS is picked up by every node process; a --use-env-proxy entry there switches the proxy agent on
// for each child even when the variable above is gone. Only that token goes: the rest of NODE_OPTIONS stays
// byte-for-byte, so a runner's own flags (for example --test-reporter) keep working.
if (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('--use-env-proxy')) {
  const kept = process.env.NODE_OPTIONS.replace(/(?:^|\s+)--use-env-proxy(?:=\S*)?(?=\s+|$)/g, '').trim()
  if (kept === '') delete process.env.NODE_OPTIONS
  else process.env.NODE_OPTIONS = kept
}

// The loopback interface must never go through a proxy (issue #254): tests start servers on 127.0.0.1 and
// fetch them from the test process itself, and Undici binds the env-proxy agent at startup, so scrubbing the
// switch above cannot reroute that in-process fetch. The no-proxy list, unlike the agent choice, is read per
// request, so ensuring the loopback names are on it keeps those fetches direct. Only loopback names are added:
// anything else keeps the sandbox's proxy, and a list that already covers loopback is left alone.
for (const name of ['NO_PROXY', 'no_proxy']) {
  const current = process.env[name]
  if (current === undefined || current === '') process.env[name] = 'localhost,127.0.0.1,::1'
  else if (!/(^|,)localhost(,|$)/.test(current)) process.env[name] = `${current},localhost,127.0.0.1,::1`
}
