'use strict'

// The saved quota readings of external harnesses: kept while their life lasts when their reading launches
// a process, as agy does, and served to calls that share the harness without running another process.

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_LIFE_MINUTES = 10
let writeCounter = 0

function cacheFile(dataDir, harness) {
  return path.join(dataDir, 'lanes', 'quota', `${encodeURIComponent(harness)}.json`)
}

function writeAtomic(file, value) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.${++writeCounter}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Reads a harness's quota through its adapter. settings is its entry in the table ({ groups, quotaLifeMinutes? }).
// When adapter.quotaCost === 'process' and quotaLifeMinutes is not 0, the reading is saved to cacheFile and served
// while now - readAt < life and readAt <= now and the cached reading has all groups in settings.groups.
// fresh: true always reads fresh and renews the saved reading. If adapter.quota() throws, nothing is written.
function readGroups(adapter, { harness, settings = {}, dataDir, now = Date.now(), fresh = false } = {}) {
  const quotaLife = settings.quotaLifeMinutes !== undefined ? settings.quotaLifeMinutes : DEFAULT_LIFE_MINUTES
  const shouldCache = adapter.quotaCost === 'process' && quotaLife > 0 && typeof dataDir === 'string'
  const file = shouldCache ? cacheFile(dataDir, harness) : null

  if (shouldCache && !fresh) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8')
        const data = JSON.parse(content)
        const lifeMs = quotaLife * 60 * 1000
        const requiredGroups = Object.keys(settings.groups || {})
        if (
          isObject(data) &&
          typeof data.readAt === 'number' &&
          data.readAt <= now &&
          now - data.readAt < lifeMs &&
          isObject(data.groups) &&
          requiredGroups.every((g) => Object.hasOwn(data.groups, g))
        ) {
          return { groups: data.groups, readAt: data.readAt, cached: true }
        }
      }
    } catch {
      // unreadable or corrupt, ignore cache
    }
  }

  const result = adapter.quota()
  const readAt = now
  const groups = result.groups

  if (shouldCache) {
    writeAtomic(file, {
      harness,
      readAt,
      groups,
    })
  }

  return { groups, readAt, cached: false }
}

module.exports = {
  DEFAULT_LIFE_MINUTES,
  cacheFile,
  readGroups,
}
