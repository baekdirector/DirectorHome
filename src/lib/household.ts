// 가계부 API(server/routes.js, /api/expense/*)를 위한 얇은 REST 클라이언트 + 순수 유틸.

export type ExpenseGroup = 'income' | 'fixed' | 'card' | 'utility' | 'variable'

export interface ExpenseCategory {
  id: number
  name: string
  groupType: ExpenseGroup
  displayOrder: number
  createdAt: number
  archivedAt: number | null
}

export interface ExpenseEntry {
  id: number
  categoryId: number
  year: number
  month: number
  amount: number
  memo: string | null
  updatedAt: number
}

export interface ExpenseSettings {
  openingYear: number
  openingMonth: number
  openingBalance: number
}

export interface ExpenseMonthSummary {
  year: number
  month: number
  income: number
  cardTotal: number
  fixedTotal: number
  utilityTotal: number
  variableTotal: number
  expenseTotal: number
  net: number
  balance: number
}

export interface ExpenseSummary {
  months: ExpenseMonthSummary[]
  openingBalance: number
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/expense${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  return res.json()
}

export const getCategories = () => api<ExpenseCategory[]>('/categories')

export const createCategory = (input: { name: string; groupType: ExpenseGroup; displayOrder?: number }) =>
  api<{ id: number }>('/categories', { method: 'POST', body: JSON.stringify(input) })

export const updateCategory = (
  id: number,
  input: Partial<{ name: string; groupType: ExpenseGroup; displayOrder: number; archived: boolean }>,
) => api<{ ok: true }>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) })

export const getEntries = (year: number) => api<ExpenseEntry[]>(`/entries?year=${year}`)

export const putEntry = (input: { categoryId: number; year: number; month: number; amount: number; memo?: string }) =>
  api<{ id: number }>('/entries', { method: 'PUT', body: JSON.stringify(input) })

/** 품목별로 줄을 쌓는 카테고리("추가 지출액" 등)에 새 품목 한 줄을 추가한다. 기존 줄은 건드리지 않는다. */
export const createEntry = (input: { categoryId: number; year: number; month: number; amount: number; memo?: string }) =>
  api<{ id: number }>('/entries', { method: 'POST', body: JSON.stringify(input) })

/** 품목 한 줄의 이름/금액을 수정한다(추가/삭제가 아니라 같은 줄을 고칠 때). */
export const updateEntry = (id: number, input: { amount: number; memo?: string }) =>
  api<{ ok: true }>(`/entries/${id}`, { method: 'PATCH', body: JSON.stringify(input) })

export const deleteEntry = (id: number) => api<{ ok: true }>(`/entries/${id}`, { method: 'DELETE' })

export const getSettings = () => api<ExpenseSettings | null>('/settings')

export const putSettings = (input: ExpenseSettings) =>
  api<{ ok: true }>('/settings', { method: 'PUT', body: JSON.stringify(input) })

export const getSummary = (year: number) => api<ExpenseSummary>(`/summary?year=${year}`)

export const verifyPassword = (password: string) =>
  api<{ ok: boolean }>('/verify-password', { method: 'POST', body: JSON.stringify({ password }) })

/** "1234567" -> "1,234,567". 가계부 금액은 항상 0 이상 정수로 다룬다. */
export function formatWon(amount: number): string {
  return Math.round(amount).toLocaleString('ko-KR')
}

/** 콤마/"원" 단위가 섞인 입력 문자열에서 숫자만 뽑아 정수로 되돌린다. 숫자가 없으면 0. */
export function parseWonInput(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits === '' ? 0 : parseInt(digits, 10)
}

/** localStorage에 저장된 만료 시각 문자열이 아직 유효한지 확인한다. */
export function isAccessTokenValid(storedUntil: string | null, now: number): boolean {
  if (!storedUntil) return false
  const until = Number(storedUntil)
  return Number.isFinite(until) && until > now
}

/** summary.months에서 해당 월을 찾는다. 데이터가 없는 연도로 전환해도 undefined만 반환하고 던지지 않는다. */
export function findMonthSummary(summary: ExpenseSummary, month: number): ExpenseMonthSummary | undefined {
  return summary.months.find((m) => m.month === month)
}
