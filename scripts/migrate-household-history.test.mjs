import { describe, expect, it } from 'vitest'
import { normalizeMigrationData } from './migrate-household-history.mjs'

describe('normalizeMigrationData', () => {
  it('정의되지 않은 카테고리를 참조하는 entry는 걸러내고 unknown에 담는다', () => {
    const result = normalizeMigrationData({
      categories: [{ name: '삼성카드', groupType: 'card' }],
      entries: [
        { category: '삼성카드', year: 2026, month: 1, amount: 100 },
        { category: '없는카드', year: 2026, month: 1, amount: 50 },
      ],
    })
    expect(result.entries).toHaveLength(1)
    expect(result.unknown).toHaveLength(1)
    expect(result.unknown[0].category).toBe('없는카드')
  })

  it('categories/entries가 배열이 아니면 에러를 던진다', () => {
    expect(() => normalizeMigrationData({})).toThrow()
  })
})
