'use strict'

// The notices of confirmed creations (spec 020): one file per issue the worker created, under observe/notices/ until a
// startup of the Lead shows it. saveNotice writes one; takeNotices claims the ones that fit a startup's output, oldest
// first, and leaves the rest for the next startup. A rename claims a notice, so two startups never show the same one.
// Family: observe.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { observeDir } = require('./observe.js')

const dirOf = (dataDir) => path.join(observeDir(dataDir), 'notices')
// A notice gives its reason in general words, never the text of the finding: the id of a failure says which kind it is.
const REASONS = {
  fault: 'silent faults',
  'rise-without-reason': 'an unexplained delegate rise',
  'pair-failing': 'repeated model failures',
  'rule-broken': 'a workflow rule violation',
}
const OTHER_REASON = 'an observation failure'
const REASON_TEXTS = [...Object.values(REASONS), OTHER_REASON]
// A file of the folder: fifteen digits of the save time in milliseconds, a dash, and a random name. Sorted by name, they are oldest first.
const NAME = /^\d{15}-[0-9a-f-]+\.json$/
// An issue URL on github.com, with the longest owner and repository names GitHub allows, so one notice stays a short line.
const ISSUE_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}\/issues\/\d{1,9}$/

// The line a startup shows for one notice: the only text of a notice that leaves this file.
function noticeLine(notice) {
  return `Aether opened issue #${notice.number}: ${notice.url} (${notice.reason}).`
}

// True for a notice a startup can show: a positive number, the URL of that issue, and one of the reasons.
function validNotice(notice) {
  return notice !== null && typeof notice === 'object' && Number.isSafeInteger(notice.number) && notice.number > 0
    && typeof notice.url === 'string' && ISSUE_URL.test(notice.url) && notice.url.endsWith(`/issues/${notice.number}`)
    && REASON_TEXTS.includes(notice.reason)
}

// Saves the notice of one confirmed creation and returns true; false when the number or the URL is not valid. A write that fails
// throws, and the caller decides what the run does without the notice.
function saveNotice(dataDir, { number, url, id }) {
  const notice = { number, url, reason: REASONS[String(id).split(':')[0]] || OTHER_REASON }
  if (!validNotice(notice)) return false
  const dir = dirOf(dataDir)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = path.join(dir, `${String(Date.now()).padStart(15, '0')}-${crypto.randomUUID()}.json`)
  const temp = `${file}.tmp`
  try {
    fs.writeFileSync(temp, JSON.stringify(notice), { mode: 0o600, flag: 'wx' })
    fs.renameSync(temp, file)
  } catch (err) {
    try { fs.rmSync(temp, { force: true }) } catch { /* The temporary file is not read by anything. */ }
    throw err
  }
  return true
}

function discard(file) {
  try { fs.rmSync(file, { force: true }) } catch { /* A file that cannot be removed is skipped again next time. */ }
}

// The notices a startup shows, oldest first. Each notice is claimed only when fits(list) is true, where list is the notices taken so
// far and this one. One that does not fit stays for the next startup without holding back a smaller later one. A file that is not
// a valid notice is removed, since no startup could show it. A file another startup claimed first is skipped. Never throws.
function takeNotices(dataDir, fits = () => true) {
  const dir = dirOf(dataDir)
  let names
  try {
    names = fs.readdirSync(dir).filter((name) => NAME.test(name)).sort()
  } catch {
    return []
  }
  const taken = []
  for (const name of names) {
    const file = path.join(dir, name)
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue // Claimed by another startup meanwhile, or not readable: it stays where it is.
    }
    let notice = null
    try {
      notice = JSON.parse(text)
    } catch {
      // Not JSON: invalid, removed below.
    }
    if (!validNotice(notice)) {
      discard(file)
      continue
    }
    if (!fits([...taken, notice])) continue // It stays pending; a smaller later one may still fit.
    const claim = `${file}.${crypto.randomUUID()}.claimed`
    try {
      fs.renameSync(file, claim)
    } catch {
      continue // Another startup claimed it first.
    }
    discard(claim)
    taken.push(notice)
  }
  return taken
}

// The one line the start-up notes hold when the last reading has calibration proposals (spec 036 R21):
// `N calibration proposals: run aether-observe proposals`, where N counts the items of kind `calibration` of
// observe/read.json. Nothing without a reading or with none. Reads only: it never writes. Never throws, so that
// a note never stops startup.
function proposalsNote(dataDir) {
  let reading
  try {
    reading = JSON.parse(fs.readFileSync(path.join(observeDir(dataDir), 'read.json'), 'utf8'))
  } catch {
    return ''
  }
  const items = reading && typeof reading === 'object' && Array.isArray(reading.items) ? reading.items : []
  const count = items.filter((item) => item && typeof item === 'object' && item.kind === 'calibration').length
  if (count <= 0) return ''
  return `${count} calibration proposals: run aether-observe proposals`
}

module.exports = { saveNotice, takeNotices, noticeLine, proposalsNote }
