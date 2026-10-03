// 테스트 도중(브라우저 뒤로가기, 앱 전환 등으로) 화면을 벗어나도 이어서 풀 수 있도록
// 진행 상황을 기기에 저장한다. 서버에는 완료된 라운드만 기록되므로, 이 저장은 순전히
// "다시 들어왔을 때 어디까지 풀었는지" 복구용이다.
import { loadProfile, viewingOwner } from './profile'

import type { QuizAnswerRecord } from './db'
import type { Question } from './quiz'

export type SavedAnswer = Omit<QuizAnswerRecord, 'id' | 'sessionId'>

export interface QuizProgress {
  savedAt: number
  wordSetTitle: string
  setCount: number
  round: number
  groupId: string
  startedAt: number
  /** 화면을 보며 실제로 푼 시간(ms). 중간에 나가 있던 시간은 빠진다. (예전에 저장된 진행 상황에는 없다) */
  elapsedMs?: number
  /** 이 테스트의 첫 라운드 결과 (복습 라운드 중 저장/복원 시에도 처음 성적을 보여주기 위해) */
  firstRound: { correct: number; total: number } | null
  /** 문제 수/유형/순서 선택으로 이미 만들어진 문제 목록 (재생성하지 않고 그대로 이어서 쓴다) */
  questions: Question[]
  /** questions와 같은 길이, 인덱스가 대응한다. 아직 안 푼 문제는 null. */
  answers: (SavedAnswer | null)[]
  qIndex: number
}

function storageKey(idsKey: string): string {
  // 오답 노트 시험은 열쇠가 'wrong' 하나뿐이라 아이를 구분하지 않으면 서로의 진행 상황을 덮어쓴다.
  return `junsvoca_quiz_progress:${viewingOwner(loadProfile())}:${idsKey || 'wrong'}`
}

export function loadQuizProgress(idsKey: string): QuizProgress | null {
  try {
    const raw = localStorage.getItem(storageKey(idsKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as QuizProgress
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export function saveQuizProgress(idsKey: string, progress: Omit<QuizProgress, 'savedAt'>): void {
  try {
    localStorage.setItem(storageKey(idsKey), JSON.stringify({ ...progress, savedAt: Date.now() }))
  } catch {
    // 저장 공간을 못 쓰는 환경에서는 이어서 풀기 기능만 조용히 건너뛴다.
  }
}

export function clearQuizProgress(idsKey: string): void {
  try {
    localStorage.removeItem(storageKey(idsKey))
  } catch {
    // 무시
  }
}

/** 저장된 진행 상황이 있는지만 가볍게 확인한다 (목록 화면의 "이어서 풀기" 표시용). */
export function peekQuizProgress(idsKey: string): { answered: number; total: number } | null {
  const progress = loadQuizProgress(idsKey)
  if (!progress) return null
  const answered = progress.answers.filter((a) => a !== null).length
  return { answered, total: progress.questions.length }
}
