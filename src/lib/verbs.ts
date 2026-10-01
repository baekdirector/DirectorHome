// 동사 3단변화 단어장을 위한 순수 함수들.
// 임포트 스크립트·시험 화면·테스트가 같은 코드를 쓰도록 브라우저에서도 돌아가는 형태로 둔다.

export interface ParsedVerb {
  term: string
  past: string
  participle: string
  meaning: string
}

export interface VerbParseResult {
  verbs: ParsedVerb[]
  /** 읽지 못했거나 중복이라 제외된 줄 */
  skipped: string[]
}

/** 앞의 번호를 떼어낸다. "1.", "1)", "1 ", "1," 모두 번호로 본다. */
function stripNumbering(line: string): string {
  return line.replace(/^\s*\d{1,3}(?:\s*[.).:\]]\s*|[\s,\t]+)/, '').trim()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 변화형은 영문자로만 이루어지고, 대체형은 슬래시로 이어진다(was/were).
// 이 검사가 없으면 "이건 못 읽는 줄"처럼 토큰이 넷인 한글 줄도 동사로 읽힌다.
const FORM_RE = /^[A-Za-z]+(?:\/[A-Za-z]+)*$/

/**
 * "번호 현재 과거 과거분사 뜻" 한 줄을 읽는다.
 * 앞의 세 토큰이 변화형이고 그 뒤 전부가 뜻이다. 그래서 뜻에 띄어쓰기나 쉼표가 있어도 된다.
 * 대체형(was/were)은 공백이 없어 토큰 하나로 읽힌다.
 */
export function parseVerbLine(line: string): ParsedVerb | null {
  const body = stripNumbering((line ?? '').trim())
  if (body === '') return null

  const parts = body.split(/[\s\t,]+/).filter(Boolean)
  if (parts.length < 4) return null

  const [term, past, participle] = parts
  if (!FORM_RE.test(term) || !FORM_RE.test(past) || !FORM_RE.test(participle)) return null

  // 뜻은 세 번째 토큰이 끝나는 자리부터 줄 끝까지. 원문의 공백·쉼표를 살리기 위해
  // 토큰을 다시 잇지 않고 원문에서 잘라낸다.
  const threeTokens = new RegExp(
    `^\\s*${escapeRe(term)}[\\s\\t,]+${escapeRe(past)}[\\s\\t,]+${escapeRe(participle)}[\\s\\t,]+`,
  )
  const meaning = body.replace(threeTokens, '').trim()
  if (meaning === '') return null

  return { term, past, participle, meaning }
}

export function parseVerbsDetailed(rawText: string): VerbParseResult {
  const verbs: ParsedVerb[] = []
  const skipped: string[] = []
  const seen = new Set<string>()

  for (const raw of (rawText ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const parsed = parseVerbLine(line)
    if (!parsed || seen.has(parsed.term.toLowerCase())) {
      skipped.push(line)
      continue
    }
    seen.add(parsed.term.toLowerCase())
    verbs.push(parsed)
  }

  return { verbs, skipped }
}

export type VerbPattern = 'A-B-B' | 'A-B-C' | 'A-A-A' | 'A-B-A' | 'A-A-B'

const key = (s: string) => (s ?? '').trim().toLowerCase()

/** 세 형태가 서로 같은지로 변화 유형을 가른다. 대체형은 원문 그대로 비교한다. */
export function verbPattern(v: { term: string; past: string; participle: string }): VerbPattern {
  const a = key(v.term)
  const b = key(v.past)
  const c = key(v.participle)
  if (a === b && b === c) return 'A-A-A'
  if (a === b) return 'A-A-B'
  if (b === c) return 'A-B-B'
  if (a === c) return 'A-B-A'
  return 'A-B-C'
}

export interface VerbAnswer {
  present: string
  past: string
  participle: string
}

export interface VerbResult {
  present: boolean
  past: boolean
  participle: boolean
  /** 세 칸이 모두 맞을 때만 참. 문항 단위 정답 여부다. */
  all: boolean
}

/** 대체형(got/gotten)은 슬래시로 나눈 것 중 하나만 맞아도, 통째로 맞아도 정답. */
function matches(expected: string, typed: string): boolean {
  const user = key(typed)
  if (user === '') return false
  const whole = key(expected)
  if (user === whole) return true
  return whole.split('/').some((alt) => alt.trim() !== '' && alt.trim() === user)
}

export function checkVerbAnswer(
  v: { term: string; past: string; participle: string },
  answer: VerbAnswer,
): VerbResult {
  const present = matches(v.term, answer.present)
  const past = matches(v.past, answer.past)
  const participle = matches(v.participle, answer.participle)
  return { present, past, participle, all: present && past && participle }
}

/** 기록에 남길 문자열. 대체형이 슬래시를 쓰므로 파이프로 잇는다. */
export function joinVerbForms(v: { term: string; past: string; participle: string }): string {
  return `${v.term} | ${v.past} | ${v.participle}`
}

export function joinVerbAnswer(a: VerbAnswer): string {
  return `${a.present} | ${a.past} | ${a.participle}`
}

/**
 * joinVerbAnswer의 역함수. 저장된 답 한 줄을 세 칸으로 되돌린다.
 * 세 칸짜리가 아니면(모르겠어요로 넘겨 빈 문자열이 저장된 경우 등) 빈 칸 셋을 준다.
 */
export function splitVerbAnswer(saved: string): VerbAnswer {
  const parts = (saved ?? '').split(' | ')
  if (parts.length !== 3) return { present: '', past: '', participle: '' }
  return { present: parts[0], past: parts[1], participle: parts[2] }
}
