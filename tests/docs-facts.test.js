'use strict'

// Spec 004 (R6, R10, R11, R12): the facts of the README and of the 35 pages of docs/ that a machine can hold to the tree.
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
//     (the retired decider command)  named as history by docs/changelog.md; the key is built from parts in EXCEPTIONS
//   Paths that do not exist (PATH_EXCEPTIONS):
//     scripts/aether-install.js  the 0.6 installer, named as retired in "Upgrading from 0.6"
//     scripts/lane-cupo.js       the script that measured a harness's parallel limit, removed with the limit (decision A74);
//                                the changelog keeps the words of the release that shipped it
//     plugins/aether/config/router/criterion.json  the decider's criterion, removed in spec 013; the changelog keeps the
//                                words of the release that shipped it
//   Links to a file that no longer exists (LINK_EXCEPTIONS, read by the test of R10):
//     docs/changelog.md -> guide/router.md  the changelog is a record and links the guide as it was when each version
//                                came out; the page became guide/delegates.md in spec 013. The test skips, in that file, a
//                                link whose file is on the list, with or without an anchor, and no other link
//   Plugin names that are no agent, skill or workflow (AETHER_NAME skips them):
//     custom:aether:<theme>      the value of the `theme` setting that selects a theme the plugin ships, which Claude
//                                Code forms as custom:<plugin name>:<file name>; the launcher passes it
//   Retired plugin names that a record keeps (RETIRED_NAMES, read by the test of R11 on plugin names):
//     aether:first-setup         the skill of 0.12.4 to 0.29.0, renamed setup in 0.30.0 (spec 024); docs/changelog.md
//                                and docs/roadmap.md keep its name in the words of the releases that shipped it
//     aether:onboard             the skill of 0.12.7 to 0.34.0, retired in 0.35.0; docs/changelog.md and docs/decisions.md
//                                keep its name in the words of the version that published it
//
// One word is not a count: the article in "the commands of `bin/`", which docs/reference/components.md writes in the list
// of what the 0.7.0 measurement found, and whose number it does not repeat there (the measurement counted eight, bin/ has
// nine). Any other word before "commands of `bin/`" is read as a count, and an unknown one fails.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// No helper here, so the env-proxy scrub is required directly: a check below runs a bin in a node child that
// must not inherit the switch (issue #254).
require('./env-proxy.js')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
const README = 'README.md'
const PAGES = [
  'docs/index.md', 'docs/getting-started.md', 'docs/purpose.md', 'docs/methodology.md', 'docs/guide/options.md',
  'docs/guide/lanes.md', 'docs/guide/design-seats.md', 'docs/guide/autonomy.md', 'docs/guide/ops.md',
  'docs/guide/maintenance.md', 'docs/guide/troubleshooting.md', 'docs/guide/delegates.md', 'docs/guide/audit.md', 'docs/guide/project-files-and-skills.md', 'docs/reference/components.md', 'docs/changelog.md',
  'docs/contributing.md', 'docs/roadmap.md',
  'docs/what-aether-adds.md', 'docs/tutorials/install-and-start.md', 'docs/tutorials/first-request.md', 'docs/tutorials/whole-feature.md',
  'docs/tutorials/read-the-brief.md', 'docs/tutorials/work-for-hours.md', 'docs/tutorials/other-harnesses.md', 'docs/tutorials/see-the-spend.md',
  'docs/tutorials/update-and-uninstall.md', 'docs/es/index.md', 'docs/es/que-agrega-aether.md', 'docs/es/guias/auditar-un-proyecto.md', 'docs/es/guias/instalar-y-arrancar.md',
  'docs/es/guias/primera-peticion.md', 'docs/es/guias/feature-completa.md', 'docs/es/guias/leer-el-brief.md', 'docs/es/guias/trabajar-horas.md',
  'docs/es/guias/otros-harnesses.md', 'docs/es/guias/ver-el-gasto.md', 'docs/es/guias/actualizar-y-desinstalar.md', 'docs/es/guias/archivos-skills-y-continuidad.md',
]
const FILES = [README, ...PAGES]
const EXCEPTIONS = {          // commands that are not files of plugins/aether/bin/, each with its reason
  'aether-lead': 'the launcher lives in plugins/aether/launcher/, not in plugins/aether/bin/',
  'aether-plugin': "the marketplace's and the repository's name",
  'aether-aether-plugin': "the plugin's data directory",
  'aether-inline': 'the data directory of a --plugin-dir session',
  'aether-mode': 'the 0.6 launcher, named as retired',
  ['aether-' + 'route']: 'the retired decider command, named as history by docs/changelog.md',
}
const PATH_EXCEPTIONS = {
  'scripts/aether-install.js': 'the 0.6 installer, named as retired in "Upgrading from 0.6"',
  'scripts/lane-cupo.js': 'the parallel-limit script, removed in decision A74; the changelog keeps the words of its release',
  'plugins/aether/config/router/criterion.json': "the decider's criterion, removed in spec 013; the changelog keeps the words of the release that shipped it",
}
// Links of a file to a file that no longer exists, each with its reason (see the header): the records link the guide of
// the router as it was when each version came out, and the page is now guide/delegates.md.
const LINK_EXCEPTIONS = { 'docs/changelog.md': ['guide/router.md'] }
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
// A retired name, and the records that may keep it (see the header).
const RETIRED_NAMES = { 'first-setup': ['docs/changelog.md', 'docs/roadmap.md'], onboard: ['docs/changelog.md', 'docs/decisions.md'] }

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
      if ((LINK_EXCEPTIONS[rel] ?? []).includes(file)) continue
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
    'docs/claude-code-research.md', 'docs/decisions.md',
    'docs/aether-retrospective.md', 'docs/models/README.md',
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

