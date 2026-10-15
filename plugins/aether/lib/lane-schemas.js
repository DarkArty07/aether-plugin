'use strict'

// The structured outputs lane calls ask agy for. The three role schemas copy the workflow's
// (run.workflow.js, from FINDINGS through REVIEW_SCHEMA), which a test keeps equal.

const FINDINGS = {
  type: 'array',
  items: {
    type: 'object',
    required: ['severity', 'title', 'file', 'evidence'],
    properties: {
      severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
      title: { type: 'string' },
      file: { type: 'string', description: 'path:line' },
      evidence: { type: 'string' },
    },
  },
}

const IMPLEMENTER_SCHEMA = {
  type: 'object',
  required: ['status', 'summary', 'head', 'tests', 'concerns', 'question'],
  properties: {
    status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED'] },
    summary: { type: 'string', description: 'what you implemented, or what you attempted' },
    head: { type: 'string', description: 'the commit your unit branch ends on; empty if you made none' },
    tests: { type: 'string', description: 'the test commands you ran and their results, RED then GREEN' },
    concerns: { type: 'string', description: 'doubts about the work; empty if none' },
    question: { type: 'string', description: 'for NEEDS_CONTEXT or BLOCKED: exactly what you need; empty otherwise' },
  },
}

const SUPERVISOR_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'ruling', 'guidance', 'question'],
  properties: {
    verdict: { type: 'string', enum: ['approve', 'retry', 'escalate', 'block'] },
    findings: FINDINGS,
    ruling: { type: 'string', description: 'one line: the decision and why' },
    guidance: { type: 'string', description: 'for retry or escalate: what the next attempt must do; empty otherwise' },
    question: { type: 'string', description: 'for block: the question the Lead must answer; empty otherwise' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'declined', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['ready', 'ready-with-fixes', 'not-ready'] },
    findings: FINDINGS,
    declined: {
      type: 'array',
      items: { type: 'string' },
      description: 'behaviors you set aside as outside the plan or spec, each with the reason',
    },
    summary: { type: 'string', description: 'strengths and a one-paragraph assessment' },
  },
}

// The answers of the design seats (lib/seats.js) when a lane harness takes them. The Judge's carries what its
// agent file's indented block says; seats.js prints it back in that format for the Lead.
const JUDGE_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'openQuestions'],
  properties: {
    verdict: { type: 'string', enum: ['approve', 'revise', 'reject'] },
    findings: {
      type: 'array',
      description: 'at most 10',
      items: {
        type: 'object',
        required: ['severity', 'type', 'title', 'evidence', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
          type: { type: 'string', enum: ['missing', 'extra', 'wrong'], description: 'missing: the document lacks something it needs; extra: it has something nobody asked for; wrong: it says something that is not so' },
          title: { type: 'string' },
          evidence: { type: 'string', description: 'a quote of the document in backticks, or file:line in the code' },
          fix: { type: 'string' },
        },
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

const WRITER_SCHEMA = {
  type: 'object',
  required: ['plan', 'tasks', 'commit', 'check', 'assumptions', 'questions'],
  properties: {
    plan: { type: 'string', description: 'the path of plan.md' },
    tasks: { type: 'string', description: 'the path of tasks.md' },
    commit: { type: 'string', description: 'your commit of plan.md and tasks.md' },
    check: { type: 'string', description: 'what aether-plan check printed' },
    assumptions: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    complexity: { type: 'string', description: 'the complexity the plan adds beyond the spec, and why it is needed; empty if none' },
    disagreements: { type: 'array', items: { type: 'string' }, description: 'each finding you did not apply, with why' },
  },
}

// The Writer's answer for the spec alone (--doc spec): spec.md, no plan and no tasks.
const SPEC_WRITER_SCHEMA = {
  type: 'object',
  required: ['spec', 'commit', 'clarify', 'assumptions', 'questions'],
  properties: {
    spec: { type: 'string', description: 'the path of spec.md' },
    commit: { type: 'string', description: 'your commit of spec.md' },
    clarify: { type: 'array', items: { type: 'string' }, description: 'each [NEEDS CLARIFICATION: ...] mark left in the spec' },
    assumptions: { type: 'array', items: { type: 'string' } },
    proposals: { type: 'array', items: { type: 'string' }, description: 'what you propose beyond what the owner asked, each with why' },
    questions: { type: 'array', items: { type: 'string' } },
    disagreements: { type: 'array', items: { type: 'string' }, description: 'each finding you did not apply, with why' },
  },
}

// The native Writer's answer when it corrects one document of the short design (the workflow uses it).
const REVISION_SCHEMA = {
  type: 'object',
  required: ['document', 'commit', 'assumptions', 'questions'],
  properties: {
    document: { type: 'string', description: 'the path of the corrected document; tasks.md for a plan' },
    commit: { type: 'string', description: 'your commit of the corrected document' },
    assumptions: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    disagreements: { type: 'array', items: { type: 'string' }, description: 'each finding you did not apply, with why' },
  },
}

const EXAMINER_SCHEMA = {
  type: 'object',
  required: ['tests', 'notes'],
  properties: {
    tests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'criterion', 'command', 'files'],
        properties: {
          id: { type: 'string', description: 'a short kebab-case name' },
          criterion: { type: 'string', description: 'the criterion or requirement of the spec it proves, such as C2 or R5' },
          command: { type: 'string', description: 'the shell command that runs this test from the repository root; exit 0 means it passes' },
          files: { type: 'array', items: { type: 'string' }, description: 'the files it needs, relative to .aether-exam/' },
        },
      },
    },
    notes: { type: 'string', description: 'what the exam cannot check, and why' },
  },
}

