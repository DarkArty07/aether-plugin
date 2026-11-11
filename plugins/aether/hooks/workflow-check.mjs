// The Workflow check of the mod (issue 187, part 2). A Lead session without the Workflow tool cannot start /aether:design or
// /aether:run, and the Lead went on by hand for hours before the owner noticed. The check reads the names of the tools the
// model can call in the first main request of a Lead session: when Workflow is not among them the owner and the Lead are
// told, once. The decision and the texts are here, as plain values; register.js asks the engine and sends the notices.
// The file imports nothing and holds no state.

export const NO_WORKFLOW_TITLE = 'Aether: Workflow tool missing'

export const NO_WORKFLOW_TEXT =
  'Aether: this session has no Workflow tool, so /aether:design and /aether:run cannot start. Turn on Dynamic workflows in /config (or set enableWorkflows: true in settings.json) and start a new session; an open run resumes from its diary. Run aether-doctor for the cause.'

// 'present' or 'missing' for a list of tool names, or null when the list is not one: not an array, empty, or holding anything
// but names. A null answer means nothing is known, so the check says nothing and asks again at the next request.
export function workflowToolState(names) {
  if (!Array.isArray(names) || names.length === 0 || !names.every((name) => typeof name === 'string')) return null
  return names.includes('Workflow') ? 'present' : 'missing'
}
