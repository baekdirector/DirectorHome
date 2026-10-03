import { describe, expect, it } from 'vitest'
import { groupByCategory } from './wordSetGroups'
import type { WordSetCategory } from './db'
import type { WordSetItem } from './wordSetsCache'

const category = (id: number, name: string, displayOrder: number): WordSetCategory => ({
  id,
  name,
  displayOrder,
  createdAt: 0,
  setCount: 0,
})

const set = (id: number, title: string, categoryId: number | null): WordSetItem => ({
  id,
  title,
  createdAt: 0,
  kind: 'vocab',
  categoryId,
  count: 10,
})

const listening = category(1, 'Listening', 0)
const verbs = category(2, '동사변화', 1)

describe('groupByCategory', () => {
  it('정해진 순서대로 묶고 미분류는 맨 뒤에 둔다', () => {
    const groups = groupByCategory(
      [set(1, 'Unit1', 1), set(2, 'A-B-C', 2), set(3, '옛 단어장', null)],
      [verbs, listening],
    )
    expect(groups.map((g) => g.name)).toEqual(['Listening', '동사변화', '미분류'])
    expect(groups[0].sets.map((s) => s.title)).toEqual(['Unit1'])
    expect(groups[2].sets.map((s) => s.title)).toEqual(['옛 단어장'])
  })

  it('비어 있는 분류는 기본적으로 빼고, includeEmpty면 남긴다', () => {
    const sets = [set(1, 'Unit1', 1)]
    expect(groupByCategory(sets, [listening, verbs]).map((g) => g.name)).toEqual(['Listening'])
    expect(groupByCategory(sets, [listening, verbs], { includeEmpty: true }).map((g) => g.name)).toEqual([
      'Listening',
      '동사변화',
      '미분류',
    ])
  })

  it('사라진 분류를 가리키는 단어장은 미분류로 떨어진다', () => {
    const groups = groupByCategory([set(1, '고아', 99)], [listening])
    expect(groups.map((g) => g.name)).toEqual(['미분류'])
    expect(groups[0].sets.map((s) => s.title)).toEqual(['고아'])
  })

  it('분류가 하나도 없으면 전부 미분류 한 묶음', () => {
    const groups = groupByCategory([set(1, 'a', null), set(2, 'b', null)], [])
    expect(groups).toHaveLength(1)
    expect(groups[0].categoryId).toBeNull()
    expect(groups[0].sets).toHaveLength(2)
  })

  it('단어장이 없으면 빈 목록(미분류도 만들지 않는다)', () => {
    expect(groupByCategory([], [listening])).toEqual([])
  })

  it('displayOrder가 같으면 id 순으로 안정적으로 정렬한다', () => {
    const a = category(5, '나중', 0)
    const b = category(3, '먼저', 0)
    const groups = groupByCategory([set(1, 'x', 5), set(2, 'y', 3)], [a, b], { includeEmpty: true })
    expect(groups.map((g) => g.name)).toEqual(['먼저', '나중', '미분류'])
  })
})
