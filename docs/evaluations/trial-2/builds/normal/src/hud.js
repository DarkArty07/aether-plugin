// The HUD: three readouts along the top edge and one glass panel for the title, pause, game-over
// and won screens. hudModel is pure; createHud builds the DOM once and update() touches it only
// when a value changed. Colors come from THEME.colors and reach styles.css as custom properties.
import { THEME } from './render/theme.js'

// The panels' copy, in the theme's voice. Each hint names the keys that move the game on.
const PANELS = {
  ready: {
    title: THEME.name,
    hint: 'Press an arrow key, or swipe, to begin. WASD steers too, Space pauses and M mutes the sound.',
  },
  paused: { title: 'Paused', hint: 'The tide holds still. Press Space, or tap, to resume.' },
  over: { title: 'Lost to the deep', hint: 'Press Enter, tap or swipe to dive again.' },
  won: { title: 'Full bloom', hint: 'Every cell glows. Press Enter, tap or swipe to dive again.' },
}

export function hudModel({ status, score, highScore, level, isNewBest }) {
  const copy = PANELS[status]
  const panel = copy
    ? { kind: status, title: copy.title, hint: copy.hint, newBest: (status === 'over' || status === 'won') && Boolean(isNewBest) }
    : null
  return { score: String(score ?? 0), best: String(highScore ?? 0), level: String(level ?? 1), panel }
}

// THEME.colors keys behind the custom properties set on the HUD root (--hud-text, --hud-text-rgb, ...).
const CSS_COLORS = {
  'hud-text': 'hudText',
  'hud-panel': 'hudPanel',
  accent: 'accent',
  food: 'food',
  danger: 'danger',
  background: 'background',
}

const cssHex = (n) => '#' + n.toString(16).padStart(6, '0')
const cssRgb = (n) => `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`

function applyThemeColors(root) {
  for (const [name, key] of Object.entries(CSS_COLORS)) {
    const color = THEME.colors[key]
    root.style.setProperty(`--${name}`, cssHex(color))
    root.style.setProperty(`--${name}-rgb`, cssRgb(color))
  }
}

// Plays a CSS animation again: drop the class, force a reflow, add it back.
function replay(node, className) {
  node.classList.remove(className)
  void node.offsetWidth
  node.classList.add(className)
}

// Drops the class when its animation ends, so the next replay starts clean. No timers involved.
function clearWhenDone(node, className) {
  node.addEventListener('animationend', (event) => {
    if (event.target === node) node.classList.remove(className)
  })
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text
}

export function createHud(root) {
  const doc = root.ownerDocument
  applyThemeColors(root)

  const make = (tag, className, parent, text) => {
    const node = doc.createElement(tag)
    node.className = className
    if (text !== undefined) node.textContent = text
    parent.appendChild(node)
    return node
  }

  const element = make('div', 'hud', root)
  make('div', 'hud-scrim', element)

  const bar = make('div', 'hud-bar', element)
  const readout = (name, label) => {
    const box = make('div', `readout readout-${name}`, bar)
    make('span', 'readout-label', box, label)
    return { box, value: make('span', 'readout-value', box) }
  }
  const score = readout('score', 'Score')
  const level = readout('level', 'Level')
  const best = readout('best', 'Best')

  const toast = make('div', 'hud-toast', element)
  toast.setAttribute('aria-hidden', 'true')

  const panelEl = make('div', 'hud-panel', element)
  panelEl.setAttribute('role', 'status')
  panelEl.hidden = true
  const kicker = make('p', 'panel-kicker', panelEl, 'Snake 3D')
  const badge = make('p', 'panel-badge', panelEl, 'New best')
  const title = make('h1', 'panel-title', panelEl)
  const stats = make('p', 'panel-stats', panelEl)
  const statScore = make('span', 'stat', stats)
  make('span', 'stat-label', statScore, 'Score')
  const statScoreValue = make('b', 'stat-value', statScore)
  const statBest = make('span', 'stat', stats)
  make('span', 'stat-label', statBest, 'Best')
  const statBestValue = make('b', 'stat-value', statBest)
  const hint = make('p', 'panel-hint', panelEl)
  kicker.hidden = badge.hidden = stats.hidden = true

  clearWhenDone(score.value, 'pop')
  clearWhenDone(level.box, 'level-up')
  clearWhenDone(toast, 'show')
  clearWhenDone(panelEl, 'enter')

  // What the DOM shows now. null means "nothing yet", so the first update writes everything and
  // never counts as a level-up.
  const shown = { score: null, level: null, kind: null, newBest: null }

  function showPanel(model) {
    const panel = model.panel
    const kind = panel ? panel.kind : null
    if (kind !== shown.kind) {
      shown.kind = kind
      panelEl.hidden = panel === null
      if (panel) {
        element.dataset.panel = kind
        kicker.hidden = kind !== 'ready'
        stats.hidden = kind !== 'over' && kind !== 'won'
        toast.classList.remove('show')
        replay(panelEl, 'enter')
      } else {
        delete element.dataset.panel
      }
    }
    const newBest = panel !== null && Boolean(panel.newBest)
    if (newBest !== shown.newBest) {
      shown.newBest = newBest
      badge.hidden = !newBest
      element.toggleAttribute('data-new-best', newBest)
    }
    if (!panel) return
    setText(title, panel.title)
    setText(hint, panel.hint)
    if (!stats.hidden) {
      setText(statScoreValue, model.score)
      setText(statBestValue, model.best)
    }
  }

  function update(model) {
    if (model.score !== shown.score) {
      setText(score.value, model.score)
      if (shown.score !== null && Number(model.score) > Number(shown.score)) replay(score.value, 'pop')
      shown.score = model.score
    }
    setText(best.value, model.best)
    if (model.level !== shown.level) {
      setText(level.value, model.level)
      if (model.panel === null && shown.level !== null && Number(model.level) > Number(shown.level)) {
        setText(toast, `Level ${model.level}`)
        replay(level.box, 'level-up')
        replay(toast, 'show')
      }
      shown.level = model.level
    }
    showPanel(model)
  }

  return { update, element }
}
