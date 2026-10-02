// 문항 유형은 기록으로 저장되는 값이라 db.ts 하나만을 출처로 삼는다.
import type { QuestionType, WordRecord } from './db'

export type { QuestionType }

export type QuizWord = WordRecord

export interface Question {
  word: QuizWord
  type: QuestionType
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface GenerateOptions {
  /** 출제할 문제 수. 생략하면 전체 단어. */
  count?: number
  /** 출제할 문항 유형. 변화형이 저장된 단어는 유형과 무관하게 'verb'로 낸다. */
  mode: QuestionType
  /** true(기본)면 무작위 순서, false면 단어장에 적힌 순서대로. */
  shuffle?: boolean
}

/**
 * 변화형이 저장된 단어인지. 유형은 단어장이 아니라 단어를 보고 정한다 — 한 시험에
 * 여러 단어장을 섞어 고를 수 있고, 오답 노트 시험에는 단어장이 아예 없기 때문이다.
 */
export function isVerbWord(word: QuizWord): boolean {
  return (word.past ?? '').trim() !== '' && (word.participle ?? '').trim() !== ''
}

/** Picks `count` words (all by default), one question each. Random order unless `shuffle` is false. */
export function generateQuestions(
  words: QuizWord[],
  { count, mode, shuffle: shuffled = true }: GenerateOptions,
): Question[] {
  const ordered = shuffled ? shuffle(words) : words
  const picked = count === undefined ? ordered : ordered.slice(0, Math.max(0, count))
  return picked.map((word) => ({
    word,
    type: isVerbWord(word) ? 'verb' : mode,
  }))
}

// 띄어쓰기, 기호("...", "~", 하이픈 등) 차이는 정답 판정에서 무시한다.
function looseKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function withoutParentheses(s: string): string {
  return s.replace(/[(（][^)）]*[)）]/g, ' ')
}

// 한글 음절 하나를 초성/중성/종성 인덱스로 분해한다 (완성형 한글: 0xAC00~0xD7A3).
const HANGUL_BASE = 0xac00
const JONG_COUNT = 28
const JUNG_COUNT = 21
const JONG_RIEUL = 8 // '종성 없음(0)'부터 센 종성 목록에서 'ㄹ'의 인덱스
const JONG_NIEUN = 4 // 종성 'ㄴ'의 인덱스

function decomposeHangul(ch: string): { cho: number; jung: number; jong: number } | null {
  const code = ch.codePointAt(0)! - HANGUL_BASE
  if (code < 0 || code > 0xd7a3 - HANGUL_BASE) return null
  const jong = code % JONG_COUNT
  const jung = Math.floor(code / JONG_COUNT) % JUNG_COUNT
  const cho = Math.floor(code / JONG_COUNT / JUNG_COUNT)
  return { cho, jung, jong }
}

function composeHangul(cho: number, jung: number, jong: number): string {
  return String.fromCodePoint(HANGUL_BASE + (cho * JUNG_COUNT + jung) * JONG_COUNT + jong)
}

/**
 * 사전형(...다)으로 저장된 동사 뜻을, 아이들이 자연스럽게 많이 쓰는 평서형 현재
 * 활용("...ㄴ다/는다")으로도 바꿔서 반환한다. 예: "보이다"→"보인다", "먹다"→"먹는다",
 * "살다"→"산다"(ㄹ탈락). 형용사에도 적용되지만("예쁘다"→"예쁜다") 그런 변형은
 * 실제로 아무도 답으로 쓰지 않으므로 정답 인정 범위만 넓힐 뿐 해가 되지 않는다.
 */
function verbPresentTenseVariant(token: string): string | null {
  if (token.length < 2 || !token.endsWith('다')) return null
  const stem = token.slice(0, -1)
  const decomposed = decomposeHangul(stem[stem.length - 1])
  if (!decomposed) return null
  const { cho, jung, jong } = decomposed
  const stemPrefix = stem.slice(0, -1)

  if (jong === 0 || jong === JONG_RIEUL) {
    // 받침 없음, 또는 'ㄹ' 받침(탈락): 마지막 글자에 'ㄴ' 받침을 붙인다.
    return stemPrefix + composeHangul(cho, jung, JONG_NIEUN) + '다'
  }
  // 그 외 받침 있음: '는다'를 붙인다.
  return stem + '는다'
}

/**
 * Meanings may list several acceptable phrasings separated by , / ·  -- any one matching is correct.
 * Spacing/punctuation differences are ignored, a parenthesized note may be omitted
 * ("(쇼의) 회" accepts both "(쇼의) 회" and "회"), and "...다"로 끝나는 동사는 평서형
 * 현재 활용("...ㄴ다/는다")으로 답해도 정답으로 인정한다.
 */
export function checkAnswer(question: Question, userAnswer: string): boolean {
  const user = looseKey(userAnswer)
  if (!user) return false
  if (question.type === 'spelling') {
    return user === looseKey(question.word.term)
  }
  const tokens = question.word.meaning.split(/[,/·]/).filter((t) => t.trim())
  return tokens.some((raw) => {
    const t = raw.trim()
    const noParens = withoutParentheses(t).trim()
    const variant = verbPresentTenseVariant(t)
    const noParensVariant = noParens !== t ? verbPresentTenseVariant(noParens) : null
    return (
      looseKey(t) === user ||
      looseKey(noParens) === user ||
      (variant !== null && looseKey(variant) === user) ||
      (noParensVariant !== null && looseKey(noParensVariant) === user)
    )
  })
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** "9월 22일 (화)" */
export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`
}

/** "9/22 (화)" — 좁은 목록용 */
export function formatShortDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} (${DAY_LABELS[d.getDay()]})`
}

/** "오전 12:05" */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  const hour = d.getHours()
  const period = hour < 12 ? '오전' : '오후'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${period} ${hour12}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** "9월 22일 (화) 오전 12:05" */
export function formatDateTime(ts: number): string {
  return `${formatDate(ts)} ${formatTime(ts)}`
}

/** 소요 시간을 "3분 12초"로. 1분이 안 되면 "45초". */
export function formatMinSec(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
