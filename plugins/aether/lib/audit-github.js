'use strict'

// The open issues and pull requests of the audited project, read through gh on a GitHub remote.
// Family: audit.

const { git } = require('./git.js')
const store = require('./audit-store.js')

function remoteUrl(root) {
  const list = git(['remote'], root, { allowFail: true })
  if (list.status !== 0) return null
  const names = list.stdout.split('\n').filter((name) => name !== '')
  if (names.length === 0) return null
  const picked = names.includes('origin') ? 'origin' : names[0]
  const url = git(['remote', 'get-url', picked], root, { allowFail: true })
  return url.status === 0 && url.stdout !== '' ? url.stdout : null
}

function githubGate(root) {
  const url = remoteUrl(root)
  if (url === null) return { state: 'not-applicable', reason: 'no remote' }
  if (store.normalizeRemote(url).split('/')[0] !== 'github.com') {
    return { state: 'not-applicable', reason: 'the remote is not GitHub' }
  }
  return null
}

function failureOf(reply) {
  if (reply && reply.error && reply.error.code === 'ENOENT') return { state: 'could-not', reason: 'gh is not installed' }
  if (reply && reply.timedOut) return { state: 'could-not', reason: 'gh timed out' }
  if (!reply || reply.status !== 0) {
    return { state: 'could-not', reason: `gh failed: ${String((reply && reply.stderr) || '').split('\n')[0]}` }
  }
  return null
}

function parsedStdout(reply) {
  try {
    const data = JSON.parse(reply.stdout)
    if (Array.isArray(data)) return data
  } catch {}
  return null
}

function ghNow(ctx) {
  if (ctx.now instanceof Date) return ctx.now.getTime()
  if (ctx.now !== undefined && ctx.now !== null) return new Date(ctx.now).getTime()
  return Date.now()
}

function ageDaysOf(createdAt, nowMs) {
  return Math.floor((nowMs - new Date(createdAt).getTime()) / 86400000)
}

// issues(root, ctx) -> the open GitHub issues with their age, or why they could not be read.
async function issues(root, ctx) {
  const gate = githubGate(root)
  if (gate !== null) return gate
  const reply = await ctx.exec('gh', ['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,createdAt,labels,url'], { cwd: root, env: ctx.env })
  const failure = failureOf(reply)
  if (failure !== null) return failure
  const data = parsedStdout(reply)
  if (data === null) return { state: 'could-not', reason: 'gh output not understood' }
  const nowMs = ghNow(ctx)
  const open = data.map((entry) => ({
    number: entry.number,
    title: entry.title,
    createdAt: entry.createdAt,
    ageDays: ageDaysOf(entry.createdAt, nowMs),
    labels: Array.isArray(entry.labels) ? entry.labels.map((label) => label.name) : [],
    url: entry.url,
  }))
  return { state: 'result', open, olderThan90: open.filter((entry) => entry.ageDays > 90).length }
}

// prs(root, ctx) -> the open GitHub pull requests with their age, or why they could not be read.
async function prs(root, ctx) {
  const gate = githubGate(root)
  if (gate !== null) return gate
  const reply = await ctx.exec('gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,createdAt,isDraft,headRefName,url'], { cwd: root, env: ctx.env })
  const failure = failureOf(reply)
  if (failure !== null) return failure
  const data = parsedStdout(reply)
  if (data === null) return { state: 'could-not', reason: 'gh output not understood' }
  const nowMs = ghNow(ctx)
  const open = data.map((entry) => ({
    number: entry.number,
    title: entry.title,
    createdAt: entry.createdAt,
    ageDays: ageDaysOf(entry.createdAt, nowMs),
    draft: Boolean(entry.isDraft),
    branch: entry.headRefName,
    url: entry.url,
  }))
  return { state: 'result', open }
}

module.exports = {
  issues,
  prs,
}
