// 입구 로그인과 아이 계정 비밀번호 관리. 어느 아이의 데이터인지와 무관한 요청이라
// db.ts의 X-Voca-Owner 헤더를 쓰지 않는다.

import type { ProfileId, VocaOwner } from './profile'

export interface LoginResult {
  ok: boolean
  profile?: ProfileId
  /** 'unset'이면 그 아이의 비밀번호가 아직 정해지지 않았다. */
  reason?: 'unset'
}

export interface AppUser {
  id: VocaOwner
  hasPassword: boolean
  updatedAt: number | null
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  return res.json()
}

export const login = (id: string, password: string) =>
  api<LoginResult>('/login', { method: 'POST', body: JSON.stringify({ id, password }) })

export const getAppUsers = () => api<AppUser[]>('/app-users')

export const setAppUserPassword = (id: VocaOwner, password: string) =>
  api<{ ok: true }>(`/app-users/${id}`, { method: 'PUT', body: JSON.stringify({ password }) })
