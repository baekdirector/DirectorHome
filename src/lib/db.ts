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

export type QuestionType = 'spelling' | 'meaning'

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
