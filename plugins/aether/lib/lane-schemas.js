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

const DESIGNER_SCHEMA = {
  type: 'object',
  required: ['decision', 'stage', 'decide', 'files'],
  properties: {
    decision: {
      type: 'string',
      description: 'the text of "Decision", in the owner\'s language: what the round produced, the options, the recommendation, and what must be decided',
    },
    stage: { type: 'string', enum: ['approaches', 'design', 'spec', 'plan', 'question', 'blocked'] },
    decide: {
      type: 'string',
      description: 'who closes the round: "lead — <reason>", or "owner — uncovered: <reason>", "owner — conflict: <reason>" or "owner — irreversible: <reason>"',
    },
    files: { type: 'string', description: 'paths and commits, or none' },
  },
}

module.exports = { IMPLEMENTER_SCHEMA, SUPERVISOR_SCHEMA, REVIEW_SCHEMA, DESIGNER_SCHEMA }
