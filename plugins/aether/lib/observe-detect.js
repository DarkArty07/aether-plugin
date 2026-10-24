'use strict'

const crypto = require('node:crypto')

function toMillis(time) {
  if (typeof time === 'number') return time
  if (typeof time === 'string') {
    const parsed = Date.parse(time)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

function toIso(time) {
  if (typeof time === 'string' && time.includes('T')) return time
  return new Date(toMillis(time)).toISOString()
}

/**
 * sha256 en hex de las palabras del comando unidas con un espacio, los primeros 12 caracteres.
 */
function fingerprintOf(command) {
  if (typeof command !== 'string') return ''
  const words = command.trim().split(/\s+/).filter(Boolean).join(' ')
  return crypto.createHash('sha256').update(words).digest('hex').slice(0, 12)
}

/**
 * detectRiseWithoutReason(entries): Finding[]
 * Para cada launch con launchKind === 'rise', mira el verdict más reciente de la misma tarea
 * anterior a él en el arreglo; es legítimo solo si su next.kind === 'rise' y next.cause es
 * 'exhausted', 'repeated' o 'infeasible'. Si no, hallazgo.
 */
function detectRiseWithoutReason(entries = []) {
  if (!Array.isArray(entries)) return []
  const findings = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry || entry.kind !== 'launch' || entry.launchKind !== 'rise') continue

    let lastVerdict = null
    for (let j = i - 1; j >= 0; j--) {
      const prev = entries[j]
      if (prev && prev.kind === 'verdict' && prev.task === entry.task) {
        lastVerdict = prev
        break
      }
    }

    const legitimate =
      lastVerdict &&
      lastVerdict.next &&
      lastVerdict.next.kind === 'rise' &&
      ['exhausted', 'repeated', 'infeasible'].includes(lastVerdict.next.cause)

    if (!legitimate) {
      const evidence = []
      if (lastVerdict) {
        evidence.push(
          `Task ${entry.task} attempt ${entry.attempt} rose to step ${entry.step} (log line ${entry.line}) after verdict ${lastVerdict.verdict} (log line ${lastVerdict.line})`
        )
      } else {
        evidence.push(
          `Task ${entry.task} attempt ${entry.attempt} rose to step ${entry.step} (log line ${entry.line}) after no verdict`
        )
      }

      findings.push({
        id: `rise-without-reason:${entry.task}:${entry.attempt}`,
        kind: 'failure',
        type: 'rise-without-reason',
        title: `Task ${entry.task} rose to step ${entry.step} without reason on attempt ${entry.attempt}`,
        evidence,
        numbers: { task: entry.task, attempt: entry.attempt, step: entry.step },
        firstTime: lastVerdict ? lastVerdict.time : entry.time,
        lastTime: entry.time,
        sessions: entry.session ? [entry.session] : [],
      })
    }
  }

  return findings
}

/**
 * detectPairFailures(entries, cfg): Finding[]
 * Por harness/model, en orden de time, la racha más larga de estados distintos de ok
 * donde las tareas (id) son distintas (varios intentos de una misma tarea cuentan una vez).
 * Si alcanza cfg.pairFailures.consecutive, hallazgo con id: 'pair-failing:<harness>/<model>',
 * numbers: { failures, tasks }.
 */
