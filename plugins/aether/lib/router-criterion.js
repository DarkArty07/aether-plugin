'use strict'

// The router's criterion and its decision engine. The criterion is a file the owner reads
// (config/router/criterion.json): the questions a decider answers about a brief, the level
// each shape of work starts at, what raises it, and how far the answers are trusted. This
// module validates that file, checks a set of answers for coherence and turns answers into
// a level (A smallest .. D largest) and an axis. It is pure: no files besides the criterion,
// no clock, no network.

const fs = require('node:fs')
const path = require('node:path')

const QUESTION_IDS = ['shape', 'stakes', 'pinned_by_checks', 'needs_judgment', 'reads_a_lot', 'edits_files', 'many_steps']
const LEVELS = ['A', 'B', 'C', 'D']
const QUESTION_TYPES = ['choice', 'score', 'noul']

function criterionFile() {
  return path.join(__dirname, '..', 'config', 'router', 'criterion.json')
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isLevel(value) {
  return typeof value === 'string' && LEVELS.includes(value)
}

function has(object, key) {
  return isObject(object) && Object.hasOwn(object, key)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateCriterion(criterion) {
  if (!isObject(criterion)) {
    return ['the criterion is not an object']
  }
  const problems = []
  if (typeof criterion.about !== 'string' || !criterion.about.trim()) {
    problems.push('about must be a non-empty string')
  }
  if (!isNonEmptyString(criterion.inheritedEffort)) {
    problems.push('inheritedEffort must be a non-empty string')
  }
  for (const key of ['shape', 'stakes']) {
    if (!isUnit(criterion.minConfidence?.[key])) {
      problems.push(`minConfidence.${key} must be a number from 0 to 1`)
    }
  }

  const questions = criterion.questions
  if (!isObject(questions)) {
    problems.push('questions must be an object')
  } else {
    for (const id of QUESTION_IDS) {
      problems.push(...validateQuestion(id, questions[id]))
    }
    for (const id of Object.keys(questions)) {
      if (!QUESTION_IDS.includes(id)) {
        problems.push(`questions.${id} is not one of the seven questions`)
      }
    }
  }

  const shapes = isObject(questions?.shape?.criteria) ? Object.keys(questions.shape.criteria) : []
  const axisCode = criterion.axis?.code
  if (!Array.isArray(axisCode)) {
    problems.push('axis.code must be a list of shapes')
  } else {
    for (const name of axisCode) {
      if (!shapes.includes(name)) {
        problems.push(`axis.code names the unknown shape ${name}`)
      }
    }
  }

  if (!isObject(criterion.base)) {
    problems.push('base must be an object')
  } else {
    for (const name of shapes) {
      if (!has(criterion.base, name)) {
        problems.push(`base has no level for the shape ${name}`)
      } else if (!isLevel(criterion.base[name])) {
        problems.push(`base.${name} must be a level from A to D, not ${JSON.stringify(criterion.base[name])}`)
      }
    }
    for (const name of Object.keys(criterion.base)) {
      if (!shapes.includes(name)) {
        problems.push(`base names the unknown shape ${name}`)
      }
    }
  }

  if (!Array.isArray(criterion.adjust)) {
    problems.push('adjust must be a list')
  } else {
    criterion.adjust.forEach((rule, index) => {
      const at = `adjust[${index}]`
      if (!isObject(rule)) {
        problems.push(`${at} must be an object`)
        return
      }
      const type = questions?.[rule.question]?.type
      if (!QUESTION_IDS.includes(rule.question) || (type !== 'score' && type !== 'noul')) {
        problems.push(`${at} names the question ${rule.question}, which is not a score or noul question`)
      }
      if (!isFiniteNumber(rule.atLeast)) {
        problems.push(`${at}.atLeast must be a number`)
      }
      if (!Number.isInteger(rule.add)) {
        problems.push(`${at}.add must be an integer`)
      }
      if (typeof rule.why !== 'string' || !rule.why.trim()) {
        problems.push(`${at}.why must be a non-empty string`)
      }
    })
  }

  if (!Array.isArray(criterion.gates)) {
    problems.push('gates must be a list of shapes')
  } else {
    for (const name of criterion.gates) {
      if (!shapes.includes(name)) {
        problems.push(`gates names the unknown shape ${name}`)
      }
    }
  }

  const readOnly = criterion.readOnly
  if (!isObject(readOnly)) {
    problems.push('readOnly must be an object')
  } else {
    if (questions?.[readOnly.question]?.type !== 'noul') {
      problems.push(`readOnly.question ${readOnly.question} must be a noul question`)
    }
    if (!isUnit(readOnly.below)) {
      problems.push('readOnly.below must be a number from 0 to 1')
    }
    if (!isUnit(readOnly.minConfidence)) {
      problems.push('readOnly.minConfidence must be a number from 0 to 1')
    }
  }
  return problems
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isUnit(value) {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function validateQuestion(id, question) {
  if (!isObject(question)) {
    return [`questions.${id} is missing`]
  }
  const problems = []
  if (!QUESTION_TYPES.includes(question.type)) {
    problems.push(`questions.${id}.type must be one of ${QUESTION_TYPES.join(', ')}`)
  }
  if (typeof question.instructions !== 'string' || !question.instructions.trim()) {
    problems.push(`questions.${id}.instructions must be a non-empty string`)
  }
  if (question.type === 'choice' && (!isObject(question.criteria) || Object.keys(question.criteria).length === 0)) {
    problems.push(`questions.${id}.criteria must be a non-empty object`)
  }
  if (question.type === 'score' && (!Array.isArray(question.criteria) || question.criteria.length < 2)) {
    problems.push(`questions.${id}.criteria must be a list of at least two criteria`)
  }
  return problems
}

function loadCriterion(file = criterionFile()) {
  const criterion = JSON.parse(fs.readFileSync(file, 'utf8'))
  const problems = validateCriterion(criterion)
  if (problems.length > 0) {
    throw new Error(problems.join('; '))
  }
  return criterion
}

// The first incoherence in a set of answers, or null.
function checkAnswers(criterion, answers) {
  if (!isObject(answers)) {
    return 'the answers are not an object'
  }
  for (const id of QUESTION_IDS) {
    const answer = answers[id]
    const question = criterion.questions[id]
    if (!isObject(answer)) {
      return `the answer to ${id} is missing`
    }
    if (!isFiniteNumber(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
      return `${id} confidence ${JSON.stringify(answer.confidence)} is not a number from 0 to 1`
    }
    if (question.type === 'choice') {
      if (typeof answer.choice !== 'string' || !has(question.criteria, answer.choice)) {
        return `${id} choice ${JSON.stringify(answer.choice)} is not one of the categories`
      }
    } else if (question.type === 'score') {
      const top = question.criteria.length - 1
      if (!isFiniteNumber(answer.score) || answer.score < 0 || answer.score > top) {
        return `${id} score ${JSON.stringify(answer.score)} is not a number from 0 to ${top}`
      }
    } else if (!isFiniteNumber(answer.noul) || answer.noul < 0 || answer.noul > 1) {
      return `${id} noul ${JSON.stringify(answer.noul)} is not a number from 0 to 1`
    }
  }
  return null
}

function axisOf(criterion, answers) {
  const choice = answers?.shape?.choice
  return typeof choice === 'string' && criterion.axis.code.includes(choice) ? 'code' : 'general'
}

function valueOf(answer) {
  return answer.score !== undefined ? answer.score : answer.noul
}

function clampLevel(index) {
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index))]
}

function higher(a, b) {
  return LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b
}

function decide(criterion, answers, { floor } = {}) {
  if (!isLevel(floor)) {
    throw new Error(`floor must be a level from A to D, not ${JSON.stringify(floor)}`)
  }
  const problem = checkAnswers(criterion, answers)
  if (problem !== null) {
    return {
      level: floor,
      axis: 'general',
      shape: null,
      confidence: 0,
      readOnly: false,
      decidedLevel: null,
      flags: { lowConfidence: false, incoherent: true, gate: false },
      reason: `incoherent answers (${problem}) keep the Lead's level ${floor}`,
    }
  }

  const shape = answers.shape.choice
  const baseLevel = criterion.base[shape]
  const parts = [`shape ${shape} (${answers.shape.confidence})`, `stakes ${answers.stakes.score}`, `base ${baseLevel}`]
  let index = LEVELS.indexOf(baseLevel)
  for (const rule of criterion.adjust) {
    if (valueOf(answers[rule.question]) >= rule.atLeast) {
      index += rule.add
      parts.push(`${rule.add > 0 ? '+' : ''}${rule.add} ${rule.why}`)
    }
  }
  const decidedLevel = clampLevel(index)

  const lowConfidence = answers.shape.confidence < criterion.minConfidence.shape
    || answers.stakes.confidence < criterion.minConfidence.stakes
  const gate = criterion.gates.includes(shape)
  const level = lowConfidence || gate ? higher(decidedLevel, floor) : decidedLevel
  if (level !== decidedLevel) {
    if (gate) {
      parts.push(`gate keeps the Lead's level ${floor}`)
    }
    if (lowConfidence) {
      parts.push(`low confidence keeps the Lead's level ${floor}`)
    }
  }

  const edits = answers[criterion.readOnly.question]
  const readOnly = !lowConfidence
    && edits.noul < criterion.readOnly.below
    && edits.confidence >= criterion.readOnly.minConfidence

  return {
    level,
    axis: axisOf(criterion, answers),
    shape,
    confidence: Math.min(answers.shape.confidence, answers.stakes.confidence),
    readOnly,
    decidedLevel,
    flags: { lowConfidence, incoherent: false, gate },
    reason: parts.join('; '),
  }
}

// One line per fixture whose decision differs from its expectation; [] when none.
function regress(criterion, fixtures) {
  const lines = []
  for (const fixture of fixtures) {
    const got = decide(criterion, fixture.answers, { floor: fixture.floor })
    const actual = {
      level: got.level,
      axis: got.axis,
      readOnly: got.readOnly,
      lowConfidence: got.flags.lowConfidence,
      incoherent: got.flags.incoherent,
      gate: got.flags.gate,
    }
    for (const field of Object.keys(fixture.expected)) {
      if (actual[field] !== fixture.expected[field]) {
        lines.push(`${fixture.id}: expected ${field} ${fixture.expected[field]}, got ${actual[field]}`)
      }
    }
  }
  return lines
}

module.exports = { QUESTION_IDS, criterionFile, validateCriterion, loadCriterion, checkAnswers, axisOf, decide, regress }
