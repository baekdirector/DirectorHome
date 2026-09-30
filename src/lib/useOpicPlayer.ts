import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isSpeechSupported,
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

  /** from부터 끝까지 이어 읽는다. QUESTION_INDEX면 질문부터. */
  const playFrom = useCallback(
    async (from: number) => {
      if (!supported) return
      sessionRef.current += 1
      const session = sessionRef.current
      stopSpeaking()
      setPlaying(true)

      const steps: Array<{ at: number; text: string; voice: SpeechSynthesisVoice | null }> = []
      if (from === QUESTION_INDEX && track.question.trim() !== '') {
        steps.push({ at: QUESTION_INDEX, text: speakableText(track.question), voice: femaleVoice })
      }
      const start = from === QUESTION_INDEX ? 0 : from
      for (let i = start; i < track.lines.length; i++) {
        steps.push({ at: i, text: speakableText(track.lines[i]), voice: maleVoice })
      }

      for (const step of steps) {
        if (sessionRef.current !== session) return
        setIndex(step.at)
        if (step.text === '') continue
        await speakLine(step.text, { voice: step.voice, rate: rateRef.current })
        // 질문과 답변 사이는 실제 시험처럼 한 박자 쉰다.
        if (step.at === QUESTION_INDEX) {
          await new Promise((r) => setTimeout(r, 1200))
        }
      }

      if (sessionRef.current !== session) return
      setPlaying(false)
      setIndex(null)
    },
    [supported, track.question, track.lines, femaleVoice, maleVoice],
  )

  const toggle = useCallback(() => {
    if (playing) stop()
    else playFrom(track.question.trim() !== '' ? QUESTION_INDEX : 0)
  }, [playing, stop, playFrom, track.question])

  const setRate = useCallback(
    (r: Rate) => {
      setRateState(r)
      localStorage.setItem(RATE_KEY, String(r))
      // 재생 중이면 지금 문장부터 새 속도로 다시 읽는다(Web Speech는 도중 속도 변경이 안 된다).
      if (playing) playFrom(index ?? QUESTION_INDEX)
    },
    [playing, index, playFrom],
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
    playFrom,
    toggle,
    stop,
  }
}
