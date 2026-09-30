// OPIC API(/api/opic/*)를 위한 얇은 REST 클라이언트.

export type OpicState = 'weak' | 'ok' | 'done'

export interface OpicTopic {
  id: number
  name: string
  stars: number
  kind: 'topic' | 'roleplay'
  total: number
  done: number
  ok: number
  weak: number
}

export interface OpicQuestionSummary {
  id: number
  setLabel: string | null
  seq: number
  level: string | null
  titleKo: string
  altTitles: string[]
  importance: number
  sourceRef: string
  /** 같은 영어 질문이 다른 주제에도 있는 문항. 엑셀에서 고칠 곳을 찾는 실마리다. */
  sharedQuestion: boolean
  answerHash: string
  state: OpicState | null
}

export interface OpicQuestion extends OpicQuestionSummary {
  topicId: number
  questionEn: string
  answerEn: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/opic${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  return res.json()
}

export const getTopics = () => api<OpicTopic[]>('/topics')
export const getTopicQuestions = (topicId: number) =>
  api<OpicQuestionSummary[]>(`/topics/${topicId}/questions`)
export const getQuestion = (id: number) => api<OpicQuestion>(`/questions/${id}`)
export const getPatterns = () => api<string[]>('/patterns')

/** 상태는 답변 해시 단위라 본문이 같은 다른 문항에도 함께 적용된다. */
export const putStatus = (answerHash: string, state: OpicState | null) =>
  api<{ ok: true }>('/status', { method: 'PUT', body: JSON.stringify({ answerHash, state }) })

/** 미설정 → 아직 부족 → 그럭저럭 → 암기완료 순서. 같은 칸을 다시 누르면 미설정으로 돌아간다. */
export const OPIC_STATES: OpicState[] = ['weak', 'ok', 'done']

export const OPIC_STATE_LABEL: Record<OpicState, string> = {
  weak: '아직 부족',
  ok: '그럭저럭',
  done: '암기완료',
}