// The keywords the role schemas use. A schema with any other keyword makes validate throw, so a later schema
// change is noticed instead of being checked wrongly.
const KEYWORDS = ['type', 'enum', 'required', 'properties', 'items', 'description']

const TYPE_NAMES = { string: 'a string', number: 'a number', integer: 'an integer', boolean: 'a boolean', array: 'an array', object: 'an object', null: 'null' }

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Throws for a keyword the validator does not support, in the schema or in any schema under it.
function checkKeywords(schema) {
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.includes(key)) throw new Error(`unsupported schema keyword: ${key}`)
  }
  for (const sub of Object.values(schema.properties ?? {})) checkKeywords(sub)
  if (schema.items !== undefined) checkKeywords(schema.items)
}

function typeMatches(type, value) {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isPlainObject(value)
    case 'null':
      return value === null
    default:
      throw new Error(`unsupported schema type: ${type}`)
  }
}

// The field's name in a message: where is the path so far, and the empty path is the answer itself.
const fieldPath = (where, key) => (where === '' ? key : `${where}.${key}`)

// The first problem of value under schema, in a few words, or null. where is the path of value so far.
function problemOf(schema, value, where) {
  const lead = where === '' ? '' : `${where} `
  const types = schema.type === undefined ? [] : [].concat(schema.type)
  if (types.length > 0 && !types.some((type) => typeMatches(type, value))) {
    return `${lead}must be ${types.map((type) => TYPE_NAMES[type] ?? type).join(' or ')}`
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) return `${lead}must be one of ${schema.enum.join(', ')}`
  if (isPlainObject(value)) {
    for (const field of schema.required ?? []) {
      if (!Object.hasOwn(value, field)) return `missing ${fieldPath(where, field)}`
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (!Object.hasOwn(value, key)) continue
      const problem = problemOf(sub, value[key], fieldPath(where, key))
      if (problem !== null) return problem
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    for (let i = 0; i < value.length; i++) {
      const problem = problemOf(schema.items, value[i], `${where}[${i}]`)
      if (problem !== null) return problem
    }
  }
  return null
}

// The first problem of an answer under a role schema, in a few words, or null when the answer is valid.
// Throws for a keyword the validator does not support.
function validate(schema, value) {
  checkKeywords(schema)
  return problemOf(schema, value, '')
}

module.exports = { IMPLEMENTER_SCHEMA, SUPERVISOR_SCHEMA, REVIEW_SCHEMA, JUDGE_SCHEMA, WRITER_SCHEMA, SPEC_WRITER_SCHEMA, REVISION_SCHEMA, EXAMINER_SCHEMA, validate }
