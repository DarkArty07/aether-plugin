'use strict'

// Spec 004 (R6, R10, R11, R12): the facts of the README and of the 15 pages of docs/ that a machine can hold to the tree.
//
// The rule of extraction. Every file is read the same way, and only prose counts: the lines of a fenced block (three or
// more backticks or tildes) and the text of an HTML comment are never read.
//   - A code span is the text between a pair of backticks on one line.
//   - A command is a code span that is `aether-<name>` alone, or followed by a space and its arguments, and has no `@`,
//     `/` or `--v` in it: a path, a marketplace, a tag and a version flag are not a command in position. Its name must be
//     a file of plugins/aether/bin/, or one of the exceptions below.
//   - A plugin name is each aether:<name> inside a code span (`aether:<name>` is a pattern, not a name). It must be an
//     agent of plugins/aether/agents/, a skill of plugins/aether/skills/ or a workflow of plugins/aether/workflows/. Prose outside a code span is not
//     read, so a sentence may name what it likes.
//   - A repository path is the first word of a code span that starts with plugins/, scripts/, tests/, docs/ or specs/ and
//     has no <, *, {, $ or [ (a pattern or a placeholder). It must exist, but for the exception below.
//   - A link is an inline [text](target) or ![alt](target) outside code. It must be relative, stay in the repository and
//     resolve, and its anchor must be one that GitHub gives a heading of the page it points to: lowercase, no
//     punctuation but - and _, spaces to hyphens, a repeated heading numbered -1, -2.
//   - A default repeated in a page is read only in the form of R6: `option`, on by default; `option`, off by default;
//     `option`, `value` by default. The one table of options, the one of docs/guide/options.md, is compared with the
//     userConfig of the manifest.
//
// The exceptions, each with its reason. A new one is for something that is not a defect, such as a retired name quoted
// as retired, and it is listed here with its reason.
//   Commands that are not files of plugins/aether/bin/ (EXCEPTIONS):
//     aether-lead           the launcher lives in plugins/aether/launcher/, outside bin/ so that it is not on the Bash
//                           tool's PATH (scripts/aether-lead forwards to it, and the stub of aether-first-setup runs it)
//     aether-plugin         the marketplace's and the repository's name
//     aether-aether-plugin  the plugin's data directory
//     aether-inline         the data directory of a --plugin-dir session
//     aether-mode           the 0.6 launcher, named as retired in "Upgrading from 0.6"
//   Paths that do not exist (PATH_EXCEPTIONS):
//     scripts/aether-install.js  the 0.6 installer, named as retired in "Upgrading from 0.6"
//   Plugin names that are no agent, skill or workflow (AETHER_NAME skips them):
//     custom:aether:<theme>      the value of the `theme` setting that selects a theme the plugin ships, which Claude
//                                Code forms as custom:<plugin name>:<file name>; the launcher passes it
//
// One word is not a count: the article in "the commands of `bin/`", which docs/reference/components.md writes in the list
// of what the 0.7.0 measurement found, and whose number it does not repeat there (the measurement counted eight, bin/ has
// nine). Any other word before "commands of `bin/`" is read as a count, and an unknown one fails.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
const README = 'README.md'
const PAGES = [
  'docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/guide/options.md',
  'docs/guide/lanes.md', 'docs/guide/design-seats.md', 'docs/guide/autonomy.md', 'docs/guide/ops.md',
  'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md', 'docs/guide/router.md', 'docs/reference/components.md', 'docs/changelog.md',
  'docs/contributing.md', 'docs/roadmap.md',
]
const FILES = [README, ...PAGES]
const EXCEPTIONS = {          // commands that are not files of plugins/aether/bin/, each with its reason
  'aether-lead': 'the launcher lives in plugins/aether/launcher/, not in plugins/aether/bin/',
  'aether-plugin': "the marketplace's and the repository's name",
  'aether-aether-plugin': "the plugin's data directory",
  'aether-inline': 'the data directory of a --plugin-dir session',
  'aether-mode': 'the 0.6 launcher, named as retired',
}
const PATH_EXCEPTIONS = { 'scripts/aether-install.js': 'the 0.6 installer, named as retired in "Upgrading from 0.6"' }
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const manifest = () => JSON.parse(read('plugins/aether/.claude-plugin/plugin.json'))

