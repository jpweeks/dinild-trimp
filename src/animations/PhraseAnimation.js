import { EventDispatcher } from 'three'
import { inherit } from '../utils/ctor'
import { clamp, mapLinear } from '../utils/math'

export function PhraseAnimation (sequence) {
  if (sequence) this.setSequence(sequence)
}

inherit(null, PhraseAnimation, EventDispatcher.prototype, {
  _events: {
    wordStart: { type: 'wordStart' },
    wordEnd: { type: 'wordEnd' },
    sequenceStart: { type: 'sequenceStart' },
    sequenceEnd: { type: 'sequenceEnd' },
    sequenceLoop: { type: 'sequenceLoop' }
  },

  createState () {
    return {
      indexWord: 0,
      indexSyllable: 0,
      indexShape: 0,
      frameShape: 0,
      weightShape: 0
    }
  },

  createProgress () {
    return {
      word: 0,
      syllable: 0,
      shape: 0
    }
  },

  setSequence (sequence, frame = 0) {
    if (sequence === this.sequence) return
    this.sequence = sequence
    this.didLoop = false
    this.frame = frame
    this.progress = this.createProgress()
    this.state = this.createState()
    this.statePrev = this.createState()
  },

  trimSequenceDuration (wordCount, loop) {
    const { sequence, state } = this
    if (!wordCount || sequence.length <= wordCount - 1) return

    const { indexWord } = state
    let nextDuration
    for (let i = wordCount + 2; i >= 0; i--) {
      const word = sequence.words[indexWord + i]
      if (word && word.name === 'spacer') {
        nextDuration = word.start + word.duration
        break
      }
    }

    Object.assign(sequence, {
      duration: nextDuration,
      loop
    })
  },

  // FIXME: Loop not transitioning from last to first frame correctly
  update () {
    const { sequence, progress, state, statePrev } = this
    if (!sequence) return

    const { duration, loop, words } = sequence
    const frame = this.frame++

    const indexWordPrev = state.indexWord
    const indexSyllablePrev = state.indexSyllable
    const indexShapePrev = state.indexShape
    const frameShapePrev = state.frameShape
    const weightShapePrev = state.weightShape

    if (frame > duration - 1) {
      if (duration - frame === 0) {
        const endEvent = loop
          ? this._events.sequenceLoop
          : this._events.sequenceEnd
        this.dispatchEvent(endEvent)
      }
      if (loop) {
        this.didLoop = true
        this.frame = 0
        this.progress = this.createProgress()
        this.state = this.createState()
        this.statePrev = this.createState()
        this.update()
      }
      return
    }

    if (frame === 0 && !this.didLoop) {
      const startEvent = this._events.sequenceStart
      this.dispatchEvent(startEvent)
    }

    let word = words[state.indexWord]
    if (frame > word.start + word.duration - 1) {
      word = words[++state.indexWord]
      state.indexSyllable = 0
    }

    let syllable = word.syllables[state.indexSyllable]
    if (frame > word.start + syllable.start + syllable.duration - 1) {
      syllable = word.syllables[++state.indexSyllable]
    }

    const { shapeFrames } = syllable
    const wordStart = word.start
    const syllableStart = wordStart + syllable.start

    const wordProgress = (frame - wordStart) / (word.duration - 1)
    const syllableProgress = (frame - syllableStart) / (syllable.duration - 1)

    const indexShape = Math.round(syllableProgress * (shapeFrames.length - 1))
    const frameShape = shapeFrames[indexShape]

    const shapeDuration = syllable.duration / shapeFrames.length
    const shapeStart = syllableStart + Math.floor(indexShape * shapeDuration)
    const shapeProgress = (frame - shapeStart) / (shapeDuration - 1)

    progress.word = wordProgress
    progress.syllable = syllableProgress
    progress.shape = shapeProgress

    state.indexShape = indexShape
    state.frameShape = frameShape
    state.weightShape = syllable.weight

    if (state.indexWord !== indexWordPrev) {
      const wordStartEvent = this._events.wordStart
      const wordEndEvent = this._events.wordEnd

      statePrev.indexWord = indexWordPrev
      wordStartEvent.word = words[state.indexWord]
      wordEndEvent.word = words[statePrev.indexWord]
      this.dispatchEvent(wordEndEvent)
      this.dispatchEvent(wordStartEvent)
    }

    if (state.indexSyllable !== indexSyllablePrev) {
      statePrev.indexSyllable = indexSyllablePrev
    }

    if (frameShape !== frameShapePrev || indexShape !== indexShapePrev) {
      statePrev.indexShape = indexShapePrev
      statePrev.frameShape = frameShapePrev
      statePrev.weightShape = weightShapePrev
    }
  },

  applyToWeights (weights, easing = easingNone) {
    const { progress, state, statePrev } = this
    if (!progress) return

    const shapeProgress = easing(clamp(0, 1, progress.shape))
    const weightPrev = statePrev.weightShape
    const weightNext = state.weightShape
    const framePrev = statePrev.frameShape
    const frameNext = state.frameShape

    weights[framePrev] += (1 - shapeProgress) * weightPrev
    weights[frameNext] += shapeProgress * weightNext
  }
})

export function parseWord (word, shapeMap) {
  const syllables = word.syllables
    .map((syllable) => {
      const { duration, shape, weight } = syllable
      const shapeFrames = mapShapeToFrames(shape, shapeMap)
      return {
        duration,
        shapeFrames,
        weight
      }
    })
    .map(mapStart)
  const duration = syllables
    .reduce((total, syllable) => total + syllable.duration, 0)

  return {
    duration,
    name: word.name,
    syllables
  }
}

export function parsePhrase (words, loop = false, shapeMap) {
  const phraseWords = words.map((word) => parseWord(word, shapeMap))
  return mapPhrase(phraseWords, loop)
}

function mapPhrase (phraseWords, loop = false) {
  const nextWords = phraseWords.map(mapStart)
  const duration = nextWords
    .reduce((total, word) => total + word.duration, 0)

  return {
    duration,
    loop,
    words: nextWords
  }
}

function createSpacerWord (duration, weight = 1) {
  return {
    name: 'spacer',
    duration,
    syllables: [{
      duration,
      shapeFrames: [0],
      start: 0,
      weight
    }]
  }
}

export function spacePhrase (params, sequence) {
  const { min, max, start, end } = params
  const { loop, words } = sequence

  let allWords = []
  for (let i = 0; i < words.length; i++) {
    const duration = i === 0
      ? start
      : Math.round(mapLinear(0, 1, min, max, Math.random()))
    allWords.push(
      createSpacerWord(duration),
      words[i])
  }
  allWords.push(createSpacerWord(end))
  allWords = allWords.map(mapStart)

  const duration = allWords
    .reduce((total, word) => total + word.duration, 0)

  return {
    duration,
    loop,
    words: allWords
  }
}

function easingNone (v) {
  return v
}

function mapShapeToFrames (shape, frames) {
  return shape.split('-').map((sound) => frames[sound] || 0)
}

function mapStart (item, index, list) {
  const prev = index === 0 ? null : list[index - 1]
  item.start = !prev ? 0 : prev.start + prev.duration
  return item
}
