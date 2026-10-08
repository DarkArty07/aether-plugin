export const HIGH_SCORE_KEY = 'snake3d.highScore'

// Turns a raw stored value into a non-negative integer score, or 0.
function parseScore(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return 0
  const text = String(raw).trim()
  if (!/^\d+$/.test(text)) return 0
  return Number(text)
}

// Reads the stored high score. Never throws: a missing or failing storage gives 0.
export function loadHighScore(storage) {
  try {
    return parseScore(storage.getItem(HIGH_SCORE_KEY))
  } catch {
    return 0
  }
}

// Stores the best of the stored score and `score`, and returns it. Never throws.
export function saveHighScore(storage, score) {
  const best = Math.max(loadHighScore(storage), parseScore(score))
  try {
    storage.setItem(HIGH_SCORE_KEY, String(best))
  } catch {
    // Storage is unavailable; the best score for this session is still returned.
  }
  return best
}
