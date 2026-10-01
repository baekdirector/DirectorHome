import { useCallback, useEffect, useRef, useState } from 'react'
import {
  currentVoices,
  hasGenderedVoices,
  isSpeechSupported,
  PITCH,
  loadVoices,
  pickVoice,
  speakLine,
  speakableText,
  stopSpeaking,
} from './speech'

const RATE_KEY = 'opic_rate'
const MALE_KEY = 'opic_voice_male'
const FEMALE_KEY = 'opic_voice_female'

export const RATES = [1, 1.25, 1.5] as const
export type Rate = (typeof RATES)[number]

/** 재생 위치. -1은 에바의 질문, 0 이상은 답변의 몇 번째 문장인지. */
export const QUESTION_INDEX = -1

export interface PlayerTrack {
  /** 에바가 읽을 질문. 롤플레이처럼 없으면 빈 문자열. */
  question: string
  /** 답변 문장들(화면에 보이는 줄 그대로). */
  lines: string[]
}

/**
 * 질문(여성) → 답변 문장들(남성)을 차례로 읽는다.
 * 브라우저 음성은 취소 시 onend가 제멋대로라, "지금 재생이 몇 번째 세션인지"를 세어
 * 낡은 세션이 다음 문장으로 넘어가지 못하게 막는다.
 */
export function useOpicPlayer(track: PlayerTrack) {
  const [supported] = useState(isSpeechSupported)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [maleName, setMaleName] = useState(() => localStorage.getItem(MALE_KEY) ?? '')
  const [femaleName, setFemaleName] = useState(() => localStorage.getItem(FEMALE_KEY) ?? '')
  const [rate, setRateState] = useState<Rate>(() => {
    const saved = Number(localStorage.getItem(RATE_KEY))
    return (RATES as readonly number[]).includes(saved) ? (saved as Rate) : 1
  })
  const [playing, setPlaying] = useState(false)
  const [index, setIndex] = useState<number | null>(null)

  const sessionRef = useRef(0)
  // 재생 도중 바뀌어도 현재 세션이 최신 값을 쓰도록 ref로도 들고 있는다.
  const rateRef = useRef(rate)
  rateRef.current = rate

  useEffect(() => {
    if (!supported) return
    loadVoices().then(setVoices)
  }, [supported])

  // 화면을 떠나거나 문항이 바뀌면 소리가 따라다니지 않게 끊는다.
  useEffect(() => {
    return () => {
      sessionRef.current += 1
      stopSpeaking()
    }
  }, [])

  const byName = (name: string) => voices.find((v) => v.name === name) ?? null
  const maleVoice = byName(maleName) ?? pickVoice(voices, 'male')
  const femaleVoice = byName(femaleName) ?? pickVoice(voices, 'female')

  const stop = useCallback(() => {
    sessionRef.current += 1
    stopSpeaking()
    setPlaying(false)
    setIndex(null)
  }, [])

  /** 안드로이드는 한 번 읽어본 뒤에야 음성 목록이 채워지기도 한다. 발화 뒤 다시 들여다본다. */
  const refreshVoices = useCallback(() => {
    const now = currentVoices()
    if (now.length > 0) setVoices((prev) => (prev.length === now.length ? prev : now))
  }, [])

  /** 답변을 from번째 문장부터 끝까지 읽는다. 질문은 읽지 않는다. */
  const playAnswer = useCallback(
    async (from = 0) => {
      if (!supported) return
      sessionRef.current += 1
      const session = sessionRef.current
      stopSpeaking()
      setPlaying(true)

      for (let i = Math.max(0, from); i < track.lines.length; i++) {
        if (sessionRef.current !== session) return
        setIndex(i)
        const text = speakableText(track.lines[i])
        if (text === '') continue
        await speakLine(text, { voice: maleVoice, rate: rateRef.current, pitch: PITCH.male })
        refreshVoices()
      }

      if (sessionRef.current !== session) return
      setPlaying(false)
      setIndex(null)
    },
    [supported, track.lines, maleVoice, refreshVoices],
  )

  /** 에바의 질문만 읽는다. */
  const playQuestion = useCallback(async () => {
    if (!supported || track.question.trim() === '') return
    sessionRef.current += 1
    const session = sessionRef.current
    stopSpeaking()
    setPlaying(true)
    setIndex(QUESTION_INDEX)

    await speakLine(speakableText(track.question), {
      voice: femaleVoice,
      rate: rateRef.current,
      pitch: PITCH.female,
    })
    refreshVoices()

    if (sessionRef.current !== session) return
    setPlaying(false)
    setIndex(null)
  }, [supported, track.question, femaleVoice, refreshVoices])

  /** 고른 목소리를 짧게 들려준다. 적용됐는지 귀로 확인하는 용도. */
  const preview = useCallback(
    (gender: 'male' | 'female') => {
      sessionRef.current += 1
      stopSpeaking()
      setPlaying(false)
      setIndex(null)
      speakLine('This is how the answer will sound.', {
        voice: gender === 'male' ? maleVoice : femaleVoice,
        rate: rateRef.current,
        pitch: PITCH[gender],
      }).then(refreshVoices)
    },
    [maleVoice, femaleVoice, refreshVoices],
  )

  const toggle = useCallback(() => {
    if (playing) stop()
    else playAnswer(0)
  }, [playing, stop, playAnswer])

  const setRate = useCallback(
    (r: Rate) => {
      setRateState(r)
      localStorage.setItem(RATE_KEY, String(r))
      // 재생 중이면 지금 문장부터 새 속도로 다시 읽는다(Web Speech는 도중 속도 변경이 안 된다).
      if (playing) {
        if (index === QUESTION_INDEX) playQuestion()
        else playAnswer(index ?? 0)
      }
    },
    [playing, index, playQuestion, playAnswer],
  )

  const setVoiceName = useCallback((gender: 'male' | 'female', name: string) => {
    if (gender === 'male') {
      setMaleName(name)
      localStorage.setItem(MALE_KEY, name)
    } else {
      setFemaleName(name)
      localStorage.setItem(FEMALE_KEY, name)
    }
  }, [])

  return {
    supported,
    voices,
    maleVoice,
    femaleVoice,
    setVoiceName,
    rate,
    setRate,
    playing,
    index,
    gendered: hasGenderedVoices(voices),
    preview,
    playAnswer,
    playQuestion,
    refreshVoices,
    toggle,
    stop,
  }
}