// ---- the extraction rule
// The text with what is not prose blanked and the line count kept: the lines of a fenced block, and the text of an HTML
// comment (which may run over several lines). A comment mark inside a code span is code, not a comment.
const proseLines = (text) => {
  let fence = null // the open fenced block: its character and its length
  let inComment = false
  return text.replace(/\r\n/g, '\n').split('\n').map((line) => {
    if (fence) {
      const close = line.match(/^\s*(`{3,}|~{3,})\s*$/)
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null
      return ''
    }
    const open = !inComment && line.match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { char: open[1][0], length: open[1].length }
      return ''
    }
    const spans = spansIn(line)
    const inSpan = (at) => spans.some((span) => at >= span.start && at < span.end)
    let prose = ''
    for (let at = 0; at < line.length; at++) {
      if (inComment) {
        if (line.startsWith('-->', at)) {
          inComment = false
          at += 2
        }
      } else if (line.startsWith('<!--', at) && !inSpan(at)) {
        inComment = true
        at += 3
      } else {
        prose += line[at]
      }
    }
    return prose
  })
}

// The code spans of one line, by CommonMark's rule: a run of n backticks is closed by the next run of exactly n, and a
// run with no closing run is plain text.
const spansIn = (line) => {
  const runs = [...line.matchAll(/`+/g)].map((run) => ({ start: run.index, size: run[0].length }))
  const spans = []
  for (let open = 0; open < runs.length; open++) {
    const close = runs.findIndex((run, index) => index > open && run.size === runs[open].size)
    if (close < 0) continue
    const [from, to] = [runs[open], runs[close]]
    spans.push({ start: from.start, end: to.start + to.size, content: line.slice(from.start + from.size, to.start) })
    open = close
  }
  return spans
}

// One row of a table as its trimmed cells, or null for a line that is not a row.
const cellsOf = (line) => {
  const row = line.trim()
  if (!row.startsWith('|')) return null
  return row.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim())
}

const parseFrontMatter = (text) => {
  const block = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!block) return null
  const keys = {}
  for (const line of block[1].split('\n')) {
    const pair = line.match(/^([A-Za-z][\w-]*):[ \t]+(.*)$/)
    if (!pair || Object.hasOwn(keys, pair[1])) return null
    keys[pair[1]] = pair[2].trim()
  }
  if (Object.keys(keys).sort().join() !== 'description,order,title') return null
  if (!keys.title || !keys.description || !/^-?\d+$/.test(keys.order)) return null
  return { title: keys.title, description: keys.description, order: Number(keys.order) }
}

// The lines inside fenced blocks, the complement of proseLines: the commands a new user copies, and the method's diagram.
const fencedLines = (text) => {
  let fence = null
  const out = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (fence) {
      const close = line.match(/^\s*(`{3,}|~{3,})\s*$/)
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null
      else out.push(line)
      continue
    }
    const open = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) fence = { char: open[1][0], length: open[1].length }
  }
  return out
}

const codeSpans = (text) => proseLines(text).flatMap((line) => spansIn(line).map((span) => span.content))

const commandsIn = (text) =>
  codeSpans(text)
    .map((span) => span.trim())
    .filter((span) => !/[@/]|--v/.test(span))
    .flatMap((span) => {
      const command = span.match(/^(aether-[a-z0-9-]+)( .*)?$/)
      return command ? [command[1]] : []
    })

// An aether:<name>, but not the one inside custom:aether:<theme>, which selects a theme (see the exceptions).
const AETHER_NAME = /(?<!custom:)\baether:([a-z][a-z0-9-]*)/g

const pluginNamesIn = (text) =>
  codeSpans(text).flatMap((span) => [...span.matchAll(AETHER_NAME)].map((name) => name[1]))

// GitHub's slug of a heading: link text kept, backticks gone, lowercase, only letters, marks, digits, - and _ stay, each
// space a hyphen. The text of a heading is not trimmed of inner spaces, so "A - B" is "a---b" there too.
const slugOf = (heading) =>
  heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_ -]/gu, '')
    .replace(/ /g, '-')

const anchorsIn = (text) => {
  const anchors = new Set()
  const repeats = new Map()
  for (const line of proseLines(text)) {
    const heading = line.match(/^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/)
    if (!heading || !heading[1]) continue
    const base = slugOf(heading[1])
    let slug = base
    while (repeats.has(slug)) {
      repeats.set(base, repeats.get(base) + 1)
      slug = `${base}-${repeats.get(base)}`
    }
    repeats.set(slug, 0)
    anchors.add(slug)
  }
  return anchors
}

// [text](target) with a title in quotes or parentheses after the target, or the target in angle brackets; the text may
// hold one level of brackets, and the target one level of parentheses.
const LINK = /!?\[(?:[^[\]]|\[[^\]]*\])*\]\(\s*(<[^<>]*>|(?:[^()\s]|\([^()\s]*\))*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g

const linksIn = (text) =>
  proseLines(text).flatMap((line, index) => {
    const bare = spansIn(line).reduceRight((rest, span) => rest.slice(0, span.start) + rest.slice(span.end), line)
    return [...bare.matchAll(LINK)]
      .map((link) => ({ target: link[1].replace(/^<|>$/g, ''), line: index + 1 }))
      .filter(({ target }) => !/^(https?:|mailto:)/i.test(target))
  })

const optionsTable = (text) => {
  const lines = proseLines(text)
  const header = lines.findIndex((line) => {
    const cells = cellsOf(line)
    return cells && /^option$/i.test(cells[0]) && /^default$/i.test(cells[1])
  })
  const options = {}
  if (header < 0) return options
  for (const line of lines.slice(header + 1)) {
    const cells = cellsOf(line)
    if (!cells) break
    const name = cells[0].match(/^`([^`]+)`$/)
    if (!name) continue
    const string = cells[1].match(/^`([^`]+)`$/)
    if (cells[1] === 'on') options[name[1]] = true
    else if (cells[1] === 'off') options[name[1]] = false
    else if (string) options[name[1]] = string[1]
  }
  return options
}

const repeatedDefaults = (text) => {
  const prose = proseLines(text).join('\n')
  return [...prose.matchAll(/`([^`\n]+)`,\s+(?:(on|off)|`([^`\n]+)`)\s+by\s+default\b/g)].map((found) => ({
    option: found[1],
    value: found[2] ? found[2] === 'on' : found[3],
    line: prose.slice(0, found.index).split('\n').length,
  }))
}

// ---- the rule, proved on small inputs
test('front matter: title, description and an integer order, and nothing else', () => {
  assert.deepEqual(parseFrontMatter('---\ntitle: A\ndescription: B, c\norder: 3\n---\n\n# A\n'), { title: 'A', description: 'B, c', order: 3 })
  assert.equal(parseFrontMatter('# A\n'), null)
  assert.equal(parseFrontMatter('---\ntitle: A\ndescription: B\n---\n'), null)
  assert.equal(parseFrontMatter('---\ntitle: A\ndescription: B\norder: x\n---\n'), null)
  assert.equal(parseFrontMatter('---\ntitle: A\ndescription: B\norder: 1\nlayout: x\n---\n'), null)
})

test('commands: an aether-* code span in position, alone or with arguments; not paths, marketplaces, tags or fences', () => {
  const text = [
    'Run `aether-plan check` and `aether-lane quota [<harness>...] [--refresh]`.',
    'Not these: `scripts/aether-lead`, `aether@aether-plugin`, `aether--v0.7.0`, `aether-lead --version`, `.aether-exam/`.',
    '```',
    '`aether-fenced`',
    '```',
    '<!-- `aether-hidden` -->',
  ].join('\n')
  assert.deepEqual(commandsIn(text), ['aether-plan', 'aether-lane'])
})

test('plugin names: aether:<name> inside a code span', () => {
  assert.deepEqual(pluginNamesIn('Use `aether:judge`, `/aether:run` and `claude --agent aether:lead --effort xhigh`; `aether:<name>` is a pattern; aether:prose is not read.'), ['judge', 'run', 'lead'])
  // The value of the theme setting names the plugin and a theme file, not an agent.
  assert.deepEqual(pluginNamesIn('`{"theme":"custom:aether:aether"}` and `aether:lead`'), ['lead'])
})

test('anchors follow GitHub: lowercase, no punctuation, spaces to hyphens, repeats numbered, fences skipped', () => {
  const text = '# Title\n\n## Update, pin, roll back and uninstall\n\n### `aether-lane` seat\n\n## Principles\n\n## Principles\n\n```\n## Not a heading\n```\n'
  assert.deepEqual([...anchorsIn(text)].sort(), ['aether-lane-seat', 'principles', 'principles-1', 'title', 'update-pin-roll-back-and-uninstall'])
})

test('links: inline links and images to files and anchors; not external links, code spans, comments or fences', () => {
  const text = 'See [a](guide/lanes.md#lanes), [b](#start), ![c](assets/x.gif), [d](https://example.com/x), [e](mailto:a@b.c) and `[f](nope.md)`.\n\n<!-- hero: ![g](assets/hero.gif) -->\n\n```\n[h](nope.md)\n```\n'
  assert.deepEqual(linksIn(text).map((link) => link.target), ['guide/lanes.md#lanes', '#start', 'assets/x.gif'])
})

test('options: the rows of the table headed Option and Default; on and off are booleans, a backticked value a string', () => {
  const table = ['| Option | Default | Set it | What it does |', '|---|---|---|---|', '| `lanes` | off | a | b |', '| `harnesses` | `agy` | a | b |', '| `ops` | on | a | b |', '', 'after the table'].join('\n')
  assert.deepEqual(optionsTable(table), { lanes: false, harnesses: 'agy', ops: true })
})

test('repeated defaults: only the form of R6, `option`, value by default', () => {
  const text = 'The `lanes`, off by default, and `harnesses`, `agy` by default; `ops`, on by default. Not `seats` by default. `seats`, `robust` by default.'
  assert.deepEqual(repeatedDefaults(text).map(({ option, value }) => [option, value]), [['lanes', false], ['harnesses', 'agy'], ['ops', true], ['seats', 'robust']])
})

// ---- the tree
const bins = () => new Set(fs.readdirSync(path.join(PLUGIN, 'bin')))
// The options the table lists: those whose title does not end in (legacy). A boolean with no default is off.
const defaults = () =>
  Object.fromEntries(
    Object.entries(manifest().userConfig)
      .filter(([, option]) => !/\(legacy\)$/.test(option.title))
      .map(([name, option]) => [name, option.default ?? (option.type === 'boolean' ? false : undefined)]),
  )

test('R3 to R9: every page exists and starts with title, description and an integer order', () => {
  for (const rel of PAGES) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} exists`)
    assert.ok(parseFrontMatter(read(rel)), `${rel} starts with title, description and an integer order, and no other key`)
  }
})

test('R10: every internal link of the README and the pages is relative and resolves, anchors included', () => {
  for (const rel of FILES) {
    for (const { target, line } of linksIn(read(rel))) {
      const where = `${rel}:${line} -> ${target}`
      assert.ok(!target.startsWith('/'), `${where} is not relative`)
      const [file, anchor] = target.split('#')
      const full = file ? path.resolve(ROOT, path.dirname(rel), decodeURI(file)) : path.resolve(ROOT, rel)
      assert.ok(full === ROOT || full.startsWith(ROOT + path.sep), `${where} leaves the repository`)
      assert.ok(fs.existsSync(full), `${where} does not resolve`)
      if (anchor) {
        assert.ok(full.endsWith('.md') && fs.statSync(full).isFile(), `${where}: an anchor needs a Markdown file`)
        assert.ok(anchorsIn(fs.readFileSync(full, 'utf8')).has(decodeURIComponent(anchor)), `${where}: no heading has that anchor`)
      }
    }
  }
})

test('C5: docs/index.md links every other page, and every document the README listed under Documentation', () => {
  const linked = new Set(
    linksIn(read('docs/index.md')).map(({ target }) => path.relative(ROOT, path.resolve(ROOT, 'docs', target.split('#')[0])).split(path.sep).join('/')),
  )
  for (const rel of PAGES) if (rel !== 'docs/index.md') assert.ok(linked.has(rel), `docs/index.md links ${rel}`)
  const listed = [
    'docs/roadmap/2026-10-10-radar.md', 'docs/superpowers/specs/2026-10-07-aether-plugin-design.md', 'docs/superpowers/specs',
    'docs/superpowers/plans', 'docs/evaluations', 'docs/claude-code-research.md', 'docs/decisions.md',
    'docs/evaluations/seats/README.md', 'docs/aether-retrospective.md', 'docs/models/README.md', 'docs/issues',
  ]
  for (const rel of listed) assert.ok(linked.has(rel), `docs/index.md links ${rel}`)
  assert.ok([...linked].some((rel) => rel.startsWith('specs/001-design-seats')), 'docs/index.md links specs/001-design-seats/')
})

test('R11: every aether-* command in position is a file of plugins/aether/bin/ or a listed exception', () => {
  for (const name of Object.keys(EXCEPTIONS)) assert.ok(!bins().has(name), `${name} is a bin, so it is not an exception`)
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'aether-lead')), 'scripts/aether-lead exists')
  for (const rel of FILES) {
    for (const name of commandsIn(read(rel))) {
      assert.ok(bins().has(name) || name in EXCEPTIONS, `${rel} names \`${name}\`, which is not in plugins/aether/bin/ and not an exception`)
    }
  }
})

