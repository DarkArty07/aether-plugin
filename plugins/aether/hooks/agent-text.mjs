// The text Claude Code gives the model for its Agent tool, in an Aether session (issue 145).
//
// On a Pro account the description of Agent carries a paragraph that starts «Do not spawn agents unless the user asks»,
// and the Lead's rules (using-aether, "The three paths") send an edit-test-fix loop to a delegate task and long work to
// the swarm. The two texts reach the Lead together, and nothing in them says which wins. In an Aether session the mod
// takes that paragraph out of the description (register.js, the tool.describe hook); a plain session keeps the engine's
// text. The paragraph is one line, so it is found by its first words: a Claude Code that words the rest differently
// still loses it, and one that words those differently leaves the description as it is, which using-aether's sentence
// about the owner's request covers.

const SPAWN_RULE = /\n?\*\*Do not spawn agents unless the user asks\.?\*\*[^\n]*/i

// The description without the paragraph, and the same string when it has none (or is not a string).
export function withoutSpawnRule(description) {
  if (typeof description !== 'string') return description
  return description.replace(SPAWN_RULE, '')
}
