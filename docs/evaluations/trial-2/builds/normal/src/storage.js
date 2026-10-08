export const HIGH_SCORE_KEY = 'snake3d.highScore'

const PLAIN_INTEGER = /^\d+$/

const isScore = (value) => Number.isSafeInteger(value) && value >= 0

const hasStorage = (storage) =>
  typeof storage?.getItem === 'function' && typeof storage?.setItem === 'function'

function parseScore(raw) {
  if (typeof raw !== 'string' || !PLAIN_INTEGER.test(raw)) return 0
  const value = Number(raw)
  return isScore(value) ? value : 0
}

export function loadHighScore(storage) {
  if (!hasStorage(storage)) return 0
  try {
    return parseScore(storage.getItem(HIGH_SCORE_KEY))
  } catch {
    return 0
  }
}

export function saveHighScore(storage, score) {
  const best = Math.max(loadHighScore(storage), isScore(score) ? score : 0)
  if (hasStorage(storage)) {
    try {
      storage.setItem(HIGH_SCORE_KEY, String(best))
    } catch {
      // Storage may be full or denied; the best score is still returned.
    }
  }
  return best
}