test('R11: aether-first-setup is an executable file of bin/, the launcher is a file outside it, and the pages name the skill', () => {
  const setup = path.join(PLUGIN, 'bin', 'aether-first-setup')
  assert.ok(bins().has('aether-first-setup') && fs.statSync(setup).mode & 0o111, 'aether-first-setup is an executable file of bin/')
  assert.ok(!bins().has('aether-lead'), 'the launcher is not a command of bin/')
  assert.ok(fs.statSync(path.join(PLUGIN, 'launcher', 'aether-lead')).mode & 0o111, 'the launcher is an executable file of launcher/')
  assert.ok(fs.statSync(path.join(PLUGIN, 'skills', 'first-setup', 'SKILL.md')).isFile(), 'the skill first-setup exists')
  for (const rel of [README, 'docs/getting-started.md', 'docs/guide/troubleshooting.md']) {
    assert.ok(codeSpans(read(rel)).some((span) => span.trim() === '/aether:first-setup'), `${rel} names \`/aether:first-setup\``)
  }
  for (const rel of ['docs/getting-started.md', 'docs/reference/components.md']) {
    assert.ok(commandsIn(read(rel)).includes('aether-first-setup'), `${rel} names \`aether-first-setup\``)
  }
  const components = read('docs/reference/components.md')
  for (const text of ['`plugins/aether/launcher/aether-lead`', '`first-setup`', 'eleven commands of `bin/`']) {
    assert.ok(components.includes(text), `docs/reference/components.md has ${text}`)
  }
})

