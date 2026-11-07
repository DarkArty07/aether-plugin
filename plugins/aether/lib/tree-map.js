'use strict'

// Layout map and documentation for the local .aether state directory under spec 030 R14.
// Family: tree.

const fs = require('node:fs')
const path = require('node:path')
const { writeAtomic } = require('./common.js')

const LAYOUT = [
  {
    path: 'README.md',
    what: 'Map of the .aether state directory layout and policies',
    writer: 'aether-session-start',
    lasts: 'permanent',
    git: 'never',
    legacy: false,
  },
  {
    path: 'autonomy/',
    what: 'Autonomy grants, runs, ceilings and diaries',
    writer: 'aether-autonomy',
    lasts: 'permanent',
    git: 'never',
    legacy: false,
  },
  {
    path: 'broken-runs/',
    what: 'Quarantined state of corrupted or interrupted runs',
    writer: 'aether-plan',
    lasts: 'until cleaned',
    git: 'never',
    legacy: false,
  },
  {
    path: 'pending.jsonl',
    what: 'Log of irreversible commands pending owner grant',
    writer: 'aether-guard',
    lasts: 'permanent',
    git: 'never',
    legacy: false,
  },
  {
    path: 'runs/',
    what: 'State directories for active and completed runs',
    writer: 'aether-plan',
    lasts: 'until cleaned',
    git: 'never',
    legacy: false,
  },
  {
    path: 'worktrees/',
    what: 'Unit worktrees for run tasks (<run>/<task>)',
    writer: 'aether-wt',
    lasts: 'until the run ends',
    git: 'never',
    legacy: false,
  },
  {
    path: 'worktrees/lanes/',
    what: 'Disposable worktrees for read-only lane calls (<run>/<call>)',
    writer: 'aether-lane',
    lasts: 'until the call ends',
    git: 'never',
    legacy: false,
  },
  {
    path: 'worktrees/exams/',
    what: 'Disposable worktrees where acceptance exams run (<feature>-<id>)',
    writer: 'aether-exam',
    lasts: 'until the exam ends',
    git: 'never',
    legacy: false,
  },
  {
    path: 'work/seats/',
    what: 'Work and worktrees for design seat rounds (<id>/)',
    writer: 'aether-lane',
    lasts: '7 days',
    git: 'never',
    legacy: false,
  },
  {
    path: 'work/delegates/',
    what: 'Work and worktrees for external harness delegates (<id>/)',
    writer: 'aether-delegate',
    lasts: '7 days',
    git: 'never',
    legacy: false,
  },
  {
    path: 'tmp/',
    what: 'Temporary task briefs, packages and seat messages',
    writer: 'aether-plan, aether-wt, aether-lane',
    lasts: '24 hours',
    git: 'never',
    legacy: false,
  },
  {
    path: 'exam/',
    what: 'Hidden acceptance exam while written by Examiner',
    writer: 'Examiner',
    lasts: 'until the run ends',
    git: 'never',
    legacy: false,
  },
  {
    path: 'lanes/',
    what: 'Legacy read-only lane worktrees (migrated to worktrees/lanes/)',
    writer: 'legacy',
    lasts: 'migrated on startup',
    git: 'never',
    legacy: true,
  },
  {
    path: 'exams/',
    what: 'Legacy exam worktrees (migrated to worktrees/exams/)',
    writer: 'legacy',
    lasts: 'migrated on startup',
    git: 'never',
    legacy: true,
  },
  {
    path: 'seats/',
    what: 'Legacy design seat work (migrated to work/seats/)',
    writer: 'legacy',
    lasts: 'migrated on startup',
    git: 'never',
    legacy: true,
  },
  {
    path: 'delegates/',
    what: 'Legacy delegate work (migrated to work/delegates/)',
    writer: 'legacy',
    lasts: 'migrated on startup',
    git: 'never',
    legacy: true,
  },
]

const LAYOUT_NAMES = new Set([
  'README.md',
  'autonomy',
  'broken-runs',
  'pending.jsonl',
  'runs',
  'worktrees',
  'work',
  'tmp',
  'exam',
  'lanes',
  'exams',
  'seats',
  'delegates',
])

function readmeText() {
  const lines = [
    '# Local Aether State Directory (`.aether/`)',
    '',
    'This directory stores local, ephemeral runtime state for Aether. Everything inside is kept outside Git (never committed) and is completely distinct from project or user configuration in `.claude/`.',
    '',
    '| Path | What it holds | Writer | Duration | In Git |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const entry of LAYOUT) {
    lines.push(`| \`${entry.path}\` | ${entry.what} | ${entry.writer} | ${entry.lasts} | ${entry.git} |`)
  }
  lines.push('')
  lines.push('Legacy files and directories are migrated automatically to their new locations without deleting anything when no Aether session appears active.')
  lines.push('')
  return lines.join('\n')
}

function ensureReadme(mainRoot) {
  try {
    if (!mainRoot || typeof mainRoot !== 'string') return false
    const aetherDir = path.join(mainRoot, '.aether')
    const readmeFile = path.join(aetherDir, 'README.md')
    const content = readmeText()
    try {
      if (fs.existsSync(readmeFile)) {
        const existing = fs.readFileSync(readmeFile, 'utf8')
        if (existing === content) return false
      }
    } catch {}
    writeAtomic(readmeFile, content)
    return true
  } catch {
    return false
  }
}

module.exports = {
  LAYOUT,
  LAYOUT_NAMES,
  ensureReadme,
  readmeText,
}
