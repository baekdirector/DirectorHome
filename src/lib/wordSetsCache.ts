import type { WordSetRecord } from './db'
import { loadProfile, viewingOwner } from './profile'

export type WordSetItem = WordSetRecord & { count: number }

// 서버가 잠들어 있다가 깨어나는 동안에도 지난번 목록을 바로 보여주기 위한 캐시.
// 아이마다 단어장이 다르므로 열쇠도 아이마다 나눈다. 그러지 않으면 계정을 바꾼 직후
// 다른 아이의 단어장 목록이 잠깐 보인다.
function cacheKey(): string {
  return `junsvoca_wordsets_cache:${viewingOwner(loadProfile())}`
}

export function loadWordSetsCache(): WordSetItem[] | null {
  try {
    const raw = localStorage.getItem(cacheKey())
    return raw ? (JSON.parse(raw) as WordSetItem[]) : null
  } catch {
    return null
  }
}

export function saveWordSetsCache(sets: WordSetItem[]) {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(sets))
  } catch {
    // 캐시는 편의 기능이라 실패해도 무시한다.
  }
}

/** 단어장을 새로 만들었을 때처럼 캐시가 낡았을 때 비운다. */
export function clearWordSetsCache() {
  try {
    localStorage.removeItem(cacheKey())
  } catch {
    // 무시
  }
}