test('R11: every aether:<name> is an agent, a skill or a workflow', () => {
  const known = new Set([
    ...fs.readdirSync(path.join(PLUGIN, 'agents')).filter((file) => file.endsWith('.md')).map((file) => file.replace(/\.md$/, '')),
    ...fs.readdirSync(path.join(PLUGIN, 'skills')),
    ...fs.readdirSync(path.join(PLUGIN, 'workflows')).filter((file) => file.endsWith('.workflow.js')).map((file) => file.replace(/\.workflow\.js$/, '')),
  ])
  for (const rel of FILES) {
    for (const name of pluginNamesIn(read(rel))) assert.ok(known.has(name), `${rel} names aether:${name}, which is no agent, skill or workflow`)
  }
})

test("R11: the options table of docs/guide/options.md is the manifest's userConfig, option by option and default by default", () => {
  assert.deepEqual(optionsTable(read('docs/guide/options.md')), defaults())
})

test("R6: no page repeats, in the form of R6, a default that is not the manifest's", () => {
  let seen = 0
  for (const rel of FILES) {
    for (const { option, value, line } of repeatedDefaults(read(rel))) {
      if (!(option in defaults())) continue
      seen++
      assert.equal(value, defaults()[option], `${rel}:${line} gives ${JSON.stringify(value)} as the default of \`${option}\`; the manifest's is ${JSON.stringify(defaults()[option])}`)
    }
  }
  assert.ok(seen > 0, 'the pages repeat at least one default in the form of R6, so the rule reads something')
})

