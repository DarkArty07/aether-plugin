// Serves every build for the owner to play, one port each, with an index page: node play-all.mjs
// Ports: the index on 8300, then the builds from 8301 in the order of BUILDS. A build whose folder is missing is skipped.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const E = path.join(process.env.HOME, '.cache/aether-exp-frontend')
const BUILDS = [
  ['s5-rich', 's5-rich/.worktrees/integration', 'Haiku con plan rico y ojos (Aether guiado)'],
  ['s1-sonnet', 's1-sonnet', 'Sonnet xhigh solo (Claude normal)'],
  ['s2-normal', 's2-normal/.worktrees/integration', 'Aether normal, Haiku'],
  ['s3-skills', 's3-skills/.worktrees/integration', 'Aether normal + 298 skills, Haiku'],
  ['s4-guided', 's4-guided/.worktrees/integration', 'Aether guiado (ojos y recetas), Haiku'],
  ['oct-normal', 'anchors/oct-normal', 'Octubre: modo normal (Opus + Sonnet)'],
  ['oct-aether', 'anchors/oct-aether', 'Octubre: Aether'],
  ['s6-haiku', 's6-haiku', 'Haiku xhigh solo (en curso)'],
  ['s7-rich-sonnet', 's7-rich-sonnet/.worktrees/integration', 'Plan rico con Sonnet programando (en curso)'],
]
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' }

function serve(root, port) {
  http
    .createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      let file = path.join(root, decodeURIComponent(url.pathname))
      if (!file.startsWith(root)) return res.writeHead(403).end()
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
      fs.readFile(file, (err, data) => {
        if (err) return res.writeHead(404).end('not found')
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
        res.end(data)
      })
    })
    .listen(port)
}

const rows = []
BUILDS.forEach(([name, dir, what], i) => {
  const root = path.join(E, dir)
  const port = 8301 + i
  if (!fs.existsSync(root)) return
  serve(root, port)
  rows.push(`<li><a href="http://localhost:${port}/">${name}</a> — ${what} <small>(puerto ${port})</small></li>`)
  console.log(`${name}: http://localhost:${port}/`)
})
const index = `<!doctype html><meta charset="utf-8"><title>Snakes</title><style>body{font:16px system-ui;background:#111;color:#eee;padding:24px}a{color:#7fd}li{margin:8px 0}</style><h1>Snakes del experimento</h1><ul>${rows.join('')}</ul><p>Teclas: flechas o WASD, Espacio pausa, Enter reinicia. Recarga esta página cuando terminen las pruebas en curso.</p>`
http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(index)).listen(8300)
console.log('index: http://localhost:8300/')
