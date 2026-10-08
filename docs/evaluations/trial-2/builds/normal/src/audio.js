// The sound of "Abyssal Bloom": a tiny WebAudio synth, nothing loaded from the network. Soft sine and
// triangle voices, each one an oscillator behind a gain envelope, with a faint echo that gives the
// tones some water to ring in. Every effect is a handful of voices, so a meal costs two oscillators.
// Browsers refuse to start audio before a user gesture, so the context is built by unlock(), which
// main.js calls on the first key press or touch. Sounds asked for before that, or while muted, are dropped.

export const MUTE_KEY = 'snake3d.muted'

// Pitches come from the C major pentatonic scale, where any run of notes sounds pleasant.
const C5 = 523.25
const semitones = (n) => C5 * 2 ** (n / 12)
const SCALE = [0, 2, 4, 7, 9] // semitones above C5
const ARPEGGIO = [0, 4, 7, 12, 16] // a major chord, spread over two octaves

function readMuted(storage) {
  try {
    return storage?.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function writeMuted(storage, muted) {
  try {
    storage?.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Storage may be denied; the choice then lasts for this visit only.
  }
}

export function createAudio({ storage = null, AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext } = {}) {
  let muted = readMuted(storage)
  let ctx = null
  let master = null // everything reaches the speakers through here (and the mute switch)
  let echo = null // the input of the echo

  function build() {
    ctx = new AudioContextClass()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.55
    const limiter = ctx.createDynamicsCompressor() // a chord of voices must not clip
    master.connect(limiter)
    limiter.connect(ctx.destination)

    echo = ctx.createGain()
    const delay = ctx.createDelay(0.5)
    delay.delayTime.value = 0.19
    const feedback = ctx.createGain()
    feedback.gain.value = 0.36
    const murk = ctx.createBiquadFilter() // each repeat is a little duller, like sound under water
    murk.type = 'lowpass'
    murk.frequency.value = 1500
    const wet = ctx.createGain()
    wet.gain.value = 0.3
    echo.connect(delay)
    delay.connect(murk)
    murk.connect(feedback)
    feedback.connect(delay)
    murk.connect(wet)
    wet.connect(master)
  }

  // Starts the audio (or wakes it) from a user gesture. Safe to call on every gesture. Browsers refuse, and log a
  // warning, when a context is made without a gesture behind it (a touchstart or an Escape key is not one), so
  // then it waits for the next event.
  function unlock() {
    if (!AudioContextClass) return
    if (!ctx && globalThis.navigator?.userActivation?.isActive === false) return
    try {
      if (!ctx) build()
      if (ctx.state === 'suspended') ctx.resume()?.catch?.(() => {}) // old Safari returns no promise
    } catch {
      ctx = null // no audio on this device; the game is silent
      AudioContextClass = null
    }
  }

  const ready = () => ctx !== null && !muted

  // One note: pitch `from` gliding to `to`, `at` seconds from now, fading out over `seconds`.
  function voice({ from, to = from, at = 0, seconds = 0.2, type = 'sine', gain = 0.2, attack = 0.008 }) {
    const start = ctx.currentTime + at
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, start)
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + seconds)
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.linearRampToValueAtTime(gain, start + attack)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds)
    osc.connect(amp)
    amp.connect(master)
    amp.connect(echo)
    osc.start(start)
    osc.stop(start + seconds + 0.05)
    osc.onended = () => {
      osc.disconnect()
      amp.disconnect()
    }
  }

  // A meal: a soft bloop that climbs the scale with each food, so a good run plays a little tune.
  function eat(foodsEaten = 0) {
    if (!ready()) return
    const note = semitones(SCALE[Math.max(0, foodsEaten - 1) % SCALE.length])
    voice({ from: note * 0.8, to: note, seconds: 0.14, gain: 0.26, attack: 0.01 })
    voice({ from: note * 2, at: 0.05, seconds: 0.32, type: 'triangle', gain: 0.07 })
  }

  // A new level: a bright arpeggio up the scale.
  function levelUp() {
    if (!ready()) return
    ARPEGGIO.forEach((step, i) => {
      voice({ from: semitones(step), at: i * 0.07, seconds: 0.55, type: i % 2 ? 'sine' : 'triangle', gain: 0.17 })
    })
  }

  // The end: a slow fall into the deep, a low thud, and a few bubbles rising.
  function gameOver() {
    if (!ready()) return
    voice({ from: 392, to: 98, seconds: 0.95, type: 'triangle', gain: 0.24, attack: 0.02 })
    voice({ from: 118, to: 42, seconds: 0.7, gain: 0.34, attack: 0.01 })
    for (let i = 0; i < 6; i++) {
      const pitch = 500 + Math.random() * 900 // sound only: the game's own randomness is seeded and separate
      voice({ from: pitch, to: pitch * 1.6, at: 0.12 + i * 0.1 + Math.random() * 0.05, seconds: 0.09, gain: 0.06 })
    }
  }

  // A win: a quick run up the scale, then a chord that hangs in the water.
  function won() {
    if (!ready()) return
    ;[0, 4, 7, 12, 16, 19, 24].forEach((step, i) => {
      voice({ from: semitones(step), at: i * 0.075, seconds: 0.6, type: 'triangle', gain: 0.15 })
    })
    ;[0, 7, 12, 16].forEach((step) => {
      voice({ from: semitones(step), at: 0.55, seconds: 2.2, gain: 0.13, attack: 0.05 })
    })
  }

  function toggleMute() {
    unlock()
    muted = !muted
    writeMuted(storage, muted)
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02)
    if (!muted && ctx) voice({ from: semitones(7), to: semitones(12), seconds: 0.16, gain: 0.2 }) // "sound is on"
    return muted
  }

  return { unlock, eat, levelUp, gameOver, won, toggleMute, isMuted: () => muted }
}
