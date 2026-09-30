// Web Speech API로 스크립트를 읽어주기 위한 도우미.
// 음성 목록은 비동기로 채워지고 성별을 표준으로 알려주지 않아, 이름으로 추정하고
// 틀릴 때를 대비해 화면에서 직접 고를 수 있게 한다.

import { parseAnnotations } from './opicParse'

/** 테스트에서 진짜 SpeechSynthesisVoice를 만들 수 없어 필요한 속성만 추린 형태. */
export interface VoiceLike {
  name: string
  lang: string
}

export type VoiceGender = 'male' | 'female'

/** 읽을 문장. 괄호 안 한글(뜻·발음·분류 라벨)은 소리내지 않는다. */
export function speakableText(line: string): string {
  return parseAnnotations(line)
    .filter((p) => p.type === 'text')
    .map((p) => p.value)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 브라우저·OS가 흔히 싣는 영어 음성 이름. 성별을 표준으로 노출하지 않아 이름으로 가린다.
const MALE = ['david', 'mark', 'guy', 'aaron', 'alex', 'fred', 'daniel', 'james', 'ryan', 'tom', 'eric']
const FEMALE = ['zira', 'samantha', 'susan', 'karen', 'moira', 'tessa', 'victoria', 'ava', 'allison', 'jenny', 'aria', 'michelle']

const genderOf = (name: string): VoiceGender | null => {
  const n = name.toLowerCase()
  if (MALE.some((m) => n.includes(m))) return 'male'
  if (FEMALE.some((f) => n.includes(f))) return 'female'
  return null
}

/**
 * 원하는 성별의 영어 음성을 고른다.
 * en-US를 다른 영어 방언보다 앞에 두고, 성별을 가릴 수 없으면 아무 영어 음성이라도 돌려준다
 * (소리가 아예 안 나는 것보다 낫다).
 */
export function pickVoice<T extends VoiceLike>(voices: T[], gender: VoiceGender): T | null {
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  if (english.length === 0) return null

  const score = (v: T) => (v.lang.toLowerCase() === 'en-us' ? 0 : 1)
  const sorted = [...english].sort((a, b) => score(a) - score(b))

  return sorted.find((v) => genderOf(v.name) === gender) ?? sorted[0]
}

export const isSpeechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

/** 지금 당장 알 수 있는 음성 목록. 아직 안 채워졌으면 빈 배열. */
export function currentVoices(): SpeechSynthesisVoice[] {
  return isSpeechSupported() ? window.speechSynthesis.getVoices() : []
}

/**
 * 음성 목록을 받아온다.
 * 크롬은 첫 호출에서 빈 배열을 주고 나중에 voiceschanged로 채우는데, 안드로이드에서는
 * 그 이벤트가 늦게 오거나 "한 번 읽어본 뒤"에야 채워지기도 한다. 그래서 이벤트만 믿지 않고
 * 짧은 간격으로 다시 들여다본다. 끝내 비어 있으면 빈 배열로 끝낸다.
 */
export function loadVoices(timeoutMs = 10000): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSupported()) return Promise.resolve([])
  const synth = window.speechSynthesis

  const now = synth.getVoices()
  if (now.length > 0) return Promise.resolve(now)

  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      synth.removeEventListener('voiceschanged', onChange)
      clearInterval(poll)
      clearTimeout(timer)
      resolve(synth.getVoices())
    }
    const onChange = () => finish()
    const poll = setInterval(() => {
      if (synth.getVoices().length > 0) finish()
    }, 300)
    const timer = setTimeout(finish, timeoutMs)
    synth.addEventListener('voiceschanged', onChange)
  })
}

/** 재생 중인 것을 멈춘다. 화면을 떠날 때 반드시 불러야 소리가 따라다니지 않는다. */
export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}

/**
 * 한 문장을 읽는다. 끝나거나 실패하면 resolve한다.
 * 취소(cancel)로 끝난 경우에도 resolve하므로, 호출한 쪽이 순서를 직접 관리해야 한다.
 */
export function speakLine(
  text: string,
  opts: { voice: SpeechSynthesisVoice | null; rate: number },
): Promise<void> {
  if (!isSpeechSupported() || text.trim() === '') return Promise.resolve()

  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    if (opts.voice) {
      u.voice = opts.voice
      u.lang = opts.voice.lang
    } else {
      u.lang = 'en-US'
    }
    u.rate = opts.rate
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    u.onend = finish
    u.onerror = finish
    window.speechSynthesis.speak(u)
  })
}
