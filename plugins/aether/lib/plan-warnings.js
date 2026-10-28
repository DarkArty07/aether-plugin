'use strict'

// Warnings of an Aether plan that the parse cannot see: the budget of model agents, and more to come.
// Every finding is a warning: it never fails a check and never blocks a compile.
// Family: plan.

// Each task needs an implementer and a supervisor at least (issue 80). Max agents counts every model
// agent of the run, so a budget under that is spent before the last tasks start.
const AGENTS_PER_TASK = 2

function budgetWarnings(parsed) {
  const count = parsed.tasks.length
  const need = count * AGENTS_PER_TASK
  if (count === 0 || parsed.execution.maxAgents >= need) return []
  return [
    `Max agents: ${parsed.execution.maxAgents} is the run's total budget of model agents, not its parallelism; ${count} tasks need at least ${need} (an implementer and a supervisor each), so the rest end not-run once it is spent.`,
  ]
}

// parsed is the result of parsePlan.
function planWarnings(parsed) {
  return [...budgetWarnings(parsed)]
}

module.exports = { planWarnings }