test('R11: aether-first-setup and aether-doctor are executable files of bin/, the launcher is a file outside it, and the pages name the skills', () => {
  for (const bin of ['aether-first-setup', 'aether-doctor']) {
    assert.ok(bins().has(bin) && fs.statSync(path.join(PLUGIN, 'bin', bin)).mode & 0o111, `${bin} is an executable file of bin/`)
  }
  assert.ok(!bins().has('aether-lead'), 'the launcher is not a command of bin/')
  assert.ok(fs.statSync(path.join(PLUGIN, 'launcher', 'aether-lead')).mode & 0o111, 'the launcher is an executable file of launcher/')
  // Spec 024: the skill first-setup became setup; doctor and help are new.
  for (const skill of ['setup', 'doctor', 'help']) {
    assert.ok(fs.statSync(path.join(PLUGIN, 'skills', skill, 'SKILL.md')).isFile(), `the skill ${skill} exists`)
  }
  assert.ok(!fs.existsSync(path.join(PLUGIN, 'skills', 'first-setup')), 'the skill first-setup is gone')
  for (const rel of [README, 'docs/getting-started.md', 'docs/guide/troubleshooting.md']) {
    assert.ok(codeSpans(read(rel)).some((span) => span.trim() === '/aether:setup'), `${rel} names \`/aether:setup\``)
  }
  for (const rel of ['docs/getting-started.md', 'docs/guide/troubleshooting.md']) {
    assert.ok(codeSpans(read(rel)).some((span) => span.trim() === '/aether:doctor'), `${rel} names \`/aether:doctor\``)
  }
  for (const rel of ['docs/getting-started.md', 'docs/reference/components.md']) {
    assert.ok(commandsIn(read(rel)).includes('aether-first-setup'), `${rel} names \`aether-first-setup\``)
  }
  assert.ok(commandsIn(read('docs/reference/components.md')).includes('aether-doctor'), 'docs/reference/components.md names `aether-doctor`')
  const components = read('docs/reference/components.md')
  for (const text of ['`plugins/aether/launcher/aether-lead`', '`setup` skill', '`doctor` skill', '`help` skill', 'fifteen commands of `bin/`']) {
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
    for (const name of pluginNamesIn(read(rel))) {
      if ((RETIRED_NAMES[name] || []).includes(rel)) continue
      assert.ok(known.has(name), `${rel} names aether:${name}, which is no agent, skill or workflow`)
    }
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

const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15 }

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
      assert.equal(Number(m[1]), last,`${rel} says A1-A${m[1]}, and the last decision is A${last}`)
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
  // Spec 024 (R17): the four steps of Quick start come right after the Version line, before RADAR.
  const quick = at(/^## Quick start$/, '## Quick start')
  const order = [
    title,
    hero,
    version,
    quick,
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
  assert.ok(lines.slice(version + 1, quick).every((line) => !/\S/.test(line)), 'Quick start comes right after the Version line')
  const steps = section('## Quick start')
  for (const need of [
    'claude plugin install aether --marketplace DarkArty07/aether-plugin && claude "/aether:setup"',
    'close the terminal',
    '`aeth`',
    'Tell the Lead what you want',
  ]) {
    assert.ok(steps.includes(need), `Quick start has "${need}"`)
  }
  assert.equal(steps.split('\n').filter((line) => /^\d+\. /.test(line)).length, 4, 'Quick start has four numbered steps')
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

test('R15: the decisions A50 to A121 are recorded in docs/decisions.md with the owner\'s words where the card had them', () => {
  const decisions = read('docs/decisions.md')
  const LAST_DECISION = 121
  for (let n = 50; n <= LAST_DECISION; n++) assert.match(decisions, new RegExp(`^\\| A${n} \\|`, 'm'), `A${n}`)
  const line = (n) => decisions.split('\n').find((row) => row.startsWith(`| A${n} |`))
  assert.ok(/Muse Code/.test(line(64)) && /fifth lane harness/.test(line(64)))
  assert.ok(/superdelegation/i.test(line(65)))
  assert.ok(/router/i.test(line(66)) && /Muse/.test(line(66)))
  assert.ok(/refused at its start/.test(line(67)) && /next ranked candidate/.test(line(67)))
  assert.ok(/ran out of time/.test(line(68)) && /internal error/.test(line(68)))
  assert.ok(/`argon`/.test(line(69)) && /`flash`/.test(line(69)))
  assert.ok(/Muse/.test(line(70)) && /next pair/.test(line(70)))
  assert.ok(/next pair/.test(line(71)) && /final review/.test(line(71)))
  assert.ok(/aether-lane delegate/.test(line(72)) && /edits files/.test(line(72)))
  assert.ok(/quota brake/.test(line(73)) && /five-hour/.test(line(73)))
  assert.ok(/parallel calls/.test(line(74)) && /cupo/.test(line(74)))
  assert.ok(/hint/.test(line(75)) && /every hour/.test(line(75)))
  assert.ok(/spend of a whole session/.test(line(76)) && /list price/.test(line(76)))
  assert.ok(/not merged until its tests pass/.test(line(77)) && /unverified/.test(line(77)))
  assert.ok(/once per run/.test(line(78)) && /deferred/.test(line(78)))
  assert.ok(/splits the brief by owned file/.test(line(79)))
  assert.ok(/order of reserve/.test(line(80)) && /scarce seat/.test(line(80)))
  assert.ok(/edits only what the Judge flagged/.test(line(81)))
  assert.ok(/continues from the work the failed one left/.test(line(82)))
  assert.ok(/swarms at once are not limited/.test(line(83)))
  assert.ok(/dollars of Grok/.test(line(84)))
  assert.ok(/starts on Haiku/.test(line(85)) && /the system holds/.test(line(85)))
  assert.ok(/heartbeat/.test(line(86)) && /600 s/.test(line(86)))
  assert.ok(/two installations/.test(line(88)) && /never reads a conversation/.test(line(88)))
  assert.ok(/marker check/.test(line(89)) && /not Aether's/.test(line(89)))
  assert.ok(/corrections to the Lead/.test(line(90)) && /development installation/.test(line(90)))
  assert.ok(/never changes the plugin by itself/.test(line(91)) && /only proposes/.test(line(91)))
  assert.ok(/parameter of the installed plugin/.test(line(92)) && /observedev/.test(line(92)))
  assert.ok(/cheapest model and effort/.test(line(93)) && /Terminal-Bench/.test(line(93)) && /A87/.test(line(93)))
  assert.ok(/Muse Spark 1.3/.test(line(94)) && /fixes #101/.test(line(94)))
  assert.ok(/roles its list names/.test(line(95)) && /extends A65/.test(line(95)))
  assert.ok(/minimal real call/.test(line(96)) && /muse-wonder-1\.0/.test(line(96)) && /fixes #108/.test(line(96)))
  assert.ok(/one ladder/i.test(line(97)) && /Haiku/.test(line(97)) && /#102/.test(line(97)))
  assert.ok(/autoissue/.test(line(98)) && /development installation/.test(line(98)) && /issue of each failure/.test(line(98)))
  assert.ok(/four steps/.test(line(103)) && /\/aether:setup/.test(line(103)) && /Sonnet or Haiku/.test(line(103)))
  assert.ok(/aether:audit/.test(line(105)) && /spec 026/.test(line(105)) && /issue 148/.test(line(105)))
  assert.ok(/whole/.test(line(104)) && /parts/.test(line(104)) && /Opus/.test(line(104)) && /issues 139/.test(line(104)) && /every prompt/.test(line(104)))
  assert.ok(/own words/.test(line(99)) && /Sonnet or Opus/.test(line(99)) && /every delegate still starts on Haiku/.test(line(99)))
  assert.ok(/decisive words/.test(line(109)) && /version, the date and the source/.test(line(109)) && /issue #50/.test(line(109)))
  assert.ok(/still writing/.test(line(110)) && /native agent/.test(line(110)) && /exam-carry/.test(line(110)) && /issue #103/.test(line(110)))
  assert.ok(/continuity note/.test(line(111)) && /memory\/continuity\//.test(line(111)) && /outside the index/.test(line(111)) && /its own hook entries/.test(line(111)) && /200 ms/.test(line(111)) && /contuidad/.test(line(111)))
  assert.ok(/\.aether\/README\.md/.test(line(112)) && /worktrees\/lanes/.test(line(112)) && /work\/seats/.test(line(112)) && /three conditions/.test(line(112)) && /git worktree move/.test(line(112)) && /per project/.test(line(112)) && /issue #186/.test(line(112)))
  assert.ok(/four kinds/.test(line(113)) && /\.agents\/skills\//.test(line(113)) && /trusted authors/.test(line(113)) && /starts empty/.test(line(113)) && /skill-install/.test(line(113)) && /aether-autonomy trust/.test(line(113)) && /skills\.sh/.test(line(113)))
  assert.ok(/AETHER-SKILLS:/.test(line(114)) && /Skills:/.test(line(114)) && /aether-plan compile/.test(line(114)) && /at most 3/.test(line(114)) && /uses\.jsonl/.test(line(114)))
  assert.ok(/PermissionRequest/.test(line(115)) && /skills\/ and rules\//.test(line(115)) && /settings\.json/.test(line(115)) && /never/.test(line(115)) && /PreToolUse/.test(line(115)))
  assert.ok(/aether:tidy/.test(line(116)) && /`delete`/.test(line(116)) && /\/aether:onboard/.test(line(116)) && /retired/.test(line(116)) && /the automatic note/.test(line(116)))
  for (const n of [18, 36, 87]) assert.ok(/Update \(A93\)/.test(line(n)), `A${n} has its update note`)
  const a50 = decisions.split('\n').find((line) => line.startsWith('| A50 |'))
  assert.ok(a50.includes('specs/005-aether-design/spec.md') && a50.includes('Workflow tool'))
  const changelogVersions = read('docs/changelog.md').split('\n').filter((line) => /^Version \d+\.\d+\.\d+: /.test(line))
  assert.ok(changelogVersions[0].startsWith('Version 0.40.0: ') && changelogVersions[0].includes('issues 238, 241, 243, 253 and 254') && changelogVersions[0].includes('spec 034'), changelogVersions[0])
  assert.ok(changelogVersions[1].startsWith('Version 0.39.3: ') && changelogVersions[1].includes('issues 247, 248, 249, 250, 251 and 252'), changelogVersions[1])
  assert.ok(changelogVersions[2].startsWith('Version 0.39.2: ') && changelogVersions[2].includes('issues 237, 239, 227, 208, 188 and 229'), changelogVersions[2])
  assert.ok(changelogVersions[3].startsWith('Version 0.39.1: ') && changelogVersions[3].includes('issue 240'), changelogVersions[3])
  const allVersions = changelogVersions.slice(3)
  assert.ok(allVersions[1].startsWith('Version 0.39.0: ') && allVersions[1].includes('issues 185, 189, 198 and 233') && allVersions[1].includes('A123'), allVersions[1])
  assert.ok(allVersions[2].startsWith('Version 0.38.0: ') && allVersions[2].includes('issues 184, 187, 188') && allVersions[2].includes('A122'), allVersions[2])
  assert.ok(allVersions[3].startsWith('Version 0.37.0: ') && allVersions[3].includes('issues 194 and 233') && allVersions[3].includes('A121') && allVersions[3].includes('Pareto'), allVersions[3])
  assert.ok(allVersions[4].startsWith('Version 0.36.0: ') && allVersions[4].includes('issues 192, 199, 200, 204, 214 and 217') && allVersions[4].includes('A117') && allVersions[4].includes('A120'), allVersions[4])
  assert.ok(allVersions[5].startsWith('Version 0.35.0: ') && allVersions[5].includes('issues 125 and 186') && allVersions[5].includes('A111') && allVersions[5].includes('A116'), allVersions[5])
  assert.ok(allVersions[6].startsWith('Version 0.34.0: ') && allVersions[6].includes('issues 103 and 50') && allVersions[6].includes('A110'), allVersions[6])
  assert.ok(allVersions[7].startsWith('Version 0.33.0: ') && allVersions[7].includes('issue 182') && allVersions[7].includes('A108'), allVersions[7])
  assert.ok(allVersions[8].startsWith('Version 0.32.1: ') && allVersions[8].includes('issues 152') && allVersions[8].includes('A107'), allVersions[8])
  assert.ok(allVersions[9].startsWith('Version 0.32.0: ') && allVersions[9].includes('issues 141') && allVersions[9].includes('A106'), allVersions[9])
  assert.ok(allVersions[10].startsWith('Version 0.31.2: ') && allVersions[10].includes('issues 153') && allVersions[10].includes('177'), allVersions[10])
  assert.ok(allVersions[11].startsWith('Version 0.31.1: ') && allVersions[11].includes('issues 119') && allVersions[11].includes('150'), allVersions[11])
  assert.ok(allVersions[12].startsWith('Version 0.31.0: ') && allVersions[12].includes('A105'), allVersions[12])
  assert.ok(allVersions[13].startsWith('Version 0.30.3: ') && allVersions[13].includes('automatic observation'), allVersions[13])
  assert.ok(allVersions[14].startsWith('Version 0.30.2: ') && allVersions[14].includes('issue 145'), allVersions[14])
  const versions = allVersions.slice(15)
  assert.ok(versions[0].startsWith('Version 0.30.1: ') && versions[0].includes('A104') && versions[0].includes('spec 025'), versions[0])
  assert.ok(versions[1].startsWith('Version 0.30.0: ') && versions[1].includes('A103'), versions[1])
  assert.ok(versions[2].startsWith('Version 0.29.0: ') && versions[2].includes('A102'), versions[2])
  assert.ok(versions[3].startsWith('Version 0.28.0: ') && versions[3].includes('A101'), versions[3])
  assert.ok(versions[4].startsWith('Version 0.27.0: ') && versions[4].includes('A100'), versions[4])
  assert.ok(versions[5].startsWith('Version 0.26.0: ') && versions[5].includes('A99'), versions[5])
  assert.ok(versions[6].startsWith('Version 0.25.1: ') && versions[6].includes('issue 118'), versions[6])
  assert.ok(versions[7].startsWith('Version 0.25.0: ') && versions[7].includes('A98'), versions[7])
  assert.ok(versions[8].startsWith('Version 0.24.3: ') && versions[8].includes('81 and 93'), versions[8])
  assert.ok(versions[9].startsWith('Version 0.24.2: ') && versions[9].includes('80, 81, 91, 92, 93, 98 and 99'), versions[9])
  assert.ok(versions[10].startsWith('Version 0.24.1: ') && versions[10].includes('104 to 117'), versions[10])
  assert.ok(versions[11].startsWith('Version 0.24.0: ') && versions[11].includes('A97'), versions[11])
  assert.ok(versions[12].startsWith('Version 0.23.0: ') && versions[12].includes('A96'), versions[12])
  assert.ok(versions[13].startsWith('Version 0.22.0: ') && versions[13].includes('A95'), versions[13])
  assert.ok(versions[14].startsWith('Version 0.21.0: ') && versions[14].includes('A93'), versions[14])
  assert.ok(versions[15].startsWith('Version 0.20.1: ') && versions[15].includes('A92'), versions[15])
  assert.ok(versions[16].startsWith('Version 0.20.0: '), versions[16])
  assert.ok(versions[17].startsWith('Version 0.19.2: ') && versions[17].includes('issues/86'), versions[17])
  assert.ok(versions[18].startsWith('Version 0.19.1: ') && versions[18].includes('issues/82'), versions[18])
  assert.ok(versions[19].startsWith('Version 0.19.0: '), versions[19])
})

test('the changelog says that /aether:onboard was retired and why, and keeps the history of the release before (R10, C4)', () => {
  const changelog = read('docs/changelog.md')
  const first = changelog.split('\n').filter((line) => /^Version \d+\.\d+\.\d+: /.test(line))
  assert.ok(first[8].startsWith('Version 0.35.0: ') && first[9].startsWith('Version 0.34.0: '))
  const entry = changelog.slice(changelog.indexOf('Version 0.35.0: '), changelog.indexOf('Version 0.34.0: '))
  assert.ok(entry.includes('`/aether:onboard`') && /retired/.test(entry) && /the automatic note/.test(entry) && /ask the Lead/.test(entry))
  for (const word of ['skill-install', 'aether-continuity', 'aether:tidy', '.aether/README.md']) assert.ok(entry.includes(word), word)
})

// ---- R21: the retired profiles and variables
// docs/decisions.md is history and is not in FILES' scope here only through its table, which names what was retired;
// it is not listed in PAGES for this rule's purposes beyond HISTORY below.
const GONE = [/`balanced`/, /`robust`/, /\bseats option\b/, /`seats`/, /--seats\b/, new RegExp(['AETHER_', 'SEATS'].join('')), new RegExp(['AETHER_', 'LANES\\b'].join(''))]
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

test('R16: no page gives aether-exam a list verb', () => {
  const row = read('docs/reference/components.md').split('\n').find((line) => line.startsWith('| `aether-exam` |'))
  assert.ok(row, 'components.md has the aether-exam row')
  assert.match(row, /`store`/)
  assert.match(row, /`run`/)
  assert.doesNotMatch(row, /`list`/)
  for (const file of FILES.filter((f) => f !== 'docs/changelog.md')) {
    assert.doesNotMatch(read(file), /aether-exam list/, file)
  }
})

test('R17: no page presents Tier or Ladder as a field of the plan, and the contributing example checks clean', (t) => {
  for (const page of ['docs/methodology.md', 'docs/getting-started.md', 'docs/contributing.md', 'docs/purpose.md', 'docs/roadmap.md', 'docs/guide/design-seats.md', 'docs/guide/troubleshooting.md', 'docs/guide/models-by-role.md']) {
    // Only the sentence that says a Tier line is ignored is exempt, not the whole line around it.
    const text = read(page).replace(/[^.\n]*\bTier\b[^.\n]*(?:ignorado|ignored)[^.\n]*\./g, '')
    assert.doesNotMatch(text, /\bTier\b/, `${page} names Tier`)
    assert.doesNotMatch(text, /- (Tier|Ladder):/, `${page} shows a Tier or Ladder line`)
  }
  const contributing = read('docs/contributing.md')
  const example = contributing.match(/```\n(# Tasks:[\s\S]*?)```/)
  const shown = contributing.match(/```\n(\{"ok":true[^\n]*)\n```/)
  assert.ok(example && shown, 'the page has the example and its output')
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aether-contrib-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'tasks.md'), example[1])
  const r = require('node:child_process').spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-plan'), 'check', path.join(dir, 'tasks.md')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), shown[1])
  assert.match(shown[1], /"warnings":\[\]\}$/)
})

test('R18: contributing.md tells apart npm test and npm run test:mod, and states the 0.x policy', () => {
  const text = read('docs/contributing.md')
  assert.match(text, /`npm test` runs the bins, the libraries, the workflow scenarios and the documentation facts; it does not run the mod\./)
  assert.match(text, /`npm run test:mod` runs `claude plugin test plugins\/aether`: the mod, with the usage meter, ops and delegation, on the test engine with a simulated model\./)
  assert.match(text, /While the major version is 0, a minor version \(`0\.Y\.0`\) may break compatibility, and the changelog says so explicitly\./)
})

test('R22: the Lead rules load and use EnterPlanMode and ExitPlanMode in an interactive session, never in claude -p, a subagent or an autonomous run', () => {
  const skill = read('plugins/aether/skills/using-aether/SKILL.md')
  const plans = skill.slice(skill.indexOf('## Plans'), skill.indexOf('## The execution method'))
  for (const word of ['ToolSearch', 'EnterPlanMode', 'ExitPlanMode', 'claude -p', 'subagent', 'autonomous run']) {
    assert.ok(plans.includes(word), `the Plans section names ${word}`)
  }
  assert.match(read('docs/guide/autonomy.md'), /plan mode/i)
  assert.match(read('docs/es/guias/feature-completa.md'), /modo plan/i)
  assert.match(read('docs/changelog.md'), /plan mode/i, 'the changelog says it')
})

test('A108: plan mode gates autonomous work, its plan carries the resources, and its approval is not a grant', () => {
  const skill = read('plugins/aether/skills/using-aether/SKILL.md')
  const plans = skill.slice(skill.indexOf('## Plans'), skill.indexOf('## The execution method'))
  assert.match(plans, /hazme un plan/, 'a plan asked for in any words means plan mode')
  assert.match(plans, /permission to work on their own \(«trabaja autónomamente», «trabaja por horas»\), whatever the size of the work, before the run opens/)
  assert.match(skill, /whatever the size of the work: even a task you would build directly opens a run/)
  assert.match(plans, /`aether:plan`/, 'plan mode is told apart from the Writer\'s skill')
  for (const part of ['Intención', 'Criterios', 'Recursos', 'Ruta', 'Supuestos', 'Qué esperará de ti', 'Costo y tiempo estimados']) {
    assert.ok(plans.includes(`**${part}**`), `the plan template has ${part}`)
  }
  assert.match(plans, /not a grant of any irreversible class/)
  assert.match(plans, /inside an autonomous run that has already started/)
  const runs = read('plugins/aether/skills/autonomous-runs/SKILL.md')
  const start = runs.slice(runs.indexOf('**Start:**'), runs.indexOf('**Permission prompts.**'))
  assert.ok(start.indexOf('plan mode') !== -1 && start.indexOf('plan mode') < start.indexOf('aether-autonomy start'), 'plan mode comes before the run opens')
  assert.match(start, /their answer to the plan dialog is not such a message/)
})

test('issue 50: small fixes quote the owner\'s words, and third-party facts carry their version, date and source', () => {
  const skill = read('plugins/aether/skills/using-aether/SKILL.md')
  const intent = skill.slice(skill.indexOf('## Understanding the intent'), skill.indexOf('## The route by size and risk'))
  const paths = skill.slice(skill.indexOf('## The three paths'), skill.indexOf('## The delegate ladder'))
  assert.match(intent, /third-party service or CLI behaves/, 'the intent section names third-party behavior')
  assert.match(intent, /the tool's version, the date and the source of that fact/, 'the fact carries version, date and source')
  assert.match(intent, /[Ww]hen the fact looks stale, tell the owner before building/, 'a stale fact goes to the owner first')
  assert.match(intent, /`paid-call`, made only when the owner asks/, 'a probe call is a paid-call the owner asks for')
  assert.match(paths, /\*\*The brief\*\*[^\n]*owner's decisive words, quoted as they wrote them/, 'the brief carries the owner\'s decisive words')
  assert.match(paths, /\*\*The brief\*\*[^\n]*asks the delegate to quote them in the issue or the `docs\/decisions\.md` entry/, 'the delegate quotes them in the issue or the decision entry')
  assert.match(paths, /\*\*Record it:\*\*[^\n]*quote the owner's decisive words in the issue or the decision entry/, 'a change you make yourself quotes them too')
  const contributing = read('docs/contributing.md')
  assert.match(contributing, /[Aa] decision or issue about a change to a documented concept quotes the owner's decisive words/, 'contributing.md has the owner-words rule')
  assert.match(contributing, /an issue about a third-party service gives the version, the date and the source/, 'contributing.md has the third-party rule')
})

test('the two tutorials state the canonical countable rule of the direct path instead of "about five tool calls" (R6)', () => {
  const enRule = 'at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count'
  const esRule = 'a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan'
  const en = read('docs/tutorials/first-request.md')
  const es = read('docs/es/guias/primera-peticion.md')
  assert.ok(en.includes(enRule))
  assert.ok(es.includes(esRule))
  assert.doesNotMatch(en, /about five tool calls/)
  assert.doesNotMatch(es, /unas cinco llamadas a herramientas/)
})

test('decisions A117 to A120 are recorded with the owner quotes, the index names the range, and the historical line stays intact (R12)', () => {
  const decisions = read('docs/decisions.md')
  const rowOf = (id) => decisions.split('\n').find((line) => line.startsWith(`| ${id} |`)) || ''
  for (const [id, quote] of [
    ['A117', 'catalgoar y ñistar comportamientos esperados por si alguno no se cumple por ingeneiria de prompts'],
    ['A118', 'vas a corregir como se comprota el lead autnoamente'],
    ['A119', 'vas a corregir como se comprota el lead autnoamente'],
    ['A120', 'le quiero dar higieien al comportamiento del lead a los prompts etc'],
  ]) {
    assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
    assert.ok(rowOf(id).includes(quote), `${id} quotes the owner: ${quote}`)
  }
  assert.match(decisions, /about five tool calls/)
  assert.match(read('docs/index.md'), /A1–A124/)
})

test('the canonical countable rule is identical across the six places of R6, AGENTS.md says three parts, and the components page measures PostToolUse on reads (R6, R8, R12)', () => {
  const enRule = 'at the third own edit to code or tests in a turn, or the tenth read in a turn, the work goes to a delegate task; the tests the rule asks to run after a merge do not count'
  const esRule = 'a la tercera edición propia de código o pruebas en un turno, o a la décima lectura en un turno, el trabajo pasa a una tarea delegada; las pruebas que la regla pide tras una fusión no cuentan'
  for (const file of ['plugins/aether/skills/using-aether/SKILL.md', 'docs/methodology.md', 'docs/tutorials/first-request.md', 'site/app.js']) {
    const text = read(file)
    assert.ok(text.includes(enRule), `${file} has the canonical English countable rule`)
    assert.doesNotMatch(text, /about five tool calls|many reads of your own/, `${file} has no old vague rule`)
  }
  for (const file of ['docs/es/guias/primera-peticion.md', 'site/index.html', 'site/app.js']) {
    const text = read(file)
    assert.ok(text.includes(esRule), `${file} has the canonical Spanish countable rule`)
    assert.doesNotMatch(text, /unas cinco llamadas a herramientas/, `${file} has no old vague rule`)
  }
  const delegates = read('docs/guide/delegates.md')
  assert.match(delegates, /`ended`/)
  assert.doesNotMatch(delegates, /is never a fork/)
  assert.match(delegates, /Do not use `fork` for a delegate task/)
  assert.doesNotMatch(delegates, /one effort up/)
  assert.doesNotMatch(delegates, /at the step's correction effort/)
  assert.ok(delegates.includes('`fix` rises the task one step'))
  assert.match(delegates, /prints three things as JSON/)
  assert.doesNotMatch(delegates, /prints two things|records the final answer of a read-only delegate that ran on Claude/)
  assert.doesNotMatch(read('docs/reference/components.md'), /records the final answer of a read-only delegate that ran on Claude/)
  const troubleshooting = read('docs/guide/troubleshooting.md')
  assert.doesNotMatch(troubleshooting, /The Lead runs `aether-autonomy status` before every launch/)
  assert.match(troubleshooting, /`aether-delegate begin`, `aether-plan compile` and `\/aether:design` check the open run themselves/)
  const claude = read('AGENTS.md')
  assert.match(claude, /`--part 1` to `--part 3`/)
  assert.doesNotMatch(claude, /--part 5/)
  assert.match(read('docs/reference/components.md'), /PostToolUse[^.\n]*Read[^.\n]*Grep[^.\n]*Glob/)
})

test('the changelog entry of 0.36.0 names the four behaviours, the two new skills and what a normal session pays (spec 031)', () => {
  const changelog = read('docs/changelog.md')
  const start = changelog.indexOf('Version 0.36.0: ')
  const end = changelog.indexOf('Version 0.35.0: ')
  assert.ok(start >= 0 && end > start)
  const entry = changelog.slice(start, end)
  for (const text of ['unverdicted', 'aether-delegate begin', 'ExitPlanMode', 'at the third own edit to code or tests in a turn, or the tenth read in a turn', 'aether:designing', 'aether:models', 'three part commands', 'aether-wt settle <run> <task>', 'Nothing breaks']) {
    assert.ok(entry.includes(text), text)
  }
})
