const DAY_MS = 24 * 60 * 60 * 1000
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 그 기기의 지역 날짜를 "2026-10-02"로.
 * toISOString()을 쓰면 UTC로 바뀌어 한국 시간 오전 9시 이전이 전날이 된다.
 */
export function localDateString(d: Date = new Date()): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

// 날짜 산술은 UTC로만 한다. 지역 시간으로 하루를 더하면 서머타임이 있는 지역에서
// 같은 날이 두 번 나오거나 하루가 통째로 빠진다.
function toUtcMs(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms)
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${month}-${day}`
}

/** 날짜를 days만큼 앞뒤로 옮긴다. 음수면 과거로. */
export function shiftDate(date: string, days: number): string {
  const ms = toUtcMs(date)
  if (Number.isNaN(ms)) return date
  return fromUtcMs(ms + days * DAY_MS)
}

export function nextDate(date: string): string {
  return shiftDate(date, 1)
}

/** 시작일~종료일을 하루씩 펼친다. 거꾸로 주거나 형식이 틀리면 빈 목록. */
export function expandDateRange(from: string, to: string): string[] {
  const start = toUtcMs(from)
  const end = toUtcMs(to)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return []
  const out: string[] = []
  for (let t = start; t <= end; t += DAY_MS) out.push(fromUtcMs(t))
  return out
}

export function dayCount(from: string, to: string): number {
  return expandDateRange(from, to).length
}

/** "10월 2일 (금)" */
export function formatDueDate(date: string): string {
  const ms = toUtcMs(date)
  if (Number.isNaN(ms)) return date
  const d = new Date(ms)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DAY_LABELS[d.getUTCDay()]})`
}

export type HomeworkState = 'today' | 'today-tried' | 'today-done' | 'overdue' | 'done' | 'upcoming'

/** 홈 카드의 색과 문구를 정하는 상태. 날짜 문자열은 사전순 비교가 곧 날짜순 비교다. */
export function homeworkState(
  hw: { dueDate: string; completedAt: number | null; attemptedAt?: number | null },
  today: string,
): HomeworkState {
  if (hw.completedAt !== null) return hw.dueDate === today ? 'today-done' : 'done'
  if (hw.dueDate === today) return hw.attemptedAt != null ? 'today-tried' : 'today'
  return hw.dueDate < today ? 'overdue' : 'upcoming'
}

export const MAX_QUESTION_COUNT = 1000

/** 문제 수 입력칸의 글자를 양의 정수로 읽는다. 쓸 수 없는 값이면 null. */
export function parseQuestionCount(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) return null
  const n = Number(text)
  return n >= 1 && n <= MAX_QUESTION_COUNT ? n : null
}