test("R11: the README's Version line and the changelog's first Version line are the manifest's", () => {
  const readme = read(README).match(/^Version (\d+\.\d+\.\d+)\b/m)
  assert.ok(readme, 'the README has a line that starts with Version X.Y.Z')
  assert.equal(readme[1], manifest().version, "the README's Version line")
  const changelog = read('docs/changelog.md').match(/^Version (\d+\.\d+\.\d+): /m)
  assert.ok(changelog, 'docs/changelog.md has a line that starts with Version X.Y.Z:')
  assert.equal(changelog[1], manifest().version, "the changelog's first Version line")
})

test('C3: the repository paths in code spans exist', () => {
  const roots = ['plugins/', 'scripts/', 'tests/', 'docs/', 'specs/']
  for (const rel of FILES) {
    for (const span of codeSpans(read(rel))) {
      const word = span.trim().split(/\s+/)[0].replace(/[.,;:)]+$/, '')
      if (!roots.some((root) => word.startsWith(root)) || /[<*{$[]/.test(word) || word in PATH_EXCEPTIONS) continue
      assert.ok(fs.existsSync(path.join(ROOT, word)), `${rel} names \`${word}\`, which does not exist`)
    }
  }
})

const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }

test('R12: the count of commands of bin/ that the pages give is the count of its files', () => {
  let seen = 0
  for (const rel of FILES) {
    for (const m of read(rel).matchAll(/\b(\w+) commands of `bin\/`/g)) {
      if (m[1].toLowerCase() === 'the') continue // "the commands of `bin/`" gives no count (see the header)
      seen++
      assert.equal(NUMBERS[m[1].toLowerCase()] ?? Number(m[1]), bins().size, `${rel} says ${m[1]} commands of bin/`)
    }
  }
  assert.ok(seen > 0, 'a page says how many commands bin/ has')
})

