'use strict'

// The landing page in site/ and the images of the README in assets/readme/: what a machine can hold them to.
//
// The site is static, vanilla and opens from file://, so every reference must be a relative path that resolves inside
// site/. The only absolute addresses are this repository (https://github.com/DarkArty07/...) and its Pages site
// (https://darkarty07.github.io/aether-plugin/...); the SVG namespace and data: URIs are not addresses to fetch.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SITE = path.join(ROOT, 'site')
const PAGES = ['index.html', '404.html']
const ALLOWED = ['https://github.com/DarkArty07/', 'https://darkarty07.github.io/aether-plugin/']
const MAX_BYTES = 3 * 1024 * 1024

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8')
const allowed = (url) => ALLOWED.some((prefix) => url === prefix.replace(/\/$/, '') || url.startsWith(prefix))
const inside = (file) => file === SITE || file.startsWith(SITE + path.sep)

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])

// The text of an HTML page without comments, and every attribute value that can hold an address.
const withoutComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '')
const attrs = (html, names) => [...withoutComments(html).matchAll(/<[a-zA-Z][^>]*>/g)].flatMap(([tag]) =>
  [...tag.matchAll(/\s([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)]
    .filter((match) => names.includes(match[1].toLowerCase()))
    .map((match) => ({ name: match[1].toLowerCase(), value: match[3] ?? match[4], tag })))
const cssUrls = (css) => [...css.matchAll(/url\(\s*(["']?)([^)"']*)\1\s*\)/g)].map((match) => match[2])
const styleBlocks = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1])

// The references of one page or stylesheet: [{ from, value, local }], the data: URIs and the bare anchors left out.
const refsOf = (rel) => {
  const text = read(SITE, rel)
  const base = path.dirname(path.join(SITE, rel))
  const values = rel.endsWith('.css')
    ? cssUrls(text)
    : [...attrs(text, ['src', 'href', 'poster', 'data-src']).map((a) => a.value), ...styleBlocks(text).flatMap(cssUrls)]
  return values
    .filter((value) => value && !value.startsWith('#') && !value.startsWith('data:') && !value.startsWith('mailto:'))
    .map((value) => ({ rel, value, absolute: /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//'), base }))
}
const ALL_REFS = [...PAGES, 'style.css'].flatMap(refsOf)

test('every local src, href and url() of the site resolves to a file inside site/', () => {
  const local = ALL_REFS.filter((ref) => !ref.absolute)
  assert.ok(local.length > 20, 'the pages and the stylesheet reference their assets')
  for (const ref of local) {
    assert.ok(!ref.value.startsWith('/'), `${ref.rel}: ${ref.value} is root-relative and breaks from file://`)
    const target = path.resolve(ref.base, ref.value.split(/[?#]/)[0])
    assert.ok(inside(target), `${ref.rel}: ${ref.value} leaves site/`)
    assert.ok(fs.existsSync(target) && fs.statSync(target).isFile(), `${ref.rel}: ${ref.value} does not exist`)
  }
})

test('the only absolute addresses are this repository and its Pages site', () => {
  for (const ref of ALL_REFS.filter((r) => r.absolute)) {
    assert.ok(allowed(ref.value), `${ref.rel}: ${ref.value} is an absolute address that is not the repository or its site`)
  }
  for (const page of PAGES) {
    const meta = attrs(read(SITE, page), ['content']).map((a) => a.value).filter((v) => /^https?:\/\//.test(v))
    for (const value of meta) assert.ok(allowed(value), `${page}: ${value} in a meta tag`)
  }
  const js = read(SITE, 'app.js')
  for (const [url] of js.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
    assert.ok(allowed(url) || url === 'http://www.w3.org/2000/svg', `app.js: ${url}`)
  }
  assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts)\b/, 'the page makes no network call')
})

test('the site references nothing outside itself', () => {
  for (const file of [...PAGES, 'style.css', 'app.js']) {
    assert.doesNotMatch(read(SITE, file), /(["'(=])\.\.\//, `${file} climbs out of its folder`)
  }
})

test('every image has a non-empty alt, and the page names its language', () => {
  for (const page of PAGES) {
    const html = withoutComments(read(SITE, page))
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
    if (page === 'index.html') assert.ok(images.length >= 10, 'index.html has its images')
    for (const tag of images) {
      const alt = tag.match(/\salt\s*=\s*"([^"]*)"/)
      assert.ok(alt && alt[1].trim(), `${page}: an image has no alt: ${tag.slice(0, 90)}`)
    }
    assert.match(html, /<html lang="es"/, `${page}: the default language is Spanish`)
  }
})

test('the three font licence texts sit next to the fonts, and every font is used', () => {
  const fonts = path.join(SITE, 'assets', 'fonts')
  for (const licence of ['barlow-condensed.txt', 'ibm-plex-mono.txt', 'space-grotesk.txt']) {
    const file = path.join(fonts, licence)
    assert.ok(fs.existsSync(file), `${licence} is missing`)
    assert.match(fs.readFileSync(file, 'utf8'), /licen[cs]e/i, `${licence} is not a licence text`)
  }
  const css = read(SITE, 'style.css')
  for (const font of fs.readdirSync(fonts).filter((name) => name.endsWith('.woff2'))) {
    assert.ok(css.includes(`assets/fonts/${font}`), `${font} is not used by style.css`)
  }
})

test('no file in site/ is over 3 MB, and the unused mascot is not shipped', () => {
  const files = walk(SITE)
  assert.ok(files.length > 20)
  for (const file of files) {
    assert.ok(fs.statSync(file).size <= MAX_BYTES, `${path.relative(ROOT, file)} is over 3 MB`)
  }
  const used = new Set(ALL_REFS.filter((r) => !r.absolute).map((r) => path.resolve(r.base, r.value.split(/[?#]/)[0])))
  const js = read(SITE, 'app.js')
  for (const file of files.filter((f) => /\.(png|gif|jpe?g|webp|svg)$/.test(f))) {
    const rel = path.relative(SITE, file).split(path.sep).join('/')
    assert.ok(used.has(file) || js.includes(rel) || rel === 'assets/img/social.png', `${rel} is not referenced by the site`)
  }
})

test('the page carries its title, description, social card, canonical address and favicon', () => {
  const html = read(SITE, 'index.html')
  const meta = (key, value) => attrs(html, ['content']).filter((a) => new RegExp(`\\s${key}="${value}"`).test(a.tag)).map((a) => a.value)
  assert.match(html, /<title>[^<]{10,}<\/title>/)
  assert.ok(meta('name', 'description')[0].length > 60)
  assert.equal(meta('property', 'og:image')[0], 'https://darkarty07.github.io/aether-plugin/assets/img/social.png')
  assert.equal(meta('property', 'og:url')[0], 'https://darkarty07.github.io/aether-plugin/')
  assert.equal(meta('name', 'twitter:card')[0], 'summary_large_image')
  assert.ok(meta('property', 'og:title')[0] && meta('property', 'og:description')[0])
  assert.ok(meta('name', 'twitter:image')[0].startsWith('https://darkarty07.github.io/aether-plugin/'))
  assert.match(html, /<link rel="canonical" href="https:\/\/darkarty07\.github\.io\/aether-plugin\/">/)
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/)
  assert.match(html, /<noscript><style>/, 'a noscript style keeps the content visible')
  assert.ok(fs.statSync(path.join(SITE, 'assets', 'img', 'social.png')).size > 10000)
  assert.deepEqual(fs.readFileSync(path.join(SITE, 'assets', 'img', 'social.png')),
    fs.readFileSync(path.join(ROOT, 'assets', 'readme', 'social.png')), 'the site and the README share one social card')
})

test('the language toggle keeps the lang attribute and the meta tags in step', () => {
  const js = read(SITE, 'app.js')
  assert.match(js, /html\.lang\s*=\s*S\.lang/)
  assert.match(js, /meta\[name="description"\]/)
  assert.match(js, /meta\[property="og:title"\]/)
})

test('the footer says in both languages that the project is independent of Anthropic', () => {
  const js = read(SITE, 'app.js')
  const es = 'Aether es un proyecto independiente; no está afiliado ni respaldado por Anthropic.'
  const en = 'Aether is an independent project; it is not affiliated with or endorsed by Anthropic.'
  assert.ok(js.includes(es) && js.includes(en))
  assert.ok(read(SITE, 'index.html').includes(es), 'the Spanish line is in the HTML, so it reads without JavaScript')
})

test('both languages of the site have the same keys, and the HTML holds the Spanish copy', () => {
  const js = read(SITE, 'app.js')
  const start = js.indexOf('var DICT = {')
  const end = js.indexOf('\n  };\n', start) + 5
  const DICT = new Function(`${js.slice(start, end)}; return DICT`)()
  assert.deepEqual(Object.keys(DICT.en).sort(), Object.keys(DICT.es).sort())
  const html = withoutComments(read(SITE, 'index.html'))
  for (const [, key] of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) {
    assert.equal(typeof DICT.es[key], 'string', `data-i18n key ${key} has no Spanish text`)
  }
  for (const [, tag, key, inner] of html.matchAll(/<(\w+)[^>]*\sdata-i18n-html="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    assert.equal(inner, DICT.es[key], `${key}: the HTML copy differs from the Spanish text in app.js`)
  }
})

test('404.html links home and opens in the same style', () => {
  const html = read(SITE, '404.html')
  assert.match(html, /<link rel="stylesheet" href="style\.css">/)
  assert.match(html, /<a[^>]*href="index\.html"/)
  assert.match(html, /<h1[^>]*>[^<]+<\/h1>/)
})

test('the README images exist in assets/readme/ and every image path of the README resolves', () => {
  const dir = path.join(ROOT, 'assets', 'readme')
  assert.deepEqual(fs.readdirSync(dir).sort(), ['banner.png', 'mascot.gif', 'radar.png', 'social.png'])
  const readme = read(ROOT, 'README.md')
  const paths = [
    ...[...readme.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]),
    ...[...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1]),
  ].filter((p) => !/^https?:\/\//.test(p))
  for (const name of ['banner.png', 'radar.png', 'mascot.gif']) {
    assert.ok(paths.includes(`assets/readme/${name}`), `the README names assets/readme/${name}`)
  }
  for (const p of paths) {
    const file = path.resolve(ROOT, p)
    assert.ok(file.startsWith(ROOT + path.sep) && fs.existsSync(file), `README: ${p} does not resolve`)
    assert.ok(fs.statSync(file).size <= MAX_BYTES, `README: ${p} is over 3 MB`)
  }
})

test('the workflow deploys only site/, with the permissions and the concurrency group Pages needs', () => {
  const yml = read(ROOT, '.github', 'workflows', 'pages.yml')
  assert.match(yml, /^\s*-\s*'site\/\*\*'/m)
  assert.match(yml, /actions\/upload-pages-artifact@v3/)
  assert.match(yml, /actions\/deploy-pages@v4/)
  assert.match(yml, /^\s*path:\s*site\s*$/m)
  assert.match(yml, /^\s*pages:\s*write/m)
  assert.match(yml, /^\s*id-token:\s*write/m)
  assert.match(yml, /^\s*contents:\s*read/m)
  assert.match(yml, /^\s*group:\s*pages\s*$/m)
  assert.match(yml, /name:\s*github-pages/)
  assert.doesNotMatch(yml, /secrets\./, 'the workflow uses no secrets')
})

test('the site names Muse wherever it lists the harnesses, in both languages, and counts none as four', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8')
  const app = fs.readFileSync(path.join(__dirname, '..', 'site', 'app.js'), 'utf8')
  assert.match(app, /order\s*=\s*\['agy',\s*'grok',\s*'codex',\s*'cursor',\s*'muse'\]/)
  assert.ok(/muse/i.test(html), 'index.html names Muse')
  for (const text of [html, app]) {
    assert.doesNotMatch(text, /\b(four|cuatro|4) (external |otros? )?harnesses\b/i)
    assert.doesNotMatch(text, /agy,? (?:codex,? )?grok,? (?:and |y )?cursor\b(?!,? (?:and |y )?muse)/i)
  }
  const spanish = html.slice(html.indexOf('lang="es"') === -1 ? 0 : html.indexOf('lang="es"'))
  assert.ok(/muse/i.test(spanish))
})

test('R21: the site says superdelegation where it said lanes and the profiles, and names no retired profile', () => {
  for (const rel of ['site/index.html', 'site/app.js']) {
    const text = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
    for (const pattern of [/\bbalanced\b/, /AETHER_SEATS/]) assert.doesNotMatch(text, pattern, `${rel} still says ${pattern}`)
    assert.match(text, /superdelegation/i, `${rel} says superdelegation`)
  }
})