function detectPairFailures(entries = [], cfg = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return []
  const minConsecutive = cfg.pairFailures?.consecutive ?? 3

  // Group outcomes by harness/model
  const groups = new Map()
  for (const entry of entries) {
    if (!entry || !entry.harness || !entry.model) continue
    const key = `${entry.harness}/${entry.model}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }

  const findings = []

  for (const [key, group] of groups) {
    group.sort((a, b) => a.time - b.time)

    // Find streaks of non-ok outcomes
    const streaks = []
    let currentStreak = []

    for (const entry of group) {
      if (entry.status === 'ok') {
        if (currentStreak.length > 0) {
          streaks.push(currentStreak)
          currentStreak = []
        }
      } else {
        currentStreak.push(entry)
      }
    }
    if (currentStreak.length > 0) {
      streaks.push(currentStreak)
    }

    // Find the streak with the most distinct tasks
    let longestStreak = null
    let longestTasks = []

    for (const streak of streaks) {
      const distinctTasks = []
      for (const item of streak) {
        if (!distinctTasks.includes(item.id)) {
          distinctTasks.push(item.id)
        }
      }
      if (distinctTasks.length > longestTasks.length) {
        longestTasks = distinctTasks
        longestStreak = streak
      }
    }

    if (longestStreak && longestTasks.length >= minConsecutive) {
      const sessions = [...new Set(longestStreak.map((o) => o.session).filter(Boolean))]
      findings.push({
        id: `pair-failing:${key}`,
        kind: 'failure',
        type: 'pair-failing',
        title: `Pair ${key} failing repeatedly (${longestTasks.length} consecutive failures)`,
        evidence: longestStreak.map((o) => `Task ${o.id} status ${o.status} at time ${o.time}`),
        numbers: { failures: longestTasks.length, tasks: longestTasks },
        firstTime: longestStreak[0].time,
        lastTime: longestStreak[longestStreak.length - 1].time,
        sessions,
      })
    }
  }

  return findings
}

/**
 * detectRuleBroken({ events, delegateEntries }): Finding[]
 * Por cada evento { kind: 'PostToolUse', tool: 'ScheduleWakeup', session, time },
 * mira si en esa sesión hay una tarea abierta en ese time: tiene un launch con time anterior
 * y su último verdict anterior a time no es approved ni exhausted.
 * Un hallazgo por sesión: id: 'rule-broken:no-wakeup-for-delegate:<sesión>', numbers: { count }.
 */
function detectRuleBroken({ events = [], delegateEntries = [] } = {}) {
  if (!Array.isArray(events) || events.length === 0) return []

  const violationsBySession = new Map()

  for (const event of events) {
    if (!event || event.kind !== 'PostToolUse' || event.tool !== 'ScheduleWakeup' || !event.session) continue

    const session = event.session
    const time = event.time

    // Check if any delegate task is open in this session at time
    const launchedTasks = new Set()
    for (const entry of delegateEntries || []) {
      if (
        entry &&
        entry.session === session &&
        entry.time < time &&
        entry.kind === 'launch' &&
        entry.launchKind !== 'refused' &&
        entry.task
      ) {
        launchedTasks.add(entry.task)
      }
    }

    let hasOpenTask = false
    for (const task of launchedTasks) {
      let lastVerdict = null
      for (const e of delegateEntries || []) {
        if (e && e.task === task && e.kind === 'verdict' && e.time < time) {
          if (!lastVerdict || e.time > lastVerdict.time) {
            lastVerdict = e
          }
        }
      }

      const isClosed =
        lastVerdict &&
        (lastVerdict.verdict === 'approved' ||
          lastVerdict.verdict === 'exhausted' ||
          lastVerdict.next?.cause === 'exhausted' ||
          lastVerdict.next?.kind === 'done')

      if (!isClosed) {
        hasOpenTask = true
        break
      }
    }

    if (hasOpenTask) {
      if (!violationsBySession.has(session)) violationsBySession.set(session, [])
      violationsBySession.get(session).push(event)
    }
  }

  const findings = []
  for (const [session, violationEvents] of violationsBySession) {
    findings.push({
      id: `rule-broken:no-wakeup-for-delegate:${session}`,
      kind: 'failure',
      type: 'rule-broken',
      title: `ScheduleWakeup called while delegate task was open in session ${session}`,
      evidence: violationEvents.map((e) => `ScheduleWakeup called at time ${e.time} while a delegate task was open`),
      numbers: { count: violationEvents.length },
      firstTime: violationEvents[0].time,
      lastTime: violationEvents[violationEvents.length - 1].time,
      sessions: [session],
    })
  }

  return findings
}

/**
 * detectBlockedByMistake({ pending, grants }, cfg): Finding[]
 * pending es [{ time, session, class, fingerprint }] y grants es [{ class, added }] (added en ISO).
 * Una entrada se señala si hay una concesión de su clase con added posterior a su time,
 * o si la misma fingerprint aparece cfg.blockedByMistake.repeatBlocks veces o más.
 * id: 'blocked-by-mistake:<clase>:<huella>'; la evidencia nombra la clase, la huella y las fechas ISO,
 * nunca el comando ni la cita.
 */
function detectBlockedByMistake({ pending = [], grants = [] } = {}, cfg = {}) {
  if (!Array.isArray(pending) || pending.length === 0) return []
  const repeatBlocksThreshold = cfg.blockedByMistake?.repeatBlocks ?? 2

  // Count fingerprints across pending
  const fpCounts = new Map()
  for (const p of pending) {
    if (!p || !p.fingerprint) continue
    fpCounts.set(p.fingerprint, (fpCounts.get(p.fingerprint) || 0) + 1)
  }

  // Group grants by class
  const grantsByClass = new Map()
  for (const g of grants || []) {
    if (!g || !g.class || !g.added) continue
    if (!grantsByClass.has(g.class)) grantsByClass.set(g.class, [])
    grantsByClass.get(g.class).push(g)
  }

  const signaledGroups = new Map()

  for (const p of pending) {
    if (!p || !p.class || !p.fingerprint) continue

    const classGrants = grantsByClass.get(p.class) || []
    const laterGrant = classGrants.find((g) => toMillis(g.added) > toMillis(p.time))
    const isRepeated = (fpCounts.get(p.fingerprint) || 0) >= repeatBlocksThreshold

    if (laterGrant || isRepeated) {
      const key = `${p.class}:${p.fingerprint}`
      if (!signaledGroups.has(key)) {
        signaledGroups.set(key, {
          cls: p.class,
          fingerprint: p.fingerprint,
          entries: [],
          laterGrant: laterGrant || null,
          isRepeated,
        })
      }
      const group = signaledGroups.get(key)
      group.entries.push(p)
      if (laterGrant && !group.laterGrant) group.laterGrant = laterGrant
      if (isRepeated) group.isRepeated = true
    }
  }

  const findings = []

  for (const [key, group] of signaledGroups) {
    group.entries.sort((a, b) => toMillis(a.time) - toMillis(b.time))
    const firstTime = group.entries[0].time
    const lastTime = group.entries[group.entries.length - 1].time
    const sessions = [...new Set(group.entries.map((e) => e.session).filter(Boolean))]

    const evidence = []
    if (group.laterGrant) {
      evidence.push(
        `Class ${group.cls} with fingerprint ${group.fingerprint} blocked at ${toIso(firstTime)} before grant added at ${toIso(group.laterGrant.added)}`
      )
    }
    if (group.isRepeated) {
      evidence.push(
        `Class ${group.cls} with fingerprint ${group.fingerprint} blocked ${group.entries.length} times between ${toIso(firstTime)} and ${toIso(lastTime)}`
      )
    }

    findings.push({
      id: `blocked-by-mistake:${key}`,
      kind: 'failure',
      type: 'blocked-by-mistake',
      title: `Command of class ${group.cls} (fingerprint ${group.fingerprint}) possibly blocked by mistake`,
      evidence,
      numbers: {
        class: group.cls,
        fingerprint: group.fingerprint,
        count: group.entries.length,
      },
      firstTime,
      lastTime,
      sessions,
    })
  }

  return findings
}

module.exports = {
  fingerprintOf,
  detectRiseWithoutReason,
  detectPairFailures,
  detectRuleBroken,
  detectBlockedByMistake,
}
