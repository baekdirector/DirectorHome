import type { WordSetCategory } from './db'
import type { WordSetItem } from './wordSetsCache'

export const UNCATEGORIZED_LABEL = '미분류'

export interface WordSetGroup {
  /** 목록 열쇠. 미분류는 id가 없으므로 문자열로 맞춘다. */
  key: string
  categoryId: number | null
  name: string
  sets: WordSetItem[]
}

/**
 * 단어장을 분류별로 묶는다. 분류는 정해진 순서대로, 미분류는 항상 맨 뒤.
 * 비어 있는 분류는 목록에서 빼고(단어장 보기 화면), 분류 관리 화면처럼 빈 분류도
 * 보여야 하는 곳은 `includeEmpty`를 켠다.
 *
 * 사라진 분류를 가리키는 단어장(다른 기기에서 분류를 지운 직후 등)은 미분류로 떨어뜨린다.
 */
export function groupByCategory(
  sets: WordSetItem[],
  categories: WordSetCategory[],
  { includeEmpty = false } = {},
): WordSetGroup[] {
  const ordered = [...categories].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
  const known = new Set(ordered.map((c) => c.id))

  const groups = ordered.map((c) => ({
    key: String(c.id),
    categoryId: c.id as number | null,
    name: c.name,
    sets: sets.filter((s) => s.categoryId === c.id),
  }))

  const loose = sets.filter((s) => s.categoryId === null || !known.has(s.categoryId))
  if (loose.length > 0 || includeEmpty) {
    groups.push({ key: 'none', categoryId: null, name: UNCATEGORIZED_LABEL, sets: loose })
  }

  return includeEmpty ? groups : groups.filter((g) => g.sets.length > 0)
}
