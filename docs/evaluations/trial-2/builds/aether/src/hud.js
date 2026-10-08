// HUD: a pure model (hudModel) and a small DOM view (createHud).

const PANELS = {
  ready: { title: 'SNAKE 3D', hint: 'Press an arrow key or Enter to start, or tap' },
  paused: { title: 'PAUSED', hint: 'Press Space or tap to resume' },
  over: { title: 'GAME OVER', hint: 'Press Enter or tap to play again' },
  won: { title: 'YOU WIN!', hint: 'Press Enter or tap to play again' },
}

export function hudModel({ status, score, highScore, level, isNewBest }) {
  const base = PANELS[status]
  const panel = base ? { kind: status, title: base.title, hint: base.hint, newBest: Boolean(isNewBest) } : null
  return { score: String(score), best: String(highScore), level: String(level), panel }
}

export function createHud(root) {
  const doc = root.ownerDocument
  const make = (tag, className, text) => {
    const el = doc.createElement(tag)
    if (className) el.className = className
    if (text !== undefined) el.textContent = text
    return el
  }
  const stat = (label) => {
    const wrap = make('div', 'hud-stat')
    const value = make('span', 'hud-value', '0')
    wrap.append(make('span', 'hud-label', label), value)
    return { wrap, value }
  }

  const bar = make('div', 'hud-bar')
  const score = stat('Score')
  const best = stat('Best')
  const level = stat('Level')
  bar.append(score.wrap, best.wrap, level.wrap)

  const panel = make('div', 'hud-panel')
  const title = make('h1', 'hud-title')
  const badge = make('p', 'hud-badge', 'New best!')
  const hint = make('p', 'hud-hint')
  panel.append(title, badge, hint)
  panel.hidden = true

  const element = make('div', 'hud-root')
  element.append(bar, panel)
  root.append(element)

  function update(model) {
    score.value.textContent = model.score
    best.value.textContent = model.best
    level.value.textContent = model.level
    const p = model.panel
    panel.hidden = !p
    if (p) {
      panel.dataset.kind = p.kind
      title.textContent = p.title
      hint.textContent = p.hint
      badge.hidden = !p.newBest
    }
  }

  return { update, element }
}
