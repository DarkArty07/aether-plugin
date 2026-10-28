'use strict'

// Joins the tasks that a plan says "Merges with" into one unit each: a group of tasks that are green
// only together is built, tested and merged as one (issue 81).
// Family: plan.

// The reviews from the lowest to the strongest; a task with no Review line has none, which is the lowest.
const REVIEW_RANK = [null, 'high', 'xhigh', 'max']

// "13, 19 and 20", or "12 and 13"
function listNumbers(numbers) {
  const parts = numbers.map(String)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// The dependencies of a task on the units that now hold its tasks. A group's dependency on one of its
// own members is dropped, and each unit is depended on once, with the reason of the first line.
function remapDependsOn(dependsOn, unitOf, ownUnit) {
  const out = []
  for (const dependency of dependsOn) {
    const number = unitOf(dependency.number)
    if (number === ownUnit || out.some((kept) => kept.number === number)) continue
    out.push(number === dependency.number ? dependency : { number, reason: dependency.reason })
  }
  return out
}

// One task for a group: its lowest member's, with the members' text, owns, serves and dependencies.
function groupTask(group, byNumber, unitOf) {
  const members = group.members.map((n) => byNumber.get(n))
  const lowest = members[0]
  const strongest = members.reduce((best, t) => (REVIEW_RANK.indexOf(t.review) > REVIEW_RANK.indexOf(best.review) ? t : best))
  const note =
    `This unit builds Tasks ${listNumbers(group.members)} together: each of them changes something that a test of another still holds, ` +
    "so they are green only together. Build all of them, then run the plan's test command once."
  return {
    ...lowest,
    title: `Tasks ${listNumbers(group.members)}: ${lowest.title}`,
    text: [note, members.map((t) => t.text).join('\n\n')].join('\n\n'),
    review: strongest.review,
    reviewReason: strongest.reviewReason,
    owns: [...new Set(members.flatMap((t) => t.owns))],
    serves: [...new Set(members.flatMap((t) => t.serves))],
    dependsOn: remapDependsOn(members.flatMap((t) => t.dependsOn), unitOf, group.unit),
    mergesWith: group.members.slice(1),
    members: group.members,
  }
}

// The parsed plan with its "Merges with" groups joined. Returns a new object; the input is not changed.
// A plan without any group comes out as it went in, with groups: [].
function applyGroups(parsed) {
  const errors = [...parsed.errors]
  const known = new Set(parsed.tasks.map((t) => t.number))
  // union-find over the task numbers; the lowest number of a group is its root, so it is the unit
  const parent = new Map([...known].map((n) => [n, n]))
  const root = (n) => (parent.get(n) === n ? n : root(parent.get(n)))
  for (const t of parsed.tasks) {
    for (const n of t.mergesWith) {
      if (!known.has(n)) {
        errors.push(`Task ${t.number} merges with Task ${n}, which is not in the plan.`)
        continue
      }
      const [a, b] = [root(t.number), root(n)]
      if (a !== b) parent.set(Math.max(a, b), Math.min(a, b))
    }
  }
  const unitOf = (n) => (known.has(n) ? root(n) : n)

  const members = new Map()
  for (const t of parsed.tasks) {
    const unit = unitOf(t.number)
    if (!members.has(unit)) members.set(unit, [])
    members.get(unit).push(t.number)
  }
  const groups = [...members.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([unit, list]) => ({ unit, members: list.sort((a, b) => a - b) }))
  if (groups.length === 0) return { ...parsed, groups, errors }

  const byNumber = new Map(parsed.tasks.map((t) => [t.number, t]))
  const groupByUnit = new Map(groups.map((g) => [g.unit, g]))
  // Each unit keeps the place of its lowest member; the other members leave the list.
  const tasks = parsed.tasks
    .filter((t) => unitOf(t.number) === t.number)
    .map((t) => {
      const group = groupByUnit.get(t.number)
      return group ? groupTask(group, byNumber, unitOf) : { ...t, dependsOn: remapDependsOn(t.dependsOn, unitOf, null) }
    })
  return { ...parsed, tasks, groups, errors }
}

module.exports = { applyGroups, listNumbers }
