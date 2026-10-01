// Thin REST client for the Express + Postgres backend (server/). Same
// exported names/shapes as the earlier IndexedDB (Dexie) version, so pages
// didn't need to change their call sites -- only this module's internals.

export interface WordSetRecord {
  id: number
  title: string
  createdAt: number
  /** 'verb'면 동사 3단변화 단어장이다. */
  kind: 'vocab' | 'verb'
}

export interface WordRecord {
  id: number
  wordSetId: number
  term: string
  meaning: string
  isIdiom: boolean
  partOfSpeech?: string
  /** 동사 단어장에서만 채워진다. 일반 단어장은 null. */
  past?: string | null
  participle?: string | null
}

/** 'verb'는 동사 3단변화 문항(정답·답안이 "현재 | 과거 | 과거분사" 한 줄로 저장된다). */
export type QuestionType = 'spelling' | 'meaning' | 'verb'

export interface QuizSessionRecord {
  id: number
  groupId: string
  /** 오답 노트 테스트처럼 특정 단어장에 속하지 않으면 null */
  wordSetId: number | null
  wordSetTitle: string
  round: number
  startedAt: number
  finishedAt: number
  durationMs: number
  totalQuestions: number
  correctCount: number
  wrongCount: number
}

export interface QuizAnswerRecord {
  id: number
  sessionId: number
  wordId: number
  questionType: QuestionType
  term: string
  meaning: string
  correctAnswer: string
  userAnswer: string
  correct: boolean
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export async function createWordSet(
  title: string,
  words: Array<Pick<WordRecord, 'term' | 'meaning' | 'isIdiom' | 'partOfSpeech' | 'past' | 'participle'>>,
  kind: 'vocab' | 'verb' = 'vocab',
): Promise<number> {
  const { id } = await api<{ id: number }>('/wordsets', {
    method: 'POST',
    body: JSON.stringify({ title, words, kind }),
  })
  return id
}

export function getWordSets(): Promise<Array<WordSetRecord & { count: number }>> {
  return api('/wordsets')
}

export function getWordSet(wordSetId: number): Promise<WordSetRecord | undefined> {
  return api(`/wordsets/${wordSetId}`)
}

export function getLatestWordSet(): Promise<WordSetRecord | undefined> {
  return api('/wordsets/latest')
}

export function updateWordSetTitle(wordSetId: number, title: string): Promise<void> {
  return api(`/wordsets/${wordSetId}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

/** 단어장별로 완료한 테스트(1라운드) 횟수. 여러 단어장을 묶어 본 테스트는 포함되지 않는다. */
export function getWordSetAttemptCounts(): Promise<Array<{ wordSetId: number; count: number }>> {
  return api('/wordsets/attempt-counts')
}

export function getWordsBySet(wordSetId: number): Promise<WordRecord[]> {
  return api(`/wordsets/${wordSetId}/words`)
}

export async function addWord(word: Omit<WordRecord, 'id'>): Promise<number> {
  const { id } = await api<{ id: number }>('/words', { method: 'POST', body: JSON.stringify(word) })
  return id
}

export function updateWord(id: number, patch: Partial<Omit<WordRecord, 'id' | 'wordSetId'>>): Promise<void> {
  return api(`/words/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

/** 단어와 그 단어의 오답 노트는 함께 사라지고, 시험 기록은 남는다. */
export function deleteWordSet(id: number): Promise<void> {
  return api(`/wordsets/${id}`, { method: 'DELETE' })
}

export function deleteWord(id: number): Promise<void> {
  return api(`/words/${id}`, { method: 'DELETE' })
}

export interface RecordRoundInput {
  groupId: string
  wordSetId: number | null
  wordSetTitle: string
  round: number
  startedAt: number
  finishedAt: number
  answers: Array<Omit<QuizAnswerRecord, 'id' | 'sessionId'>>
}

export async function recordQuizRound(input: RecordRoundInput): Promise<number> {
  const { sessionId } = await api<{ sessionId: number }>('/quiz-rounds', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return sessionId
}

export interface AttemptSummary {
  groupId: string
  wordSetId: number | null
  wordSetTitle: string
  firstRoundSessionId: number
  startedAt: number
  lastFinishedAt: number
  totalQuestions: number
  correctCount: number
  wrongCount: number
  accuracy: number
  totalDurationMs: number
  roundsTaken: number
  mastered: boolean
}

export function getAttempts(): Promise<AttemptSummary[]> {
  return api('/attempts')
}

export function getAttemptDetail(groupId: string): Promise<{ rounds: QuizSessionRecord[]; answers: QuizAnswerRecord[] }> {
  return api(`/attempts/${encodeURIComponent(groupId)}`)
}

export function getMissedWordCounts(limit = 5): Promise<Array<{ term: string; meaning: string; wrong: number }>> {
  return api(`/missed-words?limit=${limit}`)
}

export interface HomeStats {
  totalWords: number
  totalAttempts: number
  weeklyAccuracy: number
  streakDays: number
  /** 오답 노트에 남아 있는(아직 못 외운) 단어 수 */
  wrongNoteCount: number
}

/** 틀린 적이 있는 단어. resolvedAt이 null이면 아직 오답 노트에 남아 있는 단어. */
export interface WrongNote {
  wordId: number
  term: string
  meaning: string
  isIdiom: boolean
  partOfSpeech: string | null
  /** 동사 단어장의 단어만 채워진다. 오답 노트 시험도 세 칸 문제로 내야 해서 함께 받는다. */
  past: string | null
  participle: string | null
  wordSetId: number
  wordSetTitle: string
  wrongCount: number
  lastWrongAt: number
  resolvedAt: number | null
}

export function getWrongNotes(): Promise<WrongNote[]> {
  return api('/wrong-notes')
}

export function setWrongNoteResolved(wordId: number, resolved: boolean): Promise<void> {
  return api(`/wrong-notes/${wordId}`, { method: 'PATCH', body: JSON.stringify({ resolved }) })
}

export function getHomeStats(): Promise<HomeStats> {
  return api('/home-stats')
}

// ---- 매일 숙제 ----

export interface HomeworkWordSet {
  id: number
  title: string
  count: number
}

export interface HomeworkRecord {
  id: number
  /** "2026-10-02" — 시간대 없는 달력 날짜 */
  dueDate: string
  wordSetIds: number[]
  /** 실제로 남아 있는 단어장만. 지워진 단어장은 빠진다. */
  wordSets: HomeworkWordSet[]
  /** 0이면 전체 */
  questionCount: number
  createdAt: number
  completedAt: number | null
  completedGroupId: string | null
  /** 풀어 봤지만 끝내지 못한 마지막 시도. 없으면 null */
  attemptedAt: number | null
  attemptCorrect: number | null
  attemptTotal: number | null
}

export interface PendingHomework {
  today: HomeworkRecord[]
  /** 오래된 것부터 */
  overdue: HomeworkRecord[]
}

export function getHomework(from: string, to: string): Promise<HomeworkRecord[]> {
  return api(`/homework?from=${from}&to=${to}`)
}

export function getPendingHomework(today: string): Promise<PendingHomework> {
  return api(`/homework/pending?today=${today}`)
}

export function getHomeworkById(id: number): Promise<HomeworkRecord> {
  return api(`/homework/${id}`)
}

export function createHomework(input: {
  fromDate: string
  toDate: string
  wordSetIds: number[]
  questionCount: number
}): Promise<HomeworkRecord[]> {
  return api('/homework', { method: 'POST', body: JSON.stringify(input) })
}

export function completeHomework(id: number, groupId: string): Promise<void> {
  return api(`/homework/${id}/complete`, { method: 'POST', body: JSON.stringify({ groupId }) })
}

export function recordHomeworkAttempt(id: number, correct: number, total: number): Promise<void> {
  return api(`/homework/${id}/attempt`, { method: 'POST', body: JSON.stringify({ correct, total }) })
}

export function deleteHomework(id: number): Promise<void> {
  return api(`/homework/${id}`, { method: 'DELETE' })
}
