import { describe, expect, it } from 'vitest'
import { defaultKindFor, kindOption, kindOptionsFor, normalizeKind } from './wordSetKinds'

describe('아이별 단어장 종류', () => {
  it('준이는 일반 단어와 동사 3단변화를 고를 수 있다', () => {
    expect(kindOptionsFor('junsvoca').map((o) => o.kind)).toEqual(['vocab', 'verb'])
  })

  it('빈이에게는 동사 3단변화를 보여주지 않는다', () => {
    expect(kindOptionsFor('beensvoca').map((o) => o.kind)).toEqual(['vocab'])
  })

  it('기본값은 목록의 첫 번째다', () => {
    expect(defaultKindFor('junsvoca')).toBe('vocab')
    expect(defaultKindFor('beensvoca')).toBe('vocab')
  })
})

describe('normalizeKind', () => {
  it('그 아이가 쓸 수 있는 종류면 그대로 둔다', () => {
    expect(normalizeKind('junsvoca', 'verb')).toBe('verb')
  })

  it('아이를 바꿔 쓸 수 없는 종류가 되면 기본값으로 되돌린다', () => {
    expect(normalizeKind('beensvoca', 'verb')).toBe('vocab')
  })
})

describe('kindOption', () => {
  it('설명과 붙여넣기 예시를 함께 준다', () => {
    const verb = kindOption('junsvoca', 'verb')
    expect(verb.label).toBe('동사 3단변화')
    expect(verb.placeholder).toContain('come came come')
    expect(verb.hint).toContain('과거분사형')
  })

  it('그 아이에게 없는 종류를 물으면 일반 단어로 떨어뜨린다(화면이 비지 않게)', () => {
    expect(kindOption('beensvoca', 'verb').kind).toBe('vocab')
  })
})
