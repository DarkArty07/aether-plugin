import { expect, mock, test } from 'claude-code/testing'
import { withoutSpawnRule } from './agent-text.mjs'

// Issue 145: on a Pro account Claude Code's Agent description says «Do not spawn agents unless the user asks», against the
// Lead's rules. The mod takes that paragraph out in an Aether session and leaves a plain session's text as it is.
// Run them with `claude plugin test plugins/aether`.

const RULE =
  '**Do not spawn agents unless the user asks.** Each spawn starts cold and re-derives context you already have — it\'s the expensive path on this plan. ' +
  'A task with "multiple angles," "thorough," or several parts is not a request to spawn; handle it inline with your own tools. ' +
  'Only use this tool when the user explicitly says to use a subagent, or names one of the available agent types.'
const COVER = ' This does not cover the `Explore` agent type where it is listed and you have no WebFetch tool of your own.'
const HEAD = 'Launch a new agent to handle complex, multi-step tasks. Each agent type has specific capabilities and tools available to it.'
const TAIL = 'Available agent types for the Agent tool:\n- general-purpose: General-purpose agent'
const WITH_RULE = `${HEAD}\n${RULE}\n\n${TAIL}`
const WITHOUT_RULE = `${HEAD}\n\n${TAIL}`

// Answers what the hook asks Claude Code for: the session's id, its marker, and the engine's own description.
function stubs(on, { marked = true } = {}) {
  const invalidated: string[] = []
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  on('session.id', () => ({ value: 's1' }))
  on('fs.exists', ($, e) => ({ value: marked && e.path.endsWith('/sessions/s1.json') }))
  on('tool.describe', ($, e) => ({ description: e.description }))
  on('ui.invalidate', ($, e) => {
    invalidated.push(e.event)
    return { value: undefined }
  })
  on('classic.SessionStart', () => ({}))
  return invalidated
}

test('withoutSpawnRule takes the paragraph out, with or without the sentence that follows it', () => {
  expect(withoutSpawnRule(WITH_RULE)).toBe(WITHOUT_RULE)
  expect(withoutSpawnRule(`${HEAD}\n${RULE}${COVER}\n\n${TAIL}`)).toBe(WITHOUT_RULE)
  expect(withoutSpawnRule(`${HEAD}\n${RULE}`)).toBe(HEAD)
})

test('withoutSpawnRule leaves a description without the paragraph, and a value that is not text, as they are', () => {
  expect(withoutSpawnRule(WITHOUT_RULE)).toBe(WITHOUT_RULE)
  expect(withoutSpawnRule(undefined)).toBe(undefined)
})

test('in an Aether session the Agent description loses the paragraph', async ($, on) => {
  stubs(on)
  const out = await $.tool.describe({ tool: 'Agent', description: WITH_RULE })
  expect(out.description).toBe(WITHOUT_RULE)
})

test('in a plain session the Agent description is the engine\'s', async ($, on) => {
  stubs(on, { marked: false })
  const out = await $.tool.describe({ tool: 'Agent', description: WITH_RULE })
  expect(out.description).toBe(WITH_RULE)
})

test('another tool\'s description is not touched', async ($, on) => {
  stubs(on)
  const out = await $.tool.describe({ tool: 'Bash', description: WITH_RULE })
  expect(out.description).toBe(WITH_RULE)
})

test('a description kept before the Lead\'s SessionStart is asked for again when it arrives', async ($, on) => {
  const invalidated = stubs(on, { marked: false })
  const first = await $.tool.describe({ tool: 'Agent', description: WITH_RULE })
  expect(first.description).toBe(WITH_RULE)
  expect(invalidated).toEqual([])
  await $.classic.SessionStart({ hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' })
  expect(invalidated).toEqual(['tool.describe'])
  const again = await $.tool.describe({ tool: 'Agent', description: WITH_RULE })
  expect(again.description).toBe(WITHOUT_RULE)
})
