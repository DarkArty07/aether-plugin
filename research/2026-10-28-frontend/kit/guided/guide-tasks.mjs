// Adds the guided method to an approved tasks.md (arm s4): the visual check in the test command, a
// constraint about the tools, and a "Look" step on every task that changes what the player sees.
import fs from 'node:fs'
const file = process.argv[2]
let text = fs.readFileSync(file, 'utf8')
const must = (cond, what) => { if (!cond) throw new Error(`guide-tasks: ${what}`) }
const testLine = /^- Test command: `npm test`$/m
must(testLine.test(text), 'no "- Test command: `npm test`" line')
text = text.replace(testLine, '- Test command: `npm test && npm run check:visual`')
const gc = text.indexOf('## Global Constraints')
must(gc !== -1, 'no Global Constraints')
const next = text.indexOf('\n## ', gc + 5)
const constraint = "- Your eyes: `npm run shots` (the `threejs-game` skill says how) takes pictures of the game, or of the parts that exist before `src/main.js` does; `specs/001-snake-3d/look.md` lists what the pictures must show. `npm run check:visual` is part of the test command. Do not edit `scripts/shots.cjs`, `scripts/preview.html`, `scripts/preview.mjs` or `specs/`.\n"
text = text.slice(0, next).replace(/\n*$/, '\n') + constraint + text.slice(next)
const VISUAL = ['src/render/world.js', 'src/render/snake-view.js', 'src/render/horizon.js', 'index.html', 'styles.css', 'src/hud.js', 'src/main.js']
const parts = text.split(/(?=^### Task \d+:)/m)
let guided = 0
for (let i = 0; i < parts.length; i++) {
  const owns = (parts[i].match(/^- Owns: (.*)$/m) || [])[1] || ''
  if (!parts[i].startsWith('### Task') || !VISUAL.some((f) => owns.includes(`\`${f}\``))) continue
  const acc = parts[i].search(/^\*\*Acceptance:\*\*.*$/m)
  must(acc !== -1, `no Acceptance line in ${parts[i].split('\n')[0]}`)
  const end = parts[i].indexOf('\n', acc)
  const look = '\n\n**Look:** after the tests pass, run `npm run shots`, Read every picture it writes, and compare them with `specs/001-snake-3d/look.md` and with this task. Fix what differs, look again, and say in your report what the pictures show.'
  parts[i] = end === -1 ? parts[i] + look + '\n' : parts[i].slice(0, end) + look + parts[i].slice(end)
  guided++
}
fs.writeFileSync(file, parts.join(''))
console.log(JSON.stringify({ guided }))
