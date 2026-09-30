// 2026 OPIC 2.xlsx를 앱 데이터로 옮기기 위한 순수 파싱 함수들.
// 임포트 스크립트와 단위 테스트가 같은 코드를 쓰도록 브라우저에서도 돌아가는 형태로 둔다
// (node:crypto 같은 런타임 전용 모듈을 쓰지 않는다).

const HANGUL = /[가-힣]/

/** 'Bar★★★' -> { name: 'Bar', stars: 3 } */
export function parseSheetName(sheet: string): { name: string; stars: number } {
  const stars = (sheet.match(/★/g) ?? []).length
  return { name: sheet.replace(/★/g, '').trim(), stars }
}

/** A열 세트 라벨을 통일한다. 빈 값은 "위 세트를 잇는다"는 뜻이라 null. */
export function normalizeSetLabel(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (s === '') return null
  if (/ROLE\s*PLAY/i.test(s)) return 'ROLE PLAY'
  // 엑셀이 "7"을 7.0으로 저장한 경우
  const num = s.match(/^(\d+)(?:\.0+)?$/)
  if (num) return `${num[1]}번`
  return s.toLowerCase().endsWith('set') ? s.toLowerCase() : s
}

/**
 * B열을 한글 제목 줄들과 영어 질문으로 가른다.
 * 경계는 "한글이 없고 영문자(또는 따옴표)로 시작하는 첫 줄". 빈 줄 기준은 데이터의
 * 29%에서 깨지므로 쓰지 않는다.
 */
export function splitQuestionCell(cell: string): { titles: string[]; questionEn: string } | null {
  const lines = (cell ?? '').split('\n')
  const at = lines.findIndex((l) => {
    const t = l.trim()
    return t !== '' && !HANGUL.test(t) && /^["'A-Za-z]/.test(t)
  })
  if (at <= 0) return null

  const titles = lines
    .slice(0, at)
    .map((l) => l.trim())
    .filter((l) => l !== '')
  const questionEn = lines.slice(at).join('\n').trim()
  if (titles.length === 0 || questionEn === '') return null
  return { titles, questionEn }
}

/** '[Int] 본인이 즐겨 가는 술집 묘사 ★★★★★' -> level/importance/title */
export function parseTitleLine(line: string): {
  level: 'Int' | 'Adv' | null
  importance: number
  title: string
} {
  let s = (line ?? '').trim()
  const lv = s.match(/^\[(Int|Adv)\]\s*/i)
  const level = lv ? ((lv[1][0].toUpperCase() + lv[1].slice(1).toLowerCase()) as 'Int' | 'Adv') : null
  if (lv) s = s.slice(lv[0].length)
  const importance = (s.match(/★/g) ?? []).length
  return { level, importance, title: s.replace(/★/g, '').trim() }
}

export type AnnotationPart =
  | { type: 'text'; value: string }
  | { type: 'label'; value: string }
  | { type: 'chip'; pron: string | null; meaning: string }

/**
 * 한 줄에서 한글이 든 괄호를 떼어낸다.
 * 어느 영어 표현에 붙는 주석인지는 엑셀에 없으므로 추측하지 않고 그 자리에 둔다.
 * 줄 맨 앞 괄호만 분류 라벨로 따로 본다.
 */
export function parseAnnotations(line: string): AnnotationPart[] {
  const parts: AnnotationPart[] = []
  const push = (value: string) => {
    const v = value.trim()
    if (v !== '') parts.push({ type: 'text', value: v })
  }

  const rest = line ?? ''
  let first = true
  // 여는 괄호가 연달아 오는 오타(`((술을...)`)까지 받도록 `\(+`로 연다.
  const re = /\(+([^()]*)\)/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(rest)) !== null) {
    const inner = m[1].trim()
    if (!HANGUL.test(inner)) continue // 한글이 없으면 본문의 일부로 둔다
    const before = rest.slice(last, m.index)
    const atLineStart = first && before.trim() === ''
    push(before)
    if (atLineStart) {
      parts.push({ type: 'label', value: inner })
    } else {
      const comma = inner.split(',')
      if (comma.length === 2 && comma[0].trim() !== '' && comma[1].trim() !== '') {
        parts.push({ type: 'chip', pron: comma[0].trim(), meaning: comma[1].trim() })
      } else {
        parts.push({ type: 'chip', pron: null, meaning: inner })
      }
    }
    last = m.index + m[0].length
    first = false
  }
  push(rest.slice(last))
  return parts
}

/** 공백 차이를 무시하는 FNV-1a 해시. 브라우저·Node 양쪽에서 같은 값을 준다. */
export function answerHash(answer: string): string {
  const norm = (answer ?? '')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim()
  let h = 0x811c9dc5
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** 서로 다른 주제 minTopics개 이상에서 반복되는 문장을 만능 패턴으로 본다. */
export function findPatterns(
  answers: Array<{ topic: string; answer: string }>,
  minTopics = 3,
): Array<{ text: string; topicCount: number; occurrences: number }> {
  const topics = new Map<string, Set<string>>()
  const counts = new Map<string, number>()

  for (const { topic, answer } of answers) {
    for (const raw of (answer ?? '').split('\n')) {
      const s = raw.trim()
      if (s.length <= 12) continue
      counts.set(s, (counts.get(s) ?? 0) + 1)
      const set = topics.get(s) ?? new Set<string>()
      set.add(topic)
      topics.set(s, set)
    }
  }

  return [...topics.entries()]
    .filter(([, set]) => set.size >= minTopics)
    .map(([text, set]) => ({ text, topicCount: set.size, occurrences: counts.get(text) ?? 0 }))
    .sort((a, b) => b.topicCount - a.topicCount || b.occurrences - a.occurrences)
}