test('R12: the range of decisions the pages name runs to the last decision', () => {
  const last = Math.max(...[...read('docs/decisions.md').matchAll(/^\| A(\d+) \|/gm)].map((m) => Number(m[1])))
  let seen = 0
  for (const rel of FILES) {
    for (const m of read(rel).matchAll(/\bA1[–-]A(\d+)\b/g)) {
      seen++
      assert.equal(Number(m[1]), last, `${rel} says A1-A${m[1]}, and the last decision is A${last}`)
    }
  }
  assert.ok(seen > 0, 'a page names the range of decisions')
})

test("R12: the roadmap's Now line names the manifest's version", () => {
  const now = read('docs/roadmap.md').split('\n').find((line) => line.startsWith('**Now:**'))
  assert.ok(now, 'docs/roadmap.md has a line that starts with **Now:**')
  assert.ok(now.includes(`version ${manifest().version}`), `the Now line names version ${manifest().version}`)
})

test('R1: the README is the way in: at most 160 lines, and its parts in order', () => {
  const lines = read(README).split('\n')
  assert.ok(lines.length <= 160, `the README has ${lines.length} lines, and the most is 160`)
  const at = (pattern, what) => {
    const i = lines.findIndex((line) => pattern.test(line))
    assert.ok(i >= 0, `the README has ${what}`)
    return i
  }
  const title = at(/^# \S/, 'a title')
  const hero = at(/^<!-- hero: .* -->$/, 'the comment <!-- hero: ... --> for the mascot')
  const version = at(/^Version \d+\.\d+\.\d+\b.*\]\(docs\/changelog\.md\)/, 'a line "Version X.Y.Z" that links docs/changelog.md')
  assert.ok(hero < 10, 'the comment for the mascot is at the top')
  assert.ok(
    lines.slice(title + 1, version).some((line) => /\S/.test(line) && !line.startsWith('<!--')),
    'a paragraph that says what Aether is comes before the Version line',
  )
  const order = [
    title,
    hero,
    version,
    ...['Rápido', 'Autónomo', 'Delegación', 'Asequible', 'Robusto'].map((goal) => at(new RegExp(`^- \\*\\*${goal}\\*\\*`), `the goal ${goal}, on one line`)),
    at(/^## Requirements$/, '## Requirements'),
    at(/^## Install$/, '## Install'),
    at(/^## First start$/, '## First start'),
    at(/^## Where to go$/, '## Where to go'),
    at(/^## License$/, '## License'),
  ]
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the parts come in the order of R1')
  const section = (heading) => {
    const rest = lines.slice(lines.indexOf(heading) + 1)
    const end = rest.findIndex((line) => /^## /.test(line))
    return (end < 0 ? rest : rest.slice(0, end)).join('\n')
  }
  assert.ok(section('## Install').includes('claude plugin install aether --marketplace DarkArty07/aether-plugin'), 'Install has the command')
  const start = section('## First start')
  for (const need of ['claude --agent aether:lead --effort xhigh', 'scripts/aether-lead', '`claude`', 'normal mode', '.claude/settings.local.json']) {
    assert.ok(start.includes(need), `First start has "${need}"`)
  }
  const where = section('## Where to go')
  for (const target of ['docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/index.md']) {
    assert.ok(where.includes(`](${target})`), `Where to go links ${target}`)
  }
})

test('R1: the README holds no history by version, no trial and no upgrade guide', () => {
  const text = read(README)
  assert.equal(text.split('\n').filter((line) => /^Version \d/.test(line)).length, 1, 'one Version line, and no history by version')
  for (const gone of ['## Status', 'Trial 1', 'Trial 2', 'Trial 3', 'Wall clock', 'Upgrading from 0.6']) {
    assert.ok(!text.includes(gone), `the README no longer has "${gone}"`)
  }
})

test('R13: the retrospective links the principles in the purpose page, not in the README', () => {
  const text = read('docs/aether-retrospective.md')
  assert.ok(text.includes('(purpose.md#principles)'), 'the retrospective links purpose.md#principles')
  assert.ok(!text.includes('README.md#principles'), 'the retrospective no longer links README.md#principles')
})

test('R11: fenced blocks name known agents, skills and commands too', () => {
  const known = new Set([
    ...fs.readdirSync(path.join(PLUGIN, 'agents')).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3)),
    ...fs.readdirSync(path.join(PLUGIN, 'skills')),
    ...fs.readdirSync(path.join(PLUGIN, 'workflows')).filter((file) => file.endsWith('.workflow.js')).map((file) => file.replace(/\.workflow\.js$/, '')),
  ])
  let seen = 0
  for (const rel of FILES) {
    for (const line of fencedLines(read(rel))) {
      for (const name of line.matchAll(AETHER_NAME)) {
        seen++
        assert.ok(known.has(name[1]), `${rel}: aether:${name[1]} is not an agent, a skill or a workflow`)
      }
      const command = line.trim().match(/^(aether-[a-z0-9-]+)(?: |$)/)
      if (command) {
        seen++
        assert.ok(bins().has(command[1]) || command[1] in EXCEPTIONS, `${rel}: ${command[1]} is not a file of plugins/aether/bin/`)
      }
    }
  }
  assert.ok(seen > 0, 'the fenced blocks name at least one agent or command, so the check reads something')
})

test('R15: the components page names every skill and every workflow of the plugin', () => {
  const components = read('docs/reference/components.md')
  for (const skill of fs.readdirSync(path.join(PLUGIN, 'skills'))) {
    assert.ok(components.includes(`\`${skill}\``) || components.includes(`\`aether:${skill}\``), `components.md names the skill ${skill}`)
  }
  for (const file of fs.readdirSync(path.join(PLUGIN, 'workflows')).filter((name) => name.endsWith('.workflow.js'))) {
    assert.ok(components.includes(`\`/aether:${file.replace('.workflow.js', '')}\``), `components.md names /aether:${file}`)
  }
})

test('R15: the pages describe the design flow and the brakes', () => {
  for (const page of ['docs/getting-started.md', 'docs/methodology.md']) {
    for (const text of ['/aether:design', 'intent.md']) assert.ok(read(page).includes(text), `${page} names ${text}`)
  }
  for (const text of ['Complexity', 'NEEDS CLARIFICATION']) assert.ok(read('docs/methodology.md').includes(text), text)
})

test('R15: the decisions A50 to A70 are recorded and the changelog opens with 0.14.5 and its handoff', () => {
  const decisions = read('docs/decisions.md')
  const LAST_DECISION = 70
  for (let n = 50; n <= LAST_DECISION; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
  const line = (n) => decisions.split('\n').find((row) => row.startsWith(`| A${n} |`))
  assert.ok(/Muse Code/.test(line(64)) && /fifth lane harness/.test(line(64)))
  assert.ok(/superdelegation/i.test(line(65)))
  assert.ok(/router/i.test(line(66)) && /Muse/.test(line(66)))
  assert.ok(/refused at its start/.test(line(67)) && /next ranked candidate/.test(line(67)))
  assert.ok(/ran out of time/.test(line(68)) && /internal error/.test(line(68)))
  assert.ok(/`argon`/.test(line(69)) && /`flash`/.test(line(69)))
  assert.ok(/Muse/.test(line(70)) && /next pair/.test(line(70)))
  const a50 = decisions.split('\n').find((line) => line.startsWith('| A50 |'))
  assert.ok(a50.includes('specs/005-aether-design/spec.md') && a50.includes('Workflow tool'))
  const first = read('docs/changelog.md').split('\n').find((line) => /^Version \d+\.\d+\.\d+: /.test(line))
  assert.ok(first.startsWith('Version 0.14.5: ') && first.includes('handoff/2026-10-21-external-seats-0.14.5.md'), first)
})

// ---- R21: the retired profiles and variables
// docs/decisions.md is history and is not in FILES' scope here only through its table, which names what was retired;
// it is not listed in PAGES for this rule's purposes beyond HISTORY below.
const GONE = [/`balanced`/, /`robust`/, /\bseats option\b/, /`seats`/, /--seats\b/, /AETHER_SEATS/, /AETHER_LANES\b/]
const HISTORY = ['docs/changelog.md', 'docs/contributing.md', 'docs/roadmap.md'] // name what was retired as history (roadmap.md: the 0.12.3 summary says `seats` selectors)
const MIGRATION = ['docs/guide/lanes.md', 'docs/guide/options.md'] // the only two pages that may name the legacy keys `lanes` and `seats`: the migration says what becomes of them
const prose = (rel) => proseLines(read(rel)).join('\n')

test('R21: no page of the guide or the README names the retired profiles or the retired variables', () => {
  for (const rel of FILES.filter((p) => !HISTORY.includes(p))) {
    for (const pattern of GONE.filter((g) => !MIGRATION.includes(rel) || g.source !== '`seats`')) assert.doesNotMatch(prose(rel), pattern, `${rel} still says ${pattern}`)
  }
})

test('R21: every page that gives the default of superdelegation in the form of R6 gives off', () => {
  let seen = 0
  for (const rel of FILES) {
    for (const { option, value } of repeatedDefaults(read(rel))) {
      if (option !== 'superdelegation') continue
      seen++
      assert.equal(value, false, rel)
    }
  }
  assert.ok(seen > 0, 'a page repeats the default of superdelegation')
})
